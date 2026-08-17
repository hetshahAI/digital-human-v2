import time
import logging
import asyncio
from typing import Optional, AsyncGenerator, List, Dict, Any
from core.interfaces import ASRProvider, LLMProvider, TTSProvider, AnimationProvider
from core.models import PipelineRequest, StreamMetrics
from core.streaming.StreamBus import StreamBus
from core.streaming.StreamPacket import StreamPacket
from core.streaming.PipelineStream import PipelineStream
from core.conversation.ConversationManager import ConversationManager
from core.conversation.SessionState import SessionState
from core.conversation.Session import Session
from core.profiler.TurnProfiler import TurnProfiler

logger = logging.getLogger(__name__)

def get_timestamp_str() -> str:
    return time.strftime("%H:%M:%S")

def merge_transcript_fragments(completed_segments: List[str], current_interim: str) -> str:
    """
    Robustly merges completed ASR segments with the latest interim hypothesis,
    handling both cumulative prefix extensions and incremental token streams.
    """
    if not completed_segments and not current_interim:
        return ""
    
    parts = [s.strip() for s in completed_segments if s.strip()]
    if current_interim.strip():
        interim = current_interim.strip()
        # Check if interim is already included as a substring or cumulative extension of the last segment
        if parts:
            last = parts[-1]
            if interim.lower().startswith(last.lower()):
                # Cumulative replacement of the last segment
                parts[-1] = interim
            elif not last.lower().endswith(interim.lower()):
                parts.append(interim)
        else:
            parts.append(interim)
            
    return " ".join(parts).strip()

