import asyncio
import logging
from typing import Dict, Set
from core.streaming.StreamPacket import StreamPacket

logger = logging.getLogger(__name__)

class StreamBus:
    def __init__(self):
        self._subscribers: Dict[str, Set[asyncio.Queue]] = {}
    
    def subscribe(self, session_id: str) -> asyncio.Queue:
        if session_id not in self._subscribers:
            self._subscribers[session_id] = set()
        queue = asyncio.Queue()
        self._subscribers[session_id].add(queue)
        logger.debug(f"Subscribed to {session_id}")
        return queue
        
    def unsubscribe(self, session_id: str, queue: asyncio.Queue):
        if session_id in self._subscribers:
            self._subscribers[session_id].discard(queue)
            if not self._subscribers[session_id]:
                del self._subscribers[session_id]
        logger.debug(f"Unsubscribed from {session_id}")

    async def publish(self, packet: StreamPacket):
        session_id = packet.session_id
        if session_id in self._subscribers:
            for queue in self._subscribers[session_id]:
                await queue.put(packet)
