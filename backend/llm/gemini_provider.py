"""Gemini adapter using the official backend-only Google Gen AI Python SDK."""

from __future__ import annotations

import importlib.util
import os
import re
import threading
from typing import Any

from pydantic import ValidationError

from .base import LLMProvider, LLMResponseError, LLMUnavailableError
from .prompt_builder import (
    ACTIVITY_EXPLANATION_SYSTEM_INSTRUCTION,
    PASTED_MESSAGE_SYSTEM_INSTRUCTION,
    SYSTEM_INSTRUCTION,
    URL_SYSTEM_INSTRUCTION,
    build_activity_explanation_prompt,
    build_pasted_message_review_prompt,
    build_review_prompt,
    build_url_review_prompt,
)
from .schemas import LLMReview, validate_llm_response


def _gemini_response_schema() -> dict[str, Any]:
    """Return BantAI's schema without keywords rejected by Gemini's API."""

    def clean(value: Any) -> Any:
        if isinstance(value, dict):
            return {
                key: clean(item)
                for key, item in value.items()
                if key != "additionalProperties"
            }
        if isinstance(value, list):
            return [clean(item) for item in value]
        return value

    return clean(LLMReview.model_json_schema())


def _sdk_available() -> bool:
    try:
        return importlib.util.find_spec("google.genai") is not None
    except (ImportError, ModuleNotFoundError, ValueError):
        return False


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        fallback_model: str | None = None,
        url_model: str | None = None,
        timeout_seconds: float | None = None,
        max_retries: int | None = None,
        client: Any = None,
    ) -> None:
        self.api_key = (api_key if api_key is not None else os.getenv("GEMINI_API_KEY", "")).strip()
        self.model = (model if model is not None else os.getenv("GEMINI_MODEL", "")).strip()
        configured_fallback = (
            fallback_model
            if fallback_model is not None
            else os.getenv("GEMINI_FALLBACK_MODEL", "").strip()
        )
        if not configured_fallback and self.model == "gemini-3.6-flash":
            configured_fallback = "gemini-3.5-flash-lite"
        self.fallback_model = configured_fallback.strip()
        if self.fallback_model == self.model:
            self.fallback_model = ""
        self.url_model = (
            url_model
            if url_model is not None
            else os.getenv("GEMINI_URL_MODEL", "").strip()
        ).strip()
        self._active_model = self.model
        self._model_lock = threading.Lock()
        self._request_state = threading.local()
        configured_timeout = timeout_seconds
        if configured_timeout is None:
            try:
                configured_timeout = float(os.getenv("BANTAI_LLM_TIMEOUT_SECONDS", "12"))
            except ValueError:
                configured_timeout = 12.0
        # Gemini rejects manually configured deadlines below ten seconds.
        # Keep the provider timeout below the Companion/extension request
        # windows while guaranteeing a request the API will accept.
        self.timeout_seconds = min(30.0, max(10.0, float(configured_timeout)))
        configured_retries = max_retries
        if configured_retries is None:
            try:
                configured_retries = int(os.getenv("BANTAI_LLM_MAX_RETRIES", "0"))
            except ValueError:
                configured_retries = 0
        self.max_retries = min(1, max(0, int(configured_retries)))
        self._client = client

    @property
    def configured(self) -> bool:
        return bool(self.api_key and self.model)

    @property
    def available(self) -> bool:
        return self.configured and (self._client is not None or _sdk_available())

    @property
    def active_model(self) -> str:
        with self._model_lock:
            return self._active_model

    def review_metadata(self) -> dict[str, Any]:
        used_model = getattr(self._request_state, "model", self.active_model)
        return {
            "model": used_model,
            "primary_model": self.model,
            "fallback_model": self.fallback_model or None,
            "url_model": self.url_model or None,
            "fallback_used": bool(
                self.fallback_model
                and used_model == self.fallback_model
            ),
        }

    def _activate_fallback(self, failed_model: str) -> bool:
        """Atomically move this backend session to the configured fallback."""

        with self._model_lock:
            if self._active_model != failed_model:
                return bool(self._active_model and self._active_model != failed_model)
            if not self.fallback_model or failed_model == self.fallback_model:
                return False
            self._active_model = self.fallback_model
            return True

    def _client_and_types(self) -> tuple[Any, Any]:
        try:
            from google import genai
            from google.genai import types
        except ImportError as exc:
            raise LLMUnavailableError("The Gemini SDK is not installed.") from exc

        if self._client is None:
            self._client = genai.Client(
                api_key=self.api_key,
                http_options=self._http_options(types),
            )
        return self._client, types

    def _http_options(self, types: Any) -> Any:
        """Bound one SDK request to BantAI's explicit retry policy.

        The Google Gen AI SDK retries transient responses five times by default.
        BantAI already owns fallback selection and permits at most one explicit
        retry, so leaving the SDK default enabled can multiply a ten-second
        deadline into a long, stale browser result.
        """

        return types.HttpOptions(
            timeout=int(self.timeout_seconds * 1000),
            retry_options=types.HttpRetryOptions(attempts=1),
        )

    @staticmethod
    def _is_transient(error: Exception) -> bool:
        status = getattr(error, "status_code", None) or getattr(error, "code", None)
        if status in {408, 429, 500, 502, 503, 504}:
            return True
        message = str(error).lower()
        return any(
            token in message
            for token in (
                "timeout",
                "timed out",
                "rate limit",
                "too many requests",
                "temporarily unavailable",
                "connection reset",
                " 429",
                " 500",
                " 502",
                " 503",
                " 504",
            )
        )

    @staticmethod
    def _unavailable_details(error: Exception) -> tuple[str, float | None]:
        """Classify provider failures without returning the raw provider message."""

        status = getattr(error, "status_code", None) or getattr(error, "code", None)
        try:
            status = int(status)
        except (TypeError, ValueError):
            status = None
        message = str(error).lower()
        if status == 429 or any(
            token in message
            for token in ("resource_exhausted", "quota exceeded", "rate limit", " 429")
        ):
            retry_match = re.search(r"retry(?: in| after)?\s*([0-9]+(?:\.[0-9]+)?)s", message)
            retry_after = float(retry_match.group(1)) if retry_match else 60.0
            return "QUOTA_REACHED", max(10.0, min(300.0, retry_after))
        if status in {401, 403} or "permission_denied" in message:
            return "AUTH_OR_PERMISSION", None
        if status == 408 or "timeout" in message or "timed out" in message:
            return "TIMEOUT", 10.0
        return "PROVIDER_UNAVAILABLE", 10.0 if GeminiProvider._is_transient(error) else None

    def review(self, payload: dict[str, Any]) -> LLMReview:
        if not self.configured:
            raise LLMUnavailableError("Gemini is not configured.")

        client, types = self._client_and_types()
        is_url_review = payload.get("analysis_type") == "URL_CONTEXT"
        is_pasted_message_review = payload.get("analysis_type") == "PASTED_MESSAGE"
        is_activity_explanation = payload.get("analysis_type") == "ACTIVITY_EXPLANATION"
        if is_url_review:
            prompt = build_url_review_prompt(payload)
            system_instruction = URL_SYSTEM_INSTRUCTION
        elif is_pasted_message_review:
            prompt = build_pasted_message_review_prompt(payload)
            system_instruction = PASTED_MESSAGE_SYSTEM_INSTRUCTION
        elif is_activity_explanation:
            prompt = build_activity_explanation_prompt(payload)
            system_instruction = ACTIVITY_EXPLANATION_SYSTEM_INSTRUCTION
        else:
            prompt = build_review_prompt(payload)
            system_instruction = SYSTEM_INSTRUCTION
        use_dedicated_url_model = bool(
            is_url_review
            and self.url_model
            and self.url_model != self.model
        )
        attempt = 0
        while True:
            selected_model = (
                self.url_model
                if use_dedicated_url_model
                else self.active_model
            )
            self._request_state.model = selected_model
            thinking_config = None
            if selected_model.lower().startswith("gemini-3"):
                configured_level = os.getenv(
                    "BANTAI_LLM_THINKING_LEVEL",
                    "minimal",
                ).strip().lower()
                if configured_level not in {"minimal", "low", "medium", "high"}:
                    configured_level = "minimal"
                thinking_config = types.ThinkingConfig(
                    thinking_level=configured_level,
                )
            config = types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                response_schema=_gemini_response_schema(),
                thinking_config=thinking_config,
                max_output_tokens=(
                    512
                    if is_url_review
                    else 1536
                    if is_pasted_message_review or is_activity_explanation
                    else 1024
                ),
            )
            try:
                response = client.models.generate_content(
                    model=selected_model,
                    contents=prompt,
                    config=config,
                )
                parsed = getattr(response, "parsed", None)
                if parsed is None:
                    parsed = getattr(response, "text", None)
                if parsed is None:
                    raise LLMResponseError("Gemini returned no structured assessment.")
                return validate_llm_response(parsed)
            except (ValidationError, ValueError, TypeError) as exc:
                raise LLMResponseError("Gemini returned a malformed structured assessment.") from exc
            except LLMResponseError:
                raise
            except Exception as exc:
                reason_code, retry_after = self._unavailable_details(exc)
                if (
                    reason_code in {
                        "QUOTA_REACHED",
                        "TIMEOUT",
                        "PROVIDER_UNAVAILABLE",
                    }
                    and not use_dedicated_url_model
                    and self._activate_fallback(selected_model)
                ):
                    attempt = 0
                    continue
                if attempt < self.max_retries and self._is_transient(exc):
                    attempt += 1
                    continue
                raise LLMUnavailableError(
                    "Gemini contextual review is unavailable.",
                    reason_code=reason_code,
                    retry_after_seconds=retry_after,
                ) from exc
