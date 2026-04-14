import cv2
import numpy as np
import uuid
import os
import json
import math
from collections import defaultdict
from datetime import datetime, timezone
from scipy.ndimage import gaussian_filter
from app.services.video_service import get_model

# ── Persistent session store ──────────────────────────────────────────────────
# Kept in memory during runtime; saved to disk after every mutation so that
# sessions survive server restarts.  Numpy heatmap arrays are excluded from
# the file (they're only needed during live processing).

SESSIONS_FILE = "data/floor_plan_sessions.json"

floor_plan_sessions: dict = {}


def _save_sessions():
    """Write the current sessions to disk, skipping non-serialisable numpy arrays."""
    os.makedirs("data", exist_ok=True)
    payload = {}
    for sid, s in floor_plan_sessions.items():
        payload[sid] = {k: v for k, v in s.items() if k != "cameras"}
        payload[sid]["cameras"] = [
            {k: v for k, v in cam.items() if k != "heatmap"}
            for cam in s.get("cameras", [])
        ]
    try:
        with open(SESSIONS_FILE, "w") as f:
            json.dump(payload, f, indent=2)
    except OSError as e:
        print(f"[floor_plan] Could not save sessions: {e}")


def _load_sessions():
    """Load sessions from disk on startup. Files on disk are still present;
    we just restore the metadata so the app knows about them."""
    if not os.path.exists(SESSIONS_FILE):
        return
    try:
        with open(SESSIONS_FILE) as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"[floor_plan] Could not load sessions file: {e}")
        return

    for sid, s in data.items():
        # If the server was killed mid-processing, mark as error so the user
        # can see the floor and choose to reprocess.
        if s.get("status") == "processing":
            s["status"] = "error"
            s["error"] = "Server was restarted during processing — please reprocess."
        # Restore the heatmap slot (populated only during live processing)
        for cam in s.get("cameras", []):
            cam.setdefault("heatmap", None)
        floor_plan_sessions[sid] = s

    print(f"[floor_plan] Restored {len(data)} session(s) from disk.")


# Restore sessions immediately on module import
_load_sessions()


def create_session(floor_plan_path: str, floor_name: str = "Ground Floor",
                   recorded_at: str | None = None) -> str:
    session_id = str(uuid.uuid4())[:8]
    now_iso = datetime.now(timezone.utc).isoformat()
    floor_plan_sessions[session_id] = {
        "floor_plan_path": floor_plan_path,
        "floor_name": floor_name,
        "cameras": [],
        "unified_heatmap_path": None,
        "status": "setup",
        "error": None,
        "uploaded_at": now_iso,
        # If the user specified when the footage was recorded, use that;
        # otherwise default to upload time (simulates a live feed timestamp).
        "recorded_at": recorded_at or now_iso,
        "footage_duration_seconds": None,
    }
    _save_sessions()
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
    _save_sessions()


