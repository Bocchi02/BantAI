from __future__ import annotations

import os
import secrets
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal, Optional
from urllib.parse import urlsplit

import torch
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, model_validator
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
)


BACKEND_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(
    dotenv_path=BACKEND_ENV_PATH,
    override=False,
)

from bantai_inference import (
    BantAIInference,
    EXPECTED_MODEL_SHA256,
    MODEL_FILENAME as URL_MODEL_FILENAME,
    MODEL_NAME as URL_MODEL_NAME,
    MODEL_VERSION as URL_MODEL_VERSION,
)
from email_model import (
    MODEL_NAME as EMAIL_MODEL_NAME,
    MODEL_VERSION as EMAIL_MODEL_VERSION,
    PREPROCESSING as EMAIL_PREPROCESSING,
    CalibrationContract,
    calibrated_probabilities,
    count_untruncated_email_tokens,
    encode_email,
    encoded_to_tensors,
    is_suspicious_probability,
    load_deployment_contract,
    safe_text,
)
from extract_url_features import EXTRACTOR_VERSION as URL_FEATURE_EXTRACTOR, FEATURE_NAMES as URL_FEATURE_NAMES
from fusion_engine import fuse_email_signals
from llm import create_coordinator_from_environment, off_review
from llm.cache import TTLCache, normalized_email_fingerprint
from scam_indicator_engine import analyze_scam_indicators
from url_fusion_engine import fuse_url_signals
from companion import CompanionError, companion_manager


VERSION = "1.1.0"

# Calibrated email deployment. The threshold and temperature are loaded from
# calibration.json in the active model directory rather than duplicated here.
EMAIL_MAX_LENGTH = int(EMAIL_PREPROCESSING["max_length"])

# Frozen BantAI RF Grouped v1.0.0 inference configuration. The deployment is
# initially non-blocking; promotion requires explicit validation and opt-in.
URL_THRESHOLD = 0.547
URL_MODEL_ENFORCEMENT_ENABLED = os.getenv(
    "BANTAI_URL_MODEL_ENFORCEMENT_ENABLED",
    "false",
).strip().lower() in {"1", "true", "yes", "on"}
REMOTE_SERVER_MODE = os.getenv(
    "BANTAI_REMOTE_SERVER_MODE",
    "false",
).strip().lower() in {"1", "true", "yes", "on"}
INTERNAL_API_KEY = os.getenv("BANTAI_INTERNAL_API_KEY", "").strip()

SUPPORTED_EMAIL_PROVIDERS = {
    "gmail",
    "outlook",
    "yahoo",
}
MAX_REQUEST_BYTES = int(os.getenv("BANTAI_MAX_REQUEST_BYTES", "131072"))
if MAX_REQUEST_BYTES < 1024:
    raise RuntimeError("BANTAI_MAX_REQUEST_BYTES must be at least 1024.")


class Runtime:
    email_tokenizer = None
    email_model = None
    email_device: Optional[torch.device] = None
    email_model_dir: Optional[Path] = None
    email_contract: Optional[CalibrationContract] = None

    url_bundle = None
    url_engine: Optional[BantAIInference] = None
    url_model = None
    url_feature_names: list[str] = []
    url_model_path: Optional[Path] = None
    url_model_version: str = URL_MODEL_VERSION


runtime = Runtime()
llm_coordinator = create_coordinator_from_environment()
local_email_analysis_cache: TTLCache[dict] = TTLCache(
    ttl_seconds=300,
    max_entries=128,
)


class UrlAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    url: str = Field(
        min_length=1,
        max_length=8192,
    )
    cloud_ai_review: bool = False


class UrlAnalysisResponse(BaseModel):
    analysis_id: str
    detector: str
    signal: str
    final_result: str
    current_url: str
    hostname: str
    model_name: str
    model_version: str
    phishing_probability: float
    decision: Literal["legitimate", "phishing"]
    decision_threshold: float
    validation_status: Literal["retained", "retain_flagged", "repaired"]
    suspicious_probability: float
    safe_probability: float
    threshold: float
    model_message: str
    message: str
    llm_review: dict
    scanned_source: str
    automatic_navigation_performed: bool
    shadow_mode: bool
    enforcement_enabled: bool


class EmailAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    provider: Literal["gmail", "outlook", "yahoo"]
    sender: Optional[str] = Field(default=None, max_length=320)
    subject: str = Field(default="", max_length=500)
    body: str = Field(
        min_length=1,
        max_length=50_000,
    )


class EmailAnalysisResponse(BaseModel):
    analysis_id: str
    detector: str
    provider: str
    sender: Optional[str]
    subject: str
    signal: str
    predicted_label: Literal["legitimate", "phishing_social_engineering"]
    is_suspicious: bool
    model_version: str
    calibration_method: str
    temperature: float
    suspicious_probability: float
    safe_probability: float
    threshold: float
    max_length: int
    original_token_count: int
    analyzed_token_count: int
    was_truncated: bool
    inference_ms: float
    device: str
    message: str


