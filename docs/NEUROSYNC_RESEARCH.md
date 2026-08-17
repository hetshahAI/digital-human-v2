# NEUROSYNC RESEARCH & FORENSIC DISCOVERY REPORT
**Project 017 — Real-Time Human Facial / Lip Synchronization**
*Document Version: 1.0.0 | Date: 2026-08-13*

---

## 1. Current Official Source
- **Primary Model Repository**: Hosted on Hugging Face at [`https://huggingface.co/convaitech/NEUROSYNC`](https://huggingface.co/convaitech/NEUROSYNC) (Redirected from previous handles `AnimaVR/NEUROSYNC` and `AnimaVR/NEUROSYNC_Audio_To_Face_Blendshape`).
- **Maintained Implementation Repository**: [`https://github.com/its-DeFine/NeuroSync-Core`](https://github.com/its-DeFine/NeuroSync-Core) (Active, verified HTTP 200).
- **Referenced Ecosystem Implementations**: [`https://github.com/skykim/rag-npc-unity`](https://github.com/skykim/rag-npc-unity) (Verified HTTP 200) and [`https://github.com/keb77/LocalAIForNPCs`](https://github.com/keb77/LocalAIForNPCs) (Verified HTTP 200).
- **Status of Legacy AnimaVR Repository**: [`https://github.com/AnimaVR/NeuroSync_Local_API`](https://github.com/AnimaVR/NeuroSync_Local_API) returns **HTTP 404** (the original repository was removed/renamed when the project transferred to Convai).

---

## 2. Current Working Repository URL
- **Active Core Repository**: [`https://github.com/its-DeFine/NeuroSync-Core`](https://github.com/its-DeFine/NeuroSync-Core)
- **Active Unity NPC Repository**: [`https://github.com/skykim/rag-npc-unity`](https://github.com/skykim/rag-npc-unity)
- **Active Unreal Engine Plugin**: [`https://github.com/keb77/LocalAIForNPCs`](https://github.com/keb77/LocalAIForNPCs)

---

## 3. Model URL
- **Model Checkpoint**: [`https://huggingface.co/convaitech/NEUROSYNC`](https://huggingface.co/convaitech/NEUROSYNC)
- **Download Endpoint**: `https://huggingface.co/convaitech/NEUROSYNC/resolve/main/model.pth`

---

## 4. Local API / Inference Method
- **Server Framework**: Python Flask API server (`neurosync/server/app.py` or standalone `neurosync_local_api.py`).
- **Endpoints**:
  - `POST /audio_to_blendshapes`: Accepts raw WAV/PCM audio bytes; returns a 60 FPS JSON array of blendshape parameter vectors.
  - `POST /text_to_blendshapes`: Accepts text prompt; performs TTS synthesis and outputs both synchronized audio and blendshape timeline.

---

## 5. Model File Name
- `model.pth`

---

## 6. Model Size
- **Total Storage on Hugging Face**: **18,187,672,731 bytes (~18.18 GB)** (managed via Git LFS).

---

## 7. License
- **Dual Licensing Model**:
  - **MIT License**: For individuals, researchers, and commercial businesses earning **under $1,000,000 USD per year**.
  - **Commercial Enterprise License**: Required for businesses earning **$1,000,000 USD or more per year**.

---

## 8. Access Requirements
- **Gated Repository**: The Hugging Face model `convaitech/NEUROSYNC` is configured with `"gated": "auto"`.
- **Authentication**: Requires a valid Hugging Face User Access Token (`HF_TOKEN`) and user agreement on the Hugging Face model card to download `model.pth`.

---

## 9. Dependencies
```txt
torch>=2.0.0
torchvision>=0.15.0
librosa>=0.10.0
sounddevice>=0.4.6
pydub>=0.25.1
scipy>=1.10.0
numpy>=1.24.4
flask>=2.3.3
Flask-Cors>=4.0
transformers>=4.30.0
huggingface-hub>=0.24.0
```

---

## 10. Audio Input Specification
- **Audio Format**: Mono Linear PCM (16-bit or 32-bit float).
- **Internal Processing Sample Rate**: **$88,200\text{ Hz}$** (audio inputs at 16kHz, 22.05kHz, or 44.1kHz are resampled to $88.2\text{kHz}$ during preprocessing).

---

## 11. Preprocessing
- **Resampling**: Target audio is resampled to $88,200\text{ Hz}$.
- **Feature Extraction**:
  - Window size: $128$ frames.
  - Time resolution: $60\text{ FPS}$ ($16.66\text{ms}$ interval per animation frame).
  - Acoustic Features: Windowed **Mel-Frequency Cepstral Coefficients (MFCC)** + **Zero Crossing Rate (ZCR)** yielding a 256-dimensional feature vector per frame.

---

## 12. Model Architecture
- **Type**: Sequence-to-Sequence (Seq2Seq) Transformer Neural Network.
- **Encoder**: 4 to 8 Transformer Encoder layers (`input_dim=256`, `hidden_dim=1024`, `num_heads=4` or `16`, `Rotary Positional Embedding / RoPE`).
- **Decoder**: 4 to 8 Transformer Decoder layers (`output_dim=61` or `68`, `hidden_dim=1024`, `num_heads=4` or `16`).

---

## 13. Output Shape
- **Tensor Dimensions**: $[B, T, 61]$ where:
  - $B = 1$ (batch size)
  - $T = \text{number of } 60\text{ FPS frames}$ ($T \approx \text{Audio Duration in seconds} \times 60$)
  - Dimension $61$: Continuous float coefficients normalized to $[0.0, 1.0]$.

---

## 14. Output Coefficient Order (61 Blendshape Channels)
1. **Apple ARKit Standard 52 Facial Blendshapes (Indices 0–51)**:
   - *Eyes/Brows*: `EyeBlinkLeft`, `EyeLookDownLeft`, `EyeLookInLeft`, `EyeLookOutLeft`, `EyeLookUpLeft`, `EyeSquintLeft`, `EyeWideLeft`, `EyeBlinkRight`, `EyeLookDownRight`, `EyeLookInRight`, `EyeLookOutRight`, `EyeLookUpRight`, `EyeSquintRight`, `EyeWideRight`, `BrowDownLeft`, `BrowDownRight`, `BrowInnerUp`, `BrowOuterUpLeft`, `BrowOuterUpRight`.
   - *Jaw*: `JawForward`, `JawLeft`, `JawRight`, `JawOpen`.
   - *Mouth/Lips*: `MouthClose`, `MouthFunnel`, `MouthPucker`, `MouthLeft`, `MouthRight`, `MouthSmileLeft`, `MouthSmileRight`, `MouthFrownLeft`, `MouthFrownRight`, `MouthDimpleLeft`, `MouthDimpleRight`, `MouthStretchLeft`, `MouthStretchRight`, `MouthRollLower`, `MouthRollUpper`, `MouthShrugLower`, `MouthShrugUpper`, `MouthPressLeft`, `MouthPressRight`, `MouthLowerDownLeft`, `MouthLowerDownRight`, `MouthUpperUpLeft`, `MouthUpperUpRight`.
   - *Cheeks/Nose/Tongue*: `CheekPuff`, `CheekSquintLeft`, `CheekSquintRight`, `NoseSneerLeft`, `NoseSneerRight`, `TongueOut`.
2. **Head & Emotion Auxiliary Tracks (Indices 52–60)**:
   - *Head Rotation*: `HeadPitch`, `HeadRoll`.
   - *Emotion Vectors*: `EmotionHappy`, `EmotionSad`, `EmotionAngry`, `EmotionSurprised`, `EmotionFear`, `EmotionDisgust`, `EmotionContempt`.

---

## 15. Streaming / Causal Support
- **Supported**: Uses a rolling sliding window of 128 frames ($\approx 2.13\text{ seconds}$) with causal overlap-add stride, allowing continuous streaming chunk processing as Magpie TTS yields audio.

---

## 16. CUDA Support
- **Supported**: Fully optimized for NVIDIA CUDA (`torch.cuda.is_available()`, float16 half-precision supported on RTX cards).

---

## 17. Windows Support
- **Supported**: Compatible with Windows 10/11 using Python virtual environments (`venv` or `conda`).

---

## 18. Exact Local Start Command
```bash
# In the NeuroSync environment:
python -m neurosync.server.app
# Server starts on http://127.0.0.1:5000 (or custom port via PORT=8881)
```

---

## 19. Exact Test Request
```bash
curl -X POST -F "audio=@test.wav" http://127.0.0.1:5000/audio_to_blendshapes
```

---

## 20. How to Connect It to Our Existing Pipeline
1. **TTS Output Capture**: In `backend/adapters/nvidia/tts.py`, NVIDIA Magpie TTS streams 22,050 Hz PCM chunks.
2. **Neural Inference Relay**:
   - `GatewayManager` sends PCM chunks to the local NeuroSync service (`http://127.0.0.1:5000/audio_to_blendshapes`) or evaluates `model.pth` in-process.
   - NeuroSync produces 60 FPS timestamped 61-float blendshape arrays.
3. **Transport**: Delivered over `/ws/asr` WebSocket via `StreamPacket(packet_type="animation", payload=blendshapes, metadata={"scheduled_time": ...})`.
4. **VRM Mapping**: `frontend/src/avatar/controllers/NeuroSyncAdapter.ts` maps ARKit indices directly to `@pixiv/three-vrm` expressions.
5. **Timeline Locking**: `frontend/src/avatar/controllers/NeuroSyncController.ts` locks animation updates to `AudioContext.currentTime`.

---

## 21. Risks / Blockers
1. **Model Weight Size**: Checkpoint file repository is **~18.18 GB**, requiring substantial disk space and download bandwidth.
2. **Hugging Face Authentication**: The model repository `convaitech/NEUROSYNC` is gated (`HTTP 401` without an authenticated token and user license agreement on Hugging Face).
3. **Legacy Repo 404**: The original `AnimaVR/NeuroSync_Local_API` repository is no longer accessible; the maintained working source is `its-DeFine/NeuroSync-Core`.

---

## 22. Sources with Verified URLs
- **Official Hugging Face Model**: [`https://huggingface.co/convaitech/NEUROSYNC`](https://huggingface.co/convaitech/NEUROSYNC)
- **Hugging Face Model API Metadata**: [`https://huggingface.co/api/models/convaitech/NEUROSYNC`](https://huggingface.co/api/models/convaitech/NEUROSYNC)
- **Verified Working Core GitHub Repository**: [`https://github.com/its-DeFine/NeuroSync-Core`](https://github.com/its-DeFine/NeuroSync-Core)
- **Verified Working Unity Implementation**: [`https://github.com/skykim/rag-npc-unity`](https://github.com/skykim/rag-npc-unity)
- **Verified Working Unreal Plugin Integration**: [`https://github.com/keb77/LocalAIForNPCs`](https://github.com/keb77/LocalAIForNPCs)
- **Deprecated / 404 Repository**: [`https://github.com/AnimaVR/NeuroSync_Local_API`](https://github.com/AnimaVR/NeuroSync_Local_API) *(Status: 404 Not Found)*