def attach_video(session_id: str, camera_id: str, video_path: str):
    """Link an uploaded video file to a specific camera in the session."""
    session = _get_session(session_id)
    for cam in session["cameras"]:
        if cam["id"] == camera_id:
            cam["video_path"] = video_path
            _save_sessions()
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

        # ── Step 1: per-camera heatmaps + trajectory data ────────────────────
        session_duration = 0.0
        for cam in cameras_with_video:
            raw_heatmap, people_count, raw_tracks, duration = _run_yolo_heatmap(cam["video_path"], model)
            cam["heatmap"]      = raw_heatmap   # (video_h, video_w) float32  0-1
            cam["people_count"] = people_count
            cam["raw_tracks"]   = raw_tracks    # {track_id: [{t, cx_norm, cy_norm}]}
            cam["duration"]     = duration
            session_duration    = max(session_duration, duration)

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

        # ── Soft alpha mask: fades to 0 at sector boundaries ─────────────────
        # Both the arc edge (range) and the angular edges (spread) fade
        # independently; the combined fade is their product.
        FADE_START = 0.60   # start fading at 60% of range/spread distance
        alpha_map  = np.zeros((fp_h, fp_w), dtype=np.float32)
        for i in range(len(cameras_with_video)):
            # Range fade
            range_ratio  = np.clip(dist[i] / np.maximum(fov_radii_px[i], 1.0), 0.0, 1.0)
            range_alpha  = 1.0 - np.clip(
                (range_ratio  - FADE_START) / (1.0 - FADE_START), 0.0, 1.0)
            # Spread (angular) fade
            spread_ratio = np.clip(
                np.abs(angle_diff[i]) / np.maximum(fov_half_spreads[i], 1e-6), 0.0, 1.0)
            spread_alpha = 1.0 - np.clip(
                (spread_ratio - FADE_START) / (1.0 - FADE_START), 0.0, 1.0)
            # Per-camera alpha (zero outside this camera's FOV)
            cam_alpha = range_alpha * spread_alpha * in_fov[i].astype(np.float32)
            # Take the strongest coverage across all cameras
            alpha_map = np.maximum(alpha_map, cam_alpha)

        # Cap max opacity so the floor plan always shows through
        MAX_OPACITY = 0.55
        alpha_map   = alpha_map * MAX_OPACITY          # now in [0, MAX_OPACITY]

        # Per-pixel alpha blend — no hard cutoff, no camera markers
        alpha_3d = alpha_map[:, :, np.newaxis]         # (fp_h, fp_w, 1)
        overlay  = (
            floor_plan_img.astype(np.float32) * (1.0 - alpha_3d) +
            heatmap_col.astype(np.float32)   * alpha_3d
        ).clip(0, 255).astype(np.uint8)

        os.makedirs("static/heatmaps", exist_ok=True)
        out_path = f"static/heatmaps/fp_{session_id}.png"
        cv2.imwrite(out_path, overlay)

        session["unified_heatmap_path"] = out_path
        session["status"] = "done"
        session["footage_duration_seconds"] = round(session_duration, 2)
        _save_sessions()

        # Zone summary (computed only within each camera's FOV pixels)
        zones = _compute_zone_summary(unified, cameras_with_video, fp_w, fp_h,
                                      nearest, covered)
        session["zones"] = zones

        # ── Trajectory pipeline ───────────────────────────────────────────────
        # 1. Project each camera's tracks to floor-plan coords
        per_cam_tracks = []
        for cam in cameras_with_video:
            raw_tracks = cam.get("raw_tracks", {})
            for track_id, points in raw_tracks.items():
                if len(points) < 2:
                    continue
                floor_points = [
                    {
                        "t":     p["t"],
                        "x_pct": round(_project_to_floor(p["cx_norm"], p["cy_norm"], cam)[0], 2),
                        "y_pct": round(_project_to_floor(p["cx_norm"], p["cy_norm"], cam)[1], 2),
                    }
                    for p in points
                ]
                per_cam_tracks.append({
                    "camera_id": cam["id"],
                    "camera_name": cam["name"],
                    "track_id": track_id,
                    "points": floor_points,
                })

        # 2. Link tracks across cameras (Re-ID) to build customer journeys
        customers = _link_cross_camera_tracks(per_cam_tracks)
        session["trajectories"] = {
            "customers":  customers,
            "duration":   round(session_duration, 2),
            "num_cameras": len(cameras_with_video),
        }
        _save_sessions()

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
        _save_sessions()
        raise


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_session(session_id: str) -> dict:
    session = floor_plan_sessions.get(session_id)
    if not session:
        raise ValueError(f"Session '{session_id}' not found")
    return session


def _run_yolo_heatmap(video_path: str, model) -> tuple[np.ndarray, int, dict, float]:
    """Run YOLOv8 on a video.

    Returns
    -------
    heatmap     : normalised float32 (0-1)
    max_people  : peak simultaneous person count
    tracks      : {track_id: [{"t": float, "cx_norm": float, "cy_norm": float}]}
    duration    : total video duration in seconds
    """
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
    tracks: dict[int, list[dict]] = defaultdict(list)

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
                    track_id = int(box.id[0]) if (box.id is not None) else -1
                    if track_id >= 0:
                        tracks[track_id].append({
                            "t":       round(frame_no / fps, 3),
                            "cx_norm": round(cx / fw, 4),
                            "cy_norm": round(cy / fh, 4),
                        })
        frame_no += 1

    cap.release()
    duration = frame_no / fps

    heatmap = gaussian_filter(heatmap, sigma=15)
    if heatmap.max() > 0:
        heatmap = heatmap / heatmap.max()

    return heatmap, max_people, dict(tracks), duration


