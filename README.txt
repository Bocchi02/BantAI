BantAI v1.0.0 — Dual Detector

PURPOSE
-------
BantAI is a browser-based decision-support system that displays simple
SAFE or SUSPICIOUS signals.

DETECTOR 1: CURRENT WEBSITE
---------------------------
- Scans only the URL currently shown in the browser address bar.
- Runs when:
  - the address-bar URL changes;
  - a page finishes loading;
  - the user switches tabs;
  - the browser window regains focus;
  - a new supported email is opened.
- Does not scan links inside email messages.
- Does not open links, follow redirects, or make TLS decisions.

DETECTOR 2: OPENED EMAIL
------------------------
- Enabled only on:
  - Gmail
  - Outlook
  - Yahoo Mail
- Scans every newly opened email detected by the provider extractor.
- Uses the visible sender, subject, and message text.
- When a new email is opened, BantAI runs both:
  - current address-bar URL detection;
  - opened-email detection.
- After both analyses finish, the popup opens automatically for five seconds.

USER-FACING SIGNALS
-------------------
SAFE:
No strong warning sign crossed the detector's frozen threshold.

SUSPICIOUS:
The detector found warning signs that require careful review.

SAFE is not a guarantee that a website or email is legitimate.

FROZEN MODEL SETTINGS
---------------------
Email:
- BantAI XLM-RoBERTa NLP Classification Model V1
- Threshold: 0.05
- Maximum length: 256

URL:
- BantAI Random Forest URL Model V4-B
- Threshold: 0.6800401751682739

INSTALL BACKEND
---------------
1. Open PowerShell in the backend folder.
2. Activate the virtual environment.
3. Install dependencies:

   python -m pip install -r requirements.txt

4. Start:

   Set-ExecutionPolicy -Scope Process Bypass -Force

   .\START_BANTAI_V1_0.ps1 `
     -TextModelDir "D:\path\to\checkpoint-15666" `
     -RfModelPath "D:\path\to\bantai_rf_url_model_v4b_optimized.joblib"

5. Open:

   http://127.0.0.1:8000/health

INSTALL EXTENSION
-----------------
1. Open chrome://extensions or edge://extensions.
2. Enable Developer mode.
3. Disable older BantAI versions.
4. Select Load unpacked.
5. Choose the extension folder.
6. Refresh Gmail, Outlook, and Yahoo once.

ROBOTO FONT
-----------
The popup requests Roboto from Google Fonts. Arial is used as a fallback if
the browser is offline or cannot reach Google Fonts.

CHROME REQUIREMENT
------------------
Automatic popup opening uses chrome.action.openPopup(), which requires
Chrome/Chromium 127 or newer for normal extensions.


CODEX-READY MIGRATION
---------------------
This package includes:

- AGENTS.md
- scoped extension and backend AGENTS.md files
- CODEX_PROJECT_CONTEXT.md
- CODEX_MIGRATION_GUIDE.md
- Codex prompt templates
- Git privacy safeguards
- project invariant verification
- Codex CLI setup helpers

Start by reading CODEX_MIGRATION_GUIDE.md.


LOCAL MODEL STORAGE
-------------------
The trained model folders are included in this project structure:

models\email_text_xlmr_v1\checkpoint-15666
models\url_random_forest_v4b\bantai_rf_url_model_v4b_optimized.joblib

To copy the existing models and verify their SHA-256 hashes:

Set-ExecutionPolicy -Scope Process Bypass -Force
.\scripts\models\MIGRATE_EXISTING_MODELS.ps1

Then verify:

python scripts\verify_models.py

Start BantAI using the relative local model paths:

.\START_BANTAI.ps1

The actual model binaries are ignored by Git.
