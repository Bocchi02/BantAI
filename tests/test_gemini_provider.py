from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from llm.gemini_provider import GeminiProvider, _gemini_response_schema


class FakeTypes:
    class ThinkingConfig:
        def __init__(self, **values) -> None:
            self.values = values

    class GenerateContentConfig:
        def __init__(self, **values) -> None:
            self.values = values


class SyntheticQuotaError(Exception):
    status_code = 429


class FakeResponse:
    parsed = {
        "assessment": "NO_STRONG_WARNING_SIGNS",
        "confidence": "HIGH",
        "indicators": [],
        "reasoning_summary": "No strong hostname warning was found.",
        "recommended_action": "Continue carefully.",
    }


class FailoverModels:
    def __init__(self) -> None:
        self.calls: list[str] = []

    def generate_content(self, *, model, contents, config):
        self.calls.append(model)
        if model == "gemini-3.6-flash":
            raise SyntheticQuotaError("RESOURCE_EXHAUSTED")
        return FakeResponse()


class FakeClient:
    def __init__(self) -> None:
        self.models = FailoverModels()


class GeminiProviderTests(unittest.TestCase):
    def test_transport_schema_omits_unsupported_additional_properties(self) -> None:
        schema = _gemini_response_schema()

        def contains_additional_properties(value: object) -> bool:
            if isinstance(value, dict):
                return "additionalProperties" in value or any(
                    contains_additional_properties(item) for item in value.values()
                )
            if isinstance(value, list):
                return any(contains_additional_properties(item) for item in value)
            return False

        self.assertFalse(contains_additional_properties(schema))

    def test_provider_defaults_to_no_retry(self) -> None:
        with patch.dict("os.environ", {"BANTAI_LLM_MAX_RETRIES": ""}):
            provider = GeminiProvider(api_key="synthetic", model="gemini-3.6-flash")
        self.assertEqual(provider.max_retries, 0)

    def test_quota_error_is_classified_without_exposing_provider_details(self) -> None:
        reason, retry_after = GeminiProvider._unavailable_details(
            SyntheticQuotaError("RESOURCE_EXHAUSTED; retry in 23.5s")
        )

        self.assertEqual(reason, "QUOTA_REACHED")
        self.assertEqual(retry_after, 23.5)

    def test_timeout_error_is_classified(self) -> None:
        reason, retry_after = GeminiProvider._unavailable_details(
            TimeoutError("request timed out")
        )

        self.assertEqual(reason, "TIMEOUT")
        self.assertEqual(retry_after, 10.0)

    def test_quota_switches_primary_to_flash_lite_for_the_session(self) -> None:
        client = FakeClient()
        provider = GeminiProvider(
            api_key="synthetic",
            model="gemini-3.6-flash",
            fallback_model="gemini-3.5-flash-lite",
            client=client,
        )
        provider._client_and_types = lambda: (client, FakeTypes)
        payload = {
            "analysis_type": "URL_CONTEXT",
            "address_origin": "https://docs.example/",
            "hostname": "docs.example",
            "url_model": {"signal": "SUSPICIOUS"},
        }

        first = provider.review(payload)
        second = provider.review(payload)

        self.assertEqual(first.assessment, "NO_STRONG_WARNING_SIGNS")
        self.assertEqual(
            client.models.calls,
            [
                "gemini-3.6-flash",
                "gemini-3.5-flash-lite",
                "gemini-3.5-flash-lite",
            ],
        )
        self.assertEqual(provider.active_model, "gemini-3.5-flash-lite")
        self.assertTrue(provider.review_metadata()["fallback_used"])


if __name__ == "__main__":
    unittest.main()
