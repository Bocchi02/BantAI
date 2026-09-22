"""Transparent deterministic email decision fusion for Signalam v1.1."""

from __future__ import annotations

from typing import Any


NO_STRONG_WARNING_SIGNS = "NO_STRONG_WARNING_SIGNS"
NEEDS_CAUTION = "NEEDS_CAUTION"
SUSPICIOUS_SIGNS_FOUND = "SUSPICIOUS_SIGNS_FOUND"

GUIDANCE = {
    NO_STRONG_WARNING_SIGNS: (
        "No strong credential, payment, urgency, or impersonation warning was "
        "identified. This is not a guarantee that the sender or email is legitimate."
    ),
    NEEDS_CAUTION: (
        "The email contains unclear or conflicting warning signals. Verify the sender "
        "through an official channel before clicking, paying, or sharing information."
    ),
    SUSPICIOUS_SIGNS_FOUND: (
        "The email contains language or requests commonly associated with scams. Do "
        "not share credentials, OTPs, personal information, or payment details until "
        "the request is verified through an official channel."
    ),
}


INDICATOR_PHRASES = {
    "OTP_REQUEST": "asks for an OTP",
    "MPIN_REQUEST": "asks for an MPIN",
    "PASSWORD_REQUEST": "asks for a password",
    "PIN_OR_CVV_REQUEST": "asks for a PIN or CVV",
    "CREDENTIAL_REQUEST": "requests account credentials",
    "ACCOUNT_SECURITY_SCARE": "uses an account-security scare",
    "ADVANCE_FEE": "requests an upfront fee before a promised benefit",
    "DELIVERY_PAYMENT_REQUEST": "requests a parcel or delivery payment",
    "INVESTMENT_PROMISE": "promises unusually certain investment returns",
    "JOB_OR_TASK_OFFER": "uses a paid-task or job offer as a lure",
    "PRIZE_OR_REWARD": "promises a prize or reward",
    "PAYMENT_REQUEST": "requests money or payment",
    "EMERGENCY_REQUEST": "uses an emergency money request",
    "AUTHORITY_IMPERSONATION": "claims to represent a trusted organization",
    "THREAT_OR_COERCION": "uses threats or coercion",
    "URGENCY": "pressures the reader to act urgently",
    "ACTION_DEMAND": "demands an immediate action",
    "SCARCITY": "uses a limited-time claim",
    "FAMILIARITY": "claims familiarity while requesting something sensitive",
    "ROMANCE_OR_EMOTIONAL_MANIPULATION": "uses emotional pressure for money",
    "COMMITMENT_ESCALATION": "asks for another task or payment",
    "CREDENTIAL_VERIFICATION_PRETEXT": "uses verification as a reason to request credentials",
    "ADVANCE_FEE_MANIPULATION": "requires payment before a promised benefit",
    "EMPLOYMENT_LURE": "uses earnings or employment as a lure",
    "IMPERSONATION": "may be impersonating a trusted person or organization",
    "COERCION": "uses coercion or a threatened consequence",
    "FEAR": "uses fear to pressure the reader",
    "REWARD": "uses a promised reward as pressure",
    "AUTHORITY": "uses authority to pressure the reader",
    "EMERGENCY": "uses an emergency as social pressure",
}

GENERIC_INDICATOR_CATEGORIES = {
    "ADVANCE_FEE_MANIPULATION",
    "AUTHORITY",
    "COERCION",
    "CREDENTIAL_VERIFICATION_PRETEXT",
    "EMERGENCY",
    "EMPLOYMENT_LURE",
    "FEAR",
    "IMPERSONATION",
    "REWARD",
}


def _is_mislabeled_inbound_payment(marker: dict[str, Any]) -> bool:
    if str(marker.get("category", "")).upper() != "PAYMENT_REQUEST":
        return False
    evidence = " ".join(str(marker.get("evidence", "")).lower().split())
    return (
        ("you have received" in evidence or "you've received" in evidence)
        or all(part in evidence for part in ("transfer from:", "transfer to:", "transfer amount:"))
    )


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


def _indicator_phrases(
    local_indicators: dict[str, Any] | None,
    llm_review: dict[str, Any] | None,
) -> list[str]:
    markers = [
        *((local_indicators or {}).get("markers") or []),
        *((llm_review or {}).get("indicators") or []),
    ]
    categories = [
        str(marker.get("category", "")).upper()
        for marker in markers
        if isinstance(marker, dict) and not _is_mislabeled_inbound_payment(marker)
    ]
    ordered = [
        category for category in categories
        if category not in GENERIC_INDICATOR_CATEGORIES
    ] + [
        category for category in categories
        if category in GENERIC_INDICATOR_CATEGORIES
    ]
    phrases: list[str] = []
    for category in ordered:
        phrase = INDICATOR_PHRASES.get(category)
        if phrase and phrase not in phrases:
            phrases.append(phrase)
        if len(phrases) == 2:
            break
    return phrases


def _specific_guidance(
    *,
    final_result: str,
    email_signal: str,
    local_indicators: dict[str, Any] | None,
    llm_review: dict[str, Any] | None,
) -> str:
    if final_result == NO_STRONG_WARNING_SIGNS:
        return GUIDANCE[NO_STRONG_WARNING_SIGNS]

    phrases = _indicator_phrases(local_indicators, llm_review)
    if phrases:
        evidence = f"The email {phrases[0]}"
        if len(phrases) == 2:
            evidence += f" and {phrases[1]}"
        evidence += "."
    elif str(email_signal).upper() == "SUSPICIOUS":
        evidence = (
            "The email contains suspicious language patterns, but no specific strong "
            "scam request was identified."
        )
    else:
        evidence = GUIDANCE[final_result].split(". ", maxsplit=1)[0] + "."

    if final_result == SUSPICIOUS_SIGNS_FOUND:
        action = (
            "Do not share credentials, OTPs, personal information, or payment details "
            "until the request is verified through an official channel."
        )
    else:
        action = (
            "Verify the sender through an official channel before clicking, paying, "
            "or sharing information."
        )
    return f"{evidence} {action}"


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
        "message": _specific_guidance(
            final_result=final_result,
            email_signal=normalized_email,
            local_indicators=local_indicators,
            llm_review=llm_review,
        ),
        "applied_rule": rule,
        "strategy": "DETERMINISTIC",
        "overall_numeric_risk_score": False,
    }
