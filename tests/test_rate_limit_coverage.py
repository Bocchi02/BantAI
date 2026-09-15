from __future__ import annotations

import unittest

from shared_platform.app.rate_limit import rate_limit_keys


class RateLimitCoverageTests(unittest.TestCase):
    def test_pairing_creation_has_a_cookie_or_network_bucket(self) -> None:
        keys = rate_limit_keys(
            path="/api/v1/pairing",
            headers={b"cookie": b"bantai_session=synthetic"},
            body=b"",
            client_address="198.51.100.10",
            detection_limit=120,
        )
        self.assertEqual(1, len(keys))
        self.assertEqual(10, keys[0][1])
        self.assertNotIn("bantai_session=synthetic", keys[0][0])


if __name__ == "__main__":
    unittest.main()
