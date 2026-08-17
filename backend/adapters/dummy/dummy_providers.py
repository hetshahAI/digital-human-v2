from core.interfaces import ASRProvider, LLMProvider, TTSProvider, AnimationProvider
from core.streaming.PipelineStream import PipelineStream
from core.streaming.StreamPacket import StreamPacket
import logging
from typing import Optional, Dict, Any, AsyncGenerator
import asyncio

logger = logging.getLogger(__name__)

class DummyASR(ASRProvider):
    async def initialize(self): logger.info("DummyASR initialized")
    async def health(self): return True
    async def shutdown(self): logger.info("DummyASR shutdown")
    async def stream(self, session_id: str, audio_stream: AsyncGenerator[bytes, None]) -> AsyncGenerator[StreamPacket, None]:
        seq = 0
        async for _ in audio_stream:
            for text in ["Hel", "Hello", "Hello world"]:
                await asyncio.sleep(0.1)
                yield PipelineStream.create_packet(session_id, seq, "asr", text, is_final=(text == "Hello world"))
                seq += 1

class DummyLLM(LLMProvider):
    async def initialize(self): logger.info("DummyLLM initialized")
    async def health(self): return True
    async def shutdown(self): logger.info("DummyLLM shutdown")
    async def stream(self, session_id: str, text_stream: AsyncGenerator[StreamPacket, None], context: Optional[Dict[str, Any]] = None) -> AsyncGenerator[StreamPacket, None]:
        seq = 0
        async for packet in text_stream:
            if not packet.is_final: continue
            for text in ["This", "This is", "This is a streaming response."]:
                await asyncio.sleep(0.1)
                yield PipelineStream.create_packet(session_id, seq, "llm", text, is_final=(text == "This is a streaming response."))
                seq += 1

class DummyTTS(TTSProvider):
    async def initialize(self): logger.info("DummyTTS initialized")
    async def health(self): return True
    async def shutdown(self): logger.info("DummyTTS shutdown")
    async def stream(self, session_id: str, text_stream: AsyncGenerator[StreamPacket, None]) -> AsyncGenerator[StreamPacket, None]:
        seq = 0
        async for packet in text_stream:
            await asyncio.sleep(0.05)
            yield PipelineStream.create_packet(session_id, seq, "tts", b"audio_chunk_for_" + packet.payload.encode(), is_final=packet.is_final)
            seq += 1

class DummyAnimation(AnimationProvider):
    async def initialize(self): logger.info("DummyAnimation initialized")
    async def health(self): return True
    async def shutdown(self): logger.info("DummyAnimation shutdown")
    async def stream(self, session_id: str, audio_stream: AsyncGenerator[StreamPacket, None]) -> AsyncGenerator[StreamPacket, None]:
        seq = 0
        async for packet in audio_stream:
            await asyncio.sleep(0.01)
            yield PipelineStream.create_packet(session_id, seq, "animation", {"blendshapes": {"jawOpen": 1.0}}, is_final=packet.is_final)
            seq += 1
