import asyncio
import json
import os
import shutil
import tempfile
from pathlib import Path
from fastapi.testclient import TestClient

from config.settings import CONVERSATIONS_DIR
from core.conversation.SessionState import SessionState
from core.conversation.Session import Session, Message
from core.conversation.TranscriptStore import TranscriptStore
from core.conversation.ConversationManager import ConversationManager
from services.gateway.GatewayManager import GatewayManager
from adapters.dummy.dummy_providers import DummyASR, DummyLLM, DummyTTS, DummyAnimation
from core.models import PipelineRequest
from main import app, gateway, conversation_manager

def test_models():
    print("Testing models...")
    msg = Message(role="user", text="Hello")
    assert msg.role == "user"
    assert msg.text == "Hello"
    assert isinstance(msg.timestamp, float)

    session = Session(session_id="sess-001", state=SessionState.IDLE)
    assert session.session_id == "sess-001"
    assert session.state == SessionState.IDLE
    assert len(session.conversation_history) == 0

    session.conversation_history.append(msg)
    data = session.model_dump()
    assert len(data["conversation_history"]) == 1
    assert data["conversation_history"][0]["text"] == "Hello"
    print("[PASS] test_models")

async def test_transcript_store(tmp_path: Path):
    print("Testing TranscriptStore...")
    store = TranscriptStore(storage_dir=tmp_path)
    session = Session(
        session_id="test-store-123",
        metadata={"user_name": "Alice"}
    )
    session.conversation_history.append(Message(role="assistant", text="Hello."))
    session.conversation_history.append(Message(role="user", text="Hi"))

    saved_path = await store.save_session(session)
    assert saved_path.exists()
    assert saved_path.name == "session_test-store-123.json"

    # Verify JSON content on disk
    with open(saved_path, "r", encoding="utf-8") as f:
        json_data = json.load(f)
    assert json_data["session_id"] == "test-store-123"
    assert len(json_data["conversation_history"]) == 2
    assert json_data["conversation_history"][0]["text"] == "Hello."
    assert json_data["conversation_history"][1]["text"] == "Hi"
    assert json_data["metadata"]["user_name"] == "Alice"

    # Load back
    loaded = await store.load_session("test-store-123")
    assert loaded is not None
    assert loaded.session_id == "test-store-123"
    assert len(loaded.conversation_history) == 2
    assert loaded.metadata["user_name"] == "Alice"

    # Check existence
    assert await store.session_exists("test-store-123") is True
    assert await store.session_exists("non-existent") is False
    print("[PASS] test_transcript_store")

async def test_conversation_manager(tmp_path: Path):
    print("Testing ConversationManager...")
    store = TranscriptStore(storage_dir=tmp_path)
    manager = ConversationManager(transcript_store=store)

    # 1. Create sessions
    s1 = await manager.create_session("sess-1", metadata={"lang": "en"})
    s2 = await manager.create_session("sess-2")
    assert s1.session_id == "sess-1"
    assert s1.state == SessionState.IDLE
    assert s2.session_id == "sess-2"

    # 2. Append messages
    await manager.append_user_message("sess-1", "How is the weather?")
    await manager.append_assistant_message("sess-1", "It is sunny.")

    # 3. Check history
    s1_curr = await manager.get_session("sess-1")
    assert len(s1_curr.conversation_history) == 2
    assert s1_curr.conversation_history[0].role == "user"
    assert s1_curr.conversation_history[0].text == "How is the weather?"
    assert s1_curr.conversation_history[1].role == "assistant"
    assert s1_curr.conversation_history[1].text == "It is sunny."

    # Verify session isolation
    s2_curr = await manager.get_session("sess-2")
    assert len(s2_curr.conversation_history) == 0

    # 4. End session and verify transcript saved
    ended_s1 = await manager.end_session("sess-1")
    assert ended_s1.state == SessionState.STOPPED
    assert await store.session_exists("sess-1") is True
    print("[PASS] test_conversation_manager")

