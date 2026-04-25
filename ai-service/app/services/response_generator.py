"""
Response generation orchestration for the AI microservice.

This module now talks to a real local model through Ollama.
The important architectural lesson stays the same:
the API contract remains stable even as the implementation evolves.
"""

from __future__ import annotations

from datetime import datetime, timezone
from time import perf_counter
from uuid import uuid4

from app.config import settings
from app.models.ai_models import GenerateRequest, GenerateResponse
from app.services.ollama_client import generate_structured_completion


def generate_structured_response(payload: GenerateRequest) -> GenerateResponse:
    """
    Generate a structured response using a real local LLM.

    The downstream consumer still receives the same stable response fields as before.
    That is exactly why service boundaries are so useful in production systems.
    """

    started_at = perf_counter()
    resolved_model_name = payload.model or settings.model_name
    llm_payload = generate_structured_completion(
        payload.prompt,
        messages=payload.messages,
        model_name=payload.model,
    )
    processing_time_ms = int((perf_counter() - started_at) * 1000)

    return GenerateResponse(
        request_id=payload.request_id or str(uuid4()),
        prompt=payload.prompt,
        summary=llm_payload.summary,
        answer=llm_payload.answer,
        key_points=llm_payload.key_points,
        suggested_follow_up_prompts=llm_payload.suggested_follow_up_prompts,
        provider=settings.provider_name,
        model=resolved_model_name,
        processing_time_ms=processing_time_ms,
        generated_at=datetime.now(timezone.utc).isoformat(),
    )
