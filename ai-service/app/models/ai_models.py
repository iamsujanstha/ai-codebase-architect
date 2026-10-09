"""Public Python contracts; NestJS maps response fields to browser camelCase."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=8000)


class GenerateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    prompt: str = Field(min_length=3, max_length=4000)
    messages: Optional[list[ChatMessage]] = Field(default=None, max_length=40)
    request_id: Optional[str] = Field(default=None, max_length=100)
    model: Optional[str] = Field(default=None, min_length=1, max_length=200)

    @field_validator("prompt")
    @classmethod
    def validate_prompt(cls, value):
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Prompt must contain at least 3 non-space characters")
        return value

    @field_validator("messages")
    @classmethod
    def validate_history(cls, value):
        if sum(len(message.content) for message in value or []) > 32000:
            raise ValueError("History must contain at most 32000 characters")
        return value


class GenerateResponse(BaseModel):
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


class AvailableModel(BaseModel):
    name: str
    size_bytes: int = 0
    size_label: str = ""
    modified_at: str = ""
    digest: Optional[str] = None
    family: Optional[str] = None
    parameter_size: Optional[str] = None
    quantization_level: Optional[str] = None


class ModelsResponse(BaseModel):
    provider: str
    default_model: str
    models: list[AvailableModel]
