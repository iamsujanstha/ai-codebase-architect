"""Provider wiring. Credentials and endpoints never come from browser requests."""

import httpx

from app.config import Settings
from app.providers.base import ChatProvider
from app.providers.claude import ClaudeProvider
from app.providers.compatible import OpenAICompatibleProvider
from app.providers.gemini import GeminiProvider
from app.providers.mock import MockProvider
from app.providers.ollama import OllamaProvider
from app.providers.openai import OpenAIProvider


def provider_connection(config: Settings) -> tuple[str, dict[str, str]]:
    if config.provider == "openai":
        return "https://api.openai.com/v1/", {
            "Authorization": f"Bearer {config.api_key}"
        }
    if config.provider == "claude":
        return "https://api.anthropic.com/v1/", {
            "x-api-key": config.api_key,
            "anthropic-version": "2023-06-01",
        }
    if config.provider == "gemini":
        return "https://generativelanguage.googleapis.com/v1beta/", {
            "x-goog-api-key": config.api_key
        }
    if config.provider == "openai_compatible":
        return config.base_url.rstrip("/") + "/", {
            "Authorization": f"Bearer {config.api_key}"
        }
    return config.ollama_base_url, {}


def create_provider(config: Settings, client: httpx.AsyncClient) -> ChatProvider:
    if config.provider == "ollama":
        return OllamaProvider(client)
    if config.provider == "mock":
        return MockProvider()
    adapters = {
        "openai": OpenAIProvider,
        "claude": ClaudeProvider,
        "gemini": GeminiProvider,
        "openai_compatible": OpenAICompatibleProvider,
    }
    if config.provider not in adapters:
        raise ValueError(f"Unknown AI_PROVIDER {config.provider!r}")
    models = tuple(
        dict.fromkeys(
            ([config.model] if config.model else []) + list(config.allowed_models)
        )
    )
    return adapters[config.provider](
        client, models, config.api_key, config.max_output_tokens
    )
