import time
import logging
from typing import AsyncGenerator, Optional, Dict, Any

from core.interfaces import TTSProvider
from core.streaming.StreamPacket import StreamPacket
from core.streaming.PipelineStream import PipelineStream
from config.settings import (
    QWEN_TTS_URL, QWEN_TTS_MODEL, QWEN_TTS_TIMEOUT, TTS_VOICE, TTS_SAMPLE_RATE
)
from adapters.qwen_tts.buffer import TokenChunkBuffer
from adapters.qwen_tts.streaming import QwenTTSStreamClient

logger = logging.getLogger(__name__)

class Qwen3TTSProvider(TTSProvider):
    """
    Qwen3-TTS Ultra-Low Latency Streaming Provider.
    Implements true token-level streaming with 3-5 word / 250ms dynamic chunk flushing.
    """
    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        voice: Optional[str] = None,
        sample_rate: Optional[int] = None,
        timeout_s: Optional[float] = None
    ):
        self.base_url = base_url or QWEN_TTS_URL or "http://127.0.0.1:8080/v1/audio/speech"
        self.model = model or QWEN_TTS_MODEL or "qwen3-tts-flash"
        self.voice = voice or TTS_VOICE or "alicia"
        self.sample_rate = sample_rate or TTS_SAMPLE_RATE or 22050
        self.timeout_s = timeout_s or QWEN_TTS_TIMEOUT or 10.0

        self.buffer = TokenChunkBuffer(min_words=3, max_words=5, timeout_s=0.250)
        self.stream_client = QwenTTSStreamClient(
            base_url=self.base_url,
            model=self.model,
            voice=self.voice,
            sample_rate=self.sample_rate,
            timeout_s=self.timeout_s
        )
        self.is_healthy = False

    async def initialize(self) -> None:
        await self.stream_client.initialize()
        self.is_healthy = True
        logger.info(f"Qwen3-TTS Provider Initialized (Model: {self.model}, Endpoint: {self.base_url}, SampleRate: {self.sample_rate}Hz)")

    async def health(self) -> bool:
        return self.is_healthy

    async def shutdown(self) -> None:
        await self.stream_client.shutdown()
        self.is_healthy = False
        logger.info("Qwen3-TTS Provider Shutdown.")

    async def stream(
        self,
        session_id: str,
        text_stream: AsyncGenerator[StreamPacket, None]
    ) -> AsyncGenerator[StreamPacket, None]:
        seq = 0
        t_stream_start = time.time()
        first_audio_time = None
        total_audio_bytes = 0

        async for chunk_text, word_count, reason in self.buffer.process_stream(text_stream):
            if not chunk_text.strip():
                continue

            async for pcm_bytes in self.stream_client.synthesize_chunk_stream(chunk_text):
                if pcm_bytes:
                    if first_audio_time is None:
                        first_audio_time = time.time()
                        ttfa_ms = (first_audio_time - t_stream_start) * 1000
                        logger.info(f"[TTS FIRST AUDIO {time.strftime('%H:%M:%S')}] First audio chunk emitted at {ttfa_ms:.1f}ms")

                    total_audio_bytes += len(pcm_bytes)
                    yield PipelineStream.create_packet(
                        session_id=session_id,
                        sequence=seq,
                        packet_type="tts",
                        payload=pcm_bytes,
                        is_final=False
                    )
                    seq += 1

        total_time_ms = (time.time() - t_stream_start) * 1000
        ttfa_ms = (first_audio_time - t_stream_start) * 1000 if first_audio_time else 0.0

        yield StreamPacket(
            session_id=session_id,
            sequence_number=seq,
            packet_type="tts",
            payload=b"",
            is_final=True,
            metadata={
                "time_to_first_audio_ms": ttfa_ms,
                "total_generation_time_ms": total_time_ms,
                "bytes_streamed": total_audio_bytes,
                "provider": "qwen3-tts",
                "model": self.model
            }
        )
