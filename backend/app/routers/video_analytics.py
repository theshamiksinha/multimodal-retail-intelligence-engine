import os
import shutil
import uuid
from fastapi import APIRouter, UploadFile, File, HTTPException

from app.services import video_service

router = APIRouter()


@router.post("/upload")
async def upload_video(file: UploadFile = File(...)):
    """Upload a CCTV video for analysis."""
    if not file.filename.lower().endswith((".mp4", ".avi", ".mov", ".mkv")):
        raise HTTPException(400, "Unsupported video format. Use MP4, AVI, MOV, or MKV.")

    os.makedirs("uploads", exist_ok=True)
    file_path = f"uploads/{uuid.uuid4()}_{file.filename}"

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    try:
        result = video_service.process_video(file_path)
        return {
            "session_id": result["session_id"],
            "message": "Video processed successfully",
            "frame_count": result["frame_count"],
            "people_detected": result["people_detected"],
        }
    except Exception as e:
        raise HTTPException(500, f"Video processing failed: {str(e)}")


@router.get("/heatmap/{session_id}")
async def get_heatmap(session_id: str):
    """Get the heatmap and zone analysis for a processed video."""
    session = video_service.get_session(session_id)
    if not session:
        raise HTTPException(404, "Session not found")

    return {
        "session_id": session_id,
        "heatmap_url": f"/static/heatmaps/{session_id}.png",
        "zones": session["zones"],
        "dwell_times": session["dwell_times"],
        "total_people": session["total_people"],
        "frame_count": session["frame_count"],
    }


@router.get("/demo")
async def get_demo_analytics():
    """Get demo analytics data (no video upload needed)."""
    session = video_service.get_session("demo")
    if not session:
        video_service.generate_sample_analytics()
        session = video_service.get_session("demo")

    return {
        "session_id": "demo",
        "heatmap_url": "/static/heatmaps/demo.png",
        "zones": session["zones"],
        "dwell_times": session["dwell_times"],
        "total_people": session["total_people"],
        "frame_count": session["frame_count"],
        "detections": session["detections"],
    }


@router.get("/sessions")
async def list_sessions():
    """List all processed video sessions."""
    return {
        "sessions": [
            {"session_id": sid, "people_detected": s.get("total_people", 0)}
            for sid, s in video_service.sessions.items()
        ]
    }
