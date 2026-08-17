import time
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from core.conversation.SessionState import SessionState

class Message(BaseModel):
    role: str
    text: str
    timestamp: float = Field(default_factory=time.time)

class Session(BaseModel):
    session_id: str
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)
    state: SessionState = SessionState.IDLE
    conversation_history: List[Message] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
