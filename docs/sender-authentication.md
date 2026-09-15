# Sender authentication context

The extension sends minimized authentication observations to Cloud AI in addition
to the From domain, subject, and redacted body. Frozen models and deterministic
fusion rules are unchanged. Authentication is positive context when aligned with
the claimed sender; it never guarantees harmless content.

## Available views

- Gmail: open the sender-details dropdown beside “to me”. The extension reads
  the displayed mailed-by and signed-by domains when From and Subject match.
- Outlook: More actions → View → View message details. The extension reads
  available SPF, DKIM, and DMARC results from the visible header panel.
- Yahoo: More options → View Raw Message. In-page header panels are supported,
  as is a plain raw-message tab on mail.yahoo.com with its original email tab
  still open. The extension checks the opener's current sender, subject, and
  active detection before attaching observations.

Collection is automatic when the provider exposes the details in these views;
the extension does not open menus, fetch hidden headers, or request mailbox API
permissions. Unexposed details stay unavailable. English field labels and plain
header subjects are currently supported; encoded subjects and unsupported UI
layouts fail closed instead of guessing. A raw tab without an opener cannot be
correlated and is ignored. Keep the original Yahoo message open while viewing
its raw headers.

Only allowlisted domains and authentication result enums reach Cloud AI. Raw
headers, recipient addresses, message IDs, IPs, signature values, and TLS details
are discarded. Body text is never parsed as authentication evidence. These are
extension-observed provider UI results, not independent server verification.

New observations refresh the cloud assessment and are included in the cloud
cache key. Refreshes of the same email do not reopen its automatic popup. The
extension retains observations under SHA-256 message fingerprints in memory
for five minutes, with a twenty-entry limit. The server keeps minimized context
only in its existing TTL memory store; authentication details are not added to
database history or training samples.

Deploy the updated public API and detector, reload the extension, and refresh
existing webmail tabs. Synthetic parser, privacy, cache, and gateway tests cover
the implementation. Live provider DOM behavior still needs Chrome/Edge checks.
