import time
import uuid
import logging
import asyncio
from typing import Optional, Dict, Any, List

from core.conversation.SessionState import SessionState
from core.conversation.Session import Session, Message
from core.conversation.TranscriptStore import TranscriptStore

logger = logging.getLogger(__name__)

class ConversationManager:
    """
    Manages multi-turn conversation sessions and conversation history.
    Strictly handles state and history with no provider or ML logic.
    """
    def __init__(self, transcript_store: Optional[TranscriptStore] = None):
        self.store = transcript_store or TranscriptStore()
        self._sessions: Dict[str, Session] = {}
        self._lock = asyncio.Lock()

    async def create_session(
        self,
        session_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Session:
        sid = session_id or str(uuid.uuid4())
        now = time.time()
        session = Session(
            session_id=sid,
            created_at=now,
            updated_at=now,
            state=SessionState.IDLE,
            conversation_history=[],
            metadata=metadata or {}
        )
        async with self._lock:
            self._sessions[sid] = session

        logger.info(f"Session Created: {sid}")
        return session

    async def get_session(self, session_id: str) -> Optional[Session]:
        async with self._lock:
            if session_id in self._sessions:
                return self._sessions[session_id]
        
        # Fallback to loading persisted session if available
        persisted = await self.store.load_session(session_id)
        if persisted is not None:
            async with self._lock:
                self._sessions[session_id] = persisted
            return persisted
        return None

    async def append_user_message(self, session_id: str, text: str) -> Optional[Session]:
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                # Auto-create session if missing
                now = time.time()
                session = Session(
                    session_id=session_id,
                    created_at=now,
                    updated_at=now,
                    state=SessionState.IDLE,
                    conversation_history=[],
                    metadata={}
                )
                self._sessions[session_id] = session
                logger.info(f"Session Created: {session_id}")

            msg = Message(role="user", text=text, timestamp=time.time())
            session.conversation_history.append(msg)
            session.updated_at = time.time()
            logger.info(f"User Message Added: [{session_id}] {text}")
            return session

    async def append_assistant_message(self, session_id: str, text: str) -> Optional[Session]:
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                # Auto-create session if missing
                now = time.time()
                session = Session(
                    session_id=session_id,
                    created_at=now,
                    updated_at=now,
                    state=SessionState.IDLE,
                    conversation_history=[],
                    metadata={}
                )
                self._sessions[session_id] = session
                logger.info(f"Session Created: {session_id}")

            msg = Message(role="assistant", text=text, timestamp=time.time())
            session.conversation_history.append(msg)
            session.updated_at = time.time()
            logger.info(f"Assistant Message Added: [{session_id}] {text}")
            return session

    async def set_session_state(self, session_id: str, state: SessionState) -> Optional[Session]:
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is not None:
                session.state = state
                session.updated_at = time.time()
                return session
        return None

    async def end_session(self, session_id: str) -> Optional[Session]:
        async with self._lock:
            session = self._sessions.get(session_id)
            if session is None:
                # Check if it was persisted
                session = await self.store.load_session(session_id)
                if session is None:
                    return None
            
            session.state = SessionState.STOPPED
            session.updated_at = time.time()

        # Persist conversation automatically upon session end
        await self.store.save_session(session)
        logger.info(f"Session Closed: {session_id}")
        return session
