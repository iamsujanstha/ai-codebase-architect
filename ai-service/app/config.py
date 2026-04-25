"""
Configuration helpers for the AI service.

This file keeps environment access centralized instead of scattering `os.getenv(...)`
 calls across the codebase. That pattern becomes more important as services grow.
"""

from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
    """Immutable runtime settings for the AI service."""

    app_name: str = os.getenv("APP_NAME", "AI Code Assistant Engine")
    api_version: str = os.getenv("API_VERSION", "1.0.0")
    provider_name: str = os.getenv("PROVIDER_NAME", "ollama-local")
    model_name: str = os.getenv(
        "OLLAMA_MODEL",
        os.getenv("MODEL_NAME", "deepseek-coder:6.7b"),
    )
    ollama_base_url: str = os.getenv(
        "OLLAMA_BASE_URL",
        "http://127.0.0.1:11434",
    ).rstrip("/")
    ollama_timeout_seconds: int = int(os.getenv("OLLAMA_TIMEOUT_SECONDS", "120"))


settings = Settings()
