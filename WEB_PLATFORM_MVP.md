# BantAI web platform MVP

## Components

- `web/`: responsive React, TypeScript, and Tailwind account/dashboard UI.
- `shared_platform/`: FastAPI, SQLAlchemy, Alembic, and MySQL service.
- `backend/companion.py`: DPAPI-protected pairing credential and bounded event outbox.
- `companion/`: Windows tray host and installer build definition.
- `extension/`: pairing UI and terminal-result submission.

The account experience includes separate first, optional middle, and last name
fields, an editable Profile page, authenticated password changes, and explicit
sign-out from the Profile page. New accounts are active immediately; email
verification and email-based password recovery are excluded from this version.

The personal dashboard includes a live Protection connections panel for the
local RF/XLM-R models, the paired browser extension/device credential, and the
shared Cloud AI gateway. It checks readiness without sending a test LLM prompt
or exposing provider credentials.

Users may explicitly review a completed URL result from the dashboard,
activity history, or manually opened extension popup. The interface requires a
selected response and a separate submit action; it never infers feedback from
an older report for the same origin. Incorrect feedback requires the user to
choose a corrected legitimate or suspicious classification. Only the event ID
and selected structured feedback travel through the Companion; no browsing
path is added to the report.

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
- Configure production MySQL, HTTPS, encryption key, allowed origins, and
  Gemini credentials in the shared service.
- Set `BANTAI_PLATFORM_API` and `BANTAI_WEB_DASHBOARD` in the Companion release.
- Perform the documented Chrome/Edge acceptance flow before claiming browser
  verification.
