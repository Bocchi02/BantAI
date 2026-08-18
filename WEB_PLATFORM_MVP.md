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

The authenticated **AI message check** page lets a user paste an email body,
SMS, chat, or other message for an explicit one-time review with
`gemini-3.5-flash-lite`. Submission requires visible text, a consent checkbox,
and a separate button press. The shared platform applies BantAI's existing
sensitive-data redaction and context limit before it contacts Gemini. The page
shows the assessment, observable indicators, and suggested action while making
clear that sender identity, headers, links, attachments, and the local XLM-R
model were not checked. It never saves the pasted text or outcome to activity,
reports, browser storage, or training data, and it never presents the
cloud-only signal as the final hybrid email result.

Users may explicitly review a completed URL result from the dashboard,
activity history, or manually opened extension popup. The interface requires a
selected response and a separate submit action; it never infers feedback from
an older report for the same origin. Incorrect feedback requires the user to
choose a corrected legitimate or suspicious classification. The exact current
address travels through the Companion only with that explicit feedback action.
The shared service verifies that its origin matches the referenced detection,
then encrypts the complete address for administrator review.

Administrators have two related pages:

- **User reviews** displays complete URL addresses that users intentionally
  submitted, along with the detector result and structured feedback, so an
  administrator can approve, reject, or mark each review inconclusive.
- **Training data** inventories approved, de-identified URL candidates for a
  future offline RF training cycle. It provides label filters, evidence totals,
  model-version context, and individual addresses without reporter identity.
  Administrators have separate URL CSV and email CSV export buttons. Each file
  contains only its candidate type's columns and respects the approved-label
  filter. Both exports neutralize spreadsheet-formula prefixes and exclude
  reporter IDs and fingerprints.

Users also have an explicit **Email reports** form. It collects provider,
sender, subject, body, the displayed detector outcome, the user's proposed
label, and optional context only after the user checks a consent box and
submits. This is not triggered automatically by opening or detecting an email.
The service immediately stores the body as authenticated ciphertext rather
than plaintext.

The manually opened extension popup also offers email-result feedback for a
completed supported-email detection. Submission requires an answer and an
encrypted-report consent checkbox. At submit time the service worker asks the
provider extractor for the currently opened email, verifies that its local
fingerprint matches the displayed result, and forwards it through Companion.
The raw body is never placed in Chrome storage.

The administrator **Email reports** page shows sender and subject metadata,
labels, body character count, and review status, but it cannot open, return, or
decrypt the actual email body. Approval moves the already encrypted body and
curated metadata into a de-identified email candidate inventory with no user
identifier. The **Training data** page can confirm that encrypted body content
is present while never displaying it. Its CSV manifest includes a candidate ID
and body-present metadata, never plaintext/ciphertext body content. A future
restricted training process may use the candidate ID to decrypt approved body
content in memory; the administrator download, logs, and temporary files remain
body-free. These workflows do not re-train, replace, or change either frozen
production model.

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
never personal activity. Narrowly scoped exceptions are content the user
explicitly submits for review: a complete URL is visible in the URL-review
workflow, while an email body is retained only as authenticated ciphertext and
is never visible through the user or administrator interfaces. Approved
candidates are stored without reporter identity.

## Release prerequisites

- Confirm redistribution rights for both frozen models.
- Obtain a Windows code-signing certificate and set the signing thumbprint.
- Configure production MySQL, HTTPS, encryption key, allowed origins, and
  Gemini credentials in the shared service.
- Set `BANTAI_PLATFORM_API` and `BANTAI_WEB_DASHBOARD` in the Companion release.
- Perform the documented Chrome/Edge acceptance flow before claiming browser
  verification.
