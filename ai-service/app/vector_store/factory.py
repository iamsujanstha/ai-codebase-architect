"""
Vector Store Factory (Factory & Registry Pattern).
Instantiates the configured VectorStoreAdapter implementation (pgvector by default, Qdrant, Memory, or custom).
"""

from __future__ import annotations

import os
import logging
from typing import Callable
from app.vector_store.base import VectorStoreAdapter
from app.vector_store.pgvector_adapter import PgVectorStoreAdapter
from app.vector_store.qdrant_adapter import QdrantStoreAdapter
from app.vector_store.memory_adapter import InMemoryVectorStoreAdapter

logger = logging.getLogger(__name__)


class VectorStoreFactory:
    """
    Open-Closed Factory for Vector Store Adapters.
    Allows dynamic registration of custom vector databases (Milvus, Pinecone, Chroma, etc.).
    """

    _registry: dict[str, Callable[..., VectorStoreAdapter]] = {}
    _instance: VectorStoreAdapter | None = None

    @classmethod
    def register(
        cls,
        provider_name: str,
        factory_fn: Callable[..., VectorStoreAdapter],
    ) -> None:
        """Register a new vector store provider."""
        key = provider_name.strip().lower()
        cls._registry[key] = factory_fn
        logger.info(f"Registered vector store adapter: '{key}'")

    @classmethod
    def create(
        cls,
        provider_name: str | None = None,
        **kwargs,
    ) -> VectorStoreAdapter:
        """Create a new VectorStoreAdapter instance for the given provider."""
        provider = (
            provider_name
            or os.getenv("VECTOR_STORE_PROVIDER", "pgvector")
        ).strip().lower()

        factory_fn = cls._registry.get(provider)
        if not factory_fn:
            valid = list(cls._registry.keys())
            raise ValueError(
                f"Unknown vector store provider: '{provider}'. Supported providers: {valid}"
            )
        return factory_fn(**kwargs)

    @classmethod
    def get_instance(
        cls,
        provider_name: str | None = None,
        **kwargs,
    ) -> VectorStoreAdapter:
        """Get or create singleton VectorStoreAdapter based on environment configuration."""
        if cls._instance is not None and provider_name is None:
            return cls._instance

        instance = cls.create(provider_name, **kwargs)
        if provider_name is None:
            cls._instance = instance
        return instance

    @classmethod
    def reset(cls) -> None:
        """Reset cached singleton instance (useful in tests)."""
        cls._instance = None


# Default Adapter Registrations
VectorStoreFactory.register(
    "pgvector",
    lambda **kw: PgVectorStoreAdapter(
        backend_url=kw.get("backend_url", os.getenv("BACKEND_URL", "http://backend:3000"))
    ),
)
VectorStoreFactory.register(
    "qdrant",
    lambda **kw: QdrantStoreAdapter(
        qdrant_url=kw.get("qdrant_url", kw.get("url", os.getenv("QDRANT_URL", "http://qdrant:6333")))
    ),
)
VectorStoreFactory.register(
    "memory",
    lambda **kw: InMemoryVectorStoreAdapter(),
)
VectorStoreFactory.register(
    "in_memory",
    lambda **kw: InMemoryVectorStoreAdapter(),
)


def get_vector_store(provider_name: str | None = None) -> VectorStoreAdapter:
    """
    Returns the active VectorStoreAdapter based on VECTOR_STORE_PROVIDER env var.
    Defaults to 'pgvector'. Set to 'qdrant' to switch to Qdrant, or 'memory' for offline testing.
    """
    return VectorStoreFactory.get_instance(provider_name)
