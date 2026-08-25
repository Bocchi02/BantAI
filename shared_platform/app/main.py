from __future__ import annotations

import asyncio
import csv
import io
import math
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from threading import Lock
from time import monotonic
from typing import Literal
from urllib.parse import urlsplit, urlunsplit

from fastapi import Depends, FastAPI, HTTPException, Query, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .cloud import connection_status as cloud_connection_status
from .cloud import review as cloud_review
from .cloud import review_pasted_message
from .config import settings
from .database import Base, SessionLocal, engine, get_db
from .dependencies import (
    CSRF_COOKIE,
    SESSION_COOKIE,
    CurrentDevice,
    CurrentWebUser,
    admin_user,
    csrf_protected,
    current_device,
    current_web_user,
)
from .models import (
    AdminUrlAssessment,
    ActivityEvent,
    AutomaticTrainingSample,
    EmailReport,
    EmailTrainingCandidate,
    EventType,
    FeedbackSource,
    FeedbackVerdict,
    Outcome,
    PairedDevice,
    PairingCode,
    TrainingStatus,
    User,
    UserRole,
    UserStatus,
    UrlReport,
    UrlReportClassification,
    UrlReportStatus,
    UrlTrainingCandidate,
    WebSession,
    utcnow,
)
from .schemas import (
    AdminReviewAction,
    ActivityBatchRequest,
    AutomaticTrainingSampleRequest,
    ChangePasswordRequest,
    DeviceEmailActivityFeedbackRequest,
    DeviceUrlActivityFeedbackRequest,
    EmailCloudReviewRequest,
    EmailReportCreateRequest,
    EmailRequest,
    LoginRequest,
    PairingConsumeRequest,
    PASSWORD_REQUIREMENTS,
    PastedMessageReviewRequest,
    ProfileUpdateRequest,
    RegisterRequest,
    TrainingConsentUpdateRequest,
    UrlCloudReviewRequest,
    UrlActivityFeedbackRequest,
    UrlReportCreateRequest,
    UrlReportReviewRequest,
    UserView,
    require_strong_password,
)
from .security import blind_index, decrypt_text, encrypt_text, hash_password, pairing_code, random_token, token_hash, verify_password


EMAIL_IN_USE_MESSAGE = "This email is already in use."
OUTCOME_VALUES = [item.value for item in Outcome]
TRAINING_CONSENT_VERSION = "2026-08-v1"
AUTOMATIC_SAMPLE_RATE_PERCENT = 10


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def utc_timestamp(value: datetime | None) -> str | None:
    """Serialize MySQL's timezone-naive UTC values with an explicit UTC marker."""

    if value is None:
        return None
    return _aware(value).astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def csv_safe_cell(value: object | None) -> str:
    """Prevent spreadsheet formulas from being executed when a CSV is opened."""

    text = "" if value is None else str(value)
    if text.startswith(("=", "+", "-", "@", "\t", "\r", "\n")):
        return f"'{text}"
    return text


class RateLimitMiddleware:
    def __init__(self, app):
        self.app = app
        self.buckets: dict[str, deque[float]] = defaultdict(deque)
        self.lock = Lock()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        path = scope.get("path", "")
        is_account_request = path.startswith("/api/v1/auth/") or path == "/api/v1/pairing/consume"
        is_message_review = path == "/api/v1/message-review"
        is_cloud_request = path.startswith("/api/v1/cloud-review/") or is_message_review
        if is_account_request or is_cloud_request:
            client = (scope.get("client") or ("unknown",))[0]
            key = f"{client}:{path}"
            now = monotonic()
            with self.lock:
                bucket = self.buckets[key]
                while bucket and bucket[0] <= now - 300:
                    bucket.popleft()
                limit = 20 if is_account_request or is_message_review else 120
                limited = len(bucket) >= limit
                if not limited:
                    bucket.append(now)
            if limited:
                response = Response(
                    content='{"detail":"Too many requests. Try again later."}',
                    status_code=429,
                    media_type="application/json",
                    headers={"Retry-After": "300"},
                )
                return await response(scope, receive, send)
        return await self.app(scope, receive, send)


def cleanup_expired(db: Session) -> None:
    now = utcnow()
    cutoff = now - timedelta(days=settings.activity_retention_days)
    db.execute(delete(UrlReport).where(UrlReport.submitted_at < cutoff))
    db.execute(delete(EmailReport).where(EmailReport.submitted_at < cutoff))
    db.execute(delete(AutomaticTrainingSample).where(AutomaticTrainingSample.created_at < cutoff))
    db.execute(delete(ActivityEvent).where(ActivityEvent.occurred_at < cutoff))
    db.execute(delete(PairingCode).where(or_(PairingCode.expires_at < now, PairingCode.consumed_at.is_not(None))))
    db.execute(delete(WebSession).where(or_(WebSession.expires_at < now, WebSession.revoked_at.is_not(None))))
    db.commit()


def seed_admin(db: Session) -> None:
    email = settings.admin_email.strip().lower()
    password = settings.admin_password
    if not email or not password:
        return
    user = db.scalar(select(User).where(User.email == email))
    if user is None:
        db.add(User(email=email, first_name="BantAI", last_name="Administrator", password_hash=hash_password(password), role=UserRole.ADMIN, status=UserStatus.ACTIVE))
        db.commit()


async def retention_loop() -> None:
    while True:
        await asyncio.sleep(24 * 60 * 60)
        with SessionLocal() as db:
            cleanup_expired(db)


@asynccontextmanager
async def lifespan(_: FastAPI):
    if settings.create_schema:
        Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        cleanup_expired(db)
        seed_admin(db)
    task = asyncio.create_task(retention_loop())
    yield
    task.cancel()


app = FastAPI(
    title="BantAI Shared Platform API",
    version="1.0.0",
    description="Privacy-minimized accounts, activity history, device pairing, and cloud-review gateway.",
    lifespan=lifespan,
)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-CSRF-Token", "Authorization"],
)


def user_view(user: User) -> dict:
    full_name = " ".join(part for part in (user.first_name, user.middle_name, user.last_name) if part).strip()
    return UserView(
        id=user.id,
        email=user.email,
        first_name=user.first_name,
        middle_name=user.middle_name,
        last_name=user.last_name,
        full_name=full_name,
        role=user.role,
        status=user.status,
        created_at=user.created_at,
        last_login_at=user.last_login_at,
    ).model_dump(mode="json")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "bantai-shared-platform",
        "version": "1.0.0",
        "cloud_ai": cloud_connection_status(),
    }


@app.post("/api/v1/auth/register", status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> dict:
    email = str(payload.email).strip().lower()
    existing = db.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=EMAIL_IN_USE_MESSAGE)

    try:
        require_strong_password(payload.password)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=PASSWORD_REQUIREMENTS) from exc

    user = User(
        email=email,
        first_name=payload.first_name,
        middle_name=payload.middle_name,
        last_name=payload.last_name,
        password_hash=hash_password(payload.password),
        status=UserStatus.ACTIVE,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=EMAIL_IN_USE_MESSAGE) from exc
    db.commit()
    return {"message": "Your BantAI account was created."}


@app.post("/api/v1/auth/email-availability")
def email_availability(payload: EmailRequest, db: Session = Depends(get_db)) -> dict:
    email = str(payload.email).strip().lower()
    existing = db.scalar(select(User.id).where(User.email == email))
    return {"available": existing is None}


@app.post("/api/v1/auth/login")
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.email == str(payload.email).lower()))
    if user is None or not verify_password(user.password_hash, payload.password):
        raise HTTPException(status_code=401, detail="The email or password is incorrect.")
    if user.status == UserStatus.SUSPENDED:
        raise HTTPException(status_code=403, detail="This account is suspended.")
    session_token = random_token()
    csrf_token = random_token(24)
    web_session = WebSession(user_id=user.id, token_hash=token_hash(session_token), csrf_hash=token_hash(csrf_token), expires_at=utcnow() + timedelta(hours=settings.session_hours))
    user.last_login_at = utcnow()
    db.add(web_session)
    db.commit()
    response.set_cookie(SESSION_COOKIE, session_token, httponly=True, secure=settings.cookie_secure, samesite="lax", max_age=settings.session_hours * 3600, path="/")
    response.set_cookie(CSRF_COOKIE, csrf_token, httponly=False, secure=settings.cookie_secure, samesite="lax", max_age=settings.session_hours * 3600, path="/")
    return {"user": user_view(user)}


