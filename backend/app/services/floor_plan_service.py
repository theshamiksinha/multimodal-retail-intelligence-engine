import cv2
import numpy as np
import uuid
import os
from scipy.ndimage import gaussian_filter
from app.services.video_service import get_model

# In-memory session store
floor_plan_sessions: dict = {}


def create_session(floor_plan_path: str, floor_name: str = "Ground Floor") -> str:
    session_id = str(uuid.uuid4())[:8]
    floor_plan_sessions[session_id] = {
        "floor_plan_path": floor_plan_path,
        "floor_name": floor_name,
        "cameras": [],   # {id, name, x_pct, y_pct, video_path, heatmap, people_count}
        "unified_heatmap_path": None,
        "status": "setup",   # setup | processing | done | error
        "error": None,
    }
    return session_id


def save_cameras(session_id: str, cameras: list[dict]):
    """Persist camera layout (id, name, x_pct, y_pct, fov_*) for a session."""
    session = _get_session(session_id)
    existing = {c["id"]: c for c in session["cameras"]}
    updated = []
    for cam in cameras:
        merged = existing.get(cam["id"], {})
        merged.update({
            "id":            cam["id"],
            "name":          cam["name"],
            "x_pct":         cam["x_pct"],
            "y_pct":         cam["y_pct"],
            "fov_direction": cam.get("fov_direction", merged.get("fov_direction", 90.0)),
            "fov_range":     cam.get("fov_range",     merged.get("fov_range",     15.0)),
            "fov_spread":    cam.get("fov_spread",    merged.get("fov_spread",    60.0)),
            "video_path":    merged.get("video_path"),
            "heatmap":       merged.get("heatmap"),
            "people_count":  merged.get("people_count", 0),
        })
        updated.append(merged)
    session["cameras"] = updated


def attach_video(session_id: str, camera_id: str, video_path: str):
    """Link an uploaded video file to a specific camera in the session."""
    session = _get_session(session_id)
    for cam in session["cameras"]:
        if cam["id"] == camera_id:
            cam["video_path"] = video_path
            return
    raise ValueError(f"Camera {camera_id} not found")


