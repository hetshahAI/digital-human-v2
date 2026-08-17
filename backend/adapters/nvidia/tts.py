import logging
import asyncio
import threading
import time
from typing import AsyncGenerator
from queue import Queue, Empty

import riva.client
from config.settings import (
    NVIDIA_TTS_SERVER, NVIDIA_TTS_FUNCTION_ID, NVIDIA_API_KEY, NVIDIA_TTS_MODEL
)
from core.interfaces import TTSProvider
from core.streaming.StreamPacket import StreamPacket
from core.streaming.PipelineStream import PipelineStream

logger = logging.getLogger(__name__)

class NvidiaStreamingTTSProvider(TTSProvider):
    def __init__(self):
        self.auth = None
        self.service = None
        self.voice = NVIDIA_TTS_MODEL

    async def initialize(self) -> None:
        if not NVIDIA_API_KEY:
            raise ValueError("NVIDIA_API_KEY is not set.")
        
        self.auth = riva.client.Auth(
            uri=NVIDIA_TTS_SERVER,
            use_ssl=True,
            metadata_args=[
                ["authorization", f"Bearer {NVIDIA_API_KEY}"],
                ["function-id", NVIDIA_TTS_FUNCTION_ID]
            ]
        )
        self.service = riva.client.SpeechSynthesisService(self.auth)
        logger.info(f"NVIDIA Magpie TTS Provider initialized with model: {self.voice}")

    async def health(self) -> bool:
        return self.auth is not None

    async def shutdown(self) -> None:
        pass

    async def stream(self, session_id: str, text_stream: AsyncGenerator[StreamPacket, None]) -> AsyncGenerator[StreamPacket, None]:
        text_queue = Queue()
        result_queue = asyncio.Queue()
        is_text_complete = threading.Event()
        start_time = time.time()
        metrics = {
            "time_to_first_audio_ms": 0,
            "total_generation_ms": 0,
            "total_chunks": 0,
            "bytes_streamed": 0,
        }

        def riva_worker():
            try:
                first_chunk = True
                while not is_text_complete.is_set() or not text_queue.empty():
                    try:
                        sentence = text_queue.get(timeout=0.1)
                        if sentence is None:
                            break
                        
                        responses = self.service.synthesize_online(
                            text=sentence,
                            voice_name=self.voice,
                            language_code="en-US"
                        )
                        
                        for response in responses:
                            if not response.audio:
                                continue
                                
                            if first_chunk:
                                metrics["time_to_first_audio_ms"] = (time.time() - start_time) * 1000
                                first_chunk = False
                                
                            metrics["total_chunks"] += 1
                            metrics["bytes_streamed"] += len(response.audio)
                            
                            asyncio.run_coroutine_threadsafe(
                                result_queue.put((response.audio, False)), 
                                loop
                            )
                    except Empty:
                        continue
            except Exception as e:
                logger.error(f"Riva TTS stream error: {e}")
                asyncio.run_coroutine_threadsafe(
                    result_queue.put((e, True)),
                    loop
                )
            finally:
                metrics["total_generation_ms"] = (time.time() - start_time) * 1000
                asyncio.run_coroutine_threadsafe(
                    result_queue.put((None, True)), 
                    loop
                )

        loop = asyncio.get_running_loop()
        worker_thread = threading.Thread(target=riva_worker, daemon=True)
        worker_thread.start()

        async def text_feeder():
            buffer = ""
            FLUSH_CLAUSE_PUNCT = [',', ';', ':', '—', '--']
            FLUSH_SENTENCE_PUNCT = ['.', '!', '?', '\n']
            INACTIVITY_TIMEOUT = 0.40  # 400 ms inactivity timeout

            def count_words(s: str) -> int:
                return len([w for w in s.strip().split() if w])

            def flush_chunk(text_to_flush: str):
                text_to_flush = text_to_flush.strip()
                if text_to_flush and any(c.isalnum() for c in text_to_flush):
                    words = text_to_flush.split()
                    word_count = len(words)
                    ts = time.strftime("%H:%M:%S")
                    logger.info(f"[TTS CHUNK {ts}] \"{text_to_flush}\" | Size: {word_count} words")
                    text_queue.put(text_to_flush)

            # Read from text_stream into an internal queue so timeout cancellation does not kill generator
            incoming_queue: asyncio.Queue = asyncio.Queue()
            async def stream_reader():
                try:
                    async for pkt in text_stream:
                        await incoming_queue.put(pkt)
                finally:
                    await incoming_queue.put(None)

            reader_task = asyncio.create_task(stream_reader())

            try:
                while True:
                    try:
                        packet = await asyncio.wait_for(incoming_queue.get(), timeout=INACTIVITY_TIMEOUT)
                        if packet is None:
                            # Stream finished
                            if buffer.strip():
                                flush_chunk(buffer)
                                buffer = ""
                            break

                        if packet.payload:
                            buffer += str(packet.payload)

                        # Condition D: Sentence ending punctuation (. ! ? \n)
                        flushed = False
                        while any(p in buffer for p in FLUSH_SENTENCE_PUNCT):
                            min_idx = min([buffer.find(p) for p in FLUSH_SENTENCE_PUNCT if buffer.find(p) != -1])
                            chunk = buffer[:min_idx+1].strip()
                            buffer = buffer[min_idx+1:]
                            flush_chunk(chunk)
                            flushed = True

                        # Condition B: Clause boundary punctuation (, ; : —)
                        if not flushed and any(p in buffer for p in FLUSH_CLAUSE_PUNCT):
                            min_idx = min([buffer.find(p) for p in FLUSH_CLAUSE_PUNCT if buffer.find(p) != -1])
                            prefix = buffer[:min_idx+1].strip()
                            if count_words(prefix) >= 2 or len(prefix) >= 8:
                                chunk = prefix
                                buffer = buffer[min_idx+1:]
                                flush_chunk(chunk)
                                flushed = True

                        # Condition A: Word count threshold (3 to 7 words)
                        words = buffer.split()
                        if not flushed and len(words) >= 4:
                            if buffer.endswith(" ") or buffer.endswith("\t") or buffer.endswith("\n"):
                                chunk = buffer.strip()
                                buffer = ""
                                flush_chunk(chunk)
                            elif len(words) >= 7:
                                chunk = " ".join(words[:4])
                                buffer = " ".join(words[4:])
                                flush_chunk(chunk)

                        if packet.is_final:
                            if buffer.strip():
                                flush_chunk(buffer)
                                buffer = ""
                            break

                    except asyncio.TimeoutError:
                        # Condition C: Inactivity timeout (350-500ms) with buffered words
                        if buffer.strip() and any(c.isalnum() for c in buffer):
                            ts = time.strftime("%H:%M:%S")
                            logger.info(f"[TTS INACTIVITY FLUSH {ts}] \"{buffer.strip()}\" | Size: {count_words(buffer)} words")
                            flush_chunk(buffer)
                            buffer = ""

            except Exception as e:
                logger.error(f"Error feeding text to Riva TTS queue: {e}")
            finally:
                if buffer.strip():
                    flush_chunk(buffer)
                if not reader_task.done():
                    reader_task.cancel()
                is_text_complete.set()
                text_queue.put(None)

        feeder_task = asyncio.create_task(text_feeder())



        seq = 0
        try:
            while True:
                item, is_final_err = await result_queue.get()
                if item is None:
                    # Final packet
                    yield StreamPacket(
                        session_id=session_id,
                        sequence_number=seq,
                        packet_type="tts",
                        payload=b"",
                        is_final=True,
                        metadata=metrics
                    )
                    break
                
                if isinstance(item, Exception):
                    raise item

                yield PipelineStream.create_packet(
                    session_id=session_id,
                    sequence=seq,
                    packet_type="tts",
                    payload=item,
                    is_final=False
                )
                seq += 1
        finally:
            is_text_complete.set()
            text_queue.put(None)
            if not feeder_task.done():
                feeder_task.cancel()
