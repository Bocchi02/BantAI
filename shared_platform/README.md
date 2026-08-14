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

The service never accepts email bodies on activity endpoints. URL activity is
normalized to scheme, hostname, and optional port before encryption.

## Website result reports

Signed-in users can paste a website address and report it as one they believe
is legitimate or suspicious. The service reduces the address to its origin
before storing the encrypted value. Reports also keep the displayed detector
outcome and the user's selected classification. Complete URLs and reporter
identity are not exposed in the administrator review queue.
Administrators may record a likely-legitimate, likely-suspicious, or
inconclusive manual assessment. These assessments do not retrain or override
the frozen detector, and reports are removed after the configured activity
retention period.

## Account profile

User accounts store separate first, optional middle, and last name fields.
Signed-in users can update those fields and change their password from the
Profile page. A password change revokes other web sessions while preserving the
session that performed the change. Users must know their current password;
email-based account recovery is intentionally unavailable in this version.
