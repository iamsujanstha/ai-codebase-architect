"""
Abstract Vector Store Adapter Interface (Adapter Pattern).
Allows seamless switching between pgvector, Qdrant, or any future vector engine.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Union
from pydantic import BaseModel, Field


class VectorPoint(BaseModel):
    id: Union[int, str]
    vector: List[float]
    payload: Dict[str, Any] = Field(default_factory=dict)


class VectorStoreAdapter(ABC):
    """
    Contract for vector storage and approximate nearest neighbor (ANN) search.
    """

    @abstractmethod
    async def initialize(self, collection_name: str, dimension: int) -> None:
        """Initialize the collection/table and ensure necessary indexes exist."""
        pass

    @abstractmethod
    async def upsert(self, collection_name: str, points: list[VectorPoint]) -> None:
        """Insert or update vector points with payload."""
        pass

    @abstractmethod
    async def search(
        self,
        collection_name: str,
        query_vector: list[float],
        limit: int = 4,
        score_threshold: float = 0.55,
    ) -> list[dict[str, Any]]:
        """
        Search for nearest neighbor vectors.
        Returns list of matched items with score and payload:
        [{"id": "...", "score": 0.89, "payload": {...}}]
        """
        pass
