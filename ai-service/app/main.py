"""
Main FastAPI application assembly.

Think of this file as the equivalent of a service composition root:
- create the FastAPI app
- attach routers
- define high-level metadata

That keeps bootstrapping concerns separate from business logic.
"""

from fastapi import FastAPI
from app.api.routes.generate import router as generate_router
from app.api.routes.health import router as health_router
from app.config import settings


app = FastAPI(
    title=settings.app_name,
    version=settings.api_version,
    description=(
        "Dedicated AI microservice for the AI Code Assistant Platform. "
        "This version connects to a real local Ollama model and normalizes the "
        "result into a stable contract for the backend and frontend."
    ),
)

app.include_router(health_router)
app.include_router(generate_router)
