"""
Ollama Embedding Adapter.
Communicates with local or containerized Ollama instance via /api/embed or legacy /api/embeddings.
"""

from __future__ import annotations

import logging
import os
import httpx
from app.embeddings.base import EmbeddingAdapter, EmbeddingAdapterError

logger = logging.getLogger(__name__)


class OllamaEmbeddingAdapter(EmbeddingAdapter):
    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout_seconds: float = 15.0,
        dimension: int = 768,
    ):
        self.base_url = (
            base_url
            or os.getenv("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
        ).rstrip("/")
        self.model = (
            model
            or os.getenv("EMBEDDING_MODEL")
            or "nomic-embed-text:latest"
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

        try:
            async with httpx.AsyncClient(timeout=self.timeout_seconds) as client:
                # 1. Try modern batch /api/embed endpoint
                try:
                    res = await client.post(
                        f"{self.base_url}/api/embed",
                        json={"model": self.model, "input": texts},
                    )
                    if res.status_code == 200:
                        data = res.json()
                        embeddings = data.get("embeddings", [])
                        if embeddings:
                            if len(embeddings[0]) > 0:
                                self._dimension = len(embeddings[0])
                            return embeddings
                except Exception as e:
                    logger.debug(f"Ollama /api/embed failed, trying fallback: {e}")

                # 2. Fallback to /api/embeddings (single item prompt endpoint)
                batch_results: list[list[float]] = []
                for text in texts:
                    res_legacy = await client.post(
                        f"{self.base_url}/api/embeddings",
                        json={"model": self.model, "prompt": text},
                    )
                    if res_legacy.status_code == 200:
                        vec = res_legacy.json().get("embedding", [])
                        if vec and len(vec) > 0:
                            self._dimension = len(vec)
                        batch_results.append(vec)
                    else:
                        logger.warning(
                            f"Ollama legacy embedding error {res_legacy.status_code}: {res_legacy.text}"
                        )
                        batch_results.append([])
                return batch_results
        except Exception as e:
            logger.error(f"Failed to generate embeddings via Ollama ({self.base_url}): {e}")
            raise EmbeddingAdapterError(f"Ollama embedding failure: {e}") from e
