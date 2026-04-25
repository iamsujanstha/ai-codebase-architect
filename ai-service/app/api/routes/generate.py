"""
AI generation route definitions.

Routers are a nice FastAPI organizational unit because they keep endpoint wiring
separate from the actual business behavior.
"""

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse
from app.models.ai_models import GenerateRequest, GenerateResponse, ModelsResponse
from app.services.ollama_client import (
    OllamaClientError,
    list_available_models,
    stream_chat_completion,
)
from app.services.response_generator import generate_structured_response


router = APIRouter(tags=["generation"])


@router.get("/models", response_model=ModelsResponse)
async def list_models() -> ModelsResponse:
    """
    Return the set of local models currently available through Ollama.
    """

    try:
        return await list_available_models()
    except OllamaClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc



@router.post("/generate", response_model=GenerateResponse)
async def generate_response(payload: GenerateRequest) -> GenerateResponse:
    """
    Accept a prompt and return a structured AI-style answer with RAG.
    """

    try:
        return await generate_structured_response(payload)

    except OllamaClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


from app.services.memory_service import memory_service
from app.services.queue_service import request_queue


@router.post("/generate/stream")
async def generate_response_stream(payload: GenerateRequest) -> StreamingResponse:
    """
    Stream a response as newline-delimited JSON events with RAG support.
    """

    async def get_stream():
        # Retrieve context from memory (RAG) - now async and inside the generator
        context = await memory_service.search_relevant_context(payload.prompt)
        context_str = "\n".join(context) if context else ""
        
        # Augmented prompt for the AI
        final_prompt = payload.prompt
        if context_str:
            final_prompt = (
                f"Relevant information from past conversations:\n{context_str}\n\n"
                f"New question: {payload.prompt}"
            )

        # Use the RequestQueue to manage concurrency (Queue-aware)
        async with request_queue.semaphore:
            # Async stream directly from Ollama
            async for chunk in stream_chat_completion(
                user_prompt=final_prompt,
                messages=payload.messages,
                request_id=payload.request_id,
                model_name=payload.model,
            ):
                yield chunk

    return StreamingResponse(
        get_stream(),
        media_type="application/x-ndjson",
    )


