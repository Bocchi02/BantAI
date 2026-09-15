from __future__ import annotations

import sys
import time
import unittest
from pathlib import Path

from fastapi.testclient import TestClient
from pydantic import ValidationError


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

import server  # noqa: E402
from prepare_bantai_dataset import normalized_hostname, parse_valid_url  # noqa: E402


class DetectorInputBoundsTests(unittest.TestCase):
    def test_email_request_rejects_oversized_fields_before_inference(self) -> None:
        with self.assertRaises(ValidationError):
            server.EmailAnalysisRequest(
                provider="gmail",
                sender="s" * 321,
                subject="Synthetic",
                body="Synthetic body",
            )
        with self.assertRaises(ValidationError):
            server.EmailAnalysisRequest(
                provider="gmail",
                subject="s" * 501,
                body="Synthetic body",
            )
        with self.assertRaises(ValidationError):
            server.EmailAnalysisRequest(
                provider="gmail",
                subject="Synthetic",
                body="b" * 50_001,
            )

    def test_asgi_boundary_rejects_oversized_body_before_routing(self) -> None:
        client = TestClient(server.app)
        response = client.post("/not-a-route", content=b"x" * (server.MAX_REQUEST_BYTES + 1))
        self.assertEqual(413, response.status_code)
        self.assertEqual({"detail": "Request is too large."}, response.json())

    def test_bounded_pathological_idna_is_rejected_quickly(self) -> None:
        """A bounded Unicode label must not trigger unbounded IDNA work."""
        hostile_host = ("\u2603" * 40) + ".example"
        started = time.perf_counter()
        normalized = normalized_hostname(hostile_host)
        parsed = parse_valid_url(f"https://{hostile_host}/")
        elapsed = time.perf_counter() - started
        self.assertFalse(normalized[0])
        self.assertFalse(parsed["valid"])
        self.assertLess(elapsed, 1.0)


if __name__ == "__main__":
    unittest.main()
