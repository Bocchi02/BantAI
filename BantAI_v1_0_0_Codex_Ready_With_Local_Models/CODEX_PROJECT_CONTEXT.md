# BantAI Project Context for Codex

## Product goal

BantAI helps users identify warning signs while browsing websites and reading
emails. The interface is intentionally simple for users with limited digital
literacy.

BantAI presents independent signals rather than definitive legal or security
judgments.

## Current version

`1.0.0 — Dual Detector`

## Main flow

### Any supported HTTP/HTTPS browser tab

1. The service worker reads the active tab's current address-bar URL.
2. The URL is sent to the local FastAPI `/analyze-url` endpoint.
3. Frozen Random Forest V4-B produces a suspicious probability.
4. The popup presents SAFE or SUSPICIOUS.

### Gmail, Outlook, or Yahoo Mail

1. A provider-specific content script detects the newly opened email.
2. It extracts the visible sender, subject, and message text.
3. The service worker runs:
   - the current address-bar URL detector; and
   - the opened-email detector.
4. The local backend analyzes the email through `/analyze-email`.
5. When the latest analyses finish, the popup opens automatically.
6. The automatic popup displays for approximately five seconds.

## Model configuration

### Email detector

- Model: XLM-RoBERTa Email NLP V1
- Checkpoint: `checkpoint-15666`
- Threshold: `0.05`
- Maximum input length: `256`
- Output mapping:
  - below threshold → SAFE
  - at or above threshold → SUSPICIOUS

### URL detector

- Model: Random Forest URL V4-B
- Threshold: `0.6800401751682739`
- Input: current address-bar URL only
- Output mapping:
  - below threshold → SAFE
  - at or above threshold → SUSPICIOUS

## Known research limitation

The email model's frozen external validation on the 2,000-email PhishNChips
benchmark showed very low phishing recall. It must not be treated as a
standalone guarantee of email safety. Preserve the explanatory warning shown to
users.

## Out of scope for v1.0.0

- embedded-email-link scoring
- redirect analysis
- TLS analysis
- sender-domain authentication
- risk fusion
- model retraining
- threshold retuning
- cloud deployment
- mobile application development

## Local development and model storage

The large model files are stored inside the local project folder but remain
ignored by Git:

```text
models/email_text_xlmr_v1/checkpoint-15666/
models/url_random_forest_v4b/bantai_rf_url_model_v4b_optimized.joblib
```

After the models are copied, start the backend from the project root:

```powershell
.\START_BANTAI.ps1
```

The backend startup script resolves the model paths relative to this project.

## Definition of a safe change

A safe change:

- preserves the frozen thresholds;
- preserves current detector scopes;
- does not increase browser permissions unnecessarily;
- does not expose email content;
- passes static verification;
- does not claim browser testing unless actually performed.
