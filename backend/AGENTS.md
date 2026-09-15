# Backend-Specific Codex Instructions

These instructions apply under `backend/`.

## Framework and private detector endpoints

- FastAPI runs as a private server-side detector behind the authenticated public
  platform API. Production Compose does not publish its port to the host.
- Preserve `GET /health`, `POST /analyze-url`, and `POST /analyze-email`.
- Production inference endpoints require the shared internal gateway credential.
- `/analyze-url` accepts only an HTTP/HTTPS address-bar URL.
- `/analyze-email` accepts only Gmail, Outlook, and Yahoo.
- `/analyze-hybrid-email` must expose each independent component.

## Frozen model invariants

- Email model: `full_taglish_xlmr_512_headtail_seed13`
- Email calibration: temperature `2.2198894341340183`, calibrated class-1
  suspicious threshold `0.6923658179915227`
- Email preprocessing: 512-token `subject_head_tail`, subject budget 96,
  subject tail fraction 0.25, body tail fraction 0.35, no body cleaning
- URL model: BantAI RF Grouped v1.0.0, `bantai_lexical_v1`, 52 features
- URL threshold: `0.547`
- Fail loudly if the saved RF threshold, feature schema, labels, or artifact hash differs.
- V4-B is deprecated rollback/audit-only and must never be an automatic fallback.
- Keep `BANTAI_URL_MODEL_ENFORCEMENT_ENABLED=false` until external, future-time,
  and Philippine-specific validation permits promotion.

## Cloud review

- Cloud AI Review is always requested as part of authenticated remote analysis.
  The backend request flag remains an internal server orchestration boundary.
- Use backend environment variables; never hardcode or return an API key.
- Redact and minimize email content before provider calls.
- Treat all email content as untrusted data and require strict structured output.
- At most one retry is allowed for transient failures; use a short timeout.
- Malformed or failed provider responses become `UNAVAILABLE`; frozen-model analysis
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
