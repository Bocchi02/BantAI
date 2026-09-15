# BantAI Privacy and Data Protection Audit

Audit date: 2026-09-15

## 1. Executive Summary

**Overall Privacy Risk:** High

**Privacy Recommendation:** **PRIVACY REMEDIATION REQUIRED**

This audit examined the supplied working tree as a pre-production, controlled-pilot system. It was non-mutating: no production account, mailbox, phishing URL, model, dataset, database, external provider, or deployment was used. The audit generated documentation and CSV evidence only.

The code has meaningful privacy controls: routine email bodies are not written to activity history, routine URL history is origin-only, explicit report and opt-in sample content uses AES-256-GCM authenticated encryption, token verifiers are server-side hashes, cloud payloads are server-reconstructed and minimized, caches are bounded process memory, and owner/device checks pass synthetic tests. No critical exposure was found in the reviewed source or controlled tests.

Two high-risk lifecycle gaps block a privacy-safe pilot decision: approved URL/email training candidates have no retention or deletion path after they outlive 90-day reports, and users have no account/report deletion workflow. Additional conditions concern automatic cloud processing of message context, readable sender display names at the provider boundary, and plaintext email metadata in administrator exports.

| Severity | Count |
|---|---:|
| Critical | 0 |
| High | 2 |
| Medium | 3 |
| Low | 2 |
| Informational | 1 |

## 2. Scope

Reviewed active application code, deployment files, schemas, models, migrations, extension scripts, web UI text, tests, existing code/dependency/dataset/functional/security reports, and ignored runtime artifact paths. Vendor/template trees and model binaries were not treated as application data sources. The audit statically reviewed production behavior and ran synthetic/mock tests only.

Evidence language:

- **VERIFIED** — demonstrated by current code and a passing controlled test.
- **STATICALLY REVIEWED** — demonstrated by source/configuration only.
- **SYNTHETICALLY TESTED** — tests used reserved/example values and mocked detector/provider boundaries.
- **NOT TESTED / NOT VERIFIED** — no controlled evidence obtained.
- **NOT ASSESSABLE** — evidence is outside this checkout.
- **MANUAL POLICY REVIEW REQUIRED** — a technical control cannot establish the needed governance decision.

Prior audit reports were treated as supporting evidence and rechecked against the current code. In particular, `BANTAI_SECURITY_API_REAUDIT.md`, `BANTAI_FUNCTIONAL_REAUDIT.md`, `BANTAI_DATASET_AUDIT.md`, and the dependency reports were reviewed.

## 3. Privacy Architecture

The Chromium MV3 extension reads the exact `tab.url` and supported visible opened-email content. It sends authenticated detection input to the public platform; the platform calls a private detector through an internal key on an internal Compose network. The detector runs the frozen RF/XLM-R and indicator/fusion logic. Gemini contextual review is a backend-only provider call. MySQL stores account, device, activity, reporting, consent, and training-candidate records.

Production Compose keeps MySQL and detector un-published, runs platform/detector non-root and read-only, disables Uvicorn access logging, and uses Caddy TLS at the public edge. Live network/TLS/log-sink behavior was not tested.

## 4. Data Inventory

The complete field-oriented inventory is in `BANTAI_PRIVACY_DATA_INVENTORY.csv`. Actual discovered categories include account identity, password/session/device verifiers, pairing data, exact address-bar URLs, origin-only routine URL history, visible email sender/subject/body, sender-authentication observations, activity metadata, explicit reports, opt-in samples, cloud payloads/results, opaque security events, and rate-limit counters.

Not found as application data collection: date of birth, age, general browser history, webpage DOM/page content, email inbox enumeration, embedded-email-link crawling, analytics identifiers, or a mailbox-provider OAuth token.

## 5. Data Flow Map

| Flow | Source | Destination | Data | Purpose | Stored? | External? |
|---|---|---|---|---|---|---|
| Website detection | Browser `tab.url` | Extension → platform → private detector | Exact active HTTP/S URL, device credential, event time | Frozen URL analysis | Exact input transient; activity origin encrypted | No, except Gemini origin review after RF warning |
| Opened email detection | Visible Gmail/Outlook/Yahoo message | Content script → service worker → platform → detector | Provider, sender, subject, visible body, current tab URL, minimized auth observations | XLM-R, indicators, fusion | Body transient; activity stores encrypted sender/subject only | Gemini receives minimized/redacted contextual payload |
| Routine activity | Platform after completed detection | MySQL | Origin or provider/sender/subject, outcome, cloud state, timing, opaque IDs | User history/explanation binding | Yes | No |
| More details | Matching owner/device activity | Platform/detector or platform → Gemini | Transient email context when present; otherwise stored metadata; URL origin | User-requested explanation | No generated explanation persistence | Gemini when enabled |
| Explicit URL report | User/extension confirmation | Platform → MySQL | Full normalized URL, classification/reason/outcome | Review/future candidate | Yes, encrypted | No |
| Explicit email report | User/extension confirmation | Platform → MySQL | Provider, sender, subject, body, classification/reason/outcome | Review/future candidate | Yes, encrypted | No |
| Automatic sample | Completed detection + active opt-in | Platform → MySQL | Selected full URL or sender/subject/body | Future model-improvement inventory | Yes, encrypted | No |
| User account/session | Web UI | Platform → MySQL/browser cookies | Names/email/password, session/CSRF value | Identity/authentication | Yes; credential hashes server-side | No |
| Pairing | Dashboard then extension | Platform → extension/local browser storage | One-time code, device token, label | Device authorization | Hash server-side; token local extension storage | No |

Authentication is device bearer authentication for extension paths; dashboard mutations also require an authenticated session plus CSRF header. HTTPS is required in remote configuration. Cloud provider transit encryption is assumed from the provider SDK/HTTPS configuration but was not packet-captured, so it is **NOT VERIFIED** in a live deployment.

## 6. Purpose Limitation

