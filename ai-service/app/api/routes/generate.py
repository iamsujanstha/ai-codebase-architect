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
def list_models() -> ModelsResponse:
    """
    Return the set of local models currently available through Ollama.

    This route is useful for the frontend model picker and for quick operational checks.
    """

    try:
        return list_available_models()
    except OllamaClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.post("/generate", response_model=GenerateResponse)
def generate_response(payload: GenerateRequest) -> GenerateResponse:
    """
    Accept a prompt and return a structured AI-style answer.

    In a real platform this endpoint would likely call:
    - OpenAI
    - Ollama
    - Anthropic
    - an internal model gateway

    The rest of the application is intentionally structured so that the implementation
    can change without forcing a redesign of the API contract.
    """

    try:
        return generate_structured_response(payload)
    except OllamaClientError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.post("/generate/stream")
def generate_response_stream(payload: GenerateRequest) -> StreamingResponse:
    """
    Stream a response as newline-delimited JSON events.

    Event flow:
    - `start`: metadata about the request and selected model
    - `delta`: one incremental chunk of assistant text
    - `done`: final usage and timing metadata
    - `error`: a recoverable stream-level failure event
    """

    return StreamingResponse(
        stream_chat_completion(
            user_prompt=payload.prompt,
            request_id=payload.request_id,
            model_name=payload.model,
        ),
        media_type="application/x-ndjson",
    )
