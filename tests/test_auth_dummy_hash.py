from __future__ import annotations

import unittest

from shared_platform.app.security import DUMMY_PASSWORD_HASH, verify_password


class DummyHashTests(unittest.TestCase):
    def test_dummy_hash_uses_frozen_password_hasher_and_rejects_synthetic_password(self) -> None:
        self.assertIn("argon2id", DUMMY_PASSWORD_HASH)
        self.assertIn("m=65536,t=3,p=2", DUMMY_PASSWORD_HASH)
        self.assertFalse(verify_password(DUMMY_PASSWORD_HASH, "not-the-dummy-password"))


if __name__ == "__main__":
    unittest.main()
