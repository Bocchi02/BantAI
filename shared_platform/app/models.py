from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, enum.Enum):
    USER = "USER"
    ADMIN = "ADMIN"


class UserStatus(str, enum.Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"


class UrlReportClassification(str, enum.Enum):
    LEGITIMATE = "LEGITIMATE"
    SUSPICIOUS = "SUSPICIOUS"
    UNSURE = "UNSURE"


class UrlReportStatus(str, enum.Enum):
    PENDING = "PENDING"
    REVIEWED = "REVIEWED"


class AdminUrlAssessment(str, enum.Enum):
    LEGITIMATE = "LEGITIMATE"
    SUSPICIOUS = "SUSPICIOUS"
    INCONCLUSIVE = "INCONCLUSIVE"


class FeedbackVerdict(str, enum.Enum):
    CORRECT = "CORRECT"
    INCORRECT = "INCORRECT"
    UNSURE = "UNSURE"


class FeedbackReason(str, enum.Enum):
    TRUSTED_OR_OFFICIAL = "TRUSTED_OR_OFFICIAL"
    INCORRECT_WARNING = "INCORRECT_WARNING"
    MISSED_WARNING = "MISSED_WARNING"
    IMPERSONATION_OR_DECEPTIVE = "IMPERSONATION_OR_DECEPTIVE"
    OTHER = "OTHER"


class FeedbackSource(str, enum.Enum):
    RECENT_DETECTION = "RECENT_DETECTION"
    MANUAL_ENTRY = "MANUAL_ENTRY"


class TrainingStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    INCONCLUSIVE = "INCONCLUSIVE"


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
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus), default=UserStatus.ACTIVE)
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


class UrlReport(Base):
    __tablename__ = "url_reports"
    __table_args__ = (
        UniqueConstraint("user_id", "activity_event_id", name="uq_url_report_user_activity"),
        CheckConstraint(
            "(status = 'PENDING' AND admin_assessment IS NULL AND reviewed_at IS NULL) OR "
            "(status = 'REVIEWED' AND admin_assessment IS NOT NULL AND reviewed_at IS NOT NULL)",
            name="ck_url_report_review_shape",
        ),
        Index("ix_url_reports_status_submitted", "status", "submitted_at"),
        Index("ix_url_reports_training_status_submitted", "training_status", "submitted_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_value)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    activity_event_id: Mapped[str | None] = mapped_column(
        ForeignKey("activity_events.id", ondelete="SET NULL"),
        index=True,
    )
    origin_encrypted: Mapped[str] = mapped_column(Text)
    origin_fingerprint: Mapped[str | None] = mapped_column(String(64))
    detector_outcome: Mapped[Outcome] = mapped_column(Enum(Outcome))
    user_classification: Mapped[UrlReportClassification] = mapped_column(Enum(UrlReportClassification))
    feedback_verdict: Mapped[FeedbackVerdict] = mapped_column(Enum(FeedbackVerdict), default=FeedbackVerdict.INCORRECT)
    feedback_reason: Mapped[FeedbackReason | None] = mapped_column(Enum(FeedbackReason))
    feedback_source: Mapped[FeedbackSource] = mapped_column(Enum(FeedbackSource), default=FeedbackSource.MANUAL_ENTRY)
    training_status: Mapped[TrainingStatus] = mapped_column(Enum(TrainingStatus), default=TrainingStatus.PENDING)
    detector_model_version: Mapped[str] = mapped_column(String(40), default="RF V4-B")
    status: Mapped[UrlReportStatus] = mapped_column(Enum(UrlReportStatus), default=UrlReportStatus.PENDING)
    admin_assessment: Mapped[AdminUrlAssessment | None] = mapped_column(Enum(AdminUrlAssessment))
    reviewed_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UrlTrainingCandidate(Base):
    __tablename__ = "url_training_candidates"
    __table_args__ = (
        UniqueConstraint("origin_fingerprint", "detector_model_version", name="uq_training_candidate_origin_model"),
        CheckConstraint(
            "approved_label IN ('LEGITIMATE', 'SUSPICIOUS')",
            name="ck_training_candidate_label",
        ),
        Index("ix_training_candidate_label_approved", "approved_label", "last_approved_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uuid_value)
    origin_encrypted: Mapped[str] = mapped_column(Text)
    origin_fingerprint: Mapped[str] = mapped_column(String(64))
    detector_outcome: Mapped[Outcome] = mapped_column(Enum(Outcome))
    approved_label: Mapped[AdminUrlAssessment] = mapped_column(Enum(AdminUrlAssessment))
    feedback_reason: Mapped[FeedbackReason | None] = mapped_column(Enum(FeedbackReason))
    feedback_source: Mapped[FeedbackSource] = mapped_column(Enum(FeedbackSource))
    detector_model_version: Mapped[str] = mapped_column(String(40))
    evidence_count: Mapped[int] = mapped_column(Integer, default=1)
    first_approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    last_approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