| Data category | Evident purpose | Necessity assessment | Less identifiable alternative / condition |
|---|---|---|---|
| Account email/names | Account and controlled-pilot administration | PROBABLY NECESSARY | Separate display name from legal identity; set account deletion/retention |
| Password/session/device verifiers | Authentication/revocation | NECESSARY | Existing hashes are appropriate |
| Exact current URL for inference | Frozen lexical RF requires exact address-bar input | NECESSARY | Do not retain exact URL after routine inference |
| Origin-only activity | User history/explanation | PROBABLY NECESSARY | Existing origin minimization is appropriate |
| Sender/subject in routine activity | History/explanation and report binding | PROBABLY NECESSARY | Consider sender domain or redacted subject for lower-risk history |
| Routine email body | Email XLM-R/indicators/fusion | NECESSARY transiently | Must remain non-persistent absent explicit workflow |
| Explicit report body/full URL | Review/future candidate | PROBABLY NECESSARY only after confirmation | Define candidate retention, withdrawal, and deletion |
| Opt-in sampled content | Future model improvement | OPTIONAL | Existing opt-in/default-off and sampling are positive controls |
| Cloud email context | Supplemental contextual review | CONDITIONAL | Local analysis continues without it; minimize display name and establish user notice/authority |
| Administrator exports | Future restricted data preparation | QUESTIONABLE in current breadth | Sender/subject/full URL should be released only to a specifically justified role/workflow |

## 7. Data Minimization

**Verified controls:** activity normalizes routine URLs to origin; routine activity schema rejects email body; URL cloud payload removes paths/query/fragments and page content; cloud email fields are bounded; sender-authentication is allowlisted; strict schemas bound payload sizes; report body is capped at 10,000 characters; automatic sample decision occurs once.

**Conditions:** full URL remains in extension session state while its tab is open and in an explicit report/candidate; routine history retains full sender and subject; cloud payload leaves a readable sender display name; administrator exports decrypt sender/subject/full URLs. See `PRIV-CLOUD-001` and `PRIV-ADMIN-001`.

## 8. URL Data

The RF receives exact `tab.url`, including path/query/fragment, strictly as inference input. The platform records only `scheme://hostname[:port]` in `activity_events.origin_encrypted`. URL cloud review runs only after the RF signal is suspicious and receives origin/hostname/model values only. It does not crawl, fetch, follow redirects, perform TLS analysis, or send page content.

Full URL, including path/query/fragment, is deliberately retained only in `url_reports`, `url_training_candidates`, and opted-in `automatic_training_samples`; all are encrypted. Explicit reporting is clearly disclosed in the UI. Retention/deletion for approved URL candidates is not defined (`PRIV-RET-001`).

## 9. Email Data

| Stage | Sender | Subject | Body | Persistent? | External? |
|---|---|---|---|---|---|
| Visible extraction | Read from opened supported message | Read from opened supported message | Read from visible opened message | Content-script memory only | No |
| Extension state | Sender/subject and result in `chrome.storage.session` | Same | No raw body stored in extension state | Session state until tab close/clear | No |
| Platform/detector request | Sent for detection | Sent for detection | Sent for detection | Request/process memory | Private detector |
| Routine activity | AES-GCM encrypted | AES-GCM encrypted | Not stored | Activity for 90 days | No |
| Transient explanation context | Present | Present | Present | Memory only, default 600 seconds/max 512 | Gemini only when explanation/review occurs |
| Explicit report | AES-GCM encrypted | AES-GCM encrypted | AES-GCM ciphertext | Report 90 days; candidate may outlive report | No provider transfer by report itself |
| Approved candidate | AES-GCM encrypted | AES-GCM encrypted | AES-GCM ciphertext | Retention not defined | No, until a separate future workflow |

Routine body persistence was synthetically tested and not found. The process-memory context intentionally survives a service-worker request only through its bounded platform store; it is cleared by process restart, TTL/LRU eviction, and device revocation. Browser restart behavior was not live tested.

## 10. Cloud / Third-Party Processing

`BANTAI_CLOUD_DATA_MATRIX.csv` contains the provider-bound matrix. Gemini is the only active third-party content provider identified. Automatic email review is initiated as part of authenticated remote analysis; automatic URL review is limited to an RF warning. Direct email-cloud review and activity explanation routes repeat redaction at the platform boundary. Pasted-message review requires session, CSRF, and explicit confirmation.

The repository has no provider data-processing agreement, account settings, provider-side retention setting, region, deletion evidence, or production egress evidence. Provider retention/deletion is therefore **NOT ASSESSABLE**.

## 11. Redaction / Minimization

Server-side enforcement is **VERIFIED**. `prepare_direct_email_review_payload` reconstructs an allowlisted payload from authenticated input; it does not trust a client field merely because it is named `redacted_*`. Existing mock coverage passed with synthetic email, phone, OTP, card, account, and untrusted-authentication values. A separate controlled audit invocation confirmed they were removed and that a full URL became origin-only.

Redaction is best effort, pattern based, and not a formal identifier/anonymization guarantee. Names are not redacted: a sender display name remains in the provider payload. This is a minimization finding, not a claim that email addresses or listed token patterns are passed (`PRIV-CLOUD-001`).

## 12. Database Storage

The storage inventory and field disposition are in `BANTAI_PRIVACY_STORAGE_MATRIX.csv`. MySQL stores eleven user-related application tables plus migration version metadata. Runtime uses a distinct least-privilege role per Compose configuration; live MySQL grants and physical storage encryption were not tested.

Routine raw email bodies have no `activity_events` column and are excluded by schema test. Report/sample/candidate content is application-layer ciphertext. Candidate tables intentionally have no direct `user_id`, which lowers direct reporting-identity linkage but prevents a user-directed candidate lifecycle.

## 13. Encryption at Rest

**VERIFIED SYNTHETICALLY:** `encrypt_text` uses `AESGCM` with a 32-byte base64 environment key, a new 12-byte random nonce for each encryption, associated data `bantai-activity-v1`, and authenticated decryption. The encryption round-trip test passed. Decryption/encryption-key errors fail rather than silently return plaintext. No key value was read or printed.

Classification:

