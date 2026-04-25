"""
Thin Ollama HTTP client for the AI microservice.

Why isolate provider access in its own module?
- provider-specific request formats stay out of route handlers
- swapping providers later becomes much easier
- errors can be normalized in one place
"""

from __future__ import annotations

from datetime import datetime, timezone
import json
from typing import Any, Iterator
from urllib import error, request
from uuid import uuid4

from app.config import settings
from app.models.ai_models import AvailableModel, LlmStructuredPayload, ModelsResponse


class OllamaClientError(Exception):
    """Raised when the Ollama provider cannot fulfill a request."""


def generate_structured_completion(
    user_prompt: str,
    messages: list[ChatMessage] | None = None,
    model_name: str | None = None,
) -> LlmStructuredPayload:
    """
    Send the prompt to Ollama and return a validated structured payload.

    We ask the model for JSON because the frontend expects a structured response.
    We still keep a fallback path because smaller local models sometimes drift away
    from perfect JSON even when asked clearly.
    """

    response_payload = _post_chat_request(user_prompt, messages=messages, model_name=model_name)
    message = response_payload.get("message", {})
    raw_content = str(message.get("content", "")).strip()

    if not raw_content:
        raise OllamaClientError("Ollama returned an empty message body.")

    structured_payload = _try_parse_structured_payload(raw_content)

    if structured_payload is not None:
        return structured_payload

    return _build_fallback_payload(user_prompt, raw_content)


