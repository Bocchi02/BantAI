# BantAI Security and API Audit

Audit date: 2026-09-15

## 1. Executive Summary

Overall Security Risk: CRITICAL.

Security Recommendation: SECURITY REMEDIATION REQUIRED.

The current tree has strong authentication, authorization, CSRF, proxy, schema, cloud-boundary, and private-network controls. However, the locked public-platform dependency cryptography 45.0.7 has current known critical and high advisories, the checked-out extension is an HTTP-loopback development artifact rather than a releasable HTTPS artifact, and extension diagnostics expose email metadata in browser logs. No remediation or deployment was performed.

| Severity | Count |
|---|---:|
| Critical | 1 |
| High | 1 |
| Medium | 4 |
| Low | 2 |
| Informational | 1 |

## 2. Scope

Reviewed the current working tree only: public FastAPI platform, private detector, Compose/Caddy deployment configuration, MV3 extension, web worker, dependency locks, and tests. The review used source inspection and local synthetic tests only. No production service, real account, real email, live phishing URL, real cloud provider, destructive payload, model artifact change, or rate-limit flood was used.

Prior code/dependency, dataset, ML/NLP, and functional reports were read as context, not accepted as proof. The current dependency advisory result supersedes the older clean re-audit result.

## 3. Security Architecture

| Component | Exposure | Authentication | Authorization | Sensitive Data |
|---|---|---|---|---|
| Web app / worker | Public HTTPS site | Cookie session | API-enforced user/admin role | Profile, activity metadata, reports |
| Caddy gateway | Public API edge | TLS at edge | Routes only to platform | Forwarded client address, headers |
| Public platform API | Caddy only in production | Cookie session or device bearer | Owner filters and server-side admin role | PII metadata, encrypted reports, device hashes |
| Private detector | Internal inference network; no host port | Internal shared key in remote mode | Gateway-only inference path | Raw transient inference input, frozen models |
| MySQL | Internal data network; no host port | Database credential | Application schema access | Session/device hashes, encrypted report content |
| Extension | Chromium MV3 | Revocable device bearer credential | Device-scoped platform routes | Temporary visible-email input and device token |
| Cloud LLM | Detector/provider boundary | Backend provider key only | Server-side redaction/minimization | Redacted/minimized context only |

Public trust boundaries are the web browser, extension, Caddy, and platform API. Private boundaries are platform-to-detector, platform-to-MySQL, model files, and provider credentials. The extension device credential and web session are distinct authentication boundaries. Production Compose places detector and MySQL only on internal networks; the platform and detector containers are read-only with dropped capabilities and no-new-privileges.

## 4. API Inventory

The complete route inventory is in BANTAI_API_SECURITY_MATRIX.csv. It includes the public platform, operational routes, and private-detector/companion routes. Operational routes /health, /live, and /ready are unauthenticated by design; /ready exposes readiness and model identifiers but no credential. Private detector access is an architecture-only restriction, not a substitute for route authentication.

## 5. Authentication

PASS WITH CONDITIONS. Passwords use Argon2id-style PasswordHasher defaults configured with time_cost=3, memory_cost=65536, and parallelism=2. Sessions and CSRF values are generated with secrets.token_urlsafe and only hashes are stored. Invalid credential responses are uniform in content; suspended users are rejected and suspension revokes sessions and devices. No hard-coded production credential or plaintext password storage was found.

AUTH-SEC-001 remains: the login short-circuits before Argon2 verification for an unknown email, creating a measurable timing difference from a wrong password for an existing account.

## 6. Sessions

PASS. Login issues an HttpOnly session cookie and a separate non-HttpOnly CSRF cookie, both SameSite=Lax, path=/, 24-hour max age, and Secure in production configuration. Logout revokes the stored session and clears cookies. Password changes revoke other active sessions. Suspensions revoke all user sessions and paired devices. Tokens do not appear in URL paths or API response bodies after issuance.

## 7. Device Authentication

PASS. Pairing codes are eight-character cryptographically random values, stored as hashes, expire in five minutes, become consumed atomically with creation of a 48-byte random device credential, and are invalid for suspended users. Device credentials are stored hashed server-side and in extension local storage restricted to trusted extension contexts. Device routes enforce owner/device binding and cannot reach admin APIs.

