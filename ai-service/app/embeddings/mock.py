"""
Deterministic Mock Embedding Adapter.
Used for CI/CD, offline unit tests, and local sandboxes without live model servers.
"""

from __future__ import annotations

import hashlib
import math
from app.embeddings.base import EmbeddingAdapter


class MockEmbeddingAdapter(EmbeddingAdapter):
    """
    Generates deterministic pseudo-random unit vectors based on text hash.
    Ensures identical text produces identical embeddings with cosine similarity properties.
    """

    def __init__(self, dimension: int = 768):
        self._dimension = dimension

    @property
    def dimension(self) -> int:
        return self._dimension

    async def get_embedding(self, text: str) -> list[float]:
        results = await self.get_embeddings([text])
        return results[0]

    async def get_embeddings(self, texts: list[str]) -> list[list[float]]:
        output: list[list[float]] = []
        for text in texts:
            # Deterministic seed from MD5
            h = hashlib.md5(text.encode("utf-8")).digest()
            raw = [
                ((h[i % len(h)] + i * 17) % 100) / 100.0 - 0.5
                for i in range(self._dimension)
            ]
            norm = math.sqrt(sum(x * x for x in raw)) or 1.0
            output.append([x / norm for x in raw])
        return output
