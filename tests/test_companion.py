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

        manager = CompanionManager()
        manager.platform_url = "https://bantai.example.test"
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


if __name__ == "__main__":
    unittest.main()
