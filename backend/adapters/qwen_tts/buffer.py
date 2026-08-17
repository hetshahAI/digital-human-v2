import time
import logging
import asyncio
from typing import AsyncGenerator, Optional, List, Tuple
from core.streaming.StreamPacket import StreamPacket

logger = logging.getLogger(__name__)

class TokenChunkBuffer:
    """
    Incremental text chunker for Qwen3-TTS.
    Flushes immediately after:
    - 3 to 5 words
    - 250 ms timeout
    - Clause/sentence punctuation
    - Stream completion
    Preserves word order, eliminates duplication, and avoids full-sentence buffering.
    """
    def __init__(
        self,
        min_words: int = 3,
        max_words: int = 5,
        timeout_s: float = 0.250
    ):
        self.min_words = min_words
        self.max_words = max_words
        self.timeout_s = timeout_s
        self.clause_punct = [',', ';', ':', '—', '--']
        self.sentence_punct = ['.', '!', '?', '\n']

    def count_words(self, text: str) -> int:
        return len([w for w in text.strip().split() if w])

    async def process_stream(
        self,
        text_stream: AsyncGenerator[StreamPacket, None]
    ) -> AsyncGenerator[Tuple[str, int, str], None]:
        """
        Yields (chunk_text, word_count, flush_reason)
        """
        buffer = ""
        incoming_queue: asyncio.Queue = asyncio.Queue()

        async def reader():
            try:
                async for pkt in text_stream:
                    await incoming_queue.put(pkt)
            finally:
                await incoming_queue.put(None)

        reader_task = asyncio.create_task(reader())

        try:
            while True:
                try:
                    packet = await asyncio.wait_for(incoming_queue.get(), timeout=self.timeout_s)
                    if packet is None:
                        # End of stream
                        clean_buf = buffer.strip()
                        if clean_buf and any(c.isalnum() for c in clean_buf):
                            w_count = self.count_words(clean_buf)
                            logger.info(f"[TTS CHUNK {time.strftime('%H:%M:%S')}] \"{clean_buf}\" | Size: {w_count} words (Stream End)")
                            yield clean_buf, w_count, "stream_end"
                        break

                    if packet.payload:
                        tok = str(packet.payload)
                        logger.debug(f"[TTS TOKEN {time.strftime('%H:%M:%S')}] '{tok}'")
                        buffer += tok

                    # 1. Sentence ending punctuation check
                    while any(p in buffer for p in self.sentence_punct):
                        min_idx = min([buffer.find(p) for p in self.sentence_punct if buffer.find(p) != -1])
                        chunk = buffer[:min_idx+1].strip()
                        buffer = buffer[min_idx+1:]
                        if chunk and any(c.isalnum() for c in chunk):
                            w_count = self.count_words(chunk)
                            logger.info(f"[TTS CHUNK {time.strftime('%H:%M:%S')}] \"{chunk}\" | Size: {w_count} words (Sentence Punct)")
                            yield chunk, w_count, "sentence_punct"

                    # 2. Clause punctuation check
                    if any(p in buffer for p in self.clause_punct):
                        min_idx = min([buffer.find(p) for p in self.clause_punct if buffer.find(p) != -1])
                        prefix = buffer[:min_idx+1].strip()
                        if self.count_words(prefix) >= 2 or len(prefix) >= 8:
                            chunk = prefix
                            buffer = buffer[min_idx+1:]
                            if chunk and any(c.isalnum() for c in chunk):
                                w_count = self.count_words(chunk)
                                logger.info(f"[TTS CHUNK {time.strftime('%H:%M:%S')}] \"{chunk}\" | Size: {w_count} words (Clause Punct)")
                                yield chunk, w_count, "clause_punct"

                    # 3. Word count threshold (3-5 words)
                    words = buffer.split()
                    if len(words) >= self.min_words:
                        if buffer.endswith(" ") or buffer.endswith("\t") or buffer.endswith("\n") or len(words) >= self.max_words:
                            split_idx = min(self.max_words, len(words))
                            chunk = " ".join(words[:split_idx])
                            buffer = " ".join(words[split_idx:])
                            if buffer and not buffer.startswith(" "):
                                buffer = " " + buffer
                            if chunk and any(c.isalnum() for c in chunk):
                                w_count = self.count_words(chunk)
                                logger.info(f"[TTS CHUNK {time.strftime('%H:%M:%S')}] \"{chunk}\" | Size: {w_count} words (Word Count)")
                                yield chunk, w_count, "word_count"

                    if packet.is_final:
                        clean_buf = buffer.strip()
                        if clean_buf and any(c.isalnum() for c in clean_buf):
                            w_count = self.count_words(clean_buf)
                            logger.info(f"[TTS CHUNK {time.strftime('%H:%M:%S')}] \"{clean_buf}\" | Size: {w_count} words (Packet Final)")
                            yield clean_buf, w_count, "packet_final"
                            buffer = ""
                        break

                except asyncio.TimeoutError:
                    # Inactivity timeout (250 ms)
                    clean_buf = buffer.strip()
                    if clean_buf and any(c.isalnum() for c in clean_buf):
                        w_count = self.count_words(clean_buf)
                        logger.info(f"[TTS CHUNK {time.strftime('%H:%M:%S')}] \"{clean_buf}\" | Size: {w_count} words (250ms Timeout)")
                        yield clean_buf, w_count, "timeout"
                        buffer = ""

        finally:
            clean_buf = buffer.strip()
            if clean_buf and any(c.isalnum() for c in clean_buf):
                w_count = self.count_words(clean_buf)
                yield clean_buf, w_count, "finally"
            if not reader_task.done():
                reader_task.cancel()
