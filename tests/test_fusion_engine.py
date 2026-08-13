from __future__ import annotations

import sys
import unittest
from pathlib import Path


BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from fusion_engine import (
    GUIDANCE,
    NEEDS_CAUTION,
    NO_STRONG_WARNING_SIGNS,
    SUSPICIOUS_SIGNS_FOUND,
    fuse_email_signals,
)


CLEAN = {"markers": [], "critical_count": 0, "strong_count": 0, "contextual_count": 0}
STRONG = {
    "markers": [{"category": "URGENCY", "severity": "STRONG", "evidence": "Act now"}],
    "critical_count": 0,
    "strong_count": 1,
    "contextual_count": 0,
}


def llm(assessment: str) -> dict[str, object]:
    return {"status": assessment, "assessment": assessment}


class FusionEngineTests(unittest.TestCase):
    def result(self, email: str, markers: dict, review: dict) -> str:
        return fuse_email_signals(
            email_signal=email,
            local_indicators=markers,
            llm_review=review,
        )["final_result"]

    def test_all_consistently_clean_is_green(self) -> None:
        self.assertEqual(
            self.result("SAFE", CLEAN, llm(NO_STRONG_WARNING_SIGNS)),
            NO_STRONG_WARNING_SIGNS,
        )

    def test_llm_unavailable_still_uses_local_analysis(self) -> None:
        self.assertEqual(self.result("SAFE", CLEAN, {"status": "UNAVAILABLE"}), NO_STRONG_WARNING_SIGNS)
        self.assertEqual(self.result("SUSPICIOUS", CLEAN, {"status": "UNAVAILABLE"}), NEEDS_CAUTION)
        self.assertEqual(self.result("SUSPICIOUS", STRONG, {"status": "UNAVAILABLE"}), SUSPICIOUS_SIGNS_FOUND)

    def test_llm_alone_cannot_produce_red(self) -> None:
        self.assertEqual(
            self.result("SAFE", CLEAN, llm(SUSPICIOUS_SIGNS_FOUND)),
            NEEDS_CAUTION,
        )

    def test_xlmr_and_llm_suspicious_produce_red(self) -> None:
        self.assertEqual(
            self.result("SUSPICIOUS", CLEAN, llm(SUSPICIOUS_SIGNS_FOUND)),
            SUSPICIOUS_SIGNS_FOUND,
        )

    def test_xlmr_and_marker_produce_red(self) -> None:
        self.assertEqual(
            self.result("SUSPICIOUS", STRONG, llm(NO_STRONG_WARNING_SIGNS)),
            SUSPICIOUS_SIGNS_FOUND,
        )

    def test_llm_and_marker_produce_red(self) -> None:
        self.assertEqual(
            self.result("SAFE", STRONG, llm(SUSPICIOUS_SIGNS_FOUND)),
            SUSPICIOUS_SIGNS_FOUND,
        )

    def test_detector_disagreement_is_yellow(self) -> None:
        self.assertEqual(
            self.result("SUSPICIOUS", CLEAN, llm(NO_STRONG_WARNING_SIGNS)),
            NEEDS_CAUTION,
        )

    def test_safe_mail_url_cannot_downgrade_email_fusion(self) -> None:
        # Website state is deliberately absent from the fusion function signature.
        result = self.result("SUSPICIOUS", STRONG, {"status": "UNAVAILABLE"})
        self.assertEqual(result, SUSPICIOUS_SIGNS_FOUND)

    def test_visible_decisions_are_concise_and_do_not_name_fusion_sources(self) -> None:
        for final_result, message in GUIDANCE.items():
            with self.subTest(final_result=final_result):
                self.assertLessEqual(message.count("."), 2)
                normalized = message.lower()
                self.assertNotIn("model", normalized)
                self.assertNotIn("cloud", normalized)
                self.assertNotIn("combined", normalized)

    def test_visible_warning_names_the_detected_email_behavior(self) -> None:
        otp_markers = {
            "markers": [
                {
                    "category": "OTP_REQUEST",
                    "severity": "CRITICAL",
                    "evidence": "Send the verification code.",
                }
            ],
            "critical_count": 1,
            "strong_count": 0,
            "contextual_count": 0,
        }
        result = fuse_email_signals(
            email_signal="SUSPICIOUS",
            local_indicators=otp_markers,
            llm_review=llm(NO_STRONG_WARNING_SIGNS),
        )
        self.assertEqual(result["final_result"], SUSPICIOUS_SIGNS_FOUND)
        self.assertIn("asks for an OTP", result["message"])
        self.assertIn("official channel", result["message"])
        self.assertLessEqual(result["message"].count("."), 2)

    def test_caution_explains_when_no_specific_indicator_is_available(self) -> None:
        result = fuse_email_signals(
            email_signal="SUSPICIOUS",
            local_indicators=CLEAN,
            llm_review=llm(NO_STRONG_WARNING_SIGNS),
        )
        self.assertIn("suspicious language patterns", result["message"])
        self.assertLessEqual(result["message"].count("."), 2)


if __name__ == "__main__":
    unittest.main()
