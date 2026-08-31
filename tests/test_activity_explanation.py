from __future__ import annotations

import unittest
from unittest.mock import patch


class ActivityExplanationTests(unittest.TestCase):
    def test_incoming_transfer_cloud_review_cannot_claim_it_requests_money(self) -> None:
        from backend.llm.schemas import LLMReview
        from shared_platform.app.cloud import review

        inaccurate = LLMReview(
            assessment="NEEDS_CAUTION",
            confidence="MEDIUM",
            indicators=[{
                "category": "PAYMENT_REQUEST",
                "severity": "CONTEXTUAL",
                "evidence": "The message discusses a transfer.",
            }],
            reasoning_summary="The email asks you to send money.",
            recommended_action="Do not send money.",
        )
        with patch("shared_platform.app.cloud.GeminiProvider") as provider_class:
            provider = provider_class.return_value
            provider.available = True
            provider.review.return_value = inaccurate
            result = review({
                "analysis_type": "EMAIL_CONTEXT",
                "email_context": (
                    "You have received a funds transfer to your account. "
                    "Transfer from: GCash Transfer to: Customer Transfer amount: PHP 300.00"
                ),
            })

        self.assertEqual([], result["indicators"])
        self.assertIn("incoming transfer", result["reasoning_summary"])
        self.assertNotIn("asks you to send money", result["reasoning_summary"])

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
        self.assertTrue(result["body_context_sent_to_provider"])

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
        self.assertFalse(result["body_context_sent_to_provider"])

    def test_email_redaction_placeholder_is_not_shown_as_sender_evidence(self) -> None:
        from backend.llm.schemas import LLMReview
        from shared_platform.app.cloud import explain_activity

        review = LLMReview(
            assessment="NEEDS_CAUTION",
            confidence="MEDIUM",
            indicators=[
                {
                    "category": "Unverified Sender Identity",
                    "severity": "CONTEXTUAL",
                    "evidence": "Sender address '[EMAIL_REDACTED]' is redacted and cannot be verified.",
                },
                {
                    "category": "Financial Notification Context",
                    "severity": "CONTEXTUAL",
                    "evidence": "The subject refers to an unexpected incoming transfer.",
                },
            ],
            reasoning_summary="The sender [EMAIL_REDACTED] could not be checked.",
            recommended_action="Do not reply to [EMAIL_REDACTED]; verify in the official app.",
        )
        with patch("shared_platform.app.cloud.GeminiProvider") as provider_class:
            provider = provider_class.return_value
            provider.available = True
            provider.review.return_value = review
            result = explain_activity({
                "event_type": "EMAIL",
                "recorded_outcome": "NEEDS_CAUTION",
                "provider": "gmail",
                "sender": "synthetic.sender@example.test",
                "subject": "Successful Incoming Transfer",
                "email_body": "A transfer was received.",
                "content_scope": "EMAIL_PROVIDER_SENDER_SUBJECT_BODY",
            })

        self.assertEqual(1, len(result["indicators"]))
        self.assertEqual("Financial Notification Context", result["indicators"][0]["category"])
        self.assertNotIn("EMAIL_REDACTED", str(result))
        self.assertIn("email address hidden for privacy", result["reasoning_summary"])

    def test_full_email_context_is_not_described_as_a_redacted_body(self) -> None:
        from backend.llm.schemas import LLMReview
        from shared_platform.app.cloud import explain_activity

        review = LLMReview(
            assessment="NEEDS_CAUTION",
            confidence="MEDIUM",
            indicators=[],
            reasoning_summary="The sender details and message body are redacted, so the request cannot be checked.",
            recommended_action="Verify the request in the official app.",
        )
        with patch("shared_platform.app.cloud.GeminiProvider") as provider_class:
            provider = provider_class.return_value
            provider.available = True
            provider.review.return_value = review
            result = explain_activity({
                "event_type": "EMAIL",
                "recorded_outcome": "NEEDS_CAUTION",
                "provider": "gmail",
                "sender": "synthetic.sender@example.test",
                "subject": "Account recovery request",
                "email_body": "Paki-verify ang request sa official app.",
                "content_scope": "EMAIL_PROVIDER_SENDER_SUBJECT_BODY",
            })

        self.assertNotIn("body are redacted", result["reasoning_summary"].lower())
        self.assertIn("personal identifiers were protected", result["reasoning_summary"])

    def test_missing_email_body_is_described_as_unavailable_not_redacted(self) -> None:
        from backend.llm.schemas import LLMReview
        from shared_platform.app.cloud import explain_activity

        review = LLMReview(
            assessment="NEEDS_CAUTION",
            confidence="MEDIUM",
            indicators=[],
            reasoning_summary="The sender details and message body are redacted, so legitimacy cannot be verified.",
            recommended_action="Verify the request in the official app.",
        )
        with patch("shared_platform.app.cloud.GeminiProvider") as provider_class:
            provider = provider_class.return_value
            provider.available = True
            provider.review.return_value = review
            result = explain_activity({
                "event_type": "EMAIL",
                "recorded_outcome": "NEEDS_CAUTION",
                "provider": "gmail",
                "sender": "synthetic.sender@example.test",
                "subject": "Account recovery request",
                "content_scope": "EMAIL_PROVIDER_SENDER_SUBJECT_ONLY",
            })

        self.assertNotIn("body are redacted", result["reasoning_summary"].lower())
        self.assertIn("temporary message text was unavailable", result["reasoning_summary"])


if __name__ == "__main__":
    unittest.main()
