from __future__ import annotations

import sys
import unittest
from pathlib import Path


BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from url_fusion_engine import (
    NEEDS_CAUTION,
    NO_STRONG_WARNING_SIGNS,
    SUSPICIOUS_SIGNS_FOUND,
    fuse_url_signals,
)


class UrlFusionEngineTests(unittest.TestCase):
    def assert_concise_neutral_message(self, result: dict[str, str]) -> None:
        message = result["message"]
        self.assertLessEqual(message.count("."), 2)
        normalized = message.lower()
        self.assertNotIn("cloud", normalized)
        self.assertNotIn("model", normalized)
        self.assertNotIn("combined", normalized)

    def test_local_safe_remains_no_strong_warning_signs(self) -> None:
        result = fuse_url_signals(url_signal="SAFE", llm_review={"status": "OFF"})
        self.assertEqual(result["final_result"], NO_STRONG_WARNING_SIGNS)
        self.assertIn("address structure", result["message"])
        self.assert_concise_neutral_message(result)

    def test_high_confidence_clean_cloud_review_can_produce_green(self) -> None:
        result = fuse_url_signals(
            url_signal="SUSPICIOUS",
            llm_review={
                "status": NO_STRONG_WARNING_SIGNS,
                "assessment": NO_STRONG_WARNING_SIGNS,
                "confidence": "HIGH",
                "indicators": [],
            },
        )
        self.assertEqual(result["final_result"], NO_STRONG_WARNING_SIGNS)
        self.assertIn("typosquatting", result["message"])
        self.assert_concise_neutral_message(result)

    def test_medium_confidence_clean_review_remains_caution(self) -> None:
        result = fuse_url_signals(
            url_signal="SUSPICIOUS",
            llm_review={
                "status": NO_STRONG_WARNING_SIGNS,
                "assessment": NO_STRONG_WARNING_SIGNS,
                "confidence": "MEDIUM",
                "indicators": [],
            },
        )
        self.assertEqual(result["final_result"], NEEDS_CAUTION)
        self.assert_concise_neutral_message(result)

    def test_unavailable_ai_preserves_local_warning(self) -> None:
        result = fuse_url_signals(
            url_signal="SUSPICIOUS",
            llm_review={"status": "UNAVAILABLE"},
        )
        self.assertEqual(result["final_result"], SUSPICIOUS_SIGNS_FOUND)

    def test_corroborated_warning_remains_suspicious(self) -> None:
        result = fuse_url_signals(
            url_signal="SUSPICIOUS",
            llm_review={
                "status": SUSPICIOUS_SIGNS_FOUND,
                "assessment": SUSPICIOUS_SIGNS_FOUND,
                "indicators": [
                    {
                        "category": "BRAND_IMPERSONATION",
                        "severity": "STRONG",
                        "evidence": "The hostname resembles a known brand.",
                    }
                ],
            },
        )
        self.assertEqual(result["final_result"], SUSPICIOUS_SIGNS_FOUND)
        self.assertIn("trusted brand or service", result["message"])
        self.assert_concise_neutral_message(result)


if __name__ == "__main__":
    unittest.main()