## 8. Authorization / BOLA / IDOR

PASS. Synthetic platform tests cover user-owned device revocation, detection ownership, activity explanation device scoping, feedback binding to an exact detection, report owner scoping, and cross-account context isolation. Foreign identifiers return denial/not-found behavior rather than foreign data. No BOLA/IDOR was confirmed.

## 9. Administrator Security

PASS. Admin routes depend on csrf_protected then server-side admin_user; normal users are denied. Review actions reject self-review, prevent alteration of administrator accounts through the status route, and apply CSRF to mutations. Admin email report views do not decrypt or return email bodies.

## 10. CSRF

PASS. All inspected cookie-authenticated state changes use csrf_protected. The dependency requires a matching CSRF cookie/header pair whose hash equals the session-stored CSRF hash. Device bearer endpoints appropriately do not depend on browser CSRF. Synthetic tests confirm missing CSRF is rejected for message review and platform mutation paths.

## 11. CORS

PASS. FastAPI uses an exact configured-origin list, credentials=true, explicit methods, and explicit headers. A controlled TestClient preflight accepted http://localhost:3000 with credentials and rejected https://attacker.example and null (400 with no Access-Control-Allow-Origin). Production remote-runtime validation requires an HTTPS web origin and chrome-extension origin. CORS is correctly not treated as authorization.

## 12. Rate Limiting

PASS WITH CONDITIONS. The middleware has a byte limit before routing, uses privacy-safe keyed database buckets, fails closed on limiter failure, and only honors X-Forwarded-For from configured trusted peers. Login/registration have account and network buckets; pairing consumption has an IP bucket; detections and cloud routes have credential buckets. Tests cover trusted/untrusted forwarded identity, shared bucket behavior, concurrency, expiry, and detector failure.

Creation of a pairing code and several low-cost authenticated mutation/list routes are not centrally throttled. This was not classified as a separate deployment blocker because pairing creation requires an authenticated, CSRF-protected user and replaces prior usable codes, but rate-limit coverage should be expanded during remediation.

## 13. Trusted Proxy

PASS. Caddy removes browser-supplied Forwarded, X-Real-IP, and X-Forwarded-For then sets X-Forwarded-For from remote_host. The platform parses that header only when the immediate peer belongs to BANTAI_TRUSTED_PROXY_CIDRS; untrusted/malformed forwarded values fall back to the direct peer. Production startup refuses an empty trusted-proxy configuration. Live Caddy network source CIDRs require deployment validation.

## 14. Input Validation

PASS. Security-sensitive request models use extra=forbid and bounded fields/enums. Request middleware rejects bodies above 262144 bytes before authentication; detector input models also bound URL/email fields. Timezone checks, provider enums, URL origin normalization, pagination bounds, and explicit confirmation fields are present. Existing synthetic tests cover oversized body rejection and forbidden email-body activity input.

## 15. Injection

PASS. SQL access is SQLAlchemy ORM/query construction; the sole raw text statement is static SELECT 1. User search is parameterized by SQLAlchemy. No user-controlled raw SQL, shell=True, os.system, eval, exec, dynamic template rendering, or user-controlled filesystem path was found in runtime code. Model joblib loading is a fixed deployment path with manifest/hash verification, not a user input.

## 16. XSS

PASS WITH CONDITION. Application and popup rendering use React escaping or textContent; source review found no runtime innerHTML, dangerouslySetInnerHTML, document.write, or page-message HTML sink in BantAI web/extension source. The web CSP nevertheless permits unsafe-inline scripts; see CSP-SEC-001.

## 17. SSRF

PASS. URL analysis parses supplied URLs locally and never fetches, resolves, follows, crawls, or performs TLS analysis on them. The only runtime HTTP client targets the configured detector URL or configured cloud provider. URL cloud review minimizes to an origin and instructs the provider not to browse. Loopback/private-address test strings would be parsed as data rather than fetched.

## 18. Mass Assignment

PASS. Account profile, consent, pairing, feedback, report, review, and detection schemas are explicit and forbid unknown fields. No user request model exposes role, owner, status, token hash, account ID, or verified/security fields for arbitrary assignment.

## 19. Sensitive Data Exposure

