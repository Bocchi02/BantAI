from __future__ import annotations

import unittest
import base64
import os
from unittest.mock import MagicMock, patch

import httpx

os.environ["BANTAI_DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["BANTAI_CREATE_SCHEMA"] = "true"
os.environ["BANTAI_COOKIE_SECURE"] = "false"
os.environ["BANTAI_ENCRYPTION_KEY"] = base64.urlsafe_b64encode(b"bantai-test-encryption-key-32byt").decode()

from shared_platform.app.config import settings
from shared_platform.app.detector_gateway import DetectorGateway, DetectorUnavailable


class DetectorGatewayTests(unittest.TestCase):
    def test_timeout_is_privacy_safe_and_uses_configured_limits(self) -> None:
        client = MagicMock()
        client.__enter__.return_value = client
        client.request.side_effect = httpx.ReadTimeout("synthetic timeout")
        with patch("shared_platform.app.detector_gateway.httpx.Client", return_value=client) as factory:
            with self.assertRaisesRegex(DetectorUnavailable, "temporarily unavailable"):
                DetectorGateway().analyze_url("https://synthetic.example.test/path")

        timeout = factory.call_args.kwargs["timeout"]
        self.assertEqual(settings.detector_connect_timeout_seconds, timeout.connect)
        self.assertEqual(settings.detector_inference_timeout_seconds, timeout.read)
        self.assertFalse(factory.call_args.kwargs["trust_env"])

    def test_gateway_forces_cloud_review_and_internal_auth(self) -> None:
        response = MagicMock(status_code=200)
        response.json.return_value = {"fusion": {"final_result": "NO_STRONG_WARNING_SIGNS"}}
        client = MagicMock()
        client.__enter__.return_value = client
        client.request.return_value = response
        with patch("shared_platform.app.detector_gateway.httpx.Client", return_value=client):
            DetectorGateway().analyze_email(
                provider="gmail",
                sender="Synthetic Sender <sender@example.test>",
                subject="Synthetic subject",
                body="Synthetic body",
                current_url="https://mail.google.com/mail/u/0/#inbox/synthetic",
                sender_authentication={"source": "SENDER_DETAILS", "signed_by": "example.test"},
            )

        call = client.request.call_args
        self.assertEqual("POST", call.args[0])
        self.assertTrue(call.args[1].endswith("/analyze-hybrid-email"))
        self.assertEqual(settings.internal_api_key, call.kwargs["headers"]["X-BantAI-Internal-Key"])
        self.assertTrue(call.kwargs["json"]["cloud_ai_review"])
        self.assertEqual("example.test", call.kwargs["json"]["sender_authentication"]["signed_by"])

    def test_readiness_uses_its_short_operational_timeout(self) -> None:
        response = MagicMock(status_code=200)
        response.json.return_value = {"status": "ready"}
        client = MagicMock()
        client.__enter__.return_value = client
        client.request.return_value = response
        with patch("shared_platform.app.detector_gateway.httpx.Client", return_value=client) as factory:
            result = DetectorGateway().readiness()

        self.assertEqual("ready", result["status"])
        timeout = factory.call_args.kwargs["timeout"]
        self.assertEqual(settings.detector_readiness_timeout_seconds, timeout.read)
        self.assertLessEqual(timeout.connect, settings.detector_readiness_timeout_seconds)


if __name__ == "__main__":
    unittest.main()
