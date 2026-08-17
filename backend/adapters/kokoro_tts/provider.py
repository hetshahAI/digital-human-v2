import time
import logging
from typing import AsyncGenerator, Optional, Dict, Any

from core.interfaces import TTSProvider
from core.streaming.StreamPacket import StreamPacket
from core.streaming.PipelineStream import PipelineStream
from config.settings import (
    KOKORO_URL, KOKORO_MODEL, KOKORO_TIMEOUT, TTS_VOICE, TTS_SAMPLE_RATE
)
from adapters.kokoro_tts.buffer import KokoroTokenChunkBuffer
from adapters.kokoro_tts.streaming import KokoroStreamClient

logger = logging.getLogger(__name__)

class KokoroTTSProvider(TTSProvider):
    """
    Kokoro-82M Ultra-Low Latency Streaming Provider.
    Implements true token-level streaming synthesis with 3-5 word / 200ms dynamic chunk flushing.
    Emits continuous 16-bit 22050Hz Linear PCM mono audio chunks.
    """
    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        voice: Optional[str] = None,
        sample_rate: Optional[int] = None,
        timeout_s: Optional[float] = None
    ):
        self.base_url = base_url or KOKORO_URL or "http://192.168.192.15:8090/v1/audio/speech"
        self.model = model or KOKORO_MODEL or "Kokoro_no_espeak_Q8"
        self.voice = voice or TTS_VOICE or "af_heart"
        self.sample_rate = sample_rate or TTS_SAMPLE_RATE or 24000
        self.timeout_s = timeout_s or KOKORO_TIMEOUT or 10.0

        self.buffer = KokoroTokenChunkBuffer(target_words=5, min_words=3, max_words=6)
        self.stream_client = KokoroStreamClient(
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
        logger.info(f"Kokoro-82M TTS Provider Initialized (Model: {self.model}, Endpoint: {self.base_url}, SampleRate: {self.sample_rate}Hz)")

    async def health(self) -> bool:
        return self.is_healthy

    async def shutdown(self) -> None:
        await self.stream_client.shutdown()
        self.is_healthy = False
        logger.info("Kokoro-82M TTS Provider Shutdown.")

    async def stream(
        self,
        session_id: str,
        text_stream: AsyncGenerator[StreamPacket, None],
        context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[StreamPacket, None]:
        seq = 0
        chunk_idx = 0
        t_stream_start = time.time()
        t_req_perf = time.perf_counter()
        first_audio_time = None
        total_audio_bytes = 0
        chunks_count = 0

        profiler = context.get("profiler") if context else None

        async for chunk_text, word_count, reason in self.buffer.process_stream(text_stream, profiler=profiler):
            if not chunk_text.strip():
                continue

            chunk_idx += 1
            async for pcm_bytes in self.stream_client.synthesize_chunk_stream(
                chunk_text,
                chunk_index=chunk_idx,
                word_count=word_count,
                chunk_reason=reason
            ):
                if pcm_bytes:
                    if first_audio_time is None:
                        first_audio_time = time.time()
                        ttfa_ms = (first_audio_time - t_stream_start) * 1000
                        logger.info(f"[TTS FIRST AUDIO {time.strftime('%H:%M:%S')}] First audio chunk emitted at {ttfa_ms:.1f}ms")
                        if profiler:
                            profiler.mark("FIRST_AUDIO_BYTE")

                    if seq == 0 and profiler:
                        profiler.mark("FIRST_PCM_FRAME")

                    total_audio_bytes += len(pcm_bytes)
                    chunks_count += 1
                    yield PipelineStream.create_packet(
                        session_id=session_id,
                        sequence=seq,
                        packet_type="tts",
                        payload=pcm_bytes,
                        is_final=False
                    )
                    seq += 1

        if profiler and chunks_count > 0:
            profiler.mark("LAST_PCM_FRAME")
            profiler.mark("TTS_FINISHED")

        total_time_ms = (time.time() - t_stream_start) * 1000
        ttfa_ms = (first_audio_time - t_stream_start) * 1000 if first_audio_time else 0.0
        avg_chunk = (total_audio_bytes / chunks_count) if chunks_count > 0 else 0.0
        req_time = (t_req_perf - (profiler.t_turn_start if profiler else t_req_perf)) * 1000

        if profiler:
            profiler.record_tts(
                request_time_ms=req_time,
                ttfa_ms=ttfa_ms,
                total_synthesis_ms=total_time_ms,
                avg_chunk_size=avg_chunk,
                chunks_count=chunks_count,
                total_bytes=total_audio_bytes
            )

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
                "chunks_produced": chunks_count,
                "average_chunk_size_bytes": avg_chunk,
                "provider": "kokoro",
                "model": self.model
            }
        )