class HybridEmailAnalysisRequest(EmailAnalysisRequest):
    sender_authentication: dict[str, str] = Field(default_factory=dict, max_length=10)
    current_url: str = Field(
        min_length=1,
        max_length=8192,
    )
    cloud_ai_review: bool = False


class HybridEmailAnalysisResponse(BaseModel):
    analysis_id: str
    version: str
    email_model: EmailAnalysisResponse
    url_model: dict
    local_indicators: dict
    llm_review: dict
    fusion: dict


class CompanionPairRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    code: str = Field(min_length=8, max_length=8)
    device_label: str = Field(min_length=1, max_length=80)


class CompanionActivityRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    client_event_id: str = Field(min_length=8, max_length=128)
    event_type: str
    origin: Optional[str] = Field(default=None, max_length=512)
    provider: Optional[str] = None
    sender: Optional[str] = Field(default=None, max_length=320)
    subject: Optional[str] = Field(default=None, max_length=500)
    outcome: str
    cloud_status: str
    cloud_failure_category: Optional[str] = Field(
        default=None,
        max_length=64,
        pattern="^[A-Z][A-Z0-9_]{0,63}$",
    )
    duration_ms: Optional[int] = Field(default=None, ge=0, le=120_000)
    occurred_at: str = Field(min_length=20, max_length=40)

    @model_validator(mode="after")
    def normalize_cloud_failure_category(self) -> "CompanionActivityRequest":
        if self.cloud_status.upper() == "UNAVAILABLE":
            self.cloud_failure_category = self.cloud_failure_category or "UNSPECIFIED"
        elif self.cloud_failure_category is not None:
            raise ValueError("Only unavailable cloud reviews may include a failure category.")
        return self


class CompanionDetailContextRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    client_event_id: str = Field(min_length=8, max_length=128)
    event_type: Literal["URL", "EMAIL"]
    outcome: Literal[
        "NO_STRONG_WARNING_SIGNS",
        "NEEDS_CAUTION",
        "SUSPICIOUS_SIGNS_FOUND",
    ]
    url: Optional[str] = Field(default=None, min_length=8, max_length=8192)
    provider: Optional[Literal["gmail", "outlook", "yahoo"]] = None
    sender: Optional[str] = Field(default=None, max_length=320)
    subject: Optional[str] = Field(default=None, max_length=500)
    body: Optional[str] = Field(default=None, max_length=50_000)

    @model_validator(mode="after")
    def require_matching_detail_content(self) -> "CompanionDetailContextRequest":
        if self.event_type == "URL":
            if not self.url or self.provider or self.sender is not None or self.subject is not None or self.body is not None:
                raise ValueError("Website details require only the current website address.")
        elif self.url is not None or not self.provider or not self.body or not self.body.strip():
            raise ValueError("Email details require provider and email body content without a URL.")
        return self


class CompanionActivityExplanationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    activity_id: str = Field(min_length=36, max_length=36)
    client_event_id: str = Field(min_length=8, max_length=128)


class CompanionUrlFeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    client_event_id: str = Field(min_length=8, max_length=128)
    url: str = Field(min_length=8, max_length=2048)
    verdict: Literal["CORRECT", "INCORRECT", "UNSURE"]
    classification: Optional[Literal["LEGITIMATE", "SUSPICIOUS"]] = None
    reason: Optional[
        Literal[
            "TRUSTED_OR_OFFICIAL",
            "INCORRECT_WARNING",
            "MISSED_WARNING",
            "IMPERSONATION_OR_DECEPTIVE",
            "OTHER",
        ]
    ] = None
    confirmed: Literal[True]

    @model_validator(mode="after")
    def require_explicit_correction(self) -> "CompanionUrlFeedbackRequest":
        if self.verdict == "INCORRECT" and self.classification is None:
            raise ValueError("Incorrect feedback requires a legitimate or suspicious correction.")
        if self.verdict != "INCORRECT" and self.classification is not None:
            raise ValueError("Only incorrect feedback may include a corrected classification.")
        return self


class CompanionEmailFeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    client_event_id: str = Field(min_length=8, max_length=128)
    provider: Literal["gmail", "outlook", "yahoo"]
    sender: str = Field(default="", max_length=320)
    subject: str = Field(default="", max_length=500)
    body: str = Field(min_length=1, max_length=10_000)
    verdict: Literal["CORRECT", "INCORRECT", "UNSURE"]
    classification: Optional[Literal["LEGITIMATE", "SUSPICIOUS"]] = None
    reason: Optional[
        Literal[
            "TRUSTED_OR_OFFICIAL",
            "INCORRECT_WARNING",
            "MISSED_WARNING",
            "IMPERSONATION_OR_DECEPTIVE",
            "OTHER",
        ]
    ] = None
    confirmed: Literal[True]

    @model_validator(mode="after")
    def require_explicit_email_feedback(self) -> "CompanionEmailFeedbackRequest":
        if not self.body.strip():
            raise ValueError("Email body is required.")
        if self.verdict == "INCORRECT" and self.classification is None:
            raise ValueError("Incorrect feedback requires a legitimate or suspicious correction.")
        if self.verdict != "INCORRECT" and self.classification is not None:
            raise ValueError("Only incorrect feedback may include a corrected classification.")
        return self


class CompanionTrainingSampleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    client_event_id: str = Field(min_length=8, max_length=128)
    event_type: Literal["URL", "EMAIL"]
    # The local boundary accepts the detector's full input so the Companion can
    # return an explicit OVERSIZED diagnostic without forwarding it.
    url: Optional[str] = Field(default=None, max_length=8192)
    provider: Optional[Literal["gmail", "outlook", "yahoo"]] = None
    sender: Optional[str] = Field(default=None, max_length=320)
    subject: Optional[str] = Field(default=None, max_length=500)
    body: Optional[str] = Field(default=None, max_length=50_000)
    outcome: Literal[
        "NO_STRONG_WARNING_SIGNS",
        "NEEDS_CAUTION",
        "SUSPICIOUS_SIGNS_FOUND",
    ]
    occurred_at: str = Field(min_length=20, max_length=40)

    @model_validator(mode="after")
    def require_matching_training_content(self) -> "CompanionTrainingSampleRequest":
        if self.event_type == "URL":
            if not self.url or self.provider or self.sender is not None or self.subject is not None or self.body is not None:
                raise ValueError("URL samples require only the complete URL.")
        elif not self.provider or self.url is not None or not self.body or not self.body.strip():
            raise ValueError("Email samples require provider and body content without a URL.")
        return self


def require_detection_access(
    internal_key: str | None = Header(default=None, alias="X-BantAI-Internal-Key"),
) -> None:
    """Allow only the private gateway in remote mode; retain legacy dev pairing."""

    if REMOTE_SERVER_MODE:
        if len(INTERNAL_API_KEY) < 32:
            raise HTTPException(status_code=503, detail="Private detector authentication is not configured.")
        if not internal_key or not secrets.compare_digest(internal_key, INTERNAL_API_KEY):
            raise HTTPException(status_code=401, detail="Private gateway authentication required.")
        return

    access = companion_manager.access_status()
    if not access["detection_enabled"]:
        raise HTTPException(
            status_code=403,
            detail=access["access_message"],
        )


def resolve_required_path(
    environment_variable: str,
    expected_type: str,
) -> Path:
    configured = os.environ.get(
        environment_variable,
        "",
    ).strip()

    if not configured:
        raise RuntimeError(
            f"{environment_variable} is not set."
        )

    path = Path(
        configured
    ).expanduser().resolve()

    if (
        expected_type == "directory"
        and not path.is_dir()
    ):
        raise RuntimeError(
            f"{environment_variable} must point "
            f"to a directory: {path}"
        )

    if (
        expected_type == "file"
        and not path.is_file()
    ):
        raise RuntimeError(
            f"{environment_variable} must point "
            f"to a file: {path}"
        )

    return path


def load_email_model() -> None:
    model_dir = resolve_required_path(
        "BANTAI_MODEL_DIR",
        "directory",
    )

    contract = load_deployment_contract(model_dir)

    print(
        "[Signalam v1.1.0] Loading email "
        f"model from: {model_dir}"
    )

    tokenizer = AutoTokenizer.from_pretrained(
        model_dir,
        local_files_only=True,
    )

    model = (
        AutoModelForSequenceClassification
        .from_pretrained(
            model_dir,
            local_files_only=True,
        )
    )

    device = torch.device(
        "cuda"
        if torch.cuda.is_available()
        else "cpu"
    )

    model = model.to(
        device
    )
    model.eval()

    runtime.email_tokenizer = tokenizer
    runtime.email_model = model
    runtime.email_device = device
    runtime.email_model_dir = model_dir
    runtime.email_contract = contract

    print(
        "[Signalam v1.1.0] Calibrated email model "
        f"{contract.model_run_id} loaded on: {device}"
    )


