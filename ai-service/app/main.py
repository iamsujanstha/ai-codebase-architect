"""Composition root. Create resources at startup and close them at shutdown."""

from __future__ import annotations

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app.api.routes.generate import router
from app.config import Settings
from app.providers.base import ProviderError
from app.providers.registry import create_provider, provider_connection
from app.retrieval.factory import create_retriever
from app.services.chat_service import ChatService


def create_app(
    settings: Settings | None = None, chat_service: ChatService | None = None
):
    config = settings or Settings.from_env()

    @asynccontextmanager
    async def lifespan(app):
        if chat_service is not None:
            app.state.chat = chat_service
            yield
            return
        base_url, headers = provider_connection(config)
        # Separate clients keep chat credentials out of embedding requests.
        async with httpx.AsyncClient(
            base_url=base_url, headers=headers, timeout=config.timeout_seconds
        ) as chat_client:
            async with httpx.AsyncClient(
                base_url=config.ollama_base_url, timeout=config.timeout_seconds
            ) as embedding_client:
                provider = create_provider(config, chat_client)
                async with create_retriever(config, embedding_client) as retriever:
                    app.state.chat = ChatService(
                        provider, retriever, config.model, config.concurrency
                    )
                    yield

    application = FastAPI(
        title=config.app_name,
        version=config.api_version,
        lifespan=lifespan,
        description="Text chat with environment-configured Ollama, OpenAI, Claude, Gemini, and compatible APIs.",
    )
    application.include_router(router)

    @application.get("/health", tags=["health"])
    async def health():
        return {
            "status": "ok",
            "service": config.app_name,
            "provider": config.provider,
            "model": config.model,
            "retrieval": config.retrieval,
        }

    @application.exception_handler(ProviderError)
    async def provider_error(request: Request, exc: ProviderError):
        return JSONResponse(
            status_code=503,
            content={"detail": str(exc)},
        )

    return application


app = create_app()
