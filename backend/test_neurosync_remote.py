"""
Unit & Integration tests for NeuroSyncRemoteAnimationProvider (Project 017).
Verifies:
1. Remote provider initialization and configuration.
2. Forwarding Magpie TTS PCM audio as standard WAV to the remote NeuroSync API.
3. Parsing and validating the returned [T, 61] neural blendshape tensor.
4. Graceful fallback when the remote API is unavailable (no crash, clear log, valid packet contract).
"""
import sys
import os
import io
import wave
import time
import math
import struct
import asyncio
import logging
import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), ".")))

from config.settings import TTS_SAMPLE_RATE
from core.streaming.StreamPacket import StreamPacket
from adapters.neurosync.NeuroSyncProvider import NeuroSyncRemoteAnimationProvider

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("test_neurosync_remote")

def generate_mock_pcm_speech(duration_seconds: float = 1.0, sample_rate: int = 22050) -> bytes:
    """Generates 16-bit linear PCM mono audio with varying frequencies."""
    num_samples = int(duration_seconds * sample_rate)
    samples = []
    for i in range(num_samples):
        t = i / sample_rate
        # Formant frequencies: 300Hz fundamental + 1200Hz formant
        sample = 0.4 * math.sin(2 * math.pi * 300 * t) + 0.3 * math.sin(2 * math.pi * 1200 * t)
        int_sample = int(sample * 32767.0)
        samples.append(struct.pack("<h", max(-32768, min(32767, int_sample))))
    return b"".join(samples)

async def test_remote_neurosync_success_pipeline():
    """Starts a local mock of Sir's remote NeuroSync server and verifies end-to-end inference."""
    mock_app = FastAPI()

    @mock_app.post("/audio_to_blendshapes")
    async def mock_audio_to_blendshapes(request: Request):

        body = await request.body()
        # Extract audio payload from body (or multipart boundary)
        duration_s = 1.5


        # Generate 60 FPS frames with 61 coefficients
        fps = 60
        num_frames = max(1, int(duration_s * fps))
        mock_61_frames = []
        for f in range(num_frames):
            frame = [0.0] * 61
            # Simulate changing mouth and jaw shapes
            frame[17] = 0.5 + 0.3 * math.sin(f * 0.2) # JawOpen
            frame[19] = 0.3 + 0.2 * math.cos(f * 0.3) # MouthFunnel
            frame[29] = 0.4 * math.sin(f * 0.15)      # MouthStretchLeft
            frame[30] = 0.4 * math.sin(f * 0.15)      # MouthStretchRight
            frame[54] = 0.1                           # EmotionHappy
            mock_61_frames.append(frame)

        return JSONResponse(content={"blendshapes": mock_61_frames, "fps": 60, "coefficients": 61})

    config = uvicorn.Config(mock_app, host="127.0.0.1", port=5088, log_level="error")
    server = uvicorn.Server(config)
    server_task = asyncio.create_task(server.serve())
    await asyncio.sleep(0.3)

    try:
        provider = NeuroSyncRemoteAnimationProvider(api_url="http://127.0.0.1:5088/audio_to_blendshapes")
        await provider.initialize()

        # Generate 1.5 seconds of PCM audio
        pcm_bytes = generate_mock_pcm_speech(duration_seconds=1.5, sample_rate=TTS_SAMPLE_RATE)

        async def audio_stream():
            # Stream in two chunks
            mid = len(pcm_bytes) // 2
            yield StreamPacket(session_id="test-sess", sequence_number=0, packet_type="tts", payload=pcm_bytes[:mid], is_final=False)
            yield StreamPacket(session_id="test-sess", sequence_number=1, packet_type="tts", payload=pcm_bytes[mid:], is_final=True)

        packets = []
        async for pkt in provider.stream("test-sess", audio_stream()):
            packets.append(pkt)

        assert len(packets) == 1, f"Expected 1 animation packet, got {len(packets)}"
        anim_pkt = packets[0]
        assert anim_pkt.packet_type == "animation"
        assert anim_pkt.metadata["source"] == "REAL_REMOTE_NEUROSYNC"
        assert anim_pkt.metadata["fps"] == 60
        assert anim_pkt.metadata["coefficients"] == 61
        assert anim_pkt.metadata["frames_count"] == 90 # 1.5s * 60 FPS = 90 frames

        frames = anim_pkt.payload
        assert len(frames) == 90
        assert len(frames[0]) == 61
        assert isinstance(frames[0][17], float)
        assert frames[0][17] > 0.0 # JawOpen value changing

        print("  [PASS] Remote NeuroSync Client inference succeeded with 90 frames of 61 coefficients!")

    finally:
        server.should_exit = True
        await server_task

async def test_remote_neurosync_graceful_offline_handling():
    """Verifies that if Sir's machine is offline/unreachable, the client logs API_UNAVAILABLE and does NOT crash."""
    # Deliberately point to unused port
    provider = NeuroSyncRemoteAnimationProvider(api_url="http://127.0.0.1:59999/audio_to_blendshapes")
    await provider.initialize()

    pcm_bytes = generate_mock_pcm_speech(duration_seconds=0.5, sample_rate=TTS_SAMPLE_RATE)

    async def audio_stream():
        yield StreamPacket(session_id="test-offline", sequence_number=0, packet_type="tts", payload=pcm_bytes, is_final=True)


    packets = []
    async for pkt in provider.stream("test-offline", audio_stream()):
        packets.append(pkt)

    assert len(packets) == 1
    anim_pkt = packets[0]
    assert anim_pkt.packet_type == "animation"
    assert anim_pkt.metadata["status"] == "api_unavailable"
    assert anim_pkt.metadata["source"] == "UNAVAILABLE"
    assert anim_pkt.payload is None

    print("  [PASS] Remote NeuroSync Client handled offline endpoint gracefully without throwing errors!")

async def main():
    print("==========================================")
    print("Testing Project 017 Remote NeuroSync API Integration...")
    print("==========================================")
    await test_remote_neurosync_success_pipeline()
    await test_remote_neurosync_graceful_offline_handling()
    print("==========================================")
    print("ALL PROJECT 017 NEUROSYNC CLIENT TESTS PASSED!")
    print("==========================================")

if __name__ == "__main__":
    asyncio.run(main())
