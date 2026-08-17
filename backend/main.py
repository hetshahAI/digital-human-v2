import time
import logging
import json
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
from contextlib import asynccontextmanager

from config.settings import (
    CORS_ORIGINS, DEBUG, HOST, PORT,
    ASR_PROVIDER, LLM_PROVIDER, TTS_PROVIDER, ANIMATION_PROVIDER
)
from services.gateway.GatewayManager import GatewayManager
from core.models import PipelineRequest
from core.conversation.SessionState import SessionState
from core.conversation.ConversationManager import ConversationManager
from api.conversation import router as conversation_router, set_conversation_manager

# Setup Logging
logging.basicConfig(
    level=logging.INFO if not DEBUG else logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)

# Dependency Injection Factory
def create_providers():
    asr = llm = tts = anim = None
    if ASR_PROVIDER == "dummy":
        from adapters.dummy.dummy_providers import DummyASR
        asr = DummyASR()
    elif ASR_PROVIDER == "nvidia":
        from adapters.nvidia.asr import NvidiaStreamingASR
        asr = NvidiaStreamingASR()
        
    if LLM_PROVIDER == "dummy":
        from adapters.dummy.dummy_providers import DummyLLM
        llm = DummyLLM()
    elif LLM_PROVIDER == "manysphere":
        from adapters.manysphere.llm import ManySphereLLMProvider
        llm = ManySphereLLMProvider()
    elif LLM_PROVIDER == "ollama":
        from adapters.ollama.llm import OllamaStreamingLLM
        llm = OllamaStreamingLLM()

    if TTS_PROVIDER == "kokoro":
        from adapters.kokoro_tts.provider import KokoroTTSProvider
        tts = KokoroTTSProvider()
    elif TTS_PROVIDER == "dummy":
        from adapters.dummy.dummy_providers import DummyTTS
        tts = DummyTTS()
    elif TTS_PROVIDER == "qwen3":
        from adapters.qwen_tts.provider import Qwen3TTSProvider
        tts = Qwen3TTSProvider()
    elif TTS_PROVIDER == "nvidia":
        from adapters.nvidia.tts import NvidiaStreamingTTSProvider
        tts = NvidiaStreamingTTSProvider()

    if ANIMATION_PROVIDER == "dummy":
        from adapters.dummy.dummy_providers import DummyAnimation
        anim = DummyAnimation()
    elif ANIMATION_PROVIDER == "neurosync":
        from adapters.neurosync.NeuroSyncProvider import NeuroSyncRemoteAnimationProvider
        anim = NeuroSyncRemoteAnimationProvider()
    return asr, llm, tts, anim


conversation_manager = ConversationManager()
set_conversation_manager(conversation_manager)

asr, llm, tts, anim = create_providers()
gateway = GatewayManager(
    asr_provider=asr,
    llm_provider=llm,
    tts_provider=tts,
    animation_provider=anim,
    conversation_manager=conversation_manager
)

# Lifespan context manager for startup and shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up Digital Human V2 ..")
    await gateway.initialize()
    yield
    await gateway.shutdown()
    logger.info("Shutting down Digital Human V2 ..")

app = FastAPI(
    title="Digital Human V2",
    version="0.1.0",
    debug=DEBUG,
    lifespan=lifespan
)

# Include Routers
app.include_router(conversation_router)


# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Timing Middleware
@app.middleware("http")
async def request_timing_middleware(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(process_time)
    logger.info(f"{request.method} {request.url.path} completed in {process_time:.4f}s")
    return response

# Global Exception Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"}
    )

