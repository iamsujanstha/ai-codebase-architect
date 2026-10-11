"""Ollama wire format belongs here; no HTTP route or UI event knowledge."""

from __future__ import annotations

import json
from typing import AsyncIterator

# pyrefly: ignore [missing-import]
import httpx

from app.models.ai_models import AvailableModel
from app.providers.base import ChatProvider, Completion, ProviderError


class OllamaProvider(ChatProvider):
    name = "ollama"

    def __init__(self, client: httpx.AsyncClient):
        self.client = client

    async def list_models(self):
        try:
            response = await self.client.get("/api/tags")
            response.raise_for_status()
            result = []
            for item in response.json().get("models", []):
                details = item.get("details") or {}
                size = int(item.get("size", 0))
                result.append(
                    AvailableModel(
                        name=item["name"],
                        size_bytes=size,
                        size_label=f"{size / 1024**3:.1f} GB",
                        modified_at=item.get("modified_at", ""),
                        family=details.get("family"),
                        parameter_size=details.get("parameter_size"),
                        quantization_level=details.get("quantization_level"),
                        digest=item.get("digest"),
                    )
                )
            return result
        except (httpx.HTTPError, ValueError, KeyError, TypeError):
            # Graceful fallback when Ollama is not running on host machine
            return [
                AvailableModel(
                    name="deepseek-coder:6.7b",
                    size_label="Local Ollama",
                    modified_at="",
                    family="deepseek",
                    parameter_size="6.7B",
                ),
                AvailableModel(
                    name="llama3:latest",
                    size_label="Local Ollama",
                    modified_at="",
                    family="llama",
                    parameter_size="8B",
                ),
            ]

    async def stream(self, messages, model) -> AsyncIterator[str | Completion]:
        try:
            async with self.client.stream(
                "POST",
                "/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": True,
                    "options": {
                        "temperature": 0.3,
                        "repeat_penalty": 1.18,
                        "num_predict": 350,
                    },
                },
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line.strip():
                        continue
                    event = json.loads(line)
                    if event.get("error"):
                        raise ProviderError(
                            "The model could not complete this response."
                        )
                    content = event.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if event.get("done"):
                        yield Completion(
                            event.get("prompt_eval_count"),
                            event.get("eval_count"),
                            event.get("done_reason", "stop"),
                        )
                        return
            raise ProviderError("The provider stream ended before completion.")
        except (httpx.HTTPError, ValueError, TypeError, AttributeError) as exc:
            raise ProviderError(
                "The model connection failed. Please try again."
            ) from exc