@app.post("/api/v1/auth/logout", status_code=204)
def logout(response: Response, current: CurrentWebUser = Depends(csrf_protected), db: Session = Depends(get_db)) -> Response:
    current.session.revoked_at = utcnow()
    db.commit()
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    return response


@app.get("/api/v1/auth/me")
def me(current: CurrentWebUser = Depends(current_web_user)) -> dict:
    return {"user": user_view(current.user)}


@app.patch("/api/v1/profile")
def update_profile(
    payload: ProfileUpdateRequest,
    current: CurrentWebUser = Depends(csrf_protected),
    db: Session = Depends(get_db),
) -> dict:
    current.user.first_name = payload.first_name
    current.user.middle_name = payload.middle_name
    current.user.last_name = payload.last_name
    db.commit()
    db.refresh(current.user)
    return {"user": user_view(current.user), "message": "Your name was updated."}


@app.post("/api/v1/profile/change-password")
def change_password(
    payload: ChangePasswordRequest,
    current: CurrentWebUser = Depends(csrf_protected),
    db: Session = Depends(get_db),
) -> dict:
    if not verify_password(current.user.password_hash, payload.current_password):
        raise HTTPException(status_code=400, detail="The current password is incorrect.")
    current.user.password_hash = hash_password(payload.new_password)
    db.execute(
        update(WebSession)
        .where(
            WebSession.user_id == current.user.id,
            WebSession.id != current.session.id,
            WebSession.revoked_at.is_(None),
        )
        .values(revoked_at=utcnow())
    )
    db.commit()
    return {"message": "Your password was changed. Other signed-in sessions were closed."}


def training_consent_view(user: User, db: Session) -> dict:
    sample_count = db.scalar(
        select(func.count(AutomaticTrainingSample.id)).where(AutomaticTrainingSample.user_id == user.id)
    ) or 0
    last_collected = db.scalar(
        select(AutomaticTrainingSample.created_at)
        .where(AutomaticTrainingSample.user_id == user.id)
        .order_by(AutomaticTrainingSample.created_at.desc())
        .limit(1)
    )
    return {
        "enabled": bool(user.training_collection_enabled),
        "consent_version": user.training_consent_version,
        "consented_at": utc_timestamp(user.training_consent_at),
        "sample_rate_percent": AUTOMATIC_SAMPLE_RATE_PERCENT,
        "collected_sample_count": sample_count,
        "last_collected_at": utc_timestamp(last_collected),
    }


@app.get("/api/v1/training-consent")
def get_training_consent(
    current: CurrentWebUser = Depends(current_web_user),
    db: Session = Depends(get_db),
) -> dict:
    return training_consent_view(current.user, db)


@app.patch("/api/v1/training-consent")
def update_training_consent(
    payload: TrainingConsentUpdateRequest,
    current: CurrentWebUser = Depends(csrf_protected),
    db: Session = Depends(get_db),
) -> dict:
    current.user.training_collection_enabled = payload.enabled
    current.user.training_consent_at = utcnow() if payload.enabled else None
    current.user.training_consent_version = TRAINING_CONSENT_VERSION if payload.enabled else None
    deleted_samples = 0
    if not payload.enabled:
        result = db.execute(
            delete(AutomaticTrainingSample).where(AutomaticTrainingSample.user_id == current.user.id)
        )
        deleted_samples = result.rowcount or 0
    db.commit()
    return {
        **training_consent_view(current.user, db),
        "deleted_samples": deleted_samples,
        "message": (
            "Automatic training-data collection is enabled."
            if payload.enabled
            else "Automatic collection is disabled and your automatic samples were deleted."
        ),
    }


@app.post("/api/v1/pairing", status_code=201)
def create_pairing(current: CurrentWebUser = Depends(csrf_protected), db: Session = Depends(get_db)) -> dict:
    raw = pairing_code()
    db.execute(update(PairingCode).where(PairingCode.user_id == current.user.id, PairingCode.consumed_at.is_(None)).values(consumed_at=utcnow()))
    record = PairingCode(user_id=current.user.id, code_hash=token_hash(raw), expires_at=utcnow() + timedelta(minutes=5))
    db.add(record)
    db.commit()
    return {"code": raw, "expires_at": record.expires_at}


@app.post("/api/v1/pairing/consume")
def consume_pairing(payload: PairingConsumeRequest, db: Session = Depends(get_db)) -> dict:
    record = db.scalar(select(PairingCode).where(PairingCode.code_hash == token_hash(payload.code.upper()), PairingCode.consumed_at.is_(None)))
    if record is None or _aware(record.expires_at) <= utcnow():
        raise HTTPException(status_code=400, detail="This pairing code is invalid or expired.")
    user = db.get(User, record.user_id)
    if user is None or user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=403, detail="This account is unavailable.")
    raw_token = random_token(48)
    device = PairedDevice(user_id=user.id, token_hash=token_hash(raw_token), label=payload.device_label, last_seen_at=utcnow())
    record.consumed_at = utcnow()
    db.add(device)
    db.commit()
    return {"device_id": device.id, "device_token": raw_token, "user_email": user.email}


@app.get("/api/v1/devices")
def list_devices(current: CurrentWebUser = Depends(current_web_user), db: Session = Depends(get_db)) -> dict:
    rows = db.scalars(select(PairedDevice).where(PairedDevice.user_id == current.user.id).order_by(PairedDevice.paired_at.desc())).all()
    return {"items": [{"id": row.id, "label": row.label, "paired_at": utc_timestamp(row.paired_at), "last_seen_at": utc_timestamp(row.last_seen_at), "status": "REVOKED" if row.revoked_at else "ACTIVE"} for row in rows]}


@app.get("/api/v1/device-status")
def device_status(current: CurrentDevice = Depends(current_device)) -> dict:
    """Validate the Companion credential and return privacy-safe readiness."""

    return {
        "connected": True,
        "device_id": current.device.id,
        "cloud_ai": cloud_connection_status(),
    }


@app.get("/api/v1/training-consent/device")
def device_training_consent(
    current: CurrentDevice = Depends(current_device),
) -> dict:
    return {
        "enabled": bool(current.user.training_collection_enabled),
        "consent_version": current.user.training_consent_version,
        "sample_rate_percent": AUTOMATIC_SAMPLE_RATE_PERCENT,
    }


@app.delete("/api/v1/devices/{device_id}", status_code=204)
def revoke_device(device_id: str, current: CurrentWebUser = Depends(csrf_protected), db: Session = Depends(get_db)) -> Response:
    device = db.scalar(select(PairedDevice).where(PairedDevice.id == device_id, PairedDevice.user_id == current.user.id))
    if device is None:
        raise HTTPException(status_code=404, detail="Device not found.")
    device.revoked_at = utcnow()
    db.commit()
    return Response(status_code=204)


def normalized_origin(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(status_code=422, detail="URL activity must contain an HTTP/HTTPS origin.")
    try:
        parsed_port = parsed.port
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="URL activity contains an invalid port.") from exc
    port = f":{parsed_port}" if parsed_port else ""
    return f"{parsed.scheme}://{parsed.hostname.lower()}{port}"


def normalized_report_url(value: str) -> str:
    """Normalize an explicitly submitted address while retaining its full location."""

    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise HTTPException(status_code=422, detail="Website reports require a complete HTTP/HTTPS address.")
    try:
        parsed_port = parsed.port
    except ValueError as exc:
        raise HTTPException(status_code=422, detail="Website report contains an invalid port.") from exc
    hostname = parsed.hostname.lower()
    if ":" in hostname and not hostname.startswith("["):
        hostname = f"[{hostname}]"
    port = f":{parsed_port}" if parsed_port else ""
    return urlunsplit((parsed.scheme.lower(), f"{hostname}{port}", parsed.path or "/", parsed.query, parsed.fragment))


