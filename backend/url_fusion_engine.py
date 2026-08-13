"""Deterministic fusion for the frozen URL detector and optional cloud context."""

from __future__ import annotations

from typing import Any


NO_STRONG_WARNING_SIGNS = "NO_STRONG_WARNING_SIGNS"
NEEDS_CAUTION = "NEEDS_CAUTION"
SUSPICIOUS_SIGNS_FOUND = "SUSPICIOUS_SIGNS_FOUND"


URL_INDICATOR_PHRASES = {
    "TYPO": "resembles another domain through possible spelling changes",
    "HOMOGLYPH": "uses look-alike characters",
    "PUNYCODE": "uses an encoded hostname that may resemble another domain",
    "IMPERSON": "appears to imitate a trusted brand or service",
    "BRAND": "appears to imitate a trusted brand or service",
    "SUFFIX": "uses a potentially deceptive domain suffix",
    "SUBDOMAIN": "uses a potentially misleading subdomain",
    "TLD": "uses an unusual domain ending",
}


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


def _url_indicator_phrases(llm_review: dict[str, Any] | None) -> list[str]:
    phrases: list[str] = []
    for indicator in (llm_review or {}).get("indicators") or []:
        if not isinstance(indicator, dict):
            continue
        category = str(indicator.get("category", "")).upper()
        phrase = next(
            (
                value for keyword, value in URL_INDICATOR_PHRASES.items()
                if keyword in category
            ),
            None,
        )
        if phrase and phrase not in phrases:
            phrases.append(phrase)
        if len(phrases) == 2:
            break
    return phrases


def _specific_url_warning(llm_review: dict[str, Any] | None) -> str:
    phrases = _url_indicator_phrases(llm_review)
    if not phrases:
        return "The address structure contains patterns associated with deceptive domains."
    warning = f"The hostname {phrases[0]}"
    if len(phrases) == 2:
        warning += f" and {phrases[1]}"
    return f"{warning}."


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
                "The address structure did not show strong patterns associated with "
                "deceptive domains. This is not a guarantee that the website or its "
                "content is legitimate."
            ),
        }

    if model_signal == "SUSPICIOUS" and _high_confidence_clean_review(llm_review):
        return {
            "final_result": NO_STRONG_WARNING_SIGNS,
            "applied_rule": "URL_HIGH_CONFIDENCE_CLOUD_CLEAR",
            "message": (
                "The hostname did not show typosquatting, deceptive suffixes, or "
                "domain-level impersonation. Page content was not checked, so this "
                "is not a guarantee that the website is legitimate."
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
                "The address has unusual structural patterns, but the hostname does "
                "not clearly show typosquatting or domain impersonation. Verify the "
                "address before entering or sharing sensitive information."
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
            f"{_specific_url_warning(llm_review)} Avoid entering passwords, OTPs, "
            "or payment details until the website is independently verified."
        ),
    }
