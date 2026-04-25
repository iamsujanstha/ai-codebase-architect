"""
Pydantic models define the AI service contract.

Why be strict here?
- API contracts are easier to trust when input and output are validated
- OpenAPI docs become clearer
- downstream consumers can integrate with more confidence
"""

from typing import Optional
from pydantic import BaseModel, Field, field_validator


class GenerateRequest(BaseModel):
    """Incoming request model from the backend gateway."""

    prompt: str = Field(
        ...,
        min_length=3,
        max_length=4000,
        description="The user prompt to send into the AI engine.",
    )
    request_id: Optional[str] = Field(
        default=None,
        description="Optional correlation identifier supplied by the backend.",
    )
    model: Optional[str] = Field(
        default=None,
        description="Optional locally available Ollama model name selected by the user.",
    )

    @field_validator("prompt")
    @classmethod
    def strip_and_validate_prompt(cls, value: str) -> str:
        normalized_value = value.strip()

        if len(normalized_value) < 3:
            raise ValueError("Prompt must contain at least 3 non-space characters.")

        return normalized_value


class GenerateResponse(BaseModel):
    """Structured response returned by the AI service."""

    request_id: str
    prompt: str
    summary: str
    answer: str
    key_points: list[str]
    suggested_follow_up_prompts: list[str]
    provider: str
    model: str
    processing_time_ms: int
    generated_at: str


class LlmStructuredPayload(BaseModel):
    """
    Intermediate structured payload produced by the LLM layer.

    This gives the service one more validation boundary before model output is
    returned to the backend and frontend.
    """

    summary: str = Field(
        ...,
        min_length=20,
        description="A concise summary of the answer.",
    )
    answer: str = Field(
        ...,
        min_length=80,
        description="The main answer rendered by the frontend.",
    )
    key_points: list[str] = Field(
        ...,
        min_length=3,
        max_length=6,
        description="Short bullet points that distill the answer.",
    )
    suggested_follow_up_prompts: list[str] = Field(
        ...,
        min_length=2,
        max_length=4,
        description="Natural follow-up questions for the user.",
    )


class AvailableModel(BaseModel):
    """Summary of a locally available Ollama model."""

    name: str
    size_bytes: int
    size_label: str
    modified_at: str
    digest: Optional[str] = None
    family: Optional[str] = None
    parameter_size: Optional[str] = None
    quantization_level: Optional[str] = None


class ModelsResponse(BaseModel):
    """Response model for listing available local models."""

    default_model: str
    models: list[AvailableModel]