- **ENCRYPTED:** activity origin/sender/subject; URL reports/candidates; email reports/candidates; automatic sample content.
- **HASHED:** passwords (Argon2id); sessions, CSRF, device credential, pairing code (SHA-256); blind indices/HMAC fingerprints.
- **PLAINTEXT:** account email/names/status/consent, device label/timestamps, outcomes/timing/model labels, provider name, body length.
- **NOT STORED routinely:** raw email body and raw cloud request payload.

Database-volume, backup, and key-management-service encryption are **NOT ASSESSABLE** from this repository.

## 14. Credentials / Tokens

Passwords are Argon2id verifiers. Session, CSRF, pairing, and device credentials are stored server-side as SHA-256 hashes. The raw device credential is returned only from the pairing exchange and stored in extension local storage restricted to trusted extension contexts. Session cookies are configured HttpOnly/Secure in remote mode and SameSite Lax in the login route. Tests cover revocation and generic login failures.

No server database plaintext bearer credential was found. Production process memory, proxy logs, browser devtools, and external error monitoring were not inspected.

## 15. Browser Storage

`chrome.storage.local` contains only the device credential and submitted-feedback IDs. The worker calls `setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"})` for local and session storage. `chrome.storage.session` contains per-tab result state, current full URL, sender/subject, indicators, cloud/fusion result, access state, popup marker, and sampling diagnostics. It does not contain raw email body. Tab state is removed on tab close; disconnect/revocation clears session state and credential. The extension uses no `localStorage`, `sessionStorage`, or IndexedDB.

This is a **PASS WITH CONDITIONS** based on static code and source tests; no Chromium storage-inspection session was available to verify browser-restart semantics.

## 16. Extension Privacy

Content scripts are restricted to Gmail, Outlook, and Yahoo host permissions. They extract visible opened sender/subject/body and do not have the device credential or direct API code. No DOM/anchor/email-link scan was found. Sender-authentication handling rejects raw headers, recipient addresses, message IDs, IPs, signature data, and TLS fields before cloud use.

Static diagnostic invariants passed: console calls use event codes, not payload/sender/subject/body/full URL/token arguments. The active code still contains unused legacy helper functions that would serialize raw content to disabled paths; they have no active callers but should be removed under a future approved change (`PRIV-EXT-001`).

## 17. Logs

Uvicorn is started with `--no-access-log`; Caddy configuration contains no access-log directive; structured security events restrict event code/outcome/reason and use keyed opaque IDs. The extension static invariant rejects sensitive diagnostic arguments. Two ignored development log files existed and were zero bytes. No populated HAR, database dump, capture, or private screenshot was found in the reviewed working tree.

Container log-driver, Caddy operational error logs, retention/rotation, support tickets, and centralized logging are outside the checkout (`PRIV-LOG-001`).

## 18. Activity / History

Activity rows are owner/device-bound and retain type, encrypted origin or encrypted sender/subject, provider, outcome, cloud state/failure category, duration, timestamps, and input fingerprint. They do not retain routine body. Users query only `ActivityEvent.user_id == current.user.id`; administrators receive aggregate dashboard metrics, not activity listings. Activity cleanup deletes rows older than 90 days and the synthetic cleanup test passed.

Routine sender/subject retention is justified as **PROBABLY NECESSARY** for user history and metadata-only explanation fallback, but should remain part of a pilot data-minimization review.

## 19. Feedback / Reports

Routine activity and explicit reporting are separated. Email report schemas require `confirmed: true`; web and extension UIs show a consent checkbox and explain encrypted reporting. Email body plaintext is not returned to users or administrators. URL reports explicitly disclose full-address submission. Reports are linked to their owner, and administrator queues omit reporter ID.

Administrator approval copies ciphertext into a de-identified candidate table. The feature has no training execution path in scope; candidate retention, deletion, and withdrawal are the major exception (`PRIV-RET-001`, `PRIV-DEL-001`).

## 20. Training / Research Consent

Automatic sampling is default off, requires a confirmed opt-in, records a version/time, rechecks consent after inference, samples at 10%, encrypts selected content, and deletes automatic samples on opt-out. These controls were synthetically tested.

Explicit email-report consent covers encrypted storage and administrator training review in the UI. However, there is no separate durable report-to-training consent field, no withdrawal path for approved candidates, and no rule documenting whether an approved candidate survives withdrawal. **CONSENT LIFECYCLE NOT DEFINED** for approved report-derived candidates.

The dataset audit found no production-to-research corpus in this checkout. Future training remains separately authorized and is not demonstrated here.

## 21. Retention

| Data | Retention | Enforcement | Verified? |
|---|---|---|---|
| Activity rows | 90 days | startup plus 24-hour `cleanup_expired` loop | VERIFIED |
| URL/email reports | 90 days | same cleanup | VERIFIED |
| Automatic samples | 90 days | same cleanup; opt-out immediate deletion | VERIFIED |
| Session | 24 hours | expiry-aware validation and cleanup | VERIFIED |
| Pairing code | 5 minutes or consumed | validation and cleanup | VERIFIED |
| Rate-limit buckets | 1 day | cleanup | STATICALLY REVIEWED |
| Platform transient context | 600 seconds default/max 512 | monotonic TTL/LRU | VERIFIED |
| Detector local analysis cache | 300 seconds/max 128 | TTL/LRU | STATICALLY REVIEWED |
| Cloud result cache | 600 seconds default/max 128 | TTL/LRU | STATICALLY REVIEWED |
| URL/email training candidates | Not defined | No TTL/cleanup query | FAIL — `PRIV-RET-001` |
| User/device records | Not defined | No deletion lifecycle | FAIL — `PRIV-DEL-001` |
| Security-event logs/backups/provider data | Not defined in repository | Not assessable | NOT ASSESSABLE |

## 22. Deletion

**DELETION PATH EXISTS:** expiry cleanup for activity/reports/samples/sessions/pairing/rate buckets; automatic-sample opt-out; device credential removal/remote revocation; transient context clear on device revocation.

