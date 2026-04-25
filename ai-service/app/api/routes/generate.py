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


from app.services.product_service import product_service

@router.post("/generate/stream")
async def generate_response_stream(payload: GenerateRequest) -> StreamingResponse:
    """
    Stream a response as newline-delimited JSON events with RAG and Catalog support.
    """

    async def get_stream():
        # 1. Retrieve context from memory (RAG)
        context = await memory_service.search_relevant_context(payload.prompt)
        context_str = "\n".join(context) if context else ""
        
        # 2. Retrieve catalog products
        products = await product_service.get_all_products()
        catalog_str = product_service.format_products_for_context(products)

        # 3. Augmented prompt for the AI
        system_instruction = (
            "You are the official AI Shopping Assistant for the Atlas Commerce store. "
            "Your job is to help users find and buy products from our catalog. "
            "You have access to the real-time product list below. "
            "ALWAYS use the specific product names and IDs provided. "
            "If a user wants to see a product, use [PRODUCT:id]. "
            "If they want to add to cart, use [ADD_TO_CART:id]. "
            "\n\n### CURRENT CATALOG DATA:\n"
            f"{catalog_str}"
        )

        user_prompt = payload.prompt
        if context_str:
            user_prompt = f"Relevant past context:\n{context_str}\n\nUser Question: {payload.prompt}"

        # Use the RequestQueue to manage concurrency
        async with request_queue.semaphore:
            # Async stream directly from Ollama
            async for chunk in stream_chat_completion(
                user_prompt=user_prompt,
                messages=payload.messages,
                request_id=payload.request_id,
                model_name=payload.model,
                system_instruction=system_instruction,
            ):
                yield chunk



    return StreamingResponse(
        get_stream(),
        media_type="application/x-ndjson",
    )


