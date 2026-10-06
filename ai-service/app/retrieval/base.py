"""Retrieval is independent of the chat provider and disabled by default."""

from typing import Protocol


class Retriever(Protocol):
    async def search(self, query: str) -> list[str]: ...


class NoRetrieval:
    async def search(self, query: str) -> list[str]:
        return []
