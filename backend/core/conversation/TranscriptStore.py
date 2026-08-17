import json
import logging
import asyncio
from pathlib import Path
from typing import Optional, Union, List

from config.settings import CONVERSATIONS_DIR
from core.conversation.Session import Session

logger = logging.getLogger(__name__)

class TranscriptStore:
    def __init__(self, storage_dir: Optional[Union[str, Path]] = None):
        self.storage_dir = Path(storage_dir) if storage_dir is not None else CONVERSATIONS_DIR
        self.storage_dir.mkdir(parents=True, exist_ok=True)

    def _get_file_path(self, session_id: str) -> Path:
        # Sanitize session_id to avoid path traversal
        safe_id = "".join(c for c in session_id if c.isalnum() or c in ("-", "_"))
        return self.storage_dir / f"session_{safe_id}.json"

    def _save_sync(self, session: Session) -> Path:
        file_path = self._get_file_path(session.session_id)
        temp_path = file_path.with_suffix(".tmp")
        data = session.model_dump()
        with open(temp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        temp_path.replace(file_path)
        logger.info(f"Session Saved: {session.session_id}")
        return file_path

    def _load_sync(self, session_id: str) -> Optional[Session]:
        file_path = self._get_file_path(session_id)
        if not file_path.exists():
            return None
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return Session.model_validate(data)

    def _exists_sync(self, session_id: str) -> bool:
        return self._get_file_path(session_id).exists()

    def _list_sync(self) -> List[str]:
        session_ids = []
        for file in self.storage_dir.glob("session_*.json"):
            sid = file.stem.replace("session_", "", 1)
            session_ids.append(sid)
        return session_ids

    async def save_session(self, session: Session) -> Path:
        return await asyncio.to_thread(self._save_sync, session)

    async def load_session(self, session_id: str) -> Optional[Session]:
        return await asyncio.to_thread(self._load_sync, session_id)

    async def session_exists(self, session_id: str) -> bool:
        return await asyncio.to_thread(self._exists_sync, session_id)

    async def list_sessions(self) -> List[str]:
        return await asyncio.to_thread(self._list_sync)
