"""
pgvector Adapter implementation.
Delegates vector operations to PostgreSQL via the backend gateway API or direct SQL,
leveraging Neon PostgreSQL's native vector extension and HNSW index.
"""

from __future__ import annotations

import logging
from typing import Any
import httpx

from app.vector_store.base import VectorStoreAdapter, VectorPoint

logger = logging.getLogger(__name__)


class PgVectorStoreAdapter(VectorStoreAdapter):
    def __init__(self, backend_url: str):
        self.backend_url = backend_url.rstrip("/")

    async def initialize(self, collection_name: str, dimension: int) -> None:
        logger.info(
            f"Initialized PgVectorStoreAdapter for {collection_name} (dimensions: {dimension})"
        )

    async def upsert(self, collection_name: str, points: list[VectorPoint]) -> None:
        if not points:
            return
        payload_items = [
            {"productId": int(p.id), "vector": p.vector}
            for p in points
        ]
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(
                    f"{self.backend_url}/catalog/embeddings/sync",
                    json={"items": payload_items},
                )
                if res.status_code in (200, 201):
                    logger.info(f"Successfully synced {len(points)} vectors to pgvector.")
                else:
                    logger.warning(
                        f"pgvector sync returned status {res.status_code}: {res.text}"
                    )
        except Exception as e:
            logger.error(f"Failed to sync vectors to pgvector: {e}")

    async def search(
        self,
        collection_name: str,
        query_vector: list[float],
        limit: int = 4,
        score_threshold: float = 0.55,
    ) -> list[dict[str, Any]]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(
                    f"{self.backend_url}/catalog/semantic-search",
                    json={
                        "vector": query_vector,
                        "limit": limit,
                        "minScore": score_threshold,
                    },
                )
                if res.status_code in (200, 201):
                    data = res.json()
                    products = data.get("products", [])
                    return [
                        {
                            "id": str(p.get("id")),
                            "score": float(p.get("score", 0.0)),
                            "payload": {
                                "product_id": str(p.get("id")),
                                "name": p.get("name"),
                                "category": p.get("category"),
                                "price": float(p.get("price", 0)),
                            },
                        }
                        for p in products
                    ]
                logger.warning(f"pgvector search error {res.status_code}: {res.text}")
                return []
        except Exception as e:
            logger.error(f"Error executing pgvector search: {e}")
            return []
