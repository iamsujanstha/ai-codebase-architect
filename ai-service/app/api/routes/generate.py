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
from app.services.memory_service import memory_service
from app.services.queue_service import request_queue
from app.services.product_service import product_service
import json

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


@router.post("/generate/stream")
async def generate_response_stream(payload: GenerateRequest) -> StreamingResponse:
    """
    Stream a response as newline-delimited JSON events with RAG and Catalog support.
    After the stream, execute any [CREATE_PRODUCT:{...}] commands found in the response.
    """

    async def get_stream():
        # 1. Retrieve context from memory (RAG)
        context = await memory_service.search_relevant_context(payload.prompt)
        context_str = "\n".join(context) if context else ""

        # 2. Retrieve catalog products
        products = await product_service.get_all_products()
        catalog_str = product_service.format_products_for_context(products)

        # 3. Build system instruction
        system_instruction = (
            "You are the official AI Shopping Assistant for the Atlas Commerce store. "
            "Your goal is to provide HIGH-QUALITY, IN-DEPTH, and LOGICAL assistance. "
            "\n\nCRITICAL DIRECTIVES:\n"
            "1. BE DETAILED: Never give one-sentence answers. Explain the 'why' behind your recommendations. "
            "2. THINK STEP-BY-STEP: For complex requests, break down your logic into clear, structured points. "
            "3. BE AN EXPERT: Use the provided catalog data to compare products and provide technical specs. "
            "4. INTERACTIVE: Use [PRODUCT:id] to show product cards and [ADD_TO_CART:id] for actions. "
            "5. PRODUCT CREATION: If the user asks you to create or add a product, respond with a "
            "[CREATE_PRODUCT:{...}] tag containing valid JSON for the new product. "
            "Always confirm to the user what you are creating. "
            "\n\n### CURRENT CATALOG DATA:\n"
            f"{catalog_str}"
        )

        user_prompt = payload.prompt
        if context_str:
            user_prompt = f"Relevant past context:\n{context_str}\n\nUser Question: {payload.prompt}"

        # 4. Stream from Ollama, collect full text for post-processing
        full_response_text = ""

        async with request_queue.semaphore:
            async for chunk in stream_chat_completion(
                user_prompt=user_prompt,
                messages=payload.messages,
                request_id=payload.request_id,
                model_name=payload.model,
                system_instruction=system_instruction,
            ):
                # Accumulate delta text for post-processing
                try:
                    event = json.loads(chunk.strip())
                    if event.get("type") == "delta":
                        full_response_text += event.get("delta", "")
                except Exception:
                    pass
                yield chunk

        # 5. After stream completes, execute any CREATE_PRODUCT commands
        create_commands = product_service.extract_create_product_commands(full_response_text)
        if create_commands:
            created_ids = []
            for cmd in create_commands:
                result = await product_service.create_product(cmd)
                if result and result.get("id"):
                    created_ids.append(result["id"])

            # Emit a special event so the frontend knows products were created
            if created_ids:
                yield json.dumps({
                    "type": "products_created",
                    "productIds": created_ids,
                    "count": len(created_ids),
                }) + "\n"

    return StreamingResponse(
        get_stream(),
        media_type="application/x-ndjson",
    )
