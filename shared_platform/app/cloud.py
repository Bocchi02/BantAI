from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from backend.llm.base import LLMProviderError
from backend.llm.gemini_provider import GeminiProvider


def unavailable(reason: str = "PROVIDER_UNAVAILABLE") -> dict[str, Any]:
    return {
        "status": "UNAVAILABLE",
        "assessment": None,
        "confidence": None,
        "indicators": [],
        "reasoning_summary": "Cloud AI Review could not be completed. Local BantAI checks are still available.",
        "recommended_action": "Use the local detector guidance and verify unexpected requests independently.",
        "failure_reason": reason,
    }


def connection_status() -> dict[str, Any]:
    """Return readiness only; never expose provider credentials or payloads."""

    provider = GeminiProvider(
        api_key=os.getenv("GEMINI_API_KEY", ""),
        model=os.getenv("GEMINI_MODEL", "gemini-3.6-flash"),
        fallback_model=os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite"),
    )
    return {
        "provider": "gemini",
        "configured": provider.configured,
        "available": provider.available,
    }


def review(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        provider = GeminiProvider(
            api_key=os.getenv("GEMINI_API_KEY", ""),
            model=os.getenv("GEMINI_MODEL", "gemini-3.6-flash"),
            fallback_model=os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite"),
        )
        if not provider.available:
            return unavailable()
        result = provider.review(payload)
        # Successful reviews use the strict provider-neutral schema directly.
        # `status` is reserved for the UNAVAILABLE transport envelope; adding
        # it to a successful review would be rejected as an unexpected field.
        return result.model_dump()
    except LLMProviderError as exc:
        return unavailable(getattr(exc, "reason_code", "PROVIDER_UNAVAILABLE"))
    except Exception:
        return unavailable()
