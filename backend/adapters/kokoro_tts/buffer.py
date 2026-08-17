import time
import logging
import asyncio
from typing import AsyncGenerator, Optional, List, Tuple, Any
from core.streaming.StreamPacket import StreamPacket

logger = logging.getLogger(__name__)

# ── Prosody-aware chunking constants ────────────────────────────────

# Word combinations almost never sound natural as chunk endings.
# These should NOT be chunk boundaries — the word following belongs with the phrase.
_BOUNDEY_AVOID: Tuple[str, ...] = (
    "my name",
    "is alicia",
    "i can",
    "you can",
    "how can",
    "would like",
    "going to",
    "have to",
    "need to",
    "able to",
    "used to",
    "trying to",
    "want to",
)

# Words that should NOT end a chunk — they belong with the following phrase.
# Splitting after these creates robotic, staccato speech.
_WORD_END_AVOID: Tuple[str, ...] = (
    # Constraints specifically mandated for PROJECT 039
    "i",
    "you",
    "he",
    "she",
    "it",
    "we",
    "they",
    "my",
    "your",
    "our",
    "is",
    "am",
    "are",
    "was",
    "were",
    "to",
    "of",
    "in",
    "on",
    "at",
    "for",
    "with",
    "can",
    "could",
    "will",
    "would",
    "should",
    "may",
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "because",
    "if",
    "then",
    "that",
    "which",
    "who",
    "whose",
    "where",
    "when",
    "unless",
    "until",
    "since",
    "otherwise",
    "while",
    "although",
    "however",
    "therefore",
    "than",
)

# Preferred chunk boundary locations, in priority order.
# Priority 1: Sentence end (. ? !)
# Priority 2: Pause punctuation (, ; : —)
# Priority 3: Boundary avoidance (don't split after forbidden words/phrases)
# Priority 4: Word-count fallback (only when no linguistic boundary available)
# Priority 5: Adaptive timeout as safety net only

# Satzung markers — strongest natural break points
_SENTENCE_ENDERS = (".", "?", "!")

# Punctuation that indicates a natural pause within continuing speech
_PAUSE_PUNCTUATION = (",", ";", ":", "—", "--")


# ── Helper: check if text ends with a "bad" boundary avoid phrase ──────

def _avoids_boundary(text: str) -> bool:
    """Return True if *text* ends with one of the _BOUNDEY_AVOID phrases.

    Case-insensitive, allows trailing whitespace.
    """
    stripped = text.strip().lower()
    for phrase in _BOUNDEY_AVOID:
        if stripped.endswith(phrase):
            return True
    return False


# ── Helper: check if the last word of text is a "word-end" avoid word ─

def _word_ends_with_avoid(text: str) -> bool:
    """Return True if the last word of *text* is in _WORD_END_AVOID.

    Case-insensitive. Punctuation after the word is ignored for the check.
    """
    stripped = text.strip()
    if not stripped:
        return False
    # Remove trailing punctuation for word-check
    cleaned = stripped.rstrip(",.;:—-")
    words = cleaned.split()
    if not words:
        return False
    last_word = words[-1].lower()
    return last_word in {w.lower() for w in _WORD_END_AVOID}


# ── Helper: find word-level flush point in buffered text ──────────────

