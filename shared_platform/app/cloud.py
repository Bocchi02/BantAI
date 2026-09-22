from __future__ import annotations

import os
import re
import sys
from pathlib import Path
from typing import Any


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from backend.llm.base import LLMProviderError
from backend.llm.gemini_provider import GeminiProvider
from backend.llm.redaction import redact_text, sender_parts, truncate_preserving_ends
from backend.llm.authentication import minimize_authentication


PASTED_MESSAGE_MODEL = "gemini-3.5-flash-lite"
PASTED_MESSAGE_MAX_CLOUD_CHARS = 7000
ACTIVITY_METADATA_MAX_CLOUD_CHARS = 800
ACTIVITY_EMAIL_MAX_CLOUD_CHARS = 7000
ACTIVITY_URL_MAX_CLOUD_CHARS = 512
DIRECT_EMAIL_METADATA_MAX_CLOUD_CHARS = 500
DIRECT_EMAIL_MAX_CLOUD_CHARS = 7000


_PRIVACY_MARKER_REPLACEMENTS = {
    "EMAIL": "an email address hidden for privacy",
    "PHONE": "a phone number hidden for privacy",
    "OTP": "a one-time code hidden for privacy",
    "CARD": "payment-card details hidden for privacy",
    "ACCOUNT": "account details hidden for privacy",
}


def _humanize_privacy_markers(value: Any) -> str:
    """Prevent internal redaction tokens from leaking into user-facing text."""

    text = str(value or "")
    for marker, replacement in _PRIVACY_MARKER_REPLACEMENTS.items():
        text = re.sub(
            rf"\[?\s*{marker}[\s_-]*REDACTED\s*\]?",
            replacement,
            text,
            flags=re.IGNORECASE,
        )
    return text.strip()


def _is_sender_redaction_only_indicator(indicator: dict[str, Any]) -> bool:
    """A hidden address is a privacy limit, not evidence against the sender."""

    category = str(indicator.get("category") or "")
    evidence = str(indicator.get("evidence") or "")
    combined = f"{category} {evidence}"
    has_email_marker = bool(
        re.search(r"\[?\s*EMAIL[\s_-]*REDACTED\s*\]?", combined, re.IGNORECASE)
    )
    sender_identity_claim = bool(
        re.search(r"sender|identity|email address", combined, re.IGNORECASE)
    )
    privacy_limit_claim = bool(
        re.search(r"redact|hidden|cannot be verified|unverified|not verified", combined, re.IGNORECASE)
    )
    return has_email_marker and sender_identity_claim and privacy_limit_claim


def _sanitize_activity_explanation(result: dict[str, Any]) -> dict[str, Any]:
    """Make provider text safe and clear without changing its assessment."""

    sanitized = dict(result)
    sanitized["reasoning_summary"] = _humanize_privacy_markers(
        sanitized.get("reasoning_summary")
    )
    sanitized["recommended_action"] = _humanize_privacy_markers(
        sanitized.get("recommended_action")
    )
    sanitized_indicators = []
    for raw_indicator in sanitized.get("indicators") or []:
        indicator = dict(raw_indicator)
        if _is_sender_redaction_only_indicator(indicator):
            continue
        indicator["category"] = _humanize_privacy_markers(indicator.get("category"))
        indicator["evidence"] = _humanize_privacy_markers(indicator.get("evidence"))
        sanitized_indicators.append(indicator)
    sanitized["indicators"] = sanitized_indicators
    return sanitized


def _correct_email_context_wording(result: dict[str, Any], content_scope: str) -> dict[str, Any]:
    """Keep provider wording aligned with the context that was actually supplied."""

    corrected = dict(result)
    summary = str(corrected.get("reasoning_summary") or "")
    combined_redaction_claim = re.compile(
        r"(?:the\s+)?sender(?:\s+details|\s+address)?\s+and\s+(?:the\s+)?(?:email\s+|message\s+)?body\s+"
        r"(?:is|are|was|were|remain|remains)\s+(?:privacy[- ]?)?redacted",
        re.IGNORECASE,
    )
    body_redaction_claim = re.compile(
        r"(?:the\s+)?(?:email\s+|message\s+)?body\s+"
        r"(?:is|are|was|were|remain|remains)\s+(?:privacy[- ]?)?redacted",
        re.IGNORECASE,
    )
    if content_scope == "EMAIL_PROVIDER_SENDER_SUBJECT_BODY":
        replacement = "personal identifiers were protected before review"
    else:
        replacement = "the temporary message text was unavailable for this explanation"
    summary = combined_redaction_claim.sub(replacement, summary)
    summary = body_redaction_claim.sub(replacement, summary)
    corrected["reasoning_summary"] = summary
    if content_scope == "EMAIL_PROVIDER_SENDER_SUBJECT_BODY":
        corrected["indicators"] = [
            indicator
            for indicator in corrected.get("indicators") or []
            if not (
                re.search(r"email|message|body", str(indicator.get("category") or ""), re.IGNORECASE)
                and re.search(
                    r"unavailable|not available|missing|redacted",
                    f"{indicator.get('category', '')} {indicator.get('evidence', '')}",
                    re.IGNORECASE,
                )
            )
        ]
    return corrected