FAIL WITH REMEDIATION REQUIRED. Encryption uses AES-GCM with a required 32-byte key; email report bodies are encrypted and excluded from all user/admin report views and exports. Secrets are excluded by gitignore and static scan found no committed real credential. However, DATA-SEC-001 confirms raw sender/subject metadata and a full webmail URL are emitted to browser developer logs by Outlook/Yahoo extractors.

## 20. Cloud Review Boundary

PASS. Direct device email cloud review re-redacts and truncates server-side immediately before the provider boundary, treating client redaction labels as untrusted. Mock-provider tests verify OTP, phone, card, account, sender, and body values are minimized/redacted at the actual provider boundary. Malformed provider output, provider exception, timeout, and quota result in UNAVAILABLE rather than SAFE; local evidence/fusion remains available.

## 21. Prompt Injection Boundary

PASS. Provider prompts explicitly label all email/message/URL evidence as untrusted, prohibit instructions from it, forbid browsing, and require structured output. Strict provider-neutral schemas reject unexpected fields and malformed output. Tests use mocks only and cover hostile instruction text.

## 22. Error Handling

PASS WITH CONDITIONS. Expected errors return generic 401/403/404/409/413/422/429/503 messages without stack traces, database hosts, filesystem paths, request bodies, or provider keys. Detector gateway converts transport/provider failures to privacy-safe unavailable responses. No production 500/502/503 reverse-proxy response was exercised.

## 23. Security Headers

PASS WITH CONDITION. The web worker sets CSP, frame-ancestors none, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy, and HTTPS-only HSTS. Caddy sets HSTS, nosniff, and no-referrer. The worker's script-src includes unsafe-inline, weakening XSS defense in depth; see CSP-SEC-001. Live TLS/header validation through the production CDN/Caddy endpoint was not performed.

## 24. Browser Storage

PASS. The web app uses cookie sessions, not localStorage/sessionStorage, for web credentials. The extension stores a revocable device credential in Chrome local storage after setting local/session storage access to TRUSTED_CONTEXTS; content scripts do not receive it. Tab state excludes raw email body persistence.

## 25. Extension Security

FAIL FOR RELEASE. MV3 permissions are limited to scripting, storage, tabs, the API origin, and supported webmail hosts; there is no all_urls permission, remote script, or eval/new Function use. The current artifact intentionally targets HTTP 127.0.0.1 and permits that host in CSP/host permissions. The supplied release validator rejects it, so it must not be packaged or deployed; see CONFIG-SEC-001.

## 26. Extension Messaging

PASS. There is no externally_connectable entry or window.postMessage bridge. Runtime messages are confined to extension contexts/content scripts; sensitive credential operations remain in the service worker. Yahoo sender-authentication messages additionally validate provider tab, opener, visible payload fingerprint, sender, and subject before re-analysis. No hostile-page-to-privileged-operation path was identified statically.

## 27. Secrets

PASS. Cloud API keys and internal detector keys are environment-only; extension and web static checks found no API key. Gitignore excludes .env, key/certificate patterns, model binaries, logs, HARs, and private captures. Static secret scans found only sanitized placeholders and an explicit local-only Compose service key. Production requires values through Compose substitutions.

## 28. Private Detector Exposure

PASS STATICALLY. Production Compose exposes detector port 8000 only to Compose networks, does not publish it, and marks inference/data networks internal. Remote detector inference endpoints require X-BantAI-Internal-Key. The detector's health/live and legacy companion routes are unkeyed but not host-published; direct external reachability must be verified in the deployed network/firewall.

## 29. Database Privileges

FAIL WITH CONDITION. Compose creates one bantai MySQL user and the platform uses that same credential while its container command runs alembic upgrade head on every start. The standard MySQL image grants the configured application user broad privileges on MYSQL_DATABASE, so runtime DML and migration DDL are not separated. See DB-SEC-001. Actual production grants were not available for live validation.

## 30. Business Logic Abuse

PASS WITH CONDITIONS. Pairing codes are single-use/expiring; feedback requires explicit confirmation and matching owner detection; report duplicates are constrained; administrators cannot self-review or alter protected admin accounts through the standard status route. Repeat pairing-code creation is authenticated but not throttled, as noted in Section 12.

## 31. Replay / Idempotency

