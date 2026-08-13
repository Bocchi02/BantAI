from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, enum.Enum):
    USER = "USER"
    ADMIN = "ADMIN"


class UserStatus(str, enum.Enum):
    PENDING_VERIFICATION = "PENDING_VERIFICATION"
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"


class TokenPurpose(str, enum.Enum):
    EMAIL_VERIFICATION = "EMAIL_VERIFICATION"
    PASSWORD_RESET = "PASSWORD_RESET"


class EventType(str, enum.Enum):
    URL = "URL"
    EMAIL = "EMAIL"


class Outcome(str, enum.Enum):
    NO_STRONG_WARNING_SIGNS = "NO_STRONG_WARNING_SIGNS"
    NEEDS_CAUTION = "NEEDS_CAUTION"
    SUSPICIOUS_SIGNS_FOUND = "SUSPICIOUS_SIGNS_FOUND"


class CloudStatus(str, enum.Enum):
    COMPLETE = "COMPLETE"
    UNAVAILABLE = "UNAVAILABLE"


def uuid_value() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_value)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    first_name: Mapped[str] = mapped_column(String(80), default="")
    middle_name: Mapped[str | None] = mapped_column(String(80))
    last_name: Mapped[str] = mapped_column(String(80), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.USER)
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus), default=UserStatus.PENDING_VERIFICATION)
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    sessions: Mapped[list[WebSession]] = relationship(back_populates="user", cascade="all, delete-orphan")
    devices: Mapped[list[PairedDevice]] = relationship(back_populates="user", cascade="all, delete-orphan")


class WebSession(Base):
    __tablename__ = "web_sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_value)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    csrf_hash: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped[User] = relationship(back_populates="sessions")


class AccountToken(Base):
    __tablename__ = "account_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_value)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    purpose: Mapped[TokenPurpose] = mapped_column(Enum(TokenPurpose))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PairingCode(Base):
    __tablename__ = "pairing_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_value)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PairedDevice(Base):
    __tablename__ = "paired_devices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_value)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(80))
    paired_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(back_populates="devices")


class ActivityEvent(Base):
    __tablename__ = "activity_events"
    __table_args__ = (
        UniqueConstraint("device_id", "client_event_id", name="uq_device_client_event"),
        CheckConstraint(
            "(event_type = 'URL' AND origin_encrypted IS NOT NULL AND provider IS NULL "
            "AND sender_encrypted IS NULL AND subject_encrypted IS NULL) OR "
            "(event_type = 'EMAIL' AND origin_encrypted IS NULL AND provider IS NOT NULL)",
            name="ck_activity_metadata_shape",
        ),
        Index("ix_activity_user_occurred", "user_id", "occurred_at"),
        Index("ix_activity_type_outcome_occurred", "event_type", "outcome", "occurred_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_value)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    device_id: Mapped[str] = mapped_column(ForeignKey("paired_devices.id", ondelete="CASCADE"), index=True)
    client_event_id: Mapped[str] = mapped_column(String(128))
    event_type: Mapped[EventType] = mapped_column(Enum(EventType))
    provider: Mapped[str | None] = mapped_column(String(20))
    origin_encrypted: Mapped[str | None] = mapped_column(Text)
    sender_encrypted: Mapped[str | None] = mapped_column(Text)
    subject_encrypted: Mapped[str | None] = mapped_column(Text)
    outcome: Mapped[Outcome] = mapped_column(Enum(Outcome), index=True)
    cloud_status: Mapped[CloudStatus] = mapped_column(Enum(CloudStatus))
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
