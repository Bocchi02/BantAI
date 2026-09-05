from __future__ import annotations

import sys
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path


BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from llm import LLMReviewCoordinator
from llm.base import LLMProvider, LLMUnavailableError
from llm.cache import TTLCache
from llm.schemas import LLMReview


class FakeProvider(LLMProvider):
    name = "fake"

    def __init__(self) -> None:
        self.calls = 0
        self.last_payload = None

    @property
    def configured(self) -> bool:
        return True

    def review(self, payload: dict) -> LLMReview:
        self.calls += 1
        self.last_payload = payload
        return LLMReview(
            assessment="NEEDS_CAUTION",
            confidence="MEDIUM",
            indicators=[],
            reasoning_summary="The request should be independently verified.",
            recommended_action="Use an official contact channel.",
        )


class MalformedProvider(FakeProvider):
    def review(self, payload: dict):
        self.calls += 1
        return {
            "assessment": "SUSPICIOUS_SIGNS_FOUND",
            "indicators": [],
        }


class ThrowingProvider(FakeProvider):
    def review(self, payload: dict):
        self.calls += 1
        raise RuntimeError("synthetic provider failure")


class SlowProvider(FakeProvider):
    def review(self, payload: dict) -> LLMReview:
        time.sleep(0.05)
        return super().review(payload)


class QuotaProvider(FakeProvider):
    def review(self, payload: dict):
        self.calls += 1
        raise LLMUnavailableError(
            "synthetic quota failure",
            reason_code="QUOTA_REACHED",
            retry_after_seconds=60.0,
        )


class LLMCacheTests(unittest.TestCase):
    @staticmethod
    def arguments() -> dict:
        return {
            "provider": "gmail",
            "sender": "Example <person@example.com>",
            "subject": "Verify",
            "body": "Send OTP 182944 to confirm.",
            "current_url": "https://mail.google.com/mail/u/0/#inbox/example",
            "email_model": {"signal": "SAFE", "suspicious_probability": 0.01},
            "url_model": {"signal": "SAFE", "suspicious_probability": 0.02},
            "local_indicators": {"markers": [], "critical_count": 0, "strong_count": 0},
        }

    def test_duplicate_email_reuses_valid_review_during_ttl(self) -> None:
        provider = FakeProvider()
        coordinator = LLMReviewCoordinator(
            provider,
            cache=TTLCache(ttl_seconds=60, max_entries=8),
        )
        arguments = self.arguments()
        first = coordinator.review_email(**arguments)
        second = coordinator.review_email(**arguments)
        self.assertEqual(provider.calls, 1)
        self.assertFalse(first["cached"])
        self.assertTrue(second["cached"])
        self.assertTrue(first["body_context_sent_to_provider"])
        self.assertTrue(first["sender_context_sent_to_provider"])
        self.assertTrue(first["subject_context_sent_to_provider"])
        self.assertEqual("FULL_REDACTED_BODY", first["body_context_scope"])
        self.assertGreater(first["body_context_chars_sent"], 0)
        self.assertEqual("example.com", provider.last_payload["sender_domain"])
        self.assertEqual("Verify", provider.last_payload["subject"])
        self.assertIn("email_body", provider.last_payload)
        self.assertNotIn("182944", str(provider.last_payload))
        self.assertNotIn("person@example.com", str(provider.last_payload))

    def test_malformed_provider_output_becomes_unavailable(self) -> None:
        coordinator = LLMReviewCoordinator(MalformedProvider())
        result = coordinator.review_email(**self.arguments())
        self.assertEqual(result["status"], "UNAVAILABLE")
        self.assertIsNone(result["assessment"])

    def test_provider_exception_becomes_unavailable(self) -> None:
        coordinator = LLMReviewCoordinator(ThrowingProvider())
        result = coordinator.review_email(**self.arguments())
        self.assertEqual(result["status"], "UNAVAILABLE")

    def test_duplicate_url_review_reuses_origin_only_payload(self) -> None:
        provider = FakeProvider()
        coordinator = LLMReviewCoordinator(
            provider,
            cache=TTLCache(ttl_seconds=60, max_entries=8),
        )
        arguments = {
            "current_url": "https://www.facebook.com/messages/t/private-thread",
            "hostname": "www.facebook.com",
            "url_model": {
                "signal": "SUSPICIOUS",
                "suspicious_probability": 0.91,
                "threshold": 0.547,
            },
        }
        first = coordinator.review_url(**arguments)
        second = coordinator.review_url(**arguments)
        self.assertEqual(provider.calls, 1)
        self.assertFalse(first["cached"])
        self.assertTrue(second["cached"])
        self.assertEqual(
            provider.last_payload["address_origin"],
            "https://www.facebook.com/",
        )
        self.assertNotIn("private-thread", str(provider.last_payload))

    def test_concurrent_url_reviews_share_one_provider_request(self) -> None:
        provider = SlowProvider()
        coordinator = LLMReviewCoordinator(
            provider,
            cache=TTLCache(ttl_seconds=60, max_entries=8),
        )
        arguments = {
            "current_url": "https://docs.example.com/private/path",
            "hostname": "docs.example.com",
            "url_model": {
                "signal": "SUSPICIOUS",
                "suspicious_probability": 0.91,
                "threshold": 0.547,
            },
        }
        with ThreadPoolExecutor(max_workers=3) as executor:
            results = list(
                executor.map(
                    lambda _: coordinator.review_url(**arguments),
                    range(3),
                )
            )
        self.assertEqual(provider.calls, 1)
        self.assertTrue(any(result.get("coalesced") for result in results))

    def test_url_quota_failure_starts_global_cooldown(self) -> None:
        provider = QuotaProvider()
        coordinator = LLMReviewCoordinator(provider)
        first = coordinator.review_url(
            current_url="https://first.example/path",
            hostname="first.example",
            url_model={"signal": "SUSPICIOUS"},
        )
        second = coordinator.review_url(
            current_url="https://second.example/path",
            hostname="second.example",
            url_model={"signal": "SUSPICIOUS"},
        )

        self.assertEqual(provider.calls, 1)
        self.assertEqual(first["failure_reason"], "QUOTA_REACHED")
        self.assertEqual(second["failure_reason"], "QUOTA_REACHED")
        self.assertTrue(second["cooldown"])
        self.assertTrue(second["cached"])


if __name__ == "__main__":
    unittest.main()