PASS. Detection events use unique device/client-event IDs and durable content fingerprints; retries with changed input are rejected, concurrent insertion races are reconciled, and stored event bindings survive transient context expiry. Feedback reports have uniqueness constraints. Repeating a detection is intentionally allowed only with matching input.

## 32. Security Logging

FAIL WITH CONDITION. LOG-SEC-001: the services deliberately avoid raw access logging and raw-email logging, but no privacy-safe structured audit event stream was found for failed/successful login, rate-limit enforcement, pairing/revocation, admin changes, cloud failures, model integrity failure, or oversized requests. This limits incident investigation without compensating operational telemetry.

## 33. Production Security Configuration

FAIL. Production Compose requires HTTPS web/API origins, cookie Secure=true, remote-runtime validation, disabled public registration, non-empty trusted proxy CIDR, read-only/capability-reduced containers, and private detector/database networks. Current files still include a development extension artifact. Release validation and an actual production environment/configuration check are required before promotion.

## 34. Dependency Re-Check

FAIL. On 2026-09-15, npm audit --omit=dev --audit-level=high found 0 web vulnerabilities. pip-audit found 13 advisory records (7 unique identifiers) for shared_platform cryptography==45.0.7, including PYSEC-2026-36 / CVE-2026-39892 (critical; fixed in 46.0.7), plus current high/medium issues; the declared constraint cryptography>=43.0,<46.0 prevents an available fix. Detector dependencies contain idna==3.13 affected by PYSEC-2026-215 / CVE-2026-45409 (medium DoS; fixed in 3.15). See DEP-SEC-001 and DEP-SEC-002.

## 35. Model Invocation Security

PASS. Detector model paths come from server environment, deployment runs offline, and no runtime model download/user path is available. Email manifest/calibration and URL joblib hash/schema checks passed. Model load/inference failure maps to unavailable errors rather than a safe outcome. Joblib remains a trusted-deployment-artifact boundary and model source directories must remain write-protected.

## 36. OWASP Top 10 Mapping

| Finding | OWASP Top 10 |
|---|---|
| DEP-SEC-001, DEP-SEC-002 | A06 Vulnerable and Outdated Components |
| CONFIG-SEC-001, CSP-SEC-001, DB-SEC-001 | A05 Security Misconfiguration |
| DATA-SEC-001 | A02 Cryptographic Failures; A09 Security Logging and Monitoring Failures |
| AUTH-SEC-001 | A07 Identification and Authentication Failures |
| LOG-SEC-001 | A09 Security Logging and Monitoring Failures |

No confirmed findings map to A01 Broken Access Control, A03 Injection, A04 Insecure Design, A08 Software and Data Integrity Failures, or A10 SSRF.

## 37. OWASP API Mapping

| Finding | OWASP API Security Top 10 |
|---|---|
| DEP-SEC-001, DEP-SEC-002 | API8 Security Misconfiguration |
| CONFIG-SEC-001, CSP-SEC-001, DB-SEC-001 | API8 Security Misconfiguration |
| DATA-SEC-001 | API3 Broken Object Property Level Authorization / sensitive-data exposure boundary |
| AUTH-SEC-001 | API2 Broken Authentication |
| LOG-SEC-001 | API10 Unsafe Consumption of APIs / operational detection gap |

No BOLA, Broken Function Level Authorization, SSRF, or unrestricted sensitive business-flow bypass was confirmed. Rate-limiting has bounded coverage and requires expansion for pairing creation and other authenticated low-cost routes.

## 38. Findings Summary

| ID | Severity | Component | Finding | OWASP | Confidence |
|---|---|---|---|---|---|
| DEP-SEC-001 | CRITICAL | Public platform dependencies | cryptography 45.0.7 has current critical/high advisories and lock constraint blocks a fix | A06/API8 | High |
| CONFIG-SEC-001 | HIGH | Extension release | Current checked-out artifact sends credential/data to HTTP loopback if packaged | A05/API8 | High |
| DATA-SEC-001 | MEDIUM | Outlook/Yahoo extractors | Browser console logs raw sender/subject metadata and full webmail URL | A02,A09/API3 | High |
| DEP-SEC-002 | MEDIUM | Detector dependencies | idna 3.13 has a resource-exhaustion advisory | A06/API8 | High |
| DB-SEC-001 | MEDIUM | Platform/MySQL deployment | Runtime and migration database privileges are not separated | A05/API8 | High |
| LOG-SEC-001 | MEDIUM | Platform operations | No privacy-safe security audit event coverage | A09 | Medium |
| AUTH-SEC-001 | LOW | Login | Unknown-account short circuit permits timing-based account enumeration | A07/API2 | High |
| CSP-SEC-001 | LOW | Web worker | CSP permits unsafe-inline scripts | A05/API8 | High |
| API-SEC-001 | INFORMATIONAL | Operational routes | Public readiness endpoints disclose non-secret operational/model metadata | A05/API8 | High |

