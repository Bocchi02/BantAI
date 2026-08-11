"""Provider abstraction for optional BantAI cloud contextual analysis."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from .schemas import LLMReview


class LLMProviderError(RuntimeError):
    """Base provider failure with no raw email content in its message."""


class LLMUnavailableError(LLMProviderError):
    """Provider is disabled, missing configuration, or cannot be reached."""

    def __init__(
        self,
        message: str,
        *,
        reason_code: str = "PROVIDER_UNAVAILABLE",
        retry_after_seconds: float | None = None,
    ) -> None:
        super().__init__(message)
        self.reason_code = reason_code
        self.retry_after_seconds = retry_after_seconds


class LLMResponseError(LLMProviderError):
    """Provider returned a response that failed strict validation."""


class LLMProvider(ABC):
    name = "unknown"

    @property
    @abstractmethod
    def configured(self) -> bool:
        raise NotImplementedError

    @property
    def available(self) -> bool:
        return self.configured

    @abstractmethod
    def review(self, payload: dict[str, Any]) -> LLMReview:
        raise NotImplementedError
