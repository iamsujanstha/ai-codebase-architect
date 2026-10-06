from contextlib import asynccontextmanager

import httpx

from app.config import Settings
from app.retrieval.base import NoRetrieval


@asynccontextmanager
async def create_retriever(settings: Settings, client: httpx.AsyncClient):
    if settings.retrieval == "none":
        yield NoRetrieval()
        return
    # Optional dependencies are not imported in the default chat-only path.
    from qdrant_client import AsyncQdrantClient

    from app.retrieval.qdrant import QdrantRetriever

    database = AsyncQdrantClient(url=settings.qdrant_url)
    try:
        retriever = QdrantRetriever(
            database,
            client,
            settings.embedding_model,
            settings.collection,
            settings.corpus,
        )
        await retriever.initialize()
        yield retriever
    finally:
        await database.close()