## 39. Detailed Findings

### [DEP-SEC-001] Current critical/high cryptography advisories in production platform lock

Severity: CRITICAL  
Confidence: High  
OWASP Category: A06 Vulnerable and Outdated Components; API8 Security Misconfiguration  
Affected Component: shared-platform runtime image  
Affected Endpoint(s): All public platform endpoints process in the affected runtime  
Affected File(s): shared_platform/requirements.txt:7; shared_platform/requirements.lock:363  
Expected Security Behavior: Production locks contain no unresolved critical/high advisory.  
Observed Behavior: cryptography==45.0.7 is locked under a <46.0 constraint. pip-audit returned 7 unique current advisory IDs, including critical PYSEC-2026-36/CVE-2026-39892 fixed in 46.0.7; it also reports later high/medium advisories.  
Evidence: Read-only pip-audit on the lock returned 13 records; current OSV describes the critical non-contiguous-buffer overflow for 45.0.0 through 46.0.6. Application source did not reveal an externally supplied non-contiguous Python buffer path, but the runtime is demonstrably affected.  
Attack Preconditions: A reachable code path into a vulnerable cryptography API; reachability of the critical buffer API was not established.  
Potential Impact: Native memory-safety failure or other advisory-specific confidentiality/integrity/availability impact.  
Reproduction: Read-only dependency advisory check only; no exploit was attempted.  
Recommended Remediation: Update the declared compatible range and regenerate hash-pinned lock to a current safe cryptography version, then rerun complete regression/model checks and review API compatibility.  
Deployment Blocking: Yes.

### [CONFIG-SEC-001] Development extension artifact is not safe to package as a release

Severity: HIGH  
Confidence: High  
OWASP Category: A05 Security Misconfiguration; API8 Security Misconfiguration  
Affected Component: MV3 extension  
Affected Endpoint(s): All device-authenticated extension API calls  
Affected File(s): extension/config.js:3-5; extension/manifest.json:13,29  
Expected Security Behavior: Release artifact uses one non-loopback HTTPS API origin with loopback disabled.  
Observed Behavior: The checked-out artifact sets development mode, apiBase http://127.0.0.1:8080/api/v1, allowHttpLoopback true, matching HTTP host permission/CSP. verify_extension_release.py fails with the expected release-mode error.  
Evidence: Static configuration and release-validator execution. Unit tests prove a synthetically generated release artifact can pass, but no such artifact is checked out.  
Attack Preconditions: A developer artifact is incorrectly packaged/distributed; a local process can bind/intercept loopback traffic.  
Potential Impact: Disclosure/replay of device bearer credential and sensitive detection input to a local HTTP listener; unsafe production service configuration.  
Reproduction: Run the supplied release validator against current extension files; it fails.  
Recommended Remediation: Generate a release artifact with the deployment HTTPS API origin, exact host permission/CSP, allowHttpLoopback false, and make the release validator a blocking packaging step.  
Deployment Blocking: Yes.

### [DATA-SEC-001] Extractor diagnostics log sensitive email metadata and webmail URL

