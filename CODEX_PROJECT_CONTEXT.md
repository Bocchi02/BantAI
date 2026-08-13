# BantAI Project Context for Codex

## Current version

`1.1.0 — Hybrid AI Decision-Support`

BantAI helps users notice warning signs while browsing and reading supported
webmail. It provides cautious decision support, not a guarantee or definitive
phishing judgment.

## Current website flow

For any HTTP/HTTPS tab, the service worker sends the exact `tab.url` to the
local `/analyze-url` endpoint. Frozen RF V4-B returns an independent SAFE or
SUSPICIOUS module signal. It runs on URL changes, page completion, tab switches,
window focus, and new supported emails. Cloud URL Review runs automatically only
after an RF warning and sends only the minimized scheme/hostname origin.

## Opened email flow

On Gmail, Outlook, or Yahoo Mail:

1. The unchanged provider extractor sends visible sender, subject, and current
   message body to the local backend.
2. Frozen XLM-R V1 and the local Philippine Scam Indicator Engine run.
3. The exact address-bar URL is independently checked by RF V4-B.
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

- XLM-R Email NLP V1, `checkpoint-15666`, threshold `0.05`, max length `256`
- Random Forest URL V4-B, threshold `0.6800401751682739`, input `tab.url` only

The v1.0 dual-detector baseline is preserved conceptually: both frozen detectors,
their inputs, thresholds, and outputs remain intact. v1.1 adds evidence extraction,
privacy-minimized cloud context, and deterministic email guidance around those modules.

## Cloud configuration

The backend automatically loads the ignored local `backend/.env` file, while
preserving any values already set in the operating-system environment. It reads
`BANTAI_LLM_PROVIDER`, `GEMINI_API_KEY`, `GEMINI_MODEL`,
`GEMINI_FALLBACK_MODEL`, timeout, retry, character-limit, and cache-TTL variables.
Cloud email and URL reviews are always enabled and have no stored preferences.

## Known limitations

- The frozen XLM-R model has known low phishing recall on prior external research.
- Rules and LLM context can still produce false positives or false negatives.
- Redaction is best-effort and cannot guarantee removal of every identifier.
- No sender authentication, embedded-link scanning, redirects, TLS analysis,
  crawling, or overall numeric risk score is included.
