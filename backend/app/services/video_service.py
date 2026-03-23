import cv2
import numpy as np
import uuid
import os
import json
from collections import defaultdict
from ultralytics import YOLO
from scipy.ndimage import gaussian_filter

# In-memory session store
sessions: dict = {}

MODEL = None


def get_model():
    global MODEL
    if MODEL is None:
        MODEL = YOLO("yolov8n.pt")  # nano model for speed
    return MODEL


def process_video(video_path: str) -> dict:
    """Process a video file: detect people, track movements, compute heatmap data."""
    session_id = str(uuid.uuid4())[:8]
    model = get_model()

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError("Could not open video file")

    frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    # Accumulator for heatmap (density of person positions)
    heatmap_accum = np.zeros((frame_height, frame_width), dtype=np.float32)

    # Track person positions per frame for dwell time
    all_detections = []
    person_tracks = defaultdict(list)  # track_id -> list of (cx, cy, frame_no)
    frame_count = 0
    total_people = 0
    sample_interval = max(1, int(fps / 2))  # process ~2 frames per second

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        if frame_count % sample_interval == 0:
            results = model.track(frame, persist=True, classes=[0], verbose=False, conf=0.3)

            if results and results[0].boxes is not None:
                boxes = results[0].boxes
                for box in boxes:
                    x1, y1, x2, y2 = box.xyxy[0].cpu().numpy().astype(int)
                    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2

                    # Add to heatmap with a gaussian blob
                    y_min = max(0, cy - 30)
                    y_max = min(frame_height, cy + 30)
                    x_min = max(0, cx - 30)
                    x_max = min(frame_width, cx + 30)
                    heatmap_accum[y_min:y_max, x_min:x_max] += 1

                    track_id = int(box.id[0]) if box.id is not None else -1
                    person_tracks[track_id].append((cx, cy, frame_count))

                total_people = max(total_people, len(boxes))
                all_detections.append({
                    "frame": frame_count,
                    "count": len(boxes),
                })

        frame_count += 1

    cap.release()

    # Smooth the heatmap
    heatmap_accum = gaussian_filter(heatmap_accum, sigma=20)

    # Normalize to 0-255
    if heatmap_accum.max() > 0:
        heatmap_norm = (heatmap_accum / heatmap_accum.max() * 255).astype(np.uint8)
    else:
        heatmap_norm = heatmap_accum.astype(np.uint8)

    # Generate heatmap image
    heatmap_color = cv2.applyColorMap(heatmap_norm, cv2.COLORMAP_JET)

    # Read first frame for overlay
    cap2 = cv2.VideoCapture(video_path)
    ret, first_frame = cap2.read()
    cap2.release()

    if ret:
        overlay = cv2.addWeighted(first_frame, 0.5, heatmap_color, 0.5, 0)
    else:
        overlay = heatmap_color

    os.makedirs("static/heatmaps", exist_ok=True)
    heatmap_path = f"static/heatmaps/{session_id}.png"
    cv2.imwrite(heatmap_path, overlay)

    # Compute zones (divide frame into grid)
    zones = compute_zones(heatmap_accum, frame_width, frame_height)

    # Compute dwell times
    dwell_times = compute_dwell_times(person_tracks, fps, frame_width, frame_height)

    # Store session data
    sessions[session_id] = {
        "video_path": video_path,
        "heatmap_path": heatmap_path,
        "frame_count": frame_count,
        "total_people": total_people,
        "zones": zones,
        "dwell_times": dwell_times,
        "detections": all_detections,
        "frame_width": frame_width,
        "frame_height": frame_height,
        "fps": fps,
    }

    return {
        "session_id": session_id,
        "frame_count": frame_count,
        "people_detected": total_people,
    }


def compute_zones(heatmap: np.ndarray, width: int, height: int, grid_cols: int = 3, grid_rows: int = 3) -> list[dict]:
    """Divide the frame into a grid and compute engagement level for each zone."""
    zones = []
    cell_h = height // grid_rows
    cell_w = width // grid_cols

    zone_names = [
        ["Top-Left", "Top-Center", "Top-Right"],
        ["Middle-Left", "Center", "Middle-Right"],
        ["Bottom-Left", "Bottom-Center", "Bottom-Right"],
    ]

    max_density = 0
    zone_densities = []

    for r in range(grid_rows):
        for c in range(grid_cols):
            y1, y2 = r * cell_h, (r + 1) * cell_h
            x1, x2 = c * cell_w, (c + 1) * cell_w
            density = float(heatmap[y1:y2, x1:x2].sum())
            zone_densities.append(density)
            max_density = max(max_density, density)

    for idx, (r, c) in enumerate([(r, c) for r in range(grid_rows) for c in range(grid_cols)]):
        density = zone_densities[idx]
        if max_density > 0:
            normalized = density / max_density
        else:
            normalized = 0

        if normalized > 0.66:
            level = "High Attention Area"
            description = "High customer dwell time. Ideal placement for promotional products."
        elif normalized > 0.33:
            level = "Moderate Traffic Zone"
            description = "Regular browsing activity. Suitable for staple items."
        else:
            level = "Low Customer Interaction"
            description = "Limited customer engagement. Opportunity for layout optimization."

        zones.append({
            "name": zone_names[r][c],
            "level": level,
            "description": description,
            "density_score": round(normalized, 2),
            "row": r,
            "col": c,
        })

    return zones


