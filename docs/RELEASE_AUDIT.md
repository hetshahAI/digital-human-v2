# Digital Human V2 - Release Audit

## Current Architecture
The repository implements a real-time conversational AI digital human. 
- **Frontend**: A Vite-based Single Page Application (SPA) using React/Three.js and `@pixiv/three-vrm` to render a 3D avatar in the browser. Employs WebAudio API and WebSockets for low-latency audio transmission and lip-syncing (visemes).
- **Backend**: A FastAPI server bridging WebSocket connections. It orchestrates a streaming pipeline across multiple adapter components (GatewayManager -> ASR -> LLM -> TTS -> Animation).
- **Microservices/External**: 
  - `neurosync_core`: A submodule/folder for audio-to-blendshapes processing.
  - LLM powered via ManySphere API or local Ollama.
  - Streaming ASR via NVIDIA API (`grpc.nvcf.nvidia.com`).
  - TTS powered via Kokoro or Qwen3 running locally/remotely.

## Important Directories
- `/backend/` - FastAPI server, configuration, pipelines, and adapters.
- `/backend/adapters/` - Provider integrations (NVIDIA, ManySphere, Kokoro TTS, NeuroSync).
- `/backend/core/` - Data models and conversation state management.
- `/frontend/` - Vite frontend codebase including Three.js/VRM logic and client assets.
- `/frontend/src/` - Production client source (React/TS).
- `/frontend/public/` - Raw HTML smoke tests, avatars (`avatar.vrm`), and static assets.
- `/neurosync_core/` - Python package for providing character animation/lip-synchronization (`audio_to_blendshapes`).
- `/docs/` - Documentation and media.

## Required Components
- `backend/main.py`, `backend/core/`, `backend/adapters/` (active providers).
- `backend/config/settings.py` for routing.
- `frontend/src/` and `frontend/package.json` for client rendering.
- `frontend/public/avatar.vrm`.
- `neurosync_core/` for the blendshape API running as a separate service depending on `ANIMATION_PROVIDER`.

## Optional Components
- `backend/adapters/dummy/` - Mock adapter (can be safely removed).
- `frontend/public/test_mic.html` - Raw WebSocket smoke test.
- `logs/` and `backend/logs/`.
- `backend/validation_report.md`, `backend/prosody_validation_report.md`.

## Files Safe to Remove
- `PROJECT_036_PROsody_aware_streaming.md`
- `latency_audit_report.md`
- `patch_scene_materials.py`
- `test.py`
- `test_audio.wav`
- `fetch_functions.py`
- `functions.txt`
- `frontend/src/patch_*.cjs`, `frontend/src/patch_*.py`, `frontend/src/update_avatar_controller.cjs` (development scripts with hardcoded Windows absolute paths).
- `backend/patch_*.py`
- `backend/print_chunks.py`, `backend/probe_*.py`
- `backend/smoke_test.py`
- Development test scripts (`backend/test_*.py`) depending on deployment needs.
- Cache directories (`.pytest_cache`, `__pycache__`).

## Files That Must Remain
- `backend/main.py`
- `backend/config/settings.py`
- `backend/core/*` 
- `backend/adapters/` (nvidia, manysphere, kokoro_tts, neurosync, ollama).
- `frontend/package.json`, `frontend/vite.config.ts`, `frontend/index.html`.
- `frontend/src/main.ts`, `frontend/src/style.css`.
- `frontend/src/avatar/`, `frontend/src/scene/`
- `.env.example`, `requirements.txt` / `backend/requirements.txt`

## Environment Variables
- `HOST`, `PORT`, `DEBUG`
- `ASR_PROVIDER` (`NVIDIA_API_KEY`, `NVIDIA_ASR_SERVER`, `ASR_MODEL_PATH`)
- `LLM_PROVIDER` (`MANYSPHERE_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`)
- `TTS_PROVIDER` (`KOKORO_URL`, `KOKORO_MODEL`, `TTS_VOICE`)
- `ANIMATION_PROVIDER` (`NEUROSYNC_API_URL`)
- `CORS_ORIGINS`, `ALLOWED_HOSTS`

## External Services
- **NVIDIA Riva Cloud / Nemotron API** for ASR/TTS.
- **ManySphere / EXO API** for LLM completions.
- **Ollama** (Local/remote).
- **Kokoro Server** / **Qwen3 Server** (TTS generation).
- **NeuroSync API** (Remote lip-sync).

## Known Machine-Specific Assumptions
- Hardcoded local IP addresses found in `backend/config/settings.py`, `backend/.env`, and `backend/adapters/kokoro_tts/streaming.py` targeting `http://192.168.192.15:8090/v1/audio/speech` (Kokoro TTS).
- Hardcoded local IP found in `backend/live_contract_test.py` targeting `http://192.168.192.33:5001`.
- Numerous patched helper files (`frontend/src/patch_*.cjs`) using machine-specific path `C:/Users/Het Shah/Desktop/digital_human/...`.
- `fetch_functions.py` contains an exposed hardcoded NVIDIA API Key (patched during phase 2).

## Current Startup Procedure
1. Create a `.env` in `backend/` mirroring `.env.example`.
2. Start the Backend:
   ```bash
   cd backend
   python -m venv venv
   venv/Scripts/activate # Windows
   pip install -r requirements.txt
   uvicorn main:app --host 0.0.0.0 --port 8000
   ```
3. Start the Frontend:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
