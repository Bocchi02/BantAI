from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import Cookie, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import get_db
from .models import PairedDevice, User, UserRole, UserStatus, WebSession, utcnow
from .security import token_hash


SESSION_COOKIE = "bantai_session"
CSRF_COOKIE = "bantai_csrf"


def _expired(value: datetime) -> bool:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value <= utcnow()


@dataclass
class CurrentWebUser:
    user: User
    session: WebSession


def current_web_user(
    session_token: str | None = Cookie(default=None, alias=SESSION_COOKIE),
    db: Session = Depends(get_db),
) -> CurrentWebUser:
    if not session_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    web_session = db.scalar(select(WebSession).where(WebSession.token_hash == token_hash(session_token)))
    if web_session is None or web_session.revoked_at is not None or _expired(web_session.expires_at):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    user = db.get(User, web_session.user_id)
    if user is None or user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is unavailable.")
    return CurrentWebUser(user=user, session=web_session)


def csrf_protected(
    request: Request,
    current: CurrentWebUser = Depends(current_web_user),
    csrf_cookie: str | None = Cookie(default=None, alias=CSRF_COOKIE),
    csrf_header: str | None = Header(default=None, alias="X-CSRF-Token"),
) -> CurrentWebUser:
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        if not csrf_cookie or not csrf_header or not secrets.compare_digest(csrf_cookie, csrf_header):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token.")
        if not secrets.compare_digest(token_hash(csrf_header), current.session.csrf_hash):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid CSRF token.")
    return current


def admin_user(current: CurrentWebUser = Depends(csrf_protected)) -> CurrentWebUser:
    if current.user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required.")
    return current


@dataclass
class CurrentDevice:
    device: PairedDevice
    user: User


def current_device(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> CurrentDevice:
    scheme, _, token = (authorization or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Device authentication required.")
    device = db.scalar(select(PairedDevice).where(PairedDevice.token_hash == token_hash(token)))
    if device is None or device.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Device authentication required.")
    user = db.get(User, device.user_id)
    if user is None or user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is unavailable.")
    device.last_seen_at = utcnow()
    db.commit()
    return CurrentDevice(device=device, user=user)

