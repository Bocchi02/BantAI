from __future__ import annotations

import smtplib
from email.message import EmailMessage

from .config import settings


def send_account_link(*, recipient: str, subject: str, path: str) -> None:
    if not settings.smtp_host:
        # Development intentionally reveals no token in API responses or logs.
        return
    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = recipient
    message["Subject"] = subject
    message.set_content(f"Open this BantAI link to continue:\n\n{settings.web_origin}{path}\n")
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        if settings.smtp_starttls:
            smtp.starttls()
        if settings.smtp_username:
            smtp.login(settings.smtp_username, settings.smtp_password)
        smtp.send_message(message)

