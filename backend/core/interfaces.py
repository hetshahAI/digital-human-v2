from abc import ABC, abstractmethod
from typing import Any, Dict, Optional, AsyncGenerator
from core.streaming.StreamPacket import StreamPacket

class BaseProvider(ABC):
    @abstractmethod
    async def initialize(self) -> None:
        pass

    @abstractmethod
    async def health(self) -> bool:
        pass

    @abstractmethod
    async def shutdown(self) -> None:
        pass

class ASRProvider(BaseProvider):
    @abstractmethod
    async def stream(self, session_id: str, audio_stream: AsyncGenerator[bytes, None]) -> AsyncGenerator[StreamPacket, None]:
        yield

class LLMProvider(BaseProvider):
    @abstractmethod
    async def stream(self, session_id: str, text_stream: AsyncGenerator[StreamPacket, None], context: Optional[Dict[str, Any]] = None) -> AsyncGenerator[StreamPacket, None]:
        yield

class TTSProvider(BaseProvider):
    @abstractmethod
    async def stream(self, session_id: str, text_stream: AsyncGenerator[StreamPacket, None]) -> AsyncGenerator[StreamPacket, None]:
        yield

class AnimationProvider(BaseProvider):
    @abstractmethod
    async def stream(self, session_id: str, audio_stream: AsyncGenerator[StreamPacket, None]) -> AsyncGenerator[StreamPacket, None]:
        yield
