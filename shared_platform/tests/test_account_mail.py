from __future__ import annotations

import smtplib
import unittest
from dataclasses import replace
from unittest.mock import patch

class GmailSmtpMailTests(unittest.TestCase):
    def setUp(self) -> None:
        # Import after test_platform installs its isolated in-memory database env.
        from shared_platform.app.account_mail import MailDeliveryError, send_account_email
        from shared_platform.app.config import settings

        self.MailDeliveryError = MailDeliveryError
        self.send_account_email = send_account_email
        self.settings = settings

    def test_verification_email_uses_encrypted_gmail_smtp_and_app_password(self) -> None:
        configured = replace(
            self.settings,
            gmail_smtp_email="sender@gmail.com",
            gmail_smtp_app_password="synthetic-app-password",
            web_origin="https://app.example.test",
        )
        with patch("shared_platform.app.account_mail.settings", configured), patch("shared_platform.app.account_mail.smtplib.SMTP_SSL") as smtp:
            self.send_account_email(recipient="person@example.test", token="synthetic-token", purpose="EMAIL_VERIFICATION")
        self.assertEqual(("smtp.gmail.com", 465), smtp.call_args.args)
        self.assertEqual(10.0, smtp.call_args.kwargs["timeout"])
        self.assertIsNotNone(smtp.call_args.kwargs["context"])
        client = smtp.return_value.__enter__.return_value
        client.login.assert_called_once_with("sender@gmail.com", "synthetic-app-password")
        message = client.send_message.call_args.args[0]
        self.assertEqual("Signalam <sender@gmail.com>", message["From"])
        self.assertEqual("person@example.test", message["To"])
        self.assertEqual("Verify your Signalam account", message["Subject"])
        self.assertIn("https://app.example.test/verify-email#token=synthetic-token", message.get_body(preferencelist=("plain",)).get_content())

    def test_password_reset_and_auth_failure_are_handled_without_exposing_smtp_reply(self) -> None:
        configured = replace(self.settings, gmail_smtp_email="sender@gmail.com", gmail_smtp_app_password="synthetic-app-password")
        with patch("shared_platform.app.account_mail.settings", configured), patch("shared_platform.app.account_mail.smtplib.SMTP_SSL") as smtp:
            self.send_account_email(recipient="person@example.test", token="synthetic-reset", purpose="PASSWORD_RESET")
            message = smtp.return_value.__enter__.return_value.send_message.call_args.args[0]
            self.assertIn("/reset-password#token=synthetic-reset", message.get_body(preferencelist=("plain",)).get_content())
            smtp.return_value.__enter__.return_value.login.side_effect = smtplib.SMTPAuthenticationError(535, b"synthetic private reply")
            with self.assertRaises(self.MailDeliveryError) as caught:
                self.send_account_email(recipient="person@example.test", token="synthetic-reset", purpose="PASSWORD_RESET")
        self.assertNotIn("synthetic private reply", str(caught.exception))

    def test_missing_app_password_never_opens_smtp_connection(self) -> None:
        configured = replace(self.settings, gmail_smtp_email="sender@gmail.com", gmail_smtp_app_password="")
        with patch("shared_platform.app.account_mail.settings", configured), patch("shared_platform.app.account_mail.smtplib.SMTP_SSL") as smtp:
            with self.assertRaises(self.MailDeliveryError):
                self.send_account_email(recipient="person@example.test", token="synthetic-token", purpose="EMAIL_VERIFICATION")
        smtp.assert_not_called()

    def test_unsupported_purpose_never_opens_smtp_connection(self) -> None:
        configured = replace(self.settings, gmail_smtp_email="sender@gmail.com", gmail_smtp_app_password="synthetic-app-password")
        with patch("shared_platform.app.account_mail.settings", configured), patch("shared_platform.app.account_mail.smtplib.SMTP_SSL") as smtp:
            with self.assertRaises(ValueError):
                self.send_account_email(recipient="person@example.test", token="synthetic-token", purpose="OTHER")
        smtp.assert_not_called()
