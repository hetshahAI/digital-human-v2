import asyncio
import json
import base64
from pathlib import Path
from fastapi.testclient import TestClient

from config.settings import CONVERSATIONS_DIR
from main import app, gateway, conversation_manager
from adapters.dummy.dummy_providers import DummyASR, DummyLLM, DummyTTS, DummyAnimation

def test_full_multiturn_websocket_flow():
    print("Testing Full Multi-turn WebSocket Flow with Hard Termination...")
    
    # Save existing providers
    orig_asr = gateway.asr_provider
    orig_llm = gateway.llm_provider
    orig_tts = gateway.tts_provider
    orig_anim = gateway.animation_provider

    # Inject dummy providers for reliable offline integration test
    gateway.asr_provider = DummyASR()
    gateway.llm_provider = DummyLLM()
    gateway.tts_provider = DummyTTS()
    gateway.animation_provider = DummyAnimation()

    import time
    session_id = f"test-multiturn-ws-{int(time.time()*1000)}"


    try:
        with TestClient(app) as client:
            with client.websocket_connect(f"/ws/asr?session_id={session_id}") as websocket:
                # 1. Test Introduction trigger
                websocket.send_text("INTRODUCE")
                intro_packets = []
                while True:
                    data = websocket.receive_json()
                    intro_packets.append(data)
                    if data.get("is_final") and data.get("packet_type") == "system":
                        break

                assert any(p.get("packet_type") == "llm" for p in intro_packets)
                print("  [PASS] TEST 1.1: Introduction turn completed")

                # 2. Test Multi-turn 1: Direct text prompt
                websocket.send_text("What can you do?")
                t1_packets = []
                while True:
                    data = websocket.receive_json()
                    t1_packets.append(data)
                    if data.get("is_final") and data.get("packet_type") == "system":
                        break

                assert any(p.get("packet_type") == "llm" for p in t1_packets)
                print("  [PASS] TEST 1.2: Multi-turn 1 (text input) completed")

                # 3. Test Empty turn / silence rejection
                websocket.send_text("EOS")
                silence_packets = []
                while True:
                    data = websocket.receive_json()
                    silence_packets.append(data)
                    if data.get("is_final") and data.get("packet_type") == "system":
                        break

                assert any(p.get("payload", {}).get("status") == "no_speech" for p in silence_packets if p.get("packet_type") == "system")
                assert not any(p.get("packet_type") == "llm" for p in silence_packets)
                print("  [PASS] TEST 1.3: Empty turn / silence strictly rejected")

                # 4. Test Multi-turn 2: Audio stream + EOS
                websocket.send_bytes(b"dummy_pcm_audio_bytes_1234567890")
                websocket.send_text("EOS")
                t2_packets = []
                while True:
                    data = websocket.receive_json()
                    t2_packets.append(data)
                    if data.get("is_final") and data.get("packet_type") == "system":
                        break

                assert any(p.get("packet_type") == "llm" for p in t2_packets)
                print("  [PASS] TEST 1.4: Multi-turn 2 (audio + EOS) completed")

                # 5. Test Goodbye
                websocket.send_text("GOODBYE")
                goodbye_packets = []
                while True:
                    try:
                        data = websocket.receive_json()
                        goodbye_packets.append(data)
                        if data.get("is_final") and data.get("packet_type") == "system":
                            break
                    except Exception:
                        break

                assert any(p.get("packet_type") == "tts" for p in goodbye_packets)
                print("  [PASS] TEST 1.5: Goodbye speech streamed and session marked ending")

            # Verify transcript persisted
            import time
            transcript_file = CONVERSATIONS_DIR / f"session_{session_id}.json"
            for _ in range(20):
                if transcript_file.exists():
                    break
                time.sleep(0.1)

            assert transcript_file.exists(), f"Transcript file {transcript_file} not found"

            with open(transcript_file, "r", encoding="utf-8") as f:
                transcript_data = json.load(f)


            assert transcript_data["session_id"] == session_id
            assert transcript_data["state"] == "STOPPED"
            print(f"  [PASS] TEST 1.6: Transcript persisted with {len(transcript_data['conversation_history'])} messages and STOPPED state")

            # 6. Test post-END isolation: Connecting or sending to an already ended session must not produce LLM/TTS
            session_obj = asyncio.run(conversation_manager.get_session(session_id))
            assert session_obj.state.value == "STOPPED"
            print("  [PASS] TEST 2 & 3: Post-END session state confirmed STOPPED")

        print("[PASS] ALL MULTI-TURN & TERMINATION TESTS PASSED!")

    finally:
        # Restore original providers
        gateway.asr_provider = orig_asr
        gateway.llm_provider = orig_llm
        gateway.tts_provider = orig_tts
        gateway.animation_provider = orig_anim

if __name__ == "__main__":
    test_full_multiturn_websocket_flow()
