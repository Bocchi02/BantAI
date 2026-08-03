# Extension-Specific Codex Instructions

These instructions apply to all files under `extension/`.

## Browser platform

- Chromium Manifest V3
- Minimum Chrome/Chromium version: 127
- Use service workers rather than persistent background pages.
- Keep scripts compatible with standard browser JavaScript; do not introduce a
  build step unless explicitly requested.

## Current URL detector

- Read the URL only from Chrome Tabs API data such as `tab.url`.
- Scan when the active tab changes and when its address-bar URL changes.
- Never inspect page anchors to choose a URL for this detector.
- Never replace the address-bar URL with an embedded or redirected URL.

## Email detector

- Provider scripts are limited to:
  - Gmail
  - Outlook
  - Yahoo Mail
- Preserve provider-specific sender, subject, and message-body extraction.
- Do not run email extraction on other websites.
- Do not extract or score embedded email links.

## Popup behavior

- Roboto is the intended font family.
- Keep the layout easy to understand for people with limited digital literacy.
- Put technical scores inside `More details`.
- Keep the main SAFE/SUSPICIOUS signal large and readable.
- Automatic email-result popup duration is approximately 5 seconds.
- Manual toolbar popup opening must not force auto-close.

## Security

- No inline JavaScript.
- Preserve Manifest V3 CSP requirements.
- Do not add `eval`, remote JavaScript, or unnecessary permissions.
- Keep host permissions as narrow as practical.
- Do not persist email bodies in extension storage.