Severity: MEDIUM  
Confidence: High  
OWASP Category: A02 Cryptographic Failures; A09 Security Logging and Monitoring Failures  
Affected Component: Outlook/Yahoo extension content scripts  
Affected Endpoint(s): Local email extraction  
Affected File(s): extension/content/outlook-extractor.js:1931-1950,2128-2136; extension/content/yahoo-extractor.js:5065-5074,5127-5143,5317-5325  
Expected Security Behavior: Do not log raw sender identity, subject, or browsing paths.  
Observed Behavior: console.info records Outlook/Yahoo subject and sender. Yahoo logs subject after retry and logs location.href when the extractor loads.  
Evidence: Direct source review. The existing raw-email-body logging invariant passes but does not prohibit these metadata values.  
Attack Preconditions: Browser developer tools, remote debugging/diagnostic collection, or another local log collector is accessible.  
Potential Impact: Email metadata and webmail navigation details persist outside the designed encrypted/transient data boundary.  
Reproduction: Open a synthetic supported-provider email with the extension and inspect the content-script console; no real email was used in this audit.  
Recommended Remediation: Remove these logs or replace them with a fixed event code and non-sensitive counts; add an invariant that rejects console arguments derived from sender, subject, body, page_url, or location.href.  
Deployment Blocking: No, but remediate before handling pilot email data.

### [DEP-SEC-002] Detector lock contains vulnerable idna 3.13

Severity: MEDIUM  
Confidence: High  
OWASP Category: A06 Vulnerable and Outdated Components; API8 Security Misconfiguration  
Affected Component: Private detector image  
Affected Endpoint(s): URL-processing code paths that invoke IDNA handling  
Affected File(s): backend/requirements-detector.txt:6; backend/requirements-detector.lock:487  
Expected Security Behavior: Resolved detector dependencies have no known relevant advisory.  
Observed Behavior: idna==3.13 is locked; pip-audit reports PYSEC-2026-215/CVE-2026-45409, fixed in 3.15, for resource exhaustion on crafted oversized IDNA input.  
Evidence: Read-only pip-audit. Detector routes have max URL/body fields and private-key authentication, reducing exposure but not removing the vulnerable resolved component.  
Attack Preconditions: Authenticated device/gateway submits a crafted Unicode hostname that reaches idna.  
Potential Impact: Resource exhaustion in detector URL processing.  
Reproduction: Not attempted; no DoS payload was sent.  
Recommended Remediation: Update idna to at least 3.15, regenerate the detector lock, and add a bounded hostile-IDNA performance test that does not create high-volume load.  
Deployment Blocking: No by itself; included in required dependency remediation.

### [DB-SEC-001] Runtime database credential also performs migrations

Severity: MEDIUM  
Confidence: High  
OWASP Category: A05 Security Misconfiguration; API8 Security Misconfiguration  
Affected Component: Platform/MySQL deployment  
Affected Endpoint(s): All database-backed platform routes  
Affected File(s): docker-compose.yml:24-27,97; shared_platform/Dockerfile:13  
Expected Security Behavior: Runtime uses least-privilege DML credentials; migration runs use a separate short-lived DDL credential/job.  
Observed Behavior: The single bantai user/database credential is used by the platform, whose startup command runs alembic upgrade head.  
Evidence: Static production Compose/Dockerfile review. Exact live grants were not accessible.  
Attack Preconditions: Runtime compromise, SQL injection, or application defect that reaches the database credential.  
Potential Impact: Larger schema/data blast radius than an application runtime requires.  
Reproduction: Static only; live production privileges were not tested.  
Recommended Remediation: Run migration as an explicit deployment job with constrained DDL credentials; grant the long-running API only required DML permissions; validate grants against production.  
Deployment Blocking: No under the stated rule, but required hardening before broad deployment.

### [LOG-SEC-001] Privacy-safe security event logging is absent

Severity: MEDIUM  
Confidence: Medium  
OWASP Category: A09 Security Logging and Monitoring Failures  
Affected Component: Platform/detector operations  
Affected Endpoint(s): Authentication, pairing, admin, rate-limit, cloud, and model-failure flows  
Affected File(s): shared_platform/app/main.py; shared_platform/Dockerfile:13; deploy/Caddyfile  
Expected Security Behavior: Privacy-safe, non-content event records support detection and incident investigation.  
Observed Behavior: Application code exposes no structured audit events for listed security actions, and Uvicorn starts with no-access-log.  
Evidence: Static logging search and deployment command review.  
Attack Preconditions: Security incident requiring attribution or timeline reconstruction.  
Potential Impact: Reduced detection, response, and forensic capability.  
Reproduction: Static review only.  
Recommended Remediation: Emit minimal structured event codes/timestamps/outcome and keyed opaque principal identifiers to protected retention; never log raw email, URL paths, tokens, or cloud payloads.  
Deployment Blocking: No.

