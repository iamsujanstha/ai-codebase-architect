"""
Qdrant Adapter implementation.
Retains full standalone Qdrant support so it can be swapped back in at scale anytime.
"""

from __future__ import annotations

import os
import logging
from typing import Any

from app.vector_store.base import VectorStoreAdapter, VectorPoint

logger = logging.getLogger(__name__)


class QdrantStoreAdapter(VectorStoreAdapter):
    def __init__(self, qdrant_url: str | None = None):
        host = os.getenv("QDRANT_HOST", "vector-db")
        port = os.getenv("QDRANT_PORT", "6333")
        self.qdrant_url = qdrant_url or os.getenv("QDRANT_URL", f"http://{host}:{port}")
        self._client = None

    def _get_client(self):
        if self._client is None:
            from qdrant_client import AsyncQdrantClient
            self._client = AsyncQdrantClient(url=self.qdrant_url, check_compatibility=False)
        return self._client

    async def initialize(self, collection_name: str, dimension: int) -> None:
        from qdrant_client import models
        client = self._get_client()
        exists = await client.collection_exists(collection_name)
        if not exists:
            await client.create_collection(
                collection_name,
                vectors_config=models.VectorParams(size=dimension, distance=models.Distance.COSINE),
            )
            logger.info(f"Created Qdrant collection {collection_name} with dim {dimension}")

    async def upsert(self, collection_name: str, points: list[VectorPoint]) -> None:
        from qdrant_client import models
        if not points:
            return
        client = self._get_client()
        q_points = [
            models.PointStruct(id=int(p.id), vector=p.vector, payload=p.payload)
            for p in points
        ]
        await client.upsert(collection_name, points=q_points)

    async def search(
        self,
        collection_name: str,
        query_vector: list[float],
        limit: int = 4,
        score_threshold: float = 0.55,
    ) -> list[dict[str, Any]]:
        client = self._get_client()
        res = await client.query_points(
            collection_name=collection_name,
            query=query_vector,
            limit=limit,
            score_threshold=score_threshold,
        )
        return [
            {
                "id": str(pt.id),
                "score": pt.score,
                "payload": pt.payload or {},
            }
            for pt in res.points
        ]
