"""
Pluggable Embedding Providers module (Adapter & Factory Pattern).
"""

from app.embeddings.base import EmbeddingAdapter, EmbeddingAdapterError
from app.embeddings.ollama import OllamaEmbeddingAdapter
from app.embeddings.openai import OpenAIEmbeddingAdapter
from app.embeddings.mock import MockEmbeddingAdapter
from app.embeddings.factory import EmbeddingFactory, get_embedding_provider

__all__ = [
    "EmbeddingAdapter",
    "EmbeddingAdapterError",
    "OllamaEmbeddingAdapter",
    "OpenAIEmbeddingAdapter",
    "MockEmbeddingAdapter",
    "EmbeddingFactory",
    "get_embedding_provider",
]