**PARTIAL:** suspension revokes sessions/devices but retains account records; report cleanup does not remove approved candidates copied earlier.

**NOT IMPLEMENTED / NOT DEFINED:** self-service or documented manual account deletion; report deletion; approved candidate deletion; backups/provider deletion. These gaps are findings.

## 23. User Access / Transparency

Users can view their profile, devices, activity, reports, feedback status, and automatic-collection state. Owner filters are present on user lists/routes. The landing and Help views disclose server analysis, redacted/minimized cloud review, routine body non-storage, origin-only URL history, report/opt-in sample separation, and the non-guarantee meaning of green outcomes.

This is functional transparency, not a legal opinion. It does not constitute a complete privacy notice because provider retention, candidate lifecycle, backup handling, deletion process, and exact automatic cloud basis are absent or dispersed (`PRIV-NOTICE-001`).

## 24. Administrator Access

Administrators can list user identity/status/device counts; see aggregate operations; review URL reports with full URL; review email reports with provider, readable sender, readable subject, body size, labels/reason/status; inspect candidate metadata; and export URL candidates or email metadata manifests. Administrators cannot retrieve/decrypt email body through inspected API/UI routes. CSV responses set `Cache-Control: no-store` and neutralize formula prefixes.

The body restriction is positive. Sender/subject/full URL exports still need a role/necessity and download-governance decision (`PRIV-ADMIN-001`).

## 25. User Isolation

Owner and device predicates are present on activity, report feedback, explanation, device, and account routes. Synthetic tests demonstrated another device/user receives 404 for a detection explanation; regular users receive 403 from administrator APIs; device revocation rejects later detection requests. No cross-user private-content retrieval was demonstrated.

This does not validate a live multi-node database or production identity provider, which is outside scope.

## 26. Transient Context / Cache

The platform `TransientDetectionStore` key is `(user_id, device_id, detection_id)`, stores deep copies in process memory, defaults to 600 seconds/512 entries, purges on read/write, evicts LRU entries, clears on device revocation, and clears on process restart. It can include raw email body by design for a matching explanation/report restoration. Detector/cloud caches use hash keys and bounded TTLs; cloud cache values contain validated results rather than raw inputs.

The detector's local email-analysis cache contains email model output including sender/subject returned by the model response for up to 300 seconds. It does not store raw body. Cache keys are non-reversible hashes but are not application-layer encrypted in memory.

## 27. Error Handling

Malformed/oversized requests receive bounded generic details; detector/provider failures become `UNAVAILABLE` and do not become SAFE. The platform gateway suppresses raw downstream exception content. Existing tests passed for size enforcement, provider failure, and no pasted-message echo. Live proxy/exception-monitoring behavior remains **NOT VERIFIED**.

## 28. Analytics / Telemetry

**NO THIRD-PARTY ANALYTICS FOUND** in active application code or dependencies reviewed: no Google Analytics, Sentry, Meta Pixel, Segment, Mixpanel, crash-reporting, or browser-fingerprinting integration was found. A Google Fonts CSS import is statically present, but the worker CSP permits only self style sources; live browser CSP behavior was not tested, so a runtime transfer is not claimed.

## 29. External Services

| Service | Runtime user-data relevance | Assessment |
|---|---|---|
| Google Gemini | Receives redacted/minimized email context, URL origins, user-pasted text, or requested explanation context | Active third party; see cloud matrix |
| Caddy / Docker / MySQL | Self-hosted deployment components | Not third party by code; operator controls require live validation |
| Cloudflare Worker/Images runtime | Hosts/proxies web app if deployed there | Deployment/account configuration not available; user-data processing not assessable |
| Google Fonts | Static CSS import only; CSP may block runtime import | Not verified as active transfer |
| Gmail/Outlook/Yahoo | Browser-hosted mail UI only, no provider API integration | Content script reads visible DOM; no mailbox API credential found |

## 30. Explanation Privacy

More-details routes validate owner/device/activity binding before calling a provider. If matching transient email context exists, the provider receives redacted bounded body/context; otherwise the fallback uses stored sender/subject only. URL explanations use origin only. The response labels whether full context was available. No route reconstructs body from activity history or report storage. Explanation budgets are account-scoped and synthetic tests pass.

## 31. Security Event Privacy

`security_events.py` only accepts an allowlist of event codes, bounded outcomes/reasons, opaque keyed principal/request identifiers, and JSON emission. It excludes message text, URL, token, password, pairing code, and payload fields by interface. Security event schema privacy is **VERIFIED** by source/test. Sink access and retention are **NOT ASSESSABLE**.

## 32. Backup Privacy

**BACKUP PRIVACY NOT ASSESSABLE.** Compose defines MySQL/Caddy volumes but no backup target, encryption, retention, restore test, or deletion propagation. Earlier dependency materials also identify backup/restore as an operational action. A pilot must not imply backup controls that cannot be shown.

## 33. Development / Test Data

The repository scan used path/count-only checks and did not reproduce matched values. The project `.gitignore` excludes `.env`, credentials, model weights, validation data, SQLite/DB files, HARs, captures, screenshots/private, and logs. Two ignored web development log paths existed and were zero bytes. No populated private test data artifact was identified in the reviewed active tree. Dataset audit found no ML corpus to review; that is not proof an external corpus is PII-free.

## 34. Dataset Boundary

`BANTAI_DATASET_AUDIT.md` found no ML-ready corpus or provenance/split artifact. Runtime reports/samples can create future encrypted candidates, but no model training consumes them in this checkout. Automatic opt-in samples and human-approved candidates are separate tables. Report-derived candidates have no user ID, which helps separation but prevents direct withdrawal/deletion. **DATASET PRIVACY NOT ASSESSABLE** beyond this technical boundary.

## 35. Exports

URL candidate exports include decrypted complete URLs. Email candidate and automatic-email manifests include provider, decrypted sender, decrypted subject, label/outcome, model information, and body size/availability but no body/ciphertext/fingerprint/reporter ID. This is a concrete minimization improvement for body content, yet potentially excessive direct-identifier export remains (`PRIV-ADMIN-001`).

