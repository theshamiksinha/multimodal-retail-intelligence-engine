import os
import uuid
import shutil
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, BackgroundTasks
from pydantic import BaseModel

from app.services import floor_plan_service

router = APIRouter()


class CameraLayout(BaseModel):
    id: str
    name: str
    x_pct: float          # 0–100  (% of floor plan width)
    y_pct: float          # 0–100  (% of floor plan height)
    fov_direction: float = 90.0   # degrees, 0=right, 90=down
    fov_range: float = 15.0       # % of container width
    fov_spread: float = 60.0      # total cone angle in degrees


class SaveCamerasRequest(BaseModel):
    cameras: list[CameraLayout]


# ── Session management ────────────────────────────────────────────────────────

@router.post("/session")
async def create_session(
    file: UploadFile = File(...),
    floor_name: str = Form("Ground Floor"),
):
    """Upload a floor plan image and create a new mapping session."""
    if not file.filename.lower().endswith((".png", ".jpg", ".jpeg", ".webp")):
        raise HTTPException(400, "Floor plan must be PNG, JPG, or WEBP")

    os.makedirs("uploads/floorplans", exist_ok=True)
    path = f"uploads/floorplans/{uuid.uuid4()}_{file.filename}"
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Save a copy to static so the frontend can preview it
    os.makedirs("static/floorplans", exist_ok=True)
    preview_name = f"{uuid.uuid4().hex[:8]}_{file.filename}"
    preview_path = f"static/floorplans/{preview_name}"
    shutil.copy(path, preview_path)

    session_id = floor_plan_service.create_session(path, floor_name)
    # Store preview URL in session for later retrieval
    floor_plan_service.floor_plan_sessions[session_id]["floor_plan_preview_url"] = \
        f"/static/floorplans/{preview_name}"

    return {
        "session_id":     session_id,
        "floor_name":     floor_name,
        "floor_plan_url": f"/static/floorplans/{preview_name}",
    }


@router.post("/session/{session_id}/cameras")
async def save_cameras(session_id: str, body: SaveCamerasRequest):
    """Save the camera layout for a session."""
    try:
        floor_plan_service.save_cameras(
            session_id,
            [c.model_dump() for c in body.cameras],
        )
        return {"message": "Camera layout saved", "count": len(body.cameras)}
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/session/{session_id}/camera/{camera_id}/video")
async def upload_camera_video(session_id: str, camera_id: str,
                               file: UploadFile = File(...)):
    """Upload CCTV footage for a specific camera in the session."""
    if not file.filename.lower().endswith((".mp4", ".avi", ".mov", ".mkv")):
        raise HTTPException(400, "Unsupported video format")

    os.makedirs("uploads/videos", exist_ok=True)
    path = f"uploads/videos/{uuid.uuid4()}_{file.filename}"
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        floor_plan_service.attach_video(session_id, camera_id, path)
        return {"message": "Video attached", "camera_id": camera_id}
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.post("/session/{session_id}/process")
async def process_session(session_id: str, background_tasks: BackgroundTasks):
    """Trigger processing of all camera videos and generate unified heatmap."""
    try:
        status = floor_plan_service.get_session_status(session_id)
    except ValueError as e:
        raise HTTPException(404, str(e))

    if status["status"] == "processing":
        return {"message": "Already processing"}

    # Run in background so the HTTP response returns immediately
    background_tasks.add_task(_run_processing, session_id)
    return {"message": "Processing started", "session_id": session_id}


async def _run_processing(session_id: str):
    try:
        floor_plan_service.process_session(session_id)
    except Exception as e:
        print(f"Floor plan processing error [{session_id}]: {e}")


@router.get("/session/{session_id}/status")
async def get_status(session_id: str):
    """Poll processing status."""
    try:
        return floor_plan_service.get_session_status(session_id)
    except ValueError as e:
        raise HTTPException(404, str(e))


@router.get("/session/{session_id}/trajectories")
async def get_trajectories(session_id: str):
    """Return customer journey trajectories for a processed session."""
    data = floor_plan_service.get_trajectories(session_id)
    if data is None:
        raise HTTPException(404, "No trajectory data — session not found or not yet processed")
    if not data:
        raise HTTPException(404, "No trajectory data — reprocess the session to generate journeys")
    return data


@router.get("/sessions")
async def list_sessions():
    return {"sessions": floor_plan_service.list_sessions()}


@router.delete("/session/{session_id}")
async def delete_session(session_id: str):
    """Delete a floor plan session and its generated heatmap."""
    try:
        floor_plan_service.delete_session(session_id)
        return {"message": "Floor plan deleted"}
    except ValueError as e:
        raise HTTPException(404, str(e))
