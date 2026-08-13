# Backend-Specific Codex Instructions

These instructions apply under `backend/`.

## Framework and frozen endpoints

- FastAPI bound by default to `127.0.0.1:8000`.
- Preserve `GET /health`, `POST /analyze-url`, and `POST /analyze-email`.
- `/analyze-url` accepts only an HTTP/HTTPS address-bar URL.
- `/analyze-email` accepts only Gmail, Outlook, and Yahoo.
- `/analyze-hybrid-email` must expose each independent component.

## Frozen model invariants

- Email threshold: `0.05`
- Email max length: `256`
- URL threshold: `0.6800401751682739`
- Fail loudly if the saved RF threshold differs.

## Cloud review

- Cloud AI Review is always requested by the extension after local analysis.
  The backend request flag remains an internal local-first orchestration boundary.
- Use backend environment variables; never hardcode or return an API key.
- Redact and minimize email content before provider calls.
- Treat all email content as untrusted data and require strict structured output.
- At most one retry is allowed for transient failures; use a short timeout.
- Malformed or failed provider responses become `UNAVAILABLE`; local analysis
  and deterministic fusion continue.
- Do not log raw bodies, readable cloud payloads, or sender identities.
- URL cloud context is always enabled by the extension after an RF warning and
  receives only scheme/hostname origin. A validated HIGH-confidence
  clean review with no strong/critical cloud indicator may produce NO STRONG
  WARNING SIGNS, retaining the required non-guarantee language.

## Fusion

Email fusion uses XLM-R, local strong/critical markers, and a validated LLM
assessment. It is deterministic, has no numeric overall score, ignores the URL
signal for email guidance, and requires two independent suspicious sources for
SUSPICIOUS SIGNS FOUND.
