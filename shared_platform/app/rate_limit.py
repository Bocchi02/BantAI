"""Trusted-proxy identity extraction and shared, privacy-safe rate limiting."""

from __future__ import annotations

import ipaddress
import json
from datetime import datetime, timedelta
from threading import Lock
from typing import Any

from sqlalchemy import update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from .database import SessionLocal
from .models import RateLimitBucket, utcnow
from .security import blind_index, token_hash


RATE_LIMIT_WINDOW_SECONDS = 300
# This is not limiter state. It merely prevents two threads in the same worker
# from concurrently using SQLite's single StaticPool connection in local/test
# deployments. The database row remains the authoritative, cross-worker key.
_LOCAL_DATABASE_WRITE_LOCK = Lock()


class RateLimitUnavailable(RuntimeError):
    """The shared limiter must fail closed rather than silently become local."""


def trusted_client_address(
    scope: dict[str, Any],
    headers: dict[bytes, bytes],
    trusted_proxy_cidrs: str,
) -> str:
    """Use X-Forwarded-For only when the immediate peer is a trusted proxy."""

    peer = str((scope.get("client") or ("unknown",))[0]).strip()
    try:
        peer_address = ipaddress.ip_address(peer)
    except ValueError:
        return peer or "unknown"

    trusted_networks = []
    for raw_network in trusted_proxy_cidrs.split(","):
        candidate = raw_network.strip()
        if not candidate:
            continue
        try:
            trusted_networks.append(ipaddress.ip_network(candidate, strict=False))
        except ValueError:
            continue
    if not trusted_networks or not any(peer_address in network for network in trusted_networks):
        return peer

    # Caddy overwrites this header before forwarding.  The application still
    # validates the value so a malformed proxy header cannot become a key.
    forwarded = headers.get(b"x-forwarded-for", b"").decode("latin-1", errors="ignore")
    candidate = forwarded.split(",", 1)[0].strip()
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return peer


def _request_json(body: bytes) -> dict[str, Any]:
    try:
        parsed = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def rate_limit_keys(
    *,
    path: str,
    headers: dict[bytes, bytes],
    body: bytes,
    client_address: str,
    detection_limit: int,
) -> list[tuple[str, int]]:
    """Return opaque identities appropriate to the endpoint's credential model."""

    account_paths = {
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/email-availability",
        "/api/v1/auth/resend-verification",
        "/api/v1/auth/request-password-reset",
    }
    if path in account_paths:
        email = str(_request_json(body).get("email") or "").strip().lower()
        account = email if email else "missing"
        # Per-account throttling prevents targeted brute force without making all
        # users behind one NAT or reverse proxy share a tiny bucket. A broader
        # address bucket still limits wide account-enumeration attempts.
        limit = 3 if path in {"/api/v1/auth/resend-verification", "/api/v1/auth/request-password-reset"} else 20
        return [
            (f"account:{path}:{client_address}:{account}", limit),
            (f"network:{path}:{client_address}", 100),
        ]

    if path in {"/api/v1/auth/verify-email", "/api/v1/auth/reset-password"}:
        submitted = str(_request_json(body).get("token") or "")
        return [
            (f"account-token:{path}:{token_hash(submitted)}", 5),
            (f"account-token-network:{path}:{client_address}", 30),
        ]

    if path == "/api/v1/pairing":
        cookie = headers.get(b"cookie", b"").decode("latin-1", errors="ignore")
        return [(f"pairing-create:{token_hash(cookie or client_address)}", 10)]

    if path in {"/api/v1/pairing/consume", "/api/v1/extension/pair"}:
        return [(f"pairing:{path}:{client_address}", 20)]

    detection_paths = {"/api/v1/detections/url", "/api/v1/detections/email"}
    if path in detection_paths:
        authorization = headers.get(b"authorization", b"").decode("latin-1", errors="ignore")
        return [(f"device:{path}:{token_hash(authorization)}", detection_limit)]

    is_message_review = path in {"/api/v1/message-review", "/api/v1/website-check"}
    is_cloud_review = path.startswith("/api/v1/cloud-review/")
    if is_message_review or is_cloud_review:
        authorization = headers.get(b"authorization", b"").decode("latin-1", errors="ignore")
        cookie = headers.get(b"cookie", b"").decode("latin-1", errors="ignore")
        credential = authorization or cookie or client_address
        limit = 10 if path == "/api/v1/website-check" else 20 if is_message_review else 120
        return [(f"authenticated:{path}:{token_hash(credential)}", limit)]
    return []


def consume_limit(
    identity: str,
    limit: int,
    *,
    now: datetime | None = None,
    window_seconds: int = RATE_LIMIT_WINDOW_SECONDS,
) -> bool:
    """Atomically consume one shared bucket slot; True means rate limited."""

    now = now or utcnow()
    cutoff = now - timedelta(seconds=window_seconds)
    key_hash = blind_index(identity, "central-rate-limit-v1")
    try:
        with _LOCAL_DATABASE_WRITE_LOCK:
            return _consume_limit(key_hash, limit, now, cutoff)
    except SQLAlchemyError as exc:
        raise RateLimitUnavailable("Shared rate limiting is unavailable.") from exc


def _consume_limit(
    key_hash: str,
    limit: int,
    now: datetime,
    cutoff: datetime,
) -> bool:
    """Run one database-backed window update while the local connection is exclusive."""

    with SessionLocal() as db:
        active_increment = db.execute(
            update(RateLimitBucket)
            .where(
                RateLimitBucket.key_hash == key_hash,
                RateLimitBucket.window_started_at > cutoff,
                RateLimitBucket.request_count < limit,
            )
            .values(request_count=RateLimitBucket.request_count + 1, updated_at=now)
        )
        if active_increment.rowcount:
            db.commit()
            return False

        expired_reset = db.execute(
            update(RateLimitBucket)
            .where(
                RateLimitBucket.key_hash == key_hash,
                RateLimitBucket.window_started_at <= cutoff,
            )
            .values(window_started_at=now, request_count=1, updated_at=now)
        )
        if expired_reset.rowcount:
            db.commit()
            return False

        existing = db.get(RateLimitBucket, key_hash)
        if existing is not None:
            db.rollback()
            return True
        db.add(RateLimitBucket(
            key_hash=key_hash,
            window_started_at=now,
            request_count=1,
            updated_at=now,
        ))
        try:
            db.commit()
            return False
        except IntegrityError:
            # Another application worker inserted the same bucket. Retry the
            # atomic active-window increment once rather than allowing a gap.
            db.rollback()
            retry = db.execute(
                update(RateLimitBucket)
                .where(
                    RateLimitBucket.key_hash == key_hash,
                    RateLimitBucket.window_started_at > cutoff,
                    RateLimitBucket.request_count < limit,
                )
                .values(request_count=RateLimitBucket.request_count + 1, updated_at=now)
            )
            db.commit()
            return not bool(retry.rowcount)
