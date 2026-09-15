from __future__ import annotations

import base64
import csv
import io
import os
import unittest
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from unittest.mock import patch


os.environ["BANTAI_DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["BANTAI_CREATE_SCHEMA"] = "true"
os.environ["BANTAI_COOKIE_SECURE"] = "false"
os.environ["BANTAI_ENCRYPTION_KEY"] = base64.urlsafe_b64encode(b"bantai-test-encryption-key-32byt").decode()

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from shared_platform.app.database import Base, SessionLocal, engine
from shared_platform.app.config import settings
from shared_platform.app.main import app, cleanup_expired
from shared_platform.app.models import (
    ActivityEvent,
    AutomaticTrainingSample,
    EmailReport,
    EmailTrainingCandidate,
    PairedDevice,
    PairingCode,
    UrlReport,
    UrlTrainingCandidate,
    User,
    UserRole,
    UserStatus,
    utcnow,
)
from shared_platform.app.security import decrypt_text, encrypt_text, hash_password, token_hash
from shared_platform.app.rate_limit import consume_limit, trusted_client_address


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
            )
            self.admin = User(
                email="admin@example.com",
                first_name="Admin",
                middle_name="Test",
                last_name="User",
                password_hash=hash_password("admin correct horse battery"),
                status=UserStatus.ACTIVE,
                role=UserRole.ADMIN,
            )
            db.add_all([self.user, self.admin])
            db.commit()
            self.user_id = self.user.id
            self.admin_id = self.admin.id
        self.client = TestClient(app, client=(f"testclient-{self._testMethodName}", 50000))

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

    def test_unknown_account_and_wrong_password_have_same_failure_response(self) -> None:
        unknown = self.client.post(
            "/api/v1/auth/login",
            json={"email": "unknown@example.com", "password": "incorrect synthetic password"},
        )
        wrong_password = self.client.post(
            "/api/v1/auth/login",
            json={"email": "user@example.com", "password": "incorrect synthetic password"},
        )
        self.assertEqual(401, unknown.status_code)
        self.assertEqual(401, wrong_password.status_code)
        self.assertEqual(unknown.json(), wrong_password.json())

    def test_health_exposes_cloud_readiness_without_secrets(self) -> None:
        health = self.client.get("/health")
        self.assertEqual(200, health.status_code, health.text)
        self.assertIn("configured", health.json()["cloud_ai"])
        self.assertIn("available", health.json()["cloud_ai"])
        self.assertNotIn("email_delivery", health.json())
        self.assertNotIn("api_key", health.text.lower())
        self.assertNotIn("GEMINI_API_KEY", health.text)

    def test_public_api_rejects_requests_over_the_byte_limit_before_authentication(self) -> None:
        response = self.client.post(
            "/api/v1/detections/email",
            content=b"x" * 262_145,
            headers={"Content-Type": "application/json"},
        )
        self.assertEqual(413, response.status_code, response.text)
        self.assertEqual("Request is too large.", response.json()["detail"])

    def test_rate_limit_uses_forwarded_identity_only_from_a_trusted_proxy(self) -> None:
        headers = {b"x-forwarded-for": b"198.51.100.10"}
        untrusted_scope = {"client": ("203.0.113.8", 443)}
        trusted_scope = {"client": ("172.30.0.2", 8080)}
        self.assertEqual(
            "203.0.113.8",
            trusted_client_address(untrusted_scope, headers, "172.30.0.0/24"),
        )
        self.assertEqual(
            "198.51.100.10",
            trusted_client_address(trusted_scope, headers, "172.30.0.0/24"),
        )
        self.assertNotEqual(
            trusted_client_address(trusted_scope, headers, "172.30.0.0/24"),
            trusted_client_address(
                trusted_scope,
                {b"x-forwarded-for": b"198.51.100.11"},
                "",
            ),
        )

    def test_shared_rate_limit_is_identity_scoped_and_survives_new_instances(self) -> None:
        now = utcnow()
        self.assertFalse(consume_limit("account:/login:198.51.100.10:one@example.test", 2, now=now))
        self.assertFalse(consume_limit("account:/login:198.51.100.10:one@example.test", 2, now=now))
        self.assertTrue(consume_limit("account:/login:198.51.100.10:one@example.test", 2, now=now))
        self.assertFalse(consume_limit("account:/login:198.51.100.10:two@example.test", 2, now=now))
        self.assertFalse(
            consume_limit(
                "account:/login:198.51.100.10:one@example.test",
                2,
                now=now + timedelta(minutes=6),
            )
        )

    def test_pasted_message_review_requires_login_csrf_and_explicit_confirmation(self) -> None:
        synthetic_message = "Synthetic request: send the sample OTP 123456 to billing@example.test."
        payload = {"message": synthetic_message, "confirmed": True}
        self.assertEqual(401, self.client.post("/api/v1/message-review", json=payload).status_code)

        self.login("user@example.com", "correct horse battery staple")
        self.assertEqual(403, self.client.post("/api/v1/message-review", json=payload).status_code)
        self.assertEqual(
            422,
            self.client.post(
                "/api/v1/message-review",
                headers=self.csrf(),
                json={"message": synthetic_message, "confirmed": False},
            ).status_code,
        )
        self.assertEqual(
            422,
            self.client.post(
                "/api/v1/message-review",
                headers=self.csrf(),
                json={"message": "   \n", "confirmed": True},
            ).status_code,
        )

        synthetic_result = {
            "status": "COMPLETE",
            "assessment": "SUSPICIOUS_SIGNS_FOUND",
            "confidence": "HIGH",
            "indicators": [{
                "category": "Credential request",
                "severity": "CRITICAL",
                "evidence": "The text asks the recipient to provide an OTP.",
            }],
            "reasoning_summary": "The wording requests a sensitive one-time code.",
            "recommended_action": "Do not share the code; verify the request independently.",
            "model": "gemini-3.5-flash-lite",
            "stored": False,
            "redacted_before_ai": True,
            "analysis_scope": "PASTED_TEXT_ONLY",
        }
        with SessionLocal() as db:
            activity_before = db.scalar(select(func.count(ActivityEvent.id))) or 0
            reports_before = db.scalar(select(func.count(EmailReport.id))) or 0
        with patch("shared_platform.app.main.review_pasted_message", return_value=synthetic_result) as review:
            response = self.client.post(
                "/api/v1/message-review",
                headers=self.csrf(),
                json=payload,
            )
        self.assertEqual(200, response.status_code, response.text)
        review.assert_called_once_with(synthetic_message)
        self.assertEqual("gemini-3.5-flash-lite", response.json()["model"])
        self.assertFalse(response.json()["stored"])
        self.assertNotIn(synthetic_message, response.text)
        with SessionLocal() as db:
            self.assertEqual(activity_before, db.scalar(select(func.count(ActivityEvent.id))) or 0)
            self.assertEqual(reports_before, db.scalar(select(func.count(EmailReport.id))) or 0)

    def test_direct_email_cloud_review_redacts_untrusted_device_payload_at_provider_boundary(self) -> None:
        token = self.paired_device_token()
        raw_values = {
            "email": "real.person@example.test",
            "phone": "0917 123 4567",
            "otp": "654321",
            "card": "4111 1111 1111 1111",
            "account": "ACCT-12345678",
        }
        payload = {
            "provider": "gmail",
            "redacted_sender": f"Synthetic Name <{raw_values['email']}>",
            "redacted_subject": f"Urgent payment for {raw_values['email']}",
            "redacted_context": (
                f"Please send OTP {raw_values['otp']} to {raw_values['email']} and call "
                f"{raw_values['phone']}. Use card {raw_values['card']} for account "
                f"{raw_values['account']}; an urgent transfer fee is requested."
            ),
            "sender_authentication": {
                "source": "SENDER_DETAILS",
                "signed_by": "example.test",
                "dmarc": "pass",
                "untrusted_note": raw_values["email"],
            },
            "email_model": {"signal": "SUSPICIOUS"},
            "local_indicators": {"signals": ["OTP_REQUEST"]},
        }
        fake_result = {
            "assessment": "NEEDS_CAUTION",
            "confidence": "MEDIUM",
            "indicators": [],
            "reasoning_summary": "Synthetic result.",
            "recommended_action": "Verify independently.",
        }
        with patch("shared_platform.app.main.cloud_review", return_value=fake_result) as review:
            response = self.client.post(
                "/api/v1/cloud-review/email",
                headers={"Authorization": f"Bearer {token}"},
                json=payload,
            )
        self.assertEqual(200, response.status_code, response.text)
        forwarded = review.call_args.args[0]
        serialized = str(forwarded)
        for value in raw_values.values():
            self.assertNotIn(value, serialized)
        self.assertTrue(forwarded["redacted_before_provider"])
        self.assertEqual("example.test", forwarded["sender_domain"])
        self.assertEqual("example.test", forwarded["sender_authentication"]["signed_by"])
        self.assertNotIn("untrusted_note", forwarded["sender_authentication"])
        self.assertIn("urgent transfer fee", forwarded["email_context"])

    def test_opt_in_automatic_samples_are_encrypted_and_deleted_on_withdrawal(self) -> None:
        token = self.paired_device_token()
        device_headers = {"Authorization": f"Bearer {token}"}
        url_payload = {
            "client_event_id": "automatic-url-sample-0001",
            "event_type": "URL",
            "url": "https://sample.example.test/private/path?token=synthetic#section",
            "outcome": "NEEDS_CAUTION",
            "occurred_at": "2026-08-25T10:00:00+08:00",
        }
        self.assertEqual(403, self.client.post("/api/v1/training-samples", headers=device_headers, json=url_payload).status_code)

        self.login("user@example.com", "correct horse battery staple")
        self.assertEqual(
            422,
            self.client.patch(
                "/api/v1/training-consent",
                headers=self.csrf(),
                json={"enabled": True, "confirmed": False},
            ).status_code,
        )
        enabled = self.client.patch(
            "/api/v1/training-consent",
            headers=self.csrf(),
            json={"enabled": True, "confirmed": True},
        )
        self.assertEqual(200, enabled.status_code, enabled.text)
        self.assertTrue(enabled.json()["enabled"])
        self.assertEqual(10, enabled.json()["sample_rate_percent"])

        accepted_url = self.client.post("/api/v1/training-samples", headers=device_headers, json=url_payload)
        self.assertEqual(202, accepted_url.status_code, accepted_url.text)
        self.assertEqual("ACCEPTED", accepted_url.json()["reason"])
        duplicate_url = self.client.post("/api/v1/training-samples", headers=device_headers, json=url_payload)
        self.assertEqual(202, duplicate_url.status_code, duplicate_url.text)
        self.assertTrue(duplicate_url.json()["duplicate"])
        self.assertEqual("DUPLICATE", duplicate_url.json()["reason"])
        email_body = "Synthetic training email body requesting account details."
        email_payload = {
            "client_event_id": "automatic-email-sample-0001",
            "event_type": "EMAIL",
            "provider": "gmail",
            "sender": "sender@example.test",
            "subject": "Synthetic sample",
            "body": email_body,
            "outcome": "SUSPICIOUS_SIGNS_FOUND",
            "occurred_at": "2026-08-25T10:01:00+08:00",
        }
        self.assertEqual(202, self.client.post("/api/v1/training-samples", headers=device_headers, json=email_payload).status_code)

        with SessionLocal() as db:
            samples = list(db.scalars(select(AutomaticTrainingSample)).all())
            self.assertEqual(2, len(samples))
            stored_text = " ".join(
                value or ""
                for sample in samples
                for value in (sample.url_ciphertext, sample.sender_encrypted, sample.subject_encrypted, sample.body_ciphertext)
            )
            self.assertNotIn("private/path", stored_text)
            self.assertNotIn(email_body, stored_text)

        admin_client = TestClient(app)
        admin_client.post("/api/v1/auth/login", json={"email": "admin@example.com", "password": "admin correct horse battery"})
        inventory = admin_client.get("/api/v1/admin/training-data")
        self.assertEqual(200, inventory.status_code, inventory.text)
        automatic = inventory.json()["automatic_samples"]
        self.assertEqual(1, automatic["url_total"])
        self.assertEqual(1, automatic["email_total"])
        self.assertEqual(1, len(automatic["urls"]["items"]))
        self.assertEqual(1, automatic["urls"]["total"])
        self.assertEqual("URL", automatic["urls"]["items"][0]["event_type"])
        self.assertEqual(1, len(automatic["emails"]["items"]))
        self.assertEqual(1, automatic["emails"]["total"])
        self.assertEqual("EMAIL", automatic["emails"]["items"][0]["event_type"])
        self.assertEqual(
            "full_taglish_xlmr_512_headtail_seed13",
            automatic["emails"]["items"][0]["detector_model_version"],
        )
        self.assertIn("private/path", inventory.text)
        self.assertNotIn(email_body, inventory.text)
        self.assertNotIn("body_ciphertext", inventory.text)
        self.assertNotIn("user_id", inventory.text)

        url_export = admin_client.get(
            "/api/v1/admin/training-data/automatic-export.csv?sample_type=URL"
        )
        self.assertEqual(200, url_export.status_code, url_export.text)
        self.assertIn("bantai-automatic-url-samples", url_export.headers["content-disposition"])
        self.assertIn("private/path?token=synthetic#section", url_export.text)
        self.assertNotIn("user_id", url_export.text)

        email_export = admin_client.get(
            "/api/v1/admin/training-data/automatic-export.csv?sample_type=EMAIL"
        )
        self.assertEqual(200, email_export.status_code, email_export.text)
        self.assertIn("bantai-automatic-email-sample-manifest", email_export.headers["content-disposition"])
        self.assertIn("sender@example.test", email_export.text)
        self.assertIn("Synthetic sample", email_export.text)
        self.assertIn("RESTRICTED_TRAINING_PROCESS_ONLY", email_export.text)
        self.assertNotIn(email_body, email_export.text)
        self.assertNotIn("body_ciphertext", email_export.text)

        disabled = self.client.patch(
            "/api/v1/training-consent",
            headers=self.csrf(),
            json={"enabled": False, "confirmed": False},
        )
        self.assertEqual(200, disabled.status_code, disabled.text)
        self.assertEqual(2, disabled.json()["deleted_samples"])
        with SessionLocal() as db:
            self.assertEqual(0, db.scalar(select(func.count(AutomaticTrainingSample.id))) or 0)

    def test_registration_is_active_immediately_and_email_account_flows_are_absent(self) -> None:
        registration = self.client.post(
            "/api/v1/auth/register",
            json={
                "first_name": "New",
                "middle_name": "Example",
                "last_name": "User",
                "email": "new-user@example.com",
                "password": "StrongInitial1!",
            },
        )
        self.assertEqual(201, registration.status_code, registration.text)
        self.assertEqual("Your BantAI account was created.", registration.json()["message"])
        self.login("new-user@example.com", "StrongInitial1!")

        removed_routes = (
            ("/api/v1/auth/verify-email", {"token": "synthetic-token-value-123456789"}),
            ("/api/v1/auth/resend-verification", {"email": "new-user@example.com"}),
            ("/api/v1/auth/request-password-reset", {"email": "new-user@example.com"}),
            (
                "/api/v1/auth/reset-password",
                {"token": "synthetic-token-value-123456789", "password": "StrongReplacement2!"},
            ),
        )
        for path, payload in removed_routes:
            with self.subTest(path=path):
                self.assertEqual(404, self.client.post(path, json=payload).status_code)

        self.assertNotIn("account_tokens", Base.metadata.tables)

    def test_closed_pilot_disables_registration_and_email_availability(self) -> None:
        closed_pilot_settings = replace(settings, public_registration_enabled=False)
        with patch("shared_platform.app.main.settings", closed_pilot_settings):
            registration = self.client.post(
                "/api/v1/auth/register",
                json={
                    "first_name": "Synthetic",
                    "last_name": "Pilot",
                    "email": "new-pilot@example.com",
                    "password": "StrongInitial1!",
                },
            )
            availability = self.client.post(
                "/api/v1/auth/email-availability",
                json={"email": "new-pilot@example.com"},
            )
        self.assertEqual(403, registration.status_code, registration.text)
        self.assertEqual(403, availability.status_code, availability.text)
        self.assertNotIn("available", availability.json())

    def test_public_config_exposes_only_registration_capability(self) -> None:
        enabled_settings = replace(settings, public_registration_enabled=True)
        disabled_settings = replace(settings, public_registration_enabled=False)
        with patch("shared_platform.app.main.settings", enabled_settings):
            enabled = self.client.get("/api/v1/public-config")
        with patch("shared_platform.app.main.settings", disabled_settings):
            disabled = self.client.get("/api/v1/public-config")

        self.assertEqual(200, enabled.status_code, enabled.text)
        self.assertEqual({"public_registration_enabled": True}, enabled.json())
        self.assertEqual(200, disabled.status_code, disabled.text)
        self.assertEqual({"public_registration_enabled": False}, disabled.json())
        self.assertNotIn("BANTAI_ENCRYPTION_KEY", enabled.text)
        self.assertNotIn("internal_api_key", disabled.text)

    def test_registration_checks_case_insensitive_email_availability_first(self) -> None:
        available = self.client.post(
            "/api/v1/auth/email-availability",
            json={"email": "unused@example.com"},
        )
        in_use = self.client.post(
            "/api/v1/auth/email-availability",
            json={"email": "USER@example.com"},
        )

        self.assertEqual(200, available.status_code, available.text)
        self.assertTrue(available.json()["available"])
        self.assertEqual(200, in_use.status_code, in_use.text)
        self.assertFalse(in_use.json()["available"])

        with patch("shared_platform.app.main.hash_password") as hash_password_call:
            duplicate = self.client.post(
                "/api/v1/auth/register",
                json={
                    "first_name": "Duplicate",
                    "middle_name": None,
                    "last_name": "User",
                    "email": "USER@example.com",
                    "password": "StrongDuplicate3!",
                },
            )

        self.assertEqual(409, duplicate.status_code, duplicate.text)
        self.assertEqual("This email is already in use.", duplicate.json()["detail"])
        hash_password_call.assert_not_called()

    def test_registration_rejects_passwords_missing_required_character_types(self) -> None:
        weak_passwords = (
            "lowercase123!",
            "UPPERCASE123!",
            "NoNumberHere!",
            "NoSpecial123",
        )
        for index, password in enumerate(weak_passwords):
            with self.subTest(password=password):
                response = self.client.post(
                    "/api/v1/auth/register",
                    json={
                        "first_name": "Password",
                        "middle_name": None,
                        "last_name": "Test",
                        "email": f"password-test-{index}@example.com",
                        "password": password,
                    },
                )
                self.assertEqual(422, response.status_code, response.text)
                self.assertIn("uppercase letter", response.json()["detail"])

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
            json={"current_password": "wrong password", "new_password": "AnotherStrong3!"},
        )
        self.assertEqual(400, wrong.status_code)
        changed = self.client.post(
            "/api/v1/profile/change-password",
            headers=self.csrf(),
            json={
                "current_password": "correct horse battery staple",
                "new_password": "AnotherStrong3!",
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
            json={"email": "user@example.com", "password": "AnotherStrong3!"},
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

    def test_activity_search_and_operational_states_are_privacy_safe(self) -> None:
        token = self.paired_device_token()
        detected_at = datetime.now(timezone.utc).isoformat()
        response = self.client.post(
            "/api/v1/activities",
            headers={"Authorization": f"Bearer {token}"},
            json={"events": [
                {
                    "client_event_id": "operations-url-0001",
                    "event_type": "URL",
                    "origin": "https://searchable.example.test/private/path?secret=1",
                    "provider": None,
                    "sender": None,
                    "subject": None,
                    "outcome": "NO_STRONG_WARNING_SIGNS",
                    "cloud_status": "SKIPPED",
                    "duration_ms": 120,
                    "occurred_at": detected_at,
                },
                {
                    "client_event_id": "operations-email-0001",
                    "event_type": "EMAIL",
                    "origin": None,
                    "provider": "gmail",
                    "sender": "synthetic.sender@example.test",
                    "subject": "Synthetic searchable subject",
                    "outcome": "NEEDS_CAUTION",
                    "cloud_status": "UNAVAILABLE",
                    "cloud_failure_category": "PROVIDER_TIMEOUT",
                    "duration_ms": 880,
                    "occurred_at": detected_at,
                },
            ]},
        )
        self.assertEqual(202, response.status_code, response.text)

        invalid_category = self.client.post(
            "/api/v1/activities",
            headers={"Authorization": f"Bearer {token}"},
            json={"events": [{
                "client_event_id": "operations-invalid-0001",
                "event_type": "URL",
                "origin": "https://example.test",
                "outcome": "NO_STRONG_WARNING_SIGNS",
                "cloud_status": "COMPLETE",
                "cloud_failure_category": "RAW detail must not be stored",
                "occurred_at": detected_at,
            }]},
        )
        self.assertEqual(422, invalid_category.status_code)

        self.login("user@example.com", "correct horse battery staple")
        subject_search = self.client.get("/api/v1/activities?search=SEARCHABLE%20SUBJECT")
        self.assertEqual(200, subject_search.status_code, subject_search.text)
        self.assertEqual(1, subject_search.json()["total"])
        email_item = subject_search.json()["items"][0]
        self.assertEqual("UNAVAILABLE", email_item["cloud_status"])
        self.assertEqual("PROVIDER_TIMEOUT", email_item["cloud_failure_category"])
        self.assertEqual(880, email_item["duration_ms"])
        self.assertEqual(0, self.client.get("/api/v1/activities?search=private%2Fpath").json()["total"])

        admin_client = TestClient(app)
        admin_client.post(
            "/api/v1/auth/login",
            json={"email": "admin@example.com", "password": "admin correct horse battery"},
        )
        with patch(
            "shared_platform.app.main.detector_gateway.readiness",
            return_value={"status": "ready"},
        ):
            dashboard = admin_client.get("/api/v1/admin/dashboard?days=7").json()
        operations = dashboard["operations"]
        self.assertTrue(dashboard["service"]["server_models"]["connected"])
        self.assertEqual(2, operations["retained_detection_count"])
        self.assertEqual(500.0, operations["average_detection_latency_ms"])
        self.assertEqual(1, operations["cloud_status_counts"]["SKIPPED"])
        self.assertEqual(1, operations["cloud_status_counts"]["UNAVAILABLE"])
        self.assertEqual(1, operations["cloud_failure_categories"]["PROVIDER_TIMEOUT"])
        self.assertIn("not measured model accuracy", operations["accuracy_statement"])

    def test_activity_explanations_are_device_scoped_and_use_explicit_full_context(self) -> None:
        token = self.paired_device_token()
        device_headers = {"Authorization": f"Bearer {token}"}
        ingested = self.client.post(
            "/api/v1/activities",
            headers=device_headers,
            json={"events": [
                {
                    "client_event_id": "explain-url-0001",
                    "event_type": "URL",
                    "origin": "https://explain.example.test/private/path?secret=1",
                    "provider": None,
                    "sender": None,
                    "subject": None,
                    "outcome": "NO_STRONG_WARNING_SIGNS",
                    "cloud_status": "COMPLETE",
                    "occurred_at": "2026-08-25T08:00:00+08:00",
                },
                {
                    "client_event_id": "explain-email-0001",
                    "event_type": "EMAIL",
                    "origin": None,
                    "provider": "gmail",
                    "sender": "synthetic.sender@example.test",
                    "subject": "Paki-send ang OTP ngayon",
                    "outcome": "SUSPICIOUS_SIGNS_FOUND",
                    "cloud_status": "COMPLETE",
                    "occurred_at": "2026-08-25T08:01:00+08:00",
                },
            ]},
        )
        self.assertEqual(202, ingested.status_code, ingested.text)

        self.login("user@example.com", "correct horse battery staple")
        dashboard = self.client.get("/api/v1/dashboard?days=90").json()
        url_id = dashboard["last_url"]["id"]
        email_id = dashboard["last_email"]["id"]
        self.assertEqual(
            "explain-url-0001",
            dashboard["last_url"]["detail_reference"],
        )
        self.assertEqual("explain-email-0001", dashboard["last_email"]["detail_reference"])

        safe_result = {
            "status": "COMPLETE",
            "assessment": "NO_STRONG_WARNING_SIGNS",
            "confidence": "HIGH",
            "indicators": [],
            "reasoning_summary": "No strong warning signs were detected in the supplied address.",
            "recommended_action": "Continue carefully because this is not a guarantee.",
            "stored": False,
            "analysis_scope": "WEBSITE_ORIGIN_ONLY",
        }
        suspicious_result = {
            **safe_result,
            "assessment": "SUSPICIOUS_SIGNS_FOUND",
            "reasoning_summary": "This result needs attention. Huwag mag-share ng OTP or password.",
            "recommended_action": "Verify the sender independently and do not send sensitive information.",
            "analysis_scope": "EMAIL_PROVIDER_SENDER_SUBJECT_BODY",
        }
        with patch(
            "shared_platform.app.main.explain_activity",
            side_effect=[safe_result, suspicious_result],
        ) as explain:
            url_response = self.client.post(
                "/api/v1/cloud-review/activity-explanation",
                headers=device_headers,
                json={
                    "activity_id": url_id,
                    "client_event_id": "explain-url-0001",
                    "event_type": "URL",
                    "outcome": "NO_STRONG_WARNING_SIGNS",
                    "url": "https://explain.example.test/private/path?secret=1#fragment",
                },
            )
            email_response = self.client.post(
                "/api/v1/cloud-review/activity-explanation",
                headers=device_headers,
                json={
                    "activity_id": email_id,
                    "client_event_id": "explain-email-0001",
                    "event_type": "EMAIL",
                    "outcome": "SUSPICIOUS_SIGNS_FOUND",
                    "provider": "gmail",
                    "sender": "synthetic.sender@example.test",
                    "subject": "Paki-send ang OTP ngayon",
                    "body": "Paki-send ang OTP ngayon para hindi ma-block ang account mo.",
                },
            )

        self.assertEqual(200, url_response.status_code, url_response.text)
        self.assertEqual(200, email_response.status_code, email_response.text)
        url_payload = explain.call_args_list[0].args[0]
        self.assertEqual("https://explain.example.test", url_payload["url_origin"])
        self.assertNotIn("full_url", url_payload)
        self.assertNotIn("private", str(url_payload))
        self.assertNotIn("secret", str(url_payload))
        email_payload = explain.call_args_list[1].args[0]
        self.assertEqual("EMAIL_PROVIDER_SENDER_SUBJECT_BODY", email_payload["content_scope"])
        self.assertIn("Paki-send", email_payload["subject"])
        self.assertIn("OTP ngayon", email_payload["email_body"])

        fallback_result = {
            **safe_result,
            "analysis_scope": "WEBSITE_ORIGIN_ONLY",
            "full_context_available": False,
        }
        with patch(
            "shared_platform.app.main.explain_activity",
            return_value=fallback_result,
        ) as explain_fallback:
            fallback_response = self.client.post(
                "/api/v1/cloud-review/activity-explanation-fallback",
                headers=device_headers,
                json={
                    "activity_id": url_id,
                    "client_event_id": "explain-url-0001",
                },
            )
        self.assertEqual(200, fallback_response.status_code, fallback_response.text)
        fallback_payload = explain_fallback.call_args.args[0]
        self.assertEqual("WEBSITE_ORIGIN_ONLY", fallback_payload["content_scope"])
        self.assertEqual("https://explain.example.test", fallback_payload["url_origin"])
        self.assertNotIn("private", str(fallback_payload))
        self.assertNotIn("secret", str(fallback_payload))

        self.assertEqual(
            404,
            self.client.post(
                "/api/v1/cloud-review/activity-explanation",
                headers=device_headers,
                json={
                    "activity_id": url_id,
                    "client_event_id": "wrong-event-reference",
                    "event_type": "URL",
                    "outcome": "NO_STRONG_WARNING_SIGNS",
                    "url": "https://explain.example.test/private/path?secret=1#fragment",
                },
            ).status_code,
        )

    def test_admin_is_aggregate_only_and_cannot_suspend_self(self) -> None:
        self.login("admin@example.com", "admin correct horse battery")
        with patch(
            "shared_platform.app.main.detector_gateway.readiness",
            return_value={"status": "ready"},
        ):
            overview = self.client.get("/api/v1/admin/dashboard?days=30")
        self.assertEqual(200, overview.status_code)
        self.assertTrue(overview.json()["service"]["server_models"]["connected"])
        self.assertIn("connected", overview.json()["service"]["cloud_ai"])
        self.assertNotIn("origin", overview.text)
        self.assertNotIn("sender", overview.text)
        blocked = self.client.patch(
            f"/api/v1/admin/users/{self.admin_id}/status?account_status=SUSPENDED",
            headers=self.csrf(),
        )
        self.assertEqual(400, blocked.status_code)

    def test_user_can_enter_url_and_admin_can_review_without_reporter_identity(self) -> None:
        self.login("user@example.com", "correct horse battery staple")
        created = self.client.post(
            "/api/v1/url-reports",
            headers=self.csrf(),
            json={
                "url": "https://review.example.test/private/path?secret=1#fragment",
                "detector_outcome": "NEEDS_CAUTION",
                "classification": "LEGITIMATE",
            },
        )
        self.assertEqual(201, created.status_code, created.text)
        report = created.json()["report"]
        self.assertEqual(
            "https://review.example.test/private/path?secret=1#fragment",
            report["url"],
        )
        self.assertEqual("https://review.example.test", report["origin"])
        self.assertEqual("NEEDS_CAUTION", report["detector_outcome"])
        self.assertEqual("PENDING", report["status"])
        self.assertEqual("INCORRECT", report["feedback_verdict"])
        self.assertEqual("MANUAL_ENTRY", report["feedback_source"])
        self.assertEqual("PENDING", report["training_status"])
        self.assertEqual("BantAI RF Grouped v1.0.0", report["detector_model_version"])
        self.assertIn("private/path", created.text)
        self.assertIn("secret=1", created.text)

        duplicate = self.client.post(
            "/api/v1/url-reports",
            headers=self.csrf(),
            json={
                "url": "https://REVIEW.example.test/private/path?secret=1#fragment",
                "detector_outcome": "SUSPICIOUS_SIGNS_FOUND",
                "classification": "SUSPICIOUS",
            },
        )
        self.assertEqual(409, duplicate.status_code)
        invalid = self.client.post(
            "/api/v1/url-reports",
            headers=self.csrf(),
            json={
                "url": "javascript:alert(1)",
                "detector_outcome": "NO_STRONG_WARNING_SIGNS",
                "classification": "SUSPICIOUS",
            },
        )
        self.assertEqual(422, invalid.status_code)
        self.assertEqual(403, self.client.get("/api/v1/admin/url-reports").status_code)

        with SessionLocal() as db:
            stored = db.get(UrlReport, report["id"])
            self.assertIsNotNone(stored)
            self.assertNotIn("review.example.test", stored.origin_encrypted)
            self.assertNotIn("review.example.test", stored.origin_fingerprint)

        admin_client = TestClient(app)
        admin_login = admin_client.post(
            "/api/v1/auth/login",
            json={"email": "admin@example.com", "password": "admin correct horse battery"},
        )
        self.assertEqual(200, admin_login.status_code, admin_login.text)
        queue = admin_client.get("/api/v1/admin/url-reports")
        self.assertEqual(200, queue.status_code, queue.text)
        self.assertEqual(1, queue.json()["total"])
        self.assertNotIn("user@example.com", queue.text)
        self.assertNotIn("user_id", queue.text)
        self.assertNotIn("activity_event_id", queue.text)
        self.assertEqual(
            "https://review.example.test/private/path?secret=1#fragment",
            queue.json()["items"][0]["url"],
        )
        self.assertEqual(1, queue.json()["items"][0]["similar_report_count"])

        invalid_approval = admin_client.patch(
            f"/api/v1/admin/url-reports/{report['id']}",
            headers={"X-CSRF-Token": admin_client.cookies.get("bantai_csrf")},
            json={"action": "APPROVE"},
        )
        self.assertEqual(422, invalid_approval.status_code)

        reviewed = admin_client.patch(
            f"/api/v1/admin/url-reports/{report['id']}",
            headers={"X-CSRF-Token": admin_client.cookies.get("bantai_csrf")},
            json={"action": "APPROVE", "assessment": "LEGITIMATE"},
        )
        self.assertEqual(200, reviewed.status_code, reviewed.text)
        self.assertEqual("REVIEWED", reviewed.json()["report"]["status"])
        self.assertEqual("LEGITIMATE", reviewed.json()["report"]["admin_assessment"])
        self.assertEqual("APPROVED", reviewed.json()["report"]["training_status"])
        approved_queue = admin_client.get("/api/v1/admin/url-reports?training_status=APPROVED")
        self.assertEqual(1, approved_queue.json()["total"])
        self.assertEqual(1, approved_queue.json()["training_candidate_total"])

        with SessionLocal() as db:
            candidate = db.scalar(select(UrlTrainingCandidate))
            self.assertIsNotNone(candidate)
            self.assertEqual("LEGITIMATE", candidate.approved_label.value)
            self.assertEqual("BantAI RF Grouped v1.0.0", candidate.detector_model_version)
            self.assertEqual(1, candidate.evidence_count)
            self.assertFalse(hasattr(candidate, "user_id"))
            self.assertFalse(hasattr(candidate, "source_report_id"))
            self.assertNotIn("review.example.test", candidate.origin_encrypted)

        personal = self.client.get("/api/v1/url-reports")
        self.assertEqual("LEGITIMATE", personal.json()["items"][0]["admin_assessment"])
        self.assertEqual("APPROVED", personal.json()["items"][0]["training_status"])

        token = self.paired_device_token()
        email_activity = self.client.post(
            "/api/v1/activities",
            headers={"Authorization": f"Bearer {token}"},
            json={"events": [{
                "client_event_id": "private-email-activity-0001",
                "event_type": "EMAIL",
                "origin": None,
                "provider": "gmail",
                "sender": "private.sender@example.test",
                "subject": "Private training subject",
                "outcome": "NEEDS_CAUTION",
                "cloud_status": "COMPLETE",
                "occurred_at": "2026-08-12T10:00:00+08:00",
            }]},
        )
        self.assertEqual(202, email_activity.status_code, email_activity.text)
        training_data = admin_client.get("/api/v1/admin/training-data")
        self.assertEqual(200, training_data.status_code, training_data.text)
        payload = training_data.json()
        self.assertEqual(1, payload["urls"]["candidate_total"])
        self.assertEqual(1, payload["urls"]["evidence_total"])
        self.assertEqual(1, payload["urls"]["label_counts"]["LEGITIMATE"])
        self.assertEqual("https://review.example.test", payload["urls"]["items"][0]["origin"])
        self.assertEqual(
            "https://review.example.test/private/path?secret=1#fragment",
            payload["urls"]["items"][0]["url"],
        )
        self.assertEqual("BantAI RF Grouped v1.0.0", payload["urls"]["model_version"])
        self.assertEqual(0, payload["emails"]["candidate_total"])
        self.assertEqual(1, payload["emails"]["observed_activity_total"])
        self.assertEqual("ENCRYPTED_REVIEW_CONTENT", payload["emails"]["collection_status"])
        self.assertNotIn("private.sender", training_data.text)
        self.assertNotIn("Private training subject", training_data.text)
        self.assertNotIn("origin_fingerprint", training_data.text)
        self.assertNotIn("user_id", training_data.text)
        self.assertEqual(
            422,
            admin_client.get("/api/v1/admin/training-data?approved_label=INCONCLUSIVE").status_code,
        )
        self.assertEqual(422, admin_client.get("/api/v1/admin/training-data/export.csv").status_code)
        exported = admin_client.get("/api/v1/admin/training-data/export.csv?candidate_type=URL")
        self.assertEqual(200, exported.status_code, exported.text)
        self.assertTrue(exported.headers["content-type"].startswith("text/csv"))
        self.assertIn('filename="bantai-url-training-data-', exported.headers["content-disposition"])
        self.assertEqual("no-store", exported.headers["cache-control"])
        export_rows = list(csv.DictReader(io.StringIO(exported.content.decode("utf-8-sig"))))
        self.assertEqual(1, len(export_rows))
        self.assertEqual(
            "https://review.example.test/private/path?secret=1#fragment",
            export_rows[0]["url"],
        )
        self.assertEqual("LEGITIMATE", export_rows[0]["approved_label"])
        self.assertEqual("INCLUDED_IN_URL_EXPORT", export_rows[0]["content_access"])
        self.assertNotIn("sender", export_rows[0])
        self.assertNotIn("body_available", export_rows[0])
        self.assertNotIn("user_id", exported.text)
        self.assertNotIn("origin_fingerprint", exported.text)
        filtered_export = admin_client.get(
            "/api/v1/admin/training-data/export.csv?candidate_type=URL&approved_label=SUSPICIOUS"
        )
        self.assertEqual([], list(csv.DictReader(io.StringIO(filtered_export.content.decode("utf-8-sig")))))

    def test_recent_detection_feedback_keeps_confirmed_full_address_and_owner_scope(self) -> None:
        token = self.paired_device_token()
        ingested = self.client.post(
            "/api/v1/activities",
            headers={"Authorization": f"Bearer {token}"},
            json={"events": [{
                "client_event_id": "feedback-url-0001",
                "event_type": "URL",
                "origin": "https://feedback.example.test/private/path?secret=1",
                "provider": None,
                "sender": None,
                "subject": None,
                "outcome": "NO_STRONG_WARNING_SIGNS",
                "cloud_status": "COMPLETE",
                "occurred_at": "2026-08-12T08:00:00+08:00",
            }]},
        )
        self.assertEqual(202, ingested.status_code, ingested.text)

        self.login("user@example.com", "correct horse battery staple")
        dashboard = self.client.get("/api/v1/dashboard?days=90")
        activity = dashboard.json()["last_url"]
        self.assertFalse(activity["feedback_submitted"])

        empty_feedback = self.client.post(
            "/api/v1/url-reports/from-activity",
            headers=self.csrf(),
            json={},
        )
        self.assertEqual(422, empty_feedback.status_code)
        with SessionLocal() as db:
            self.assertEqual(0, db.scalar(select(func.count(UrlReport.id))))

        missing_correction = self.client.post(
            "/api/v1/url-reports/from-activity",
            headers=self.csrf(),
            json={"activity_event_id": activity["id"], "verdict": "INCORRECT", "confirmed": True},
        )
        self.assertEqual(422, missing_correction.status_code)

        mismatched_address = self.client.post(
            "/api/v1/url-reports/from-activity",
            headers=self.csrf(),
            json={
                "activity_event_id": activity["id"],
                "url": "https://different.example.test/private/path",
                "verdict": "INCORRECT",
                "classification": "SUSPICIOUS",
                "confirmed": True,
            },
        )
        self.assertEqual(422, mismatched_address.status_code)
        self.assertIn("does not match", mismatched_address.text)

        submitted = self.client.post(
            "/api/v1/url-reports/from-activity",
            headers=self.csrf(),
            json={
                "activity_event_id": activity["id"],
                "url": "https://feedback.example.test/private/path?secret=1",
                "verdict": "INCORRECT",
                "classification": "SUSPICIOUS",
                "reason": "MISSED_WARNING",
                "confirmed": True,
            },
        )
        self.assertEqual(201, submitted.status_code, submitted.text)
        report = submitted.json()["report"]
        self.assertEqual("https://feedback.example.test/private/path?secret=1", report["url"])
        self.assertEqual("https://feedback.example.test", report["origin"])
        self.assertEqual("RECENT_DETECTION", report["feedback_source"])
        self.assertEqual("INCORRECT", report["feedback_verdict"])
        self.assertEqual("MISSED_WARNING", report["feedback_reason"])
        self.assertEqual("PENDING", report["training_status"])
        self.assertIn("private/path", submitted.text)
        self.assertIn("secret=1", submitted.text)

        refreshed = self.client.get("/api/v1/dashboard?days=90")
        self.assertTrue(refreshed.json()["last_url"]["feedback_submitted"])
        duplicate = self.client.post(
            "/api/v1/url-reports/from-activity",
            headers=self.csrf(),
            json={
                "activity_event_id": activity["id"],
                "url": "https://feedback.example.test/private/path?secret=1",
                "verdict": "CORRECT",
                "confirmed": True,
            },
        )
        self.assertEqual(409, duplicate.status_code)

        admin_client = TestClient(app)
        admin_login = admin_client.post(
            "/api/v1/auth/login",
            json={"email": "admin@example.com", "password": "admin correct horse battery"},
        )
        self.assertEqual(200, admin_login.status_code)
        cross_user = admin_client.post(
            "/api/v1/url-reports/from-activity",
            headers={"X-CSRF-Token": admin_client.cookies.get("bantai_csrf")},
            json={
                "activity_event_id": activity["id"],
                "url": "https://feedback.example.test/private/path?secret=1",
                "verdict": "CORRECT",
                "confirmed": True,
            },
        )
        self.assertEqual(404, cross_user.status_code)

    def test_device_feedback_requires_explicit_input_and_exact_detection(self) -> None:
        token = self.paired_device_token()
        events = []
        for event_id, detected_at in (
            ("device-feedback-0001", "2026-08-12T08:00:00+08:00"),
            ("device-feedback-0002", "2026-08-12T09:00:00+08:00"),
        ):
            ingested = self.client.post(
                "/api/v1/activities",
                headers={"Authorization": f"Bearer {token}"},
                json={"events": [{
                    "client_event_id": event_id,
                    "event_type": "URL",
                    "origin": "https://repeat.example.test/private/path",
                    "provider": None,
                    "sender": None,
                    "subject": None,
                    "outcome": "NO_STRONG_WARNING_SIGNS",
                    "cloud_status": "COMPLETE",
                    "occurred_at": detected_at,
                }]},
            )
            self.assertEqual(202, ingested.status_code, ingested.text)
            events.append(event_id)

        self.login("user@example.com", "correct horse battery staple")
        activity_by_client = {}
        with SessionLocal() as db:
            for row in db.scalars(select(ActivityEvent)).all():
                activity_by_client[row.client_event_id] = row.id

        first_feedback = self.client.post(
            "/api/v1/url-reports/from-activity",
            headers=self.csrf(),
            json={
                "activity_event_id": activity_by_client[events[0]],
                "url": "https://repeat.example.test/private/path",
                "verdict": "CORRECT",
                "confirmed": True,
            },
        )
        self.assertEqual(201, first_feedback.status_code, first_feedback.text)
        refreshed = self.client.get("/api/v1/activities?event_type=URL").json()["items"]
        submitted_by_id = {item["id"]: item["feedback_submitted"] for item in refreshed}
        self.assertTrue(submitted_by_id[activity_by_client[events[0]]])
        self.assertFalse(submitted_by_id[activity_by_client[events[1]]])

        empty = self.client.post(
            "/api/v1/url-reports/from-device-activity",
            headers={"Authorization": f"Bearer {token}"},
            json={},
        )
        self.assertEqual(422, empty.status_code)
        self.assertEqual(
            401,
            self.client.post(
                "/api/v1/url-reports/from-device-activity",
                json={
                    "client_event_id": events[1],
                    "url": "https://repeat.example.test/private/path",
                    "verdict": "CORRECT",
                    "confirmed": True,
                },
            ).status_code,
        )

        device_feedback = self.client.post(
            "/api/v1/url-reports/from-device-activity",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "client_event_id": events[1],
                "url": "https://repeat.example.test/private/path",
                "verdict": "CORRECT",
                "confirmed": True,
            },
        )
        self.assertEqual(201, device_feedback.status_code, device_feedback.text)
        self.assertFalse(device_feedback.json()["already_submitted"])
        repeated = self.client.post(
            "/api/v1/url-reports/from-device-activity",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "client_event_id": events[1],
                "url": "https://repeat.example.test/private/path",
                "verdict": "CORRECT",
                "confirmed": True,
            },
        )
        self.assertEqual(201, repeated.status_code, repeated.text)
        self.assertTrue(repeated.json()["already_submitted"])
        with SessionLocal() as db:
            self.assertEqual(2, db.scalar(select(func.count(UrlReport.id))))

    def test_regular_user_cannot_access_admin_api(self) -> None:
        self.login("user@example.com", "correct horse battery staple")
        response = self.client.get("/api/v1/admin/users")
        self.assertEqual(403, response.status_code)
        self.assertEqual(403, self.client.get("/api/v1/admin/training-data").status_code)
        self.assertEqual(403, self.client.get("/api/v1/admin/training-data/export.csv?candidate_type=URL").status_code)
        self.assertEqual(403, self.client.get("/api/v1/admin/training-data/automatic-export.csv?sample_type=URL").status_code)
        self.assertEqual(403, self.client.get("/api/v1/admin/email-reports").status_code)

    def test_explicit_email_review_encrypts_body_and_never_exposes_it_to_admin(self) -> None:
        synthetic_body = "Synthetic training message: confirm the sample invoice using the official portal."
        self.login("user@example.com", "correct horse battery staple")
        created = self.client.post(
            "/api/v1/email-reports",
            headers=self.csrf(),
            json={
                "provider": "gmail",
                "sender": "Synthetic Billing <billing@example.test>",
                "subject": "=Synthetic invoice review",
                "body": synthetic_body,
                "detector_outcome": "NEEDS_CAUTION",
                "classification": "LEGITIMATE",
                "reason": "INCORRECT_WARNING",
                "confirmed": True,
            },
        )
        self.assertEqual(201, created.status_code, created.text)
        report = created.json()["report"]
        self.assertTrue(report["body_included"])
        self.assertEqual(len(synthetic_body), report["body_character_count"])
        self.assertEqual("full_taglish_xlmr_512_headtail_seed13", report["detector_model_version"])
        self.assertNotIn(synthetic_body, created.text)
        self.assertNotIn("body_ciphertext", created.text)
        self.assertNotIn("body_fingerprint", created.text)

        duplicate = self.client.post(
            "/api/v1/email-reports",
            headers=self.csrf(),
            json={
                "provider": "gmail",
                "sender": "Synthetic Billing <billing@example.test>",
                "subject": "=Synthetic invoice review",
                "body": synthetic_body,
                "detector_outcome": "SUSPICIOUS_SIGNS_FOUND",
                "classification": "SUSPICIOUS",
                "confirmed": True,
            },
        )
        self.assertEqual(409, duplicate.status_code)

        with SessionLocal() as db:
            stored = db.get(EmailReport, report["id"])
            self.assertIsNotNone(stored)
            self.assertNotIn(synthetic_body, stored.body_ciphertext)
            self.assertNotIn(synthetic_body, stored.body_fingerprint)

        personal = self.client.get("/api/v1/email-reports")
        self.assertEqual(200, personal.status_code)
        self.assertNotIn(synthetic_body, personal.text)
        self.assertNotIn("body_ciphertext", personal.text)

        admin_client = TestClient(app)
        admin_login = admin_client.post(
            "/api/v1/auth/login",
            json={"email": "admin@example.com", "password": "admin correct horse battery"},
        )
        self.assertEqual(200, admin_login.status_code)
        queue = admin_client.get("/api/v1/admin/email-reports")
        self.assertEqual(200, queue.status_code, queue.text)
        self.assertEqual("ENCRYPTED_NOT_EXPOSED", queue.json()["body_access"])
        self.assertIn("Synthetic invoice review", queue.text)
        self.assertNotIn(synthetic_body, queue.text)
        self.assertNotIn("body_ciphertext", queue.text)
        self.assertNotIn("user_id", queue.text)

        approved = admin_client.patch(
            f"/api/v1/admin/email-reports/{report['id']}",
            headers={"X-CSRF-Token": admin_client.cookies.get("bantai_csrf")},
            json={
                "action": "APPROVE",
                "assessment": "LEGITIMATE",
                "reason": "Synthetic evidence was reviewed against the stated context.",
            },
        )
        self.assertEqual(200, approved.status_code, approved.text)
        self.assertEqual("APPROVED", approved.json()["report"]["training_status"])
        history = approved.json()["report"]["review_history"]
        self.assertEqual(1, len(history))
        self.assertEqual("Admin Test User", history[0]["reviewer"])
        self.assertEqual("Synthetic evidence was reviewed against the stated context.", history[0]["reason"])
        self.assertNotIn(synthetic_body, approved.text)

        training_data = admin_client.get("/api/v1/admin/training-data")
        self.assertEqual(200, training_data.status_code, training_data.text)
        email_data = training_data.json()["emails"]
        self.assertEqual(1, email_data["candidate_total"])
        self.assertEqual("ENCRYPTED_REVIEW_CONTENT", email_data["collection_status"])
        self.assertEqual("full_taglish_xlmr_512_headtail_seed13", email_data["deployed_model_identifier"])
        self.assertIn("legacy values are not relabeled", email_data["provenance_note"])
        self.assertTrue(email_data["items"][0]["body_included"])
        self.assertNotIn(synthetic_body, training_data.text)
        self.assertNotIn("body_ciphertext", training_data.text)
        self.assertNotIn("body_fingerprint", training_data.text)

        exported = admin_client.get("/api/v1/admin/training-data/export.csv?candidate_type=EMAIL")
        self.assertEqual(200, exported.status_code, exported.text)
        self.assertIn('filename="bantai-email-training-manifest-', exported.headers["content-disposition"])
        rows = list(csv.DictReader(io.StringIO(exported.content.decode("utf-8-sig"))))
        self.assertEqual(1, len(rows))
        self.assertEqual("LEGITIMATE", rows[0]["approved_label"])
        self.assertEqual("TRUE", rows[0]["body_available"])
        self.assertEqual(str(len(synthetic_body)), rows[0]["body_character_count"])
        self.assertEqual("RESTRICTED_TRAINING_PROCESS_ONLY", rows[0]["content_access"])
        self.assertEqual("'=Synthetic invoice review", rows[0]["subject"])
        self.assertNotIn("url", rows[0])
        self.assertNotIn(synthetic_body, exported.text)
        self.assertNotIn("body_ciphertext", exported.text)
        self.assertNotIn("body_fingerprint", exported.text)
        self.assertNotIn("user_id", exported.text)

        with SessionLocal() as db:
            candidate = db.scalar(select(EmailTrainingCandidate))
            self.assertIsNotNone(candidate)
            self.assertNotIn(synthetic_body, candidate.body_ciphertext)
            self.assertFalse(hasattr(candidate, "user_id"))

    def test_device_email_feedback_requires_a_matching_detection_and_encrypts_the_body(self) -> None:
        token = self.paired_device_token()
        synthetic_body = "Synthetic opened-email content for explicit extension feedback."
        ingested = self.client.post(
            "/api/v1/activities",
            headers={"Authorization": f"Bearer {token}"},
            json={"events": [{
                "client_event_id": "device-email-feedback-0001",
                "event_type": "EMAIL",
                "origin": None,
                "provider": "gmail",
                "sender": "sender@example.test",
                "subject": "Synthetic account notice",
                "outcome": "SUSPICIOUS_SIGNS_FOUND",
                "cloud_status": "COMPLETE",
                "occurred_at": "2026-08-12T10:00:00+08:00",
            }]},
        )
        self.assertEqual(202, ingested.status_code, ingested.text)

        payload = {
            "client_event_id": "device-email-feedback-0001",
            "provider": "gmail",
            "sender": "sender@example.test",
            "subject": "Synthetic account notice",
            "body": synthetic_body,
            "verdict": "INCORRECT",
            "classification": "LEGITIMATE",
            "reason": "INCORRECT_WARNING",
            "confirmed": True,
        }
        self.assertEqual(
            401,
            self.client.post("/api/v1/email-reports/from-device-activity", json=payload).status_code,
        )
        mismatched = self.client.post(
            "/api/v1/email-reports/from-device-activity",
            headers={"Authorization": f"Bearer {token}"},
            json={**payload, "subject": "Different email"},
        )
        self.assertEqual(422, mismatched.status_code, mismatched.text)

        submitted = self.client.post(
            "/api/v1/email-reports/from-device-activity",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        self.assertEqual(201, submitted.status_code, submitted.text)
        self.assertFalse(submitted.json()["already_submitted"])
        self.assertNotIn(synthetic_body, submitted.text)
        self.assertNotIn("body_ciphertext", submitted.text)

        repeated = self.client.post(
            "/api/v1/email-reports/from-device-activity",
            headers={"Authorization": f"Bearer {token}"},
            json=payload,
        )
        self.assertEqual(201, repeated.status_code, repeated.text)
        self.assertTrue(repeated.json()["already_submitted"])
        with SessionLocal() as db:
            stored = db.scalar(select(EmailReport))
            self.assertIsNotNone(stored)
            self.assertEqual("LEGITIMATE", stored.user_classification.value)
            self.assertNotIn(synthetic_body, stored.body_ciphertext)
            self.assertEqual(1, db.scalar(select(func.count(EmailReport.id))))

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
            event = ActivityEvent(
                user_id=self.user_id,
                device_id=device.id,
                client_event_id="old-event-0001",
                event_type="URL",
                origin_encrypted=encrypt_text("https://example.com"),
                outcome="NEEDS_CAUTION",
                cloud_status="COMPLETE",
                occurred_at=utcnow() - timedelta(days=91),
            )
            db.add(event)
            db.flush()
            db.add(
                UrlReport(
                    user_id=self.user_id,
                    activity_event_id=event.id,
                    origin_encrypted=encrypt_text("https://example.com"),
                    detector_outcome="NEEDS_CAUTION",
                    user_classification="SUSPICIOUS",
                    submitted_at=utcnow() - timedelta(days=91),
                )
            )
            db.commit()
            cleanup_expired(db)
            total = db.scalar(select(func.count(ActivityEvent.id)))
            self.assertEqual(0, total)
            reports = db.scalar(select(func.count(UrlReport.id)))
            self.assertEqual(0, reports)

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

    def test_remote_url_detection_is_authenticated_idempotent_and_origin_only(self) -> None:
        payload = {
            "client_event_id": "remote-url-detection-0001",
            "url": "https://remote.example.test/private/path?secret=synthetic#fragment",
            "occurred_at": "2026-09-06T10:00:00+08:00",
        }
        self.assertEqual(401, self.client.post("/api/v1/detections/url", json=payload).status_code)
        token = self.paired_device_token()
        headers = {"Authorization": f"Bearer {token}"}
        detector_result = {
            "signal": "SAFE",
            "final_result": "NO_STRONG_WARNING_SIGNS",
            "current_url": payload["url"],
            "hostname": "remote.example.test",
            "message": "No strong warning signs were detected; this is not a guarantee.",
            "llm_review": {"status": "OFF", "failure_reason": None},
        }
        with patch("shared_platform.app.main.detector_gateway.analyze_url", return_value=detector_result) as analyze, patch(
            "shared_platform.app.main.secrets.randbelow", return_value=99
        ):
            first = self.client.post("/api/v1/detections/url", headers=headers, json=payload)
            second = self.client.post("/api/v1/detections/url", headers=headers, json=payload)
        self.assertEqual(200, first.status_code, first.text)
        self.assertEqual(first.json()["detection_id"], second.json()["detection_id"])
        collision = self.client.post(
            "/api/v1/detections/url",
            headers=headers,
            json={**payload, "url": "https://different.example.test/path"},
        )
        self.assertEqual(409, collision.status_code, collision.text)
        analyze.assert_called_once_with(payload["url"])
        feedback = self.client.post(
            "/api/v1/url-reports/from-device-activity",
            headers=headers,
            json={
                "client_event_id": payload["client_event_id"],
                "verdict": "CORRECT",
                "confirmed": True,
            },
        )
        self.assertEqual(201, feedback.status_code, feedback.text)
        with SessionLocal() as db:
            events = list(db.scalars(select(ActivityEvent)).all())
            self.assertEqual(1, len(events))
            self.assertEqual("https://remote.example.test", decrypt_text(events[0].origin_encrypted))
            self.assertIsNotNone(events[0].automatic_sample_decided_at)
            self.assertFalse(events[0].automatic_sample_selected)
            self.assertNotIn("private/path", str(events[0].__dict__))
            self.assertNotIn("secret=synthetic", str(events[0].__dict__))
            report = db.scalar(select(UrlReport))
            self.assertEqual(payload["url"], decrypt_text(report.origin_encrypted))

    def test_remote_email_detection_samples_once_and_context_is_account_scoped(self) -> None:
        token = self.paired_device_token()
        headers = {"Authorization": f"Bearer {token}"}
        with SessionLocal() as db:
            user = db.get(User, self.user_id)
            user.training_collection_enabled = True
            user.training_consent_version = "2026-08-v1"
            db.commit()
        payload = {
            "client_event_id": "remote-email-detection-0001",
            "sender_authentication": {"source": "SENDER_DETAILS", "signed_by": "example.test", "raw_headers": "private@example.test"},
            "provider": "gmail",
            "sender": "Synthetic Sender <sender@example.test>",
            "subject": "Synthetic account notice",
            "body": "Synthetic body asks for OTP 123456. It must be transient outside opted-in encrypted storage.",
            "current_url": "https://mail.google.com/mail/u/0/#inbox/synthetic",
            "occurred_at": "2026-09-06T10:01:00+08:00",
        }
        detector_result = {
            "analysis_id": "private-detector-id",
            "email_model": {"signal": "SUSPICIOUS"},
            "url_model": {"signal": "SAFE", "current_url": payload["current_url"]},
            "local_indicators": {"strong_count": 1, "critical_count": 1, "markers": []},
            "llm_review": {"status": "SUSPICIOUS_SIGNS_FOUND"},
            "fusion": {"final_result": "SUSPICIOUS_SIGNS_FOUND"},
        }
        with patch("shared_platform.app.main.detector_gateway.analyze_email", return_value=detector_result) as detector, patch(
            "shared_platform.app.main.secrets.randbelow", return_value=0
        ):
            response = self.client.post("/api/v1/detections/email", headers=headers, json=payload)
        self.assertEqual(200, response.status_code, response.text)
        detection_id = response.json()["detection_id"]
        self.assertEqual({"source": "SENDER_DETAILS", "provider": "gmail", "signed_by": "example.test"}, detector.call_args.kwargs["sender_authentication"])
        self.assertEqual(payload["client_event_id"], response.json()["analysis_id"])
        body_collision = self.client.post(
            "/api/v1/detections/email",
            headers=headers,
            json={**payload, "body": "A different synthetic opened email body."},
        )
        self.assertEqual(409, body_collision.status_code, body_collision.text)
        with SessionLocal() as db:
            event = db.get(ActivityEvent, detection_id)
            sample = db.scalar(select(AutomaticTrainingSample).where(AutomaticTrainingSample.client_event_id == payload["client_event_id"]))
            self.assertIsNotNone(event)
            self.assertIsNotNone(sample)
            self.assertNotEqual(payload["body"], sample.body_ciphertext)
            self.assertEqual(payload["body"], decrypt_text(sample.body_ciphertext))
            self.assertNotIn(payload["body"], str(event.__dict__))

        explanation = {
            "status": "COMPLETE",
            "assessment": "SUSPICIOUS_SIGNS_FOUND",
            "reasoning_summary": "Synthetic warning explanation.",
            "indicators": [],
        }
        with patch("shared_platform.app.main.explain_activity", return_value=explanation) as explain:
            explained = self.client.post(f"/api/v1/detections/{detection_id}/explanation", headers=headers)
        self.assertEqual(200, explained.status_code, explained.text)
        self.assertTrue(explained.json()["full_context_available"])
        self.assertEqual(payload["body"], explain.call_args.args[0]["email_body"])
        self.assertEqual("example.test", explain.call_args.args[0]["sender_authentication"]["signed_by"])
        self.assertNotIn("raw_headers", explain.call_args.args[0]["sender_authentication"])

        # Reopening the same email restores expired memory on the same record.
        from shared_platform.app.transient_context import transient_detections
        with SessionLocal() as db:
            device_id = db.get(ActivityEvent, detection_id).device_id
        transient_detections.clear_device(self.user_id, device_id)
        with patch("shared_platform.app.main.detector_gateway.analyze_email") as inference:
            context_restored = self.client.post("/api/v1/detections/email/context", headers=headers, json=payload)
            self.assertEqual(200, context_restored.status_code, context_restored.text)
            self.assertTrue(context_restored.json()["restored"])
            inference.assert_not_called()
            mismatch = self.client.post("/api/v1/detections/email/context", headers=headers,
                                        json={**payload, "body": "A different synthetic email."})
            self.assertEqual(409, mismatch.status_code)
        restored_context = transient_detections.get(self.user_id, device_id, detection_id)
        self.assertEqual(payload["body"], restored_context["body"])
        transient_detections.clear_device(self.user_id, device_id)
        with patch("shared_platform.app.main.detector_gateway.analyze_email", return_value=detector_result):
            restored = self.client.post("/api/v1/detections/email", headers=headers, json=payload)
        self.assertEqual(200, restored.status_code, restored.text)
        self.assertEqual(detection_id, restored.json()["detection_id"])
        self.assertFalse(restored.json()["activity_recorded"])
        self.login("user@example.com", "correct horse battery staple")
        with patch("shared_platform.app.main.explain_activity", return_value=explanation) as explain:
            explained = self.client.post(
                f"/api/v1/activities/{detection_id}/explanation", headers=self.csrf()
            )
        self.assertEqual(200, explained.status_code, explained.text)
        self.assertTrue(explained.json()["full_context_available"])
        self.assertEqual(payload["body"], explain.call_args.args[0]["email_body"])

        feedback = self.client.post(
            "/api/v1/email-reports/from-device-activity",
            headers=headers,
            json={
                "client_event_id": payload["client_event_id"],
                "provider": payload["provider"],
                "sender": payload["sender"],
                "subject": payload["subject"],
                "verdict": "CORRECT",
                "confirmed": True,
            },
        )
        self.assertEqual(201, feedback.status_code, feedback.text)
        with SessionLocal() as db:
            report = db.scalar(select(EmailReport))
            self.assertEqual(payload["body"], decrypt_text(report.body_ciphertext))

        other_token = "other-device-token"
        with SessionLocal() as db:
            other = User(
                email="other@example.com",
                first_name="Other",
                last_name="User",
                password_hash=hash_password("other correct horse battery"),
                status=UserStatus.ACTIVE,
            )
            db.add(other)
            db.flush()
            db.add(PairedDevice(user_id=other.id, token_hash=token_hash(other_token), label="Other extension"))
            db.commit()
        isolated = self.client.post(
            f"/api/v1/detections/{detection_id}/explanation",
            headers={"Authorization": f"Bearer {other_token}"},
        )
        self.assertEqual(404, isolated.status_code)

    def test_remote_collection_rechecks_consent_after_inference_finishes(self) -> None:
        token = self.paired_device_token()
        with SessionLocal() as db:
            user = db.get(User, self.user_id)
            user.training_collection_enabled = True
            user.training_consent_version = "2026-08-v1"
            db.commit()

        def finish_after_opt_out(**_kwargs):
            with SessionLocal() as db:
                user = db.get(User, self.user_id)
                user.training_collection_enabled = False
                user.training_consent_version = None
                db.commit()
            return {
                "analysis_id": "private-detector-opt-out",
                "email_model": {"signal": "SAFE"},
                "url_model": {"signal": "SAFE"},
                "local_indicators": {"strong_count": 0, "critical_count": 0, "markers": []},
                "llm_review": {"status": "NO_STRONG_WARNING_SIGNS"},
                "fusion": {"final_result": "NO_STRONG_WARNING_SIGNS"},
            }

        with patch(
            "shared_platform.app.main.detector_gateway.analyze_email",
            side_effect=finish_after_opt_out,
        ), patch("shared_platform.app.main.secrets.randbelow", return_value=0):
            response = self.client.post(
                "/api/v1/detections/email",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "client_event_id": "remote-email-opt-out-0001",
                    "provider": "gmail",
                    "sender": "Synthetic Sender <sender@example.test>",
                    "subject": "Synthetic consent timing",
                    "body": "Synthetic body that must not be collected after opt-out.",
                    "current_url": "https://mail.google.com/mail/u/0/#inbox/consent",
                    "occurred_at": "2026-09-06T10:01:30+08:00",
                },
            )
        self.assertEqual(200, response.status_code, response.text)
        self.assertEqual("NOT_OPTED_IN", response.json()["automatic_collection"]["reason"])
        with SessionLocal() as db:
            self.assertEqual(0, db.scalar(select(func.count(AutomaticTrainingSample.id))) or 0)

    def test_remote_detector_failure_does_not_record_a_safe_activity(self) -> None:
        from shared_platform.app.detector_gateway import DetectorUnavailable

        token = self.paired_device_token()
        with patch(
            "shared_platform.app.main.detector_gateway.analyze_url",
            side_effect=DetectorUnavailable("BantAI server models are temporarily unavailable."),
        ):
            response = self.client.post(
                "/api/v1/detections/url",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "client_event_id": "remote-url-failure-0001",
                    "url": "https://failure.example.test/path",
                    "occurred_at": "2026-09-06T10:02:00+08:00",
                },
            )
        self.assertEqual(503, response.status_code, response.text)
        with SessionLocal() as db:
            self.assertEqual(0, db.scalar(select(func.count(ActivityEvent.id))) or 0)

    def test_device_revocation_stops_remote_detection_requests(self) -> None:
        token = self.paired_device_token()
        with SessionLocal() as db:
            device = db.scalar(select(PairedDevice).where(PairedDevice.token_hash == token_hash(token)))
            device_id = device.id
        self.login("user@example.com", "correct horse battery staple")
        revoked = self.client.delete(f"/api/v1/devices/{device_id}", headers=self.csrf())
        self.assertEqual(204, revoked.status_code, revoked.text)

        denied = self.client.post(
            "/api/v1/detections/url",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "client_event_id": "remote-revoked-device-0001",
                "url": "https://revoked.example.test/path",
                "occurred_at": "2026-09-06T10:03:00+08:00",
            },
        )
        self.assertEqual(401, denied.status_code, denied.text)

    def test_explanation_budget_is_shared_across_ids_devices_and_routes(self):
        token = self.paired_device_token()
        headers = {"Authorization": f"Bearer {token}"}
        payload = {"client_event_id": "budget-event-0001", "url": "https://example.test/a", "occurred_at": "2026-09-06T10:00:00Z"}
        result = {"signal": "SAFE", "final_result": "NO_STRONG_WARNING_SIGNS"}
        with patch("shared_platform.app.main.detector_gateway.analyze_url", return_value=result):
            ids = [self.client.post("/api/v1/detections/url", headers=headers, json={**payload, "client_event_id": f"budget-event-{i:04}"}).json()["detection_id"] for i in range(2)]
        self.login("user@example.com", "correct horse battery staple")
        variants = [
            (f"/api/v1/detections/{ids[0]}/explanation", headers, None),
            (f"/api/v1/activities/{ids[1]}/explanation", self.csrf(), None),
            ("/api/v1/cloud-review/activity-explanation", headers, {"activity_id": ids[0], "client_event_id": "budget-event-0000", "event_type": "URL", "outcome": "NO_STRONG_WARNING_SIGNS", "url": payload["url"]}),
            ("/api/v1/cloud-review/activity-explanation-fallback", headers, {"activity_id": ids[1], "client_event_id": "budget-event-0001"}),
        ]
        with patch("shared_platform.app.main.explain_activity", return_value={"status": "COMPLETE"}) as provider:
            for i in range(20):
                route, auth, body = variants[i % len(variants)]
                response = self.client.post(route, headers=auth, json=body)
                self.assertEqual(200, response.status_code, response.text)
            for route, auth, body in variants:
                response = self.client.post(route, headers=auth, json=body)
                self.assertEqual(429, response.status_code, response.text)
                self.assertEqual("300", response.headers["Retry-After"])
            # A second credential and a new client/IP still share the account budget.
            second = "synthetic-second-device-token"
            with SessionLocal() as db:
                db.add(PairedDevice(user_id=self.user_id, token_hash=token_hash(second), label="Second synthetic device"))
                db.commit()
            response = self.client.post(variants[3][0], headers={"Authorization": f"Bearer {second}"}, json=variants[3][2])
            self.assertEqual(429, response.status_code, response.text)
            self.assertEqual(20, provider.call_count)
            with SessionLocal() as db:
                user = db.get(User, self.user_id)
                user.explanation_window_started_at = utcnow() - timedelta(minutes=6)
                db.commit()
            self.assertEqual(200, self.client.post(variants[0][0], headers=headers).status_code)
            self.assertEqual(21, provider.call_count)

    def test_retry_fingerprints_survive_expiry_and_reject_changed_input_and_legacy(self):
        from shared_platform.app.transient_context import transient_detections
        token = self.paired_device_token()
        headers = {"Authorization": f"Bearer {token}"}
        for kind in ("url", "email"):
            with self.subTest(kind=kind):
                payload = {"client_event_id": f"expiry-{kind}-0001", "occurred_at": "2026-09-06T10:00:00Z"}
                if kind == "url":
                    payload.update(url="https://example.test/first?x=1#one")
                    result = {"signal": "SAFE", "final_result": "NO_STRONG_WARNING_SIGNS"}
                    changes = [{"url": "https://example.test/second?x=1#one"}, {"url": "https://example.test/first?x=2#one"}]
                else:
                    payload.update(provider="gmail", sender="sender@example.test", subject="Synthetic notice", body="Synthetic body", current_url="https://mail.google.com/mail/u/0/#inbox/one", sender_authentication={})
                    result = {"email_model": {"signal": "SAFE"}, "fusion": {"final_result": "NO_STRONG_WARNING_SIGNS"}, "llm_review": {"status": "NO_STRONG_WARNING_SIGNS"}}
                    changes = [{"body": "Changed synthetic body"}, {"sender_authentication": {"source": "MESSAGE_HEADERS", "dkim": "pass"}}, {"sender_authentication": {"source": "MESSAGE_HEADERS", "dkim": "fail"}}, {"current_url": "https://mail.google.com/mail/u/0/#inbox/two"}]
                route = f"/api/v1/detections/{kind}"
                with patch(f"shared_platform.app.main.detector_gateway.analyze_{kind}", return_value=result) as provider:
                    first = self.client.post(route, headers=headers, json=payload)
                    self.assertEqual(200, first.status_code, first.text)
                    detection_id = first.json()["detection_id"]
                    self.assertEqual(200, self.client.post(route, headers=headers, json=payload).status_code)
                    self.assertEqual(1, provider.call_count)
                    with SessionLocal() as db:
                        event = db.get(ActivityEvent, detection_id)
                        device_id = event.device_id
                        self.assertEqual(64, len(event.inference_fingerprint))
                        sampling_time = event.automatic_sample_decided_at
                    # Expiry has the same storage behavior as a fresh worker process.
                    transient_detections.clear_device(self.user_id, device_id)
                    for change in changes:
                        response = self.client.post(route, headers=headers, json={**payload, **change})
                        self.assertEqual(409, response.status_code, response.text)
                    self.assertEqual(1, provider.call_count)
                    from shared_platform.app.transient_context import TransientDetectionStore
                    fresh_store = TransientDetectionStore(60, 10)
                    with patch("shared_platform.app.main.transient_detections", fresh_store):
                        restarted = self.client.post(route, headers=headers, json=payload)
                        self.assertEqual(200, restarted.status_code, restarted.text)
                        self.assertEqual(detection_id, restarted.json()["detection_id"])
                        self.assertIsNotNone(fresh_store.get(self.user_id, device_id, detection_id))
                    restored = self.client.post(route, headers=headers, json=payload)
                    self.assertEqual(200, restored.status_code, restored.text)
                    self.assertEqual(detection_id, restored.json()["detection_id"])
                    self.assertIsNotNone(transient_detections.get(self.user_id, device_id, detection_id))
                    transient_detections.clear_device(self.user_id, device_id)
                    changed_result = {**result, "final_result": "NEEDS_CAUTION"} if kind == "url" else {**result, "fusion": {"final_result": "NEEDS_CAUTION"}}
                    provider.return_value = changed_result
                    response = self.client.post(route, headers=headers, json=payload)
                    self.assertEqual(409, response.status_code, response.text)
                    with SessionLocal() as db:
                        event = db.get(ActivityEvent, detection_id)
                        self.assertEqual("NO_STRONG_WARNING_SIGNS", event.outcome.value)
                        self.assertEqual(sampling_time, event.automatic_sample_decided_at)
                        event.inference_fingerprint = None
                        db.commit()
                    provider.reset_mock()
                    self.assertEqual(409, self.client.post(route, headers=headers, json=payload).status_code)
                    provider.assert_not_called()

    def test_concurrent_detection_retries_validate_the_unique_insert_winner(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from tempfile import TemporaryDirectory
        from sqlalchemy import create_engine
        from sqlalchemy.orm import sessionmaker
        from shared_platform.app.database import get_db
        from shared_platform.app.transient_context import transient_detections
        # A file database gives each request an independent real transaction.
        with TemporaryDirectory() as directory:
            concurrent_engine = create_engine(f"sqlite:///{directory}/concurrency.db", connect_args={"check_same_thread": False})
            factory = sessionmaker(bind=concurrent_engine, expire_on_commit=False)
            Base.metadata.create_all(concurrent_engine)
            with factory() as db:
                user = User(email="concurrent@example.test", first_name="Synthetic", last_name="User", password_hash="unused", status=UserStatus.ACTIVE, training_collection_enabled=True, training_consent_version="2026-08-v1")
                db.add(user)
                db.flush()
                device = PairedDevice(user_id=user.id, token_hash=token_hash("synthetic-concurrency-token"), label="Synthetic")
                db.add(device)
                db.commit()
                user_id, device_id = user.id, device.id
            def database():
                with factory() as db:
                    yield db
            app.dependency_overrides[get_db] = database
            try:
                for mode in ("identical", "changed_input", "changed_result"):
                    barrier = Barrier(2)
                    decisions = iter(["NO_STRONG_WARNING_SIGNS", "NEEDS_CAUTION"])
                    def analyze(url):
                        decision = next(decisions) if mode == "changed_result" else "NO_STRONG_WARNING_SIGNS"
                        barrier.wait(timeout=10)
                        return {"signal": "SAFE", "final_result": decision}
                    def request(index):
                        client = TestClient(app)
                        return client.post("/api/v1/detections/url", headers={"Authorization": "Bearer synthetic-concurrency-token"}, json={"client_event_id": f"concurrent-{mode}", "url": "https://example.test/a" + (str(index) if mode == "changed_input" else ""), "occurred_at": "2026-09-06T10:00:00Z"})
                    with patch("shared_platform.app.main.detector_gateway.analyze_url", side_effect=analyze), patch("shared_platform.app.main.secrets.randbelow", return_value=0) as sample, ThreadPoolExecutor(max_workers=2) as executor:
                        responses = list(executor.map(request, range(2)))
                    self.assertEqual([200, 200] if mode == "identical" else [200, 409], sorted(r.status_code for r in responses), [r.text for r in responses])
                    self.assertEqual(1, sample.call_count)
                    with factory() as db:
                        events = list(db.scalars(select(ActivityEvent).where(ActivityEvent.client_event_id == f"concurrent-{mode}")))
                        self.assertEqual(1, len(events))
                        for response in responses:
                            if response.status_code == 200:
                                self.assertEqual(events[0].outcome.value, response.json()["final_result"])
                        self.assertEqual(1, db.scalar(select(func.count()).select_from(AutomaticTrainingSample).where(AutomaticTrainingSample.client_event_id == f"concurrent-{mode}")))
                    transient_detections.clear_device(user_id, device_id)
            finally:
                app.dependency_overrides.pop(get_db, None)
                concurrent_engine.dispose()

    def test_input_budget_migration_preserves_legacy_rows(self):
        import importlib.util
        from pathlib import Path
        from alembic.migration import MigrationContext
        from alembic.operations import Operations
        from sqlalchemy import create_engine, text
        spec = importlib.util.spec_from_file_location("input_budget_migration", Path(__file__).parents[1] / "alembic/versions/0013_detection_input_explanation_limit.py")
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        test_engine = create_engine("sqlite:///:memory:")
        try:
            with test_engine.begin() as connection:
                connection.execute(text("CREATE TABLE users (id VARCHAR(36) PRIMARY KEY)"))
                connection.execute(text("CREATE TABLE activity_events (id VARCHAR(36) PRIMARY KEY, outcome VARCHAR(40))"))
                connection.execute(text("INSERT INTO users (id) VALUES ('synthetic-user')"))
                connection.execute(text("INSERT INTO activity_events VALUES ('synthetic-event', 'NEEDS_CAUTION')"))
                with patch.object(migration, "op", Operations(MigrationContext.configure(connection))):
                    migration.upgrade()
                    self.assertEqual(("synthetic-event", "NEEDS_CAUTION", None), tuple(connection.execute(text("SELECT * FROM activity_events")).one()))
                    self.assertEqual(("synthetic-user", None, 0), tuple(connection.execute(text("SELECT * FROM users")).one()))
                    migration.downgrade()
                    self.assertEqual(("synthetic-event", "NEEDS_CAUTION"), tuple(connection.execute(text("SELECT * FROM activity_events")).one()))
        finally:
            test_engine.dispose()


if __name__ == "__main__":
    unittest.main()
