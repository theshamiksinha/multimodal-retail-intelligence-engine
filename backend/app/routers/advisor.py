from fastapi import APIRouter, HTTPException

from app.models.schemas import AdvisorMessage
from app.services import advisor_service

router = APIRouter()


@router.post("/chat")
async def chat_with_advisor(request: AdvisorMessage):
    """Send a message to the AI retail advisor."""
    try:
        result = advisor_service.chat(request.message, request.session_id)
        return result
    except Exception as e:
        raise HTTPException(500, f"Advisor error: {str(e)}")


@router.delete("/session/{session_id}")
async def clear_session(session_id: str):
    """Clear conversation history for a session."""
    if session_id in advisor_service.conversation_sessions:
        del advisor_service.conversation_sessions[session_id]
    return {"message": "Session cleared"}
