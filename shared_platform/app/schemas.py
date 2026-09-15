from __future__ import annotations

import enum
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from .models import (
    AdminUrlAssessment,
    CloudStatus,
    EventType,
    FeedbackReason,
    FeedbackVerdict,
    Outcome,
    UrlReportClassification,
    UserRole,
    UserStatus,
)


PASSWORD_REQUIREMENTS = (
    "Password must be 12 to 128 characters and include at least one uppercase "
    "letter, one lowercase letter, one number, and one special character."
)


def require_strong_password(value: str) -> str:
    has_special = any(not character.isalnum() and not character.isspace() for character in value)
    if not (
        12 <= len(value) <= 128
        and any(character.isupper() for character in value)
        and any(character.islower() for character in value)
        and any(character.isdigit() for character in value)
        and has_special
    ):
        raise ValueError(PASSWORD_REQUIREMENTS)
    return value


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class RegisterRequest(StrictModel):
    first_name: str = Field(min_length=1, max_length=80)
    middle_name: str | None = Field(default=None, max_length=80)
    last_name: str = Field(min_length=1, max_length=80)
    email: EmailStr
    # Registration validates strength in the route after checking email
    # availability, so duplicate-email feedback always takes priority.
    password: str = Field(min_length=1, max_length=128)


class LoginRequest(StrictModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class EmailRequest(StrictModel):
    email: EmailStr


class PastedMessageReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    message: str = Field(min_length=1, max_length=10_000)
    confirmed: Literal[True]

    @field_validator("message")
    @classmethod
    def require_visible_message_text(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Message text is required.")
        return value


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
    new_password: str = Field(min_length=1, max_length=128)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return require_strong_password(value)

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
    created_at: datetime
    last_login_at: datetime | None


class PairingConsumeRequest(StrictModel):
    code: str = Field(min_length=8, max_length=8)
    device_label: str = Field(min_length=1, max_length=80)


class RemoteUrlDetectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    client_event_id: str = Field(min_length=8, max_length=128)
    url: str = Field(min_length=8, max_length=2048)
    occurred_at: datetime

    @field_validator("occurred_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("occurred_at must include a timezone")
        return value


class RemoteEmailDetectionRequest(BaseModel):
    sender_authentication: dict[str, str] = Field(default_factory=dict, max_length=10)
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    client_event_id: str = Field(min_length=8, max_length=128)
    provider: Literal["gmail", "outlook", "yahoo"]
    sender: str | None = Field(default=None, max_length=320)
    subject: str = Field(default="", max_length=500)
    body: str = Field(min_length=1, max_length=50_000)
    current_url: str = Field(min_length=8, max_length=2048)
    occurred_at: datetime

    @field_validator("body")
    @classmethod
    def require_visible_body(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Opened email body is required.")
        return value

    @field_validator("occurred_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("occurred_at must include a timezone")
        return value


class ActivityInput(StrictModel):
    client_event_id: str = Field(min_length=8, max_length=128)
    event_type: EventType
    origin: str | None = Field(default=None, max_length=512)
    provider: Literal["gmail", "outlook", "yahoo"] | None = None
    sender: str | None = Field(default=None, max_length=320)
    subject: str | None = Field(default=None, max_length=500)
    outcome: Outcome
    cloud_status: CloudStatus
    cloud_failure_category: str | None = Field(default=None, max_length=64, pattern="^[A-Z][A-Z0-9_]{0,63}$")
    duration_ms: int | None = Field(default=None, ge=0, le=120_000)
    occurred_at: datetime

    @field_validator("occurred_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("occurred_at must include a timezone")
        return value

    @model_validator(mode="after")
    def normalize_cloud_failure_category(self) -> "ActivityInput":
        if self.cloud_status == CloudStatus.UNAVAILABLE:
            self.cloud_failure_category = self.cloud_failure_category or "UNSPECIFIED"
        elif self.cloud_failure_category is not None:
            raise ValueError("Only unavailable cloud reviews may include a failure category.")
        return self


class ActivityBatchRequest(StrictModel):
    events: list[ActivityInput] = Field(min_length=1, max_length=100)


class TrainingConsentUpdateRequest(StrictModel):
    enabled: bool
    confirmed: bool = False

    @model_validator(mode="after")
    def require_confirmation_to_enable(self) -> "TrainingConsentUpdateRequest":
        if self.enabled and not self.confirmed:
            raise ValueError("You must confirm the training-data collection agreement.")
        return self


class AutomaticTrainingSampleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    client_event_id: str = Field(min_length=8, max_length=128)
    event_type: EventType
    url: str | None = Field(default=None, max_length=2048)
    provider: Literal["gmail", "outlook", "yahoo"] | None = None
    sender: str | None = Field(default=None, max_length=320)
    subject: str | None = Field(default=None, max_length=500)
    body: str | None = Field(default=None, max_length=10_000)
    outcome: Outcome
    occurred_at: datetime

    @model_validator(mode="after")
    def require_matching_sample_content(self) -> "AutomaticTrainingSampleRequest":
        if self.occurred_at.tzinfo is None:
            raise ValueError("occurred_at must include a timezone")
        if self.event_type == EventType.URL:
            if not self.url or self.provider or self.sender is not None or self.subject is not None or self.body is not None:
                raise ValueError("URL samples require only the complete URL.")
        elif not self.provider or self.url is not None or not self.body or not self.body.strip():
            raise ValueError("Email samples require provider and body content without a URL.")
        return self


class UrlReportCreateRequest(StrictModel):
    url: str = Field(min_length=8, max_length=2048)
    detector_outcome: Outcome
    classification: UrlReportClassification
    reason: FeedbackReason | None = None

    @model_validator(mode="after")
    def require_decisive_manual_classification(self) -> "UrlReportCreateRequest":
        if self.classification == UrlReportClassification.UNSURE:
            raise ValueError("Manual reports require a legitimate or suspicious classification.")
        return self


class EmailReportCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    provider: Literal["gmail", "outlook", "yahoo"]
    sender: str = Field(min_length=1, max_length=320)
    subject: str = Field(default="", max_length=500)
    body: str = Field(min_length=1, max_length=10_000)
    detector_outcome: Outcome
    classification: UrlReportClassification
    reason: FeedbackReason | None = None
    confirmed: Literal[True]

    @field_validator("sender")
    @classmethod
    def normalize_sender(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Sender is required.")
        return value

    @model_validator(mode="after")
    def require_decisive_classification(self) -> "EmailReportCreateRequest":
        if self.classification == UrlReportClassification.UNSURE:
            raise ValueError("Email reports require a legitimate or suspicious classification.")
        if not self.body.strip():
            raise ValueError("Email body is required.")
        return self


class UrlActivityFeedbackRequest(StrictModel):
    activity_event_id: str = Field(min_length=36, max_length=36)
    url: str = Field(min_length=8, max_length=2048)
    verdict: FeedbackVerdict
    classification: UrlReportClassification | None = None
    reason: FeedbackReason | None = None
    confirmed: Literal[True]

    @model_validator(mode="after")
    def require_correction_for_incorrect_feedback(self) -> "UrlActivityFeedbackRequest":
        if self.verdict == FeedbackVerdict.INCORRECT:
            if self.classification not in {
                UrlReportClassification.LEGITIMATE,
                UrlReportClassification.SUSPICIOUS,
            }:
                raise ValueError("Incorrect feedback requires a legitimate or suspicious correction.")
        elif self.classification is not None:
            raise ValueError("Only incorrect feedback may include a corrected classification.")
        return self


class DeviceUrlActivityFeedbackRequest(StrictModel):
    client_event_id: str = Field(min_length=8, max_length=128)
    url: str | None = Field(default=None, min_length=8, max_length=2048)
    verdict: FeedbackVerdict
    classification: UrlReportClassification | None = None
    reason: FeedbackReason | None = None
    confirmed: Literal[True]

    @model_validator(mode="after")
    def require_correction_for_incorrect_feedback(self) -> "DeviceUrlActivityFeedbackRequest":
        if self.verdict == FeedbackVerdict.INCORRECT:
            if self.classification not in {
                UrlReportClassification.LEGITIMATE,
                UrlReportClassification.SUSPICIOUS,
            }:
                raise ValueError("Incorrect feedback requires a legitimate or suspicious correction.")
        elif self.classification is not None:
            raise ValueError("Only incorrect feedback may include a corrected classification.")
        return self


class DeviceEmailActivityFeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    client_event_id: str = Field(min_length=8, max_length=128)
    provider: Literal["gmail", "outlook", "yahoo"]
    sender: str = Field(default="", max_length=320)
    subject: str = Field(default="", max_length=500)
    body: str | None = Field(default=None, min_length=1, max_length=10_000)
    verdict: FeedbackVerdict
    classification: UrlReportClassification | None = None
    reason: FeedbackReason | None = None
    confirmed: Literal[True]

    @model_validator(mode="after")
    def require_explicit_email_feedback(self) -> "DeviceEmailActivityFeedbackRequest":
        if self.body is not None and not self.body.strip():
            raise ValueError("Email body is required.")
        if self.verdict == FeedbackVerdict.INCORRECT:
            if self.classification not in {
                UrlReportClassification.LEGITIMATE,
                UrlReportClassification.SUSPICIOUS,
            }:
                raise ValueError("Incorrect feedback requires a legitimate or suspicious correction.")
        elif self.classification is not None:
            raise ValueError("Only incorrect feedback may include a corrected classification.")
        return self


class AdminReviewAction(str, enum.Enum):
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    INCONCLUSIVE = "INCONCLUSIVE"


class UrlReportReviewRequest(StrictModel):
    action: AdminReviewAction
    assessment: AdminUrlAssessment | None = None
    reason: str | None = Field(default=None, max_length=1000)

    @field_validator("reason", mode="before")
    @classmethod
    def empty_reason_is_none(cls, value: object) -> object:
        return None if isinstance(value, str) and not value.strip() else value

    @model_validator(mode="after")
    def require_assessment_for_training_approval(self) -> "UrlReportReviewRequest":
        if self.action == AdminReviewAction.APPROVE:
            if self.assessment not in {AdminUrlAssessment.LEGITIMATE, AdminUrlAssessment.SUSPICIOUS}:
                raise ValueError("Training approval requires a legitimate or suspicious assessment.")
        elif self.assessment is not None:
            raise ValueError("Rejected or inconclusive feedback cannot include a training label.")
        return self


class EmailCloudReviewRequest(StrictModel):
    sender_authentication: dict[str, str] = Field(default_factory=dict, max_length=10)
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


class ActivityExplanationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=False)

    activity_id: str = Field(min_length=36, max_length=36)
    client_event_id: str = Field(min_length=8, max_length=128)
    event_type: EventType
    outcome: Outcome
    url: str | None = Field(default=None, min_length=8, max_length=512)
    provider: Literal["gmail", "outlook", "yahoo"] | None = None
    sender: str | None = Field(default=None, max_length=320)
    subject: str | None = Field(default=None, max_length=500)
    body: str | None = Field(default=None, max_length=50_000)

    @model_validator(mode="after")
    def require_matching_explanation_content(self) -> "ActivityExplanationRequest":
        if self.event_type == EventType.URL:
            if not self.url or self.provider or self.sender is not None or self.subject is not None or self.body is not None:
                raise ValueError("Website explanations require only the website origin.")
        elif self.url is not None or not self.provider or not self.body or not self.body.strip():
            raise ValueError("Email explanations require provider and email body content without a URL.")
        return self


class ActivityExplanationFallbackRequest(StrictModel):
    activity_id: str = Field(min_length=36, max_length=36)
    client_event_id: str = Field(min_length=8, max_length=128)