def _correct_incoming_transfer_wording(
    result: dict[str, Any],
    payload: dict[str, Any],
) -> dict[str, Any]:
    """Prevent a received-transfer receipt from being described as a payment request."""

    if payload.get("analysis_type") != "EMAIL_CONTEXT":
        return result
    context = " ".join(str(payload.get("email_context") or "").lower().split())
    incoming_notice = bool(
        re.search(
            r"\byou (?:have|'ve) (?:successfully )?received\b.{0,100}\b(?:funds?|money|payment|transfer)\b",
            context,
        )
        or all(part in context for part in ("transfer from:", "transfer to:", "transfer amount:"))
    )
    outbound_request = bool(
        re.search(r"\b(?:please|kindly)\s+(?:send|pay|transfer|deposit)\b", context)
        or re.search(r"\byou\s+(?:must|need to|should)\s+(?:send|pay|transfer|deposit)\b", context)
        or re.search(r"\b(?:send|pay|deposit)\s+(?:us\s+)?(?:money|payment|fee|php|₱)\b", context)
    )
    if not incoming_notice or outbound_request:
        return result

    corrected = dict(result)
    corrected["indicators"] = [
        indicator
        for indicator in corrected.get("indicators") or []
        if str(indicator.get("category") or "").upper() != "PAYMENT_REQUEST"
    ]
    summary = str(corrected.get("reasoning_summary") or "")
    inaccurate_payment_claim = re.search(
        r"\b(?:asks?|requests?|directs?|tells?)\b.{0,50}\b(?:send|pay|transfer|deposit)\b.{0,35}\b(?:money|payment|funds?|fee)?",
        summary,
        re.IGNORECASE,
    )
    if inaccurate_payment_claim:
        corrected["reasoning_summary"] = (
            "The email describes an incoming transfer and does not contain a clear request "
            "for you to send money. Signalam cannot independently confirm that the notification is authentic."
        )
        corrected["recommended_action"] = (
            "Confirm the transaction directly in the official banking app or website, without using links from the email."
        )
    return corrected


