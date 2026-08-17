"""
Settings module for Digital Human V2.
Loads environment variables and provides application configuration.
"""
import os
from dotenv import load_dotenv
from pathlib import Path

# Load environment variables from .env file
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# Backend Configuration
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8000))
DEBUG = os.getenv("DEBUG", "False").lower() == "true"

# ASR Configuration
ASR_MODEL_PATH = os.getenv("ASR_MODEL_PATH", "./models/asr/")
ASR_SAMPLE_RATE = int(os.getenv("ASR_SAMPLE_RATE", 16000))
ASR_CHUNK_SIZE = int(os.getenv("ASR_CHUNK_SIZE", 1024))
VAD_SILENCE_TIMEOUT_SECONDS = float(os.getenv("VAD_SILENCE_TIMEOUT_SECONDS", 1.2))


# NVIDIA ASR Cloud Configuration
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY")
NVIDIA_ASR_SERVER = os.getenv("NVIDIA_ASR_SERVER", "grpc.nvcf.nvidia.com:443")
NVIDIA_ASR_FUNCTION_ID = os.getenv("NVIDIA_ASR_FUNCTION_ID", "bb0837de-8c7b-481f-9ec8-ef5663e9c1fa")

# LLM Configuration
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "manysphere")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434")
LLM_API_URL = os.getenv("LLM_API_URL", "https://exo.manysphere.info/v1")
LLM_MODEL = os.getenv("LLM_MODEL", "mlx-community/Qwen3.6-35B-A3B-4bit")
MANYSPHERE_API_KEY = os.getenv("MANYSPHERE_API_KEY", "")
LLM_TEMPERATURE = float(os.getenv("LLM_TEMPERATURE", 0.7))
LLM_MAX_TOKENS = int(os.getenv("LLM_MAX_TOKENS", 128))


# TTS Configuration
TTS_PROVIDER = os.getenv("TTS_PROVIDER", "kokoro")
TTS_MODEL_PATH = os.getenv("TTS_MODEL_PATH", "./models/tts/")
TTS_SAMPLE_RATE = int(os.getenv("TTS_SAMPLE_RATE", 24000))
TTS_VOICE = os.getenv("TTS_VOICE", "af_heart")

# Kokoro-82M TTS Configuration (Final TTS Provider)
KOKORO_URL = os.getenv("KOKORO_URL", "http://192.168.192.15:8090/v1/audio/speech")
KOKORO_MODEL = os.getenv("KOKORO_MODEL", "Kokoro_no_espeak_Q8")
KOKORO_TIMEOUT = float(os.getenv("KOKORO_TIMEOUT", 10.0))

# Qwen3-TTS Configuration (Fallback)
QWEN_TTS_URL = os.getenv("QWEN_TTS_URL", "http://127.0.0.1:8080/v1/audio/speech")
QWEN_TTS_MODEL = os.getenv("QWEN_TTS_MODEL", "qwen3-tts-flash")
QWEN_TTS_TIMEOUT = float(os.getenv("QWEN_TTS_TIMEOUT", 10.0))

# NVIDIA Magpie TTS Configuration (Deprecated / Fallback)
NVIDIA_TTS_SERVER = os.getenv("NVIDIA_TTS_SERVER", "grpc.nvcf.nvidia.com:443")
NVIDIA_TTS_FUNCTION_ID = os.getenv("NVIDIA_TTS_FUNCTION_ID", "877104f7-e885-42b9-8de8-f6e4c6303969")
NVIDIA_TTS_MODEL = os.getenv("NVIDIA_TTS_MODEL", "Magpie-Multilingual.EN-US.Sofia")


# Avatar Configuration
AVATAR_MODEL_PATH = os.getenv("AVATAR_MODEL_PATH", "./models/avatar/")
DEFAULT_VRM_MODEL = os.getenv("DEFAULT_VRM_MODEL", "./assets/avatars/default.vrm")

# Animation Configuration
ANIMATION_FPS = int(os.getenv("ANIMATION_FPS", 30))
BLEND_SHAPES_COUNT = int(os.getenv("BLEND_SHAPES_COUNT", 52))

# Streaming Configuration
WEBSOCKET_HEARTBEAT = int(os.getenv("WEBSOCKET_HEARTBEAT", 30))
STREAM_BUFFER_SIZE = int(os.getenv("STREAM_BUFFER_SIZE", 4096))

# Security
SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-here")
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "*").split(",")
CORS_ORIGINS = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:5173,http://127.0.0.1:5173"
).split(",")

# Provider Configuration
ASR_PROVIDER = os.getenv("ASR_PROVIDER", "nvidia")
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "manysphere")
TTS_PROVIDER = os.getenv("TTS_PROVIDER", "kokoro")
ANIMATION_PROVIDER = os.getenv("ANIMATION_PROVIDER", "neurosync")

# NeuroSync Remote API Configuration
NEUROSYNC_API_URL = os.getenv("NEUROSYNC_API_URL", "http://127.0.0.1:5000/audio_to_blendshapes")


# Conversation & Storage Configuration
DATA_DIR = Path(os.getenv("DATA_DIR", BASE_DIR / "data"))
CONVERSATIONS_DIR = Path(os.getenv("CONVERSATIONS_DIR", DATA_DIR / "conversations"))


# Validate required settings in production
if not DEBUG:
    if SECRET_KEY == "your-secret-key-here":
        raise ValueError("SECRET_KEY must be set in production")