def load_url_model() -> None:
    model_path = resolve_required_path(
        "BANTAI_RF_MODEL_PATH",
        "file",
    )

    print(
        "[Signalam v1.1.0] Loading URL "
        f"model from: {model_path}"
    )

    try:
        engine = BantAIInference(model_path)
    except Exception as exc:
        raise RuntimeError(
            "The frozen URL detector v1.0.0 could not be loaded; "
            "V4-B fallback is intentionally disabled. "
            f"{exc}"
        ) from exc

    runtime.url_engine = engine
    runtime.url_bundle = engine.bundle
    runtime.url_model = engine.model
    runtime.url_feature_names = list(engine.bundle["feature_names"])
    runtime.url_model_path = model_path
    runtime.url_model_version = URL_MODEL_VERSION

    print(
        "[Signalam v1.1.0] URL model "
        f"loaded with "
        f"{len(runtime.url_feature_names)} "
        f"features using {URL_FEATURE_EXTRACTOR}; SHA-256 "
        f"{engine.model_sha256}."
    )


def validate_address_bar_url(
    value: str,
) -> tuple[str, str]:
    url = str(
        value or ""
    ).strip()

    try:
        parsed = urlsplit(
            url
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "The current address-bar URL "
                "could not be parsed."
            ),
        ) from exc

    if parsed.scheme.lower() not in {
        "http",
        "https",
    }:
        raise HTTPException(
            status_code=400,
            detail=(
                "Only HTTP and HTTPS "
                "address-bar URLs can be scanned."
            ),
        )

    if not parsed.hostname:
        raise HTTPException(
            status_code=400,
            detail=(
                "The address-bar URL does not "
                "contain a valid hostname."
            ),
        )

    return url, parsed.hostname.lower()


@asynccontextmanager
async def lifespan(
    app: FastAPI,
):
    if REMOTE_SERVER_MODE and len(INTERNAL_API_KEY) < 32:
        raise RuntimeError(
            "BANTAI_INTERNAL_API_KEY must contain at least 32 characters in remote server mode."
        )
    load_email_model()
    load_url_model()
    yield


app = FastAPI(
    title="Signalam Hybrid AI Decision-Support API",
    version=VERSION,
    description=(
        "Private frozen server detectors, explainable scam indicators, "
        "privacy-minimized cloud review, and deterministic email fusion."
    ),
    lifespan=lifespan,
)

configured_web_origins = set() if REMOTE_SERVER_MODE else {
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}
for environment_name in ("BANTAI_WEB_ORIGIN", "BANTAI_WEB_DASHBOARD"):
    configured_origin = os.getenv(environment_name, "").strip().rstrip("/")
    if configured_origin:
        configured_web_origins.add(configured_origin)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(configured_web_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Accept", "Content-Type", "X-BantAI-Internal-Key"],
)


class RequestSizeLimitMiddleware:
    """Bound request buffering before JSON parsing or detector inference."""

    def __init__(self, app, maximum_bytes: int):
        self.app = app
        self.maximum_bytes = maximum_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = {key.lower(): value for key, value in scope.get("headers", [])}
        try:
            declared_length = int(headers.get(b"content-length", b"0"))
        except ValueError:
            declared_length = self.maximum_bytes + 1
        if declared_length > self.maximum_bytes:
            return await Response(
                content='{"detail":"Request is too large."}',
                status_code=413,
                media_type="application/json",
            )(scope, receive, send)

        messages = []
        received_bytes = 0
        more_body = True
        while more_body:
            message = await receive()
            messages.append(message)
            if message.get("type") != "http.request":
                break
            received_bytes += len(message.get("body", b""))
            if received_bytes > self.maximum_bytes:
                return await Response(
                    content='{"detail":"Request is too large."}',
                    status_code=413,
                    media_type="application/json",
                )(scope, receive, send)
            more_body = bool(message.get("more_body", False))

        index = 0

        async def replay_receive():
            nonlocal index
            if index < len(messages):
                message = messages[index]
                index += 1
                return message
            return {"type": "http.request", "body": b"", "more_body": False}

        return await self.app(scope, replay_receive, send)


app.add_middleware(RequestSizeLimitMiddleware, maximum_bytes=MAX_REQUEST_BYTES)


@app.get("/live")
def live() -> dict:
    return {"status": "ok", "service": "signalam-private-detector", "version": VERSION}


@app.get("/ready", dependencies=[Depends(require_detection_access)])
def ready() -> dict:
    if runtime.email_model is None or runtime.url_model is None:
        raise HTTPException(status_code=503, detail="Server models are still loading.")
    return {
        "status": "ready",
        "email_model": EMAIL_MODEL_VERSION,
        "url_model": URL_MODEL_VERSION,
        "cloud_ai": llm_coordinator.configuration(),
    }


