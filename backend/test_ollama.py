import asyncio
import logging
from typing import AsyncGenerator

# Setup logging before importing other modules
logging.basicConfig(level=logging.DEBUG)

from adapters.ollama.llm import OllamaStreamingLLM
from core.streaming.StreamPacket import StreamPacket

async def mock_asr_stream() -> AsyncGenerator[StreamPacket, None]:
    # Mock ASR packets
    yield StreamPacket(session_id="test-1", sequence_number=0, packet_type="asr", payload="Hello, ", is_final=False)
    await asyncio.sleep(0.1)
    yield StreamPacket(session_id="test-1", sequence_number=1, packet_type="asr", payload="introduce yourself ", is_final=False)
    await asyncio.sleep(0.1)
    yield StreamPacket(session_id="test-1", sequence_number=2, packet_type="asr", payload="in one short sentence.", is_final=True)

async def test():
    print("Initializing OllamaStreamingLLM...")
    llm = OllamaStreamingLLM()
    await llm.initialize()
    
    health = await llm.health()
    print(f"Provider Health: {health}")
    
    if not health:
        print("Test blocked. Ollama is unavailable or model not found.")
        await llm.shutdown()
        return

    print("\n--- Starting LLM Stream ---")
    try:
        async for packet in llm.stream(session_id="test-1", text_stream=mock_asr_stream()):
            print(f"Packet [{packet.sequence_number}] (Final: {packet.is_final}): {packet.payload}")
            if packet.metadata:
                print(f"  Metadata: {packet.metadata}")
    except Exception as e:
        print(f"Error during streaming: {e}")
        
    print("--- End LLM Stream ---\n")
    
    await llm.shutdown()

if __name__ == "__main__":
    asyncio.run(test())
