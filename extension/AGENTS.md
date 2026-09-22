# Extension-Specific Codex Instructions

These instructions apply under `extension/`.

## Browser platform and scope

- Chromium Manifest V3; minimum Chrome/Chromium version 127.
- Use a service worker and standard browser JavaScript without a build step.
- Send inference only through the configured public HTTPS Signalam API. Never
  silently fall back to localhost or contact the private detector directly.
- Keep the revocable device credential in extension storage restricted to
  trusted extension contexts. Content scripts must never receive it or make API
  requests.
- Read the URL only from Chrome Tabs API data such as `tab.url`.
- Never choose URLs from anchors, email content, redirects, HTML, or the DOM.
- Run email extraction only on Gmail, Outlook, and Yahoo Mail.
- Preserve the working provider-specific sender, subject, and visible-body
  extraction. Never extract or score embedded email links.

## Popup and settings

- Use Roboto, large plain language, and a simple layout.
- Primary email outcomes are NO STRONG WARNING SIGNS, NEEDS CAUTION, and
  SUSPICIOUS SIGNS FOUND; SAFE may remain only as a technical detector badge.
- Show one final email outcome. Do not display a standalone email AI Review card;
  cloud assessment remains an internal input to deterministic email fusion.
- Show one final URL outcome. Do not display a standalone Cloud URL Review row;
  cloud assessment remains an internal input to deterministic URL fusion.
- Show each final URL or email verdict and explanation only once; do not repeat
  either result in a separate guidance card.
- Keep each final explanation to one or two sentences and name the specific
  observable warning or reassuring evidence whenever it is available.
- Keep scores and thresholds under `More details`.
- Automatic email-result popups last approximately five seconds.
- Manual toolbar popups must not be forced to auto-close.
- Open an automatic popup only after server-model and enabled cloud assessment outputs
  are complete; never reopen it for focus changes or the same result fingerprint.
- Cloud AI Review is always enabled and has no toggle or stored preference.
  Never store an API key or raw email body.
- Cloud URL Review is always enabled and has no toggle or stored preference. Run
  it only after a frozen RF warning and never send page content or browsing paths.

## Security

- No inline JavaScript, `eval`, remote JavaScript, or unnecessary permissions.
- Preserve Manifest V3 CSP and narrow host permissions.
- Prevent stale results from an older email or tab URL overwriting a newer one.
