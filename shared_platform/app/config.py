from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)


def _bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    value = os.getenv(name)
    return int(value) if value and value.strip() else default


def _float(name: str, default: float) -> float:
    value = os.getenv(name)
    return float(value) if value and value.strip() else default


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv(
        "BANTAI_DATABASE_URL",
        "mysql+pymysql://bantai:bantai-development@127.0.0.1:3306/bantai",
    )
    web_origin: str = os.getenv("BANTAI_WEB_ORIGIN", "http://localhost:3000").rstrip("/")
    extension_origin: str = os.getenv("BANTAI_EXTENSION_ORIGIN", "").rstrip("/")
    detector_url: str = os.getenv("BANTAI_DETECTOR_URL", "http://detector:8000").rstrip("/")
    internal_api_key: str = os.getenv("BANTAI_INTERNAL_API_KEY", "")
    detector_connect_timeout_seconds: float = _float("BANTAI_DETECTOR_CONNECT_TIMEOUT_SECONDS", 3.0)
    detector_readiness_timeout_seconds: float = _float("BANTAI_DETECTOR_READINESS_TIMEOUT_SECONDS", 5.0)
    detector_inference_timeout_seconds: float = _float("BANTAI_DETECTOR_INFERENCE_TIMEOUT_SECONDS", 45.0)
    # A 50,000-character email can be substantially larger than 50,000 bytes
    # in UTF-8. Keep a strict byte ceiling while allowing the declared schema.
    maximum_request_bytes: int = _int("BANTAI_MAX_REQUEST_BYTES", 262_144)
    detection_rate_limit_per_5_minutes: int = _int("BANTAI_DETECTION_RATE_LIMIT_PER_5_MINUTES", 120)
    trusted_proxy_cidrs: str = os.getenv("BANTAI_TRUSTED_PROXY_CIDRS", "")
    transient_context_ttl_seconds: int = _int("BANTAI_TRANSIENT_CONTEXT_TTL_SECONDS", 600)
    transient_context_max_entries: int = _int("BANTAI_TRANSIENT_CONTEXT_MAX_ENTRIES", 512)
    remote_runtime_required: bool = _bool("BANTAI_REMOTE_RUNTIME_REQUIRED", False)
    # This build has no email-delivery provider or verified-email workflow.
    # Remote deployments therefore stay closed to public self-registration.
    public_registration_enabled: bool = _bool("BANTAI_PUBLIC_REGISTRATION_ENABLED", True)
    cookie_secure: bool = _bool("BANTAI_COOKIE_SECURE", True)
    create_schema: bool = _bool("BANTAI_CREATE_SCHEMA", False)
    encryption_key: str = os.getenv("BANTAI_ENCRYPTION_KEY", "")
    admin_email: str = os.getenv("BANTAI_ADMIN_EMAIL", "")
    admin_password: str = os.getenv("BANTAI_ADMIN_PASSWORD", "")
    session_hours: int = 24
    activity_retention_days: int = 90

    @property
    def cors_origins(self) -> list[str]:
        return [value for value in (self.web_origin, self.extension_origin) if value]

    def validate_remote_runtime(self) -> None:
        if not self.detector_url.startswith("http://"):
            raise RuntimeError("BANTAI_DETECTOR_URL must name the private HTTP detector service.")
        if len(self.internal_api_key) < 32:
            raise RuntimeError("BANTAI_INTERNAL_API_KEY must contain at least 32 characters.")
        if not self.web_origin.startswith("https://"):
            raise RuntimeError("BANTAI_WEB_ORIGIN must be an HTTPS origin in remote mode.")
        if not self.extension_origin.startswith("chrome-extension://"):
            raise RuntimeError("BANTAI_EXTENSION_ORIGIN must name the released Chrome extension origin.")
        if not self.trusted_proxy_cidrs.strip():
            raise RuntimeError("BANTAI_TRUSTED_PROXY_CIDRS must identify the private Caddy source network.")
        if self.public_registration_enabled:
            raise RuntimeError(
                "Public registration requires a verified-email delivery workflow; "
                "keep BANTAI_PUBLIC_REGISTRATION_ENABLED=false for this controlled pilot."
            )


settings = Settings()