@app.get("/health")
def health() -> dict:
    llm_status = llm_coordinator.configuration()
    return {
        "status": "ok",
        "version": VERSION,
        "email_detector": {
            "loaded":
                runtime.email_model
                is not None,
            "model":
                EMAIL_MODEL_NAME,
            "model_version":
                EMAIL_MODEL_VERSION,
            "calibration_method": (
                runtime.email_contract.method
                if runtime.email_contract
                else "temperature_scaling"
            ),
            "temperature": (
                runtime.email_contract.temperature
                if runtime.email_contract
                else None
            ),
            "threshold":
                (
                    runtime.email_contract.suspicious_threshold
                    if runtime.email_contract
                    else None
                ),
            "max_length":
                EMAIL_MAX_LENGTH,
            "truncation_strategy":
                EMAIL_PREPROCESSING["truncation_strategy"],
            "supported_providers":
                sorted(
                    SUPPORTED_EMAIL_PROVIDERS
                ),
            "device": (
                str(
                    runtime.email_device
                )
                if runtime.email_device
                else None
            ),
        },
        "url_detector": {
            "loaded":
                runtime.url_model
                is not None,
            "model":
                URL_MODEL_NAME,
            "model_version":
                runtime.url_model_version,
            "filename":
                URL_MODEL_FILENAME,
            "feature_extractor":
                URL_FEATURE_EXTRACTOR,
            "feature_count":
                len(URL_FEATURE_NAMES),
            "model_sha256":
                EXPECTED_MODEL_SHA256,
            "threshold":
                URL_THRESHOLD,
            "shadow_mode":
                not URL_MODEL_ENFORCEMENT_ENABLED,
            "enforcement_enabled":
                URL_MODEL_ENFORCEMENT_ENABLED,
            "scope":
                "CURRENT_ADDRESS_BAR_URL_ONLY",
        },
        "indicator_engine": {
            "enabled": True,
        },
        "llm": llm_status,
        "fusion": {
            "enabled": True,
            "strategy": "DETERMINISTIC",
        },
        "automatic_link_navigation":
            False,
        "embedded_email_link_scanning":
            False,
        "redirect_analysis":
            False,
        "tls_analysis":
            False,
        "overall_numeric_risk_score":
            False,
    }


@app.get("/companion/status")
def companion_status() -> dict:
    """Return authenticated pairing state without exposing the credential."""

    return companion_manager.access_status()


@app.get("/connection-status")
def connection_status() -> dict:
    """Return privacy-safe readiness for the signed-in web dashboard."""

    companion = companion_manager.access_status()
    url_ready = runtime.url_model is not None
    email_ready = runtime.email_model is not None
    paired = bool(companion["detection_enabled"])
    platform = (
        companion_manager.platform_status()
        if paired
        else {
            "reachable": False,
            "cloud_ai_configured": False,
            "cloud_ai_available": False,
        }
    )
    cloud_connected = bool(
        paired
        and platform["reachable"]
        and platform["cloud_ai_configured"]
        and platform["cloud_ai_available"]
    )
    return {
        "checked_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "extension": {
            "connected": paired,
            "device_label": companion.get("device_label"),
            "message": (
                "The extension is paired with this Signalam Companion."
                if paired
                else "Pair this computer from the Paired Devices page."
            ),
        },
        "local_models": {
            "connected": paired and url_ready and email_ready,
            "url_model_ready": paired and url_ready,
            "email_model_ready": paired and email_ready,
            "message": (
                "Pair this computer to view detection connection details."
                if not paired
                else (
                    "The local URL and email models are loaded and ready."
                    if url_ready and email_ready
                    else "Signalam is still loading one or more local models."
                )
            ),
        },
        "cloud_ai": {
            "connected": cloud_connected,
            "platform_reachable": platform["reachable"],
            "configured": platform["cloud_ai_configured"],
            "message": (
                "Pair this computer to view detection connection details."
                if not paired
                else (
                    "Cloud AI Review is configured and reachable through the paired extension."
                    if cloud_connected
                    else (
                        "The shared Signalam service is currently unreachable."
                        if not platform["reachable"]
                        else "Cloud AI Review needs a provider key in the shared service."
                    )
                )
            ),
        },
        "operations": {
            "activity_sync_backlog": companion.get("queued_events", 0),
            "last_successful_activity_sync_at": companion.get("last_activity_sync_at"),
            "automatic_collection": companion.get("automatic_collection") or {
                "last_outcome": "NOT_ATTEMPTED",
                "last_attempt_at": None,
                "last_accepted_at": None,
                "consent_cache_seconds_remaining": 0,
            },
        },
    }


@app.post("/companion/pair")
def pair_companion(request: CompanionPairRequest) -> dict:
    try:
        return companion_manager.pair(request.code, request.device_label)
    except CompanionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/companion/unpair")
def unpair_companion() -> dict:
    """Remove the local credential so a revoked device can be paired again."""

    try:
        return companion_manager.unpair()
    except CompanionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/companion/activity")
