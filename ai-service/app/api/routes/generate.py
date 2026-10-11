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


async def _get_shopping_context(query: str = "") -> tuple[list[dict], str]:
    try:
        filters = product_service.extract_search_filters(query)
        retrieved_products = await product_service.search_catalog(**filters)
        if not retrieved_products:
            # Fallback to general catalog if no specific filters matched
            retrieved_products = (await product_service.get_all_products())[:5]

        items_str = "\n".join([
            f"- {p['name']} (Price: ${p['price']}): {p.get('shortDescription') or p.get('description', '')}"
            for p in retrieved_products
        ])
        system_instruction = (
            "You are Atlas AI Concierge, the official shopping assistant for Atlas Commerce.\n"
            "Your job is to answer customer questions about our products, setups, and prices accurately based ONLY on the verified catalog items below.\n\n"
            "CRITICAL RULES:\n"
            "1. ONLY discuss and recommend products listed in the RETRIEVED PRODUCTS below. NEVER invent, mention, or hallucinate products outside this list.\n"
            "2. Always quote the exact product name and price from the list below.\n"
            "3. If a requested product is not in our catalog, clearly state that we do not carry it and recommend the closest available catalog item instead.\n"
            "4. Keep answers concise, direct, polite, and well-formatted in Markdown.\n\n"
            f"### RETRIEVED PRODUCTS:\n"
            f"{items_str}"
        )
        return retrieved_products, system_instruction
    except Exception as e:
        logger.error(f"Error retrieving shopping context: {e}")
        return [], "You are a helpful eCommerce shopping assistant."


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
    _, system_instruction = await _get_shopping_context(payload.prompt)
    return await chat.generate(payload, model, system_prompt=system_instruction)


@router.post("/generate/stream")
async def generate_response_stream(
    payload: GenerateRequest, request: Request
) -> StreamingResponse:
    """
    Stream a response as newline-delimited JSON events with Hybrid RAG & Citations.
    Emits a structured 'citations' event containing authoritative PostgreSQL product objects,
    followed by the conversational deltas, and executes any CREATE_PRODUCT commands on completion.
    """
    chat = service(request)
    model = await chat.resolve_model(payload.model)
    retrieved_products, system_instruction = await _get_shopping_context(payload.prompt)

    async def event_generator():
        # 1. Emit structured citations event with authoritative product records
        if retrieved_products:
            yield json.dumps({"type": "citations", "products": retrieved_products}) + "\n"

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

        # 2. After stream completes, execute any CREATE_PRODUCT commands
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
