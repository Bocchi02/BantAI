"""Authenticated provider adapter for the shared Signalam cloud-review gateway."""

from __future__ import annotations

from typing import Any

try:
    from companion import CompanionError, companion_manager
except (ModuleNotFoundError, ImportError):  # Package import used by the shared platform.
    from backend.companion import CompanionError, companion_manager

from .base import LLMProvider, LLMUnavailableError
from .schemas import LLMReview, validate_llm_response


class RemotePlatformProvider(LLMProvider):
    name = "bantai-shared-cloud"

    @property
    def configured(self) -> bool:
        return bool(companion_manager.platform_url and companion_manager.paired)

    def review(self, payload: dict[str, Any]) -> LLMReview:
        try:
            if payload.get("analysis_type") == "URL_CONTEXT":
                result = companion_manager.cloud_review(
                    "/cloud-review/url",
                    {
                        "origin": str(payload.get("address_origin") or "").rstrip("/"),
                        "hostname": payload.get("hostname"),
                        "url_model": payload.get("url_model") or {},
                    },
                )
            else:
                display = payload.get("sender_display_name") or ""
                domain = payload.get("sender_domain") or ""
                sender = f"{display} ({domain})".strip() or None
                result = companion_manager.cloud_review(
                    "/cloud-review/email",
                    {
                        "provider": payload.get("provider"),
                        "redacted_sender": sender,
                        "sender_authentication": payload.get("sender_authentication") or {},
                        "redacted_subject": payload.get("subject") or "",
                        "redacted_context": payload.get("email_body") or "",
                        "email_model": payload.get("email_model") or {},
                        "local_indicators": payload.get("local_indicators") or {},
                    },
                )
        except CompanionError as exc:
            raise LLMUnavailableError("The shared Signalam cloud gateway is unavailable.") from exc
        if result.get("status") == "UNAVAILABLE":
            raise LLMUnavailableError(
                "The shared Signalam cloud gateway is unavailable.",
                reason_code=str(result.get("failure_reason") or "PROVIDER_UNAVAILABLE"),
            )
        # Accept the redundant success envelope used by earlier gateway builds
        # while retaining strict validation for every actual review field.
        if result.get("status") == result.get("assessment"):
            result = {key: value for key, value in result.items() if key != "status"}
        return validate_llm_response(result)
