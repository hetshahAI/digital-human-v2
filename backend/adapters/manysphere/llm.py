import json
import time
import re
import logging
import asyncio
import httpx
from typing import Optional, Dict, Any, List, AsyncGenerator

from core.interfaces import LLMProvider
from core.streaming.StreamPacket import StreamPacket
from core.streaming.PipelineStream import PipelineStream
from config.settings import (
    LLM_API_URL, LLM_MODEL, LLM_TEMPERATURE, MANYSPHERE_API_KEY
)

logger = logging.getLogger(__name__)

CONCISE_SYSTEM_PROMPT = (
    "You are Alicia, a 3D conversational digital human. "
    "Give direct, friendly spoken responses in 1-2 short sentences (under 25 words). "
    "Never use thinking tags or markdown."
)

FALLBACK_ERROR_MESSAGE = "Sorry, I had a connection problem. Could you try that again?"

class ManySphereLLMProvider(LLMProvider):
    """
    OpenAI-compatible LLM provider for ManySphere Exo Qwen API with reasoning mode disabled.
    Supports real-time token streaming, zero-reasoning filtering, and low-latency metrics.
    """
    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        api_key: Optional[str] = None,
        temperature: Optional[float] = None
    ):
        self.base_url = (base_url or LLM_API_URL or "https://exo.manysphere.info/v1").rstrip("/")
        self.model = model or LLM_MODEL or "mlx-community/Qwen3.6-35B-A3B-4bit"
        self.api_key = api_key or MANYSPHERE_API_KEY or ""
        self.temperature = temperature if temperature is not None else LLM_TEMPERATURE
        self.client: Optional[httpx.AsyncClient] = None
        self.is_healthy = False

    async def initialize(self) -> None:
        headers = {
            "Content-Type": "application/json",
            "Accept": "text/event-stream"
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        self.client = httpx.AsyncClient(
            headers=headers,
            timeout=httpx.Timeout(connect=10.0, read=45.0, write=10.0, pool=10.0),
            limits=httpx.Limits(max_keepalive_connections=50, max_connections=100, keepalive_expiry=120.0)
        )

        try:
            r = await self.client.get(f"{self.base_url}/models")
            if r.status_code == 200:
                self.is_healthy = True
                logger.info(f"ManySphere Exo LLM Provider initialized (Endpoint: {self.base_url}, Model: {self.model}, Reasoning: DISABLED)")
            else:
                logger.warning(f"ManySphere endpoint returned status {r.status_code}: {r.text[:200]}")
                self.is_healthy = True
        except Exception as e:
            logger.warning(f"ManySphere health check warning: {e}. Provider initialized with graceful fallback.")
            self.is_healthy = True

    async def health(self) -> bool:
        return self.is_healthy

    async def shutdown(self) -> None:
        if self.client:
            await self.client.aclose()
            self.client = None
        logger.info("ManySphere LLM Provider shutdown.")

    async def stream(
        self,
        session_id: str,
        text_stream: AsyncGenerator[StreamPacket, None],
        context: Optional[Dict[str, Any]] = None
    ) -> AsyncGenerator[StreamPacket, None]:
        if not self.client:
            self.client = httpx.AsyncClient(timeout=60.0)

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

        t_req_start = time.time()
        ts = time.strftime("%H:%M:%S")
        logger.info(f"[LLM REQUEST {ts}] Input: '{full_text}' (Model: {self.model}, Reasoning: OFF)")

        # Format conversation messages
        messages: List[Dict[str, str]] = [
            {"role": "system", "content": CONCISE_SYSTEM_PROMPT}
        ]

        if context and "conversation_history" in context:
            for msg in context["conversation_history"]:
                role = msg.get("role", "user")
                text = msg.get("text", "")
                if role in ("user", "assistant") and text:
                    messages.append({"role": role, "content": text})

        messages.append({"role": "user", "content": full_text})

        # OpenAI/Exo request configured for maximum speed with reasoning mode strictly disabled
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
            "temperature": 0.6,
            "top_p": 0.9,
            "max_tokens": 64,             # Enforces fast, concise responses between 10-30 spoken words
            "enable_thinking": False,     # Disables thinking mode in ManySphere/Exo schema
            "reasoning_effort": "none"    # Disables reasoning effort in ManySphere/Exo schema
        }

        first_token_time = None
        seq = 0
        in_think_block = False
        think_buffer = ""
        emitted_any_content = False
        token_count = 0
        accumulated_text = []

        profiler = context.get("profiler") if context else None

        url = f"{self.base_url}/chat/completions"
        first_token_timeout_s = 10.0
        line_timeout_s = 10.0

        t_req_perf = time.perf_counter()
        t_conn_perf = None
        t_first_perf = None
        t_last_perf = None

        if profiler:
            profiler.mark("LLM_REQUEST_SENT")

        try:
            async with self.client.stream("POST", url, json=payload) as response:
                t_conn_perf = time.perf_counter()
                if profiler:
                    profiler.mark("LLM_CONNECTION_ESTABLISHED")

                if response.status_code != 200:
                    error_body = await response.aread()
                    error_text = error_body.decode('utf-8', errors='ignore')
                    logger.error(f"ManySphere API error HTTP {response.status_code}: {error_text}")
                    
                    yield PipelineStream.create_packet(session_id, seq, "llm", FALLBACK_ERROR_MESSAGE, False)
                    seq += 1
                    yield StreamPacket(
                        session_id=session_id,
                        sequence_number=seq,
                        packet_type="llm",
                        payload="",
                        is_final=True,
                        metadata={"error": f"HTTP {response.status_code}", "fallback_used": True}
                    )
                    return

                line_iter = response.aiter_lines().__aiter__()
                while True:
                    time_remaining = max(0.5, first_token_timeout_s - (time.time() - t_req_start)) if first_token_time is None else line_timeout_s
                    try:
                        raw_line = await asyncio.wait_for(line_iter.__anext__(), timeout=time_remaining)
                    except StopAsyncIteration:
                        break
                    except asyncio.TimeoutError:
                        if first_token_time is None:
                            logger.warning(f"[LLM TIMEOUT {time.strftime('%H:%M:%S')}] ManySphere first token timed out after {first_token_timeout_s:.1f}s (remote cluster stalled on keep-alives) -> Triggering fallback")
                        else:
                            logger.warning(f"[LLM TIMEOUT {time.strftime('%H:%M:%S')}] ManySphere line stream timed out after {line_timeout_s:.1f}s")
                        break

                    if not raw_line:
                        continue

                    line = raw_line.strip()
                    if not line.startswith("data:"):
                        continue

                    data_str = line[5:].strip()
                    if data_str == "[DONE]":
                        break

                    try:
                        chunk_json = json.loads(data_str)
                        choices = chunk_json.get("choices", [])
                        if not choices:
                            continue

                        delta = choices[0].get("delta", {})

                        if "reasoning_content" in delta and delta["reasoning_content"]:
                            continue

                        content = delta.get("content", "")
                        if not content:
                            continue

                        if "<think>" in content:
                            in_think_block = True
                            parts = content.split("<think>", 1)
                            content = parts[0]
                            think_buffer = parts[1] if len(parts) > 1 else ""

                        if in_think_block:
                            if "</think>" in think_buffer or "</think>" in content:
                                in_think_block = False
                                if "</think>" in content:
                                    content = content.split("</think>", 1)[1]
                                else:
                                    content = ""
                                think_buffer = ""
                            else:
                                think_buffer += content
                                content = ""

                        if content:
                            token_count += 1
                            t_last_perf = time.perf_counter()
                            accumulated_text.append(content)

                            if first_token_time is None:
                                first_token_time = time.time()
                                t_first_perf = time.perf_counter()
                                ttft = (first_token_time - t_req_start) * 1000
                                logger.info(f"[LLM FIRST TOKEN {time.strftime('%H:%M:%S')}] TTFT: {ttft:.1f}ms (First assistant token emitted immediately)")
                                if profiler:
                                    profiler.mark("LLM_FIRST_TOKEN")
                            elif token_count == 2:
                                if profiler:
                                    profiler.mark("LLM_SECOND_TOKEN")

                            emitted_any_content = True
                            yield PipelineStream.create_packet(session_id, seq, "llm", content, False)
                            seq += 1

                    except json.JSONDecodeError as json_err:
                        logger.debug(f"ManySphere SSE JSON parse error: {json_err} on line '{data_str}'")
                        continue

            if profiler and token_count > 0:
                profiler.mark("LLM_LAST_TOKEN")
                profiler.mark("LLM_STREAM_FINISHED")

            t_total_perf = time.perf_counter() - t_req_perf
            ttft_ms = (t_first_perf - t_req_perf) * 1000 if t_first_perf else 0.0
            ttlt_ms = (t_last_perf - t_req_perf) * 1000 if t_last_perf else 0.0
            conn_ms = (t_conn_perf - t_req_perf) * 1000 if t_conn_perf else 0.0
            req_sent_ms = (t_req_perf - (profiler.t_turn_start if profiler else t_req_perf)) * 1000
            tps = (token_count / t_total_perf) if t_total_perf > 0 else 0.0
            full_reply_str = "".join(accumulated_text).strip()

            if profiler:
                profiler.record_llm(
                    request_sent_ms=req_sent_ms,
                    connection_time_ms=conn_ms,
                    ttft_ms=ttft_ms,
                    ttlt_ms=ttlt_ms,
                    total_gen_ms=t_total_perf * 1000,
                    tokens_generated=token_count,
                    tokens_per_sec=tps,
                    response_text=full_reply_str
                )

            if not emitted_any_content:
                logger.warning(f"ManySphere yielded 0 content tokens for '{full_text}'. Yielding fallback.")
                yield PipelineStream.create_packet(session_id, seq, "llm", FALLBACK_ERROR_MESSAGE, False)
                seq += 1

            yield StreamPacket(
                session_id=session_id,
                sequence_number=seq,
                packet_type="llm",
                payload="",
                is_final=True,
                metadata={
                    "time_to_first_token_ms": ttft_ms,
                    "total_generation_time_ms": t_total_perf * 1000,
                    "tokens_per_sec": tps,
                    "tokens_generated": token_count,
                    "model": self.model,
                    "reasoning_mode": "disabled",
                    "fallback_used": not emitted_any_content
                }
            )

        except (httpx.ConnectError, httpx.TimeoutException, httpx.HTTPError) as net_err:
            logger.error(f"ManySphere network error: {net_err}")
            yield PipelineStream.create_packet(session_id, seq, "llm", FALLBACK_ERROR_MESSAGE, False)
            seq += 1
            yield StreamPacket(
                session_id=session_id,
                sequence_number=seq,
                packet_type="llm",
                payload="",
                is_final=True,
                metadata={"error": str(net_err), "fallback_used": True}
            )
        except Exception as e:
            logger.error(f"ManySphere unhandled exception: {e}", exc_info=True)
            yield PipelineStream.create_packet(session_id, seq, "llm", FALLBACK_ERROR_MESSAGE, False)
            seq += 1
            yield StreamPacket(
                session_id=session_id,
                sequence_number=seq,
                packet_type="llm",
                payload="",
                is_final=True,
                metadata={"error": str(e), "fallback_used": True}
            )