## 36. Privacy Choices / Consent

| Choice | Stored? | Default | Mutable? | Effect |
|---|---|---|---|---|
| Automatic training contribution | Yes: enabled/time/version | Off | Yes | Enables 10% server-side sample selection; off deletes automatic samples |
| Explicit email report | Confirmation required per request | No report | Not a stored withdrawal state | Permits encrypted report and admin training review |
| Pasted-message Cloud AI review | Confirmation required per request | No submission | Per request | Permits one no-storage review |
| Cloud email/URL review | No user preference | Always enabled by architecture | No | Automatic email context; URL only after RF warning |
| Privacy notice acknowledgement | Not found | N/A | N/A | No technical state |

Automatic sample consent is technically honored. Candidate withdrawal after an explicit report is not defined.

## 37. Privacy Defaults

Supported by code: automatic training collection defaults off; public registration is disabled in remote Compose; raw routine body is not stored; cloud URL context is origin-only; server-side cloud redaction is mandatory; debug/access logs are restricted; release requires HTTPS; extension host permissions are limited; and device credentials are revocable.

Not a privacy-by-default conclusion: automatic cloud email review is enabled without a user preference; candidate retention is undefined; account deletion is unavailable.

No age/date-of-birth field or minor-specific data collection was found. If the intended pilot includes minors/students, separate policy/legal review is required.

## 38. Privacy Notice Consistency

The landing page, Help page, `README.txt`, and `shared_platform/README.md` accurately describe several verified behaviors: HTTPS server analysis, origin-only routine URL history, routine-body non-storage, redacted cloud review, explicit report encryption, opt-in automatic sampling, and body non-exposure in administrator APIs.

**NOTICE INCOMPLETE:** there is no dedicated privacy notice, and current user-facing material does not define provider retention/processing terms, approved-candidate retention/deletion, account deletion, backup treatment, or the rationale/choice state for automatic cloud email processing. This is not a conclusion about legal notice requirements.

## 39. Legal / Policy Mapping Limitations

The code describes a Philippine scam engine but does not claim or demonstrate compliance with Philippine privacy law. **LEGAL COMPLIANCE REQUIRES SEPARATE LEGAL/PRIVACY REVIEW.**

| Technical principle | Status | Evidence / limitation |
|---|---|---|
| Transparency | PARTIALLY SUPPORTED | Distributed UI/docs explain key flows; lifecycle/provider detail incomplete |
| Declared purpose | PARTIALLY SUPPORTED | Source/docs give processing purposes; candidate lifecycle incomplete |
| Proportionality/minimization | PARTIALLY SUPPORTED | Origin-only history/cloud URL and body non-storage pass; display name/admin export/candidate lifecycle remain |
| Retention limitation | NOT SUPPORTED for all data | Core activity/report/sample TTLs enforced; candidates/account/logs/backups unresolved |
| Security | SUPPORTED BY TECHNICAL EVIDENCE | Encryption, hashes, auth, isolation, bounded caches, least-privilege design, tests |
| Accountability | PARTIALLY SUPPORTED | Security events and audit artifacts exist; production operational evidence absent |
| Access/correction/deletion | PARTIALLY SUPPORTED | Profile/history/report visibility and profile update exist; deletion/candidate withdrawal absent |

## 40. Findings Summary

| ID | Severity | Data / Component | Finding | Impact | Confidence |
|---|---|---|---|---|---|
| PRIV-RET-001 | HIGH | URL/email training candidates | No retention or cleanup applies after approval | Long-lived encrypted private content without documented end date | High |
| PRIV-DEL-001 | HIGH | Accounts/reports/candidates | No account/report deletion workflow; candidate withdrawal impossible once de-identified | Users cannot exercise a complete data-lifecycle control | High |
| PRIV-CLOUD-001 | MEDIUM | Gemini email payload | Sender display name is forwarded readable | Direct identifier may reach third party without documented necessity | High |
| PRIV-CONSENT-001 | MEDIUM | Automatic cloud email review | Redacted email context transfers automatically and local result remains available if it fails | No user-level preference/explicit per-review choice for non-essential contextual layer | High |
| PRIV-ADMIN-001 | MEDIUM | Admin report/training exports | Plaintext sender/subject and full URL are downloadable to administrators | Additional internal recipients and local downloads increase disclosure surface | High |
| PRIV-NOTICE-001 | LOW | User-facing privacy information | Privacy content is incomplete/dispersed | Users cannot assess all lifecycle/third-party conditions | High |
| PRIV-LOG-001 | LOW | Production logging/backups | Sink retention/access/rotation and backups absent from repository | Operational metadata/backup privacy cannot be verified | High |
| PRIV-EXT-001 | INFORMATIONAL | Extension legacy helpers | Unused helpers serialize raw content to disabled paths | Future accidental activation could bypass current active flow assumptions | Medium |

## 41. Detailed Findings

### PRIV-RET-001 — Approved candidate retention is not defined or enforced

Severity: HIGH

Confidence: High

Affected Data: Encrypted full reported URLs; encrypted email sender, subject, and body; model/label metadata.

Affected Component: `url_training_candidates`, `email_training_candidates`, administrator approval.

Affected File(s): `shared_platform/app/models.py`; `shared_platform/app/main.py`.

Data Subjects: Reporting users and people referenced in reported messages/URLs.

Expected Privacy Behavior: Sensitive candidate data has a documented, enforceable retention period and deletion/archival process distinct from routine report cleanup.

Observed Behavior: `cleanup_expired` removes reports, activity, and automatic samples at 90 days but contains no candidate deletion. Approval copies report ciphertext to candidate tables; documentation expressly says it survives ordinary report retention. No candidate retention timestamp/TTL/cleanup rule exists.

Evidence: Static review of `cleanup_expired` and approval routes; `PT-010`.

Privacy Impact: A sensitive email body or full URL can persist indefinitely after the report that created it disappears. The system cannot demonstrate retention limitation for future training material.

Exposure / Processing Path: Explicit report → administrator approval → de-identified candidate → administrator inventory/metadata export or future restricted training.

