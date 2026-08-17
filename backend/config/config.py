"""
Configuration module for Digital Human V2.
Imports and exports settings for application configuration.
"""
from .settings import (
    HOST, PORT, DEBUG,
    ASR_MODEL_PATH, ASR_SAMPLE_RATE, ASR_CHUNK_SIZE,
    LLM_BASE_URL, LLM_MODEL, LLM_TEMPERATURE, LLM_MAX_TOKENS,
    TTS_MODEL_PATH, TTS_SAMPLE_RATE, TTS_VOICE,
    AVATAR_MODEL_PATH, DEFAULT_VRM_MODEL,
    ANIMATION_FPS, BLEND_SHAPES_COUNT,
    WEBSOCKET_HEARTBEAT, STREAM_BUFFER_SIZE,
    SECRET_KEY, ALLOWED_HOSTS, CORS_ORIGINS
)

# Configuration can be extended here with computed values or validation