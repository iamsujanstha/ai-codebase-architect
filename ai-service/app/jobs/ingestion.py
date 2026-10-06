"""RQ entry point: one event loop and resource lifetime per job."""

import asyncio

import httpx

from app.config import Settings
from app.retrieval.factory import create_retriever


def index_documents(documents: list[str]):
    async def run():
        config = Settings.from_env()
        if config.retrieval != "qdrant":
            raise ValueError("Indexing requires RETRIEVAL_BACKEND=qdrant")
        async with httpx.AsyncClient(
            base_url=config.ollama_base_url, timeout=config.timeout_seconds
        ) as client:
            async with create_retriever(config, client) as retriever:
                count = await retriever.index(documents)
                return {"status": "completed", "count": count}

    return asyncio.run(run())


def enqueue_documents(documents: list[str], job_id: str):
    """Internal integration helper, not a public document upload API."""
    from redis import Redis
    from rq import Queue

    config = Settings.from_env()
    with Redis.from_url(config.redis_url) as connection:
        job = Queue("ai_tasks", connection=connection).enqueue(
            index_documents,
            documents,
            job_id=job_id,
            job_timeout=600,
        )
        return job.id
