from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from llm import remote_provider
from llm.base import LLMUnavailableError
from llm.remote_provider import RemotePlatformProvider
from llm.schemas import LLMReview
from shared_platform.app import cloud


VALID_REVIEW = {
    "assessment": "NEEDS_CAUTION",
    "confidence": "MEDIUM",
    "indicators": [],
    "reasoning_summary": "The hostname should be independently verified.",
    "recommended_action": "Use an official source to verify the address.",
}


class FakeCloudProvider:
    def __init__(self, **_values) -> None:
        self.available = True

    def review(self, _payload) -> LLMReview:
        return LLMReview.model_validate(VALID_REVIEW)


class RemotePlatformProviderTests(unittest.TestCase):
    def test_gateway_success_uses_the_strict_review_schema(self) -> None:
        with patch.object(cloud, "GeminiProvider", FakeCloudProvider):
            result = cloud.review({"analysis_type": "URL_CONTEXT"})

        self.assertEqual("NEEDS_CAUTION", result["assessment"])
        self.assertNotIn("status", result)

    def test_remote_provider_accepts_the_legacy_success_envelope(self) -> None:
        legacy_result = {"status": "NEEDS_CAUTION", **VALID_REVIEW}
        with patch.object(
            remote_provider.companion_manager,
            "cloud_review",
            return_value=legacy_result,
        ) as review:
            result = RemotePlatformProvider().review(
                {
                    "analysis_type": "URL_CONTEXT",
                    "address_origin": "https://synthetic.example/",
                    "hostname": "synthetic.example",
                    "url_model": {"signal": "SUSPICIOUS"},
                }
            )

        self.assertEqual("NEEDS_CAUTION", result.assessment)
        path, payload = review.call_args.args
        self.assertEqual("/cloud-review/url", path)
        self.assertEqual("https://synthetic.example", payload["origin"])

    def test_email_gateway_forwards_sender_subject_and_redacted_body(self) -> None:
        with patch.object(
            remote_provider.companion_manager,
            "cloud_review",
            return_value=VALID_REVIEW,
        ) as review:
            result = RemotePlatformProvider().review(
                {
                    "provider": "gmail",
                    "sender_display_name": "Sample Bank",
                    "sender_domain": "sample-bank.example",
                    "subject": "Incoming transfer notice",
                    "email_body": "A privacy-safe synthetic message body.",
                    "email_model": {"signal": "SUSPICIOUS"},
                    "local_indicators": {"markers": []},
                }
            )

        self.assertEqual("NEEDS_CAUTION", result.assessment)
        path, payload = review.call_args.args
        self.assertEqual("/cloud-review/email", path)
        self.assertIn("Sample Bank", payload["redacted_sender"])
        self.assertIn("sample-bank.example", payload["redacted_sender"])
        self.assertEqual("Incoming transfer notice", payload["redacted_subject"])
        self.assertEqual("A privacy-safe synthetic message body.", payload["redacted_context"])

    def test_remote_provider_preserves_unavailable_reason(self) -> None:
        with patch.object(
            remote_provider.companion_manager,
            "cloud_review",
            return_value={"status": "UNAVAILABLE", "failure_reason": "TIMEOUT"},
        ):
            with self.assertRaises(LLMUnavailableError) as raised:
                RemotePlatformProvider().review(
                    {
                        "analysis_type": "URL_CONTEXT",
                        "address_origin": "https://synthetic.example/",
                        "hostname": "synthetic.example",
                        "url_model": {"signal": "SUSPICIOUS"},
                    }
                )

        self.assertEqual("TIMEOUT", raised.exception.reason_code)


if __name__ == "__main__":
    unittest.main()