def submit_companion_activity(request: CompanionActivityRequest) -> dict:
    event_type = request.event_type.upper()
    allowed_outcomes = {
        "NO_STRONG_WARNING_SIGNS",
        "NEEDS_CAUTION",
        "SUSPICIOUS_SIGNS_FOUND",
    }
    if request.outcome.upper() not in allowed_outcomes:
        raise HTTPException(status_code=400, detail="Activity has an invalid final outcome.")
    if request.cloud_status.upper() not in {"COMPLETE", "SKIPPED", "UNAVAILABLE"}:
        raise HTTPException(status_code=400, detail="Activity has an invalid cloud status.")

    event = request.model_dump()
    event["event_type"] = event_type
    event["outcome"] = request.outcome.upper()
    event["cloud_status"] = request.cloud_status.upper()

    if event_type == "URL":
        try:
            parsed = urlsplit(request.origin or "")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="URL activity has an invalid origin.") from exc
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise HTTPException(status_code=400, detail="URL activity has an invalid origin.")
        host = parsed.hostname.lower()
        if parsed.port:
            host = f"{host}:{parsed.port}"
        event.update(
            {
                "origin": f"{parsed.scheme.lower()}://{host}",
                "provider": None,
                "sender": None,
                "subject": None,
            }
        )
    elif event_type == "EMAIL":
        provider = (request.provider or "").lower()
        if provider not in SUPPORTED_EMAIL_PROVIDERS:
            raise HTTPException(status_code=400, detail="Email activity has an invalid provider.")
        if request.origin is not None:
            raise HTTPException(status_code=400, detail="Email activity cannot include a URL.")
        event["provider"] = provider
    else:
        raise HTTPException(status_code=400, detail="Activity has an invalid type.")

    return companion_manager.submit_activity(event)


@app.post(
    "/companion/detail-context",
    dependencies=[Depends(require_detection_access)],
)
def remember_companion_detail_context(request: CompanionDetailContextRequest) -> dict:
    """Keep sensitive explanation context in local memory, never on disk."""

    if request.event_type == "URL":
        try:
            parsed = urlsplit(request.url or "")
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Website details contain an invalid address.") from exc
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise HTTPException(status_code=400, detail="Website details contain an invalid address.")
        context = request.model_dump(exclude_none=True)
        context["url"] = f"{parsed.scheme.lower()}://{parsed.hostname.lower()}" + (f":{parsed.port}" if parsed.port else "")
    else:
        context = request.model_dump(exclude_none=True)
    return companion_manager.remember_detail_context(context)


