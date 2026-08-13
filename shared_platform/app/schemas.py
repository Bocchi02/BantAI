from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from .models import CloudStatus, EventType, Outcome, UserRole, UserStatus


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class RegisterRequest(StrictModel):
    first_name: str = Field(min_length=1, max_length=80)
    middle_name: str | None = Field(default=None, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class LoginRequest(StrictModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class TokenRequest(StrictModel):
    token: str = Field(min_length=24, max_length=256)


class EmailRequest(StrictModel):
    email: EmailStr


class ResetPasswordRequest(TokenRequest):
    password: str = Field(min_length=12, max_length=128)


class ProfileUpdateRequest(StrictModel):
    first_name: str = Field(min_length=1, max_length=80)
    middle_name: str | None = Field(default=None, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)

    @field_validator("middle_name", mode="before")
    @classmethod
    def empty_middle_name_is_none(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value


class ChangePasswordRequest(StrictModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=12, max_length=128)

    @model_validator(mode="after")
    def require_different_password(self) -> "ChangePasswordRequest":
        if self.current_password == self.new_password:
            raise ValueError("The new password must be different from the current password.")
        return self


class UserView(StrictModel):
    id: str
    email: EmailStr
    first_name: str
    middle_name: str | None
    last_name: str
    full_name: str
    role: UserRole
    status: UserStatus
    verified_at: datetime | None
    created_at: datetime
    last_login_at: datetime | None


class PairingConsumeRequest(StrictModel):
    code: str = Field(min_length=8, max_length=8)
    device_label: str = Field(min_length=1, max_length=80)


class ActivityInput(StrictModel):
    client_event_id: str = Field(min_length=8, max_length=128)
    event_type: EventType
    origin: str | None = Field(default=None, max_length=512)
    provider: Literal["gmail", "outlook", "yahoo"] | None = None
    sender: str | None = Field(default=None, max_length=320)
    subject: str | None = Field(default=None, max_length=500)
    outcome: Outcome
    cloud_status: CloudStatus
    occurred_at: datetime

    @field_validator("occurred_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("occurred_at must include a timezone")
        return value


class ActivityBatchRequest(StrictModel):
    events: list[ActivityInput] = Field(min_length=1, max_length=100)


class EmailCloudReviewRequest(StrictModel):
    provider: Literal["gmail", "outlook", "yahoo"]
    redacted_sender: str | None = Field(default=None, max_length=320)
    redacted_subject: str = Field(default="", max_length=500)
    redacted_context: str = Field(min_length=1, max_length=7000)
    email_model: dict
    local_indicators: dict


class UrlCloudReviewRequest(StrictModel):
    origin: str = Field(min_length=8, max_length=512)
    hostname: str = Field(min_length=1, max_length=253)
    url_model: dict