def process_session(session_id: str) -> dict:
    """
    Run the full pipeline:
      1. YOLOv8 per camera → normalised heatmap
      2. FOV-constrained assignment: each floor-plan pixel is assigned to the
         nearest camera whose sector (direction, range, spread) covers it.
         Pixels outside all sectors are left dark on the output image.
      3. Composite → unified heatmap blended onto floor plan only within sectors.
    """
    session = _get_session(session_id)
    session["status"] = "processing"

    try:
        floor_plan_img = cv2.imread(session["floor_plan_path"])
        if floor_plan_img is None:
            raise ValueError("Cannot load floor plan image")
        fp_h, fp_w = floor_plan_img.shape[:2]

        cameras_with_video = [c for c in session["cameras"] if c.get("video_path")]
        if not cameras_with_video:
            raise ValueError("No cameras have video attached")

        model = get_model()

        # ── Step 1: per-camera heatmaps ──────────────────────────────────────
        for cam in cameras_with_video:
            raw_heatmap, people_count = _run_yolo_heatmap(cam["video_path"], model)
            cam["heatmap"]      = raw_heatmap   # (video_h, video_w) float32  0-1
            cam["people_count"] = people_count

        # ── Step 2: FOV-constrained assignment ───────────────────────────────
        # Camera positions in floor-plan pixel space
        cam_px = np.array([
            [c["x_pct"] / 100.0 * fp_w, c["y_pct"] / 100.0 * fp_h]
            for c in cameras_with_video
        ], dtype=np.float32)

        # FOV parameters per camera (angles in radians, radius in pixels)
        fov_dirs_rad     = np.array([
            c.get("fov_direction", 90.0) * (np.pi / 180.0)
            for c in cameras_with_video
        ], dtype=np.float32)
        fov_radii_px     = np.array([
            c.get("fov_range", 100.0) / 100.0 * fp_w
            for c in cameras_with_video
        ], dtype=np.float32)
        fov_half_spreads = np.array([
            c.get("fov_spread", 360.0) / 2.0 * (np.pi / 180.0)
            for c in cameras_with_video
        ], dtype=np.float32)

        # Pixel coordinate grids
        xx, yy = np.meshgrid(
            np.arange(fp_w, dtype=np.float32),
            np.arange(fp_h, dtype=np.float32),
        )

        # Displacement from each camera to every pixel  (n_cam, fp_h, fp_w)
        dx    = xx[None, :, :] - cam_px[:, 0, None, None]
        dy    = yy[None, :, :] - cam_px[:, 1, None, None]
        dist2 = dx * dx + dy * dy
        dist  = np.sqrt(dist2)

        # Signed angular difference between pixel direction and camera direction
        # (wrapped to [−π, π])
        abs_angle  = np.arctan2(dy, dx)
        angle_diff = abs_angle - fov_dirs_rad[:, None, None]
        angle_diff = (angle_diff + np.pi) % (2.0 * np.pi) - np.pi

        # True where pixel falls inside this camera's FOV sector
        in_fov = (
            (dist              <= fov_radii_px[:, None, None]) &
            (np.abs(angle_diff) <= fov_half_spreads[:, None, None])
        )                                                    # (n_cam, fp_h, fp_w)

        # Pixels covered by at least one camera
        covered = in_fov.any(axis=0)                        # (fp_h, fp_w)

        # Among covering cameras, assign each pixel to the nearest one
        INF       = np.finfo(np.float32).max
        dist2_fov = np.where(in_fov, dist2, INF)
        nearest   = np.argmin(dist2_fov, axis=0)            # (fp_h, fp_w)
        # (argmin on all-INF returns 0; safe because we always AND with `covered`)

        # ── Step 3: composite heatmap ─────────────────────────────────────────
        unified = np.zeros((fp_h, fp_w), dtype=np.float32)
        for i, cam in enumerate(cameras_with_video):
            scaled = cv2.resize(cam["heatmap"], (fp_w, fp_h),
                                interpolation=cv2.INTER_LINEAR)
            mask = (nearest == i) & covered
            unified[mask] = scaled[mask]

        # Smooth sector boundaries
        unified = gaussian_filter(unified, sigma=10)
        # Re-apply FOV mask so smoothed values don't bleed outside sectors
        unified[~covered] = 0.0

        # Normalise
        if unified.max() > 0:
            unified = unified / unified.max()

        heatmap_u8  = (unified * 255).astype(np.uint8)
        heatmap_col = cv2.applyColorMap(heatmap_u8, cv2.COLORMAP_JET)

        # Blend coloured heatmap onto floor plan only within FOV sectors
        overlay = floor_plan_img.copy()
        blended = cv2.addWeighted(floor_plan_img, 0.4, heatmap_col, 0.6, 0)
        overlay[covered] = blended[covered]

        # Draw FOV sector outlines + camera markers
        for cam in cameras_with_video:
            cx_i  = int(cam["x_pct"] / 100.0 * fp_w)
            cy_i  = int(cam["y_pct"] / 100.0 * fp_h)
            dir_d = cam.get("fov_direction", 90.0)          # degrees
            sprd  = cam.get("fov_spread",    60.0)          # degrees
            rad   = max(8, int(cam.get("fov_range", 15.0) / 100.0 * fp_w))

            # Sector outline (polygon approximation of the arc)
            n_pts  = max(20, int(sprd))
            angles = np.linspace(
                (dir_d - sprd / 2) * (np.pi / 180.0),
                (dir_d + sprd / 2) * (np.pi / 180.0),
                n_pts,
            )
            arc_pts = [
                (int(cx_i + rad * np.cos(a)), int(cy_i + rad * np.sin(a)))
                for a in angles
            ]
            sector_pts = np.array([(cx_i, cy_i)] + arc_pts, dtype=np.int32)
            cv2.polylines(overlay, [sector_pts], isClosed=True,
                          color=(255, 255, 255), thickness=1, lineType=cv2.LINE_AA)

            # Camera dot
            cv2.circle(overlay, (cx_i, cy_i), 10, (255, 255, 255), -1)
            cv2.circle(overlay, (cx_i, cy_i), 12, (0, 0, 0), 2)
            cv2.line(overlay, (cx_i - 5, cy_i), (cx_i + 5, cy_i), (0, 0, 0), 2)
            cv2.line(overlay, (cx_i, cy_i - 5), (cx_i, cy_i + 5), (0, 0, 0), 2)

            # Label
            label = cam["name"][:16]
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.42, 1)
            cv2.rectangle(overlay,
                          (cx_i + 14, cy_i - th - 4), (cx_i + 16 + tw, cy_i + 2),
                          (0, 0, 0), -1)
            cv2.putText(overlay, label, (cx_i + 15, cy_i),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.42, (255, 255, 255), 1,
                        cv2.LINE_AA)

        os.makedirs("static/heatmaps", exist_ok=True)
        out_path = f"static/heatmaps/fp_{session_id}.png"
        cv2.imwrite(out_path, overlay)

        session["unified_heatmap_path"] = out_path
        session["status"] = "done"

        # Zone summary (computed only within each camera's FOV pixels)
        zones = _compute_zone_summary(unified, cameras_with_video, fp_w, fp_h,
                                      nearest, covered)
        session["zones"] = zones

        return {
            "session_id":   session_id,
            "heatmap_url":  f"/static/heatmaps/fp_{session_id}.png",
            "cameras":      _serialise_cameras(cameras_with_video),
            "zones":        zones,
            "total_people": sum(c["people_count"] for c in cameras_with_video),
        }

    except Exception as exc:
        session["status"] = "error"
        session["error"]  = str(exc)
        raise


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_session(session_id: str) -> dict:
    session = floor_plan_sessions.get(session_id)
    if not session:
        raise ValueError(f"Session '{session_id}' not found")
    return session