@app.post(
    "/companion/activity-explanation",
    dependencies=[Depends(require_detection_access)],
)
def explain_companion_activity(request: CompanionActivityExplanationRequest) -> dict:
    """Request an explanation using memory-only email context or a URL origin."""

    try:
        return companion_manager.explain_activity(request.activity_id, request.client_event_id)
    except CompanionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post(
    "/companion/url-feedback",
    dependencies=[Depends(require_detection_access)],
)
def submit_companion_url_feedback(request: CompanionUrlFeedbackRequest) -> dict:
    """Forward only explicitly confirmed feedback for a synced URL detection."""

    try:
        return companion_manager.submit_url_feedback(request.model_dump(exclude_none=True))
    except CompanionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post(
    "/companion/email-feedback",
    dependencies=[Depends(require_detection_access)],
)
def submit_companion_email_feedback(request: CompanionEmailFeedbackRequest) -> dict:
    """Forward an explicitly confirmed report for the currently opened email."""

    try:
        return companion_manager.submit_email_feedback(request.model_dump(exclude_none=True))
    except CompanionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post(
    "/companion/training-sample",
    dependencies=[Depends(require_detection_access)],
)
def submit_companion_training_sample(request: CompanionTrainingSampleRequest) -> dict:
    """Let the local Companion select and forward an explicitly opted-in sample."""

    try:
        return companion_manager.submit_automatic_training_sample(request.model_dump(exclude_none=True))
    except CompanionError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post(
    "/analyze-url",
    response_model=
        UrlAnalysisResponse,
    dependencies=[
        Depends(require_detection_access)
    ],
)
def analyze_url(
    request:
        UrlAnalysisRequest,
) -> UrlAnalysisResponse:
    if runtime.url_engine is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "The Signalam URL detector v1.0.0 is not loaded."
            ),
        )

    records, _ = runtime.url_engine.predict_urls([request.url])
    prediction = records[0]
    if prediction["validation_status"] == "rejected":
        findings = prediction["validation_findings"] or "invalid_url"
        raise HTTPException(
            status_code=400,
            detail=f"The address-bar URL was rejected by URL validation: {findings}.",
        )

    current_url = prediction["normalized_url"]
    current_url, hostname = validate_address_bar_url(current_url)
    suspicious_probability = float(prediction["phishing_probability"])
    decision = str(prediction["decision"])
    signal = "SUSPICIOUS" if decision == "phishing" else "SAFE"

    if signal == "SUSPICIOUS":
        model_message = (
            "Warning signs were found in this "
            "web address. Avoid entering "
            "passwords, OTPs, or payment "
            "details until the website is "
            "verified."
        )
    else:
        model_message = (
            "No strong warning signs were "
            "found in this web address. "
            "Continue carefully because SAFE "
            "is not a guarantee."
        )

    if request.cloud_ai_review and signal == "SUSPICIOUS":
        llm_review = llm_coordinator.review_url(
            current_url=current_url,
            hostname=hostname,
            url_model={
                "signal": signal,
                "suspicious_probability": suspicious_probability,
                "threshold": URL_THRESHOLD,
            },
        )
    else:
        llm_review = off_review(llm_coordinator.provider_name)
        llm_review.update(llm_coordinator.configuration())
        llm_review["enabled"] = False
        llm_review["status"] = "OFF"
        llm_review["reasoning_summary"] = (
            "Cloud URL Review runs automatically after this local URL warning "
            "when requested by the extension."
            if signal == "SUSPICIOUS"
            else "Cloud URL Review was not needed because the local URL model did not warn."
        )

    url_fusion = fuse_url_signals(
        url_signal=signal,
        llm_review=llm_review,
    )

    return UrlAnalysisResponse(
        analysis_id=
            str(
                uuid.uuid4()
            ),
        detector=
            "CURRENT_URL",
        signal=
            signal,
        final_result=
            url_fusion["final_result"],
        current_url=
            current_url,
        hostname=
            hostname,
        model_name=
            URL_MODEL_NAME,
        model_version=
            URL_MODEL_VERSION,
        phishing_probability=
            suspicious_probability,
        decision=
            decision,
        decision_threshold=
            URL_THRESHOLD,
        validation_status=
            prediction["validation_status"],
        suspicious_probability=
            suspicious_probability,
        safe_probability=
            1.0 -
            suspicious_probability,
        threshold=
            URL_THRESHOLD,
        model_message=
            model_message,
        message=
            url_fusion["message"],
        llm_review=
            llm_review,
        scanned_source=
            "BROWSER_ADDRESS_BAR",
        automatic_navigation_performed=
            False,
        shadow_mode=
            not URL_MODEL_ENFORCEMENT_ENABLED,
        enforcement_enabled=
            URL_MODEL_ENFORCEMENT_ENABLED,
    )


@app.post(
    "/analyze-email",
    response_model=
        EmailAnalysisResponse,
    dependencies=[
        Depends(require_detection_access)
    ],
)
def analyze_email(
    request:
        EmailAnalysisRequest,
) -> EmailAnalysisResponse:
    if (
        runtime.email_model is None
        or runtime.email_tokenizer
        is None
        or runtime.email_device
        is None
        or runtime.email_contract
        is None
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "The frozen email model "
                "is not loaded."
            ),
        )

    provider = (
        request.provider or ""
    ).strip().lower()

    if (
        provider not in
        SUPPORTED_EMAIL_PROVIDERS
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Email detection is enabled "
                "only for Gmail, Outlook, "
                "and Yahoo."
            ),
        )

    if not safe_text(request.subject) and not safe_text(request.body):
        raise HTTPException(
            status_code=400,
            detail=(
                "The opened email does not "
                "contain analyzable text."
            ),
        )

    original_token_count = count_untruncated_email_tokens(
        runtime.email_tokenizer,
        request.subject,
        request.body,
    )

    encoded_lists = encode_email(
        runtime.email_tokenizer,
        request.subject,
        request.body,
    )

    analyzed_token_count = len(encoded_lists["input_ids"])

    encoded = encoded_to_tensors(encoded_lists, runtime.email_device)

    start = time.perf_counter()

    with torch.inference_mode():
        logits = (
            runtime.email_model(
                **encoded
            ).logits
        )

        probabilities = calibrated_probabilities(
            logits,
            runtime.email_contract,
        )[0]

    if (
        runtime.email_device.type
        == "cuda"
    ):
        torch.cuda.synchronize()

    inference_ms = (
        time.perf_counter() -
        start
    ) * 1000.0

    safe_probability = float(
        probabilities[0].item()
    )

    suspicious_probability = float(
        probabilities[runtime.email_contract.positive_class_id].item()
    )

    is_suspicious = is_suspicious_probability(
        suspicious_probability,
        runtime.email_contract,
    )

    signal = (
        "SUSPICIOUS"
        if is_suspicious
        else "SAFE"
    )

    if signal == "SUSPICIOUS":
        message = (
            "The email contains language "
            "patterns that need careful "
            "review. Verify the sender before "
            "following requests or sharing "
            "information."
        )
    else:
        message = (
            "No strong suspicious language "
            "was detected. Continue carefully "
            "because SAFE is not a guarantee "
            "that the email is legitimate."
        )

    return EmailAnalysisResponse(
        analysis_id=
            str(
                uuid.uuid4()
            ),
        detector=
            "SUPPORTED_EMAIL_CONTENT",
        provider=
            provider,
        sender=
            request.sender,
        subject=
            request.subject,
        signal=
            signal,
        predicted_label=(
            "phishing_social_engineering"
            if is_suspicious
            else "legitimate"
        ),
        is_suspicious=
            is_suspicious,
        model_version=
            runtime.email_contract.model_run_id,
        calibration_method=
            runtime.email_contract.method,
        temperature=
            runtime.email_contract.temperature,
        suspicious_probability=
            suspicious_probability,
        safe_probability=
            safe_probability,
        threshold=
            runtime.email_contract.suspicious_threshold,
        max_length=
            EMAIL_MAX_LENGTH,
        original_token_count=
            original_token_count,
        analyzed_token_count=
            analyzed_token_count,
        was_truncated=(
            original_token_count >
            analyzed_token_count
        ),
        inference_ms=
            inference_ms,
        device=
            str(
                runtime.email_device
            ),
        message=
            message,
    )


