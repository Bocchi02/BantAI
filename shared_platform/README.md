# BantAI shared platform

This service owns accounts, web sessions, one-time device pairing,
privacy-minimized activity history, aggregate administration, and the backend-
only LLM gateway. The local detector remains authoritative.

## Local development

1. Copy `.env.example` to `.env` and replace every placeholder secret.
2. Generate the encryption key with a cryptographically secure 32-byte value
   encoded with URL-safe base64.
3. Start MySQL and the API with `docker compose up --build` from the project
   root. Compose supplies its internal `mysql` hostname; the example's
   `127.0.0.1` database URL is for running the API directly on Windows.
   Compose does not publish MySQL's port to Windows, avoiding conflicts with
   an existing local MySQL installation and keeping database access private to
   the Docker network.
   The platform container applies pending Alembic migrations before starting,
   so profile fields and later schema updates are added without deleting the
   existing MySQL volume.
4. New accounts are active immediately. This temporary MVP has no email
   verification or unauthenticated password-reset flow.

Production startup should run `alembic upgrade head` before Uvicorn and keep
`BANTAI_CREATE_SCHEMA=false`. Terminate TLS at a trusted reverse proxy, set
`BANTAI_COOKIE_SECURE=true`, and configure only the exact web and extension
origins. Route the web app and `/api/v1` through the same public hostname so
the session and CSRF cookies stay same-origin. Disable query-string access logs
at the reverse proxy as the application container does.

The service never accepts email bodies on routine activity endpoints. URL
activity is normalized to scheme, hostname, and optional port before
encryption. A separate, explicit email-report workflow may accept a body only
after the user confirms that it may be retained for future training review.

The dashboard's **More details** action is a separate no-storage exception.
The extension keeps a small, bounded set of recently completed full URLs and
email bodies in BantAI Companion memory only. When the signed-in user requests
an explanation, Companion sends the matching full URL or email
provider/sender/subject/body to the device-authenticated explanation endpoint.
The service verifies the activity, user, and paired device; email content is
privacy-redacted and size-limited before the Cloud AI provider call. Neither
the source content nor the generated explanation is added to activity history,
the retry outbox, training data, application logs, or database storage. If the
memory-only context expires or Companion restarts, **More details** falls back
to the user's stored origin or provider/sender/subject metadata. The modal
labels this reduced scope instead of failing or implying that missing content
was reviewed.

## Pasted message AI check

Signed-in users and administrators can open **AI message check**, paste up to
10,000 characters from an email, SMS, or chat, and explicitly consent to a
one-time Cloud AI review. `POST /api/v1/message-review` requires the user's
session and CSRF token, rejects blank text and missing consent, and is
rate-limited independently from automatic detector traffic.

The service redacts reasonably detectable OTPs, phone numbers, email
addresses, payment-card values, and account identifiers, then limits the cloud
payload to compact beginning/ending context. The review uses exactly
`gemini-3.5-flash-lite`. The pasted text, redacted payload, and result are not
written to activity history, reports, training candidates, or application
logs. This cloud-only wording assessment does not run the local XLM-R model and
is not a final fused BantAI email result. Its language-aware prompt evaluates
English, Filipino, and Taglish social-engineering context, including contextual
credential, payment, urgency, account-threat, secrecy, and prize patterns. A
language choice, code-switching, or isolated Taglish phrase is never treated as
a warning sign without suspicious intent in the surrounding message.

## Website result reports

Signed-in users can paste a website address and report it as one they believe
is legitimate or suspicious. An explicit report stores the normalized complete
address, including its path, query, and fragment, using application-layer
encryption. Reports also keep the displayed detector outcome and the user's
selected classification. The reporting user's identity is not exposed in the
administrator review queue.
Administrators may record a likely-legitimate, likely-suspicious, or
inconclusive manual assessment. The dashboard, activity history, and paired
extension also allow explicit feedback on a retained URL detection: correct,
incorrect, or unsure. No report is created until the user selects a response
and confirms it. Feedback is linked to that exact detection rather than being
inferred from an older report for the same origin.
Incorrect feedback can include a corrected legitimate/suspicious label and an
optional structured reason. Administrators may approve reviewed feedback as a
future training candidate, reject it, or mark it inconclusive. Approval stores
curated candidate metadata in a separate de-identified table with no user ID.
That approved candidate survives ordinary report retention so it can be
reviewed during a future, explicitly authorized offline training cycle. It does
not retrain or override frozen RF V4-B. User reports are removed after the
configured activity retention period.

Administrators use the **User reviews** page to inspect the complete addresses
that users explicitly submitted and record a manual decision. The separate
**Training data** page lists only approved, de-identified URL candidates,
including their curated label, detector outcome, evidence count, model version,
and approval dates. It never exposes the reporting user or an activity ID.
Administrators can download URL and email candidates through separate UTF-8
CSV buttons. The URL export contains only URL-specific columns, while the email
export contains email metadata and body-availability fields. The current
approved-label filter applies to either file. Spreadsheet-formula prefixes are
neutralized, responses are marked `no-store`, and no reporter identifier or
internal fingerprint is included.

This exception applies only after an explicit submit action. Routine activity
history and URL cloud review remain origin-only. A full address attached to
recent-detection feedback must match that detection's stored origin, and the
service never opens, crawls, or follows a submitted address.

## Email reports

Signed-in users may explicitly submit an email report with its provider,
sender, subject, body, displayed detector outcome, and their proposed label.
This is separate from routine email detection and requires a consent checkbox
and a submit action. The body is encrypted immediately with authenticated
application-layer encryption; plaintext email bodies are never stored in the
database, logs, activity history, or cloud-review records.

The manually opened extension popup offers the same explicit result feedback
for a completed Gmail, Outlook, or Yahoo detection. The extension re-extracts
the currently opened email only after the user chooses an answer, accepts the
encrypted-report consent notice, and presses Submit feedback. It verifies that
the extraction fingerprint matches the displayed detection and does not place
the body in browser storage.

Administrators use the **Email reports** page to assess labels and may approve,
reject, or mark a review inconclusive. They can see the provider, sender,
subject, body character count, detector outcome, proposed label, and review
status. Neither the administrator UI nor any user/admin API returns or decrypts
the body, ciphertext, body fingerprint, or reporting user ID.

Approval copies the already encrypted body and curated metadata into a separate
de-identified email training-candidate table. The **Training data** page shows
that encrypted content is present but cannot open or display it. A later,
explicitly authorized offline training pipeline may be given separate key
access; this MVP does not retrain, replace, or change frozen XLM-R V1. The CSV
manifest contains the email candidate ID, approved label, sender/subject
reference, body-present flag, and body character count, but never the body,
ciphertext, fingerprint, or reporter identity. Candidate IDs are intended for
a future restricted training process that decrypts approved bodies in memory
without placing plaintext in the administrator download, logs, or temporary
files.

## Account profile

User accounts store separate first, optional middle, and last name fields.
Signed-in users can update those fields and change their password from the
Profile page. A password change revokes other web sessions while preserving the
session that performed the change. Users must know their current password;
email-based account recovery is intentionally unavailable in this version.
