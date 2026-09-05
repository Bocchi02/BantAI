# BantAI Project Context for Codex

## Current version

`1.1.0 — Hybrid AI Decision-Support`

BantAI helps users notice warning signs while browsing and reading supported
webmail. It provides cautious decision support, not a guarantee or definitive
phishing judgment.

## Current website flow

For any HTTP/HTTPS tab, the service worker sends the exact `tab.url` to the
local `/analyze-url` endpoint. BantAI RF Grouped v1.0.0 returns an independent SAFE or
SUSPICIOUS module signal. It runs on URL changes, page completion, tab switches,
window focus, and new supported emails. Cloud URL Review runs automatically only
after an RF warning and sends only the minimized scheme/hostname origin.

## Opened email flow

On Gmail, Outlook, or Yahoo Mail:

1. The unchanged provider extractor sends visible sender, subject, and current
   message body to the local backend.
2. The calibrated BantAI XLM-R model and local Philippine Scam Indicator Engine run.
3. The exact address-bar URL is independently checked by BantAI RF Grouped v1.0.0.
4. Local Rules A-H produce initial guidance without opening the automatic popup.
5. A limited redacted payload is automatically reviewed by the configured LLM.
   A current, validated result opens the five-second popup once.
6. Cloud CHECKING and UNAVAILABLE states do not trigger automatic opening.
7. Request sequence, email fingerprint, and current tab URL checks reject stale
   results.

The website result is displayed independently and is never an input to email
fusion. Therefore a SAFE `mail.google.com`, Outlook, or Yahoo address does not
cancel suspicious email evidence.

## Frozen configuration

- Email model `full_taglish_xlmr_512_headtail_seed13`, temperature
  `2.2198894341340183`, calibrated class-1 threshold `0.6923658179915227`,
  512-token subject/head-tail preprocessing
- BantAI RF Grouped v1.0.0, `bantai_lexical_v1` (52 features), threshold
  `0.547`, input `tab.url` only, shadow/non-blocking by default

The calibrated email detector and its preprocessing contract remain frozen.
The URL detector is now the hash-verified
Grouped v1.0.0 release; V4-B is deprecated and retained only for explicit
rollback/audit. v1.1 adds evidence extraction, privacy-minimized cloud context,
and deterministic email guidance around those modules.

## Cloud configuration

The backend automatically loads the ignored local `backend/.env` file, while
preserving any values already set in the operating-system environment. It reads
`BANTAI_LLM_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`,
`GEMINI_FALLBACK_MODEL`, timeout, retry, character-limit, and cache-TTL variables.
Cloud email and URL reviews are always enabled and have no stored preferences.

## Known limitations

- The calibrated retrospective test is not a new independent external
  validation; an external human-written English/Tagalog/Taglish set is still needed.
- Rules and LLM context can still produce false positives or false negatives.
- Redaction is best-effort and cannot guarantee removal of every identifier.
- No sender authentication, embedded-link scanning, redirects, TLS analysis,
  crawling, or overall numeric risk score is included.