class GatewayManager:
    def __init__(
        self,
        asr_provider: Optional[ASRProvider] = None,
        llm_provider: Optional[LLMProvider] = None,
        tts_provider: Optional[TTSProvider] = None,
        animation_provider: Optional[AnimationProvider] = None,
        conversation_manager: Optional[ConversationManager] = None
    ):
        self.asr_provider = asr_provider
        self.llm_provider = llm_provider
        self.tts_provider = tts_provider
        self.animation_provider = animation_provider
        self.conversation_manager = conversation_manager or ConversationManager()
        self.bus = StreamBus()

    async def initialize(self):
        logger.info("Initializing Gateway Providers...")
        if self.asr_provider: await self.asr_provider.initialize()
        if self.llm_provider: await self.llm_provider.initialize()
        if self.tts_provider: await self.tts_provider.initialize()
        if self.animation_provider: await self.animation_provider.initialize()
        logger.info("Gateway Providers Initialized.")

    async def shutdown(self):
        logger.info("Shutting down Gateway Providers...")
        if self.asr_provider: await self.asr_provider.shutdown()
        if self.llm_provider: await self.llm_provider.shutdown()
        if self.tts_provider: await self.tts_provider.shutdown()
        if self.animation_provider: await self.animation_provider.shutdown()
        logger.info("Gateway Providers Shutdown complete.")

    async def end_session(self, session_id: str) -> Optional[Session]:
        return await self.conversation_manager.end_session(session_id)

    async def stream_pipeline(self, request: PipelineRequest, audio_stream: Optional[AsyncGenerator[bytes, None]] = None) -> AsyncGenerator[StreamPacket, None]:
        session_id = request.session_id
        queue = self.bus.subscribe(session_id)
        
        task = asyncio.create_task(self._orchestrate(request, audio_stream))
        
        try:
            while True:
                packet = await queue.get()
                yield packet
                if packet.is_final and packet.packet_type == 'system':
                    break
        finally:
            self.bus.unsubscribe(session_id, queue)
            if not task.done():
                task.cancel()

    async def _orchestrate(self, request: PipelineRequest, audio_stream: Optional[AsyncGenerator[bytes, None]]):
        session_id = request.session_id
        t_pipeline_start = time.time()
        
        # TurnProfiler instantiation
        metadata = request.metadata or {}
        profiler: TurnProfiler = metadata.get("profiler") or TurnProfiler(session_id=session_id)
        metadata["profiler"] = profiler
        request.metadata = metadata

        profiler.mark("MIC_OPEN")
        
        async def monitored_audio_stream():
            first_chunk = True
            if audio_stream is not None:
                async for chunk in audio_stream:
                    if chunk:
                        if first_chunk:
                            first_chunk = False
                            profiler.mark("MIC_FIRST_AUDIO")
                            profiler.mark("VAD_START")
                    yield chunk
            else:
                data = request.audio_data or b""
                if data:
                    profiler.mark("MIC_FIRST_AUDIO")
                    profiler.mark("VAD_START")
                yield data

        actual_stream = monitored_audio_stream()
            
        try:
            logger.info(f"Starting pipeline stream for session {session_id} [TURN {profiler.turn_number}]")
            
            # Ensure conversation session exists
            session = await self.conversation_manager.get_session(session_id)
            if session is None:
                session = await self.conversation_manager.create_session(
                    session_id=session_id,
                    metadata=request.metadata
                )
            elif session.state == SessionState.STOPPED:
                logger.info(f"[GATE] Session {session_id} is already STOPPED - ignoring turn")
                duration = time.time() - t_pipeline_start
                await self.bus.publish(PipelineStream.create_packet(
                    session_id, 9999, "system", 
                    {"status": "session_stopped", "duration_ms": duration * 1000}, True
                ))
                return

            is_direct_tts = metadata.get("direct_tts", False)

            final_user_text = ""
            committed_asr_packet = None

            t_asr_first_partial = 0.0
            t_asr_final = 0.0
            t_turn_commit = 0.0

            # ----------------------------------------------------
            # PHASE 1: ASR ACCUMULATION & TURN COMMITMENT
            # ----------------------------------------------------
            if is_direct_tts and request.text_input:
                direct_text = request.text_input.strip()
                logger.info(f"[TTS DIRECT {get_timestamp_str()}] {direct_text}")
                await self.conversation_manager.append_assistant_message(session_id, direct_text)
                final_user_text = direct_text
                mock_llm_pkt = PipelineStream.create_packet(session_id, 0, "llm", direct_text, True)
                await self.bus.publish(mock_llm_pkt)
                t_turn_commit = time.time()
                profiler.mark("ASR_COMMIT")
                profiler.record_asr(0.0, 0.0, direct_text)

            elif request.text_input:
                # Direct user text turn
                final_user_text = request.text_input.strip()
                if not final_user_text:
                    logger.info(f"[ASR {get_timestamp_str()}] Empty text input provided - ignoring turn")
                    duration = time.time() - t_pipeline_start
                    await self.bus.publish(PipelineStream.create_packet(
                        session_id, 9999, "system", 
                        {"status": "no_speech", "duration_ms": duration * 1000}, True
                    ))
                    return

                t_turn_commit = time.time()
                ts = get_timestamp_str()
                logger.info(f"[TURN COMMIT {ts}] {final_user_text}")
                committed_asr_packet = PipelineStream.create_packet(session_id, 0, "asr", final_user_text, True)
                await self.bus.publish(committed_asr_packet)
                await self.conversation_manager.append_user_message(session_id, final_user_text)
                profiler.mark("ASR_COMMIT")
                profiler.record_asr(0.0, 0.0, final_user_text)

            elif self.asr_provider:
                # Streaming user microphone audio
                await self.conversation_manager.set_session_state(session_id, SessionState.LISTENING)
                completed_segments: List[str] = []
                current_interim: str = ""

                async for pkt in self.asr_provider.stream(session_id, actual_stream):
                    if pkt.packet_type == "asr" and pkt.payload is not None:
                        raw_payload = str(pkt.payload).strip()
                        ts = get_timestamp_str()
                        
                        if pkt.is_final:
                            if raw_payload:
                                completed_segments.append(raw_payload)
                                current_interim = ""
                                t_asr_final = time.time()
                                profiler.mark("ASR_FINAL")
                                logger.info(f"[ASR FINAL {ts}] {raw_payload}")
                        else:
                            if t_asr_first_partial == 0.0 and raw_payload:
                                t_asr_first_partial = time.time()
                                profiler.mark("ASR_FIRST_PARTIAL")
                            current_interim = raw_payload
                            logger.info(f"[ASR PARTIAL {ts}] {current_interim}")

                        # Merge cleanly using robust deduplicator
                        combined = merge_transcript_fragments(completed_segments, current_interim)
                        if combined:
                            logger.debug(f"[TURN BUFFER {ts}] {combined}")
                            if not pkt.is_final:
                                await self.bus.publish(pkt)

                profiler.mark("VAD_END")
                final_user_text = merge_transcript_fragments(completed_segments, current_interim)

                # STRICT TURN GATE: Reject empty / silence transcripts
                if not final_user_text:
                    logger.info(f"[ASR {get_timestamp_str()}] No valid speech detected in user audio stream - ignoring turn")
                    duration = time.time() - t_pipeline_start
                    await self.bus.publish(PipelineStream.create_packet(
                        session_id, 9999, "system", 
                        {"status": "no_speech", "duration_ms": duration * 1000}, True
                    ))
                    await self.conversation_manager.set_session_state(session_id, SessionState.LISTENING)
                    return

                t_turn_commit = time.time()
                ts = get_timestamp_str()
                logger.info(f"[TURN COMMIT {ts}] {final_user_text}")
                committed_asr_packet = PipelineStream.create_packet(session_id, 0, "asr", final_user_text, True)
                await self.bus.publish(committed_asr_packet)
                await self.conversation_manager.append_user_message(session_id, final_user_text)
                profiler.mark("ASR_COMMIT")

                vad_start_ms = profiler.timestamps.get("VAD_START", 0.0)
                vad_end_ms = profiler.timestamps.get("VAD_END", (t_turn_commit - t_pipeline_start) * 1000)
                speech_dur_ms = max(0.0, vad_end_ms - vad_start_ms)
                asr_proc_ms = max(0.0, ((t_turn_commit - t_pipeline_start) * 1000) - speech_dur_ms)
                profiler.record_asr(speech_dur_ms, asr_proc_ms, final_user_text)

            # ----------------------------------------------------
            # PHASE 2: CONCURRENT STREAMING LLM -> TTS PIPELINE
            # ----------------------------------------------------
            tts_packets_collected: List[StreamPacket] = []
            t_llm_request = time.time()
            t_llm_first_token = 0.0
            t_tts_request = time.time()
            t_tts_first_audio = 0.0

            if is_direct_tts:
                # Direct speech synthesis (Greeting or Goodbye)
                await self.conversation_manager.set_session_state(session_id, SessionState.SPEAKING)
                ts = get_timestamp_str()
                logger.info(f"[STATE {ts}] SPEAKING")
                logger.info(f"[TTS START {ts}]")

                async def direct_text_stream():
                    yield PipelineStream.create_packet(session_id, 0, "llm", direct_text, True)

                if self.tts_provider:
                    async for pkt in self.tts_provider.stream(session_id, direct_text_stream(), context={"profiler": profiler}):
                        if t_tts_first_audio == 0.0 and pkt.payload:
                            t_tts_first_audio = time.time()
                        await self.bus.publish(pkt)
                        tts_packets_collected.append(pkt)

            else:
                # Conversational User Turn: Concurrent LLM Producer + TTS Consumer
                await self.conversation_manager.set_session_state(session_id, SessionState.THINKING)
                ts = get_timestamp_str()
                logger.info(f"[STATE {ts}] THINKING")
                logger.info(f"[LLM REQUEST {ts}]")

                llm_to_tts_queue: asyncio.Queue = asyncio.Queue()
                assistant_reply_fragments: List[str] = []
                full_assistant_reply: List[str] = []

                # LLM PRODUCER TASK
                async def llm_producer():
                    nonlocal t_llm_first_token
                    try:
                        async def asr_input_generator():
                            yield committed_asr_packet

                        if self.llm_provider:
                            async for pkt in self.llm_provider.stream(session_id, asr_input_generator(), request.metadata):
                                if t_llm_first_token == 0.0 and pkt.payload:
                                    t_llm_first_token = time.time()
                                    ttft_ms = (t_llm_first_token - t_llm_request) * 1000
                                    logger.info(f"[LLM FIRST TOKEN {get_timestamp_str()}] TTFT: {ttft_ms:.1f}ms")

                                await self.bus.publish(pkt)
                                await llm_to_tts_queue.put(pkt)

                                if pkt.packet_type == "llm":
                                    if pkt.payload is not None:
                                        assistant_reply_fragments.append(str(pkt.payload))
                                    if pkt.is_final:
                                        if pkt.payload and isinstance(pkt.payload, str) and len(pkt.payload) >= len("".join(assistant_reply_fragments[:-1])):
                                            reply = str(pkt.payload).strip()
                                        else:
                                            reply = "".join(assistant_reply_fragments).strip()
                                        if reply:
                                            full_assistant_reply.append(reply)
                                        assistant_reply_fragments.clear()

                        if not full_assistant_reply and assistant_reply_fragments:
                            full_assistant_reply.append("".join(assistant_reply_fragments).strip())

                        if full_assistant_reply:
                            combined_reply = " ".join(full_assistant_reply).strip()
                            await self.conversation_manager.append_assistant_message(session_id, combined_reply)

                        logger.info(f"[LLM COMPLETE {get_timestamp_str()}]")
                    finally:
                        await llm_to_tts_queue.put(None)

                # TTS CONSUMER TASK
                async def tts_consumer():
                    nonlocal t_tts_first_audio
                    async def text_chunk_generator():
                        while True:
                            pkt = await llm_to_tts_queue.get()
                            if pkt is None:
                                break
                            yield pkt

                    if self.tts_provider:
                        first_audio_chunk = True
                        async for pkt in self.tts_provider.stream(session_id, text_chunk_generator(), context={"profiler": profiler}):
                            if first_audio_chunk and pkt.payload:
                                first_audio_chunk = False
                                t_tts_first_audio = time.time()
                                ttfa_ms = (t_tts_first_audio - t_tts_request) * 1000
                                await self.conversation_manager.set_session_state(session_id, SessionState.SPEAKING)
                                ts = get_timestamp_str()
                                logger.info(f"[STATE {ts}] SPEAKING")
                                logger.info(f"[TTS FIRST AUDIO {ts}] TTFA: {ttfa_ms:.1f}ms (Streaming concurrent audio)")

                            await self.bus.publish(pkt)
                            tts_packets_collected.append(pkt)

                # Run LLM Producer and TTS Consumer CONCURRENTLY
                await asyncio.gather(llm_producer(), tts_consumer())

            # ----------------------------------------------------
            # PHASE 3: ANIMATION RELAY
            # ----------------------------------------------------
            if self.animation_provider and tts_packets_collected:
                async def tts_to_anim():
                    for p in tts_packets_collected:
                        yield p

                async for pkt in self.animation_provider.stream(session_id, tts_to_anim(), context={"profiler": profiler}):
                    await self.bus.publish(pkt)

            t_tts_complete = time.time()
            ts = get_timestamp_str()
            logger.info(f"[TTS COMPLETE {ts}]")
            await self.conversation_manager.set_session_state(session_id, SessionState.LISTENING)
            logger.info(f"[STATE {ts}] LISTENING")
            logger.info(f"[MIC RESTART {ts}]")
            profiler.mark("MIC_REOPEN")

            # Finalize profiler and persist CSV / JSON logs
            summary = profiler.finalize()
            print(profiler.get_console_report(), flush=True)
            profiler.save_logs("logs")
            profiler.save_logs("backend/logs")

            # Latency Metrics Computation
            t_now = time.time()
            duration_total = (t_now - t_pipeline_start) * 1000
            asr_latency = profiler.asr_data["asr_total_ms"]
            llm_ttft = profiler.llm_data["time_to_first_token_ms"]
            tts_ttfa = profiler.tts_data["time_to_first_audio_ms"]
            turn_latency = summary["totals"]["speech_to_first_audio_ms"]

            metrics = {
                "status": "complete",
                "duration_ms": duration_total,
                "turn_id": profiler.turn_id,
                "turn_number": profiler.turn_number,
                "asr_latency_ms": asr_latency,
                "llm_ttft_ms": llm_ttft,
                "llm_tps": profiler.llm_data["tokens_per_sec"],
                "tts_ttfa_ms": tts_ttfa,
                "playback_delay_ms": profiler.frontend_data["playback_delay_ms"],
                "lip_delay_ms": profiler.neurosync_data["lip_delay_ms"],
                "turn_to_speech_latency_ms": turn_latency,
                "profiler": summary
            }
            logger.info(f"[METRICS {ts}] TTFT: {llm_ttft:.1f}ms | TTFA: {tts_ttfa:.1f}ms | Turn-to-Audio: {turn_latency:.1f}ms | Total: {duration_total:.1f}ms")

            await self.bus.publish(PipelineStream.create_packet(
                session_id, 9999, "system", metrics, True
            ))
            logger.info(f"Pipeline stream complete for session {session_id}")

        except Exception as e:
            logger.error(f"Pipeline streaming error: {e}", exc_info=True)
            await self.bus.publish(PipelineStream.create_packet(
                session_id, 9999, "system", {"error": str(e)}, True
            ))
