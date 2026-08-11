"""Explainable, non-probabilistic scam indicator extraction for BantAI v1.1."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable


SEVERITIES = {
    "CONTEXTUAL": 1,
    "STRONG": 2,
    "CRITICAL": 3,
}


@dataclass(frozen=True)
class IndicatorRule:
    category: str
    severity: str
    patterns: tuple[str, ...]
    credential_related: bool = False


RULES = (
    IndicatorRule(
        "OTP_REQUEST",
        "CRITICAL",
        (
            r"\b(?:send|share|provide|give|reply(?:\s+with)?|submit|ibigay|ipadala)\b.{0,45}\b(?:otp|one[ -]?time (?:password|pin)|verification code)\b",
            r"\b(?:otp|one[ -]?time (?:password|pin)|verification code)\b.{0,45}\b(?:send|share|provide|give|reply|submit|ibigay|ipadala)\b",
        ),
        credential_related=True,
    ),
    IndicatorRule(
        "MPIN_REQUEST",
        "CRITICAL",
        (
            r"\b(?:send|share|provide|give|enter|submit|ibigay|ipadala)\b.{0,45}\bmpin\b",
            r"\bmpin\b.{0,45}\b(?:send|share|provide|give|enter|submit|ibigay|ipadala)\b",
        ),
        credential_related=True,
    ),
    IndicatorRule(
        "PASSWORD_REQUEST",
        "CRITICAL",
        (
            r"\b(?:send|share|provide|give|reply(?:\s+with)?|submit|confirm|ibigay|ipadala)\b.{0,45}\b(?:password|passcode)\b",
            r"\b(?:password|passcode)\b.{0,45}\b(?:send|share|provide|give|reply|submit|confirm|ibigay|ipadala)\b",
        ),
        credential_related=True,
    ),
    IndicatorRule(
        "PIN_OR_CVV_REQUEST",
        "CRITICAL",
        (
            r"\b(?:send|share|provide|give|enter|submit|ibigay|ipadala)\b.{0,45}\b(?:pin|cvv|cvc|security code)\b",
            r"\b(?:pin|cvv|cvc|security code)\b.{0,45}\b(?:send|share|provide|give|enter|submit|ibigay|ipadala)\b",
        ),
        credential_related=True,
    ),
    IndicatorRule(
        "CREDENTIAL_REQUEST",
        "CRITICAL",
        (
            r"\b(?:verify|confirm|validate)\b.{0,55}\b(?:login|account|identity)\b.{0,55}\b(?:password|otp|mpin|pin|cvv|credentials?)\b",
            r"\b(?:password|otp|mpin|pin|cvv|credentials?)\b.{0,55}\b(?:verify|confirm|validate|send|share|provide)\b",
        ),
        credential_related=True,
    ),
    IndicatorRule(
        "ACCOUNT_SECURITY_SCARE",
        "STRONG",
        (
            r"\b(?:account|wallet|gcash|maya|online banking)\b.{0,60}\b(?:suspend(?:ed)?|block(?:ed)?|lock(?:ed)?|compromised|unauthori[sz]ed|unusual activity|security alert)\b",
            r"\b(?:suspend(?:ed)?|block(?:ed)?|lock(?:ed)?|compromised|unauthori[sz]ed)\b.{0,60}\b(?:account|wallet|gcash|maya|online banking)\b",
        ),
    ),
    IndicatorRule(
        "ADVANCE_FEE",
        "STRONG",
        (
            r"\b(?:pay|send|transfer|deposit)\b.{0,50}\b(?:fee|tax|processing|release|activation|clearance)\b.{0,70}\b(?:claim|receive|release|unlock|withdraw)\b",
            r"\b(?:fee|tax|processing fee|release fee)\b.{0,70}\b(?:before|to)\b.{0,45}\b(?:claim|receive|release|unlock|withdraw)\b",
        ),
    ),
    IndicatorRule(
        "DELIVERY_PAYMENT_REQUEST",
        "STRONG",
        (
            r"\b(?:parcel|package|delivery|courier|shipment)\b.{0,70}\b(?:pay|payment|fee|gcash|maya|transfer)\b",
            r"\b(?:pay|payment|fee)\b.{0,70}\b(?:parcel|package|delivery|courier|shipment)\b",
        ),
    ),
    IndicatorRule(
        "INVESTMENT_PROMISE",
        "STRONG",
        (
            r"\b(?:guaranteed|sure|risk[ -]?free)\b.{0,35}\b(?:return|profit|income|investment)\b",
            r"\b(?:double|triple)\b.{0,25}\b(?:money|investment|capital)\b",
            r"\b(?:high returns?|earnings?)\b.{0,45}\b(?:daily|weekly|guaranteed|no risk)\b",
        ),
    ),
    IndicatorRule(
        "JOB_OR_TASK_OFFER",
        "STRONG",
        (
            r"\b(?:online task|task job|clicking task|rating task|product review task)\b.{0,60}\b(?:commission|earn|income|salary|payment)\b",
            r"\b(?:earn|income|commission)\b.{0,45}\b(?:per task|liking videos|reviewing products|simple tasks?)\b",
            r"\b(?:job|hiring|work from home)\b.{0,70}\b(?:registration fee|training fee|deposit|recharge)\b",
        ),
    ),
    IndicatorRule(
        "PRIZE_OR_REWARD",
        "STRONG",
        (
            r"\b(?:you(?:'| a)?ve|you have|ikaw ay)\b.{0,25}\b(?:won|winner|selected)\b.{0,55}\b(?:prize|reward|cash|raffle|giveaway)\b",
            r"\b(?:claim|redeem)\b.{0,45}\b(?:prize|reward|cashback|raffle winnings?)\b",
        ),
    ),
    IndicatorRule(
        "PAYMENT_REQUEST",
        "CONTEXTUAL",
        (
            r"\b(?:send|transfer|deposit|pay|magpadala|bayaran)\b.{0,55}\b(?:money|payment|funds?|gcash|maya|bank account|peso|php|₱)\b",
            r"\b(?:gcash|maya|bank transfer)\b.{0,55}\b(?:send|transfer|deposit|pay|payment)\b",
        ),
    ),
    IndicatorRule(
        "EMERGENCY_REQUEST",
        "STRONG",
        (
            r"\b(?:emergency|aksidente|ospital|hospital|naaksidente|urgent help)\b.{0,80}\b(?:send|need|money|gcash|maya|transfer|tulong)\b",
            r"\b(?:new number|bagong number)\b.{0,80}\b(?:send|need|money|gcash|maya|emergency|tulong)\b",
        ),
    ),
    IndicatorRule(
        "AUTHORITY_IMPERSONATION",
        "STRONG",
        (
            r"\b(?:we are|this is|on behalf of|from the)\b.{0,35}\b(?:bdo|bpi|metrobank|landbank|unionbank|security bank|pnb|rcbc|chinabank|gcash|maya|bir|sss|philhealth|pag-ibig|nbi|pnp|lto|dfa)\b",
            r"\b(?:official|agent|representative|customer service)\b.{0,40}\b(?:bank|gcash|maya|bir|sss|philhealth|government|police)\b",
        ),
    ),
    IndicatorRule(
        "THREAT_OR_COERCION",
        "STRONG",
        (
            r"\b(?:failure to|if you do not|unless you)\b.{0,65}\b(?:arrest|penalty|fine|suspend|terminate|block|legal action)\b",
            r"\b(?:arrest|lawsuit|legal action|penalty|fine)\b.{0,55}\b(?:immediately|today|unless|failure)\b",
        ),
    ),
    IndicatorRule(
        "URGENCY",
        "STRONG",
        (
            r"\b(?:act now|immediately|urgent(?:ly)?|right now|within (?:\d+|one) (?:hours?|minutes?)|today only|ngayon din|agad-agad|kaagad)\b",
            r"\b(?:expires?|deadline|last chance)\b.{0,30}\b(?:today|tonight|within|now)\b",
        ),
    ),
    IndicatorRule(
        "ACTION_DEMAND",
        "CONTEXTUAL",
        (
            r"\b(?:click|tap|reply|contact|call|verify|confirm|submit|open)\b.{0,65}\b(?:now|immediately|today|account|identity|details|information|payment)\b",
        ),
    ),
    IndicatorRule(
        "SCARCITY",
        "CONTEXTUAL",
        (
            r"\b(?:last chance|limited slots?|limited offer|today only|few remaining)\b.{0,65}\b(?:claim|pay|register|reserve|act|reply)\b",
            r"\b(?:claim|pay|register|reserve|act|reply)\b.{0,65}\b(?:last chance|limited slots?|limited offer|today only|few remaining)\b",
        ),
    ),
    IndicatorRule(
        "FAMILIARITY",
        "CONTEXTUAL",
        (
            r"\b(?:new number|bagong number|it's me|this is your (?:friend|child|relative|cousin))\b.{0,90}\b(?:send|money|gcash|maya|transfer|otp|payment|emergency|tulong)\b",
        ),
    ),
    IndicatorRule(
        "ROMANCE_OR_EMOTIONAL_MANIPULATION",
        "CONTEXTUAL",
        (
            r"\b(?:love|dear|sweetheart|relationship)\b.{0,90}\b(?:send money|financial help|gift card|emergency)\b",
        ),
    ),
    IndicatorRule(
        "COMMITMENT_ESCALATION",
        "CONTEXTUAL",
        (
            r"\b(?:complete|finish)\b.{0,45}\b(?:another|next|more)\b.{0,35}\b(?:task|payment|deposit|recharge)\b",
        ),
    ),
)


PROTECTIVE_SECURITY_PATTERNS = tuple(
    re.compile(pattern, re.IGNORECASE)
    for pattern in (
        r"\b(?:never|do not|don't|dont|huwag|wag)\b.{0,60}\b(?:share|send|provide|give|reveal|ibigay|ipadala)\b.{0,60}\b(?:otp|one[ -]?time (?:password|pin)|mpin|password|passcode|pin|cvv|credentials?)\b",
        r"\b(?:we|banks?|gcash|maya|staff|agents?)\b.{0,30}\b(?:will|would)\s+never\b.{0,45}\b(?:ask|request)\b.{0,45}\b(?:otp|mpin|password|pin|cvv|credentials?)\b",
        r"\b(?:keep|protect)\b.{0,35}\b(?:otp|mpin|password|pin|cvv|credentials?)\b.{0,35}\b(?:private|secret|secure)\b",
    )
)


def _sentences(text: str) -> list[str]:
    compact = re.sub(r"[\t\r ]+", " ", text or "")
    return [
        part.strip()
        for part in re.split(r"(?<=[.!?])\s+|\n+", compact)
        if part.strip()
    ]


def _is_protective_security_advice(sentence: str) -> bool:
    return any(pattern.search(sentence) for pattern in PROTECTIVE_SECURITY_PATTERNS)


def _safe_evidence(sentence: str, maximum: int = 180) -> str:
    evidence = re.sub(
        r"(?i)(\b(?:otp|one[ -]?time (?:password|pin)|verification code)\b\D{0,18})\d{4,8}\b",
        r"\1[OTP_REDACTED]",
        sentence,
    )
    evidence = re.sub(
        r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b",
        "[EMAIL_REDACTED]",
        evidence,
        flags=re.IGNORECASE,
    )
    evidence = re.sub(
        r"(?<!\d)(?:\+?63|0)9\d{9}(?!\d)",
        "[PHONE_REDACTED]",
        evidence,
    )
    evidence = re.sub(
        r"(?i)(\b(?:account|acct|wallet)\s*(?:number|no\.?|#|id)?\s*[:#-]?\s*)[A-Z0-9-]{6,20}\b",
        r"\1[ACCOUNT_REDACTED]",
        evidence,
    )
    evidence = re.sub(
        r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)",
        "[CARD_REDACTED]",
        evidence,
    )
    if len(evidence) > maximum:
        return f"{evidence[: maximum - 3].rstrip()}..."
    return evidence


def _matching_sentence(
    sentences: Iterable[str],
    rule: IndicatorRule,
) -> str | None:
    compiled = tuple(re.compile(pattern, re.IGNORECASE) for pattern in rule.patterns)
    for sentence in sentences:
        if rule.credential_related and _is_protective_security_advice(sentence):
            continue
        if any(pattern.search(sentence) for pattern in compiled):
            return sentence
    return None


def _add_social_engineering_markers(markers: list[dict[str, str]]) -> None:
    mappings = {
        "ACCOUNT_SECURITY_SCARE": (("FEAR", "STRONG"),),
        "CREDENTIAL_REQUEST": (("CREDENTIAL_VERIFICATION_PRETEXT", "STRONG"),),
        "OTP_REQUEST": (("CREDENTIAL_VERIFICATION_PRETEXT", "STRONG"),),
        "MPIN_REQUEST": (("CREDENTIAL_VERIFICATION_PRETEXT", "STRONG"),),
        "PASSWORD_REQUEST": (("CREDENTIAL_VERIFICATION_PRETEXT", "STRONG"),),
        "PIN_OR_CVV_REQUEST": (("CREDENTIAL_VERIFICATION_PRETEXT", "STRONG"),),
        "PRIZE_OR_REWARD": (("REWARD", "STRONG"),),
        "ADVANCE_FEE": (("ADVANCE_FEE_MANIPULATION", "STRONG"),),
        "INVESTMENT_PROMISE": (("REWARD", "CONTEXTUAL"),),
        "JOB_OR_TASK_OFFER": (("EMPLOYMENT_LURE", "STRONG"),),
        "EMERGENCY_REQUEST": (("EMERGENCY", "STRONG"),),
        "AUTHORITY_IMPERSONATION": (
            ("AUTHORITY", "STRONG"),
            ("IMPERSONATION", "STRONG"),
        ),
        "THREAT_OR_COERCION": (("COERCION", "STRONG"),),
    }
    existing = {marker["category"] for marker in markers}
    derived: list[dict[str, str]] = []
    for marker in markers:
        mapped_markers = mappings.get(marker["category"])
        if not mapped_markers:
            continue
        for mapped in mapped_markers:
            if mapped[0] in existing:
                continue
            existing.add(mapped[0])
            derived.append(
                {
                    "category": mapped[0],
                    "severity": mapped[1],
                    "evidence": marker["evidence"],
                }
            )
    markers.extend(derived)


def analyze_scam_indicators(
    *,
    sender: str | None = None,
    subject: str = "",
    body: str = "",
) -> dict[str, object]:
    """Extract explainable markers without producing a probability or risk score."""
    combined = "\n".join(part for part in (sender or "", subject, body) if part)
    sentences = _sentences(combined)
    markers: list[dict[str, str]] = []

    for rule in RULES:
        sentence = _matching_sentence(sentences, rule)
        if sentence is None:
            continue
        markers.append(
            {
                "category": rule.category,
                "severity": rule.severity,
                "evidence": _safe_evidence(sentence),
            }
        )

    _add_social_engineering_markers(markers)
    markers.sort(
        key=lambda marker: (
            -SEVERITIES[marker["severity"]],
            marker["category"],
        )
    )

    return {
        "markers": markers,
        "critical_count": sum(marker["severity"] == "CRITICAL" for marker in markers),
        "strong_count": sum(marker["severity"] == "STRONG" for marker in markers),
        "contextual_count": sum(marker["severity"] == "CONTEXTUAL" for marker in markers),
    }
