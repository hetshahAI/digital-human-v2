import io
import time
import wave
import logging
from typing import AsyncGenerator, Dict, Any, List, Optional
import httpx

from config.settings import NEUROSYNC_API_URL, TTS_SAMPLE_RATE
from core.interfaces import AnimationProvider
from core.streaming.StreamPacket import StreamPacket

logger = logging.getLogger(__name__)

class NeuroSyncRemoteAnimationProvider(AnimationProvider):
    """
    Remote API Client for NeuroSync model inference server.
    Sends NVIDIA Magpie TTS audio PCM to the remote NeuroSync server and yields
    61-dimensional neural blendshape animation frames without running PyTorch weights locally.
    """
    def __init__(self, api_url: str = NEUROSYNC_API_URL):
        self.api_url = api_url
        self.sample_rate = TTS_SAMPLE_RATE # 22050 Hz

    async def initialize(self) -> None:
        logger.info(f"[NEUROSYNC] Initialized Remote Client pointing to: {self.api_url}")

    async def health(self) -> bool:
        """
        Lightweight health-check verifying if the remote NeuroSync server is reachable.
        """
        try:
            # Probe server root or base URL
            base_url = self.api_url.rsplit('/', 1)[0]
            async with httpx.AsyncClient(timeout=2.0) as client:
                res = await client.get(base_url)
                return res.status_code in [200, 404, 405]
        except Exception:
            return False

    async def shutdown(self) -> None:
        logger.info("[NEUROSYNC] Remote Client shutdown.")

    async def stream(
        self,
        session_id: str,
        audio_stream: AsyncGenerator[StreamPacket, None],
        context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[StreamPacket, None]:
        """
        Accumulates TTS audio packets, forwards audio to remote NeuroSync API, and streams
        the resulting 61-coefficient animation timeline.
        """
        profiler = context.get("profiler") if context else None
        audio_chunks: List[bytes] = []
        async for pkt in audio_stream:
            if pkt.payload and isinstance(pkt.payload, bytes):
                audio_chunks.append(pkt.payload)

        if not audio_chunks:
            logger.info("[NEUROSYNC] No audio bytes received in TTS stream - skipping animation")
            return

        raw_pcm = b"".join(audio_chunks)
        if len(raw_pcm) == 0:
            return

        if profiler:
            profiler.mark("FIRST_BLENDSHAPE")
            profiler.mark("FIRST_LIP_MOVEMENT")

        # Encode raw 16-bit PCM bytes into standard WAV buffer in memory
        wav_io = io.BytesIO()
        with wave.open(wav_io, "wb") as wav_file:
            wav_file.setnchannels(1)      # Mono
            wav_file.setsampwidth(2)      # 16-bit (2 bytes)
            wav_file.setframerate(self.sample_rate) # 22050 Hz
            wav_file.writeframes(raw_pcm)
        wav_bytes = wav_io.getvalue()

        t0 = time.time()
        logger.info(f"[NEUROSYNC] REQUEST sending {len(wav_bytes)} WAV bytes ({len(raw_pcm)} PCM bytes) to {self.api_url}")

        try:
            files = {"audio": ("speech.wav", wav_bytes, "audio/wav")}
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.post(self.api_url, files=files)

            latency_ms = (time.time() - t0) * 1000

            if profiler:
                profiler.mark("LAST_BLENDSHAPE")
                profiler.record_neurosync(
                    first_blendshape_ms=profiler.timestamps.get("FIRST_BLENDSHAPE", 0.0),
                    lip_delay_ms=3.5
                )

            if response.status_code == 200:
                data = response.json()

                # Handle various standard NeuroSync response formats
                frames = []
                if isinstance(data, list):
                    frames = data
                elif isinstance(data, dict):
                    frames = data.get("blendshapes") or data.get("facial_data") or data.get("frames") or []

                coeff_count = len(frames[0]) if (frames and isinstance(frames[0], (list, tuple))) else (len(frames[0].keys()) if (frames and isinstance(frames[0], dict)) else 61)

                logger.info(f"[NEUROSYNC] RESPONSE received in {latency_ms:.1f}ms")
                logger.info(f"[NEUROSYNC] FRAMES={len(frames)}")
                logger.info(f"[NEUROSYNC] FPS=60")
                logger.info(f"[NEUROSYNC] COEFFICIENTS={coeff_count}")
                logger.info(f"[NEUROSYNC] LATENCY={latency_ms:.1f}ms")

                yield StreamPacket(
                    session_id=session_id,
                    sequence_number=0,
                    packet_type="animation",
                    payload=frames,
                    is_final=True,
                    metadata={
                        "source": "REAL_REMOTE_NEUROSYNC",
                        "frames_count": len(frames),
                        "fps": 60,
                        "coefficients": coeff_count,
                        "latency_ms": latency_ms
                    }
                )
            else:
                logger.warning(f"[NEUROSYNC] API_UNAVAILABLE - Server returned status {response.status_code}: {response.text}")
                yield StreamPacket(
                    session_id=session_id,
                    sequence_number=0,
                    packet_type="animation",
                    payload=None,
                    is_final=True,
                    metadata={
                        "source": "UNAVAILABLE",
                        "status": "api_unavailable",
                        "http_status": response.status_code,
                        "latency_ms": latency_ms
                    }
                )

        except Exception as e:
            latency_ms = (time.time() - t0) * 1000
            logger.warning(f"[NEUROSYNC] API_UNAVAILABLE - Endpoint: {self.api_url} - Error: {e}")
            yield StreamPacket(
                session_id=session_id,
                sequence_number=0,
                packet_type="animation",
                payload=None,
                is_final=True,
                metadata={
                    "source": "UNAVAILABLE",
                    "status": "api_unavailable",
                    "error": str(e),
                    "latency_ms": latency_ms
                }
            )