def unavailable(reason: str = "PROVIDER_UNAVAILABLE") -> dict[str, Any]:
    return {
        "status": "UNAVAILABLE",
        "assessment": None,
        "confidence": None,
        "indicators": [],
        "reasoning_summary": "Cloud AI Review could not be completed. Local Signalam checks are still available.",
        "recommended_action": "Use the server-model guidance and verify unexpected requests independently.",
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
        return _correct_incoming_transfer_wording(result.model_dump(), payload)
    except LLMProviderError as exc:
        return unavailable(getattr(exc, "reason_code", "PROVIDER_UNAVAILABLE"))
    except Exception:
        return unavailable()


def prepare_direct_email_review_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Create the only email payload allowed to cross the public-provider boundary.

    Request field names such as ``redacted_context`` are not a security control:
    paired clients may be outdated, modified, or compromised.  Redaction and
    minimization therefore happen again here, immediately before ``review`` can
    create a provider request.
    """

    provider = str(payload.get("provider") or "").strip().lower()
    sender_display_name, sender_domain = sender_parts(
        str(payload.get("redacted_sender") or "")
    )
    return {
        "analysis_type": "EMAIL_CONTEXT",
        "provider": provider,
        "sender_display_name": truncate_preserving_ends(
            sender_display_name or "",
            DIRECT_EMAIL_METADATA_MAX_CLOUD_CHARS,
        ) or None,
        "sender_domain": sender_domain,
        "sender_authentication": minimize_authentication(
            payload.get("sender_authentication"), provider
        ),
        "subject": truncate_preserving_ends(
            redact_text(str(payload.get("redacted_subject") or "")),
            DIRECT_EMAIL_METADATA_MAX_CLOUD_CHARS,
        ),
        "email_context": truncate_preserving_ends(
            redact_text(str(payload.get("redacted_context") or "")),
            DIRECT_EMAIL_MAX_CLOUD_CHARS,
        ),
        # These are detector observations, not message content.  Keep only
        # structured values supplied by the authenticated application flow.
        "email_model": payload.get("email_model") if isinstance(payload.get("email_model"), dict) else {},
        "local_indicators": payload.get("local_indicators") if isinstance(payload.get("local_indicators"), dict) else {},
        "redacted_before_provider": True,
    }


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


def explain_activity(payload: dict[str, Any]) -> dict[str, Any]:
    """Explain explicitly supplied context without storing it."""

    recorded_outcome = str(payload.get("recorded_outcome") or "")
    review_payload = {
        "analysis_type": "ACTIVITY_EXPLANATION",
        "event_type": payload.get("event_type"),
        "recorded_outcome": recorded_outcome,
        "content_scope": payload.get("content_scope"),
    }
    content_scope = str(payload.get("content_scope") or "")
    if payload.get("event_type") == "URL":
        review_payload["url_origin"] = truncate_preserving_ends(
            str(payload.get("url_origin") or ""),
            ACTIVITY_URL_MAX_CLOUD_CHARS,
        )
    else:
        _, sender_domain = sender_parts(str(payload.get("sender") or ""))
        review_payload.update({
            "provider": str(payload.get("provider") or ""),
            "sender_domain": sender_domain,
            "sender_authentication": minimize_authentication(payload.get("sender_authentication"), payload.get("provider")),
            "sender": truncate_preserving_ends(
                redact_text(str(payload.get("sender") or "")),
                ACTIVITY_METADATA_MAX_CLOUD_CHARS,
            ),
            "subject": truncate_preserving_ends(
                redact_text(str(payload.get("subject") or "")),
                ACTIVITY_METADATA_MAX_CLOUD_CHARS,
            ),
            "redacted_before_provider": True,
        })
        if content_scope == "EMAIL_PROVIDER_SENDER_SUBJECT_BODY":
            review_payload["email_body"] = truncate_preserving_ends(
                redact_text(str(payload.get("email_body") or "")),
                ACTIVITY_EMAIL_MAX_CLOUD_CHARS,
            )

    try:
        provider = GeminiProvider(
            api_key=os.getenv("GEMINI_API_KEY", ""),
            model=os.getenv("GEMINI_MODEL", "gemini-3.6-flash"),
            fallback_model=os.getenv("GEMINI_FALLBACK_MODEL", "gemini-3.5-flash-lite"),
        )
        if not provider.available:
            raise LLMProviderError("Cloud explanation provider is unavailable.")
        result = _sanitize_activity_explanation(
            provider.review(review_payload).model_dump()
        )
        if payload.get("event_type") == "EMAIL":
            result = _correct_email_context_wording(result, content_scope)
        result["assessment"] = recorded_outcome
        if recorded_outcome == "NO_STRONG_WARNING_SIGNS":
            result["indicators"] = []
        return {
            "status": "COMPLETE",
            **result,
            "stored": False,
            "analysis_scope": payload.get("content_scope"),
            "full_context_available": content_scope == "EMAIL_PROVIDER_SENDER_SUBJECT_BODY",
            "redacted_before_provider": payload.get("event_type") == "EMAIL",
            "body_context_sent_to_provider": (
                payload.get("event_type") == "EMAIL"
                and content_scope == "EMAIL_PROVIDER_SENDER_SUBJECT_BODY"
            ),
        }
    except LLMProviderError as exc:
        failure_reason = getattr(exc, "reason_code", "PROVIDER_UNAVAILABLE")
    except Exception:
        failure_reason = "PROVIDER_UNAVAILABLE"
    return {
        "status": "UNAVAILABLE",
        "assessment": recorded_outcome,
        "confidence": None,
        "indicators": [],
        "reasoning_summary": "The additional Cloud AI explanation is unavailable right now.",
        "recommended_action": "Use the recorded Signalam result and try opening the explanation again later.",
        "failure_reason": failure_reason,
        "stored": False,
        "analysis_scope": payload.get("content_scope"),
        "full_context_available": content_scope == "EMAIL_PROVIDER_SENDER_SUBJECT_BODY",
        "redacted_before_provider": payload.get("event_type") == "EMAIL",
        "body_context_sent_to_provider": False,
    }