def event_view(event: ActivityEvent, *, feedback_submitted: bool = False) -> dict:
    return {
        "id": event.id,
        "event_type": event.event_type.value,
        "origin": decrypt_text(event.origin_encrypted),
        "provider": event.provider,
        "sender": decrypt_text(event.sender_encrypted),
        "subject": decrypt_text(event.subject_encrypted),
        "outcome": event.outcome.value,
        "cloud_status": event.cloud_status.value,
        "occurred_at": utc_timestamp(event.occurred_at),
        "feedback_submitted": feedback_submitted,
    }


def feedback_activity_ids(db: Session, user_id: str, events: list[ActivityEvent]) -> set[str]:
    if not events:
        return set()
    event_ids = [event.id for event in events if event.event_type == EventType.URL]
    if not event_ids:
        return set()
    return set(
        db.scalars(
            select(UrlReport.activity_event_id).where(
                UrlReport.user_id == user_id,
                UrlReport.activity_event_id.in_(event_ids),
            )
        ).all()
    )


def url_report_view(
    report: UrlReport,
    *,
    include_activity_reference: bool = True,
    similar_report_count: int | None = None,
) -> dict:
    reported_url = decrypt_text(report.origin_encrypted)
    view = {
        "id": report.id,
        "url": reported_url,
        "origin": normalized_origin(reported_url) if reported_url else None,
        "detector_outcome": report.detector_outcome.value,
        "user_classification": report.user_classification.value,
        "feedback_verdict": report.feedback_verdict.value,
        "feedback_reason": report.feedback_reason.value if report.feedback_reason else None,
        "feedback_source": report.feedback_source.value,
        "training_status": report.training_status.value,
        "detector_model_version": report.detector_model_version,
        "status": report.status.value,
        "admin_assessment": report.admin_assessment.value if report.admin_assessment else None,
        "submitted_at": utc_timestamp(report.submitted_at),
        "reviewed_at": utc_timestamp(report.reviewed_at),
    }
    if include_activity_reference:
        view["activity_event_id"] = report.activity_event_id
    if similar_report_count is not None:
        view["similar_report_count"] = similar_report_count
    return view


def training_candidate_view(candidate: UrlTrainingCandidate) -> dict:
    reported_url = decrypt_text(candidate.origin_encrypted)
    return {
        "id": candidate.id,
        "url": reported_url,
        "origin": normalized_origin(reported_url) if reported_url else None,
        "detector_outcome": candidate.detector_outcome.value,
        "approved_label": candidate.approved_label.value,
        "feedback_reason": candidate.feedback_reason.value if candidate.feedback_reason else None,
        "feedback_source": candidate.feedback_source.value,
        "detector_model_version": candidate.detector_model_version,
        "evidence_count": candidate.evidence_count,
        "first_approved_at": utc_timestamp(candidate.first_approved_at),
        "last_approved_at": utc_timestamp(candidate.last_approved_at),
    }


def email_report_view(report: EmailReport, *, similar_report_count: int | None = None) -> dict:
    """Return review metadata without ever decrypting or returning body content."""

    view = {
        "id": report.id,
        "provider": report.provider,
        "sender": decrypt_text(report.sender_encrypted),
        "subject": decrypt_text(report.subject_encrypted),
        "body_included": bool(report.body_ciphertext),
        "body_character_count": report.body_character_count,
        "detector_outcome": report.detector_outcome.value,
        "user_classification": report.user_classification.value,
        "feedback_reason": report.feedback_reason.value if report.feedback_reason else None,
        "training_status": report.training_status.value,
        "detector_model_version": report.detector_model_version,
        "status": report.status.value,
        "admin_assessment": report.admin_assessment.value if report.admin_assessment else None,
        "submitted_at": utc_timestamp(report.submitted_at),
        "reviewed_at": utc_timestamp(report.reviewed_at),
    }
    if similar_report_count is not None:
        view["similar_report_count"] = similar_report_count
    return view


def email_training_candidate_view(candidate: EmailTrainingCandidate) -> dict:
    """Expose useful curation metadata while keeping training text ciphertext-only."""

    return {
        "id": candidate.id,
        "provider": candidate.provider,
        "sender": decrypt_text(candidate.sender_encrypted),
        "subject": decrypt_text(candidate.subject_encrypted),
        "body_included": bool(candidate.body_ciphertext),
        "body_character_count": candidate.body_character_count,
        "detector_outcome": candidate.detector_outcome.value,
        "approved_label": candidate.approved_label.value,
        "feedback_reason": candidate.feedback_reason.value if candidate.feedback_reason else None,
        "detector_model_version": candidate.detector_model_version,
        "evidence_count": candidate.evidence_count,
        "first_approved_at": utc_timestamp(candidate.first_approved_at),
        "last_approved_at": utc_timestamp(candidate.last_approved_at),
    }


def automatic_training_sample_view(sample: AutomaticTrainingSample) -> dict:
    view = {
        "id": sample.id,
        "event_type": sample.event_type.value,
        "provider": sample.provider,
        "detector_outcome": sample.detector_outcome.value,
        "detector_model_version": sample.detector_model_version,
        "body_included": bool(sample.body_ciphertext),
        "body_character_count": sample.body_character_count,
        "occurred_at": utc_timestamp(sample.occurred_at),
        "collected_at": utc_timestamp(sample.created_at),
        "source": "AUTOMATIC_OPT_IN_SAMPLE",
    }
    if sample.event_type == EventType.URL:
        view["url"] = decrypt_text(sample.url_ciphertext)
    else:
        view["sender"] = decrypt_text(sample.sender_encrypted)
        view["subject"] = decrypt_text(sample.subject_encrypted)
    return view


def persist_url_activity_feedback(
    *,
    event: ActivityEvent,
    user_id: str,
    reported_url: str,
    verdict: FeedbackVerdict,
    classification: UrlReportClassification | None,
    reason,
    db: Session,
) -> UrlReport:
    origin = decrypt_text(event.origin_encrypted)
    if not origin:
        raise HTTPException(status_code=422, detail="Website activity has no reportable origin.")
    full_url = normalized_report_url(reported_url)
    if normalized_origin(full_url) != origin:
        raise HTTPException(status_code=422, detail="The submitted address does not match this website detection.")

    if verdict == FeedbackVerdict.INCORRECT:
        stored_classification = classification
    elif verdict == FeedbackVerdict.CORRECT and event.outcome == Outcome.NO_STRONG_WARNING_SIGNS:
        stored_classification = UrlReportClassification.LEGITIMATE
    elif verdict == FeedbackVerdict.CORRECT and event.outcome == Outcome.SUSPICIOUS_SIGNS_FOUND:
        stored_classification = UrlReportClassification.SUSPICIOUS
    else:
        stored_classification = UrlReportClassification.UNSURE

    report = UrlReport(
        user_id=user_id,
        activity_event_id=event.id,
        origin_encrypted=encrypt_text(full_url),
        origin_fingerprint=blind_index(full_url, "url-report-url-v2"),
        detector_outcome=event.outcome,
        user_classification=stored_classification,
        feedback_verdict=verdict,
        feedback_reason=reason,
        feedback_source=FeedbackSource.RECENT_DETECTION,
        training_status=TrainingStatus.PENDING,
        detector_model_version="RF V4-B",
    )
    db.add(report)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Feedback for this website result was already submitted.") from exc
    db.refresh(report)
    return report


def email_content_fingerprint(*, provider: str, sender: str, subject: str, body: str) -> str:
    return blind_index(
        f"{provider}\0{sender.casefold()}\0{subject}\0{body}",
        "email-training-content-v1",
    )