def _run_yolo_heatmap(video_path: str, model) -> tuple[np.ndarray, int]:
    """Run YOLOv8 on a video and return a normalised float32 heatmap (0-1)."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    fw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    fh = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    sample_interval = max(1, int(fps / 2))

    heatmap = np.zeros((fh, fw), dtype=np.float32)
    frame_no = 0
    max_people = 0

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if frame_no % sample_interval == 0:
            results = model.track(frame, persist=True, classes=[0],
                                  verbose=False, conf=0.3)
            if results and results[0].boxes is not None:
                boxes = results[0].boxes
                max_people = max(max_people, len(boxes))
                for box in boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
                    r = 25
                    heatmap[
                        max(0, cy - r): min(fh, cy + r),
                        max(0, cx - r): min(fw, cx + r),
                    ] += 1
        frame_no += 1

    cap.release()

    heatmap = gaussian_filter(heatmap, sigma=15)
    if heatmap.max() > 0:
        heatmap = heatmap / heatmap.max()

    return heatmap, max_people


def _compute_zone_summary(unified: np.ndarray, cameras: list,
                           fp_w: int, fp_h: int,
                           nearest: np.ndarray,
                           covered: np.ndarray | None = None) -> list[dict]:
    """Derive per-camera zone stats from the unified heatmap.

    When `covered` is provided the stats are computed only over pixels that
    fall inside each camera's FOV sector, matching what is shown on the output image.
    """
    zones = []
    global_max = unified.max() or 1.0

    for i, cam in enumerate(cameras):
        if covered is not None:
            mask = (nearest == i) & covered
        else:
            mask = nearest == i
        region = unified[mask]
        avg_density = float(region.mean()) if region.size else 0.0
        score = round(avg_density / global_max, 2)

        if score > 0.60:
            level = "High Attention Area"
            desc  = f"High customer activity detected by '{cam['name']}'. Great spot for promotional displays."
        elif score > 0.30:
            level = "Moderate Traffic Zone"
            desc  = f"Regular browsing activity near '{cam['name']}'. Suitable for staple products."
        else:
            level = "Low Customer Interaction"
            desc  = f"Low footfall near '{cam['name']}'. Consider repositioning products or signage."

        zones.append({
            "camera_id":     cam["id"],
            "name":          cam["name"],
            "level":         level,
            "description":   desc,
            "density_score": score,
            "people_count":  cam["people_count"],
        })

    return sorted(zones, key=lambda z: -z["density_score"])


def _serialise_cameras(cameras: list) -> list[dict]:
    return [
        {
            "id":            c["id"],
            "name":          c["name"],
            "x_pct":         c["x_pct"],
            "y_pct":         c["y_pct"],
            "fov_direction": c.get("fov_direction", 90.0),
            "fov_range":     c.get("fov_range",     15.0),
            "fov_spread":    c.get("fov_spread",    60.0),
            "people_count":  c.get("people_count", 0),
        }
        for c in cameras
    ]


def get_session_status(session_id: str) -> dict:
    session = _get_session(session_id)
    return {
        "session_id":   session_id,
        "floor_name":   session.get("floor_name", "Ground Floor"),
        "status":       session["status"],
        "error":        session.get("error"),
        "cameras":      _serialise_cameras([c for c in session["cameras"] if c.get("video_path")]),
        "heatmap_url":  f"/static/heatmaps/fp_{session_id}.png" if session["status"] == "done" else None,
        "floor_plan_url": session.get("floor_plan_preview_url"),
        "zones":        session.get("zones", []),
        "total_people": sum(c.get("people_count", 0) for c in session["cameras"]),
    }


def list_sessions() -> list[dict]:
    return [
        {
            "session_id":  sid,
            "floor_name":  s.get("floor_name", "Ground Floor"),
            "status":      s["status"],
            "num_cameras": len(s["cameras"]),
            "heatmap_url": f"/static/heatmaps/fp_{sid}.png" if s["status"] == "done" else None,
            "floor_plan_url": s.get("floor_plan_preview_url"),
            "zones":       s.get("zones", []),
            "total_people": sum(c.get("people_count", 0) for c in s["cameras"]),
            "cameras": [
                {
                    "id":            c["id"],
                    "name":          c["name"],
                    "x_pct":         c["x_pct"],
                    "y_pct":         c["y_pct"],
                    "has_video":     bool(c.get("video_path")),
                    "fov_direction": c.get("fov_direction", 90.0),
                    "fov_range":     c.get("fov_range",     15.0),
                    "fov_spread":    c.get("fov_spread",    60.0),
                }
                for c in s["cameras"]
            ],
        }
        for sid, s in floor_plan_sessions.items()
    ]


def delete_session(session_id: str):
    """Remove a floor plan session and all associated files from disk."""
    session = _get_session(session_id)

    def _rm(path: str):
        if path and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass

    # Generated heatmap overlay
    _rm(f"static/heatmaps/fp_{session_id}.png")

    # Static floor plan preview (served to frontend)
    preview_url = session.get("floor_plan_preview_url", "")
    if preview_url:
        # preview_url is like "/static/floorplans/abc123_plan.png"
        _rm(preview_url.lstrip("/"))

    # Original uploaded floor plan file
    _rm(session.get("floor_plan_path"))

    # Uploaded camera videos
    for cam in session.get("cameras", []):
        _rm(cam.get("video_path"))

    del floor_plan_sessions[session_id]
