import logging
from core.streaming.StreamPacket import StreamPacket

logger = logging.getLogger(__name__)

class PipelineStream:
    @staticmethod
    def create_packet(
        session_id: str, 
        sequence: int, 
        packet_type: str, 
        payload: any, 
        is_final: bool = False
    ) -> StreamPacket:
        return StreamPacket(
            session_id=session_id,
            sequence_number=sequence,
            packet_type=packet_type,
            payload=payload,
            is_final=is_final
        )
