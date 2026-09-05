from __future__ import annotations

import sys
import unittest
from pathlib import Path


BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from llm.redaction import (
    prepare_cloud_payload,
    prepare_url_cloud_payload,
    redact_text,
    truncate_preserving_ends,
)


class RedactionTests(unittest.TestCase):
    def test_otp_value_is_removed_but_context_remains(self) -> None:
        redacted = redact_text("Send the OTP 182944 to confirm your GCash account.")
        self.assertIn("OTP", redacted)
        self.assertIn("[OTP_REDACTED]", redacted)
        self.assertNotIn("182944", redacted)
        self.assertIn("GCash account", redacted)

    def test_payload_minimizes_sender_and_url(self) -> None:
        payload = prepare_cloud_payload(
            provider="gmail",
            sender="Juan Dela Cruz <juan.private@example.com>",
            subject="Account 12345678",
            body="Email me at juan.private@example.com or call 09171234567.",
            current_url="https://mail.google.com/mail/u/0/#inbox/abcdef12345678901234567890",
            email_model={"signal": "SAFE", "suspicious_probability": 0.004321},
            url_model={"signal": "SAFE", "suspicious_probability": 0.012345},
            local_indicators={"markers": [], "critical_count": 0, "strong_count": 0},
        )
        self.assertEqual(payload["sender_domain"], "example.com")
        self.assertNotIn("juan.private@example.com", str(payload))
        self.assertNotIn("09171234567", str(payload))
        self.assertNotIn("#inbox", payload["current_address_bar_url"])

    def test_truncation_preserves_both_ends(self) -> None:
        text = "BEGIN-" + ("x" * 1000) + "-END"
        shortened = truncate_preserving_ends(text, 500)
        self.assertTrue(shortened.startswith("BEGIN-"))
        self.assertTrue(shortened.endswith("-END"))
        self.assertIn("TRUNCATED FOR DATA MINIMIZATION", shortened)

    def test_url_cloud_payload_keeps_origin_and_drops_browsing_path(self) -> None:
        payload = prepare_url_cloud_payload(
            current_url="https://www.facebook.com/messages/t/private-thread?token=secret",
            hostname="www.facebook.com",
            url_model={
                "signal": "SUSPICIOUS",
                "suspicious_probability": 0.91,
                "threshold": 0.547,
            },
        )
        self.assertEqual(payload["address_origin"], "https://www.facebook.com/")
        self.assertNotIn("private-thread", str(payload))
        self.assertNotIn("secret", str(payload))
        self.assertFalse(payload["page_content_shared"])


if __name__ == "__main__":
    unittest.main()
