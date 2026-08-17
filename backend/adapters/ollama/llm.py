import json
import time
import logging
import httpx
from typing import Optional, Dict, Any, AsyncGenerator

from core.interfaces import LLMProvider
from core.streaming.StreamPacket import StreamPacket
from core.streaming.PipelineStream import PipelineStream
from config.settings import LLM_BASE_URL, LLM_MODEL, LLM_TEMPERATURE

logger = logging.getLogger(__name__)

CONCISE_SYSTEM_PROMPT = (
    "You are Alicia, a friendly, intelligent, and natural 3D conversational AI digital human. "
    "Keep all responses natural, warm, and concise (1 to 3 short sentences, roughly 15 to 40 words) unless the user explicitly asks for extensive detail. "
    "Never speak in long bullet points or multiple paragraphs during spoken dialogue."
)

class OllamaStreamingLLM(LLMProvider):
    def __init__(self):
        self.client = None
        self.is_healthy = False
        self.history = []

    async def initialize(self) -> None:
        self.client = httpx.AsyncClient(timeout=60.0)
        try:
            response = await self.client.get(f"{LLM_BASE_URL}/api/tags")
            response.raise_for_status()
            models = response.json().get("models", [])
            model_names = [m["name"] for m in models]
            
            if LLM_MODEL not in model_names and f"{LLM_MODEL}:latest" not in model_names:
                logger.warning(f"Ollama model '{LLM_MODEL}' not found in installed models! Found: {model_names}")
            
            self.is_healthy = True
            logger.info(f"Ollama LLM Provider initialized (Model: {LLM_MODEL})")
        except Exception as e:
            logger.error(f"Failed to initialize Ollama LLM Provider: {e}")
            self.is_healthy = False

    async def health(self) -> bool:
        return self.is_healthy

    async def shutdown(self) -> None:
        if self.client:
            await self.client.aclose()
        logger.info("Ollama LLM Provider shutdown.")

    async def stream(self, session_id: str, text_stream: AsyncGenerator[StreamPacket, None], context: Optional[Dict[str, Any]] = None) -> AsyncGenerator[StreamPacket, None]:
        if not self.client:
            raise RuntimeError("OllamaStreamingLLM not initialized")

        # Accumulate input text from ASR stream (take the final committed text)
        full_text = ""
        async for packet in text_stream:
            if packet.packet_type == "asr" and packet.payload:
                full_text = str(packet.payload).strip()
            
            if packet.is_final:
                break
                
        full_text = full_text.strip()
        if not full_text:
            logger.warning(f"Session {session_id} received empty final ASR text. Yielding empty final packet.")
            yield PipelineStream.create_packet(session_id, 0, "llm", "", True)
            return

        ts = time.strftime("%H:%M:%S")
        logger.info(f"[LLM START {ts}] Input: '{full_text}'")

        # Format prompt with system instructions
        prompt = f"System: {CONCISE_SYSTEM_PROMPT}\nUser: {full_text}\nAssistant:"
        request_data = {
            "model": LLM_MODEL,
            "prompt": prompt,
            "stream": True,
            "options": {
                "temperature": LLM_TEMPERATURE,
                "num_predict": 128
            }
        }

        # Track metrics
        start_time = time.time()
        first_token_time = None
        seq = 0


        # Stream from Ollama
        url = f"{LLM_BASE_URL}/api/generate"
        try:
            async with self.client.stream("POST", url, json=request_data) as response:
                response.raise_for_status()
                
                async for line in response.aiter_lines():
                    if not line:
                        continue
                        
                    try:
                        chunk_data = json.loads(line)
                        if "error" in chunk_data:
                            logger.error(f"Ollama API Error: {chunk_data['error']}")
                            break
                            
                        chunk_text = chunk_data.get("response", "")
                        is_done = chunk_data.get("done", False)

                        if first_token_time is None and chunk_text:
                            first_token_time = time.time()

                        if is_done:
                            total_time = time.time() - start_time
                            ttft = (first_token_time - start_time) * 1000 if first_token_time else 0.0
                            metadata = {
                                "time_to_first_token_ms": ttft,
                                "total_generation_time_ms": total_time * 1000
                            }
                            yield StreamPacket(
                                session_id=session_id,
                                sequence_number=seq,
                                packet_type="llm",
                                payload=chunk_text,
                                is_final=True,
                                metadata=metadata
                            )
                            break
                        else:
                            if chunk_text:
                                yield PipelineStream.create_packet(session_id, seq, "llm", chunk_text, False)
                                seq += 1
                                
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse Ollama chunk: {e}")
                        continue
                        
        except httpx.ConnectError:
            logger.error(f"Failed to connect to Ollama at {LLM_BASE_URL}. Is Ollama running?")
            yield StreamPacket(session_id=session_id, sequence_number=seq, packet_type="llm", payload="", is_final=True, metadata={"error": "Ollama connection failed"})
        except Exception as e:
            logger.error(f"Ollama streaming exception: {e}")
            yield StreamPacket(session_id=session_id, sequence_number=seq, packet_type="llm", payload="", is_final=True, metadata={"error": str(e)})
