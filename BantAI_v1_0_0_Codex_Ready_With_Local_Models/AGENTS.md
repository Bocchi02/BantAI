# BantAI Codex Instructions

## Project identity

BantAI v1.0.0 is a Chromium Manifest V3 decision-support browser extension
with a local FastAPI backend.

It provides two independent signals:

1. **Current Website Detector**
   - Analyzes only the exact HTTP/HTTPS URL shown in the active tab's address bar.
   - Uses the frozen Random Forest URL Model V4-B.

2. **Opened Email Detector**
   - Enabled only for Gmail, Outlook, and Yahoo Mail.
   - Analyzes the visible sender, subject, and email message text.
   - Uses the frozen XLM-RoBERTa Email NLP Model V1.

The system assists users; it does not make definitive claims that an email
or website is phishing or legitimate.

## Non-negotiable frozen settings

Do not change, retrain, retune, replace, or reinterpret these unless the user
explicitly authorizes a new model version:

- Email model: BantAI XLM-RoBERTa NLP Classification Model V1
- Checkpoint: checkpoint-15666
- Email threshold: `0.05`
- Maximum email sequence length: `256`

- URL model: BantAI Random Forest URL Model V4-B
- URL threshold: `0.6800401751682739`

## Required user-facing terminology

Use:

- `SAFE`
- `SUSPICIOUS`
- `WAITING`
- `ANALYZING`
- `UNAVAILABLE`

Do not display:

- definitely phishing
- definitely legitimate
- completely safe
- guaranteed safe

Every SAFE explanation must preserve this meaning:

> No strong warning sign was detected by that module. This is not a guarantee
> that the email or website is legitimate.

## Scope restrictions

Preserve all of these constraints:

- URL detection scans `tab.url` only.
- Do not extract or score embedded links from emails.
- Do not crawl pages.
- Do not automatically open links.
- Do not automatically follow redirects.
- Do not perform TLS checks in v1.0.0.
- Do not add overall risk fusion in v1.0.0.
- Email detection runs only on Gmail, Outlook, and Yahoo Mail.
- Opening a new supported email triggers both the current URL detector and
  the email detector.
- The automatic result popup is displayed for approximately five seconds.
- A manually opened popup must remain open until the normal browser popup
  behavior closes it.

## Local model storage

The frozen trained models are stored locally under:

- `models/email_text_xlmr_v1/checkpoint-15666/`
- `models/url_random_forest_v4b/bantai_rf_url_model_v4b_optimized.joblib`

Codex may inspect configuration and runtime integration, but must not modify,
retrain, retune, replace, delete, or commit the model binaries unless the user
explicitly authorizes a new model version.

Run `python scripts/verify_models.py` to verify model presence without loading
the model weights.

## Privacy and research-data rules

Never commit or publish:

- email bodies
- private sender names or email addresses
- validation CSV files containing personal information
- `.env` files
- access tokens, API keys, or credentials
- XLM-R model weights, even though they are stored locally in this folder
- RF `.joblib` model files, even though they are stored locally in this folder
- screenshots containing personal email content

Use synthetic or sanitized examples in tests.

## Repository map

- `extension/manifest.json` — Manifest V3 configuration
- `extension/background/service-worker.js` — tab monitoring, current URL
  analysis, email-analysis orchestration, auto-popup state
- `extension/content/` — provider-specific opened-email extractors
- `extension/popup/` — simple Roboto-based user interface
- `backend/server.py` — FastAPI endpoints for URL and email analysis
- `backend/bantai_rf_url_model_v4b_runtime.py` — frozen V4-B URL features
- `scripts/verify_project.py` — source and invariant validation
- `CODEX_PROJECT_CONTEXT.md` — architecture and operating context

## Required checks after changes

Run from the project root:

```powershell
python scripts\verify_project.py
```

Also run:

```powershell
python -m py_compile backend\server.py backend\bantai_rf_url_model_v4b_runtime.py backend\test_client.py
node --check extension\background\service-worker.js
node --check extension\content\gmail-extractor.js
node --check extension\content\outlook-extractor.js
node --check extension\content\yahoo-extractor.js
node --check extension\popup\popup.js
```

For backend integration tests, the user must provide the frozen local model
paths. Do not fabricate or download replacement models.

## Change discipline

- Read the relevant files before editing.
- Make the smallest change that satisfies the request.
- Preserve working Gmail, Outlook, and Yahoo extraction behavior.
- Avoid broad refactors during bug fixes.
- Explain any behavior change that affects privacy, model scope, or results.
- Report tests that were run and any tests that could not run.
- Do not claim browser behavior was tested unless it was actually tested in a
  supported Chromium browser.
