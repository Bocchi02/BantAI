# Signalam remote web platform

## Components

- `web/`: responsive account, activity, reporting, and administration UI.
- `shared_platform/`: authenticated public API, SQLAlchemy/Alembic persistence,
  detector gateway, server-side sampling, and transient context ownership.
- `backend/`: private frozen RF/XLM-R detector, indicators, Gemini coordination,
  and deterministic fusion.
- `extension/`: exact address-bar and supported visible-email orchestration.
- `companion/`: legacy development packaging only; not an end-user dependency.

The hosted web worker proxies same-origin `/api/v1` requests to its configured
HTTPS `BANTAI_API_ORIGIN`. This keeps session and CSRF cookies usable on the
dashboard origin while the extension contacts the API directly.

Production uses Caddy for public HTTPS. Platform, detector, and MySQL ports are
not published. The internal gateway key authenticates platform-to-detector
traffic; device credentials authenticate extension-to-platform traffic.

## Account and device flow

Dashboard sessions use secure cookies and CSRF validation. Pairing codes are
single use and expire after five minutes. Consuming a code creates a random
device credential whose hash is stored by the server. The extension keeps only
that credential in Chrome storage restricted to trusted extension contexts.
Content scripts never receive it.

Every remote detection, activity-linked feedback request, and device explanation
checks credential validity, account status, device ownership, and revocation.
Paired Devices can revoke access. Account suspension also blocks device calls.
CORS and extension host permissions remain narrow but are not authorization.

## Detection and privacy boundary

The extension sends exact `tab.url` values and supported Gmail/Outlook/Yahoo
opened-email content over HTTPS to `/api/v1/detections/url` or
`/api/v1/detections/email`. The public API forwards input transiently to the
private detector. Raw inference input is never written to routine activity,
logs, durable retry queues, or public download routes.

Routine activity contains only:

- URL: encrypted normalized origin, final outcome, cloud state, and time.
- Email: encrypted sender/subject metadata, provider, final outcome, cloud
  state, and time; never the routine body.

The server records completions idempotently by device and client event ID. URL
cloud context is origin-only and runs only after an RF warning. Email cloud
context is redacted and bounded. The frozen models, scan scope, provider scope,
fusion rules, shadow mode, and no-guarantee wording are unchanged.

## Explanations

The platform reuses the input it already received in a bounded ten-minute
process-memory store keyed by account, device, and detection ID. Website
explanations always use the stored origin only. Email explanations use full
context only while available. Expiry, eviction, restart, or routing to another
worker returns `EXPIRED_OR_UNAVAILABLE` and falls back to stored provider,
sender, and subject metadata. Neither source context nor generated explanation
is persisted.

## Feedback and reporting

URL/email feedback is created only after an explicit answer and submit action
and must match the completed detection. Full URL reports and email bodies are
encrypted in their existing authorized review workflows. Administrator APIs do
not return email bodies or reporter identities. Approved training candidates
remain separate and do not modify either frozen production model.

## Automatic contribution

Profile consent remains explicit and versioned. During the first successful
server-side completion transaction, each eligible opted-in detection receives a
10% independent selection decision. The activity row records that the decision
was made, so retries cannot resample it. Selected content is encrypted in the
automatic-sample inventory and remains separate from human-approved labels and
body-free exports. Opt-out stops future collection and deletes the user's
automatic samples.

## User interface

The landing page and Help page explain that exact addresses and supported opened
emails are sent securely to the Signalam server for transient checking. Dashboard
status distinguishes Browser extension connected from Server models ready.
Failures display Service unavailable and never imply a completed or safe check.
The three primary outcome labels and accessibility behavior remain unchanged.

## Release prerequisites

- Confirm redistribution/deployment rights for both frozen models.
- Configure a real DNS name, trusted HTTPS, strong secrets, exact allowed
  origins, MySQL, encryption, and backend-only Gemini credentials.
- Run Alembic through `0012_remote_server_inference` and restart services.
- Configure the extension release endpoint with
  `scripts/configure_remote_endpoint.py` and a stable extension identity.
- Keep the detector image private and run a single detector worker unless the
  host is sized for additional full model copies.
- Complete synthetic Chrome/Edge acceptance against the separately hosted test
  API before claiming browser or deployment verification.
