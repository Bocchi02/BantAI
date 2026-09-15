"""Optional cloud-review coordination with redaction, validation, and TTL caching."""

from __future__ import annotations

import os
import hashlib
import json
import threading
import time
from concurrent.futures import Future, TimeoutError as FutureTimeoutError
from typing import Any

from pydantic import ValidationError

from .base import LLMProvider, LLMProviderError
from .authentication import minimize_authentication
from .cache import (
    TTLCache,
    normalized_email_fingerprint,
    normalized_url_fingerprint,
)
from .gemini_provider import GeminiProvider
from .remote_provider import RemotePlatformProvider
from .redaction import (
    DEFAULT_MAX_EMAIL_CHARS,
    prepare_cloud_payload,
    prepare_url_cloud_payload,
)
from .schemas import LLMReview, validate_llm_response


def off_review(provider_name: str = "gemini") -> dict[str, Any]:
    return {
        "enabled": False,
        "status": "OFF",
        "provider": provider_name,
        "configured": False,
        "available": False,
        "cached": False,
        "assessment": None,
        "confidence": None,
        "indicators": [],
        "reasoning_summary": "Cloud AI Review is off. Local BantAI checks still run.",
        "recommended_action": "Continue using the server-model guidance.",
    }


class LLMReviewCoordinator:
    def __init__(
        self,
        provider: LLMProvider | None,
        *,
        cache: TTLCache[dict[str, Any]] | None = None,
        maximum_email_chars: int = DEFAULT_MAX_EMAIL_CHARS,
    ) -> None:
        self.provider = provider
        self.cache = cache or TTLCache(ttl_seconds=600, max_entries=128)
        self.maximum_email_chars = maximum_email_chars
        self._url_inflight_lock = threading.Lock()
        self._url_inflight: dict[str, Future[dict[str, Any]]] = {}
        self._url_blocked_until = 0.0
        self._url_blocked_result: dict[str, Any] | None = None

    @property
    def provider_name(self) -> str:
        return self.provider.name if self.provider else os.getenv("BANTAI_LLM_PROVIDER", "gemini")

    def configuration(self) -> dict[str, Any]:
        result = {
            "provider": self.provider_name,
            "configured": bool(self.provider and self.provider.configured),
            "available": bool(self.provider and self.provider.available),
            "cloud_review_default": True,
        }
        if self.provider is not None:
            active_model = getattr(self.provider, "active_model", None)
            fallback_model = getattr(self.provider, "fallback_model", None)
            if active_model:
                result["model"] = active_model
            if fallback_model:
                result["fallback_model"] = fallback_model
        return result

    def _provider_review_metadata(self) -> dict[str, Any]:
        if self.provider is None:
            return {}
        metadata = getattr(self.provider, "review_metadata", None)
        if not callable(metadata):
            return {}
        value = metadata()
        return value if isinstance(value, dict) else {}

    def _unavailable(
        self,
        *,
        failure_reason: str = "PROVIDER_UNAVAILABLE",
        retry_after_seconds: float | None = None,
    ) -> dict[str, Any]:
        configured = bool(self.provider and self.provider.configured)
        result = {
            "enabled": True,
            "status": "UNAVAILABLE",
            "provider": self.provider_name,
            "configured": configured,
            "available": False,
            "cached": False,
            "assessment": None,
            "confidence": None,
            "indicators": [],
            "reasoning_summary": "Cloud AI Review could not be completed. Local BantAI checks are still available.",
            "recommended_action": "Use the server-model guidance and verify unexpected requests independently.",
            "failure_reason": failure_reason,
            **self._provider_review_metadata(),
        }
        if retry_after_seconds is not None:
            result["retry_after_seconds"] = retry_after_seconds
        return result

    def review_email(
        self,
        *,
        provider: str,
        sender: str | None,
        subject: str,
        body: str,
        current_url: str,
        email_model: dict[str, Any],
        url_model: dict[str, Any],
        local_indicators: dict[str, Any],
        sender_authentication: dict | None = None,
    ) -> dict[str, Any]:
        if self.provider is None or not self.provider.configured or not self.provider.available:
            return self._unavailable()

        authentication = minimize_authentication(sender_authentication, provider)
        fingerprint = normalized_email_fingerprint(
            provider=provider,
            sender=sender,
            subject=subject,
            body=body,
        )
        fingerprint = hashlib.sha256((fingerprint + json.dumps(authentication, sort_keys=True)).encode()).hexdigest()
        cached = self.cache.get(fingerprint)
        if cached is not None:
            return {**cached, "cached": True}

        try:
            payload = prepare_cloud_payload(
                provider=provider,
                sender=sender,
                subject=subject,
                body=body,
                current_url=current_url,
                email_model=email_model,
                url_model=url_model,
                local_indicators=local_indicators,
                maximum_email_chars=self.maximum_email_chars,
                sender_authentication=authentication,
            )
            cloud_body = str(payload.get("email_body") or "")
            cloud_body_truncated = "[...TRUNCATED FOR DATA MINIMIZATION...]" in cloud_body
            review: LLMReview = validate_llm_response(self.provider.review(payload))
        except LLMProviderError as exc:
            return self._unavailable(
                failure_reason=getattr(exc, "reason_code", "PROVIDER_UNAVAILABLE"),
                retry_after_seconds=getattr(exc, "retry_after_seconds", None),
            )
        except (ValidationError, ValueError, TypeError):
            return self._unavailable(failure_reason="MALFORMED_RESPONSE")
        except Exception:
            # Provider adapters must not be able to break local BantAI analysis.
            return self._unavailable()

        result = {
            "enabled": True,
            "status": review.assessment,
            "provider": self.provider_name,
            "configured": True,
            "available": True,
            "cached": False,
            **self._provider_review_metadata(),
            **review.model_dump(),
            "body_context_sent_to_provider": True,
            "sender_authentication_sent_to_provider": bool(authentication),
            "sender_context_sent_to_provider": bool(
                payload.get("sender_display_name") or payload.get("sender_domain")
            ),
            "subject_context_sent_to_provider": bool(payload.get("subject")),
            "body_context_scope": (
                "REDACTED_BEGINNING_AND_END"
                if cloud_body_truncated
                else "FULL_REDACTED_BODY"
            ),
            "body_context_chars_sent": len(cloud_body),
        }
        if result.get("fallback_used"):
            result["provider_note"] = (
                "The primary Gemini model reached its quota, so this review used "
                "the configured Flash-Lite fallback."
            )
        self.cache.set(fingerprint, result)
        return result

    def review_url(
        self,
        *,
        current_url: str,
        hostname: str,
        url_model: dict[str, Any],
    ) -> dict[str, Any]:
        if self.provider is None or not self.provider.configured or not self.provider.available:
            return self._unavailable()

        fingerprint = normalized_url_fingerprint(
            hostname=hostname,
            model_signal=str(url_model.get("signal", "")),
        )
        cached = self.cache.get(fingerprint)
        if cached is not None:
            return {**cached, "cached": True}

        with self._url_inflight_lock:
            if (
                self._url_blocked_result is not None
                and self._url_blocked_until > time.monotonic()
            ):
                remaining = max(1, int(self._url_blocked_until - time.monotonic()))
                return {
                    **self._url_blocked_result,
                    "cached": True,
                    "cooldown": True,
                    "retry_after_seconds": remaining,
                }
            in_flight = self._url_inflight.get(fingerprint)
            owns_request = in_flight is None
            if in_flight is None:
                in_flight = Future()
                self._url_inflight[fingerprint] = in_flight

        if not owns_request:
            try:
                shared_result = in_flight.result(timeout=18.0)
                return {**shared_result, "coalesced": True}
            except FutureTimeoutError:
                unavailable = self._unavailable()
                unavailable["reasoning_summary"] = (
                    "Cloud URL Review timed out. The local URL result still applies."
                )
                return unavailable

        try:
            payload = prepare_url_cloud_payload(
                current_url=current_url,
                hostname=hostname,
                url_model=url_model,
            )
            review: LLMReview = validate_llm_response(self.provider.review(payload))
        except LLMProviderError as exc:
            failure_reason = getattr(exc, "reason_code", "PROVIDER_UNAVAILABLE")
            retry_after = getattr(exc, "retry_after_seconds", None)
            result = self._unavailable(
                failure_reason=failure_reason,
                retry_after_seconds=retry_after,
            )
            if failure_reason == "QUOTA_REACHED":
                result["reasoning_summary"] = (
                    "Cloud URL Review quota is temporarily exhausted. The local URL result still applies."
                )
            elif failure_reason == "TIMEOUT":
                result["reasoning_summary"] = (
                    "Cloud URL Review timed out. The local URL result still applies."
                )
            else:
                result["reasoning_summary"] = (
                    "Cloud URL Review could not be completed. The local URL result still applies."
                )
            cooldown_seconds = retry_after
            if cooldown_seconds is None and failure_reason == "QUOTA_REACHED":
                cooldown_seconds = 60.0
            if cooldown_seconds:
                with self._url_inflight_lock:
                    self._url_blocked_until = time.monotonic() + cooldown_seconds
                    self._url_blocked_result = dict(result)
        except (ValidationError, ValueError, TypeError):
            result = self._unavailable(failure_reason="MALFORMED_RESPONSE")
            result["reasoning_summary"] = (
                "Cloud URL Review returned an invalid result. The local URL result still applies."
            )
        except Exception:
            result = self._unavailable()
            result["reasoning_summary"] = (
                "Cloud URL Review could not be completed. The local URL result still applies."
            )
        else:
            result = {
                "enabled": True,
                "status": review.assessment,
                "provider": self.provider_name,
                "configured": True,
                "available": True,
                "cached": False,
                **self._provider_review_metadata(),
                **review.model_dump(),
            }
            if result.get("fallback_used"):
                result["provider_note"] = (
                    "The primary Gemini model reached its quota, so this review used "
                    "the configured Flash-Lite fallback."
                )
            self.cache.set(fingerprint, result)
        finally:
            in_flight.set_result(result)
            with self._url_inflight_lock:
                self._url_inflight.pop(fingerprint, None)

        return result


def create_coordinator_from_environment() -> LLMReviewCoordinator:
    provider_name = os.getenv("BANTAI_LLM_PROVIDER", "gemini").strip().lower()
    try:
        maximum = int(os.getenv("BANTAI_LLM_MAX_EMAIL_CHARS", str(DEFAULT_MAX_EMAIL_CHARS)))
    except ValueError:
        maximum = DEFAULT_MAX_EMAIL_CHARS
    maximum = min(20000, max(400, maximum))
    try:
        ttl = float(os.getenv("BANTAI_LLM_CACHE_TTL_SECONDS", "600"))
    except ValueError:
        ttl = 600.0
    if os.getenv("BANTAI_PLATFORM_API", "").strip():
        provider: LLMProvider | None = RemotePlatformProvider()
    else:
        provider = GeminiProvider() if provider_name == "gemini" else None
    return LLMReviewCoordinator(
        provider,
        cache=TTLCache(ttl_seconds=min(3600, max(30, ttl)), max_entries=128),
        maximum_email_chars=maximum,
    )


__all__ = [
    "LLMReviewCoordinator",
    "create_coordinator_from_environment",
    "off_review",
]
