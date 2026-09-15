"""Minimal privacy-safe structured security events.

This module deliberately accepts only bounded categories and emits keyed opaque
identifiers. It is not request/access logging and never receives message bodies,
URLs, credentials, or provider payloads.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import re
import secrets
from datetime import datetime, timezone
from typing import Any


LOGGER = logging.getLogger("bantai.security")
_CONFIGURED_KEY = os.getenv("BANTAI_ENCRYPTION_KEY", "").strip().encode("utf-8")
_PROCESS_KEY = hashlib.sha256(_CONFIGURED_KEY or secrets.token_bytes(32)).digest()
_CATEGORY = re.compile(r"^[a-z0-9][a-z0-9_.-]{0,63}$")
_EVENT_CODES = frozenset(
    {
        "AUTH_LOGIN_SUCCESS",
        "AUTH_LOGIN_FAILURE",
        "AUTH_SESSION_REVOKED",
        "AUTH_ACCOUNT_SUSPENDED",
        "RATE_LIMIT_TRIGGERED",
        "DEVICE_PAIRING_CREATED",
        "DEVICE_PAIRED",
        "DEVICE_REVOKED",
        "ADMIN_USER_STATUS_CHANGED",
        "ADMIN_REPORT_REVIEWED",
        "CLOUD_PROVIDER_UNAVAILABLE",
        "MODEL_INTEGRITY_FAILURE",
        "REQUEST_TOO_LARGE",
        "SECURITY_CONFIG_REJECTED",
    }
)


def opaque_id(value: str, *, label: str = "principal") -> str:
    """Return a stable, keyed, truncated identifier without exposing ``value``."""

    material = str(value).encode("utf-8", "ignore")
    digest = hmac.new(_PROCESS_KEY, label.encode("ascii") + b":" + material, hashlib.sha256).hexdigest()
    return digest[:24]


def emit(
    event_code: str,
    *,
    outcome: str,
    principal: str | None = None,
    request_id: str | None = None,
    reason: str | None = None,
) -> None:
    """Emit one bounded JSON event; event failures never break request handling."""

    try:
        if event_code not in _EVENT_CODES:
            return
        normalized_outcome = str(outcome).strip().lower()
        if not _CATEGORY.fullmatch(normalized_outcome):
            return
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "event_code": event_code,
            "outcome": normalized_outcome,
        }
        if principal:
            payload["principal_id"] = opaque_id(principal)
        if request_id and _CATEGORY.fullmatch(str(request_id).replace("-", "")):
            payload["request_id"] = opaque_id(request_id, label="request")
        if reason and _CATEGORY.fullmatch(str(reason).strip().lower()):
            payload["reason"] = str(reason).strip().lower()
        LOGGER.info(json.dumps(payload, separators=(",", ":"), sort_keys=True), extra={"security_event": payload})
    except Exception:
        # Security telemetry is best-effort and must not take down auth or data
        # protection paths when a logging backend is unavailable.
        return