def _post_chat_request(
    user_prompt: str,
    messages: list[ChatMessage] | None = None,
    model_name: str | None = None,
) -> dict[str, Any]:
    """Execute a single non-streaming chat request against Ollama."""

    resolved_model_name = model_name or settings.model_name

    ollama_messages = []
    
    # Always ensure a system prompt is present to maintain the structured JSON contract
    ollama_messages.append({
        "role": "system",
        "content": (
            "You are the model layer for an AI code assistant platform. "
            "Return only valid JSON with this exact shape: "
            "{\"summary\":\"string\",\"answer\":\"string\",\"key_points\":[\"string\",\"string\",\"string\",\"string\"],"
            "\"suggested_follow_up_prompts\":[\"string\",\"string\",\"string\"]}. "
            "Write an answer that is practical, technically accurate, and easy to read. "
            "Always include at least one real-world example or production scenario."
        )
    })

    if messages:
        # If history is provided, append it (skipping any existing system prompts to avoid conflicts)
        for m in messages:
            if m.role != "system":
                ollama_messages.append({"role": m.role, "content": m.content})
    
    # Always append the current prompt as the final user message
    ollama_messages.append({"role": "user", "content": user_prompt})

    request_body = {
        "model": resolved_model_name,
        "stream": False,
        "format": "json",
        "messages": ollama_messages,
        "options": {
            "temperature": 0.2,
        },
    }

    encoded_body = json.dumps(request_body).encode("utf-8")

    http_request = request.Request(
        url=f"{settings.ollama_base_url}/api/chat",
        data=encoded_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(
            http_request,
            timeout=settings.ollama_timeout_seconds,
        ) as http_response:
            return json.loads(http_response.read().decode("utf-8"))
    except error.HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        raise OllamaClientError(
            f"Ollama returned HTTP {exc.code}. Response: {response_body}"
        ) from exc
    except error.URLError as exc:
        raise OllamaClientError(
            "The AI service could not reach Ollama. Make sure the Ollama app or "
            "`ollama serve` is running and that the configured base URL is correct."
        ) from exc
    except TimeoutError as exc:
        raise OllamaClientError(
            "The request to Ollama timed out before the model finished responding."
        ) from exc
    except json.JSONDecodeError as exc:
        raise OllamaClientError(
            "Ollama returned a response that was not valid JSON."
        ) from exc


def list_available_models() -> ModelsResponse:
    """Query Ollama for all locally available models."""

    http_request = request.Request(
        url=f"{settings.ollama_base_url}/api/tags",
        method="GET",
    )

    try:
        with request.urlopen(
            http_request,
            timeout=settings.ollama_timeout_seconds,
        ) as http_response:
            payload = json.loads(http_response.read().decode("utf-8"))
    except error.HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        raise OllamaClientError(
            f"Ollama returned HTTP {exc.code} while listing models. Response: {response_body}"
        ) from exc
    except error.URLError as exc:
        raise OllamaClientError(
            "The AI service could not reach Ollama while loading local models."
        ) from exc
    except json.JSONDecodeError as exc:
        raise OllamaClientError(
            "Ollama returned an unreadable model list response."
        ) from exc

    models = []

    for raw_model in payload.get("models", []):
        if not isinstance(raw_model, dict):
            continue

        details = raw_model.get("details", {})
        details = details if isinstance(details, dict) else {}
        size_bytes = int(raw_model.get("size", 0))

        models.append(
            AvailableModel(
                name=str(raw_model.get("name") or raw_model.get("model") or "unknown"),
                size_bytes=size_bytes,
                size_label=_format_size_label(size_bytes),
                modified_at=str(raw_model.get("modified_at") or ""),
                digest=str(raw_model.get("digest") or "") or None,
                family=str(details.get("family") or "") or None,
                parameter_size=str(details.get("parameter_size") or "") or None,
                quantization_level=str(details.get("quantization_level") or "") or None,
            )
        )

    return ModelsResponse(
        default_model=settings.model_name,
        models=models,
    )


def stream_chat_completion(
    user_prompt: str,
    messages: list[ChatMessage] | None = None,
    request_id: str | None = None,
    model_name: str | None = None,
) -> Iterator[str]:
    """
    Stream a chat response from Ollama as newline-delimited JSON events.

    NDJSON is a practical choice here because:
    - it works cleanly over plain HTTP POST
    - the backend can proxy it without understanding every event
    - the frontend can parse it incrementally using the Fetch stream reader
    """

    resolved_request_id = request_id or str(uuid4())
    resolved_model_name = model_name or settings.model_name
    generated_at = datetime.now(timezone.utc).isoformat()

    yield _encode_stream_event(
        {
            "type": "start",
            "requestId": resolved_request_id,
            "provider": settings.provider_name,
            "model": resolved_model_name,
            "generatedAt": generated_at,
        }
    )

    ollama_messages = []
    
    ollama_messages.append({
        "role": "system",
        "content": (
            "You are the assistant model behind a production-style local AI chat application. "
            "Answer in polished Markdown with concise sections when useful. "
            "Lead with the direct answer, then expand with practical detail. "
            "Do not return JSON."
        )
    })

    if messages:
        for m in messages:
            if m.role != "system":
                ollama_messages.append({"role": m.role, "content": m.content})
    
    # Always append the current prompt as the final user message
    ollama_messages.append({"role": "user", "content": user_prompt})

    request_body = {
        "model": resolved_model_name,
        "stream": True,
        "messages": ollama_messages,
        "options": {
            "temperature": 0.2,
        },
    }

    encoded_body = json.dumps(request_body).encode("utf-8")
    http_request = request.Request(
        url=f"{settings.ollama_base_url}/api/chat",
        data=encoded_body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(
            http_request,
            timeout=settings.ollama_timeout_seconds,
        ) as http_response:
            for raw_line in http_response:
                line = raw_line.decode("utf-8").strip()

                if not line:
                    continue

                payload = json.loads(line)
                message = payload.get("message", {})
                delta = str(message.get("content", ""))

                if delta:
                    yield _encode_stream_event(
                        {
                            "type": "delta",
                            "requestId": resolved_request_id,
                            "delta": delta,
                        }
                    )

                if payload.get("done"):
                    prompt_tokens = int(payload.get("prompt_eval_count", 0) or 0)
                    completion_tokens = int(payload.get("eval_count", 0) or 0)

                    yield _encode_stream_event(
                        {
                            "type": "done",
                            "requestId": resolved_request_id,
                            "provider": settings.provider_name,
                            "model": resolved_model_name,
                            "generatedAt": datetime.now(timezone.utc).isoformat(),
                            "usage": {
                                "inputTokens": prompt_tokens,
                                "outputTokens": completion_tokens,
                                "totalTokens": prompt_tokens + completion_tokens,
                            },
                            "timings": {
                                "totalDurationMs": _nanoseconds_to_milliseconds(payload.get("total_duration")),
                                "loadDurationMs": _nanoseconds_to_milliseconds(payload.get("load_duration")),
                                "promptEvalDurationMs": _nanoseconds_to_milliseconds(payload.get("prompt_eval_duration")),
                                "completionDurationMs": _nanoseconds_to_milliseconds(payload.get("eval_duration")),
                            },
                            "doneReason": str(payload.get("done_reason") or "stop"),
                        }
                    )
    except error.HTTPError as exc:
        response_body = exc.read().decode("utf-8", errors="replace")
        yield _encode_stream_event(
            {
                "type": "error",
                "requestId": resolved_request_id,
                "message": f"Ollama returned HTTP {exc.code}. Response: {response_body}",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
            }
        )
    except error.URLError:
        yield _encode_stream_event(
            {
                "type": "error",
                "requestId": resolved_request_id,
                "message": (
                    "The AI service could not reach Ollama. Make sure the Ollama app "
                    "or `ollama serve` is running."
                ),
                "generatedAt": datetime.now(timezone.utc).isoformat(),
            }
        )
    except TimeoutError:
        yield _encode_stream_event(
            {
                "type": "error",
                "requestId": resolved_request_id,
                "message": "The local model timed out before finishing the answer.",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
            }
        )
    except json.JSONDecodeError:
        yield _encode_stream_event(
            {
                "type": "error",
                "requestId": resolved_request_id,
                "message": "Ollama returned a stream chunk that could not be parsed.",
                "generatedAt": datetime.now(timezone.utc).isoformat(),
            }
        )


def _try_parse_structured_payload(raw_content: str) -> LlmStructuredPayload | None:
    """Attempt to parse the model output directly as JSON or from an embedded JSON block."""

    try:
        return LlmStructuredPayload.model_validate_json(raw_content)
    except Exception:
        pass

    json_start = raw_content.find("{")
    json_end = raw_content.rfind("}")

    if json_start == -1 or json_end == -1 or json_end <= json_start:
        return None

    candidate = raw_content[json_start : json_end + 1]

    try:
        return LlmStructuredPayload.model_validate_json(candidate)
    except Exception:
        return None


def _encode_stream_event(event: dict[str, Any]) -> str:
    """Serialize a streaming event as one NDJSON line."""

    return f"{json.dumps(event)}\n"


def _nanoseconds_to_milliseconds(value: Any) -> int:
    """Ollama reports durations in nanoseconds; the frontend wants milliseconds."""

    try:
        return int(int(value) / 1_000_000)
    except (TypeError, ValueError):
        return 0


def _format_size_label(size_bytes: int) -> str:
    """Return a human-readable size label for local model listings."""

    units = ["B", "KB", "MB", "GB", "TB"]
    value = float(size_bytes)
    unit_index = 0

    while value >= 1024 and unit_index < len(units) - 1:
        value /= 1024
        unit_index += 1

    if unit_index == 0:
        return f"{int(value)} {units[unit_index]}"

    return f"{value:.1f} {units[unit_index]}"


def _build_fallback_payload(
    user_prompt: str,
    raw_content: str,
) -> LlmStructuredPayload:
    """
    Convert a plain-text model answer into the structured contract the UI expects.

    The content is still real LLM output; this layer simply normalizes it so the
    rest of the platform can rely on a stable API.
    """

    json_like_payload = _coerce_json_like_payload(user_prompt, raw_content)

    if json_like_payload is not None:
        return json_like_payload

    cleaned_answer = raw_content.strip()
    non_empty_lines = [line.strip(" -*0123456789.") for line in cleaned_answer.splitlines()]
    non_empty_lines = [line for line in non_empty_lines if line]

    summary = _summarize_from_text(cleaned_answer)
    key_points = _extract_key_points(non_empty_lines, cleaned_answer)
    follow_ups = _build_follow_up_prompts(user_prompt)

    return LlmStructuredPayload(
        summary=summary,
        answer=cleaned_answer,
        key_points=key_points,
        suggested_follow_up_prompts=follow_ups,
    )


def _coerce_json_like_payload(
    user_prompt: str,
    raw_content: str,
) -> LlmStructuredPayload | None:
    """
    Salvage partially-correct JSON from smaller local models.

    This matters in practice because many local models understand the topic but still
    wobble on exact schema compliance.
    """

    try:
        decoded = json.loads(raw_content)
    except json.JSONDecodeError:
        return None

    if not isinstance(decoded, dict):
        return None

    answer = _coerce_to_text(decoded.get("answer"))
    summary = _coerce_to_text(decoded.get("summary"))
    key_points = _coerce_to_string_list(decoded.get("key_points"))
    follow_ups = _coerce_to_string_list(decoded.get("suggested_follow_up_prompts"))

    if not answer:
        answer = _flatten_json_strings(decoded)

    if not answer:
        answer = raw_content

    if not summary:
        summary = _summarize_from_text(answer)

    if len(key_points) < 4:
        key_points = _extract_key_points(
            [line for line in answer.splitlines() if line.strip()],
            answer,
        )

    if len(follow_ups) < 3:
        follow_ups = _build_follow_up_prompts(user_prompt)

    return LlmStructuredPayload(
        summary=summary,
        answer=answer,
        key_points=key_points[:4],
        suggested_follow_up_prompts=follow_ups[:3],
    )


def _summarize_from_text(raw_content: str) -> str:
    """Create a concise summary from the first part of the model answer."""

    normalized = " ".join(raw_content.split())
    sentences = [segment.strip() for segment in normalized.split(".") if segment.strip()]

    if not sentences:
        return "The model returned an answer, but the summary could not be extracted cleanly."

    if len(sentences) == 1:
        return f"{sentences[0]}."

    return f"{sentences[0]}. {sentences[1]}."


def _coerce_to_text(value: Any) -> str:
    """Convert nested JSON values into a readable string when possible."""

    if isinstance(value, str):
        return value.strip()

    if isinstance(value, list):
        return " ".join(_coerce_to_text(item) for item in value if _coerce_to_text(item)).strip()

    if isinstance(value, dict):
        return " ".join(
            text
            for text in (_coerce_to_text(item) for item in value.values())
            if text
        ).strip()

    return ""


def _coerce_to_string_list(value: Any) -> list[str]:
    """Normalize lists of strings or list-like JSON content into plain strings."""

    if not isinstance(value, list):
        return []

    normalized_items = []

    for item in value:
        text = _coerce_to_text(item)
        if text:
            normalized_items.append(text)

    return normalized_items


def _flatten_json_strings(value: Any) -> str:
    """Flatten arbitrary JSON into one readable text block."""

    if isinstance(value, str):
        return value.strip()

    if isinstance(value, list):
        return "\n".join(part for part in (_flatten_json_strings(item) for item in value) if part).strip()

    if isinstance(value, dict):
        return "\n".join(part for part in (_flatten_json_strings(item) for item in value.values()) if part).strip()

    return ""


def _extract_key_points(
    non_empty_lines: list[str],
    raw_content: str,
) -> list[str]:
    """Pull out bullet-like lines first, then fall back to sentences."""

    bullet_candidates = [
        line
        for line in non_empty_lines
        if 25 < len(line) < 220
    ]

    if len(bullet_candidates) >= 4:
        return bullet_candidates[:4]

    normalized = " ".join(raw_content.split())
    sentences = [segment.strip() for segment in normalized.split(".") if segment.strip()]
    sentence_points = [f"{sentence}." for sentence in sentences if len(sentence) > 20]

    if len(sentence_points) >= 4:
        return sentence_points[:4]

    padded_points = sentence_points + bullet_candidates

    while len(padded_points) < 4:
        padded_points.append(
            "The response came from a real local model and was normalized by the AI service."
        )

    return padded_points[:4]


def _build_follow_up_prompts(user_prompt: str) -> list[str]:
    """Generate sensible follow-up prompts from the user's original topic."""

    normalized_prompt = user_prompt.strip().rstrip("?.!")

    return [
        f"Give me a real-world case study related to {normalized_prompt.lower()}",
        f"What are the tradeoffs or failure modes of {normalized_prompt.lower()}?",
        f"Show me how {normalized_prompt.lower()} would look in a production system",
    ]
