from __future__ import annotations

import json
import logging
import unittest

from shared_platform.app.security_events import emit


class _Capture(logging.Handler):
    def __init__(self) -> None:
        super().__init__()
        self.messages: list[str] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.messages.append(record.getMessage())


class SecurityEventTests(unittest.TestCase):
    def test_event_payload_is_bounded_and_opaque(self) -> None:
        handler = _Capture()
        logger = logging.getLogger("bantai.security")
        logger.addHandler(handler)
        previous_level = logger.level
        logger.setLevel(logging.INFO)
        try:
            emit(
                "AUTH_LOGIN_FAILURE",
                outcome="rejected",
                principal="person@example.test",
                request_id="0123456789abcdef0123456789abcdef",
                reason="invalid_credentials",
            )
        finally:
            logger.removeHandler(handler)
            logger.setLevel(previous_level)
        self.assertEqual(1, len(handler.messages))
        self.assertNotIn("person@example.test", handler.messages[0])
        payload = json.loads(handler.messages[0])
        self.assertEqual("AUTH_LOGIN_FAILURE", payload["event_code"])
        self.assertEqual("rejected", payload["outcome"])
        self.assertRegex(payload["principal_id"], r"^[0-9a-f]{24}$")
        self.assertRegex(payload["request_id"], r"^[0-9a-f]{24}$")

    def test_invalid_event_categories_are_dropped_without_raising(self) -> None:
        emit("NOT_A_REAL_EVENT", outcome="accepted", reason="raw secret value")
        emit("AUTH_LOGIN_SUCCESS", outcome="raw email@example.test")


if __name__ == "__main__":
    unittest.main()