def _find_flush_point(
    buffer: str,
    *,
    is_first_chunk: bool = False,
    min_words: int = 2,
    target_words: int = 6,
    max_words: int = 8,
) -> Tuple[int, str]:
    """Find the optimal flush point in *buffer* using prosody-aware scoring.

    Returns (flush_index, reason) where *flush_index* is the character position
    in *buffer* at which to flush (i.e. yield buffer[:flush_index]).

    Scoring priority (highest first):
      1. Sentence ending (. ? !) — complete thought, finish current sentence
      2. Pause punctuation (, ; : —) — natural speaking pause/clause break
      3. Boundary avoidance — don't split after forbidden word combinations
      4. Word-count fallback — flush at reasonable word count
      5. Safety: never let flush index be 0 if there's content
    """
    if not buffer or not buffer.strip():
        return 0, "empty"

    work = buffer.strip()
    words = work.split()
    if not words:
        return 0, "empty"

    word_count = len(words)

    # ── Priority 1: Sentence ending (. ? !) ────────────────────────
    # Scan from the rightmost word backward to find a sentence ender.
    # We look for . ? ! that end a word (i.e., the last character of a word).
    for i in range(word_count - 1, -1, -1):
        # Check if word i ends with a sentence ender
        if words[i] and words[i][-1] in _SENTENCE_ENDERS:
            # Verify it's a true sentence end: the punctuation is the last char
            # of the word, and there's nothing after this word in the buffer.
            # Build text up to and including this word
            candidate_text = " ".join(words[: i + 1])
            # Check that after this word, the remaining buffer starts fresh
            # (either buffer ends here or starts with a new sentence)
            remaining = buffer[len(candidate_text):].strip()
            if not remaining or remaining[0] in (" ", "\t"):
                # This is a true sentence end — flush after this word
                # Character index after this word including the space
                char_idx = len(candidate_text) - 1  # -1 to not include trailing space double-count
                # But we want to include the word + its ending punctuation
                # Find the actual char position of the last char of word i
                pos = 0
                for j in range(i):
                    pos += len(words[j]) + 1  # word + space
                # pos is the start of word i; we want to flush after word i
                # that's pos + len(words[i]) chars (including the word, excluding the space after)
                flush_idx = pos + len(words[i])  # after the word, before the space
                return flush_idx, "sentence_end"

    # ── Priority 2: Pause punctuation (, ; : —) ───────────────────
    # Find the last word that contains/pauses with pause punctuation.
    # Search from right to left for a word ending with , ; : —
    for i in range(word_count - 1, -1, -1):
        if words[i] and words[i][-1] in _PAUSE_PUNCTUATION:
            candidate_text = " ".join(words[: i + 1])
            remaining = buffer[len(candidate_text):].strip()
            if not remaining or remaining[0] in (" ", "\t"):
                # Valid pause punctuation flush point
                pos = 0
                for j in range(i):
                    pos += len(words[j]) + 1
                flush_idx = pos + len(words[i])  # after the word with punctuation
                # Double-check this isn't a "bad" boundary
                if not _avoids_boundary(candidate_text) and not _word_ends_with_avoid(
                    candidate_text
                ):
                    return flush_idx, f"pause_punct:{words[i][-1]}"

    # ── Priority 3: Boundary avoidance — don't split after forbidden combos ────
    # Wait until we reach our target words before triggering a fallback semantic boundary flush
    if word_count < target_words:
        return 0, "waiting_for_words"

    # Scan from right to left; find the first position where flushing would NOT
    # create a bad boundary. We prefer to flush JUST BEFORE a forbidden phrase.
    for i in range(word_count, 0, -1):
        candidate_text = " ".join(words[:i])
        if not _avoids_boundary(candidate_text) and not _word_ends_with_avoid(
            candidate_text
        ):
            # This is a safe flush point — flush after i words
            pos = 0
            for j in range(i - 1):
                pos += len(words[j]) + 1
            flush_idx = pos + len(words[i - 1])  # after word i-1 (0-indexed)
            return flush_idx, "boundary_safe"

    # ── Priority 4: Word-count fallback ──────────────────────────────
    # Try to flush at a reasonable word count, adjusting for bad boundaries.
    # Priority: 6 words, then 5, then 4, then 3, then hold last word
    for attempt in (6, 5, 4, 3):
        if attempt >= word_count:
            continue
        candidate = " ".join(words[:attempt])
        if not _avoids_boundary(candidate) and not _word_ends_with_avoid(candidate):
            # Character position after 'attempt' words
            pos = sum(len(w) + 1 for w in words[:attempt])  # +1 for each space
            # Don't include the trailing space after the last word
            flush_idx = pos
            return flush_idx, f"word_count:{attempt}"

    # Last resort word-count: flush all but one word (hold the partial word)
    if word_count > 1:
        candidate = " ".join(words[:-1])
        if not _avoids_boundary(candidate) and not _word_ends_with_avoid(candidate):
            pos = sum(len(w) + 1 for w in words[:-1])
            flush_idx = pos
            return flush_idx, "word_count:hold_last"

    # Ultimate fallback: flush entire buffer
    return len(buffer), "fallback_full"


# ── Core chunk buffer class ──────────────────────────────────────────

