from __future__ import annotations

import base64
import csv
import io
import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch


os.environ["BANTAI_DATABASE_URL"] = "sqlite+pysqlite:///:memory:"
os.environ["BANTAI_CREATE_SCHEMA"] = "true"
os.environ["BANTAI_COOKIE_SECURE"] = "false"
os.environ["BANTAI_ENCRYPTION_KEY"] = base64.urlsafe_b64encode(b"bantai-test-encryption-key-32byt").decode()

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from shared_platform.app.database import Base, SessionLocal, engine
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
        self.assertNotIn("email_delivery", health.json())
        self.assertNotIn("api_key", health.text.lower())
        self.assertNotIn("GEMINI_API_KEY", health.text)

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

        self.assertEqual(202, self.client.post("/api/v1/training-samples", headers=device_headers, json=url_payload).status_code)
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
            "analysis_scope": "FULL_URL",
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
        self.assertEqual(
            "https://explain.example.test/private/path?secret=1#fragment",
            url_payload["full_url"],
        )
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
        overview = self.client.get("/api/v1/admin/dashboard?days=30")
        self.assertEqual(200, overview.status_code)
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
        self.assertEqual("RF V4-B", report["detector_model_version"])
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
            self.assertEqual("RF V4-B", candidate.detector_model_version)
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
        self.assertEqual("RF V4-B", payload["urls"]["model_version"])
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
            json={"action": "APPROVE", "assessment": "LEGITIMATE"},
        )
        self.assertEqual(200, approved.status_code, approved.text)
        self.assertEqual("APPROVED", approved.json()["report"]["training_status"])
        self.assertNotIn(synthetic_body, approved.text)

        training_data = admin_client.get("/api/v1/admin/training-data")
        self.assertEqual(200, training_data.status_code, training_data.text)
        email_data = training_data.json()["emails"]
        self.assertEqual(1, email_data["candidate_total"])
        self.assertEqual("ENCRYPTED_REVIEW_CONTENT", email_data["collection_status"])
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


if __name__ == "__main__":
    unittest.main()
