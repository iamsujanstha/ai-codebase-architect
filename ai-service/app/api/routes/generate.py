"""Transport only: validation, dependency lookup, and response serialization."""

from __future__ import annotations

import json
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.models.ai_models import GenerateRequest, GenerateResponse, ModelsResponse
from app.services.chat_service import ChatService
from app.services.product_service import product_service

router = APIRouter(tags=["generation"])


def service(request: Request) -> ChatService:
    return request.app.state.chat


async def _get_shopping_system_instruction(query: str = "") -> str | None:
    try:
        products = await product_service.get_all_products()
        if not products:
            return None
        catalog_str = product_service.format_products_for_context(products, query)
        return (
            "You are Atlas AI Concierge, the official shopping assistant for Atlas Commerce.\n"
            "Your job is to answer customer questions about our products, setups, and prices accurately based on our catalog.\n\n"
            "Guidelines:\n"
            "1. When asked about any product or price, always quote the exact price from our STORE CATALOG below.\n"
            "2. If the user asks for a list or comparison, list each matching item with its exact catalog price.\n"
            "3. Keep answers concise, direct, polite, and well-formatted in Markdown.\n\n"
            "### STORE CATALOG:\n"
            f"{catalog_str}"
        )
    except Exception:
        return None


@router.get("/models", response_model=ModelsResponse)
async def list_models(request: Request) -> ModelsResponse:
    """Return the set of models available through the configured provider."""
    return await service(request).models()


@router.post("/generate", response_model=GenerateResponse)
async def generate_response(
    payload: GenerateRequest, request: Request
) -> GenerateResponse:
    """Accept a prompt and return a structured AI answer."""
    chat = service(request)
    model = await chat.resolve_model(payload.model)
    system_instruction = await _get_shopping_system_instruction(payload.prompt)
    return await chat.generate(payload, model, system_prompt=system_instruction)


@router.post("/generate/stream")
async def generate_response_stream(
    payload: GenerateRequest, request: Request
) -> StreamingResponse:
    """
    Stream a response as newline-delimited JSON events with RAG and Catalog support.
    After the stream completes, executes any [CREATE_PRODUCT:{...}] commands found in the response.
    """
    chat = service(request)
    model = await chat.resolve_model(payload.model)
    system_instruction = await _get_shopping_system_instruction(payload.prompt)

    async def event_generator():
        full_response_text = ""
        events = chat.events(payload, model, system_prompt=system_instruction)
        try:
            async for event in events:
                if event.get("type") == "delta":
                    # pyrefly: ignore [unsupported-operation]
                    full_response_text += event.get("delta", "")
                yield json.dumps(event) + "\n"
        finally:
            await events.aclose()

        # After stream completes, execute any CREATE_PRODUCT commands
        create_commands = product_service.extract_create_product_commands(
            full_response_text
        )
        if create_commands:
            created_ids = []
            for cmd in create_commands:
                result = await product_service.create_product(cmd)
                if result and result.get("id"):
                    created_ids.append(result["id"])

            if created_ids:
                yield json.dumps({
                    "type": "products_created",
                    "productIds": created_ids,
                    "count": len(created_ids),
                }) + "\n"

    return StreamingResponse(
        event_generator(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