@app.post(
    "/analyze-hybrid-email",
    response_model=HybridEmailAnalysisResponse,
    dependencies=[
        Depends(require_detection_access)
    ],
)
def analyze_hybrid_email(
    request: HybridEmailAnalysisRequest,
) -> HybridEmailAnalysisResponse:
    """Analyze independent components, then fuse email evidence deterministically."""
    provider = (request.provider or "").strip().lower()
    fingerprint = normalized_email_fingerprint(
        provider=provider,
        sender=request.sender,
        subject=request.subject,
        body=request.body,
    )
    cached_local = local_email_analysis_cache.get(fingerprint)

    if cached_local is None:
        email_model = analyze_email(
            EmailAnalysisRequest(
                provider=provider,
                sender=request.sender,
                subject=request.subject,
                body=request.body,
            )
        )
        local_indicators = analyze_scam_indicators(
            sender=request.sender,
            subject=request.subject,
            body=request.body,
        )
        local_email_analysis_cache.set(
            fingerprint,
            {
                "email_model": email_model.model_dump(),
                "local_indicators": local_indicators,
            },
        )
    else:
        email_model = EmailAnalysisResponse.model_validate(
            cached_local["email_model"]
        )
        local_indicators = cached_local["local_indicators"]

    # The RF receives the exact current address-bar URL supplied as tab.url.
    # A URL-module failure must not discard the completed local email evidence.
    try:
        url_model = analyze_url(
            UrlAnalysisRequest(url=request.current_url, cloud_ai_review=request.cloud_ai_review)
        ).model_dump()
    except Exception:
        url_model = {
            "state": "UNAVAILABLE",
            "signal": "UNAVAILABLE",
            "final_result": None,
            "current_url": request.current_url,
            "hostname": "",
            "message": "The current website address could not be checked. The email result remains available.",
            "failure_reason": "URL_ANALYSIS_UNAVAILABLE",
        }

    if (
        request.cloud_ai_review
    ):
        llm_review = llm_coordinator.review_email(
            sender_authentication=request.sender_authentication,
            provider=provider,
            sender=request.sender,
            subject=request.subject,
            body=request.body,
            current_url=request.current_url,
            email_model=email_model.model_dump(),
            url_model=url_model,
            local_indicators=local_indicators,
        )
    else:
        llm_review = off_review(llm_coordinator.provider_name)
        llm_review.update(llm_coordinator.configuration())
        llm_review["enabled"] = False
        llm_review["status"] = "OFF"
        llm_review["reasoning_summary"] = (
            "Cloud Email Review is awaiting the extension's automatic request."
        )

    fusion = fuse_email_signals(
        email_signal=email_model.signal,
        local_indicators=local_indicators,
        llm_review=llm_review,
    )

    analysis_id = str(uuid.uuid4())
    # In remote mode the authenticated public gateway owns bounded transient
    # context. The private detector never persists or forwards the raw message.
    if not REMOTE_SERVER_MODE:
        companion_manager.remember_detail_context({
            "client_event_id": analysis_id,
            "event_type": "EMAIL",
            "provider": provider,
            "sender": str(request.sender or "")[:320],
            "subject": str(request.subject or "")[:500],
            "body": str(request.body or "")[:50_000],
            "outcome": fusion["final_result"],
        })

    return HybridEmailAnalysisResponse(
        analysis_id=analysis_id,
        version=VERSION,
        email_model=email_model,
        url_model=url_model,
        local_indicators=local_indicators,
        llm_review=llm_review,
        fusion=fusion,
    )