def persist_email_activity_feedback(
    *,
    event: ActivityEvent,
    user_id: str,
    provider: str,
    sender: str,
    subject: str,
    body: str,
    verdict: FeedbackVerdict,
    classification: UrlReportClassification | None,
    reason,
    db: Session,
) -> EmailReport:
    stored_sender = decrypt_text(event.sender_encrypted) or ""
    stored_subject = decrypt_text(event.subject_encrypted) or ""
    if provider != event.provider or sender != stored_sender or subject != stored_subject:
        raise HTTPException(status_code=422, detail="The submitted email does not match this detection.")

    body = body.strip()
    if verdict == FeedbackVerdict.INCORRECT:
        stored_classification = classification
    elif verdict == FeedbackVerdict.CORRECT and event.outcome == Outcome.NO_STRONG_WARNING_SIGNS:
        stored_classification = UrlReportClassification.LEGITIMATE
    elif verdict == FeedbackVerdict.CORRECT and event.outcome == Outcome.SUSPICIOUS_SIGNS_FOUND:
        stored_classification = UrlReportClassification.SUSPICIOUS
    else:
        stored_classification = UrlReportClassification.UNSURE

    report = EmailReport(
        user_id=user_id,
        provider=provider,
        sender_encrypted=encrypt_text(sender),
        subject_encrypted=encrypt_text(subject),
        body_ciphertext=encrypt_text(body),
        body_fingerprint=email_content_fingerprint(
            provider=provider,
            sender=sender,
            subject=subject,
            body=body,
        ),
        body_character_count=len(body),
        detector_outcome=event.outcome,
        user_classification=stored_classification,
        feedback_reason=reason,
        training_status=TrainingStatus.PENDING,
        detector_model_version="XLM-R V1",
    )
    db.add(report)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Feedback for this email was already submitted.") from exc
    db.refresh(report)
    return report


@app.post("/api/v1/activities", status_code=202)
def ingest_activities(payload: ActivityBatchRequest, current: CurrentDevice = Depends(current_device), db: Session = Depends(get_db)) -> dict:
    accepted = 0
    duplicates = 0
    for item in payload.events:
        if item.event_type == EventType.URL:
            if not item.origin or item.provider or item.sender is not None or item.subject is not None:
                raise HTTPException(status_code=422, detail="URL activity contains invalid metadata.")
            origin = normalized_origin(item.origin)
        else:
            if item.origin is not None or not item.provider:
                raise HTTPException(status_code=422, detail="Email activity contains invalid metadata.")
            origin = None
        event = ActivityEvent(
            user_id=current.user.id,
            device_id=current.device.id,
            client_event_id=item.client_event_id,
            event_type=item.event_type,
            provider=item.provider,
            origin_encrypted=encrypt_text(origin),
            sender_encrypted=encrypt_text(item.sender) if item.event_type == EventType.EMAIL else None,
            subject_encrypted=encrypt_text(item.subject or "") if item.event_type == EventType.EMAIL else None,
            outcome=item.outcome,
            cloud_status=item.cloud_status,
            occurred_at=item.occurred_at.astimezone(timezone.utc),
        )
        try:
            with db.begin_nested():
                db.add(event)
                db.flush()
            accepted += 1
        except IntegrityError:
            duplicates += 1
    db.commit()
    return {"accepted": accepted, "duplicates": duplicates}


@app.post("/api/v1/training-samples", status_code=202)
def ingest_automatic_training_sample(
    payload: AutomaticTrainingSampleRequest,
    current: CurrentDevice = Depends(current_device),
    db: Session = Depends(get_db),
) -> dict:
    if not current.user.training_collection_enabled:
        raise HTTPException(status_code=403, detail="Automatic training-data collection is not enabled for this account.")
    if current.user.training_consent_version != TRAINING_CONSENT_VERSION:
        raise HTTPException(status_code=409, detail="The training-data agreement must be reviewed again.")

    if payload.event_type == EventType.URL:
        normalized_content = normalized_report_url(payload.url or "")
        sample = AutomaticTrainingSample(
            user_id=current.user.id,
            device_id=current.device.id,
            client_event_id=payload.client_event_id,
            event_type=payload.event_type,
            url_ciphertext=encrypt_text(normalized_content),
            content_fingerprint=blind_index(normalized_content, "automatic-url-sample-v1"),
            detector_outcome=payload.outcome,
            detector_model_version="RF V4-B",
            consent_version=TRAINING_CONSENT_VERSION,
            occurred_at=payload.occurred_at.astimezone(timezone.utc),
        )
    else:
        body = (payload.body or "").strip()
        sample = AutomaticTrainingSample(
            user_id=current.user.id,
            device_id=current.device.id,
            client_event_id=payload.client_event_id,
            event_type=payload.event_type,
            provider=payload.provider,
            sender_encrypted=encrypt_text(payload.sender or ""),
            subject_encrypted=encrypt_text(payload.subject or ""),
            body_ciphertext=encrypt_text(body),
            content_fingerprint=email_content_fingerprint(
                provider=payload.provider or "",
                sender=payload.sender or "",
                subject=payload.subject or "",
                body=body,
            ),
            body_character_count=len(body),
            detector_outcome=payload.outcome,
            detector_model_version="XLM-R V1",
            consent_version=TRAINING_CONSENT_VERSION,
            occurred_at=payload.occurred_at.astimezone(timezone.utc),
        )
    db.add(sample)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return {"accepted": False, "duplicate": True}
    return {"accepted": True, "duplicate": False}


@app.get("/api/v1/activities")
def activities(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    event_type: EventType | None = None,
    outcome: Outcome | None = None,
    provider: str | None = Query(default=None, pattern="^(gmail|outlook|yahoo)$"),
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    current: CurrentWebUser = Depends(current_web_user),
    db: Session = Depends(get_db),
) -> dict:
    filters = [ActivityEvent.user_id == current.user.id]
    if event_type:
        filters.append(ActivityEvent.event_type == event_type)
    if outcome:
        filters.append(ActivityEvent.outcome == outcome)
    if provider:
        filters.append(ActivityEvent.provider == provider)
    if date_from:
        filters.append(ActivityEvent.occurred_at >= date_from)
    if date_to:
        filters.append(ActivityEvent.occurred_at <= date_to)
    total = db.scalar(select(func.count(ActivityEvent.id)).where(*filters)) or 0
    rows = list(db.scalars(select(ActivityEvent).where(*filters).order_by(ActivityEvent.occurred_at.desc()).offset((page - 1) * page_size).limit(page_size)).all())
    reported = feedback_activity_ids(db, current.user.id, rows)
    return {"items": [event_view(row, feedback_submitted=row.id in reported) for row in rows], "page": page, "page_size": page_size, "total": total, "pages": math.ceil(total / page_size) if total else 0}


@app.post("/api/v1/url-reports", status_code=201)
def create_url_report(
    payload: UrlReportCreateRequest,
    current: CurrentWebUser = Depends(csrf_protected),
    db: Session = Depends(get_db),
) -> dict:
    reported_url = normalized_report_url(payload.url)
    fingerprint = blind_index(reported_url, "url-report-url-v2")
    existing = db.scalar(
        select(UrlReport.id).where(
            UrlReport.user_id == current.user.id,
            UrlReport.activity_event_id.is_(None),
            UrlReport.origin_fingerprint == fingerprint,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="This website result was already reported.")
    report = UrlReport(
        user_id=current.user.id,
        activity_event_id=None,
        origin_encrypted=encrypt_text(reported_url),
        origin_fingerprint=fingerprint,
        detector_outcome=payload.detector_outcome,
        user_classification=payload.classification,
        feedback_verdict=FeedbackVerdict.INCORRECT,
        feedback_reason=payload.reason,
        feedback_source=FeedbackSource.MANUAL_ENTRY,
        training_status=TrainingStatus.PENDING,
        detector_model_version="RF V4-B",
    )
    db.add(report)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="This website result was already reported.") from exc
    db.refresh(report)
    return {"message": "Your website report was submitted for administrator review.", "report": url_report_view(report)}


