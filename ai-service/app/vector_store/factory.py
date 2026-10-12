"""
Vector Store Factory.
Instantiates the configured VectorStoreAdapter implementation (pgvector by default).
"""

from __future__ import annotations

import os
import logging
from app.vector_store.base import VectorStoreAdapter
from app.vector_store.pgvector_adapter import PgVectorStoreAdapter
from app.vector_store.qdrant_adapter import QdrantStoreAdapter

logger = logging.getLogger(__name__)

_instance: VectorStoreAdapter | None = None


def get_vector_store() -> VectorStoreAdapter:
    """
    Returns the active VectorStoreAdapter based on VECTOR_STORE_PROVIDER env var.
    Defaults to 'pgvector'. Set to 'qdrant' to switch back to dedicated Qdrant engine.
    """
    global _instance
    if _instance is not None:
        return _instance

    provider = os.getenv("VECTOR_STORE_PROVIDER", "pgvector").lower().strip()
    backend_url = os.getenv("BACKEND_URL", "http://backend:3000")

    if provider == "qdrant":
        logger.info("Vector Store Provider: QdrantStoreAdapter (Active)")
        _instance = QdrantStoreAdapter()
    else:
        logger.info("Vector Store Provider: PgVectorStoreAdapter via Neon PostgreSQL (Active)")
        _instance = PgVectorStoreAdapter(backend_url=backend_url)

    return _instance
