from __future__ import annotations

import sys
import unittest
from pathlib import Path


BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from scam_indicator_engine import analyze_scam_indicators


class IndicatorEngineTests(unittest.TestCase):
    def categories(self, body: str) -> set[str]:
        result = analyze_scam_indicators(body=body)
        return {marker["category"] for marker in result["markers"]}

    def test_protective_otp_advice_is_not_a_request(self) -> None:
        self.assertNotIn(
            "OTP_REQUEST",
            self.categories("Never share your OTP with anyone."),
        )

    def test_request_for_otp_is_critical(self) -> None:
        result = analyze_scam_indicators(
            body="Send us your OTP 182944 to verify your GCash account."
        )
        otp = next(marker for marker in result["markers"] if marker["category"] == "OTP_REQUEST")
        self.assertEqual(otp["severity"], "CRITICAL")
        self.assertNotIn("182944", otp["evidence"])

    def test_tagalog_or_taglish_style_alone_is_not_suspicious(self) -> None:
        result = analyze_scam_indicators(
            subject="Kumusta po",
            body="Magandang araw po! Salamat sa tulong kahapon. Ingat palagi 😊",
        )
        self.assertEqual(result["markers"], [])
        self.assertEqual(result["critical_count"], 0)
        self.assertEqual(result["strong_count"], 0)

    def test_routine_payment_request_is_contextual_not_strong(self) -> None:
        result = analyze_scam_indicators(
            subject="Your bill is due soon",
            body="Pay your payment balance through the official account portal.",
        )
        payment = next(
            marker
            for marker in result["markers"]
            if marker["category"] == "PAYMENT_REQUEST"
        )
        self.assertEqual(payment["severity"], "CONTEXTUAL")
        self.assertEqual(result["strong_count"], 0)

    def test_received_transfer_notice_is_not_a_payment_request(self) -> None:
        result = analyze_scam_indicators(
            subject="MariBank Transfer Notification",
            body=(
                "You have received a funds transfer to your account. "
                "Transfer from: G-Xchange / GCash - 6920 "
                "Transfer to: Customer - 7859 "
                "Transfer amount: PHP 300.00. "
                "Please save this email as reference for your transaction."
            ),
        )
        categories = {marker["category"] for marker in result["markers"]}
        self.assertNotIn("PAYMENT_REQUEST", categories)

    def test_advance_fee_request_remains_strong(self) -> None:
        result = analyze_scam_indicators(
            body="Pay the processing fee before you can claim your reward.",
        )
        advance_fee = next(
            marker
            for marker in result["markers"]
            if marker["category"] == "ADVANCE_FEE"
        )
        self.assertEqual(advance_fee["severity"], "STRONG")


if __name__ == "__main__":
    unittest.main()
