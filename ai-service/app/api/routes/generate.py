"""Transport only: validation, dependency lookup, and response serialization."""

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.models.ai_models import GenerateRequest, GenerateResponse, ModelsResponse
from app.services.chat_service import ChatService

router = APIRouter(tags=["generation"])


def service(request: Request) -> ChatService:
    return request.app.state.chat


@router.get("/models", response_model=ModelsResponse)
async def list_models(request: Request):
    return await service(request).models()


@router.post("/generate", response_model=GenerateResponse)
async def generate_response(payload: GenerateRequest, request: Request):
    chat = service(request)
    model = await chat.resolve_model(payload.model)
    return await chat.generate(payload, model)


@router.post("/generate/stream")
async def generate_response_stream(payload: GenerateRequest, request: Request):
    chat = service(request)
    model = await chat.resolve_model(payload.model)
    return StreamingResponse(
        chat.stream(payload, model),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no"},
    )
