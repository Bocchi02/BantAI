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
        self.configs: list[FakeTypes.GenerateContentConfig] = []
        self.contents: list[str] = []

    def generate_content(self, *, model, contents, config):
        self.calls.append(model)
        self.configs.append(config)
        self.contents.append(contents)
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

    def test_provider_uses_an_api_accepted_timeout(self) -> None:
        with patch.dict("os.environ", {"BANTAI_LLM_TIMEOUT_SECONDS": ""}):
            default_provider = GeminiProvider(api_key="synthetic", model="gemini-3.6-flash")
        short_provider = GeminiProvider(
            api_key="synthetic",
            model="gemini-3.6-flash",
            timeout_seconds=2,
        )

        self.assertEqual(default_provider.timeout_seconds, 12.0)
        self.assertEqual(short_provider.timeout_seconds, 10.0)

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

    def test_pasted_message_review_requests_a_detailed_taglish_aware_response(self) -> None:
        client = FakeClient()
        provider = GeminiProvider(
            api_key="synthetic",
            model="gemini-3.5-flash-lite",
            fallback_model="",
            client=client,
        )
        provider._client_and_types = lambda: (client, FakeTypes)

        provider.review({
            "analysis_type": "PASTED_MESSAGE",
            "message_text": "Paki-send ang code para hindi ma-block ang account mo.",
        })

        config = client.models.configs[-1].values
        self.assertEqual(1536, config["max_output_tokens"])
        self.assertIn("English, Filipino, and Taglish", config["system_instruction"])
        self.assertIn("three to six distinct", config["system_instruction"])
        self.assertIn("UNTRUSTED_PASTED_MESSAGE_JSON", client.models.contents[-1])

    def test_activity_explanation_is_outcome_bound_and_taglish_aware(self) -> None:
        client = FakeClient()
        provider = GeminiProvider(
            api_key="synthetic",
            model="gemini-3.6-flash",
            fallback_model="",
            client=client,
        )
        provider._client_and_types = lambda: (client, FakeTypes)

        provider.review({
            "analysis_type": "ACTIVITY_EXPLANATION",
            "event_type": "EMAIL",
            "recorded_outcome": "SUSPICIOUS_SIGNS_FOUND",
            "content_scope": "EMAIL_PROVIDER_SENDER_SUBJECT_BODY",
            "subject": "Paki-send ang OTP ngayon",
            "email_body": "Send mo ang verification code ngayon para hindi ma-block.",
        })

        config = client.models.configs[-1].values
        self.assertEqual(1536, config["max_output_tokens"])
        self.assertIn("recorded final outcome is authoritative", config["system_instruction"])
        self.assertIn("Taglish clarification", config["system_instruction"])
        self.assertIn("Tagalog or Taglish language is never suspicious by itself", config["system_instruction"])
        self.assertIn("UNTRUSTED_ACTIVITY_CONTEXT_JSON", client.models.contents[-1])
        self.assertIn("verification code", client.models.contents[-1])


if __name__ == "__main__":
    unittest.main()