Recommended Remediation: Define the candidate purpose, maximum retention, review/renewal requirement, cryptographic/key lifecycle, and an enforced cleanup workflow before a pilot. Do not implement this under this audit.

Requires Policy Update: Yes

Requires Code Change: Yes

Requires Data Cleanup: Unknown

Deployment Blocking: Yes

### PRIV-DEL-001 — User data deletion and report-derived candidate withdrawal are absent

Severity: HIGH

Confidence: High

Affected Data: Account email/names, reports, approved candidates, associated metadata.

Affected Component: Account/profile/report lifecycle.

Affected File(s): `shared_platform/app/main.py`; `shared_platform/app/models.py`; `web/app/views/ProfileView.jsx`.

Data Subjects: Account holders and message correspondents in user-submitted reports.

Expected Privacy Behavior: The product documents a deletion/withdrawal route or controlled operational process for account-linked sensitive content and describes limits for de-identified candidates.

Observed Behavior: The user can edit name/password, revoke devices, and opt out of automatic samples. No account delete, report delete, or candidate delete route/UI/documented process was found. Candidate records lack user ownership by design, so later user withdrawal cannot target them.

Evidence: Route/model/static review; `PT-011`; `PT-010`.

Privacy Impact: An account holder cannot remove submitted private content before retention, and approved content cannot be reconciled with a later withdrawal request.

Exposure / Processing Path: Account/report → candidate approval → persistent de-identified candidate.

Recommended Remediation: Establish a controlled deletion request process, account lifecycle specification, candidate withdrawal policy, and technical linkage/escrow approach compatible with minimization. Do not silently re-identify candidates.

Requires Policy Update: Yes

Requires Code Change: Yes

Requires Data Cleanup: Unknown

Deployment Blocking: Yes

### PRIV-CLOUD-001 — Sender display name reaches the cloud provider without name minimization

Severity: MEDIUM

Confidence: High

Affected Data: Sender display name, sender domain, redacted message context.

Affected Component: Detector/platform cloud review payload construction.

Affected File(s): `backend/llm/redaction.py`; `shared_platform/app/cloud.py`; `backend/llm/remote_provider.py`.

Data Subjects: Email senders and any person named in a sender display field.

Expected Privacy Behavior: Provider payload contains only fields necessary for contextual analysis and direct identity fields have a documented necessity or are removed/pseudonymized.

Observed Behavior: Address, phone, OTP, card, and account patterns are removed, but `sender_parts` preserves the readable display name. Controlled synthetic testing recorded `display_name_forwarded=True`.

Evidence: `PT-002`, `PT-003`, existing redaction/remote-provider tests.

Privacy Impact: A potentially identifying person name reaches Gemini even when only sender domain may meet the contextual purpose.

Exposure / Processing Path: Opened email → private detector/platform → Gemini payload.

Recommended Remediation: Determine whether display name is required for the model’s contextual purpose; if not, omit it. If retained, document the necessity and provider-processing condition and add an explicit regression test.

Requires Policy Update: Yes

Requires Code Change: Yes

Requires Data Cleanup: No

Deployment Blocking: No, if formal pilot conditions justify it; otherwise treat as pre-pilot remediation.

### PRIV-CONSENT-001 — Automatic cloud email processing lacks a user-level choice for a conditional layer

Severity: MEDIUM

Confidence: High

Affected Data: Redacted bounded email subject/body, sender metadata/domain, authentication observations, model indicators.

Affected Component: Automatic cloud email review.

Affected File(s): `shared_platform/app/detector_gateway.py`; `backend/llm/__init__.py`; `extension/background/service-worker.js`; user documentation.

Data Subjects: Email recipients/senders and persons referenced in opened emails.

Expected Privacy Behavior: The automatic third-party processing basis and user-facing disclosure are clearly defined, especially where local detection remains useful without it.

Observed Behavior: Remote detector calls force cloud review; extension states it is always enabled. Failure becomes UNAVAILABLE while local XLM-R/indicator/fusion continues. Landing/Help disclose redacted cloud review but no stored user preference or per-review choice exists.

Evidence: Static flow review and passing cloud-failure tests.

Privacy Impact: Every supported opened email may produce an external contextual payload without a user-managed setting, despite the layer being supplemental.

Exposure / Processing Path: Opened email → public API/private detector → Gemini.

Recommended Remediation: Before pilot, obtain the product/privacy decision documenting the necessity/authority, notices, provider terms, and fallback behavior. The current architecture instruction says no toggle; this audit does not change that architecture.

Requires Policy Update: Yes

Requires Code Change: Unknown

Requires Data Cleanup: No

Deployment Blocking: No, if a documented controlled-pilot decision exists; otherwise condition of pilot approval.

### PRIV-ADMIN-001 — Administrator exports disclose plaintext email metadata and complete URLs

Severity: MEDIUM

Confidence: High

Affected Data: Email sender, subject, provider, full approved URL, labels and timestamps.

Affected Component: Administrator report/training inventory and CSV exports.

Affected File(s): `shared_platform/app/main.py`; `web/app/views/TrainingDataView.jsx`.

Data Subjects: Email senders and people referenced by reports/URLs.

Expected Privacy Behavior: Administrator access and exports expose the least metadata necessary to perform their restricted workflow.

Observed Behavior: API/UI never returns email body/ciphertext/fingerprint/reporter ID, but decrypts sender/subject for admin queues, candidate views, and CSV manifests. URL exports decrypt complete URL, including possible query/fragment data.

Evidence: `PT-005`, `PT-006`, source/export review.

Privacy Impact: A role with CSV download can create local copies of direct identifiers or full URLs beyond the core database boundary.

Exposure / Processing Path: Explicit report/candidate → admin route → browser download.

Recommended Remediation: Define restricted admin roles, export approval/audit handling, purpose-specific field sets, and whether sender domain/redacted subject/origin can replace plaintext fields in each view/export.

Requires Policy Update: Yes

Requires Code Change: Yes

Requires Data Cleanup: Unknown

