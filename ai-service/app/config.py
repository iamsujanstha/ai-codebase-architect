"""Environment configuration. Read at composition time, never inside adapters."""

import os
from dataclasses import dataclass, field
from urllib.parse import urlsplit


@dataclass(frozen=True)
class Settings:
    app_name: str = "AI Application Starter"
    api_version: str = "1.0.0"
    provider: str = "ollama"
    model: str = "deepseek-coder:6.7b"
    ollama_base_url: str = "http://127.0.0.1:11434"
    timeout_seconds: float = 120
    concurrency: int = 1
    api_key: str = field(default="", repr=False)
    base_url: str = ""
    allowed_models: tuple[str, ...] = ()
    max_output_tokens: int = 2048
    retrieval: str = "none"
    embedding_model: str = ""
    qdrant_url: str = "http://localhost:6333"
    collection: str = "knowledge"
    corpus: str = "reference"
    redis_url: str = "redis://localhost:6379/0"

    @classmethod
    def from_env(cls):
        provider = os.getenv("AI_PROVIDER", "ollama").strip().lower()
        model = os.getenv("AI_MODEL") or (
            "mock-model"
            if provider == "mock"
            else os.getenv("OLLAMA_MODEL", "deepseek-coder:6.7b")
            if provider == "ollama"
            else ""
        )
        config = cls(
            app_name=os.getenv("APP_NAME", cls.app_name),
            provider=provider,
            model=model,
            ollama_base_url=os.getenv("OLLAMA_BASE_URL", cls.ollama_base_url).rstrip(
                "/"
            ),
            timeout_seconds=float(
                os.getenv(
                    "AI_TIMEOUT_SECONDS", os.getenv("OLLAMA_TIMEOUT_SECONDS", "120")
                )
            ),
            concurrency=int(os.getenv("AI_CONCURRENCY", "1")),
            api_key=os.getenv(
                {
                    "openai": "OPENAI_API_KEY",
                    "claude": "ANTHROPIC_API_KEY",
                    "gemini": "GEMINI_API_KEY",
                }.get(provider, "AI_API_KEY"),
                "",
            ).strip(),
            base_url=os.getenv("AI_BASE_URL", "").strip().rstrip("/"),
            allowed_models=tuple(
                dict.fromkeys(
                    [model]
                    + [
                        item.strip()
                        for item in os.getenv("AI_MODELS", "").split(",")
                        if item.strip()
                    ]
                )
            )
            if model
            else (),
            max_output_tokens=int(os.getenv("AI_MAX_OUTPUT_TOKENS", "2048")),
            retrieval=os.getenv("RETRIEVAL_BACKEND", "none"),
            embedding_model=os.getenv("EMBEDDING_MODEL", ""),
            qdrant_url=os.getenv(
                "QDRANT_URL",
                f"http://{os.getenv('QDRANT_HOST', 'localhost')}:{os.getenv('QDRANT_PORT', '6333')}",
            ),
            collection=os.getenv("MEMORY_COLLECTION", "knowledge"),
            corpus=os.getenv("RETRIEVAL_CORPUS", "reference"),
            redis_url=os.getenv("REDIS_URL", cls.redis_url),
        )
        if config.timeout_seconds <= 0 or config.concurrency < 1:
            raise ValueError("AI_TIMEOUT_SECONDS and AI_CONCURRENCY must be positive")
        if config.retrieval not in {"none", "qdrant"}:
            raise ValueError("RETRIEVAL_BACKEND must be none or qdrant")
        if config.retrieval == "qdrant" and not config.embedding_model:
            raise ValueError("Qdrant retrieval requires a dedicated EMBEDDING_MODEL")
        if config.max_output_tokens < 1:
            raise ValueError("AI_MAX_OUTPUT_TOKENS must be positive")
        if config.provider == "openai_compatible":
            parsed = urlsplit(config.base_url)
            if (
                parsed.scheme not in {"http", "https"}
                or not parsed.hostname
                or parsed.username
                or parsed.password
                or parsed.query
                or parsed.fragment
            ):
                raise ValueError(
                    "AI_BASE_URL must be an HTTP(S) API base URL without credentials, query, or fragment"
                )
        elif config.base_url:
            raise ValueError(
                "AI_BASE_URL applies only to AI_PROVIDER=openai_compatible"
            )
        return config
