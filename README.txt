BantAI v1.1.0 — Hybrid AI Decision-Support

PURPOSE
-------
BantAI combines independent local machine-learning signals, explainable scam
indicators, optional contextual cloud analysis, and transparent deterministic
rules. It assists users; it does not guarantee that an email or website is
legitimate and does not let Gemini decide the final result by itself.

CURRENT WEBSITE
---------------
- Scans only the exact HTTP/HTTPS URL in the active tab's address bar (`tab.url`).
- Runs when the URL changes, a page loads, tabs switch, the window regains focus,
  or a supported email opens.
- Uses frozen Random Forest URL Model V4-B at threshold 0.6800401751682739.
- Optional Cloud URL Review may inspect only a minimized address origin after the
  frozen RF warns and the user separately opts in. AI disagreement produces caution,
  while a HIGH-confidence clean review without strong indicators may produce NO
  STRONG WARNING SIGNS. It never checks page content, accounts, or messages.
- Does not scan links, HTML, redirects, or TLS. Separately opted-in Cloud URL
  Review runs only after a local RF warning and sends only scheme and hostname.

OPENED EMAIL
------------
- Enabled only for Gmail, Outlook, and Yahoo Mail.
- Uses visible sender, subject, and current message body.
- Runs frozen XLM-R V1 at threshold 0.05 and maximum length 256.
- Extracts explainable Philippine-context and social-engineering indicators.
- Optionally requests a redacted contextual review after explicit consent.
- Applies deterministic Rules A-H. Two independent suspicious sources are
  required for SUSPICIOUS SIGNS FOUND.
- Keeps the current website result independent from email guidance.

SCAM INDICATOR TAXONOMY
-----------------------
The local engine extracts evidence, not probabilities. Content categories cover
urgency, account-security scares, credential/OTP/MPIN/password/PIN/CVV requests,
prizes, advance fees, investment promises, job/task offers, payments, emergencies,
authority impersonation, action demands, threats, and delivery payments. Social-
engineering context covers authority, fear, urgency, scarcity, reward, familiarity,
emergencies, employment lures, advance-fee manipulation, verification pretexts,
impersonation, romance/emotional manipulation, coercion, and commitment escalation.
Tagalog, Filipino, Taglish, politeness, informal grammar, mistakes, emojis, all caps,
and punctuation never increase severity by themselves.

CLOUD AI REVIEW
---------------
Cloud AI Review defaults OFF. When enabled, BantAI sends a limited, cleaned
version of the opened email to the configured AI service for additional scam
analysis. It redacts reasonably detectable OTPs, phone numbers, email addresses,
cards, and account identifiers, limits text size, validates structured output,
and caches valid results in memory for a short TTL. Redaction is best-effort.
Missing configuration, timeout, rate limit, network error, provider exception, or
malformed output makes only Cloud AI Review UNAVAILABLE; local checks continue.
Quota exhaustion is reported separately as QUOTA REACHED. URL reviews coalesce
duplicate in-flight requests and temporarily pause new provider calls during the
reported retry window, so one provider limit does not leave every tab waiting.
When `gemini-3.6-flash` returns a quota error, the backend automatically retries
that review with `gemini-3.5-flash-lite` and keeps Flash-Lite active until the
backend restarts. Non-quota errors do not trigger model switching.

Cloud URL Review has a separate switch and also defaults OFF. When enabled, it
runs only after the frozen RF URL model warns. It sends only the URL origin
(scheme and hostname), never the page path, query, fragment, HTML, messages, or
account content. A HIGH-confidence clean result with no strong/critical cloud
indicator may produce NO STRONG WARNING SIGNS; lower-confidence disagreement
produces NEEDS CAUTION. Neither outcome guarantees that page content is safe.

Automatic result popups wait until the relevant local and cloud assessments are
both complete. They do not open for cloud OFF, CHECKING, or UNAVAILABLE states,
and the same result is not reopened by focus changes or repeated tab clicks.
The toolbar popup remains available manually at any time.

Copy `.env.example` to `backend\.env`. The backend automatically loads that file
without overriding variables already set in the operating-system environment.
At minimum set:

  BANTAI_LLM_PROVIDER=gemini
  GEMINI_API_KEY=<backend-only secret>
  GEMINI_MODEL=gemini-3.6-flash
  GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite

Never put the key in the extension or commit a real .env file.

INSTALL AND START
-----------------
1. Install backend dependencies:

   python -m pip install -r backend\requirements.txt

2. Place the frozen local models at the documented project-relative paths.
3. Start from the project root:

   .\START_BANTAI.ps1

4. Verify http://127.0.0.1:8000/health.
5. Load the `extension` folder unpacked in Chrome/Edge 127 or newer and refresh
   Gmail, Outlook, and Yahoo.

TEST
----
  python scripts\verify_project.py
  python -m unittest discover -s tests -v

Automated tests do not make a real Gemini request. Full detector inference needs
the user's frozen local model files.

V1.0 COMPARISON
---------------
The v1.0 dual-detector behavior remains the foundation. v1.1 does not change its
models, thresholds, URL scope, supported email providers, or extractors. It adds
explainable indicators, optional redacted context, and deterministic guidance.