async def test_gateway_pipeline_conversation_integration(tmp_path: Path):
    print("Testing GatewayManager Integration...")
    store = TranscriptStore(storage_dir=tmp_path)
    mgr = ConversationManager(transcript_store=store)
    gw = GatewayManager(
        asr_provider=DummyASR(),
        llm_provider=DummyLLM(),
        tts_provider=DummyTTS(),
        animation_provider=DummyAnimation(),
        conversation_manager=mgr
    )
    await gw.initialize()

    # Multi-turn interaction on the same session
    session_id = "gw-multi-turn-001"
    
    # Turn 1: User sends text input
    req1 = PipelineRequest(session_id=session_id, text_input="Hello AI")
    packets1 = []
    async for pkt in gw.stream_pipeline(req1):
        packets1.append(pkt)

    # Check conversation history after Turn 1
    session_after_t1 = await mgr.get_session(session_id)
    assert session_after_t1 is not None
    assert len(session_after_t1.conversation_history) == 2
    assert session_after_t1.conversation_history[0].role == "user"
    assert session_after_t1.conversation_history[0].text == "Hello AI"
    assert session_after_t1.conversation_history[1].role == "assistant"
    assert session_after_t1.conversation_history[1].text == "This is a streaming response."

    # Turn 2: User sends second turn with dummy ASR streaming
    async def mock_audio():
        yield b"chunk1"

    req2 = PipelineRequest(session_id=session_id)
    packets2 = []
    async for pkt in gw.stream_pipeline(req2, audio_stream=mock_audio()):
        packets2.append(pkt)

    # Check conversation history after Turn 2
    session_after_t2 = await mgr.get_session(session_id)
    assert len(session_after_t2.conversation_history) == 4
    assert session_after_t2.conversation_history[2].role == "user"
    assert session_after_t2.conversation_history[2].text == "Hello world"
    assert session_after_t2.conversation_history[3].role == "assistant"
    assert session_after_t2.conversation_history[3].text == "This is a streaming response."


    # End session via gateway
    ended_session = await gw.end_session(session_id)
    assert ended_session.state == SessionState.STOPPED
    assert await store.session_exists(session_id) is True

    await gw.shutdown()
    print("[PASS] test_gateway_pipeline_conversation_integration")

async def test_concurrency(tmp_path: Path):
    print("Testing Concurrency with Multiple Sessions...")
    store = TranscriptStore(storage_dir=tmp_path)
    manager = ConversationManager(transcript_store=store)

    async def run_session(sid: str, count: int):
        await manager.create_session(sid)
        for i in range(count):
            await manager.append_user_message(sid, f"User msg {i} for {sid}")
            await manager.append_assistant_message(sid, f"Assistant reply {i} for {sid}")
        ended = await manager.end_session(sid)
        assert ended.state == SessionState.STOPPED
        assert await store.session_exists(sid) is True

    tasks = [run_session(f"concurrent-sess-{i}", 5) for i in range(10)]
    await asyncio.gather(*tasks)

    # Verify all 10 sessions persisted cleanly
    for i in range(10):
        sid = f"concurrent-sess-{i}"
        loaded = await store.load_session(sid)
        assert loaded is not None
        assert loaded.session_id == sid
        assert len(loaded.conversation_history) == 10
        assert loaded.state == SessionState.STOPPED
    print("[PASS] test_concurrency")

def test_api_endpoints():
    print("Testing API Endpoints...")
    client = TestClient(app)

    # 1. Test existing endpoints
    res_root = client.get("/")
    assert res_root.status_code == 200
    assert res_root.json()["status"] == "running"

    res_health = client.get("/health")
    assert res_health.status_code == 200
    assert res_health.json()["status"] == "healthy"

    # 2. Test POST /conversation/start
    res_start = client.post("/conversation/start", json={"session_id": "api-test-sess-1", "metadata": {"client": "web"}})
    assert res_start.status_code == 201
    data_start = res_start.json()
    assert data_start["session_id"] == "api-test-sess-1"
    assert data_start["state"] == "IDLE"

    # 3. Test GET /conversation/{session_id}
    res_get = client.get("/conversation/api-test-sess-1")
    assert res_get.status_code == 200
    data_get = res_get.json()
    assert data_get["session_id"] == "api-test-sess-1"
    assert data_get["state"] == "IDLE"
    assert data_get["conversation_history"] == []
    assert data_get["metadata"]["client"] == "web"

    # Test GET non-existent session
    res_get_none = client.get("/conversation/non-existent-xyz")
    assert res_get_none.status_code == 404

    # 4. Test POST /conversation/{session_id}/end
    res_end = client.post("/conversation/api-test-sess-1/end")
    assert res_end.status_code == 200
    data_end = res_end.json()
    assert data_end["session_id"] == "api-test-sess-1"
    assert data_end["state"] == "STOPPED"

    # 5. Check Swagger OpenAPI schema
    res_openapi = client.get("/openapi.json")
    assert res_openapi.status_code == 200
    schema = res_openapi.json()
    assert "/conversation/start" in schema["paths"]
    assert "/conversation/{session_id}" in schema["paths"]
    assert "/conversation/{session_id}/end" in schema["paths"]
    print("[PASS] test_api_endpoints")

async def run_all_async_tests():
    tmp_dir = Path(tempfile.mkdtemp())
    try:
        await test_transcript_store(tmp_dir)
        await test_conversation_manager(tmp_dir)
        await test_gateway_pipeline_conversation_integration(tmp_dir)
        await test_concurrency(tmp_dir)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)

def main():
    test_models()
    asyncio.run(run_all_async_tests())
    test_api_endpoints()
    print("\n==========================================")
    print("ALL PROJECT 011 TESTS PASSED SUCCESSFULLY!")
    print("==========================================")

if __name__ == "__main__":
    main()


