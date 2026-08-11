"""Deterministic fusion for the frozen URL detector and optional cloud context."""

from __future__ import annotations

from typing import Any


NO_STRONG_WARNING_SIGNS = "NO_STRONG_WARNING_SIGNS"
NEEDS_CAUTION = "NEEDS_CAUTION"
SUSPICIOUS_SIGNS_FOUND = "SUSPICIOUS_SIGNS_FOUND"


def _llm_assessment(llm_review: dict[str, Any] | None) -> str | None:
    review = llm_review or {}
    if review.get("status") in {"OFF", "CHECKING", "UNAVAILABLE", None}:
        return None
    assessment = review.get("assessment") or review.get("status")
    if assessment in {
        NO_STRONG_WARNING_SIGNS,
        NEEDS_CAUTION,
        SUSPICIOUS_SIGNS_FOUND,
    }:
        return str(assessment)
    return None


def _high_confidence_clean_review(llm_review: dict[str, Any] | None) -> bool:
    review = llm_review or {}
    indicators = review.get("indicators") or []
    has_strong_indicator = any(
        str(indicator.get("severity", "")).upper() in {"STRONG", "CRITICAL"}
        for indicator in indicators
        if isinstance(indicator, dict)
    )
    return (
        _llm_assessment(review) == NO_STRONG_WARNING_SIGNS
        and str(review.get("confidence", "")).upper() == "HIGH"
        and not has_strong_indicator
    )


def fuse_url_signals(
    *,
    url_signal: str,
    llm_review: dict[str, Any] | None,
) -> dict[str, str]:
    """Fuse the frozen RF signal with a narrowly guarded cloud hostname review."""
    model_signal = str(url_signal or "UNAVAILABLE").upper()
    assessment = _llm_assessment(llm_review)

    if model_signal == "SAFE":
        return {
            "final_result": NO_STRONG_WARNING_SIGNS,
            "applied_rule": "URL_LOCAL_CLEAR",
            "message": (
                "No strong warning signs were found in this web address. This does "
                "not guarantee that the website or its content is legitimate."
            ),
        }

    if model_signal == "SUSPICIOUS" and _high_confidence_clean_review(llm_review):
        return {
            "final_result": NO_STRONG_WARNING_SIGNS,
            "applied_rule": "URL_HIGH_CONFIDENCE_CLOUD_CLEAR",
            "message": (
                "No strong warning signs were found in this web address. This does "
                "not guarantee that the website or its content is legitimate."
            ),
        }

    if model_signal == "SUSPICIOUS" and assessment in {
        NO_STRONG_WARNING_SIGNS,
        NEEDS_CAUTION,
    }:
        return {
            "final_result": NEEDS_CAUTION,
            "applied_rule": "URL_MODEL_AI_DISAGREEMENT",
            "message": (
                "Some warning signs remain in this web address. Verify the address "
                "before entering or sharing sensitive information."
            ),
        }

    return {
        "final_result": SUSPICIOUS_SIGNS_FOUND,
        "applied_rule": (
            "URL_CORROBORATED_WARNING"
            if assessment == SUSPICIOUS_SIGNS_FOUND
            else "URL_LOCAL_WARNING"
        ),
        "message": (
            "Warning signs were found in this web address. Avoid entering passwords, "
            "OTPs, or payment details until the website is independently verified."
        ),
    }
