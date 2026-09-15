from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

import server


class HybridPartialFailureTests(unittest.TestCase):
    def test_companion_rejects_failure_metadata_that_would_poison_the_outbox(self) -> None:
        base = {
            "client_event_id": "synthetic-url-event-0001",
            "event_type": "URL",
            "origin": "https://example.test",
            "outcome": "NO_STRONG_WARNING_SIGNS",
            "occurred_at": "2026-09-06T00:00:00Z",
        }

        unavailable = server.CompanionActivityRequest(**base, cloud_status="UNAVAILABLE")
        self.assertEqual("UNSPECIFIED", unavailable.cloud_failure_category)

        with self.assertRaises(ValueError):
            server.CompanionActivityRequest(
                **base,
                cloud_status="COMPLETE",
                cloud_failure_category="PROVIDER_TIMEOUT",
            )
        with self.assertRaises(ValueError):
            server.CompanionActivityRequest(
                **base,
                cloud_status="UNAVAILABLE",
                cloud_failure_category="raw provider detail",
            )

    def test_url_failure_preserves_local_email_and_still_requests_cloud_review(self) -> None:
        email_result = server.EmailAnalysisResponse(
            analysis_id="synthetic-email-analysis",
            detector="SUPPORTED_EMAIL_CONTENT",
            provider="gmail",
            sender="sender@example.test",
            subject="Synthetic notice",
            signal="SAFE",
            predicted_label="legitimate",
            is_suspicious=False,
            model_version="full_taglish_xlmr_512_headtail_seed13",
            calibration_method="temperature_scaling",
            temperature=2.2198894341340183,
            suspicious_probability=0.1,
            safe_probability=0.9,
            threshold=0.6923658179915227,
            max_length=512,
            original_token_count=20,
            analyzed_token_count=20,
            was_truncated=False,
            inference_ms=4.0,
            device="cpu",
            message="No strong suspicious language was detected; this is not a guarantee.",
        )
        indicators = {
            "markers": [],
            "critical_count": 0,
            "strong_count": 0,
            "contextual_count": 0,
        }
        unavailable_cloud = {
            "enabled": True,
            "status": "UNAVAILABLE",
            "assessment": None,
            "indicators": [],
            "reasoning_summary": "Cloud review is temporarily unavailable.",
            "recommended_action": "Use the local result.",
            "failure_reason": "PROVIDER_TIMEOUT",
        }
        request = server.HybridEmailAnalysisRequest(
            provider="gmail",
            sender="sender@example.test",
            subject="Synthetic notice",
            body="This synthetic message contains no real personal content.",
            current_url="https://mail.google.com/mail/u/0/#inbox/synthetic",
            cloud_ai_review=True,
        )

        with patch.object(server.local_email_analysis_cache, "get", return_value=None), patch.object(
            server.local_email_analysis_cache,
            "set",
        ), patch.object(server, "analyze_email", return_value=email_result), patch.object(
            server,
            "analyze_scam_indicators",
            return_value=indicators,
        ), patch.object(server, "analyze_url", side_effect=RuntimeError("synthetic URL failure")) as url_review, patch.object(
            server.llm_coordinator,
            "review_email",
            return_value=unavailable_cloud,
        ) as cloud_review, patch.object(server.companion_manager, "remember_detail_context"):
            result = server.analyze_hybrid_email(request)

        self.assertEqual("SAFE", result.email_model.signal)
        self.assertEqual("UNAVAILABLE", result.url_model["signal"])
        self.assertEqual("URL_ANALYSIS_UNAVAILABLE", result.url_model["failure_reason"])
        self.assertEqual("UNAVAILABLE", result.llm_review["status"])
        self.assertEqual("NO_STRONG_WARNING_SIGNS", result.fusion["final_result"])
        self.assertNotIn("current website", result.fusion["supporting_sources"])
        cloud_review.assert_called_once()
        self.assertTrue(url_review.call_args.args[0].cloud_ai_review)
        self.assertEqual(request.current_url, url_review.call_args.args[0].url)


if __name__ == "__main__":
    unittest.main()
