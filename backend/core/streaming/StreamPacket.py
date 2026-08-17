from pydantic import BaseModel, Field
from typing import Any, Dict, Optional
import time

class StreamPacket(BaseModel):
    session_id: str
    sequence_number: int
    timestamp: float = Field(default_factory=time.time)
    packet_type: str  # 'asr', 'llm', 'tts', 'animation', 'system'
    payload: Any
    is_final: bool = False
    metadata: Dict[str, Any] = Field(default_factory=dict)