### [AUTH-SEC-001] Login timing distinguishes an unknown email from a wrong password

Severity: LOW  
Confidence: High  
OWASP Category: A07 Identification and Authentication Failures; API2 Broken Authentication  
Affected Component: Public platform login  
Affected Endpoint(s): POST /api/v1/auth/login  
Affected File(s): shared_platform/app/main.py:387  
Expected Security Behavior: Invalid login timing has no user-existence-dependent fast path.  
Observed Behavior: Python short-circuits if user is None, skipping Argon2 verification; an existing account with wrong password runs the expensive verify call.  
Evidence: Direct source review. Response messages are otherwise uniform.  
Attack Preconditions: Network attacker able to make repeated low-noise timing measurements despite rate limiting and jitter.  
Potential Impact: Probabilistic account enumeration.  
Reproduction: No timing campaign run.  
Recommended Remediation: Verify against a fixed dummy Argon2 hash when the account is absent, then return the uniform failure.  
Deployment Blocking: No.

### [CSP-SEC-001] Web CSP permits inline script execution

Severity: LOW  
Confidence: High  
OWASP Category: A05 Security Misconfiguration; API8 Security Misconfiguration  
Affected Component: Web worker  
Affected Endpoint(s): Web application responses  
Affected File(s): web/worker/index.js:14  
Expected Security Behavior: Production CSP authorizes only required script sources, hashes, or nonces.  
Observed Behavior: script-src includes unsafe-inline.  
Evidence: Static worker policy review; no dangerous HTML sink was found.  
Attack Preconditions: A separate markup injection/XSS primitive.  
Potential Impact: Reduced CSP mitigation if an injection vulnerability is introduced.  
Reproduction: Static only.  
Recommended Remediation: Replace inline bootstrap requirements with hashes/nonces or external self-hosted scripts and verify the production build.  
Deployment Blocking: No.

### [API-SEC-001] Operational endpoints are publicly reachable by design

Severity: INFORMATIONAL  
Confidence: High  
OWASP Category: A05 Security Misconfiguration; API8 Security Misconfiguration  
Affected Component: Public platform operational endpoints  
Affected Endpoint(s): GET /health, GET /live, GET /ready  
Affected File(s): shared_platform/app/main.py:299-328  
Expected Security Behavior: Operational probes expose only intended non-secret state.  
Observed Behavior: Endpoints disclose service/version and readiness/model/cloud availability, without keys or database details.  
Evidence: Source and synthetic health test.  
Attack Preconditions: Public network access.  
Potential Impact: Low-value reconnaissance.  
Reproduction: Local synthetic health request only.  
Recommended Remediation: Document intended public probes; optionally restrict detailed readiness to the gateway/orchestrator if operational requirements permit.  
Deployment Blocking: No.

## 40. Deployment Blockers

1. DEP-SEC-001: upgrade/remediate locked cryptography 45.0.7 and rerun dependency plus full regression checks.
2. CONFIG-SEC-001: create and validate an actual HTTPS release extension artifact; do not package the current development artifact.

## 41. Positive Security Controls

- Argon2 password hashing, random hashed sessions/device credentials, secure production cookies, CSRF double-submit plus server hash, and suspension revocation.
- Owner-filtered activity/device/report queries; server-side admin dependency; admin mutation CSRF; protected-admin checks.
- Strict request schemas, request byte ceilings, explicit feedback confirmation, durable retry fingerprints, and idempotent detection handling.
- Central database-backed rate limiting that fails closed; trusted-proxy filtering; Caddy forwarded-header replacement.
- AES-GCM encrypted sensitive report content; no body decryption in administrator reports/exports; cloud redaction at provider boundary.
- Prompt-injection instructions and strict validated provider output; unavailable-on-cloud failure; deterministic final fusion.
- Static URL analysis only with no browsing/redirect/TLS fetch; fixed internal detector gateway URL and timeouts.
- Private detector/database Compose networks, no detector host port, read-only/capability-reduced containers, artifact/hash/offline model validation.
- Narrow MV3 permissions, no remote JavaScript/eval, trusted-context extension storage, no externally connectable surface.

## 42. Security Readiness Checklist

