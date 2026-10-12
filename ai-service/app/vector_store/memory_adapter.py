"""
In-Memory Vector Store Adapter.
Provides zero-dependency, pure Python cosine similarity vector search for offline development & tests.
"""

from __future__ import annotations

import math
import logging
from typing import Any
from app.vector_store.base import VectorStoreAdapter, VectorPoint

logger = logging.getLogger(__name__)


def _cosine_similarity(vec1: list[float], vec2: list[float]) -> float:
    if not vec1 or not vec2 or len(vec1) != len(vec2):
        return 0.0
    dot = sum(a * b for a, b in zip(vec1, vec2))
    norm_a = math.sqrt(sum(a * a for a in vec1))
    norm_b = math.sqrt(sum(b * b for b in vec2))
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0
    return dot / (norm_a * norm_b)


class InMemoryVectorStoreAdapter(VectorStoreAdapter):
    """
    Ephemerally stores vectors in memory with exact nearest neighbor search via cosine similarity.
    """

    def __init__(self):
        self._collections: dict[str, dict[str | int, VectorPoint]] = {}
        self._dimensions: dict[str, int] = {}

    async def initialize(self, collection_name: str, dimension: int) -> None:
        if collection_name not in self._collections:
            self._collections[collection_name] = {}
        self._dimensions[collection_name] = dimension
        logger.info(f"InMemoryVectorStore: Initialized collection '{collection_name}' (dim: {dimension})")

    async def upsert(self, collection_name: str, points: list[VectorPoint]) -> None:
        if collection_name not in self._collections:
            self._collections[collection_name] = {}
        for pt in points:
            self._collections[collection_name][pt.id] = pt

    async def search(
        self,
        collection_name: str,
        query_vector: list[float],
        limit: int = 4,
        score_threshold: float = 0.55,
    ) -> list[dict[str, Any]]:
        collection = self._collections.get(collection_name, {})
        if not collection or not query_vector:
            return []

        scored: list[dict[str, Any]] = []
        for pt_id, pt in collection.items():
            sim = _cosine_similarity(query_vector, pt.vector)
            if sim >= score_threshold:
                scored.append({
                    "id": str(pt.id),
                    "score": round(sim, 4),
                    "payload": pt.payload,
                })

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:limit]
