"""Strict provider-neutral schemas for BantAI cloud contextual review."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


Assessment = Literal[
    "NO_STRONG_WARNING_SIGNS",
    "NEEDS_CAUTION",
    "SUSPICIOUS_SIGNS_FOUND",
]
Confidence = Literal["LOW", "MEDIUM", "HIGH"]
Severity = Literal["CONTEXTUAL", "STRONG", "CRITICAL"]


class LLMIndicator(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    category: str = Field(min_length=1, max_length=80)
    severity: Severity
    evidence: str = Field(min_length=1, max_length=300)


class LLMReview(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    assessment: Assessment
    confidence: Confidence
    indicators: list[LLMIndicator] = Field(default_factory=list, max_length=8)
    reasoning_summary: str = Field(min_length=1, max_length=800)
    recommended_action: str = Field(min_length=1, max_length=500)


def validate_llm_response(value: object) -> LLMReview:
    """Reject malformed output; never fill provider-omitted required fields."""
    if isinstance(value, LLMReview):
        return value
    if isinstance(value, str):
        return LLMReview.model_validate_json(value)
    return LLMReview.model_validate(value)
