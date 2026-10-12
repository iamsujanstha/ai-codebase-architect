"""
Embedding Provider Factory with Open Registration Pattern.
Decouples application code from concrete embedding backends (Ollama, OpenAI, Mock, etc.).
"""

from __future__ import annotations

import logging
import os
from typing import Callable
from app.embeddings.base import EmbeddingAdapter
from app.embeddings.ollama import OllamaEmbeddingAdapter
from app.embeddings.openai import OpenAIEmbeddingAdapter
from app.embeddings.mock import MockEmbeddingAdapter

logger = logging.getLogger(__name__)


class EmbeddingFactory:
    """
    Extensible Factory for Embedding Adapters.
    New providers can be registered dynamically via `EmbeddingFactory.register()`.
    """

    _registry: dict[str, Callable[..., EmbeddingAdapter]] = {}
    _instances: dict[str, EmbeddingAdapter] = {}

    @classmethod
    def register(
        cls,
        provider_name: str,
        factory_fn: Callable[..., EmbeddingAdapter],
    ) -> None:
        """Register a new embedding provider factory function."""
        key = provider_name.strip().lower()
        cls._registry[key] = factory_fn
        logger.info(f"Registered embedding provider adapter: '{key}'")

    @classmethod
    def create(
        cls,
        provider_name: str | None = None,
        **kwargs,
    ) -> EmbeddingAdapter:
        """Create a fresh instance of the specified provider."""
        name = (
            provider_name
            or os.getenv("EMBEDDING_PROVIDER")
            or os.getenv("AI_PROVIDER", "ollama")
        ).strip().lower()

        factory_fn = cls._registry.get(name)
        if not factory_fn:
            valid = list(cls._registry.keys())
            raise ValueError(
                f"Unknown embedding provider: '{name}'. Supported providers: {valid}"
            )
        return factory_fn(**kwargs)

    @classmethod
    def get_instance(
        cls,
        provider_name: str | None = None,
        **kwargs,
    ) -> EmbeddingAdapter:
        """Get or create a cached singleton adapter for the given provider."""
        name = (
            provider_name
            or os.getenv("EMBEDDING_PROVIDER")
            or os.getenv("AI_PROVIDER", "ollama")
        ).strip().lower()

        if name not in cls._instances:
            cls._instances[name] = cls.create(name, **kwargs)
        return cls._instances[name]

    @classmethod
    def reset(cls) -> None:
        """Reset cached instances (useful in tests)."""
        cls._instances.clear()


# Default registrations
EmbeddingFactory.register("ollama", lambda **kw: OllamaEmbeddingAdapter(**kw))
EmbeddingFactory.register("openai", lambda **kw: OpenAIEmbeddingAdapter(**kw))
EmbeddingFactory.register("mock", lambda **kw: MockEmbeddingAdapter(**kw))


def get_embedding_provider(provider_name: str | None = None, **kwargs) -> EmbeddingAdapter:
    """
    Convenience accessor for obtaining the active EmbeddingAdapter.
    Defaults to EMBEDDING_PROVIDER or AI_PROVIDER from env (or 'ollama').
    """
    return EmbeddingFactory.get_instance(provider_name, **kwargs)
