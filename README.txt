BantAI v1.1.0 — Hybrid AI Decision-Support

PURPOSE
-------
BantAI combines independent local machine-learning signals, explainable scam
indicators, privacy-minimized cloud analysis, and transparent deterministic
rules. It assists users; it does not guarantee that an email or website is
legitimate and does not let Gemini decide the final result by itself.

CURRENT WEBSITE
---------------
- Scans only the exact HTTP/HTTPS URL in the active tab's address bar (`tab.url`).
- Runs when the URL changes, a page loads, tabs switch, the window regains focus,
  or a supported email opens.
- Uses hash-verified BantAI RF Grouped v1.0.0 with the exact 52-feature
  `bantai_lexical_v1` extractor and calibrated threshold 0.547.
- Runs the URL model in shadow/non-blocking mode by default. V4-B is retained
  only for explicit rollback/audit and is never an automatic fallback.
- Cloud URL Review automatically inspects only a minimized address origin after
  the frozen RF warns. AI disagreement produces caution,
  while a HIGH-confidence clean review without strong indicators may produce NO
  STRONG WARNING SIGNS. It never checks page content, accounts, or messages.
- Does not scan links, HTML, redirects, or TLS. Separately opted-in Cloud URL
  Review runs only after a local RF warning and sends only scheme and hostname.

OPENED EMAIL
------------
- Enabled only for Gmail, Outlook, and Yahoo Mail.
- Uses visible sender, subject, and current message body.
- Runs `full_taglish_xlmr_512_headtail_seed13` with 512-token
  subject-preserving head-tail preprocessing and temperature-calibrated output.
- Treats `suspicious_probability` as the calibrated class-1 probability and
  warns at `0.6923658179915227`.
- Extracts explainable Philippine-context and social-engineering indicators.
- Automatically requests a redacted contextual review after local analysis.
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
Cloud AI Review is always enabled and has no toggle. BantAI sends a limited,
cleaned version of the opened email to the configured AI service for additional
scam analysis. It redacts reasonably detectable OTPs, phone numbers, email addresses,
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

Cloud URL Review is always enabled and has no toggle. It runs only after the
BantAI RF Grouped URL model warns and sends only the URL origin
(scheme and hostname), never the page path, query, fragment, HTML, messages, or
account content. A HIGH-confidence clean result with no strong/critical cloud
indicator may produce NO STRONG WARNING SIGNS; lower-confidence disagreement
produces NEEDS CAUTION. Neither outcome guarantees that page content is safe.

Automatic result popups wait until the relevant local and cloud assessments are
both complete. They do not open for cloud CHECKING or UNAVAILABLE states,
and the same result is not reopened by focus changes or repeated tab clicks.
The toolbar popup remains available manually at any time.

Opened-email results are presented as one final decision. The cloud assessment
is not shown as a standalone email card; local model diagnostics remain under
More details.

Current-website results are also presented as one final decision. Cloud URL
context is not shown as a separate row; RF diagnostics remain under More details.

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
1. Install and start Docker Desktop.
2. Place the frozen models at the documented project-relative paths.
3. Start the complete local stack from the project root:

   .\START_BANTAI.ps1

   The first detector image build includes the frozen runtime model artifacts
   and may take several minutes. Later starts reuse the built image.

4. Verify both services:

   http://127.0.0.1:8000/health  (RF/XLM-R detector Companion)
   http://127.0.0.1:8080/health  (shared platform API)

5. Load the `extension` folder unpacked in Chrome/Edge 127 or newer and refresh
   Gmail, Outlook, and Yahoo.

TEST
----
  python scripts\verify_project.py
  python -m unittest discover -s tests -v

Automated tests do not make a real Gemini request. Full detector inference needs
the user's frozen local model files.

MODEL MIGRATION
---------------
The dual-detector behavior remains the foundation. The active email detector is
the calibrated `full_taglish_xlmr_512_headtail_seed13` release; its predecessor
is retained locally for explicit rollback only. URL scope, supported email
providers, and provider extractors remain unchanged. The active URL detector is
BantAI RF Grouped v1.0.0; its V4-B predecessor is deprecated and available only
for explicit rollback/audit.
