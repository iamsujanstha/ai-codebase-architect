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


from app.services.memory_service import memory_service
from app.services.queue_service import request_queue


async def generate_structured_response(payload: GenerateRequest) -> GenerateResponse:
    """
    Generate a structured response with long-term memory support.
    """

    started_at = perf_counter()
    resolved_model_name = payload.model or settings.model_name
    
    # RAG: Retrieve context from long-term memory
    context = memory_service.search_relevant_context(payload.prompt)
    context_str = "\n".join(context) if context else ""
    
    final_prompt = payload.prompt
    if context_str:
        final_prompt = (
            f"Background info from memory:\n{context_str}\n\n"
            f"Current task: {payload.prompt}"
        )

    # Queue-aware generation
    async with request_queue.semaphore:
        llm_payload = generate_structured_completion(
            final_prompt,
            messages=payload.messages,
            model_name=payload.model,
        )
    
    # Asynchronously store the exchange in memory for future RAG
    # In a real app, we might use a background task for this
    memory_service.store_message("user", payload.prompt)
    memory_service.store_message("assistant", llm_payload.answer)

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

