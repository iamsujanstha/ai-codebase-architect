import asyncio
import logging
from typing import Any, Callable, Coroutine

logger = logging.getLogger(__name__)

class RequestQueue:
    """
    Simple Concurrency Controller (Queue-aware).
    
    Prevents overwhelming the local LLM runtime by ensuring only a 
    set number of generations happen simultaneously.
    """
    
    def __init__(self, concurrency: int = 1):
        self.semaphore = asyncio.Semaphore(concurrency)
        self.concurrency = concurrency

    async def run(self, func: Callable[..., Coroutine[Any, Any, Any]], *args, **kwargs):
        """Execute a function while respecting the concurrency limit."""
        if self.semaphore.locked():
            logger.info("Generation request queued. Waiting for previous request to finish...")
            
        async with self.semaphore:
            return await func(*args, **kwargs)

# Singleton instance: Local LLMs usually perform best with 1 concurrent request
request_queue = RequestQueue(concurrency=1)
