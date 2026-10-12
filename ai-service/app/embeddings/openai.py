"""
OpenAI & OpenAI-compatible Embedding Adapter.
Supports OpenAI text-embedding-3-small, text-embedding-ada-002, or any /v1/embeddings compliant API.
"""

from __future__ import annotations

import logging
import os
import httpx
from app.embeddings.base import EmbeddingAdapter, EmbeddingAdapterError

logger = logging.getLogger(__name__)


class OpenAIEmbeddingAdapter(EmbeddingAdapter):
    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str | None = None,
        timeout_seconds: float = 20.0,
        dimension: int = 1536,
    ):
        self.api_key = api_key or os.getenv("OPENAI_API_KEY") or os.getenv("AI_API_KEY", "")
        self.base_url = (
            base_url
            or os.getenv("OPENAI_BASE_URL")
            or os.getenv("AI_BASE_URL")
            or "https://api.openai.com/v1"
        ).rstrip("/")
        self.model = (
            model
            or os.getenv("EMBEDDING_MODEL")
            or "text-embedding-3-small"
        )
        self.timeout_seconds = timeout_seconds
        self._dimension = dimension

    @property
    def dimension(self) -> int:
        return self._dimension

    async def get_embedding(self, text: str) -> list[float]:
        results = await self.get_embeddings([text])
        return results[0] if results else []

    async def get_embeddings(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []

        headers = {
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                res = await client.post(
                    f"{self.base_url}/embeddings",
                    headers=headers,
                    json={"model": self.model, "input": texts},
                )
                res.raise_for_status()
                data = res.json()
                sorted_items = sorted(data.get("data", []), key=lambda x: x.get("index", 0))
                embeddings = [item.get("embedding", []) for item in sorted_items]
                if embeddings and len(embeddings[0]) > 0:
                    self._dimension = len(embeddings[0])
                return embeddings
        except Exception as e:
            logger.error(f"Failed to generate embeddings via OpenAI ({self.base_url}): {e}")
            raise EmbeddingAdapterError(f"OpenAI embedding failure: {e}") from e
