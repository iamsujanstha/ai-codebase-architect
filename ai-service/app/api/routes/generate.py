"""Transport only: validation, dependency lookup, and response serialization."""

from __future__ import annotations

import json
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.models.ai_models import GenerateRequest, GenerateResponse, ModelsResponse
from app.services.chat_service import ChatService
from app.services.product_service import product_service

router = APIRouter(tags=["generation"])


import logging

logger = logging.getLogger(__name__)


def service(request: Request) -> ChatService:
    return request.app.state.chat


async def _get_shopping_context(query: str = "") -> tuple[list[dict], str]:
    try:
        # Pipeline: Semantic query -> LLM -> semantic intent -> Qdrant
        filters = await product_service.extract_semantic_intent(query)
        retrieved_products = await product_service.search_catalog(**filters)

        if retrieved_products:
            items_str = "\n".join([
                f"- {p['name']} (Price: ${p['price']}, Category: {p.get('categoryName', '')}): {p.get('shortDescription') or p.get('description', '')}"
                for p in retrieved_products
            ])
            system_instruction = (
                "You are Atlas AI Concierge, the official shopping assistant for Atlas Commerce.\n"
                "Atlas Commerce specializes in workspace & developer equipment: Electronics, Office Furniture, Tech Books, Desk Accessories, and Software.\n"
                "Your job is to answer customer questions accurately based on the verified catalog items below.\n\n"
                "CRITICAL RULES:\n"
                "1. ONLY discuss and recommend products listed in the RETRIEVED PRODUCTS below.\n"
                "2. Always quote the exact product name and price from the verified list below.\n"
                "3. Explain directly why the retrieved items suit their request.\n"
                "4. Keep answers concise, polite, helpful, and formatted in Markdown.\n\n"
                f"### RETRIEVED PRODUCTS:\n"
                f"{items_str}"
            )
        else:
            system_instruction = (
                "You are Atlas AI Concierge, the official shopping assistant for Atlas Commerce.\n"
                "Atlas Commerce is a specialized tech, developer, and home-office workspace retailer.\n"
                "We ONLY sell: Electronics (laptops, audio, mice, keyboards), Office Furniture (ergonomic chairs, standing desks, footrests), Programming Books, Desk Accessories (webcams, mics), and Software.\n"
                "We DO NOT sell apparel, shoes, footwear, clothing, sporting goods, groceries, or outdoor gear.\n\n"
                "CRITICAL RULES:\n"
                "1. There are NO products in our catalog matching the customer's request.\n"
                "2. Clearly and politely explain that Atlas Commerce does not carry this product (e.g. walking shoes, sneakers, or apparel).\n"
                "3. NEVER recommend, list, or invent external brands or external products (NEVER mention Nike, Adidas, New Balance, Under Armour, etc.). You represent Atlas Commerce only.\n"
                "4. Briefly inform them of what our store carries (tech, workspace, and office products) and ask if they need anything for their desk or workspace setup instead.\n"
                "5. Keep answers concise, direct, polite, and well-formatted in Markdown."
            )

        return retrieved_products, system_instruction
    except Exception as e:
        logger.error(f"Error retrieving shopping context: {e}")
        return [], "You are Atlas AI Concierge, a helpful eCommerce shopping assistant for tech and workspace gear."


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
        # 1. Emit structured citations event with authoritative product records (or empty list if no matches)
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
