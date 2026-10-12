"""Transport only: validation, dependency lookup, and response serialization."""

from __future__ import annotations

import json
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.models.ai_models import GenerateRequest, GenerateResponse, ModelsResponse
from app.services.chat_service import ChatService, timestamp
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
                "You are Atlas AI Concierge, the official shopping assistant for Atlas Commerce ONLY.\n"
                "Atlas Commerce specializes strictly in workspace & developer equipment: Electronics, Office Furniture, Tech Books, Desk Accessories, and Software.\n\n"
                "STRICT BOUNDARY & ZERO OUTSIDE KNOWLEDGE RULES:\n"
                "1. NEVER answer general knowledge questions, write coding tutorials, or lecture about general concepts (such as what a programming language is, history, math, or trivia).\n"
                "2. You are ONLY a shopping assistant. If the user asks a general conceptual question (e.g. 'what is python', 'how does rust work'), DO NOT explain the concept or provide an educational lesson. Instead, state that you only assist with Atlas Commerce products, and directly relate to the relevant store products from the list below.\n"
                "3. ONLY discuss and recommend products listed in the RETRIEVED PRODUCTS below.\n"
                "4. Always quote the exact product name and price from the verified list below.\n"
                "5. Explain directly how the retrieved items fit their workspace setup.\n"
                "6. Keep answers concise, polite, helpful, and formatted in Markdown.\n\n"
                f"### RETRIEVED PRODUCTS:\n"
                f"{items_str}"
            )
        else:
            system_instruction = (
                "You are Atlas AI Concierge, the official shopping assistant for Atlas Commerce ONLY.\n"
                "Atlas Commerce is a specialized tech, developer, and home-office workspace retailer.\n"
                "We ONLY sell: Electronics (laptops, audio, mice, keyboards), Office Furniture (ergonomic chairs, standing desks, footrests), Programming Books, Desk Accessories (webcams, mics), and Software.\n"
                "We DO NOT sell apparel, shoes, footwear, clothing, sporting goods, groceries, or outdoor gear.\n\n"
                "CRITICAL OUT-OF-DOMAIN REFUSAL RULES:\n"
                "1. You are FORBIDDEN from answering general knowledge, trivia, history, science, math, or coding tutorials.\n"
                "2. There are NO products in our catalog matching the customer's request.\n"
                "3. You MUST REFUSE to answer the customer's question and respond ONLY:\n"
                "'I am only authorized to assist with Atlas Commerce products and workspace gear. How can I help you find something for your desk or workspace setup?'\n"
                "4. NEVER explain or answer anything outside Atlas Commerce."
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
    retrieved_products, system_instruction = await _get_shopping_context(payload.prompt)

    if not retrieved_products:
        clean = payload.prompt.strip().lower().rstrip("!?.")
        if clean in {"hi", "hello", "hey", "help", "who are you", "what do you sell", "good morning", "good afternoon"}:
            refusal = (
                "Hello! I am your Atlas Commerce AI Concierge. I specialize in workspace & developer equipment: "
                "Electronics, Ergonomic Chairs, Standing Desks, Audio Gear, and Tech Reference Books. "
                "How can I help with your desk setup or workspace gear today?"
            )
        else:
            refusal = (
                "I am only authorized to assist with Atlas Commerce products and workspace gear. "
                "How can I help you find something for your desk or workspace setup?"
            )
        return GenerateResponse(
            request_id=payload.request_id or "refusal",
            prompt=payload.prompt,
            summary=refusal,
            answer=refusal,
            key_points=[],
            suggested_follow_up_prompts=[],
            provider="domain-guard",
            model=model,
            processing_time_ms=10,
            generated_at=timestamp(),
        )

    grounded_payload = payload.model_copy(
        update={
            "prompt": (
                f"Customer inquiry: '{payload.prompt}'\n"
                "CRITICAL RULE: DO NOT explain outside concepts, teach, or lecture. "
                "Only recommend the verified store products above that relate to their inquiry."
            )
        }
    )
    return await chat.generate(grounded_payload, model, system_prompt=system_instruction)


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

        if not retrieved_products:
            clean = payload.prompt.strip().lower().rstrip("!?.")
            if clean in {"hi", "hello", "hey", "help", "who are you", "what do you sell", "good morning", "good afternoon"}:
                refusal_msg = (
                    "Hello! I am your Atlas Commerce AI Concierge. I specialize in workspace & developer equipment: "
                    "Electronics, Ergonomic Chairs, Standing Desks, Audio Gear, and Tech Reference Books. "
                    "How can I help with your desk setup or workspace gear today?"
                )
            else:
                refusal_msg = (
                    "I am only authorized to assist with Atlas Commerce products and workspace gear. "
                    "How can I help you find something for your desk or workspace setup?"
                )
            yield json.dumps({"type": "delta", "delta": refusal_msg}) + "\n"
            yield json.dumps({
                "type": "done",
                "requestId": payload.request_id or "refusal",
                "provider": "domain-guard",
                "model": model,
                "timings": {"totalDurationMs": 10},
                "doneReason": "out_of_domain_refusal",
            }) + "\n"
            return

        grounded_payload = payload.model_copy(
            update={
                "prompt": (
                    f"Customer inquiry: '{payload.prompt}'\n"
                    "CRITICAL RULE: DO NOT explain outside concepts, teach, or lecture. "
                    "Only recommend the verified store products above that relate to their inquiry."
                )
            }
        )

        full_response_text = ""
        events = chat.events(grounded_payload, model, system_prompt=system_instruction)
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
