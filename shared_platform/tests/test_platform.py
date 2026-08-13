from __future__ import annotations

import base64
import os
import unittest
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit
from unittest.mock import patch


os.environ["BANTAI_DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["BANTAI_CREATE_SCHEMA"] = "true"
os.environ["BANTAI_COOKIE_SECURE"] = "false"
os.environ["BANTAI_ENCRYPTION_KEY"] = base64.urlsafe_b64encode(b"bantai-test-encryption-key-32byt").decode()

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from shared_platform.app.database import Base, SessionLocal, engine
from shared_platform.app.main import app, cleanup_expired
from shared_platform.app.models import ActivityEvent, PairedDevice, PairingCode, User, UserRole, UserStatus, utcnow
from shared_platform.app.security import decrypt_text, encrypt_text, hash_password, token_hash


class PlatformTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        Base.metadata.create_all(bind=engine)

    def setUp(self) -> None:
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        with SessionLocal() as db:
            self.user = User(
                email="user@example.com",
                first_name="Sample",
                middle_name=None,
                last_name="User",
                password_hash=hash_password("correct horse battery staple"),
                status=UserStatus.ACTIVE,
                verified_at=utcnow(),
            )
            self.admin = User(
                email="admin@example.com",
                first_name="Admin",
                middle_name="Test",
                last_name="User",
                password_hash=hash_password("admin correct horse battery"),
                status=UserStatus.ACTIVE,
                role=UserRole.ADMIN,
                verified_at=utcnow(),
            )
            db.add_all([self.user, self.admin])
            db.commit()
            self.user_id = self.user.id
            self.admin_id = self.admin.id
        self.client = TestClient(app)

    def login(self, email: str, password: str) -> None:
        response = self.client.post("/api/v1/auth/login", json={"email": email, "password": password})
        self.assertEqual(200, response.status_code, response.text)

    def csrf(self) -> dict[str, str]:
        return {"X-CSRF-Token": self.client.cookies.get("bantai_csrf")}

    def paired_device_token(self) -> str:
        code = "BANTAI24"
        with SessionLocal() as db:
            db.add(PairingCode(user_id=self.user_id, code_hash=token_hash(code), expires_at=datetime(2099, 1, 1, tzinfo=timezone.utc)))
            db.commit()
        response = self.client.post("/api/v1/pairing/consume", json={"code": code, "device_label": "Test computer"})
        self.assertEqual(200, response.status_code, response.text)
        return response.json()["device_token"]

    def test_encryption_is_authenticated_and_round_trips(self) -> None:
        clear = "https://example.test"
        encrypted = encrypt_text(clear)
        self.assertNotIn(clear, encrypted)
        self.assertEqual(clear, decrypt_text(encrypted))

    def test_health_exposes_cloud_readiness_without_secrets(self) -> None:
        health = self.client.get("/health")
        self.assertEqual(200, health.status_code, health.text)
        self.assertIn("configured", health.json()["cloud_ai"])
        self.assertIn("available", health.json()["cloud_ai"])
        self.assertNotIn("api_key", health.text.lower())
        self.assertNotIn("GEMINI_API_KEY", health.text)

    def test_registration_verification_and_password_reset(self) -> None:
        with patch("shared_platform.app.main.send_account_link") as send_link:
            registration = self.client.post(
                "/api/v1/auth/register",
                json={
                    "first_name": "New",
                    "middle_name": "Example",
                    "last_name": "User",
                    "email": "new-user@example.com",
                    "password": "initial correct horse battery",
                },
            )
            self.assertEqual(202, registration.status_code, registration.text)
            verification_path = send_link.call_args.kwargs["path"]
            verification_token = parse_qs(urlsplit(verification_path).query)["token"][0]

        blocked = self.client.post(
            "/api/v1/auth/login",
            json={"email": "new-user@example.com", "password": "initial correct horse battery"},
        )
        self.assertEqual(403, blocked.status_code)
        verified = self.client.post("/api/v1/auth/verify-email", json={"token": verification_token})
        self.assertEqual(200, verified.status_code, verified.text)
        self.login("new-user@example.com", "initial correct horse battery")

        with patch("shared_platform.app.main.send_account_link") as send_link:
            reset_request = self.client.post(
                "/api/v1/auth/request-password-reset",
                json={"email": "new-user@example.com"},
            )
            self.assertEqual(202, reset_request.status_code)
            reset_path = send_link.call_args.kwargs["path"]
            reset_token = parse_qs(urlsplit(reset_path).query)["token"][0]

        reset = self.client.post(
            "/api/v1/auth/reset-password",
            json={"token": reset_token, "password": "replacement correct horse battery"},
        )
        self.assertEqual(200, reset.status_code, reset.text)
        old_password = self.client.post(
            "/api/v1/auth/login",
            json={"email": "new-user@example.com", "password": "initial correct horse battery"},
        )
        self.assertEqual(401, old_password.status_code)
        self.login("new-user@example.com", "replacement correct horse battery")

    def test_profile_name_and_password_change(self) -> None:
        self.login("user@example.com", "correct horse battery staple")
        updated = self.client.patch(
            "/api/v1/profile",
            headers=self.csrf(),
            json={"first_name": "Updated", "middle_name": "Middle", "last_name": "Name"},
        )
        self.assertEqual(200, updated.status_code, updated.text)
        self.assertEqual("Updated Middle Name", updated.json()["user"]["full_name"])

        wrong = self.client.post(
            "/api/v1/profile/change-password",
            headers=self.csrf(),
            json={"current_password": "wrong password", "new_password": "another correct horse battery"},
        )
        self.assertEqual(400, wrong.status_code)
        changed = self.client.post(
            "/api/v1/profile/change-password",
            headers=self.csrf(),
            json={
                "current_password": "correct horse battery staple",
                "new_password": "another correct horse battery",
            },
        )
        self.assertEqual(200, changed.status_code, changed.text)
        self.assertEqual(200, self.client.get("/api/v1/auth/me").status_code)

        fresh_client = TestClient(app)
        old_login = fresh_client.post(
            "/api/v1/auth/login",
            json={"email": "user@example.com", "password": "correct horse battery staple"},
        )
        self.assertEqual(401, old_login.status_code)
        new_login = fresh_client.post(
            "/api/v1/auth/login",
            json={"email": "user@example.com", "password": "another correct horse battery"},
        )
        self.assertEqual(200, new_login.status_code, new_login.text)

    def test_login_pair_ingest_and_personal_dashboard(self) -> None:
        token = self.paired_device_token()
        device_status = self.client.get(
            "/api/v1/device-status",
            headers={"Authorization": f"Bearer {token}"},
        )
        self.assertEqual(200, device_status.status_code, device_status.text)
        self.assertTrue(device_status.json()["connected"])
        response = self.client.post(
            "/api/v1/activities",
            headers={"Authorization": f"Bearer {token}"},
            json={"events": [{
                "client_event_id": "event-url-0001",
                "event_type": "URL",
                "origin": "https://Example.test/private/path?secret=1#fragment",
                "provider": None,
                "sender": None,
                "subject": None,
                "outcome": "NEEDS_CAUTION",
                "cloud_status": "COMPLETE",
                "occurred_at": "2026-08-12T08:00:00+08:00",
            }]},
        )
        self.assertEqual(202, response.status_code, response.text)
        self.assertEqual(1, response.json()["accepted"])

        # Idempotency returns a duplicate rather than writing a second row.
        duplicate = self.client.post(
            "/api/v1/activities",
            headers={"Authorization": f"Bearer {token}"},
            json={"events": [{
                "client_event_id": "event-url-0001",
                "event_type": "URL",
                "origin": "https://example.test/another-path",
                "provider": None,
                "sender": None,
                "subject": None,
                "outcome": "NEEDS_CAUTION",
                "cloud_status": "COMPLETE",
                "occurred_at": "2026-08-12T08:00:00+08:00",
            }]},
        )
        self.assertEqual(1, duplicate.json()["duplicates"])

        self.login("user@example.com", "correct horse battery staple")
        dashboard = self.client.get("/api/v1/dashboard?days=90")
        self.assertEqual(200, dashboard.status_code, dashboard.text)
        item = dashboard.json()["last_url"]
        self.assertEqual("https://example.test", item["origin"])
        self.assertEqual("2026-08-12T00:00:00Z", item["occurred_at"])
        self.assertNotIn("private", str(item))
        self.assertNotIn("secret", str(item))

    def test_admin_is_aggregate_only_and_cannot_suspend_self(self) -> None:
        self.login("admin@example.com", "admin correct horse battery")
        overview = self.client.get("/api/v1/admin/dashboard?days=30")
        self.assertEqual(200, overview.status_code)
        self.assertNotIn("origin", overview.text)
        self.assertNotIn("sender", overview.text)
        blocked = self.client.patch(
            f"/api/v1/admin/users/{self.admin_id}/status?account_status=SUSPENDED",
            headers=self.csrf(),
        )
        self.assertEqual(400, blocked.status_code)

    def test_regular_user_cannot_access_admin_api(self) -> None:
        self.login("user@example.com", "correct horse battery staple")
        response = self.client.get("/api/v1/admin/users")
        self.assertEqual(403, response.status_code)

    def test_suspension_revokes_user_session_and_device(self) -> None:
        token = self.paired_device_token()
        user_client = TestClient(app)
        login = user_client.post(
            "/api/v1/auth/login",
            json={"email": "user@example.com", "password": "correct horse battery staple"},
        )
        self.assertEqual(200, login.status_code)

        admin_client = TestClient(app)
        admin_login = admin_client.post(
            "/api/v1/auth/login",
            json={"email": "admin@example.com", "password": "admin correct horse battery"},
        )
        self.assertEqual(200, admin_login.status_code)
        suspended = admin_client.patch(
            f"/api/v1/admin/users/{self.user_id}/status?account_status=SUSPENDED",
            headers={"X-CSRF-Token": admin_client.cookies.get("bantai_csrf")},
        )
        self.assertEqual(200, suspended.status_code, suspended.text)
        self.assertEqual(401, user_client.get("/api/v1/auth/me").status_code)
        denied_device = self.client.post(
            "/api/v1/activities",
            headers={"Authorization": f"Bearer {token}"},
            json={"events": [{
                "client_event_id": "event-after-suspension",
                "event_type": "URL",
                "origin": "https://example.com",
                "provider": None,
                "sender": None,
                "subject": None,
                "outcome": "NEEDS_CAUTION",
                "cloud_status": "COMPLETE",
                "occurred_at": "2026-08-12T08:00:00+08:00",
            }]},
        )
        self.assertEqual(401, denied_device.status_code)

    def test_cleanup_removes_activity_older_than_ninety_days(self) -> None:
        with SessionLocal() as db:
            device = PairedDevice(user_id=self.user_id, token_hash=token_hash("cleanup-token"), label="Cleanup test")
            db.add(device)
            db.flush()
            db.add(
                ActivityEvent(
                    user_id=self.user_id,
                    device_id=device.id,
                    client_event_id="old-event-0001",
                    event_type="URL",
                    origin_encrypted=encrypt_text("https://example.com"),
                    outcome="NEEDS_CAUTION",
                    cloud_status="COMPLETE",
                    occurred_at=utcnow() - timedelta(days=91),
                )
            )
            db.commit()
            cleanup_expired(db)
            total = db.scalar(select(func.count(ActivityEvent.id)))
            self.assertEqual(0, total)

    def test_activity_schema_rejects_email_body(self) -> None:
        token = self.paired_device_token()
        response = self.client.post(
            "/api/v1/activities",
            headers={"Authorization": f"Bearer {token}"},
            json={"events": [{
                "client_event_id": "event-email-0001",
                "event_type": "EMAIL",
                "provider": "gmail",
                "sender": "Sender <sender@example.test>",
                "subject": "Synthetic subject",
                "body": "This must never be accepted",
                "outcome": "NO_STRONG_WARNING_SIGNS",
                "cloud_status": "COMPLETE",
                "occurred_at": "2026-08-12T08:00:00+08:00",
            }]},
        )
        self.assertEqual(422, response.status_code)


if __name__ == "__main__":
    unittest.main()
