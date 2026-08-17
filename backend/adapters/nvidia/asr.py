import logging
import asyncio
import threading
from typing import AsyncGenerator
from queue import Queue, Empty

import riva.client
from config.settings import NVIDIA_ASR_SERVER, NVIDIA_ASR_FUNCTION_ID, NVIDIA_API_KEY
from core.interfaces import ASRProvider
from core.streaming.StreamPacket import StreamPacket
from core.streaming.PipelineStream import PipelineStream

logger = logging.getLogger(__name__)

class NvidiaStreamingASR(ASRProvider):
    def __init__(self):
        self.auth = None
        self.service = None
        self.streaming_config = None

    async def initialize(self) -> None:
        if not NVIDIA_API_KEY:
            raise ValueError("NVIDIA_API_KEY is not set.")
        
        self.auth = riva.client.Auth(
            uri=NVIDIA_ASR_SERVER,
            use_ssl=True,
            metadata_args=[
                ["authorization", f"Bearer {NVIDIA_API_KEY}"],
                ["function-id", NVIDIA_ASR_FUNCTION_ID]
            ]
        )
        self.service = riva.client.ASRService(self.auth)

        offline_config = riva.client.RecognitionConfig(
            encoding=riva.client.AudioEncoding.LINEAR_PCM,
            sample_rate_hertz=16000,
            audio_channel_count=1,
            max_alternatives=1,
            enable_automatic_punctuation=True,
            verbatim_transcripts=False,
            language_code="en-US"
        )
        self.streaming_config = riva.client.StreamingRecognitionConfig(
            config=offline_config,
            interim_results=True
        )
        logger.info("NVIDIA Riva ASR Provider initialized.")

    async def health(self) -> bool:
        return self.auth is not None

    async def shutdown(self) -> None:
        pass

    async def stream(self, session_id: str, audio_stream: AsyncGenerator[bytes, None]) -> AsyncGenerator[StreamPacket, None]:
        audio_queue = Queue()
        result_queue = asyncio.Queue()
        is_audio_complete = threading.Event()

        def audio_chunk_iterator():
            while not is_audio_complete.is_set() or not audio_queue.empty():
                try:
                    chunk = audio_queue.get(timeout=0.1)
                    if chunk is None:
                        break
                    yield chunk
                except Empty:
                    continue

        def riva_worker():
            try:
                responses = self.service.streaming_response_generator(
                    audio_chunks=audio_chunk_iterator(),
                    streaming_config=self.streaming_config
                )
                for response in responses:
                    if not response.results:
                        continue
                    result = response.results[0]
                    transcript = result.alternatives[0].transcript
                    is_final = result.is_final
                    
                    asyncio.run_coroutine_threadsafe(
                        result_queue.put((transcript, is_final)), 
                        loop
                    )
            except Exception as e:
                logger.error(f"Riva stream error: {e}")
                asyncio.run_coroutine_threadsafe(
                    result_queue.put((e, True)),
                    loop
                )
            finally:
                asyncio.run_coroutine_threadsafe(
                    result_queue.put((None, True)), 
                    loop
                )

        loop = asyncio.get_running_loop()
        worker_thread = threading.Thread(target=riva_worker, daemon=True)
        worker_thread.start()

        async def audio_feeder():
            try:
                async for chunk in audio_stream:
                    audio_queue.put(chunk)
            except Exception as e:
                logger.error(f"Error feeding audio to Riva queue: {e}")
            finally:
                is_audio_complete.set()
                audio_queue.put(None)

        feeder_task = asyncio.create_task(audio_feeder())

        seq = 0
        try:
            while True:
                item, is_final = await result_queue.get()
                if item is None:
                    break
                
                if isinstance(item, Exception):
                    raise item

                yield PipelineStream.create_packet(
                    session_id=session_id,
                    sequence=seq,
                    packet_type="asr",
                    payload=item,
                    is_final=is_final
                )
                seq += 1
        finally:
            is_audio_complete.set()
            audio_queue.put(None)
            if not feeder_task.done():
                feeder_task.cancel()