Deployment Blocking: No, with a controlled administrator/operational procedure.

### PRIV-NOTICE-001 — Privacy information is incomplete and dispersed

Severity: LOW

Confidence: High

Affected Data: All product data categories.

Affected Component: Landing, Help, README and service documentation.

Affected File(s): `web/app/views/LandingView.jsx`; `web/app/views/HelpView.jsx`; `README.txt`; `shared_platform/README.md`.

Data Subjects: All users and email correspondents.

Expected Privacy Behavior: User-facing information consistently explains storage, external processing, retention, deletion, and choices.

Observed Behavior: Key technical statements match code, but no dedicated notice covers provider retention, backups, candidate lifecycle, account/report deletion, or automatic cloud-processing rationale.

Evidence: Static UI/documentation comparison.

Privacy Impact: A user cannot make an informed operational decision from the product material alone.

Exposure / Processing Path: Product onboarding and user-facing information.

Recommended Remediation: Obtain legal/privacy-owner review and publish consistent approved information after separate remediation authorization.

Requires Policy Update: Yes

Requires Code Change: Possibly

Requires Data Cleanup: No

Deployment Blocking: No, but a pilot condition.

### PRIV-LOG-001 — Production log and backup privacy controls cannot be verified

Severity: LOW

Confidence: High

Affected Data: Security-event metadata and any unexpected operational error context.

Affected Component: Docker/Caddy/log sink/backups.

Affected File(s): `docker-compose.yml`; `deploy/Caddyfile`; `shared_platform/app/security_events.py`.

Data Subjects: Users/devices implicated in security events.

Expected Privacy Behavior: Log and backup retention, access, encryption, and deletion are documented and verifiable.

Observed Behavior: Application-level controls minimize emitted events and access logging is disabled, but Docker log driver, aggregation destination, rotation, backup target, encryption, and restore/deletion procedures are absent.

Evidence: `PT-020`; `PT-022`; static deployment review.

Privacy Impact: Privacy-safe source events can still be retained/accessed unsafely by an unspecified operational sink.

Exposure / Processing Path: Container output/security logger → deployment operator/sink/backup.

Recommended Remediation: Define and test production log/backup configurations, access roles, retention, encryption, incident handling, and restoration/deletion behavior.

Requires Policy Update: Yes

Requires Code Change: Unknown

Requires Data Cleanup: Unknown

Deployment Blocking: No, but must be completed before production expansion.

### PRIV-EXT-001 — Dormant legacy helpers retain unsafe raw serialization capability

Severity: INFORMATIONAL

Confidence: Medium

Affected Data: Exact URL and email content if the helpers are reconnected.

Affected Component: Extension service worker.

Affected File(s): `extension/background/service-worker.js`.

Data Subjects: Extension users and message correspondents.

Expected Privacy Behavior: Released code contains no dormant route capable of serializing raw private content outside the current authenticated flow.

Observed Behavior: `legacySubmitActivity`, `legacyRememberDetailContext`, and `submitAutomaticTrainingSample` serialize supplied raw content to `/legacy-disabled/...` paths. Static call search found they are only referenced by an unused legacy scan function, not the active scan flow.

Evidence: Static call-graph review; active extension invariants pass.

Privacy Impact: No active transfer was demonstrated, but future accidental activation could create a divergent raw-content path.

Exposure / Processing Path: Inactive extension helper → disabled endpoint path.

Recommended Remediation: Under a separately authorized maintenance change, remove dead compatibility paths and add a release invariant forbidding raw-content calls outside authenticated detection/report routes.

Requires Policy Update: No

Requires Code Change: Yes

Requires Data Cleanup: No

Deployment Blocking: No

## 42. Positive Privacy Controls

- Routine email body is absent from activity schema and synthetic persistence tests pass.
- Routine URL history stores encrypted origin, not full path/query/fragment.
- Explicit reports and automatic samples use AES-256-GCM authenticated encryption.
- Report/email body APIs and administrator UI/export never expose body/ciphertext/fingerprint/reporter ID in tested flows.
- Automatic contribution is default-off, confirmed, versioned, sampled, rechecked after inference, and deletes automatic samples on opt-out.
- Server repeats redaction/minimization at the provider boundary and rejects untrusted auth keys.
- Cloud URL review is origin-only and does not send page content/navigation details.
- Cloud/provider failure becomes UNAVAILABLE, not SAFE.
- Password/session/device/pairing server records use appropriate hashing; raw device credential is trusted-context extension storage only.
- Owner/device authorization and revocation checks passed synthetic negative tests.
- Transient context is user/device/detection scoped, bounded, LRU/TTL limited, and clearable on revocation.
- Extension diagnostics and structured security events are privacy-minimized by active invariant tests.
- No third-party analytics integration was found.

## 43. Privacy Deployment Blockers

1. **PRIV-RET-001:** define and enforce retention for approved encrypted training candidates.
2. **PRIV-DEL-001:** define a deletion/withdrawal lifecycle for accounts, reports, and de-identified approved candidates.

For a controlled pilot, document conditions for `PRIV-CLOUD-001`, `PRIV-CONSENT-001`, and `PRIV-ADMIN-001` before processing real mail content.

## 44. Recommended Remediation Order

### Priority 0 — Private content exposure / unauthorized processing

None demonstrated in active code. Preserve the provider-bound redaction guard and no-body API boundaries.

### Priority 1 — Required before pilot

1. Resolve `PRIV-RET-001` and `PRIV-DEL-001` with approved retention/deletion specifications and enforcement design.
2. Obtain a controlled-pilot decision for automatic cloud context (`PRIV-CONSENT-001`) and sender display-name minimization (`PRIV-CLOUD-001`).
3. Restrict/export-govern admin metadata under a documented operational procedure (`PRIV-ADMIN-001`).

### Priority 2 — Retention / minimization / transparency

1. Prepare a consistent, approved privacy notice covering actual data flows and gaps.
2. Define log/backup privacy operating controls.
3. Confirm Chrome storage behavior, real Caddy behavior, and provider configuration in a non-production pilot environment.

