# BantAI web platform MVP

## Components

- `web/`: responsive React, TypeScript, and Tailwind account/dashboard UI.
- `shared_platform/`: FastAPI, SQLAlchemy, Alembic, and MySQL service.
- `backend/companion.py`: DPAPI-protected pairing credential and bounded event outbox.
- `companion/`: Windows tray host and installer build definition.
- `extension/`: pairing UI and terminal-result submission.

The account experience includes separate first, optional middle, and last name
fields, an editable Profile page, authenticated password changes, and explicit
sign-out from the Profile page.

The personal dashboard includes a live Protection connections panel for the
local RF/XLM-R models, the paired browser extension/device credential, and the
shared Cloud AI gateway. It checks readiness without sending a test LLM prompt
or exposing provider credentials.

## Privacy boundary

The extension sends exact address-bar URLs and opened email content only to the
local detector at `127.0.0.1`. Local redaction prepares LLM evidence. The shared
service receives that limited evidence for cloud review and returns a validated
assessment. Final fusion remains local.

Dashboard activity contains only:

- URL: minimized origin, final outcome, cloud availability, and time.
- Email: provider, sender, subject, final outcome, cloud availability, and time.

The shared database encrypts the origin, sender, and subject and removes events
after 90 days. Admin endpoints return aggregate outcome counts and account data,
never personal activity.

## Release prerequisites

- Confirm redistribution rights for both frozen models.
- Obtain a Windows code-signing certificate and set the signing thumbprint.
- Configure production MySQL, HTTPS, SMTP, encryption key, allowed origins, and
  Gemini credentials in the shared service.
- Set `BANTAI_PLATFORM_API` and `BANTAI_WEB_DASHBOARD` in the Companion release.
- Perform the documented Chrome/Edge acceptance flow before claiming browser
  verification.
