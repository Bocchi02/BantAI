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


@dataclass(frozen=True)
class Settings:
    database_url: str = os.getenv(
        "BANTAI_DATABASE_URL",
        "mysql+pymysql://bantai:bantai-development@127.0.0.1:3306/bantai",
    )
    web_origin: str = os.getenv("BANTAI_WEB_ORIGIN", "http://localhost:3000").rstrip("/")
    extension_origin: str = os.getenv("BANTAI_EXTENSION_ORIGIN", "").rstrip("/")
    cookie_secure: bool = _bool("BANTAI_COOKIE_SECURE", True)
    create_schema: bool = _bool("BANTAI_CREATE_SCHEMA", False)
    encryption_key: str = os.getenv("BANTAI_ENCRYPTION_KEY", "")
    admin_email: str = os.getenv("BANTAI_ADMIN_EMAIL", "")
    admin_password: str = os.getenv("BANTAI_ADMIN_PASSWORD", "")
    smtp_host: str = os.getenv("BANTAI_SMTP_HOST", "")
    smtp_port: int = int(os.getenv("BANTAI_SMTP_PORT", "587"))
    smtp_username: str = os.getenv("BANTAI_SMTP_USERNAME", "")
    smtp_password: str = os.getenv("BANTAI_SMTP_PASSWORD", "")
    smtp_from: str = os.getenv("BANTAI_SMTP_FROM", "BantAI <no-reply@localhost>")
    smtp_starttls: bool = _bool("BANTAI_SMTP_STARTTLS", True)
    session_hours: int = 24
    activity_retention_days: int = 90

    @property
    def cors_origins(self) -> list[str]:
        return [value for value in (self.web_origin, self.extension_origin) if value]


settings = Settings()
