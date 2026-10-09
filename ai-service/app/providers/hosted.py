"""Shared HTTP/SSE transport. Each adapter owns its vendor's request and events."""

from __future__ import annotations

import json
from abc import abstractmethod
from typing import AsyncIterator

import httpx

from app.models.ai_models import AvailableModel
from app.providers.base import (
    ChatProvider,
    Completion,
    ProviderError,
    ProviderNotConfigured,
)


async def read_sse(response: httpx.Response) -> AsyncIterator[dict]:
    """Parse SSE records, including comments, multiline data and split UTF-8 bytes."""
    data: list[str] = []
    size = 0
    async for line in response.aiter_lines():
        if not line:
            if data:
                yield decode_data("\n".join(data))
            data, size = [], 0
        elif line.startswith("data:"):
            value = line[5:].removeprefix(" ")
            size += len(value)
            if size > 1_000_000:
                raise ProviderError("The provider sent an oversized event.")
            data.append(value)
    if data:
        yield decode_data("\n".join(data))


def decode_data(value: str) -> dict:
    if value == "[DONE]":
        return {"type": "transport.done"}
    event = json.loads(value)
    if not isinstance(event, dict):
        raise ProviderError("The provider returned an invalid stream event.")
    return event


def split_system(messages: list[dict[str, str]]):
    system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
    return system, [m for m in messages if m["role"] != "system"]


class HostedProvider(ChatProvider):
    """Model choices are administrator-configured, not claims of account access."""

    key_environment: str

    def __init__(
        self,
        client: httpx.AsyncClient,
        models: tuple[str, ...],
        api_key: str,
        max_tokens: int,
    ):
        self.client, self.models, self.api_key, self.max_tokens = (
            client,
            models,
            api_key,
            max_tokens,
        )

    def validate(self):
        if not self.api_key:
            raise ProviderNotConfigured(
                f"Set {self.key_environment} for the {self.name} provider."
            )
        if not self.models:
            raise ProviderNotConfigured(
                "Set AI_MODEL to a text-chat model available to your account."
            )

    async def list_models(self):
        self.validate()
        return [
            AvailableModel(name=model, size_label="Configured model")
            for model in self.models
        ]

    @abstractmethod
    def request(
        self, messages: list[dict[str, str]], model: str
    ) -> tuple[str, dict]: ...

    @abstractmethod
    def decode(self, event: dict, state: dict) -> list[str | Completion]: ...

    async def stream(self, messages, model):
        self.validate()
        if model not in self.models:
            raise ProviderError("Select a configured model before sending a message.")
        path, payload = self.request(messages, model)
        state: dict = {}
        has_text = False
        try:
            async with self.client.stream("POST", path, json=payload) as response:
                response.raise_for_status()
                async for event in read_sse(response):
                    if event.get("error") or event.get("type") == "error":
                        raise ProviderError(
                            "The provider rejected generation. Check model access, quota, and request limits."
                        )
                    for item in self.decode(event, state):
                        if isinstance(item, str):
                            has_text = has_text or bool(item.strip())
                        elif isinstance(item, Completion) and not has_text:
                            raise ProviderError("The provider returned no text answer.")
                        yield item
                        if isinstance(item, Completion):
                            return
            raise ProviderError("The provider stream ended before completion.")
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code
            if status in (401, 403):
                message = "Provider authentication or model access failed. Check your server API key and model permissions."
            elif status == 429:
                message = "The provider rate limit or quota was reached. Please try again later."
            elif status in (400, 404, 422):
                message = (
                    "The provider rejected the configured model or request settings."
                )
            else:
                message = "The provider is temporarily unavailable. Please try again."
            raise ProviderError(message) from None
        except (httpx.HTTPError, ValueError, TypeError, KeyError, AttributeError):
            raise ProviderError(
                "The provider connection or response was invalid. Please try again."
            ) from None