@app.post("/api/v1/url-reports/from-activity", status_code=201)
def create_activity_url_feedback(
    payload: UrlActivityFeedbackRequest,
    current: CurrentWebUser = Depends(csrf_protected),
    db: Session = Depends(get_db),
) -> dict:
    event = db.scalar(
        select(ActivityEvent).where(
            ActivityEvent.id == payload.activity_event_id,
            ActivityEvent.user_id == current.user.id,
            ActivityEvent.event_type == EventType.URL,
        )
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Website activity not found.")
    report = persist_url_activity_feedback(
        event=event,
        user_id=current.user.id,
        reported_url=payload.url,
        verdict=payload.verdict,
        classification=payload.classification,
        reason=payload.reason,
        db=db,
    )
    return {"message": "Thank you. Your feedback is awaiting administrator review.", "report": url_report_view(report)}


@app.post("/api/v1/url-reports/from-device-activity", status_code=201)
def create_device_activity_url_feedback(
    payload: DeviceUrlActivityFeedbackRequest,
    current: CurrentDevice = Depends(current_device),
    db: Session = Depends(get_db),
) -> dict:
    event = db.scalar(
        select(ActivityEvent).where(
            ActivityEvent.device_id == current.device.id,
            ActivityEvent.client_event_id == payload.client_event_id,
            ActivityEvent.event_type == EventType.URL,
        )
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Website activity has not synced yet. Try again shortly.")
    existing = db.scalar(
        select(UrlReport).where(
            UrlReport.user_id == current.user.id,
            UrlReport.activity_event_id == event.id,
        )
    )
    if existing is not None:
        return {
            "message": "Feedback for this website was already received.",
            "already_submitted": True,
            "report": url_report_view(existing, include_activity_reference=False),
        }
    report = persist_url_activity_feedback(
        event=event,
        user_id=current.user.id,
        reported_url=payload.url,
        verdict=payload.verdict,
        classification=payload.classification,
        reason=payload.reason,
        db=db,
    )
    return {
        "message": "Thank you. Your feedback is awaiting administrator review.",
        "already_submitted": False,
        "report": url_report_view(report, include_activity_reference=False),
    }


@app.post("/api/v1/email-reports/from-device-activity", status_code=201)
def create_device_activity_email_feedback(
    payload: DeviceEmailActivityFeedbackRequest,
    current: CurrentDevice = Depends(current_device),
    db: Session = Depends(get_db),
) -> dict:
    event = db.scalar(
        select(ActivityEvent).where(
            ActivityEvent.device_id == current.device.id,
            ActivityEvent.client_event_id == payload.client_event_id,
            ActivityEvent.event_type == EventType.EMAIL,
        )
    )
    if event is None:
        raise HTTPException(status_code=404, detail="Email activity has not synced yet. Try again shortly.")
    body = payload.body.strip()
    fingerprint = email_content_fingerprint(
        provider=payload.provider,
        sender=payload.sender,
        subject=payload.subject,
        body=body,
    )
    existing = db.scalar(
        select(EmailReport).where(
            EmailReport.user_id == current.user.id,
            EmailReport.body_fingerprint == fingerprint,
        )
    )
    if existing is not None:
        return {
            "message": "Feedback for this email was already received.",
            "already_submitted": True,
            "report": email_report_view(existing),
        }
    report = persist_email_activity_feedback(
        event=event,
        user_id=current.user.id,
        provider=payload.provider,
        sender=payload.sender,
        subject=payload.subject,
        body=body,
        verdict=payload.verdict,
        classification=payload.classification,
        reason=payload.reason,
        db=db,
    )
    return {
        "message": "Thank you. Your email report is awaiting administrator assessment.",
        "already_submitted": False,
        "report": email_report_view(report),
    }


@app.get("/api/v1/url-reports")
def personal_url_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    current: CurrentWebUser = Depends(current_web_user),
    db: Session = Depends(get_db),
) -> dict:
    filters = [UrlReport.user_id == current.user.id]
    total = db.scalar(select(func.count(UrlReport.id)).where(*filters)) or 0
    rows = db.scalars(
        select(UrlReport)
        .where(*filters)
        .order_by(UrlReport.submitted_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "items": [url_report_view(row) for row in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": math.ceil(total / page_size) if total else 0,
    }


@app.post("/api/v1/email-reports", status_code=201)
def create_email_report(
    payload: EmailReportCreateRequest,
    current: CurrentWebUser = Depends(csrf_protected),
    db: Session = Depends(get_db),
) -> dict:
    body = payload.body.strip()
    fingerprint = email_content_fingerprint(
        provider=payload.provider,
        sender=payload.sender,
        subject=payload.subject,
        body=body,
    )
    existing = db.scalar(
        select(EmailReport.id).where(
            EmailReport.user_id == current.user.id,
            EmailReport.body_fingerprint == fingerprint,
        )
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="This email was already submitted as a report.")
    report = EmailReport(
        user_id=current.user.id,
        provider=payload.provider,
        sender_encrypted=encrypt_text(payload.sender),
        subject_encrypted=encrypt_text(payload.subject),
        body_ciphertext=encrypt_text(body),
        body_fingerprint=fingerprint,
        body_character_count=len(body),
        detector_outcome=payload.detector_outcome,
        user_classification=payload.classification,
        feedback_reason=payload.reason,
        training_status=TrainingStatus.PENDING,
        detector_model_version="XLM-R V1",
    )
    db.add(report)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="This email was already submitted as a report.") from exc
    db.refresh(report)
    return {
        "message": "Your encrypted email report was submitted for administrator assessment.",
        "report": email_report_view(report),
    }


@app.get("/api/v1/email-reports")
def personal_email_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    current: CurrentWebUser = Depends(current_web_user),
    db: Session = Depends(get_db),
) -> dict:
    filters = [EmailReport.user_id == current.user.id]
    total = db.scalar(select(func.count(EmailReport.id)).where(*filters)) or 0
    rows = db.scalars(
        select(EmailReport)
        .where(*filters)
        .order_by(EmailReport.submitted_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "items": [email_report_view(row) for row in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": math.ceil(total / page_size) if total else 0,
    }


def outcome_distribution(db: Session, filters: list) -> list[dict]:
    rows = db.execute(select(ActivityEvent.event_type, ActivityEvent.outcome, func.count(ActivityEvent.id)).where(*filters).group_by(ActivityEvent.event_type, ActivityEvent.outcome)).all()
    counts = {(event_type.value, outcome.value): count for event_type, outcome, count in rows}
    result = []
    for event_type in EventType:
        values = {outcome: counts.get((event_type.value, outcome), 0) for outcome in OUTCOME_VALUES}
        total = sum(values.values())
        result.append({"event_type": event_type.value, "total": total, "outcomes": [{"outcome": outcome, "count": count, "percentage": round((count / total) * 100, 1) if total else 0.0} for outcome, count in values.items()]})
    return result


@app.get("/api/v1/dashboard")
def dashboard(days: int = Query(30, ge=7, le=90), current: CurrentWebUser = Depends(current_web_user), db: Session = Depends(get_db)) -> dict:
    if days not in {7, 30, 90}:
        raise HTTPException(status_code=422, detail="Dashboard range must be 7, 30, or 90 days.")
    base = [ActivityEvent.user_id == current.user.id]
    latest_url = db.scalar(select(ActivityEvent).where(*base, ActivityEvent.event_type == EventType.URL).order_by(ActivityEvent.occurred_at.desc()).limit(1))
    latest_email = db.scalar(select(ActivityEvent).where(*base, ActivityEvent.event_type == EventType.EMAIL).order_by(ActivityEvent.occurred_at.desc()).limit(1))
    recent = list(db.scalars(select(ActivityEvent).where(*base).order_by(ActivityEvent.occurred_at.desc()).limit(10)).all())
    feedback_events = [event for event in [latest_url, latest_email, *recent] if event is not None]
    reported = feedback_activity_ids(db, current.user.id, feedback_events)
    chart_filters = [*base, ActivityEvent.occurred_at >= utcnow() - timedelta(days=days)]
    return {"range_days": days, "last_url": event_view(latest_url, feedback_submitted=latest_url.id in reported) if latest_url else None, "last_email": event_view(latest_email, feedback_submitted=latest_email.id in reported) if latest_email else None, "recent": [event_view(row, feedback_submitted=row.id in reported) for row in recent], "distribution": outcome_distribution(db, chart_filters)}


@app.post("/api/v1/cloud-review/email")
def email_cloud_review(payload: EmailCloudReviewRequest, _: CurrentDevice = Depends(current_device)) -> dict:
    return cloud_review({"analysis_type": "EMAIL_CONTEXT", "provider": payload.provider, "sender": payload.redacted_sender, "subject": payload.redacted_subject, "email_context": payload.redacted_context, "email_model": payload.email_model, "local_indicators": payload.local_indicators})


@app.post("/api/v1/message-review")
def pasted_message_review(
    payload: PastedMessageReviewRequest,
    _: CurrentWebUser = Depends(csrf_protected),
) -> dict:
    return review_pasted_message(payload.message)


@app.post("/api/v1/cloud-review/url")
def url_cloud_review(payload: UrlCloudReviewRequest, _: CurrentDevice = Depends(current_device)) -> dict:
    origin = normalized_origin(payload.origin)
    if origin != payload.origin.rstrip("/") or urlsplit(origin).hostname != payload.hostname.lower():
        raise HTTPException(status_code=422, detail="Cloud URL Review accepts only an exact origin and matching hostname.")
    if str(payload.url_model.get("signal", "")).upper() != "SUSPICIOUS":
        raise HTTPException(status_code=422, detail="Cloud URL Review runs only after a local RF warning.")
    return cloud_review({"analysis_type": "URL_CONTEXT", "url_origin": origin, "hostname": payload.hostname.lower(), "url_model": payload.url_model})


@app.get("/api/v1/admin/dashboard")
def admin_dashboard(days: int = Query(30, ge=7, le=90), _: CurrentWebUser = Depends(admin_user), db: Session = Depends(get_db)) -> dict:
    if days not in {7, 30, 90}:
        raise HTTPException(status_code=422, detail="Dashboard range must be 7, 30, or 90 days.")
    return {"range_days": days, "distribution": outcome_distribution(db, [ActivityEvent.occurred_at >= utcnow() - timedelta(days=days)])}


@app.get("/api/v1/admin/training-data")
def admin_training_data(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    approved_label: AdminUrlAssessment | None = None,
    _: CurrentWebUser = Depends(admin_user),
    db: Session = Depends(get_db),
) -> dict:
    if approved_label == AdminUrlAssessment.INCONCLUSIVE:
        raise HTTPException(status_code=422, detail="Training candidates must be legitimate or suspicious.")
    filters = [UrlTrainingCandidate.approved_label == approved_label] if approved_label else []
    total = db.scalar(select(func.count(UrlTrainingCandidate.id)).where(*filters)) or 0
    rows = db.scalars(
        select(UrlTrainingCandidate)
        .where(*filters)
        .order_by(UrlTrainingCandidate.last_approved_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    label_counts = {
        label.value: count
        for label, count in db.execute(
            select(UrlTrainingCandidate.approved_label, func.count(UrlTrainingCandidate.id))
            .group_by(UrlTrainingCandidate.approved_label)
        ).all()
    }
    evidence_total = db.scalar(select(func.coalesce(func.sum(UrlTrainingCandidate.evidence_count), 0))) or 0
    email_filters = [EmailTrainingCandidate.approved_label == approved_label] if approved_label else []
    email_total = db.scalar(select(func.count(EmailTrainingCandidate.id)).where(*email_filters)) or 0
    email_rows = db.scalars(
        select(EmailTrainingCandidate)
        .where(*email_filters)
        .order_by(EmailTrainingCandidate.last_approved_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    email_label_counts = {
        label.value: count
        for label, count in db.execute(
            select(EmailTrainingCandidate.approved_label, func.count(EmailTrainingCandidate.id))
            .group_by(EmailTrainingCandidate.approved_label)
        ).all()
    }
    email_evidence_total = db.scalar(
        select(func.coalesce(func.sum(EmailTrainingCandidate.evidence_count), 0))
    ) or 0
    email_activity_total = db.scalar(
        select(func.count(ActivityEvent.id)).where(ActivityEvent.event_type == EventType.EMAIL)
    ) or 0
    automatic_url_total = db.scalar(
        select(func.count(AutomaticTrainingSample.id)).where(
            AutomaticTrainingSample.event_type == EventType.URL
        )
    ) or 0
    automatic_url_rows = db.scalars(
        select(AutomaticTrainingSample)
        .where(AutomaticTrainingSample.event_type == EventType.URL)
        .order_by(AutomaticTrainingSample.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    automatic_email_total = db.scalar(
        select(func.count(AutomaticTrainingSample.id)).where(
            AutomaticTrainingSample.event_type == EventType.EMAIL
        )
    ) or 0
    automatic_email_rows = db.scalars(
        select(AutomaticTrainingSample)
        .where(AutomaticTrainingSample.event_type == EventType.EMAIL)
        .order_by(AutomaticTrainingSample.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "urls": {
            "items": [training_candidate_view(row) for row in rows],
            "page": page,
            "page_size": page_size,
            "total": total,
            "pages": math.ceil(total / page_size) if total else 0,
            "candidate_total": db.scalar(select(func.count(UrlTrainingCandidate.id))) or 0,
            "evidence_total": evidence_total,
            "label_counts": {
                "LEGITIMATE": label_counts.get("LEGITIMATE", 0),
                "SUSPICIOUS": label_counts.get("SUSPICIOUS", 0),
            },
            "model_version": "RF V4-B",
        },
        "emails": {
            "items": [email_training_candidate_view(row) for row in email_rows],
            "page": page,
            "page_size": page_size,
            "total": email_total,
            "pages": math.ceil(email_total / page_size) if email_total else 0,
            "candidate_total": db.scalar(select(func.count(EmailTrainingCandidate.id))) or 0,
            "evidence_total": email_evidence_total,
            "label_counts": {
                "LEGITIMATE": email_label_counts.get("LEGITIMATE", 0),
                "SUSPICIOUS": email_label_counts.get("SUSPICIOUS", 0),
            },
            "observed_activity_total": email_activity_total,
            "collection_status": "ENCRYPTED_REVIEW_CONTENT",
            "model_version": "XLM-R V1",
            "privacy_message": (
                "Email bodies are stored only as authenticated ciphertext after explicit submission. "
                "User and administrator APIs never return or decrypt the body content."
            ),
        },
        "automatic_samples": {
            "urls": {
                "items": [automatic_training_sample_view(row) for row in automatic_url_rows],
                "page": page,
                "page_size": page_size,
                "total": automatic_url_total,
                "pages": math.ceil(automatic_url_total / page_size) if automatic_url_total else 0,
            },
            "emails": {
                "items": [automatic_training_sample_view(row) for row in automatic_email_rows],
                "page": page,
                "page_size": page_size,
                "total": automatic_email_total,
                "pages": math.ceil(automatic_email_total / page_size) if automatic_email_total else 0,
            },
            "url_total": automatic_url_total,
            "email_total": automatic_email_total,
            "sample_rate_percent": AUTOMATIC_SAMPLE_RATE_PERCENT,
            "privacy_message": (
                "Complete URL samples and email content are stored with authenticated encryption. "
                "Email bodies are never returned by administrator APIs."
            ),
        },
    }


@app.get("/api/v1/admin/training-data/export.csv")
def export_admin_training_data(
    candidate_type: Literal["URL", "EMAIL"] = Query(...),
    approved_label: AdminUrlAssessment | None = None,
    _: CurrentWebUser = Depends(admin_user),
    db: Session = Depends(get_db),
) -> Response:
    """Export one candidate dataset without exposing email bodies."""

    if approved_label == AdminUrlAssessment.INCONCLUSIVE:
        raise HTTPException(status_code=422, detail="Training candidates must be legitimate or suspicious.")

    output = io.StringIO(newline="")
    if candidate_type == "URL":
        fieldnames = [
            "candidate_id", "url", "approved_label", "detector_outcome",
            "feedback_reason", "feedback_source", "detector_model_version",
            "evidence_count", "content_access", "first_approved_at_utc",
            "last_approved_at_utc",
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator="\r\n")
        writer.writeheader()
        filters = [UrlTrainingCandidate.approved_label == approved_label] if approved_label else []
        candidates = db.scalars(
            select(UrlTrainingCandidate)
            .where(*filters)
            .order_by(UrlTrainingCandidate.last_approved_at.desc())
        ).all()
        for candidate in candidates:
            writer.writerow({
                "candidate_id": candidate.id,
                "url": csv_safe_cell(decrypt_text(candidate.origin_encrypted)),
                "approved_label": candidate.approved_label.value,
                "detector_outcome": candidate.detector_outcome.value,
                "feedback_reason": candidate.feedback_reason.value if candidate.feedback_reason else "",
                "feedback_source": candidate.feedback_source.value,
                "detector_model_version": csv_safe_cell(candidate.detector_model_version),
                "evidence_count": candidate.evidence_count,
                "content_access": "INCLUDED_IN_URL_EXPORT",
                "first_approved_at_utc": utc_timestamp(candidate.first_approved_at),
                "last_approved_at_utc": utc_timestamp(candidate.last_approved_at),
            })
        filename_prefix = "bantai-url-training-data"
    else:
        fieldnames = [
            "candidate_id", "provider", "sender", "subject", "approved_label",
            "detector_outcome", "feedback_reason", "feedback_source",
            "detector_model_version", "evidence_count", "body_available",
            "body_character_count", "content_access", "first_approved_at_utc",
            "last_approved_at_utc",
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator="\r\n")
        writer.writeheader()
        filters = [EmailTrainingCandidate.approved_label == approved_label] if approved_label else []
        candidates = db.scalars(
            select(EmailTrainingCandidate)
            .where(*filters)
            .order_by(EmailTrainingCandidate.last_approved_at.desc())
        ).all()
        for candidate in candidates:
            writer.writerow({
                "candidate_id": candidate.id,
                "provider": csv_safe_cell(candidate.provider),
                "sender": csv_safe_cell(decrypt_text(candidate.sender_encrypted)),
                "subject": csv_safe_cell(decrypt_text(candidate.subject_encrypted)),
                "approved_label": candidate.approved_label.value,
                "detector_outcome": candidate.detector_outcome.value,
                "feedback_reason": candidate.feedback_reason.value if candidate.feedback_reason else "",
                "feedback_source": "EXPLICIT_EMAIL_REPORT",
                "detector_model_version": csv_safe_cell(candidate.detector_model_version),
                "evidence_count": candidate.evidence_count,
                "body_available": "TRUE" if candidate.body_ciphertext else "FALSE",
                "body_character_count": candidate.body_character_count,
                "content_access": "RESTRICTED_TRAINING_PROCESS_ONLY",
                "first_approved_at_utc": utc_timestamp(candidate.first_approved_at),
                "last_approved_at_utc": utc_timestamp(candidate.last_approved_at),
            })
        filename_prefix = "bantai-email-training-manifest"

    filename = f"{filename_prefix}-{utcnow().strftime('%Y%m%d-%H%M%S')}.csv"
    return Response(
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/api/v1/admin/training-data/automatic-export.csv")
def export_automatic_training_samples(
    sample_type: Literal["URL", "EMAIL"] = Query(...),
    _: CurrentWebUser = Depends(admin_user),
    db: Session = Depends(get_db),
) -> Response:
    """Export one automatic sample type without disclosing stored email bodies."""

    event_type = EventType.URL if sample_type == "URL" else EventType.EMAIL
    samples = db.scalars(
        select(AutomaticTrainingSample)
        .where(AutomaticTrainingSample.event_type == event_type)
        .order_by(AutomaticTrainingSample.created_at.desc())
    ).all()
    output = io.StringIO(newline="")
    if event_type == EventType.URL:
        fieldnames = [
            "sample_id", "url", "detector_outcome", "detector_model_version",
            "source", "occurred_at_utc", "collected_at_utc",
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator="\r\n")
        writer.writeheader()
        for sample in samples:
            writer.writerow({
                "sample_id": sample.id,
                "url": csv_safe_cell(decrypt_text(sample.url_ciphertext)),
                "detector_outcome": sample.detector_outcome.value,
                "detector_model_version": csv_safe_cell(sample.detector_model_version),
                "source": "AUTOMATIC_OPT_IN_SAMPLE",
                "occurred_at_utc": utc_timestamp(sample.occurred_at),
                "collected_at_utc": utc_timestamp(sample.created_at),
            })
        filename_prefix = "bantai-automatic-url-samples"
    else:
        fieldnames = [
            "sample_id", "provider", "sender", "subject", "detector_outcome",
            "detector_model_version", "body_available", "body_character_count",
            "content_access", "source", "occurred_at_utc", "collected_at_utc",
        ]
        writer = csv.DictWriter(output, fieldnames=fieldnames, lineterminator="\r\n")
        writer.writeheader()
        for sample in samples:
            writer.writerow({
                "sample_id": sample.id,
                "provider": csv_safe_cell(sample.provider),
                "sender": csv_safe_cell(decrypt_text(sample.sender_encrypted)),
                "subject": csv_safe_cell(decrypt_text(sample.subject_encrypted)),
                "detector_outcome": sample.detector_outcome.value,
                "detector_model_version": csv_safe_cell(sample.detector_model_version),
                "body_available": "TRUE" if sample.body_ciphertext else "FALSE",
                "body_character_count": sample.body_character_count,
                "content_access": "RESTRICTED_TRAINING_PROCESS_ONLY",
                "source": "AUTOMATIC_OPT_IN_SAMPLE",
                "occurred_at_utc": utc_timestamp(sample.occurred_at),
                "collected_at_utc": utc_timestamp(sample.created_at),
            })
        filename_prefix = "bantai-automatic-email-sample-manifest"

    filename = f"{filename_prefix}-{utcnow().strftime('%Y%m%d-%H%M%S')}.csv"
    return Response(
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
            "Pragma": "no-cache",
            "X-Content-Type-Options": "nosniff",
        },
    )


@app.get("/api/v1/admin/url-reports")
def admin_url_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    report_status: UrlReportStatus | None = None,
    classification: UrlReportClassification | None = None,
    training_status: TrainingStatus | None = None,
    _: CurrentWebUser = Depends(admin_user),
    db: Session = Depends(get_db),
) -> dict:
    filters = []
    if report_status:
        filters.append(UrlReport.status == report_status)
    if classification:
        filters.append(UrlReport.user_classification == classification)
    if training_status:
        filters.append(UrlReport.training_status == training_status)
    total = db.scalar(select(func.count(UrlReport.id)).where(*filters)) or 0
    rows = db.scalars(
        select(UrlReport)
        .where(*filters)
        .order_by(UrlReport.submitted_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    fingerprints = [row.origin_fingerprint for row in rows if row.origin_fingerprint]
    similar_counts = {
        fingerprint: count
        for fingerprint, count in db.execute(
            select(UrlReport.origin_fingerprint, func.count(UrlReport.id))
            .where(UrlReport.origin_fingerprint.in_(fingerprints))
            .group_by(UrlReport.origin_fingerprint)
        ).all()
    } if fingerprints else {}
    return {
        "items": [url_report_view(row, include_activity_reference=False, similar_report_count=similar_counts.get(row.origin_fingerprint, 1)) for row in rows],
        "training_candidate_total": db.scalar(select(func.count(UrlTrainingCandidate.id))) or 0,
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": math.ceil(total / page_size) if total else 0,
    }


@app.patch("/api/v1/admin/url-reports/{report_id}")
def review_url_report(
    report_id: str,
    payload: UrlReportReviewRequest,
    current: CurrentWebUser = Depends(admin_user),
    db: Session = Depends(get_db),
) -> dict:
    report = db.get(UrlReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Website report not found.")
    if report.user_id == current.user.id:
        raise HTTPException(status_code=400, detail="Administrators cannot review their own website report.")
    if report.status == UrlReportStatus.REVIEWED:
        raise HTTPException(status_code=409, detail="This feedback has already been reviewed.")
    if payload.action == AdminReviewAction.APPROVE:
        if not report.origin_fingerprint:
            origin = decrypt_text(report.origin_encrypted)
            if not origin:
                raise HTTPException(status_code=422, detail="This report has no training-safe website origin.")
            report.origin_fingerprint = blind_index(origin, "url-report-origin-v1")
        candidate = db.scalar(
            select(UrlTrainingCandidate).where(
                UrlTrainingCandidate.origin_fingerprint == report.origin_fingerprint,
                UrlTrainingCandidate.detector_model_version == report.detector_model_version,
            )
        )
        if candidate and candidate.approved_label != payload.assessment:
            raise HTTPException(
                status_code=409,
                detail="This website already has a conflicting approved training label.",
            )
        if candidate:
            candidate.evidence_count += 1
            candidate.last_approved_at = utcnow()
        else:
            db.add(
                UrlTrainingCandidate(
                    origin_encrypted=report.origin_encrypted,
                    origin_fingerprint=report.origin_fingerprint,
                    detector_outcome=report.detector_outcome,
                    approved_label=payload.assessment,
                    feedback_reason=report.feedback_reason,
                    feedback_source=report.feedback_source,
                    detector_model_version=report.detector_model_version,
                    evidence_count=1,
                )
            )
        report.admin_assessment = payload.assessment
        report.training_status = TrainingStatus.APPROVED
        message = "The feedback was approved as a future training candidate."
    elif payload.action == AdminReviewAction.REJECT:
        report.admin_assessment = AdminUrlAssessment.INCONCLUSIVE
        report.training_status = TrainingStatus.REJECTED
        message = "The feedback was rejected and will not be used as a training candidate."
    else:
        report.admin_assessment = AdminUrlAssessment.INCONCLUSIVE
        report.training_status = TrainingStatus.INCONCLUSIVE
        message = "The feedback was marked inconclusive."
    report.status = UrlReportStatus.REVIEWED
    report.reviewed_by = current.user.id
    report.reviewed_at = utcnow()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="The training-candidate store changed. Reload and try again.") from exc
    db.refresh(report)
    return {
        "message": message,
        "report": url_report_view(report, include_activity_reference=False),
    }


@app.get("/api/v1/admin/email-reports")
def admin_email_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    classification: UrlReportClassification | None = None,
    training_status: TrainingStatus | None = None,
    _: CurrentWebUser = Depends(admin_user),
    db: Session = Depends(get_db),
) -> dict:
    filters = []
    if classification:
        filters.append(EmailReport.user_classification == classification)
    if training_status:
        filters.append(EmailReport.training_status == training_status)
    total = db.scalar(select(func.count(EmailReport.id)).where(*filters)) or 0
    rows = db.scalars(
        select(EmailReport)
        .where(*filters)
        .order_by(EmailReport.submitted_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    fingerprints = [row.body_fingerprint for row in rows]
    similar_counts = {
        fingerprint: count
        for fingerprint, count in db.execute(
            select(EmailReport.body_fingerprint, func.count(EmailReport.id))
            .where(EmailReport.body_fingerprint.in_(fingerprints))
            .group_by(EmailReport.body_fingerprint)
        ).all()
    } if fingerprints else {}
    return {
        "items": [
            email_report_view(row, similar_report_count=similar_counts.get(row.body_fingerprint, 1))
            for row in rows
        ],
        "training_candidate_total": db.scalar(select(func.count(EmailTrainingCandidate.id))) or 0,
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": math.ceil(total / page_size) if total else 0,
        "body_access": "ENCRYPTED_NOT_EXPOSED",
    }


@app.patch("/api/v1/admin/email-reports/{report_id}")
def review_email_report(
    report_id: str,
    payload: UrlReportReviewRequest,
    current: CurrentWebUser = Depends(admin_user),
    db: Session = Depends(get_db),
) -> dict:
    report = db.get(EmailReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Email report not found.")
    if report.user_id == current.user.id:
        raise HTTPException(status_code=400, detail="Administrators cannot review their own email submission.")
    if report.status == UrlReportStatus.REVIEWED:
        raise HTTPException(status_code=409, detail="This email feedback has already been reviewed.")
    if payload.action == AdminReviewAction.APPROVE:
        candidate = db.scalar(
            select(EmailTrainingCandidate).where(
                EmailTrainingCandidate.body_fingerprint == report.body_fingerprint,
                EmailTrainingCandidate.detector_model_version == report.detector_model_version,
            )
        )
        if candidate and candidate.approved_label != payload.assessment:
            raise HTTPException(
                status_code=409,
                detail="This encrypted email already has a conflicting approved training label.",
            )
        if candidate:
            candidate.evidence_count += 1
            candidate.last_approved_at = utcnow()
        else:
            db.add(
                EmailTrainingCandidate(
                    provider=report.provider,
                    sender_encrypted=report.sender_encrypted,
                    subject_encrypted=report.subject_encrypted,
                    body_ciphertext=report.body_ciphertext,
                    body_fingerprint=report.body_fingerprint,
                    body_character_count=report.body_character_count,
                    detector_outcome=report.detector_outcome,
                    approved_label=payload.assessment,
                    feedback_reason=report.feedback_reason,
                    detector_model_version=report.detector_model_version,
                    evidence_count=1,
                )
            )
        report.admin_assessment = payload.assessment
        report.training_status = TrainingStatus.APPROVED
        message = "The encrypted email feedback was approved as a future training candidate."
    elif payload.action == AdminReviewAction.REJECT:
        report.admin_assessment = AdminUrlAssessment.INCONCLUSIVE
        report.training_status = TrainingStatus.REJECTED
        message = "The email feedback was rejected and will not be used as a training candidate."
    else:
        report.admin_assessment = AdminUrlAssessment.INCONCLUSIVE
        report.training_status = TrainingStatus.INCONCLUSIVE
        message = "The email feedback was marked inconclusive."
    report.status = UrlReportStatus.REVIEWED
    report.reviewed_by = current.user.id
    report.reviewed_at = utcnow()
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="The email training store changed. Reload and try again.") from exc
    db.refresh(report)
    return {"message": message, "report": email_report_view(report)}


@app.get("/api/v1/admin/users")
def admin_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    search: str = Query("", max_length=320),
    account_status: UserStatus | None = None,
    _: CurrentWebUser = Depends(admin_user),
    db: Session = Depends(get_db),
) -> dict:
    filters = []
    if search:
        term = f"%{search}%"
        filters.append(
            or_(
                User.email.like(term.lower()),
                User.first_name.like(term),
                User.middle_name.like(term),
                User.last_name.like(term),
            )
        )
    if account_status:
        filters.append(User.status == account_status)
    total = db.scalar(select(func.count(User.id)).where(*filters)) or 0
    users = db.scalars(select(User).where(*filters).order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [user_view(user) for user in users], "page": page, "page_size": page_size, "total": total, "pages": math.ceil(total / page_size) if total else 0}


@app.patch("/api/v1/admin/users/{user_id}/status")
def update_user_status(
    user_id: str,
    account_status: UserStatus = Query(...),
    current: CurrentWebUser = Depends(admin_user),
    db: Session = Depends(get_db),
) -> dict:
    if account_status not in {UserStatus.ACTIVE, UserStatus.SUSPENDED}:
        raise HTTPException(status_code=422, detail="Only active or suspended status may be selected.")
    if user_id == current.user.id:
        raise HTTPException(status_code=400, detail="Administrators cannot suspend their own account.")
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.role == UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Administrator accounts cannot be changed here.")
    user.status = account_status
    if account_status == UserStatus.SUSPENDED:
        db.execute(update(WebSession).where(WebSession.user_id == user.id, WebSession.revoked_at.is_(None)).values(revoked_at=utcnow()))
        db.execute(update(PairedDevice).where(PairedDevice.user_id == user.id, PairedDevice.revoked_at.is_(None)).values(revoked_at=utcnow()))
    db.commit()
    return {"user": user_view(user)}