### AUTH

- [x] No authentication bypass found
- [x] Password storage secure
- [x] Logout invalidates session
- [x] Suspended users rejected
- [x] Device tokens revocable

### ACCESS CONTROL

- [x] Cross-user activity denied
- [x] Cross-user devices denied
- [x] Cross-user reports denied
- [x] Admin routes deny normal users
- [x] Device token cannot elevate privilege

### WEB

- [x] CSRF enforced
- [x] CORS restricted
- [x] XSS sinks reviewed
- [ ] CSP has no unsafe-inline script allowance
- [x] Production cookie configuration is secure

### API

- [x] Input schemas strict
- [x] Request-size limits
- [x] Core rate limiting functional
- [x] Proxy identity trusted safely
- [x] No BOLA found
- [x] No mass assignment found
- [x] Errors reviewed for internal leakage

### CLOUD

- [x] Redaction at provider boundary
- [x] Invalid cloud output rejected
- [x] Provider failure is unavailable, not safe
- [x] Prompt injection treated as data

### EXTENSION

- [x] Manifest permissions minimized
- [x] No remote JavaScript
- [x] Message passing constrained
- [x] Device credential protected from content scripts
- [ ] Release HTTPS artifact generated and verified

### INFRASTRUCTURE

- [x] Detector/database statically private in production Compose
- [x] No committed real secrets found
- [x] Remote-mode production checks require safe configuration
- [ ] Dependencies clear of critical/high advisories
- [ ] Runtime and migration DB privileges separated
- [ ] Privacy-safe security audit events available

## 43. Final Assessment

Authentication: PASS WITH CONDITIONS.  
Authorization: PASS.  
API Security: FAIL.  
Extension Security: FAIL.  
Cloud Boundary: PASS.  
Production Configuration: FAIL WITH REMEDIATION REQUIRED.  
Overall Security Risk: CRITICAL.

Top 5 Security Issues:

1. Current critical/high cryptography dependency advisories.
2. Development HTTP-loopback extension artifact cannot be packaged as release.
3. Sensitive Outlook/Yahoo email metadata and full URL diagnostics in browser logs.
4. Runtime/migration database privileges are not separated.
5. Absence of privacy-safe security event logging.

Most Important Recommendation: First refresh the platform cryptography constraint/lock to a current safe compatible release and rerun every regression check; do not deploy until that and an actual validated HTTPS extension release artifact are complete.

## 44. Audit Limitations

VERIFIED: local project/model verification; 147 core tests; 39 synthetic platform API tests; web build/tests/lint; extension syntax; CORS preflights; dependency advisory lookup; static source/configuration inventory.

STATICALLY REVIEWED: authorization paths, CSRF/CORS/proxy logic, extension message handling/storage, injection/SSRF/file surfaces, secrets, Compose/Caddy, model boundaries, logging, and database privilege design.

SYNTHETICALLY TESTED: sessions, suspension, device lifecycle, owner scopes, admin denial, CSRF, input limits, rate/proxy behavior, redaction at fake provider boundary, malformed provider output, prompt injection, retry/idempotency, and CORS origins.

NOT TESTED: production firewall/network reachability, live TLS certificate and CDN headers, actual Caddy proxy source CIDR, live database grants, browser/provider DOM behavior in Chrome/Edge, multi-worker MySQL limiter under deployed topology, real LLM provider security, and production account/email data.

MANUAL VALIDATION REQUIRED: deploy only a generated HTTPS extension release artifact; validate production environment substitutions and MySQL role grants; confirm detector/database remain non-public; validate TLS and final headers externally; establish privacy-safe audit event retention.

BANTAI SECURITY & API AUDIT COMPLETE

Report generated: BANTAI_SECURITY_API_AUDIT.md

API matrix: BANTAI_API_SECURITY_MATRIX.csv

Security tests: BANTAI_SECURITY_TEST_RESULTS.csv

Critical findings: 1

High findings: 1

Medium findings: 4

Low findings: 2

Informational findings: 1

Authentication: PASS WITH CONDITIONS

Authorization: PASS

API Security: FAIL

Extension Security: FAIL

Cloud Boundary: PASS

Overall Security Recommendation: SECURITY REMEDIATION REQUIRED

No remediation or production deployment has been performed.
