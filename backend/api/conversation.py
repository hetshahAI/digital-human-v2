from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field

from core.conversation.SessionState import SessionState
from core.conversation.Session import Session, Message
from core.conversation.ConversationManager import ConversationManager

router = APIRouter(prefix="/conversation", tags=["Conversation"])

class StartSessionRequest(BaseModel):
    session_id: Optional[str] = Field(None, description="Optional custom session ID")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Optional session metadata")

class StartSessionResponse(BaseModel):
    session_id: str
    state: SessionState

# Dependency to provide ConversationManager
_conversation_manager: Optional[ConversationManager] = None

def set_conversation_manager(manager: ConversationManager) -> None:
    global _conversation_manager
    _conversation_manager = manager

def get_conversation_manager() -> ConversationManager:
    global _conversation_manager
    if _conversation_manager is None:
        _conversation_manager = ConversationManager()
    return _conversation_manager

@router.post(
    "/start",
    response_model=StartSessionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start a new conversation session",
    description="Creates a new conversation session with optional custom session ID and metadata."
)
async def start_conversation(
    request: Optional[StartSessionRequest] = None,
    manager: ConversationManager = Depends(get_conversation_manager)
) -> StartSessionResponse:
    session_id = request.session_id if request else None
    metadata = request.metadata if request else {}
    session = await manager.create_session(session_id=session_id, metadata=metadata)
    return StartSessionResponse(
        session_id=session.session_id,
        state=session.state
    )

@router.get(
    "/{session_id}",
    response_model=Session,
    summary="Get conversation session history",
    description="Retrieves the full session details including conversation history and metadata."
)
async def get_conversation(
    session_id: str,
    manager: ConversationManager = Depends(get_conversation_manager)
) -> Session:
    session = await manager.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session with ID '{session_id}' not found."
        )
    return session

@router.post(
    "/{session_id}/end",
    response_model=Session,
    summary="End conversation session",
    description="Ends an active conversation session, sets its state to STOPPED, and persists the transcript."
)
async def end_conversation(
    session_id: str,
    manager: ConversationManager = Depends(get_conversation_manager)
) -> Session:
    session = await manager.end_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session with ID '{session_id}' not found."
        )
    return session
