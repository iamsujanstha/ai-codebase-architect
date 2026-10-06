"""Provider-neutral chat contract. Adapters yield text followed by one completion."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator

from app.models.ai_models import AvailableModel


class ProviderError(Exception):
    """Safe public error; provider response bodies and credentials stay private."""


class ProviderNotConfigured(ProviderError):
    pass


@dataclass(frozen=True)
class Completion:
    # Unknown usage stays unknown; adapters must not invent token counts.
    input_tokens: int | None = None
    output_tokens: int | None = None
    reason: str = "stop"


class ChatProvider(ABC):
    name: str

    @abstractmethod
    async def list_models(self) -> list[AvailableModel]: ...

    @abstractmethod
    def stream(
        self, messages: list[dict[str, str]], model: str
    ) -> AsyncIterator[str | Completion]: ...