### Priority 3 — Governance / documentation

1. Remove dormant legacy raw-content helpers in an approved change.
2. Create candidate/data-governance and restricted-training workflow documentation.
3. Run separate legal/privacy review; do not claim Philippine legal compliance from technical evidence alone.

## 45. Privacy Readiness Checklist

### COLLECTION

- [x] Every actively discovered routine field has an apparent technical purpose
- [x] Routine URL collection is origin-minimized in history
- [ ] All retained metadata is minimized; sender/subject/admin export conditions remain
- [x] No routine email body is persisted

### EMAIL

- [x] Routine body not persisted
- [ ] Sender/subject retention and administrator exposure require documented justification
- [x] Explicit reports are separated from routine analysis
- [x] Active extension log invariants reject private email data

### URL

- [x] Routine stored URL is origin-only
- [x] Query/fragment handling is reviewed; only explicit reports/samples retain them
- [x] Cloud URL review uses origin/hostname only

### CLOUD

- [x] Server-side redaction is enforced
- [x] Listed sensitive patterns do not cross tested provider boundary
- [x] Provider failure does not cause SAFE fallback
- [ ] Third-party provider retention/automatic-processing condition is fully documented

### STORAGE

- [x] Sensitive report/sample data is application-layer encrypted
- [x] Passwords/tokens are not plaintext server records
- [x] Owner/device checks are present and tested
- [x] Cache data is bounded and owner/device scoped

### RETENTION

- [x] Activity/session/pairing/transient/sample retention is defined and enforced
- [ ] Report-derived candidate retention is defined and enforced
- [ ] Security-event and backup retention is defined

### DELETION

- [x] Routine retention cleanup works in synthetic test
- [x] Browser device credential/state clears on intended revoke/disconnect paths
- [ ] Account/data deletion behavior is implemented/documented
- [ ] Report/candidate deletion behavior is implemented/documented

### CONSENT / USER CONTROL

- [x] Automatic training collection is explicit and enforced
- [ ] Report-derived training lifecycle/withdrawal is explicit
- [ ] User-facing privacy information covers all material flows

### ADMIN

- [x] Encrypted email body is not exposed through admin APIs/UI/CSV
- [ ] Metadata/full-URL exports are demonstrably minimized and governed

### OPERATIONS

- [x] Source-level logs are privacy-minimized
- [x] No populated committed private artifact found in safe scan
- [x] No third-party analytics SDK found
- [ ] Backup/log-sink privacy is addressed with production evidence

## 46. Final Assessment

Data Minimization: **PASS WITH CONDITIONS**

Email Privacy: **FAIL**

URL Privacy: **PASS WITH CONDITIONS**

Cloud Privacy: **PASS WITH CONDITIONS**

Storage Privacy: **PASS WITH CONDITIONS**

Retention: **FAIL**

User Control: **FAIL**

Administrator Privacy: **PASS WITH CONDITIONS**

Overall Privacy Risk: **High**

Top 5 Privacy Issues:

1. No retention enforcement for approved encrypted training candidates.
2. No account/report/candidate deletion or withdrawal lifecycle.
3. Automatic contextual cloud review of opened email content lacks a user-level choice for a conditional layer.
4. Sender display names remain readable at the cloud-provider boundary.
5. Administrator exports expose plaintext email metadata/full URL without role-specific minimization evidence.

Most Important Recommendation: Define and enforce the full report-derived candidate lifecycle—purpose, consent/withdrawal, retention, deletion, backup propagation, and restricted access—before any controlled pilot processes real private messages.

## 47. Audit Limitations

- No real production database, account, mailbox, phishing site, network capture, provider call, Caddy process, browser storage inspection, backup, log sink, secret manager, or provider retention configuration was accessed.
- No production models were modified, retrained, retuned, replaced, or loaded for inference beyond the provided artifact verifier.
- Existing and controlled tests use synthetic/mock detector/provider paths only; they do not establish production egress or provider deletion.
- Web lint/build/test is **NOT VERIFIED**: `npm` is locally broken and fallback `pnpm` attempted an unavailable registry; no network escalation was requested. The attempt affected only ignored local `web/node_modules` state.
- Dataset privacy beyond the application’s future-candidate boundary is **NOT ASSESSABLE**, consistent with `BANTAI_DATASET_AUDIT.md`.
- No legal conclusion, including Philippine legal compliance, is made.

## 48. Regression Evidence

| Check | Result |
|---|---|
| `scripts/verify_project.py` | PASS |
| `scripts/verify_models.py` | PASS |
| `python -m unittest discover -s tests` | PASS — 158 tests, 0 failures/errors/skips |
| `python -m unittest discover -s shared_platform/tests -v` | PASS — 40 tests |
| Python `py_compile` required backend files | PASS |
| Five required extension JavaScript syntax checks | PASS |
| Web lint/build/test | NOT VERIFIED — local package-manager/runtime issue |

See `BANTAI_PRIVACY_TEST_RESULTS.csv` for individual results.

BANTAI PRIVACY AUDIT COMPLETE

Report generated: `BANTAI_PRIVACY_AUDIT.md`

Data inventory: `BANTAI_PRIVACY_DATA_INVENTORY.csv`

Storage matrix: `BANTAI_PRIVACY_STORAGE_MATRIX.csv`

Cloud matrix: `BANTAI_CLOUD_DATA_MATRIX.csv`

Privacy tests: `BANTAI_PRIVACY_TEST_RESULTS.csv`

Critical findings: 0

High findings: 2

Medium findings: 3

Low findings: 2

Informational findings: 1

Data Minimization: PASS WITH CONDITIONS

Email Privacy: FAIL

URL Privacy: PASS WITH CONDITIONS

Cloud Privacy: PASS WITH CONDITIONS

Storage Privacy: PASS WITH CONDITIONS

Retention: FAIL

User Control: FAIL

Administrator Privacy: PASS WITH CONDITIONS

Overall Privacy Recommendation: PRIVACY REMEDIATION REQUIRED

No remediation, data deletion, model modification, or production deployment has been performed.
