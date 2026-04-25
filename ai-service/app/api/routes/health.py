"""
Operational health endpoints.

Health endpoints look simple, but they matter a lot in production:
- container orchestrators use them
- load balancers use them
- humans use them during debugging
"""

from fastapi import APIRouter
from app.config import settings


router = APIRouter(tags=["health"])


@router.get("/health")
def health_check() -> dict[str, str | int]:
    """Return a small but useful health payload."""

    return {
        "status": "ok",
        "service": settings.app_name,
        "provider": settings.provider_name,
        "model": settings.model_name,
        "ollama_base_url": settings.ollama_base_url,
        "ollama_timeout_seconds": settings.ollama_timeout_seconds,
    }