# API Routes
@app.get("/")
async def root():
    return {
        "project": "Digital Human V2",
        "status": "running",
        "version": "0.1.0"
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.get("/version")
async def version():
    return {"version": "0.1.0"}

@app.get("/test_stream")
async def test_stream(text: str):
    from core.models import PipelineRequest
    req = PipelineRequest(session_id="test-stream-session", text_input=text)
    
    async def sse_generator():
        try:
            async for packet in gateway.stream_pipeline(req):
                packet_dict = packet.model_dump()
                if isinstance(packet.payload, bytes):
                    import base64
                    packet_dict["payload"] = base64.b64encode(packet.payload).decode('utf-8')
                yield f"data: {json.dumps(packet_dict)}\n\n"
        except Exception as e:
            logger.error(f"Stream error: {e}")
            
    return StreamingResponse(sse_generator(), media_type="text/event-stream")

@app.get("/test_tts")
async def test_tts(text: str):
    from core.models import PipelineRequest
    import asyncio
    from core.streaming.StreamPacket import StreamPacket
    from core.streaming.PipelineStream import PipelineStream
    
    async def fake_llm_stream():
        # Yield the text input as a mock LLM output
        yield PipelineStream.create_packet(
            session_id="test-tts-session",
            sequence=0,
            packet_type="llm",
            payload=text,
            is_final=True
        )
        
    async def sse_generator():
        try:
            # We bypass the full gateway pipeline and just use the TTS provider directly for testing
            tts_provider = gateway.tts_provider
            async for packet in tts_provider.stream("test-tts-session", fake_llm_stream()):
                # Convert packet to SSE payload but we can't JSON serialize bytes, 
                # so we just send metadata and lengths for the smoke test as requested
                packet_dict = packet.model_dump()
                if isinstance(packet.payload, bytes):
                    packet_dict["payload"] = f"<audio bytes: {len(packet.payload)}>"
                yield f"data: {json.dumps(packet_dict)}\n\n"
        except Exception as e:
            logger.error(f"Stream error in test_tts: {e}")
            
    return StreamingResponse(sse_generator(), media_type="text/event-stream")

@app.websocket("/ws/asr")
async def websocket_asr(websocket: WebSocket):
    await websocket.accept()
    query_params = websocket.query_params
    custom_session_id = query_params.get("session_id")
    session_id = custom_session_id if custom_session_id else f"ws-{id(websocket)}"
    
    from core.models import PipelineRequest
    import asyncio
    import base64
    import json
    
    logger.info(f"WebSocket conversation connected for session {session_id}")

    try:
        # Ensure session exists and is active in ConversationManager
        session = await conversation_manager.get_session(session_id)
        if session is None or session.state == SessionState.STOPPED:
            await conversation_manager.create_session(session_id=session_id, metadata={"channel": "websocket"})


        while True:
            # Await next turn or command from client
            audio_queue = asyncio.Queue()
            turn_text_input = None
            turn_metadata = {}
            turn_ended = False

            # Receive packets for this turn
            while True:
                try:
                    message = await websocket.receive()
                except (WebSocketDisconnect, RuntimeError):
                    logger.info(f"WebSocket disconnected by client for session {session_id}")
                    turn_ended = True
                    break

                if "bytes" in message and message["bytes"]:
                    await audio_queue.put(message["bytes"])
                elif "text" in message and message["text"]:
                    msg_text = message["text"].strip()
                    if msg_text == "EOS":
                        logger.info(f"[{session_id}] Received EOS signal. Processing user voice turn.")
                        await audio_queue.put(None)
                        break
                    elif msg_text == "INTRODUCE" or msg_text == "START":
                        logger.info(f"[{session_id}] Received INTRODUCE trigger.")
                        turn_text_input = "Hi! I'm Alicia. It's nice to meet you. How can I help you?"
                        turn_metadata = {"direct_tts": True, "turn_type": "introduction"}
                        await audio_queue.put(None)
                        break
                    elif msg_text == "GOODBYE":
                        logger.info(f"[{session_id}] Received GOODBYE trigger.")
                        turn_text_input = "Goodbye! It was wonderful talking with you. Have a great day!"
                        turn_metadata = {"direct_tts": True, "turn_type": "goodbye"}
                        await audio_queue.put(None)
                        break
                    elif msg_text.startswith("{"):
                        try:
                            payload = json.loads(msg_text)
                            action = payload.get("action") or payload.get("type")
                            if action == "text":
                                turn_text_input = payload.get("text", "")
                                await audio_queue.put(None)
                                break
                            elif action == "introduce":
                                turn_text_input = "Hi! I'm Alicia. It's nice to meet you. How can I help you?"
                                turn_metadata = {"direct_tts": True, "turn_type": "introduction"}
                                await audio_queue.put(None)
                                break
                            elif action == "goodbye":
                                turn_text_input = "Goodbye! It was wonderful talking with you. Have a great day!"
                                turn_metadata = {"direct_tts": True, "turn_type": "goodbye"}
                                await audio_queue.put(None)
                                break
                            elif action == "end":
                                logger.info(f"[{session_id}] Client requested end of conversation.")
                                await conversation_manager.end_session(session_id)
                                await websocket.send_json({
                                    "session_id": session_id,
                                    "packet_type": "system",
                                    "payload": {"status": "session_ended"},
                                    "is_final": True
                                })
                                turn_ended = True
                                break
                        except Exception as parse_err:
                            logger.error(f"Error parsing JSON message: {parse_err}")
                    else:
                        # Direct text input turn
                        turn_text_input = msg_text
                        await audio_queue.put(None)
                        break

            if turn_ended:
                break

            async def audio_stream_generator():
                while True:
                    chunk = await audio_queue.get()
                    if chunk is None:
                        break
                    yield chunk

            req = PipelineRequest(session_id=session_id, text_input=turn_text_input, metadata=turn_metadata)
            try:
                async for packet in gateway.stream_pipeline(req, audio_stream=audio_stream_generator()):
                    packet_dict = packet.model_dump()
                    if isinstance(packet.payload, bytes):
                        packet_dict["payload"] = base64.b64encode(packet.payload).decode('utf-8')
                    await websocket.send_json(packet_dict)

                if turn_metadata.get("turn_type") == "goodbye":
                    logger.info(f"[{session_id}] Goodbye turn finished - closing session.")
                    await conversation_manager.end_session(session_id)
                    break


            except Exception as e:
                logger.error(f"Stream pipeline error for session {session_id}: {e}")
                try:
                    await websocket.send_json({
                        "session_id": session_id,
                        "sequence_number": 9999,
                        "packet_type": "system",
                        "payload": {"error": str(e)},
                        "is_final": True
                    })
                except Exception:
                    pass

    except WebSocketDisconnect:
        logger.info(f"WebSocket session {session_id} disconnected.")
    except Exception as e:
        logger.error(f"WebSocket unhandled error: {e}", exc_info=True)
    finally:
        # Automatically persist transcript upon session closure
        await conversation_manager.end_session(session_id)
        try:
            await websocket.close()
        except:
            pass
        logger.info(f"WebSocket session {session_id} closed and transcript persisted.")

if __name__ == "__main__":
    uvicorn.run("main:app", host=HOST, port=PORT, reload=DEBUG)

