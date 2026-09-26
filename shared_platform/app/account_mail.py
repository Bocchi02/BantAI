"""Send account verification and reset messages through encrypted Gmail SMTP."""

from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from html import escape
from urllib.parse import urlencode

from .config import settings


class MailDeliveryError(Exception):
    """An account email could not be accepted by Gmail SMTP."""


def send_account_email(*, recipient: str, token: str, purpose: str) -> None:
    if not settings.email_delivery_ready:
        raise MailDeliveryError()
    if purpose == "EMAIL_VERIFICATION":
        path = "/verify-email"
        subject = "Verify your Signalam account"
        action = "Verify your email address"
        lifetime = "24 hours"
    elif purpose == "PASSWORD_RESET":
        path = "/reset-password"
        subject = "Reset your Signalam password"
        action = "Reset your password"
        lifetime = "30 minutes"
    else:
        raise ValueError("Unsupported account email purpose")

    # The fragment is not sent in the HTTP request or embedded in Next's RSC
    # response, so one-time tokens stay out of server URL logs and HTML.
    link = f"{settings.web_origin}{path}#{urlencode({'token': token})}"
    plain = (
        f"{action} by opening this link:\n{link}\n\n"
        f"This link expires in {lifetime} and can be used once. "
        "If you did not request this, you can ignore this message."
    )
    html = (
        "<html><body><h1>Signalam</h1>"
        f"<p>{escape(action)}:</p><p><a href=\"{escape(link, quote=True)}\">{escape(action)}</a></p>"
        f"<p>This link expires in {lifetime} and can be used once.</p>"
        "<p>If you did not request this, you can ignore this message.</p></body></html>"
    )
    try:
        message = EmailMessage()
        message["From"] = formataddr(("Signalam", settings.gmail_smtp_email))
        message["To"] = recipient
        message["Subject"] = subject
        message.set_content(plain)
        message.add_alternative(html, subtype="html")
        # TLS is established before authentication or message submission.
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=10.0, context=ssl.create_default_context()) as client:
            client.login(settings.gmail_smtp_email, settings.gmail_smtp_app_password)
            client.send_message(message)
    except (smtplib.SMTPException, OSError, ValueError):
        # SMTP replies may contain addresses; never expose them through API errors.
        raise MailDeliveryError() from None
