"""Private, authenticated transport from the public API to the model service."""

from __future__ import annotations

from typing import Any

import httpx

from .config import settings


class DetectorUnavailable(RuntimeError):
    """A privacy-safe detector transport or readiness failure."""


class DetectorGateway:
    def __init__(self) -> None:
        self.base_url = settings.detector_url

    @property
    def headers(self) -> dict[str, str]:
        return {"X-BantAI-Internal-Key": settings.internal_api_key}

    def _request(
        self,
        method: str,
        path: str,
        *,
        payload: dict[str, Any] | None = None,
        timeout_seconds: float | None = None,
    ) -> dict[str, Any]:
        request_timeout = timeout_seconds or settings.detector_inference_timeout_seconds
        timeout = httpx.Timeout(
            request_timeout,
            connect=min(settings.detector_connect_timeout_seconds, request_timeout),
        )
        try:
            with httpx.Client(timeout=timeout, trust_env=False) as client:
                response = client.request(
                    method,
                    f"{self.base_url}{path}",
                    headers=self.headers,
                    json=payload,
                )
        except (httpx.TimeoutException, httpx.NetworkError) as exc:
            raise DetectorUnavailable("BantAI server models are temporarily unavailable.") from exc
        if response.status_code >= 500:
            raise DetectorUnavailable("BantAI server models are temporarily unavailable.")
        if response.status_code >= 400:
            try:
                detail = response.json().get("detail")
            except (ValueError, AttributeError):
                detail = None
            error = DetectorUnavailable(str(detail or "The detector rejected this request."))
            error.status_code = response.status_code
            raise error
        try:
            result = response.json()
        except ValueError as exc:
            raise DetectorUnavailable("The detector returned an invalid response.") from exc
        if not isinstance(result, dict):
            raise DetectorUnavailable("The detector returned an invalid response.")
        return result

    def readiness(self) -> dict[str, Any]:
        return self._request(
            "GET",
            "/ready",
            timeout_seconds=settings.detector_readiness_timeout_seconds,
        )

    def analyze_url(self, url: str) -> dict[str, Any]:
        return self._request(
            "POST",
            "/analyze-url",
            payload={"url": url, "cloud_ai_review": True},
        )

    def analyze_email(
        self,
        *,
        provider: str,
        sender: str | None,
        subject: str,
        body: str,
        current_url: str,
        sender_authentication: dict | None = None,
    ) -> dict[str, Any]:
        return self._request(
            "POST",
            "/analyze-hybrid-email",
            payload={
                "provider": provider,
                "sender": sender,
                "subject": subject,
                "body": body,
                "current_url": current_url,
                "cloud_ai_review": True,
                "sender_authentication": sender_authentication or {},
            },
        )


detector_gateway = DetectorGateway()
