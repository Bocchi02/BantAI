from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))

from companion import CompanionManager


class CompanionManagerTests(unittest.TestCase):
    def test_automatic_training_sampling_only_forwards_randomly_selected_content(self) -> None:
        sample = {
            "client_event_id": "automatic-url-sample-0001",
            "event_type": "URL",
            "url": "https://example.test/complete/path",
            "outcome": "NEEDS_CAUTION",
            "occurred_at": "2026-08-25T10:00:00+08:00",
        }
        manager = CompanionManager()
        manager._training_consent_cache = {
            "expires_at": float("inf"),
            "enabled": True,
            "sample_rate_percent": 10,
        }
        with patch("companion.secrets.randbelow", return_value=999), patch.object(
            manager, "_request", return_value={"accepted": True, "duplicate": False}
        ) as request:
            selected = manager.submit_automatic_training_sample(sample)
        self.assertTrue(selected["selected"])
        self.assertTrue(selected["submitted"])
        request.assert_called_once_with("/training-samples", sample)

        with patch("companion.secrets.randbelow", return_value=1000), patch.object(manager, "_request") as request:
            skipped = manager.submit_automatic_training_sample(sample)
        self.assertFalse(skipped["selected"])
        self.assertEqual("NOT_SELECTED", skipped["reason"])
        request.assert_not_called()

    def test_windows_pairing_falls_back_to_dpapi_when_credential_manager_is_unavailable(self) -> None:
        pairing_result = {
            "device_id": "device-win",
            "device_token": "synthetic-windows-device-token",
            "user_email": "user@example.test",
        }

        def protect(value: bytes) -> bytes:
            return b"dpapi-protected:" + value[::-1]

        def unprotect(value: bytes) -> bytes:
            self.assertTrue(value.startswith(b"dpapi-protected:"))
            return value.removeprefix(b"dpapi-protected:")[::-1]

        with tempfile.TemporaryDirectory() as temporary_directory:
            with patch("companion.platform.system", return_value="Windows"), patch(
                "companion._protect", side_effect=protect
            ), patch("companion._unprotect", side_effect=unprotect), patch(
                "companion.keyring"
            ) as windows_keyring:
                windows_keyring.set_password.side_effect = OSError(1312, "Credential Manager unavailable")
                windows_keyring.get_password.side_effect = OSError(1312, "Credential Manager unavailable")
                manager = CompanionManager()
                manager.platform_url = "https://bantai.example.test"
                manager.state_path = Path(temporary_directory) / "companion.dat"
                with patch.object(manager, "_request", return_value=pairing_result):
                    status = manager.pair("ABCD1234", "Windows computer")
                state = manager._load()
                stored_text = manager.state_path.read_text()

        self.assertTrue(status["paired"])
        self.assertEqual("WINDOWS_DPAPI", status["credential_protection"])
        self.assertEqual("synthetic-windows-device-token", state["device_token"])
        self.assertNotIn("synthetic-windows-device-token", stored_text)

    def test_detection_access_requires_an_authenticated_paired_device(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            with patch("companion.platform.system", return_value="Linux"):
                manager = CompanionManager()
                manager.platform_url = "https://bantai.example.test"
                manager.state_path = Path(temporary_directory) / "companion.dat"
                manager._save(
                    {
                        "device_id": "device-1",
                        "device_token": "synthetic-device-token",
                        "device_label": "Test computer",
                        "user_email": "user@example.test",
                        "outbox": [],
                    }
                )

                with patch.object(
                    manager,
                    "platform_status",
                    return_value={
                        "reachable": True,
                        "device_authenticated": True,
                        "cloud_ai_configured": True,
                        "cloud_ai_available": True,
                    },
                ):
                    authenticated = manager.access_status()

                with patch.object(
                    manager,
                    "platform_status",
                    return_value={
                        "reachable": False,
                        "device_authenticated": False,
                        "cloud_ai_configured": False,
                        "cloud_ai_available": False,
                    },
                ):
                    temporarily_offline = manager.access_status()

                manager.unpair()
                with patch.object(manager, "platform_status") as platform_status:
                    unpaired = manager.access_status()

        self.assertTrue(authenticated["detection_enabled"])
        self.assertTrue(authenticated["authenticated"])
        self.assertTrue(temporarily_offline["detection_enabled"])
        self.assertIn("Local detection is available", temporarily_offline["access_message"])
        self.assertFalse(unpaired["detection_enabled"])
        self.assertFalse(unpaired["authenticated"])
        platform_status.assert_not_called()

    def test_platform_status_validates_the_paired_device_credential(self) -> None:
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            @staticmethod
            def read() -> bytes:
                return b'{"connected":true,"cloud_ai":{"configured":true,"available":true}}'

        with tempfile.TemporaryDirectory() as temporary_directory:
            with patch("companion.platform.system", return_value="Linux"):
                manager = CompanionManager()
                manager.platform_url = "https://bantai.example.test"
                manager.state_path = Path(temporary_directory) / "companion.dat"
                manager._save(
                    {
                        "device_id": "device-1",
                        "device_token": "synthetic-device-token",
                        "device_label": "Test computer",
                        "user_email": "user@example.test",
                        "outbox": [],
                    }
                )
                with patch("companion.urllib.request.urlopen", return_value=Response()) as urlopen:
                    status = manager.platform_status()

        self.assertTrue(status["reachable"])
        self.assertTrue(status["device_authenticated"])
        request = urlopen.call_args.args[0]
        self.assertEqual("https://bantai.example.test/api/v1/device-status", request.full_url)
        self.assertEqual("Bearer synthetic-device-token", request.get_header("Authorization"))

    def test_platform_status_reports_cloud_readiness_without_a_review(self) -> None:
        class Response:
            def __enter__(self):
                return self

            def __exit__(self, *_):
                return False

            @staticmethod
            def read() -> bytes:
                return b'{"status":"ok","cloud_ai":{"configured":true,"available":true}}'

        with tempfile.TemporaryDirectory() as temporary_directory:
            with patch("companion.platform.system", return_value="Linux"):
                manager = CompanionManager()
                manager.platform_url = "https://bantai.example.test"
                manager.state_path = Path(temporary_directory) / "companion.dat"
                with patch("companion.urllib.request.urlopen", return_value=Response()) as urlopen:
                    status = manager.platform_status()

        self.assertEqual(
            {
                "reachable": True,
                "device_authenticated": False,
                "cloud_ai_configured": True,
                "cloud_ai_available": True,
            },
            status,
        )
        request = urlopen.call_args.args[0]
        self.assertEqual("GET", request.method)
        self.assertEqual("https://bantai.example.test/health", request.full_url)
        self.assertNotIn("Authorization", dict(request.header_items()))

    def test_unpair_removes_credential_and_old_account_outbox(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            with patch("companion.platform.system", return_value="Linux"):
                manager = CompanionManager()
                manager.state_path = Path(temporary_directory) / "companion.dat"
                manager._save(
                    {
                        "device_id": "device-1",
                        "device_token": "secret-device-token",
                        "device_label": "Test computer",
                        "user_email": "user@example.test",
                        "outbox": [{"client_event_id": "event-1"}],
                    }
                )

                status = manager.unpair()

                self.assertFalse(status["paired"])
                self.assertIsNone(status["device_id"])
                self.assertEqual(0, status["queued_events"])
                self.assertNotIn("secret-device-token", manager.state_path.read_text())

    def test_explicit_url_feedback_flushes_activity_before_forwarding(self) -> None:
        feedback = {
            "client_event_id": "url:1:abc:123456",
            "url": "https://example.test/account/review",
            "verdict": "CORRECT",
            "confirmed": True,
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            with patch("companion.platform.system", return_value="Linux"):
                manager = CompanionManager()
                manager.platform_url = "https://bantai.example.test"
                manager.state_path = Path(temporary_directory) / "companion.dat"
                manager._save(
                    {
                        "device_id": "device-1",
                        "device_token": "synthetic-device-token",
                        "device_label": "Test computer",
                        "user_email": "user@example.test",
                        "outbox": [{"client_event_id": feedback["client_event_id"]}],
                    }
                )
                with patch.object(
                    manager,
                    "flush",
                    return_value={"submitted": True, "queued": False, "remaining": 0},
                ) as flush, patch.object(
                    manager,
                    "_request",
                    return_value={"already_submitted": False},
                ) as request:
                    result = manager.submit_url_feedback(feedback)

        flush.assert_called_once_with()
        request.assert_called_once_with("/url-reports/from-device-activity", feedback)
        self.assertFalse(result["already_submitted"])

    def test_explicit_email_feedback_flushes_activity_before_forwarding(self) -> None:
        feedback = {
            "client_event_id": "email:1:abc:123456",
            "provider": "gmail",
            "sender": "sender@example.test",
            "subject": "Synthetic email",
            "body": "Synthetic body for extension feedback.",
            "verdict": "CORRECT",
            "confirmed": True,
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            with patch("companion.platform.system", return_value="Linux"):
                manager = CompanionManager()
                manager.platform_url = "https://bantai.example.test"
                manager.state_path = Path(temporary_directory) / "companion.dat"
                manager._save(
                    {
                        "device_id": "device-1",
                        "device_token": "synthetic-device-token",
                        "device_label": "Test computer",
                        "user_email": "user@example.test",
                        "outbox": [{"client_event_id": feedback["client_event_id"]}],
                    }
                )
                with patch.object(
                    manager,
                    "flush",
                    return_value={"submitted": True, "queued": False, "remaining": 0},
                ) as flush, patch.object(
                    manager,
                    "_request",
                    return_value={"already_submitted": False},
                ) as request:
                    result = manager.submit_email_feedback(feedback)

        flush.assert_called_once_with()
        request.assert_called_once_with("/email-reports/from-device-activity", feedback)
        self.assertFalse(result["already_submitted"])

    def test_activity_explanation_context_is_memory_only_and_forwarded_on_demand(self) -> None:
        context = {
            "client_event_id": "email:1:details:123456",
            "event_type": "EMAIL",
            "provider": "gmail",
            "sender": "sender@example.test",
            "subject": "Synthetic security notice",
            "body": "Paki-send ang OTP ngayon.",
            "outcome": "SUSPICIOUS_SIGNS_FOUND",
        }
        with tempfile.TemporaryDirectory() as temporary_directory:
            with patch("companion.platform.system", return_value="Linux"):
                manager = CompanionManager()
                manager.platform_url = "https://bantai.example.test"
                manager.state_path = Path(temporary_directory) / "companion.dat"
                manager._save(
                    {
                        "device_id": "device-1",
                        "device_token": "synthetic-device-token",
                        "device_label": "Test computer",
                        "user_email": "user@example.test",
                        "outbox": [],
                    }
                )
                remembered = manager.remember_detail_context(context)
                self.assertTrue(remembered["remembered"])
                self.assertFalse(remembered["stored"])
                self.assertNotIn("Paki-send", manager.state_path.read_text())

                with patch.object(
                    manager,
                    "_request",
                    return_value={"status": "COMPLETE", "stored": False},
                ) as request:
                    result = manager.explain_activity(
                        "00000000-0000-0000-0000-000000000001",
                        context["client_event_id"],
                    )

        self.assertEqual("COMPLETE", result["status"])
        forwarded = request.call_args.args[1]
        self.assertEqual("/cloud-review/activity-explanation", request.call_args.args[0])
        self.assertEqual(context["body"], forwarded["body"])
        self.assertEqual("00000000-0000-0000-0000-000000000001", forwarded["activity_id"])

    def test_activity_explanation_falls_back_when_context_is_lost_after_restart(self) -> None:
        manager = CompanionManager()
        with patch.object(
            manager,
            "_request",
            return_value={
                "status": "COMPLETE",
                "analysis_scope": "WEBSITE_ORIGIN_ONLY",
                "full_context_available": False,
            },
        ) as request:
            result = manager.explain_activity(
                "00000000-0000-0000-0000-000000000001",
                "missing-context-123456",
            )
        request.assert_called_once_with(
            "/cloud-review/activity-explanation-fallback",
            {
                "activity_id": "00000000-0000-0000-0000-000000000001",
                "client_event_id": "missing-context-123456",
            },
        )
        self.assertFalse(result["full_context_available"])


if __name__ == "__main__":
    unittest.main()