def compute_dwell_times(tracks: dict, fps: float, width: int, height: int) -> list[dict]:
    """Compute how long each tracked person spent in different zones."""
    zone_dwell = defaultdict(float)

    for track_id, positions in tracks.items():
        if track_id == -1 or len(positions) < 2:
            continue

        for cx, cy, frame_no in positions:
            col = min(2, cx * 3 // width)
            row = min(2, cy * 3 // height)
            zone_name = [
                ["Top-Left", "Top-Center", "Top-Right"],
                ["Middle-Left", "Center", "Middle-Right"],
                ["Bottom-Left", "Bottom-Center", "Bottom-Right"],
            ][row][col]
            zone_dwell[zone_name] += 1.0 / fps  # each detection = 1/fps seconds approx

    return [
        {"zone": zone, "avg_dwell_seconds": round(seconds / max(1, len(tracks)), 1)}
        for zone, seconds in sorted(zone_dwell.items(), key=lambda x: -x[1])
    ]


def get_session(session_id: str) -> dict | None:
    return sessions.get(session_id)


def generate_sample_analytics() -> dict:
    """Generate realistic sample analytics data for demo purposes."""
    session_id = "demo"

    zones = [
        {"name": "Entrance", "level": "High Attention Area",
         "description": "High customer dwell time. Ideal placement for promotional products.",
         "density_score": 0.92, "row": 2, "col": 1},
        {"name": "Beverage Section", "level": "High Attention Area",
         "description": "Customers spend 40% more time near the beverage refrigerator.",
         "density_score": 0.85, "row": 1, "col": 2},
        {"name": "Snack Aisle", "level": "Low Customer Interaction",
         "description": "Low interaction detected near the snack aisle.",
         "density_score": 0.18, "row": 0, "col": 2},
        {"name": "Checkout Area", "level": "High Attention Area",
         "description": "Regular foot traffic. Good for impulse-buy items.",
         "density_score": 0.78, "row": 2, "col": 0},
        {"name": "Produce Section", "level": "Moderate Traffic Zone",
         "description": "Regular browsing activity. Suitable for staple items.",
         "density_score": 0.55, "row": 0, "col": 0},
        {"name": "Center Display", "level": "Moderate Traffic Zone",
         "description": "Moderate engagement with promotional displays.",
         "density_score": 0.48, "row": 1, "col": 1},
    ]

    dwell_times = [
        {"zone": "Beverage Section", "avg_dwell_seconds": 45.2},
        {"zone": "Entrance", "avg_dwell_seconds": 12.8},
        {"zone": "Checkout Area", "avg_dwell_seconds": 38.5},
        {"zone": "Produce Section", "avg_dwell_seconds": 28.3},
        {"zone": "Center Display", "avg_dwell_seconds": 22.1},
        {"zone": "Snack Aisle", "avg_dwell_seconds": 8.4},
    ]

    # Generate a demo heatmap image
    heatmap = np.zeros((480, 640), dtype=np.float32)

    # Create hotspots
    hotspots = [
        (320, 420, 80),   # entrance - bottom center
        (520, 240, 70),   # beverage - middle right
        (100, 100, 50),   # produce - top left
        (80, 400, 65),    # checkout - bottom left
        (320, 240, 45),   # center display
        (550, 80, 15),    # snack aisle - low
    ]

    for hx, hy, intensity in hotspots:
        y, x = np.ogrid[-hy:480 - hy, -hx:640 - hx]
        mask = x * x + y * y <= 80 * 80
        heatmap[mask] += intensity

    heatmap = gaussian_filter(heatmap, sigma=30)
    if heatmap.max() > 0:
        heatmap_norm = (heatmap / heatmap.max() * 255).astype(np.uint8)
    else:
        heatmap_norm = heatmap.astype(np.uint8)

    heatmap_color = cv2.applyColorMap(heatmap_norm, cv2.COLORMAP_JET)

    # Create a simple store floor plan background
    bg = np.ones((480, 640, 3), dtype=np.uint8) * 230
    # Draw some zone outlines
    cv2.rectangle(bg, (10, 10), (210, 230), (180, 180, 180), 2)
    cv2.putText(bg, "Produce", (50, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (100, 100, 100), 2)
    cv2.rectangle(bg, (430, 10), (630, 230), (180, 180, 180), 2)
    cv2.putText(bg, "Snacks", (470, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (100, 100, 100), 2)
    cv2.rectangle(bg, (430, 140), (630, 350), (180, 180, 180), 2)
    cv2.putText(bg, "Beverages", (450, 250), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (100, 100, 100), 2)
    cv2.rectangle(bg, (10, 350), (210, 470), (180, 180, 180), 2)
    cv2.putText(bg, "Checkout", (30, 420), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (100, 100, 100), 2)
    cv2.rectangle(bg, (220, 350), (420, 470), (180, 180, 180), 2)
    cv2.putText(bg, "Entrance", (260, 420), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (100, 100, 100), 2)
    cv2.rectangle(bg, (220, 140), (420, 340), (180, 180, 180), 2)
    cv2.putText(bg, "Display", (270, 250), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (100, 100, 100), 2)

    overlay = cv2.addWeighted(bg, 0.4, heatmap_color, 0.6, 0)

    os.makedirs("static/heatmaps", exist_ok=True)
    heatmap_path = "static/heatmaps/demo.png"
    cv2.imwrite(heatmap_path, overlay)

    sessions[session_id] = {
        "heatmap_path": heatmap_path,
        "frame_count": 1800,
        "total_people": 47,
        "zones": zones,
        "dwell_times": dwell_times,
        "detections": [{"frame": i * 15, "count": np.random.randint(2, 8)} for i in range(120)],
        "frame_width": 640,
        "frame_height": 480,
        "fps": 30,
    }

    return sessions[session_id]
