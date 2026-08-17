from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

class PipelineMetrics(BaseModel):
    start_time: datetime = Field(default_factory=datetime.utcnow)
    end_time: Optional[datetime] = None
    duration_ms: float = 0.0
    provider_latencies: Dict[str, float] = Field(default_factory=dict)
    errors: List[str] = Field(default_factory=list)

class StreamMetrics(BaseModel):
    time_to_first_packet_ms: float = 0.0
    time_to_final_packet_ms: float = 0.0
    packets_per_second: float = 0.0
    average_packet_size_bytes: float = 0.0
    total_packets: int = 0

class PipelineRequest(BaseModel):
    session_id: str
    audio_data: Optional[bytes] = None
    text_input: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)

class PipelineResponse(BaseModel):
    session_id: str
    text_reply: Optional[str] = None
    audio_reply: Optional[bytes] = None
    animation_data: Optional[Dict[str, Any]] = None
    metrics: PipelineMetrics = Field(default_factory=PipelineMetrics)
