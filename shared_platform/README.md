# Signalam shared platform

This public service owns accounts, web sessions, one-time extension pairing,
authenticated remote detection orchestration, privacy-minimized activity,
bounded transient explanation context, server-side sampling, reporting, and
aggregate administration. The private frozen detector remains authoritative.

## Server deployment

1. Copy `.env.example` to `.env` and replace every placeholder secret.
2. Generate the encryption key with a cryptographically secure 32-byte value
   encoded with URL-safe base64.
3. Configure the public HTTPS domain, exact dashboard and extension origins,
   internal gateway key, database credentials, encryption key, backend-only
   Gemini key, and the private Caddy source network in the root `.env`.
4. Start the stack with `docker compose up -d --build`. Compose does not publish
   MySQL, platform, or detector ports; only the Caddy TLS gateway is public.
   The one-shot migration service applies pending Alembic migrations before the
   platform starts, using a separate migration credential.
5. The controlled pilot keeps public self-registration disabled; provision
   authorized users through the administrator workflow. This temporary MVP has
   no email verification or unauthenticated password-reset flow.

Production startup keeps `BANTAI_CREATE_SCHEMA=false`; the platform does not
run Alembic on every restart. Caddy terminates API TLS; set
`BANTAI_COOKIE_SECURE=true`, and configure only the exact web and extension
origins. The hosted web worker proxies its same-origin `/api/v1` path to this
API so the session and CSRF cookies stay on the dashboard origin. Disable
query-string access logs at the reverse proxy as the application container does.
Set `BANTAI_TRUSTED_PROXY_CIDRS` to the private CIDR or address used by Caddy to
reach the platform. It is required so forwarded client identity is trusted only
from that source; replace the documentation placeholder in the root
`.env.example` with the deployment-specific private network.

The service never accepts email bodies on routine activity endpoints. URL
activity is normalized to scheme, hostname, and optional port before
encryption. A separate, explicit email-report workflow may accept a body only
after the user confirms that it may be retained for future training review.

`POST /api/v1/website-check` is an authenticated, CSRF-protected, explicitly
confirmed on-demand page check. It accepts a pasted public URL, pins the
connection to a validated public DNS result, fetches only one bounded HTML or
plain-text response, and never follows redirects or page links. Only the URL
origin and redacted readable text are sent to cloud AI. No page input or result
is added to activity or training data; retrieval or cloud failure returns no
verdict. This flow is independent of automatic extension URL detection.

The dashboard's **More details** action is a separate no-storage exception.
The platform keeps a bounded set of recent raw inputs in process memory only.
When a signed-in user requests an explanation, the server reuses the matching
account/device/detection context without a second extension upload.
The service verifies the activity, user, and paired device; email content is
privacy-redacted and size-limited before the Cloud AI provider call. The source
content and generated explanation are not added to activity history,
the retry outbox, training data, application logs, or database storage. If the
memory-only context expires, is evicted, the platform restarts, or another
worker receives the request, **More details** falls back
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
logs. This cloud-only wording assessment does not run the frozen server XLM-R model and
is not a final fused Signalam email result. Its language-aware prompt evaluates
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
not retrain or override BantAI RF Grouped v1.0.0. User reports are removed after the
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

Full-address storage applies only after an explicit report submit action. Routine activity
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
access; this MVP does not retrain, replace, or change
`full_taglish_xlmr_512_headtail_seed13`. The CSV
manifest contains the email candidate ID, approved label, sender/subject
reference, body-present flag, and body character count, but never the body,
ciphertext, fingerprint, or reporter identity. Candidate IDs are intended for
a future restricted training process that decrypts approved bodies in memory
without placing plaintext in the administrator download, logs, or temporary
files.

## Automatic contribution and operations

Training consent is opt-in and uses a 10% independent selection rate. The
platform checks active device/account status and current consent in the
successful completion transaction, records that the decision was made, and
encrypts selected content without a raw-content retry queue. Retries cannot
resample the same detection. Opt-out
deletes that user's automatic samples. These model-predicted samples are never
mixed with human-approved training candidates or their CSV exports.

Activity records distinguish cloud COMPLETE, SKIPPED, and UNAVAILABLE states and
may retain a bounded failure category and duration. Administrator operations
show aggregate latency, cloud states/failures, automatic-sample totals, pending
review counts, and oldest queue age. Review responses preserve reason history,
reviewer, and timestamp; no aggregate is labeled as measured model accuracy.

## Account profile

User accounts store separate first, optional middle, and last name fields.
Signed-in users can update those fields and change their password from the
Profile page. A password change revokes other web sessions while preserving the
session that performed the change. Users must know their current password;
email-based account recovery is intentionally unavailable in this version.


## Detection retries and explanation budgets

Apply `alembic upgrade head` from `shared_platform` before running this API
revision against an existing database. Revision `0013_input_explanation_limit`
adds a nullable keyed input fingerprint to activity records and a fixed-size
explanation budget to each account. No historical content is reconstructed or
backfilled. Existing records remain readable and explainable, but a detection
retry for a record without a fingerprint returns 409 and requires a new
`client_event_id`. Keep the configured encryption/index key stable; key changes
also invalidate input matching.

Migration policy: `alembic upgrade head` is supported online against the
disposable or production MySQL instance. Offline SQL generation with
`alembic upgrade --sql` is not supported because compatibility migrations
inspect the live schema before applying changes; do not use generated offline
SQL as a production migration artifact.

Detection IDs bind to the complete validated inference input (including the
exact URL path/query/fragment, email body, current tab URL, and minimized sender
authentication). Only a domain-separated HMAC fingerprint is added to history;
raw input and complete results retain their existing memory-only TTL behavior.
Identical retries reuse available transient results. After expiry or restart,
a matching request restores temporary explanation/feedback context and reruns
inference. It returns a result only when the final outcome, cloud state and
failure category match history. A changed decision returns 409 requiring a new
ID; history and its single automatic-sampling decision remain unchanged. This
is decision consistency, not permanent byte-for-byte result replay: details may
vary after expiry. Concurrent inserts use the unique device/event constraint;
losers must match both the winning input and recorded decision. Concurrent
requests can perform duplicate inference, but cannot resample or return a
conflicting outcome for that record.

All four explanation routes share 20 provider attempts per account per
five-minute window, across activity IDs, devices, web sessions and API workers.
Authentication and ownership validation precede the atomic database budget
reservation; requests beyond the limit return 429 with `Retry-After: 300`
before calling the provider. The budget survives process restarts and uses one
counter/window pair per account. Failed provider attempts also consume budget.
