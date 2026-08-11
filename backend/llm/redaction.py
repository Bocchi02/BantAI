"""Data minimization and sensitive-value redaction for optional cloud review."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlsplit, urlunsplit


DEFAULT_MAX_EMAIL_CHARS = 7000

EMAIL_RE = re.compile(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE)
PHONE_RE = re.compile(r"(?<!\d)(?:\+?63[ -]?|0)9\d{2}[ -]?\d{3}[ -]?\d{4}(?!\d)")
CARD_RE = re.compile(r"(?<!\d)(?:\d[ -]?){13,19}(?!\d)")
OTP_AFTER_RE = re.compile(
    r"(?i)(\b(?:otp|one[ -]?time (?:password|pin)|verification code)\b\D{0,24})\d{4,8}\b"
)
OTP_BEFORE_RE = re.compile(
    r"(?i)\b\d{4,8}(\D{0,18}\b(?:otp|one[ -]?time (?:password|pin)|verification code)\b)"
)
ACCOUNT_RE = re.compile(
    r"(?i)(\b(?:account|acct|wallet)\s*(?:number|no\.?|#|id)?\s*[:#-]?\s*)[A-Z0-9-]{6,20}\b"
)


def clean_text(value: str | None) -> str:
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[\t\r ]+", " ", value or "")).strip()


def redact_text(value: str | None) -> str:
    text = clean_text(value)
    text = OTP_AFTER_RE.sub(r"\1[OTP_REDACTED]", text)
    text = OTP_BEFORE_RE.sub(r"[OTP_REDACTED]\1", text)
    text = EMAIL_RE.sub("[EMAIL_REDACTED]", text)
    text = PHONE_RE.sub("[PHONE_REDACTED]", text)
    text = CARD_RE.sub("[CARD_REDACTED]", text)
    text = ACCOUNT_RE.sub(r"\1[ACCOUNT_REDACTED]", text)
    return text


def truncate_preserving_ends(value: str, maximum: int = DEFAULT_MAX_EMAIL_CHARS) -> str:
    if maximum < 400:
        raise ValueError("The cloud email character limit must be at least 400.")
    if len(value) <= maximum:
        return value
    marker = "\n\n[...TRUNCATED FOR DATA MINIMIZATION...]\n\n"
    remaining = maximum - len(marker)
    beginning = int(remaining * 0.7)
    ending = remaining - beginning
    return f"{value[:beginning]}{marker}{value[-ending:]}"


def sender_parts(sender: str | None) -> tuple[str | None, str | None]:
    raw = clean_text(sender)
    email_match = EMAIL_RE.search(raw)
    domain = None
    if email_match:
        domain = email_match.group(0).rsplit("@", 1)[-1].lower()
    display = re.sub(r"<[^>]+>", "", raw).strip(' \"\'')
    if EMAIL_RE.fullmatch(display):
        display = ""
    return (redact_text(display) or None, domain)


def minimize_current_url(value: str | None) -> str | None:
    """Keep webmail origin/path context while dropping query, fragment, and userinfo."""
    try:
        parsed = urlsplit(value or "")
    except ValueError:
        return None
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        return None
    host = parsed.hostname.lower()
    if parsed.port:
        host = f"{host}:{parsed.port}"
    path = re.sub(r"/[A-Za-z0-9_-]{20,}", "/[ID_REDACTED]", parsed.path or "/")
    return urlunsplit((parsed.scheme.lower(), host, path, "", ""))


def minimize_url_to_origin(value: str | None) -> str | None:
    """Keep only scheme and host so browsing paths are never sent to cloud review."""
    try:
        parsed = urlsplit(value or "")
    except ValueError:
        return None
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        return None
    host = parsed.hostname.lower()
    if parsed.port:
        host = f"{host}:{parsed.port}"
    return urlunsplit((parsed.scheme.lower(), host, "/", "", ""))


def prepare_url_cloud_payload(
    *,
    current_url: str,
    hostname: str,
    url_model: dict[str, Any],
) -> dict[str, Any]:
    return {
        "analysis_type": "URL_CONTEXT",
        "address_origin": minimize_url_to_origin(current_url),
        "hostname": str(hostname or "").strip().lower(),
        "url_model": {
            "signal": url_model.get("signal"),
            "suspicious_probability": round(
                float(url_model.get("suspicious_probability", 0.0)),
                4,
            ),
            "threshold": round(float(url_model.get("threshold", 0.0)), 4),
        },
        "page_content_shared": False,
        "navigation_performed": False,
    }


def prepare_cloud_payload(
    *,
    provider: str,
    sender: str | None,
    subject: str,
    body: str,
    current_url: str,
    email_model: dict[str, Any],
    url_model: dict[str, Any],
    local_indicators: dict[str, Any],
    maximum_email_chars: int = DEFAULT_MAX_EMAIL_CHARS,
) -> dict[str, Any]:
    sender_display_name, sender_domain = sender_parts(sender)
    redacted_body = redact_text(body)
    return {
        "provider": provider,
        "sender_display_name": sender_display_name,
        "sender_domain": sender_domain,
        "subject": redact_text(subject),
        "email_body": truncate_preserving_ends(redacted_body, maximum_email_chars),
        "current_address_bar_url": minimize_current_url(current_url),
        "email_model": {
            "signal": email_model.get("signal"),
            "suspicious_probability": round(
                float(email_model.get("suspicious_probability", 0.0)), 4
            ),
        },
        "url_model": {
            "signal": url_model.get("signal"),
            "suspicious_probability": round(
                float(url_model.get("suspicious_probability", 0.0)), 4
            ),
        },
        "local_indicators": local_indicators,
    }
