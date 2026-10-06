"""Explicit development provider. Never used as an automatic fallback."""

import asyncio

from app.models.ai_models import AvailableModel
from app.providers.base import ChatProvider, Completion


class MockProvider(ChatProvider):
    name = "mock"

    async def list_models(self):
        return [AvailableModel(name="mock-model", size_label="Development fixture")]

    async def stream(self, messages, model):
        answer = (
            "Mock response for integration testing. Your message: "
            + messages[-1]["content"]
        )
        for word in answer.split(" "):
            await asyncio.sleep(0)
            yield word + " "
        yield Completion()