class KokoroTokenChunkBuffer:
    """
    Kokoro-82M Prosody-Aware Intelligent Token Chunk Buffer.

    Replaces word-count-driven chunking with linguistically-informed flush points.
    Chooses natural break points (sentence ends, clause boundaries, comma pauses)
    rather than arbitrary word counts, producing speech that sounds like a natural
    human instead of robotic phrase fragments.

    Optimizations (Project 036+):
    1. Prosody-aware flush points: sentence ends > pause punctuation > boundary avoidance > word-count.
    2. Boundary avoidance: never split after forbidden word combinations.
    3. Word-end avoidance: never end a chunk with forbidden conjunctions/subordinators.
    4. Priority-based scoring: sentence end > clause end > comma > word-count fallback.
    5. Timeout remains only as safety net.
    """

    def __init__(
        self,
        target_words: int = 6,
        min_words: int = 2,
        max_words: int = 8,
        timeout_s: float = 0.100,
    ):
        self.target_words = target_words
        self.min_words = min_words
        self.max_words = max_words
        self.timeout_s = timeout_s
        self.punctuation = ",;:—-"

    def count_words(self, text: str) -> int:
        return len([w for w in text.strip().split() if w])

    def get_adaptive_timeout(self, buffer_text: str) -> float:
        """Return safety timeout (Rollback to stable values from before PROJECT 037/038)."""
        w_count = self.count_words(buffer_text)
        if w_count <= 1:
            return 0.250  # 250 ms timeout for 1 word
        elif w_count == 2:
            return 0.180  # 180 ms timeout for 2 words
        else:
            return 0.120  # 120 ms timeout for 3+ words

    async def process_stream(
        self,
        text_stream: AsyncGenerator,
        profiler: Optional[Any] = None
    ) -> AsyncGenerator[Tuple[str, int, str], None]:
        """Process token stream and yield (chunk_text, word_count, flush_reason).

        Uses prosody-aware chunking to produce natural-sounding speech flow.
        """
        buffer = ""
        incoming_queue: asyncio.Queue = asyncio.Queue()
        first_token_received = False
        first_chunk_flushed = False

        async def reader():
            try:
                async for pkt in text_stream:
                    await incoming_queue.put(pkt)
            finally:
                await incoming_queue.put(None)

        reader_task = asyncio.create_task(reader())

        try:
            while True:
                current_timeout = self.get_adaptive_timeout(buffer)
                try:
                    packet = await asyncio.wait_for(incoming_queue.get(), timeout=current_timeout)
                    if packet is None:
                        # End of stream — flush remaining
                        clean_buf = buffer.strip()
                        if clean_buf and any(c.isalnum() for c in clean_buf):
                            w_count = self.count_words(clean_buf)
                            if not first_chunk_flushed and profiler:
                                first_chunk_flushed = True
                                profiler.mark("FIRST_TEXT_CHUNK")
                            yield clean_buf, w_count, "stream_end"
                        break

                    if packet.payload:
                        tok = str(packet.payload)
                        if not first_token_received:
                            first_token_received = True
                            if profiler:
                                profiler.mark("FIRST_TTS_REQUEST")
                        buffer += tok
                        w_count = self.count_words(buffer)

                        # ── Attempt to find a prosody-aware flush point ───────
                        flush_idx, flush_reason = _find_flush_point(
                            buffer,
                            is_first_chunk=not first_chunk_flushed,
                        )

                        if flush_idx > 0 and flush_idx < len(buffer):
                            # Yield the chunk up to flush_idx
                            chunk = buffer[:flush_idx].strip()
                            # remaining stays in buffer
                            buffer = buffer[flush_idx:].strip()
                            # Ensure buffer doesn't start with space artifact
                            if buffer and not buffer.startswith(" "):
                                buffer = " " + buffer if buffer else ""
                            w_count = self.count_words(chunk) if chunk else 0

                            logger.info(
                                f"[TTS CHUNK] \"{chunk}\" | Size: {w_count} words "
                                f"({flush_reason})"
                            )
                            if not first_chunk_flushed and profiler:
                                first_chunk_flushed = True
                                profiler.mark("FIRST_TEXT_CHUNK")
                            yield chunk, w_count, flush_reason
                        else:
                            # No optimal flush point found yet; wait for more data
                            continue

                except asyncio.TimeoutError:
                    # Safety timeout — flush remaining buffer
                    if buffer.strip():
                        clean_buf = buffer.strip()
                        w_count = self.count_words(clean_buf)
                        timeout_ms = int(current_timeout * 1000)
                        logger.info(
                            f"[TTS BUFFER] {self.count_words(buffer)} words remaining "
                            f"({timeout_ms}ms safety timeout)"
                        )
                        if not first_chunk_flushed and profiler:
                            first_chunk_flushed = True
                            profiler.mark("FIRST_TEXT_CHUNK")
                        yield clean_buf, w_count, "timeout"
                    break

        finally:
            clean_buf = buffer.strip()
            if clean_buf and any(c.isalnum() for c in clean_buf):
                w_count = self.count_words(clean_buf)
                yield clean_buf, w_count, "finally"
            if not reader_task.done():
                reader_task.cancel()