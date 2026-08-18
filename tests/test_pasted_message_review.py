from __future__ import annotations

import unittest
from unittest.mock import ANY, patch

from backend.llm.schemas import LLMReview
from shared_platform.app.cloud import PASTED_MESSAGE_MODEL, review_pasted_message


class PastedMessageReviewTests(unittest.TestCase):
    def test_review_uses_exact_flash_lite_model_and_redacts_before_provider(self) -> None:
        raw_message = (
            "Email victim@example.test or call 09171234567 and send OTP 123456 "
            "for account number ABCDEF123456."
        )
        review = LLMReview(
            assessment="SUSPICIOUS_SIGNS_FOUND",
            confidence="HIGH",
            indicators=[{
                "category": "Credential request",
                "severity": "CRITICAL",
                "evidence": "The message requests an OTP.",
            }],
            reasoning_summary="The wording requests sensitive credentials.",
            recommended_action="Do not respond; verify independently.",
        )
        with patch("shared_platform.app.cloud.GeminiProvider") as provider_class:
            provider = provider_class.return_value
            provider.available = True
            provider.review.return_value = review
            result = review_pasted_message(raw_message)

        provider_class.assert_called_once_with(
            api_key=ANY,
            model=PASTED_MESSAGE_MODEL,
            fallback_model="",
        )
        payload = provider.review.call_args.args[0]
        self.assertEqual("PASTED_MESSAGE", payload["analysis_type"])
        self.assertNotIn("victim@example.test", payload["message_text"])
        self.assertNotIn("09171234567", payload["message_text"])
        self.assertNotIn("123456", payload["message_text"])
        self.assertIn("[EMAIL_REDACTED]", payload["message_text"])
        self.assertIn("[PHONE_REDACTED]", payload["message_text"])
        self.assertIn("[OTP_REDACTED]", payload["message_text"])
        self.assertEqual("COMPLETE", result["status"])
        self.assertEqual(PASTED_MESSAGE_MODEL, result["model"])
        self.assertFalse(result["stored"])

    def test_unavailable_review_does_not_echo_the_message(self) -> None:
        raw_message = "Synthetic private message that must not be returned."
        with patch("shared_platform.app.cloud.GeminiProvider") as provider_class:
            provider_class.return_value.available = False
            result = review_pasted_message(raw_message)

        self.assertEqual("UNAVAILABLE", result["status"])
        self.assertNotIn(raw_message, str(result))
        self.assertFalse(result["stored"])


if __name__ == "__main__":
    unittest.main()
