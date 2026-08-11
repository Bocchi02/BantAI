"""Transparent deterministic email decision fusion for BantAI v1.1."""

from __future__ import annotations

from typing import Any


NO_STRONG_WARNING_SIGNS = "NO_STRONG_WARNING_SIGNS"
NEEDS_CAUTION = "NEEDS_CAUTION"
SUSPICIOUS_SIGNS_FOUND = "SUSPICIOUS_SIGNS_FOUND"

GUIDANCE = {
    NO_STRONG_WARNING_SIGNS: (
        "No strong warning signs were found. This does not guarantee that the email "
        "or website is legitimate."
    ),
    NEEDS_CAUTION: (
        "Some details require caution. Verify the sender or website before clicking, "
        "paying, or sharing information."
    ),
    SUSPICIOUS_SIGNS_FOUND: (
        "Warning signs were found. Do not provide passwords, OTPs, "
        "personal information, or payment details until you verify the request "
        "through an official channel."
    ),
}


def _marker_support(indicators: dict[str, Any] | None) -> bool:
    source = indicators or {}
    return bool(source.get("critical_count", 0) or source.get("strong_count", 0))


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


def fuse_email_signals(
    *,
    email_signal: str,
    local_indicators: dict[str, Any] | None,
    llm_review: dict[str, Any] | None,
) -> dict[str, Any]:
    """Apply Rules A-H; the current website signal is intentionally not an input."""
    normalized_email = str(email_signal or "UNAVAILABLE").upper()
    xlm_suspicious = normalized_email == "SUSPICIOUS"
    xlm_clean = normalized_email == "SAFE"
    markers_support = _marker_support(local_indicators)
    llm_assessment = _llm_assessment(llm_review)

    suspicious_sources = []
    if xlm_suspicious:
        suspicious_sources.append("EMAIL_MODEL")
    if markers_support:
        suspicious_sources.append("LOCAL_INDICATORS")
    if llm_assessment == SUSPICIOUS_SIGNS_FOUND:
        suspicious_sources.append("LLM_REVIEW")

    # Rule H: local operation remains available when cloud review is off/unavailable.
    if llm_assessment is None:
        if xlm_clean and not markers_support:
            final_result = NO_STRONG_WARNING_SIGNS
            supporting_sources = ["EMAIL_MODEL", "LOCAL_INDICATORS"]
            rule = "H_LOCAL_CLEAN"
        elif xlm_suspicious and markers_support:
            final_result = SUSPICIOUS_SIGNS_FOUND
            supporting_sources = suspicious_sources
            rule = "H_LOCAL_CORROBORATED"
        else:
            final_result = NEEDS_CAUTION
            supporting_sources = suspicious_sources or ["LOCAL_ANALYSIS"]
            rule = "H_LOCAL_AMBIGUOUS"
    # Rule F: at least two independent suspicious sources are required for red.
    elif len(suspicious_sources) >= 2:
        final_result = SUSPICIOUS_SIGNS_FOUND
        supporting_sources = suspicious_sources
        rule = "F_CORROBORATED_SUSPICIOUS"
    # Rule A: all available evidence is consistently clear.
    elif (
        xlm_clean
        and llm_assessment == NO_STRONG_WARNING_SIGNS
        and not markers_support
    ):
        final_result = NO_STRONG_WARNING_SIGNS
        supporting_sources = ["EMAIL_MODEL", "LOCAL_INDICATORS", "LLM_REVIEW"]
        rule = "A_CONSISTENTLY_CLEAR"
    # Rules B-E and G: disagreement, lone warnings, and incomplete evidence are yellow.
    else:
        final_result = NEEDS_CAUTION
        supporting_sources = suspicious_sources or ["INCOMPLETE_OR_DIFFERING_EVIDENCE"]
        rule = "B_TO_E_OR_G_CAUTION"

    return {
        "final_result": final_result,
        "supporting_sources": supporting_sources,
        "message": GUIDANCE[final_result],
        "applied_rule": rule,
        "strategy": "DETERMINISTIC",
        "overall_numeric_risk_score": False,
    }
