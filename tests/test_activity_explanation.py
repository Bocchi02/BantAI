from __future__ import annotations

import unittest
from unittest.mock import patch


class ActivityExplanationTests(unittest.TestCase):
    def test_email_body_is_included_after_privacy_redaction_and_is_not_stored(self) -> None:
        from backend.llm.schemas import LLMReview
        from shared_platform.app.cloud import explain_activity

        review = LLMReview(
            assessment="SUSPICIOUS_SIGNS_FOUND",
            confidence="HIGH",
            indicators=[{
                "category": "Credential request",
                "severity": "CRITICAL",
                "evidence": "The message asks for a verification code.",
            }],
            reasoning_summary="The message requests a private verification code.",
            recommended_action="Do not share the code; verify independently.",
        )
        with patch("shared_platform.app.cloud.GeminiProvider") as provider_class:
            provider = provider_class.return_value
            provider.available = True
            provider.review.return_value = review
            result = explain_activity({
                "event_type": "EMAIL",
                "recorded_outcome": "SUSPICIOUS_SIGNS_FOUND",
                "provider": "gmail",
                "sender": "victim@example.test",
                "subject": "OTP 123456 required",
                "email_body": "Paki-send ang OTP 123456 or call 09171234567 ngayon.",
                "content_scope": "EMAIL_PROVIDER_SENDER_SUBJECT_BODY",
            })

        payload = provider.review.call_args.args[0]
        self.assertEqual("ACTIVITY_EXPLANATION", payload["analysis_type"])
        self.assertIn("Paki-send", payload["email_body"])
        self.assertIn("[OTP_REDACTED]", payload["email_body"])
        self.assertIn("[PHONE_REDACTED]", payload["email_body"])
        self.assertNotIn("123456", payload["email_body"])
        self.assertNotIn("09171234567", payload["email_body"])
        self.assertTrue(payload["redacted_before_provider"])
        self.assertFalse(result["stored"])
        self.assertTrue(result["redacted_before_provider"])
        self.assertTrue(result["full_context_available"])

    def test_full_url_path_query_and_fragment_are_included_without_browsing(self) -> None:
        from backend.llm.schemas import LLMReview
        from shared_platform.app.cloud import explain_activity

        review = LLMReview(
            assessment="NEEDS_CAUTION",
            confidence="MEDIUM",
            indicators=[],
            reasoning_summary="The recorded result recommends caution.",
            recommended_action="Verify the address independently.",
        )
        with patch("shared_platform.app.cloud.GeminiProvider") as provider_class:
            provider = provider_class.return_value
            provider.available = True
            provider.review.return_value = review
            result = explain_activity({
                "event_type": "URL",
                "recorded_outcome": "NEEDS_CAUTION",
                "full_url": "https://example.test/account/login?next=wallet#verify",
                "content_scope": "FULL_URL",
            })

        payload = provider.review.call_args.args[0]
        self.assertEqual(
            "https://example.test/account/login?next=wallet#verify",
            payload["full_url"],
        )
        self.assertEqual("FULL_URL", result["analysis_scope"])
        self.assertFalse(result["stored"])
        self.assertTrue(result["full_context_available"])

    def test_minimized_fallback_does_not_invent_missing_url_or_email_content(self) -> None:
        from backend.llm.schemas import LLMReview
        from shared_platform.app.cloud import explain_activity

        review = LLMReview(
            assessment="NEEDS_CAUTION",
            confidence="MEDIUM",
            indicators=[],
            reasoning_summary="Only limited recorded metadata was available.",
            recommended_action="Verify independently.",
        )
        with patch("shared_platform.app.cloud.GeminiProvider") as provider_class:
            provider = provider_class.return_value
            provider.available = True
            provider.review.return_value = review
            result = explain_activity({
                "event_type": "EMAIL",
                "recorded_outcome": "NEEDS_CAUTION",
                "provider": "gmail",
                "sender": "sender@example.test",
                "subject": "Synthetic subject",
                "content_scope": "EMAIL_PROVIDER_SENDER_SUBJECT_ONLY",
            })

        payload = provider.review.call_args.args[0]
        self.assertNotIn("email_body", payload)
        self.assertEqual("EMAIL_PROVIDER_SENDER_SUBJECT_ONLY", result["analysis_scope"])
        self.assertFalse(result["full_context_available"])


if __name__ == "__main__":
    unittest.main()
