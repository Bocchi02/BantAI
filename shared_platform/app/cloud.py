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
from backend.llm.redaction import redact_text, truncate_preserving_ends


PASTED_MESSAGE_MODEL = "gemini-3.5-flash-lite"
PASTED_MESSAGE_MAX_CLOUD_CHARS = 7000


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


def review_pasted_message(message: str) -> dict[str, Any]:
    """Run an explicit no-storage text review through Gemini Flash-Lite."""

    minimized_message = truncate_preserving_ends(
        redact_text(message),
        PASTED_MESSAGE_MAX_CLOUD_CHARS,
    )
    try:
        provider = GeminiProvider(
            api_key=os.getenv("GEMINI_API_KEY", ""),
            model=PASTED_MESSAGE_MODEL,
            fallback_model="",
        )
        if not provider.available:
            return {
                "status": "UNAVAILABLE",
                "assessment": None,
                "confidence": None,
                "indicators": [],
                "reasoning_summary": "AI message review is unavailable right now.",
                "recommended_action": "Review unexpected requests independently and try again later.",
                "failure_reason": "PROVIDER_UNAVAILABLE",
                "model": PASTED_MESSAGE_MODEL,
                "stored": False,
                "redacted_before_ai": True,
                "analysis_scope": "PASTED_TEXT_ONLY",
            }
        result = provider.review({
            "analysis_type": "PASTED_MESSAGE",
            "message_text": minimized_message,
            "content_source": "EXPLICIT_USER_SUBMISSION",
            "sender_or_headers_available": False,
            "links_or_attachments_opened": False,
        })
        return {
            "status": "COMPLETE",
            **result.model_dump(),
            "model": PASTED_MESSAGE_MODEL,
            "stored": False,
            "redacted_before_ai": True,
            "analysis_scope": "PASTED_TEXT_ONLY",
        }
    except LLMProviderError as exc:
        failure_reason = getattr(exc, "reason_code", "PROVIDER_UNAVAILABLE")
    except Exception:
        failure_reason = "PROVIDER_UNAVAILABLE"
    return {
        "status": "UNAVAILABLE",
        "assessment": None,
        "confidence": None,
        "indicators": [],
        "reasoning_summary": "AI message review is unavailable right now.",
        "recommended_action": "Review unexpected requests independently and try again later.",
        "failure_reason": failure_reason,
        "model": PASTED_MESSAGE_MODEL,
        "stored": False,
        "redacted_before_ai": True,
        "analysis_scope": "PASTED_TEXT_ONLY",
    }