def _project_to_floor(cx_norm: float, cy_norm: float, cam: dict) -> tuple[float, float]:
    """
    Map a normalised camera-image coordinate to floor-plan percentage coords.

    Model (top-down CCTV approximation):
      cx_norm ∈ [0,1]  — 0 = left edge of FOV cone, 1 = right edge
      cy_norm ∈ [0,1]  — 0 = far end of FOV, 1 = close to camera
      Camera at (x_pct, y_pct) looking in fov_direction° (0=right, 90=down)
      Cone spans fov_spread° wide, fov_range% of floor width deep.
    """
    fov_dir_rad    = cam.get("fov_direction", 90.0) * math.pi / 180.0
    fov_spread_rad = cam.get("fov_spread",    60.0) * math.pi / 180.0
    fov_range_pct  = cam.get("fov_range",     15.0)   # % of floor width

    # Angular offset within the cone (cx=0 → left edge, cx=1 → right edge)
    theta = fov_dir_rad + (cx_norm - 0.5) * fov_spread_rad

    # Depth: cy=0 → far end of cone, cy=1 → at camera
    depth_pct = (1.0 - cy_norm) * fov_range_pct

    x_pct = cam["x_pct"] + depth_pct * math.cos(theta)
    y_pct = cam["y_pct"] + depth_pct * math.sin(theta)

    return max(0.0, min(100.0, x_pct)), max(0.0, min(100.0, y_pct))


_JOURNEY_COLORS = [
    "#6366f1", "#f59e0b", "#10b981", "#ef4444",
    "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
    "#f97316", "#14b8a6",
]


def _link_cross_camera_tracks(per_cam_tracks: list[dict]) -> list[dict]:
    """
    Link tracks from different cameras into unified customer journeys.

    Strategy — spatial-temporal proximity Re-ID:
      When track A ends and track B (from a different camera) starts within
      TIME_THRESHOLD seconds and DIST_THRESHOLD floor-plan % units, they are
      considered the same person.

    Parameters
    ----------
    per_cam_tracks : list of {camera_id, camera_name, track_id, points:[{t,x_pct,y_pct}]}

    Returns
    -------
    list of {customer_id, color, camera_ids, path:[{t,x_pct,y_pct,camera_id}]}
    """
    DIST_THRESHOLD = 18.0   # floor-plan %
    TIME_THRESHOLD = 6.0    # seconds

    if not per_cam_tracks:
        return []

    # Sort tracks by their start time
    tracks = sorted(per_cam_tracks, key=lambda t: t["points"][0]["t"])
    n = len(tracks)

    # Union-Find
    parent = list(range(n))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(i: int, j: int):
        pi, pj = find(i), find(j)
        if pi != pj:
            parent[pi] = pj

    for i in range(n):
        t1 = tracks[i]
        end = t1["points"][-1]
        for j in range(i + 1, n):
            t2 = tracks[j]
            if t2["camera_id"] == t1["camera_id"]:
                continue
            start = t2["points"][0]
            dt = start["t"] - end["t"]
            if dt < 0 or dt > TIME_THRESHOLD:
                continue
            dist = math.hypot(start["x_pct"] - end["x_pct"],
                              start["y_pct"] - end["y_pct"])
            if dist < DIST_THRESHOLD:
                union(i, j)

    # Group by root
    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(n):
        groups[find(i)].append(i)

    customers = []
    for idx, (_, indices) in enumerate(sorted(groups.items())):
        merged: list[dict] = []
        cam_ids: set[str] = set()
        for i in indices:
            t = tracks[i]
            cam_ids.add(t["camera_id"])
            for pt in t["points"]:
                merged.append({**pt, "camera_id": t["camera_id"]})

        merged.sort(key=lambda p: p["t"])

        # Deduplicate near-identical timestamps
        deduped: list[dict] = []
        for pt in merged:
            if not deduped or pt["t"] - deduped[-1]["t"] > 0.05:
                deduped.append(pt)

        customers.append({
            "customer_id": f"C{idx + 1:03d}",
            "color":       _JOURNEY_COLORS[idx % len(_JOURNEY_COLORS)],
            "camera_ids":  list(cam_ids),
            "path":        deduped,
        })

    customers.sort(key=lambda c: c["path"][0]["t"])
    return customers


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
        "uploaded_at":  session.get("uploaded_at"),
        "recorded_at":  session.get("recorded_at"),
        "footage_duration_seconds": session.get("footage_duration_seconds"),
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
            "uploaded_at": s.get("uploaded_at"),
            "recorded_at": s.get("recorded_at"),
            "footage_duration_seconds": s.get("footage_duration_seconds"),
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


def set_recorded_at(session_id: str, recorded_at: str):
    """Update the recorded_at timestamp for a session (called before processing)."""
    session = _get_session(session_id)
    session["recorded_at"] = recorded_at
    _save_sessions()


def get_trajectories(session_id: str) -> dict | None:
    """Return trajectory data for a session, or None if not yet computed."""
    session = floor_plan_sessions.get(session_id)
    if not session:
        return None
    return session.get("trajectories")


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
    _save_sessions()
