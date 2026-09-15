# BantAI Functional Audit

Audit date: 2026-09-15

Audit target: current working tree at `D:\COOOODE\Capstone\BantAI`.

Audit posture: functional audit only. No product source, model weight, dataset,
threshold, fusion rule, or deployment state was changed. No real credentials,
private email, external LLM request, live phishing site, or production system
was used.

## 1. Executive Summary

Overall Functional Readiness: **FUNCTIONAL REMEDIATION REQUIRED**

Deployment Recommendation: **Do not proceed to controlled deployment from the
current checkout. Resolve the two high-severity release blockers and the
closed-pilot onboarding mismatch, then repeat the release and integration
acceptance checks.**

The application code and synthetic automated coverage are substantially
functional. The frozen URL/NLP contracts, indicator engine, deterministic
fusion, cloud-failure handling, ownership checks, pairing behavior, rate
limiting, privacy controls, and web build all have passing evidence. The audit
does not assess model accuracy.

The current release state is not ready because:

1. `docker compose --env-file .env.example config` fails before startup:
   `docker-compose.yml` requires `BANTAI_TRUSTED_PROXY_CIDRS`, but the root
   `.env.example` does not define it.
2. The checked-out extension is explicitly a development artifact using
   `http://127.0.0.1:8080/api/v1`; `scripts/verify_extension_release.py`
   correctly rejects it as a release artifact.
3. Production disables public registration, but the landing/login/help UI still
   invites users to create an account and renders a registration form.

Finding counts:

- Critical: 0
- High: 2
- Medium: 2
- Low: 0
- Informational: 1

Top functional risks:

- Production configuration cannot be rendered from the supplied root template.
- No validated HTTPS release extension artifact is present.
- Closed-pilot onboarding advertises an unavailable registration path.
- Full Alembic application was not run against a disposable MySQL instance;
  offline SQL generation stops at migration 0011 because it introspects an
  offline bind.
- Interactive Chrome/Edge extension and live Gmail/Outlook/Yahoo DOM flows were
  not performed.

## 2. Scope

Reviewed the active repository, current source and manifests, architecture and
deployment documentation, prior dependency/dataset/ML audits, API route
inventory, tests, model verification scripts, extension invariants, web build,
local web rendering, and migration graph.

Excluded by instruction: redesign, broad refactoring, model accuracy claims,
threshold changes, retraining, dataset changes, production deployment, real
user credentials, real private messages, live phishing sites, and real LLM
requests.

The repository was already dirty with many tracked and untracked changes before
the audit. Those changes were preserved and treated as the audit target.

## 3. Architecture

Actual production flow:

```text
Chrome/Edge MV3 extension
  ├─ exact tab.url or visible opened Gmail/Outlook/Yahoo message
  └─ HTTPS + revocable device credential
        ↓
Caddy HTTPS gateway :443
        ↓
Public Platform API
  ├─ session/device authentication, CSRF, ownership, rate limit
  ├─ transient context and encrypted activity/report metadata
  ├─ private detector gateway
  └─ backend-only cloud adapter
        ↓                         ↓
Private Detector                 MySQL
  ├─ RF Grouped URL model        ├─ users/sessions/devices
  ├─ calibrated XLM-R            ├─ activities/reports
  ├─ indicator engine            ├─ feedback/training metadata
  ├─ deterministic fusion        └─ rate-limit buckets
  └─ Gemini coordination
```

Web flow:

```text
Hosted web application
  → same-origin /api/v1 worker proxy
  → public Platform API
  → cookie session + CSRF
  → MySQL and private detector where needed
```

Development/rollback-only flow:

```text
Legacy Companion tooling → private detector endpoints
```

The Companion is documented as optional for end users. The remote production
path does not require local Python, Docker, model files, or the Companion.

Major path contracts:

| Path | Input | Process/dependency | Result/output |
|---|---|---|---|
| URL detection | Exact HTTP/HTTPS `tab.url` | Device auth → platform → RF model → URL cloud review only after RF warning → URL fusion | Three primary outcome labels to extension |
| Email detection | Visible sender/subject/body from supported provider | Device auth → platform → XLM-R + indicators + mandatory cloud review → deterministic fusion | Email outcome independent from website outcome |
| Pairing | Authenticated web session plus five-minute one-time code | Hash lookup, expiry/consumption, device credential creation | Revocable bearer credential returned once |
| Activity | Completed detection metadata | Idempotent owner/device event insert | Origin/provider/sender/subject metadata; no routine body |
| Explanation | Authenticated activity/detection reference | Memory-only transient context or metadata fallback → cloud adapter | Explanation with explicit context availability |
| Feedback | Explicit verdict tied to detection | Owner/device matching, confirmation, encrypted report storage | Pending admin review metadata |
| Admin | Web session with ADMIN role | Backend `admin_user` dependency | Aggregate views, review queues, user status actions |

## 4. Functional Inventory

| ID | Module | Function | Expected Behavior | Current Evidence |
|---|---|---|---|---|
| AUTH-F01 | Auth | Controlled pilot registration | Registration disabled by deployment configuration | API test passes; UI mismatch is AUTH-F001 |
| AUTH-F02 | Auth | Login/logout | Valid login creates cookie/CSRF session; logout revokes it | 38 platform tests pass |
| AUTH-F03 | Auth | Session protection | Missing, expired, revoked, suspended sessions denied | Dependency implementation and tests pass |
| PAIR-F01 | Pairing | Create/consume code | Five-minute, single-use, user-owned pairing | Platform tests pass |
| PAIR-F02 | Pairing | Device lifecycle | Token stored by extension, revocation/suspension enforced | Platform/companion tests pass |
| URL-F01 | URL | Address-bar detection | Exact current URL only; no DOM/link crawling | Invariant tests pass |
| URL-F02 | URL | RF inference | Frozen 52-feature model and threshold 0.547 | Model tests and verifier pass |
| URL-F03 | URL | Cloud/fusion | Cloud review only after local warning; failure preserved | URL fusion tests pass |
| EMAIL-F01 | Email | Provider extraction | Gmail, Outlook, Yahoo opened visible message only | Sanitized parser tests pass |
| EMAIL-F02 | Email | Extraction states | Empty/no-open/unsupported/failed extraction is not SAFE | State/display tests pass |
| NLP-F01 | NLP | XLM-R inference | Frozen model, calibration, preprocessing, and threshold honored | Model tests and verifier pass |
| IND-F01 | Indicators | Explainable markers | Implemented markers produce evidence/counts/context | Indicator tests pass |
| FUSION-F01 | Fusion | Email deterministic fusion | Two independent suspicious sources required for highest-risk outcome | Fusion tests pass |
| CLOUD-F01 | Cloud | Redacted contextual review | Mockable, strict schema, unavailable on malformed/failure | Cloud/redaction/cache tests pass |
| EXT-F01 | Extension | MV3 orchestration | Pairing, URL/email requests, stale-state protection, popup | Syntax/invariant tests pass; live artifact blocker EXT-F001 |
| WEB-F01 | Web | Public/authenticated dashboard | Routes render and call matching API contracts | Build, lint, rendered tests, local smoke pass |
| ACT-F01 | Activity | History | Owner-scoped metadata, timestamps, outcome, retention | Platform tests pass |
| FB-F01 | Feedback | Reports | Explicit, confirmation-bound, owner-scoped persistence | Platform tests pass |
| ADMIN-F01 | Admin | Review/users/metrics | Admin allowed, normal user denied | Platform tests pass |
| DB-F01 | Database | Persistence/migrations | Latest schema and constraints available | One head confirmed; live MySQL not tested |
| API-F01 | API | Cross-component contracts | Exact paths/fields/enums and safe failures | Route inventory and tests pass |

## 5. Startup

Status: **PARTIAL**

Passing evidence:

- `scripts/verify_project.py`: PASS.
- `scripts/verify_models.py`: PASS.
- Python and JavaScript syntax checks: PASS.
- Detector readiness endpoint checks loaded model presence and internal access.
- Platform readiness checks database connectivity and detector gateway
  readiness; dependency errors map to 503.
- Alembic has one head: `0014_centralized_rate_limits`.
- Web production build completes.

Blocking startup/configuration evidence:

- Production Compose config fails with the supplied root environment template
  because `BANTAI_TRUSTED_PROXY_CIDRS` is a required interpolation in
  `docker-compose.yml:117` but is absent from `.env.example`.
- A live detector/platform/MySQL stack was not started; no fake production
  secret was supplied to bypass the failure.
- Full clean-to-latest MySQL migration was not testable because no disposable
  MySQL instance was available.

Expected failure behavior is generally explicit: remote runtime validation
requires internal key, HTTPS web origin, released extension origin, trusted
proxy configuration, and closed registration.

## 6. Authentication

Status: **PASS WITH CONDITIONS**

The API implements password verification, case-normalized email lookup, secure
session token hashing, CSRF cookie/header matching, suspension rejection, and
logout revocation. Public registration and email availability correctly return
403 when the controlled-pilot flag is false.

Condition: the web UI contradicts the controlled-pilot API/configuration. See
AUTH-F001.

## 7. Session Management

Status: **PASS WITH CONDITIONS**

Backend tests cover login, session cookies, CSRF, logout, password-change
revocation of other sessions, suspension, and protected routes. Frontend
session loading treats 401 as signed out and other failures as service errors.

Interactive deployed-session refresh, cookie persistence, and account
suspension through a live browser were not performed.

## 8. Device / Extension Pairing

Status: **PASS WITH CONDITIONS**

The implementation uses five-minute one-time codes, hashed stored device
credentials, trusted-context Chrome storage, device ownership, revocation, and
account-status checks. Automated tests cover pairing, retry/idempotency,
revocation, suspension, worker restart identity, and companion credential
behavior.

Live extension install/pair/restart/revoke behavior was not tested because the
checked-out extension is not a release artifact and no live test API was used.

## 9. URL Detection

Status: **PASS WITH CONDITIONS**

The URL path uses the exact address-bar URL, restricts analysis to HTTP/HTTPS,
does not scan page DOM or email links, forwards through authenticated device
API, invokes the frozen RF model, applies threshold `0.547`, and retains shadow
mode/non-blocking behavior. Synthetic model and fusion tests pass.

The final URL result includes model and cloud evidence without an overall
numeric risk score. Live browser navigation was not exercised.

## 10. URL States and Navigation

Observed terminology:

- Final: `NO_STRONG_WARNING_SIGNS`, `NEEDS_CAUTION`,
  `SUSPICIOUS_SIGNS_FOUND`.
- Operational: `ANALYZING`, `CHECKING`, `WAITING`, `UNAVAILABLE`, `ERROR`.
- Technical detector signal: `SAFE`, `SUSPICIOUS`.
- Unsupported/non-web address-bar pages become unavailable/non-analyzable, not
  SAFE.

Popup wording preserves the required non-guarantee meaning: no strong warning
sign detected is not a guarantee of legitimacy.

Sequence, current-tab URL, fingerprint, and popup deduplication guards are
present and statically tested. Rapid live navigation, redirect completion, and
service-worker restart in a real Chromium profile remain NOT TESTABLE.

Warning behavior: **NOT IMPLEMENTED as an interstitial/blocking warning.** The
current product provides extension popup/badge guidance while URL enforcement
remains shadow/non-blocking. Continue/back actions are therefore NOT
APPLICABLE to the current implementation.

## 11. Email Extraction

Status: **PASS WITH CONDITIONS**

Gmail, Outlook, and Yahoo provider-specific content scripts are present. The
worker restricts provider scope, uses visible opened-message content, keeps
sender authentication observations separate, and does not score embedded links.
Sanitized parser and spoofing-guard tests pass.

Provider DOM selectors are inherently live dependencies. No live Gmail,
Outlook, or Yahoo account/session was used, so current-provider DOM acceptance
is NOT TESTABLE.

## 12. NLP Detection

Status: **PASS WITH CONDITIONS**

The frozen XLM-R runtime contract is present and tested:

- Model: `full_taglish_xlmr_512_headtail_seed13`.
- Temperature: `2.2198894341340183`.
- Calibrated threshold: `0.6923658179915227`.
- Maximum sequence length: `512`.
- `subject_head_tail` preprocessing with subject budget 96, subject tail 0.25,
  body tail 0.35, body cleaning disabled.

Model load, manifest integrity, deterministic output, truncation, boundary
threshold, and label mapping tests pass. This is implementation-contract
evidence only; it is not an accuracy or generalization claim.

## 13. Scam Indicator Engine

Status: **PASS**

Synthetic tests cover implemented OTP, financial/payment, urgency, protective
language, incoming-transfer wording, and Taglish-style cases. Evidence and
context handling pass. Language style alone is not treated as suspicious.

## 14. Email Fusion

Status: **PASS**

Deterministic fusion tests cover clean inputs, local disagreement, XLM-R plus
marker, XLM-R plus cloud, marker plus cloud, cloud-only suspicious, unavailable
cloud, protective/incoming-transfer context, and safe webmail independence.

LLM-only evidence does not create the highest-risk email outcome. Website
results do not lower email warnings.

## 15. URL Fusion

Status: **PASS WITH CONDITIONS**

URL fusion preserves the local RF signal, invokes cloud review only after a
local warning, can retain a warning when cloud is unavailable, and can produce
green only through the documented validated clean-review path. There is no URL
interstitial or blocking enforcement in the current shadow-mode design.

## 16. Cloud Review

Status: **PASS WITH CONDITIONS**

The fake/mock provider path covers valid results, strict-schema rejection,
unexpected fields, provider exceptions, timeout/unavailable behavior, cache
hits/expiry, and redaction. Backend-only credentials are not in extension
source. No real LLM request was made.

The production provider key and external availability were not validated.

## 17. Extension Popup

Status: **PASS WITH CONDITIONS**

Static popup code keeps website and email sections independent, distinguishes
checking/unavailable/final results, presents sender/subject and indicator
evidence, requires explicit feedback confirmation, and uses five-second
automatic popup rules with deduplication. Popup tests pass.

No live MV3 popup was loaded at the intended dimensions. Long-hostname,
long-explanation, mobile popup, and real detector-unavailable visual behavior
are NOT TESTABLE.

## 18. Warning / Continue / Back Behavior

Status: **NOT APPLICABLE / NOT IMPLEMENTED**

The repository implements popup/badge guidance, not a browser interstitial with
continue/back choices. The URL model is explicitly shadow/non-blocking. No
missing continue/back implementation is counted as a defect because it is not
part of the active product contract.

## 19. Web Application

Status: **PASS WITH CONDITIONS**

Actual client routes:

| Route | Role | Expected | Result |
|---|---|---|---|
| `/` | Guest | Landing page | PASS: local browser smoke and rendered test |
| `/login` | Guest | Login form | PASS: local browser smoke |
| `/register` | Guest/config-dependent | Registration when enabled | PARTIAL: API disabled in pilot but UI still invites/renders |
| `/dashboard` | User/Admin | Dashboard | PASS by route/component/build evidence; live session not tested |
| `/activity` | User/Admin | Activity/history | PASS by component/API route evidence |
| `/message-review` | User/Admin | Explicit pasted-message review | PASS by component/API route evidence |
| `/reports` | User/Admin | URL reports | PASS by component/API route evidence |
| `/email-reports` | User/Admin | Email reports | PASS by component/API route evidence |
| `/devices` | User/Admin | Pair/revoke devices | PASS by component/API route evidence |
| `/profile` | User/Admin | Profile/password/consent | PASS by component/API route evidence |
| `/help` | User/Admin | Help/setup | PASS by component/API route evidence |
| `/admin` | Admin | Admin overview | PASS by backend role tests |
| `/review-reports` | Admin | URL review queue | PASS by backend role tests |
| `/admin-email-reports` | Admin | Email review queue | PASS by backend role tests |
| `/training-data` | Admin | Training metadata | PASS by backend role tests |
| `/users` | Admin | User status | PASS by backend role tests |

The production web build completed and six rendered HTML tests passed. Direct
local ESLint passed. The documented `npm` commands could not start because the
host global npm shim points to a missing `npm-cli.js`; equivalent local binaries
were run successfully.

## 20. Account Functions

Status: **PASS WITH CONDITIONS**

Profile name update, password change, session revocation, training-consent
state, device list/revocation, and logout are implemented and tested. Email
verification/password recovery are intentionally absent and documented as not
part of this controlled-pilot build.

The registration UI mismatch is tracked as AUTH-F001.

## 21. Activity / History

Status: **PASS WITH CONDITIONS**

Activity is owner-scoped, device-bound for detection paths, idempotent by device
and client event ID, retained for 90 days, and stores URL origin or email
metadata rather than routine body content. Feedback ownership and explanation
scope are tested.

Live pagination/large-history UI behavior was not exercised.

## 22. Feedback

Status: **PASS**

URL and email feedback requires explicit user action, matching detection/event
identity, correct owner/device, and valid verdict/classification. Email report
bodies are encrypted and excluded from user/admin response bodies. Duplicate and
mismatch handling is covered.

## 23. Administrator Functions

Status: **PASS WITH CONDITIONS**

Implemented admin areas are dashboard metrics, URL reports, email reports,
training metadata/exports, and user status management. Normal users are denied;
admins cannot suspend themselves; report review updates persist. Live admin UI
interaction was not performed.

## 24. Role Matrix

| Function | Guest | User | Paired Device | Admin |
|---|---:|---:|---:|---:|
| Health/live | Allow | Allow | Allow | Allow |
| Login | Allow | Allow | Allow | Allow |
| Public registration in production | Denied | Denied | Denied | Denied |
| Dashboard/profile/activity | Denied | Allow | N/A | Allow |
| Pairing-code creation | Denied | Allow with session+CSRF | N/A | Allow |
| Pairing-code consumption | Denied without code context | N/A | Allow with code | Allow with code |
| Detection URL/email | Denied | N/A | Allow with active device | Allow only through paired device |
| Device revoke | Denied | Allow own devices | Revoke current device | Allow own devices through session |
| Feedback/reporting | Denied | Allow own activity/session | Allow matching own device activity | Review only through admin APIs |
| Admin dashboard/reports/users | Denied | Denied | Denied | Allow with session+CSRF |

## 25. Database Persistence

Status: **PARTIAL / NOT FULLY TESTABLE**

SQLite-backed tests cover create/read/update behavior, encrypted persistence,
foreign-key ownership, rollback/idempotent insert winners, retention cleanup,
and shared rate-limit buckets. The SQLAlchemy model includes the required
entities and constraints.

A clean/latest disposable MySQL migration and existing-database forward
migration were not run. The default Alembic URL points at a local MySQL service,
and no disposable database was provisioned for this audit.

## 26. Migrations

Status: **PARTIAL**

The revision chain is linear from `0001_initial` through
`0014_centralized_rate_limits`, with one head. The required 0014 revision is
present and is the head.

The offline SQL command stops at migration 0011 because that migration calls
`sqlalchemy.inspect(bind)` during offline mode. This does not prove that online
MySQL migration fails, but it means offline generation is not a valid fallback
and online MySQL execution remains an audit gap. See DB-F001.

## 27. Rate Limiting

Status: **PASS WITH CONDITIONS**

Login/registration/email-availability, pairing, detection, message/cloud review,
and shared database bucket paths are implemented. Trusted forwarded identity is
accepted only from configured proxy networks. Functional tests pass.

The production proxy CIDR configuration is part of the Compose-template
blocker FUNC-001.

## 28. API Contracts

Public platform route families found:

- Health: `GET /health`, `/live`, `/ready`.
- Auth: register, email availability, login, logout, me.
- Account: profile, change password, training consent.
- Devices: pairing create/consume, extension pair/status/device revoke, device
  list/status/training consent.
- Detection: URL, email, email context restoration.
- Activity/reporting: activity ingestion/list, URL/email reports, feedback.
- Cloud/explanations: email review, URL review, message review, activity and
  detection explanations.
- Admin: dashboard, training data and exports, URL/email report queues and
  review, users/status.

Private detector route families found:

- `GET /live`, `/ready`, `/health`.
- Legacy/companion status, pairing, activity, context, feedback, and sample
  routes.
- `POST /analyze-url`, `/analyze-email`, `/analyze-hybrid-email`.

Web API calls observed match the corresponding public route suffixes. Legacy
Companion compatibility calls remain documented as development/rollback paths;
the remote platform detection endpoints perform the durable activity recording.

## 29. Cross-Component Contracts

Status: **PASS WITH CONDITIONS**

Exact enums and field contracts are aligned in automated tests: final outcomes,
cloud statuses, provider scope, device credential use, detection IDs,
explanation context status, thresholds, and installed model metadata.

The release configuration boundary is not complete: the extension currently
targets loopback development API rather than a released HTTPS origin. This is
tracked as EXT-F001.

## 30. Failure Handling

Status: **PASS WITH CONDITIONS**

Database, detector, cloud, malformed provider, invalid token, oversized input,
and incomplete-response paths are designed to return explicit 4xx/5xx or
`UNAVAILABLE` states. Tests confirm detector/cloud failure is not converted to a
successful SAFE result and local evidence continues where intended.

Operational dependency availability in a real Compose deployment was not
tested.

## 31. State / Race Conditions

Status: **PASS WITH CONDITIONS**

URL sequence IDs, email fingerprints, tab URL checks, client event IDs,
idempotent database uniqueness, transient context keys, and automatic-popup
fingerprints address stale-response and duplicate-result risks. Static and
synthetic tests pass.

Real multi-tab/browser-worker concurrency was not performed.

## 32. Caching

Status: **PASS**

Cloud cache tests cover hit, miss, TTL, authentication changes, duplicate URL
origin, duplicate email, concurrent sharing, and quota cooldown. Cache payloads
use minimized/fingerprinted context and no raw routine content is durably
queued.

## 33. Privacy Behavior

Status: **PASS WITH CONDITIONS**

The code and tests preserve origin-only routine URL activity, metadata-only
routine email history, encrypted explicit email reports, memory-only transient
full context, backend-only provider keys, and redaction before provider calls.
No raw private test data was used.

Runtime logs and deployed storage were not inspected because no production or
external environment was started.

## 34. Offline / Degraded Operation

Status: **PASS WITH CONDITIONS**

Local URL/NLP/indicator/fusion evidence remains available when cloud review is
unavailable. UI/API states distinguish unavailable from completed final results.
The remote deployment still requires the detector and its frozen model files;
offline here means cloud-review degradation, not operation without the server.

## 35. Companion Application

Status: **PASS WITH CONDITIONS / OPTIONAL**

Companion tests cover credential storage fallback, pair/unpair, outbox behavior,
context expiry/restart, and device access. Repository documentation identifies
it as legacy development/rollback tooling, not an end-user production
dependency. A packaged Windows startup/restart test was not performed.

## 36. Development vs Release Configuration

Status: **FAIL FOR CURRENT RELEASE ARTIFACT**

The extension config is visibly development mode:

```text
buildMode: "development"
apiBase: "http://127.0.0.1:8080/api/v1"
allowHttpLoopback: true
```

`verify_extension_release.py` fails with the expected release-safety message.
The production Compose configuration also cannot be rendered from the root
example env without the missing proxy CIDR variable. See EXT-F001 and FUNC-001.

## 37. Browser / Responsive Behavior

Web local UI smoke:

- Landing: PASS.
- Login: PASS.
- Registration route: renders, but contradicts closed-pilot configuration.
- Non-guarantee and privacy wording: PASS.

Web production build and rendered HTML tests: PASS.

Interactive Chromium validation: **NOT PERFORMED**. No live Chrome/Edge
extension load, popup visual session, browser restart, or supported mail-provider
DOM session was used. Therefore Chrome/Edge compatibility and live responsive
popup behavior are NOT TESTABLE from this audit.

## 38. End-to-End Journeys

| Journey | Expected | Result | Notes |
|---|---|---|---|
| 1. Login → pair extension → normal website assessment | Authenticated pairing and URL result | PARTIAL | API/platform tests pass; release extension/live browser not validated |
| 2. Synthetic suspicious URL → caution/warning | Correct non-blocking result | PASS WITH CONDITIONS | Synthetic URL model/fusion tests pass; no live phishing site visited |
| 3. Legitimate synthetic email + cloud unavailable | Local result remains visible and not falsely safe | PASS | Fusion/partial-failure tests pass |
| 4. Synthetic social-engineering email + mocked cloud | Indicator/NLP/cloud fusion warning | PASS | Indicator/fusion/mock provider tests pass |
| 5. Detector unavailable | Unavailable/degraded, not SAFE | PASS | Gateway and display tests pass |
| 6. Logout → protected route denied | Session revoked; device contract independent | PASS WITH CONDITIONS | Backend tests pass; live browser session not tested |
| 7. Admin function → normal user denied | Role enforcement | PASS | Shared platform role/admin tests pass |

## 39. Requirement Traceability Summary

The full matrix is in `BANTAI_FUNCTIONAL_TRACEABILITY.csv`.

Traceability totals: 38 mapped requirements:

- PASS: 33
- FAIL: 3
- PARTIAL: 1
- NOT TESTABLE: 1
- NOT IMPLEMENTED: 0
- NOT APPLICABLE: 0

The FAIL/PARTIAL rows are release/configuration or auditability gaps, not model
accuracy findings.

## 40. Findings Summary

| ID | Severity | Module | Finding | Functional Impact | Confidence |
|---|---|---|---|---|---|
| FUNC-001 | HIGH | Deployment | Root production environment template cannot render required Compose configuration | Platform stack cannot be prepared from documented template | High |
| EXT-F001 | HIGH | Extension/Release | Current extension is development HTTP-loopback configuration, not a releasable HTTPS artifact | Packaged extension cannot target production API safely | High |
| AUTH-F001 | MEDIUM | Auth/Web | Closed-pilot registration is disabled server-side but invited/rendered in UI | Users are sent into a flow that always fails with 403 | High |
| DB-F001 | MEDIUM | Database/Migrations | Full online migration not validated; offline SQL stops at 0011 introspection | Migration readiness remains unproven for MySQL deployment | Medium |
| BROWSER-F001 | INFORMATIONAL | Browser | Interactive Chrome/Edge and live provider DOM acceptance not performed | Browser compatibility remains unassessed | High |

## 41. Detailed Findings

### [FUNC-001] Production Compose template is incomplete

Severity: HIGH  
Confidence: High  
Subsystem: Deployment configuration  
Affected Files: `docker-compose.yml:117`, `.env.example`, `README.txt`  
Affected Function: Production stack configuration/startup

Expected Behavior:

The documented root environment template should provide every required Compose
variable, or the deployment documentation should clearly identify the additional
required variable before `docker compose config`.

Observed Behavior:

`docker compose --env-file .env.example config` fails during interpolation:
`BANTAI_TRUSTED_PROXY_CIDRS` is required by the platform service but is not in
the root template. The platform cannot be started from the supplied production
configuration template.

Evidence:

- Compose requires `BANTAI_TRUSTED_PROXY_CIDRS` at `docker-compose.yml:117`.
- `shared_platform/.env.example` contains the variable, but the production root
  command uses the root `.env`/`.env.example` convention.
- The command was run with placeholders only; no service was started.

User Impact: Deployment operator cannot prepare the documented stack without
discovering and manually adding an undocumented variable.

System Impact: Production configuration validation fails before application
startup; trusted-proxy-aware rate limiting cannot be configured.

Reproduction Steps:

1. From the project root run `docker compose --env-file .env.example config`.
2. Observe interpolation failure for `BANTAI_TRUSTED_PROXY_CIDRS`.

Recommended Remediation: Align the root production template and deployment
documentation with the Compose-required variable. Preserve the requirement for
a real private Caddy source network; do not weaken validation or use a broad
placeholder in production.

Deployment Blocking: Yes

### [EXT-F001] Checked-out extension is not a release artifact

Severity: HIGH  
Confidence: High  
Subsystem: Extension release configuration  
Affected Files: `extension/config.js:3-5`, `extension/manifest.json:12-31`,
`scripts/verify_extension_release.py`  
Affected Function: Extension-to-production API connection

Expected Behavior:

A release extension must use a non-loopback HTTPS API base, matching host
permission, matching CSP `connect-src`, release mode, and loopback disabled.

Observed Behavior:

The checked-out extension is configured for development mode with HTTP loopback
at `http://127.0.0.1:8080/api/v1` and `allowHttpLoopback: true`. The release
verifier fails with `A release extension must use release mode with loopback
disabled.`

Evidence:

- `extension/config.js` explicitly contains development/loopback settings.
- `extension/manifest.json` contains the loopback host/CSP rather than a
  released API origin.
- `python scripts/verify_extension_release.py` exited 1.

User Impact: A packaged extension from the current checkout cannot connect to
the intended remote public API and is unsafe to treat as a release build.

System Impact: Pairing and all detection paths are unavailable outside the
local development service.

Reproduction Steps:

1. Run `python scripts/verify_extension_release.py`.
2. Observe the release-safety failure.

Recommended Remediation: Produce a separate release configuration using the
existing endpoint configuration script, then rerun the release verifier and
perform sanitized Chrome/Edge acceptance against a controlled test API. Do not
silently fall back to localhost.

Deployment Blocking: Yes

### [AUTH-F001] Closed-pilot UI invites unavailable registration

Severity: MEDIUM  
Confidence: High  
Subsystem: Authentication/web onboarding  
Affected Files: `docker-compose.yml:101`, `shared_platform/app/config.py:52-80`,
`shared_platform/app/main.py:330-370`, `web/app/views/AuthView.jsx:274-279`,
`web/app/views/HelpView.jsx:28-30`  
Affected Function: Public registration discovery and onboarding

Expected Behavior:

When `BANTAI_PUBLIC_REGISTRATION_ENABLED=false` for the controlled pilot, the
web UI should not misleadingly invite public registration. It should explain
that accounts are provisioned/controlled or direct users to sign in.

Observed Behavior:

The API correctly returns 403 for registration and email availability, but the
landing/login/help experience still offers “Create an account,” and `/register`
renders a full registration form. The local browser smoke reproduced this
without submitting data.

Evidence:

- Production Compose sets `BANTAI_PUBLIC_REGISTRATION_ENABLED: "false"`.
- Platform config rejects enabled public registration in remote runtime.
- AuthView renders the create-account CTA and registration route regardless of
  the deployment flag.
- HelpView says “Create an account or sign in.”

User Impact: Pilot users can enter a flow that is guaranteed to fail, creating
confusion and support load.

System Impact: Frontend/backend requirement contract is inconsistent.

Reproduction Steps:

1. Start/render the web application with the controlled-pilot API configuration.
2. Open `/login` or `/register`.
3. Observe the create-account CTA/form despite the server returning 403.

Recommended Remediation: Make the closed-pilot state explicit in the web
configuration/UI, or provide an authenticated/configured registration workflow
before enabling the CTA. Do not enable public registration merely to make the
button work.

Deployment Blocking: Yes for the controlled-pilot onboarding contract

### [DB-F001] Migration readiness is incomplete for target MySQL

Severity: MEDIUM  
Confidence: Medium  
Subsystem: Database migrations  
Affected Files: `shared_platform/alembic/versions/0011_contracts_provenance_operations.py`,
`0012_remote_server_inference.py`, `0013_detection_input_explanation_limit.py`,
`0014_centralized_rate_limits.py`  
Affected Function: Clean/latest and forward database migration

Expected Behavior:

A disposable target-like MySQL database should migrate from clean state to
latest and an existing fixture should migrate forward. Offline SQL generation,
if supported, should also complete.

Observed Behavior:

The migration graph has one head, but the audit could not run online MySQL. The
offline SQL command stops at revision 0011 because that revision calls
`sqlalchemy.inspect(bind)` during offline mode.

Evidence:

- `alembic heads` reports `0014_centralized_rate_limits (head)`.
- `alembic upgrade head --sql` fails while executing 0011 introspection.
- No disposable MySQL service was available; no production database was touched.

User Impact: Deployment migration readiness is not independently demonstrated.

System Impact: A target-dialect migration failure could block platform startup;
the current evidence is insufficient to determine whether online MySQL succeeds.

Recommended Remediation: Run clean and forward migrations against disposable
MySQL 8.4 using the production image/requirements. Decide explicitly whether
offline mode is supported; if it is, make 0011 offline-safe. This audit did not
change migrations.

Deployment Blocking: Yes until target-like migration evidence exists

### [BROWSER-F001] Interactive Chromium/provider validation not performed

Severity: INFORMATIONAL  
Confidence: High  
Subsystem: Browser compatibility  
Affected Files: MV3 manifest, service worker, provider content scripts  
Affected Function: Live Chrome/Edge and provider DOM compatibility

Expected Behavior: Controlled Chrome and Edge sessions should validate extension
load, pairing, navigation, popup, worker restart, and sanitized supported-provider
DOM extraction.

Observed Behavior: Only syntax/static tests and local web UI smoke were run. No
live Chrome/Edge extension was installed, no private mail account was used, and
no live provider DOM was visited.

Evidence: `node --check` and invariant tests pass; interactive extension
validation was intentionally not performed.

User Impact: Browser/provider compatibility remains unproven.

System Impact: DOM selector drift and real MV3 lifecycle issues could still
exist outside repository tests.

Recommended Remediation: After release configuration and a sanitized test API
are available, perform the Chrome/Edge acceptance matrix without real private
email or live phishing URLs.

Deployment Blocking: No by itself; required before claiming browser support

## 42. Deployment Blockers

Functional blockers only:

1. **FUNC-001:** Production Compose cannot be rendered from the supplied root
   environment template.
2. **EXT-F001:** No validated HTTPS release extension artifact exists; current
   extension points at development loopback.
3. **AUTH-F001:** Controlled-pilot onboarding advertises a registration flow the
   backend intentionally rejects.
4. **DB-F001:** Target-like MySQL migration execution is not evidenced.

These are functional/release-readiness blockers, not a claim that the frozen
models are inaccurate.

## 43. Recommended Remediation Order

### Priority 0 — Core functionality / unsafe behavior

- Resolve FUNC-001 while keeping trusted proxy validation mandatory.
- Generate and verify a release extension configuration; keep URL enforcement
  shadow/non-blocking as documented.

### Priority 1 — Required before public release

- Resolve AUTH-F001 so controlled-pilot registration state is consistent across
  API, web UI, landing/help copy, and deployment configuration.
- Run clean/forward MySQL migrations on a disposable target-like environment.
- Execute sanitized Chrome/Edge pairing and detection acceptance against a
  controlled test API.

### Priority 2 — Important reliability fixes

- Validate live Gmail/Outlook/Yahoo DOM extraction and provider message-change
  behavior.
- Exercise multi-tab, worker restart, popup, and responsive-extension cases.
- Decide whether Alembic offline SQL is a supported operational workflow and
  make 0011 consistent with that decision.

### Priority 3 — Maintenance / test coverage

- Repair the host npm launcher or document the direct local binary commands.
- Add deployment-template and registration-visibility contract tests.
- Add disposable MySQL migration coverage to the release checklist.

## 44. Functional Readiness Checklist

### SYSTEM

- [x] Application source startup paths and readiness contracts inspected
- [ ] Database migrations validated on disposable target-like MySQL
- [ ] Production public API started in intended configuration
- [ ] Private detector started in intended configuration
- [x] Web application builds
- [ ] Release extension loads in Chrome/Edge

### AUTH

- [x] Login contract tested
- [x] Invalid login handled
- [x] Logout/session revocation tested
- [x] Protected backend routes protected
- [x] Suspended users handled
- [ ] Closed-pilot registration UI aligned with disabled backend

### PAIRING

- [x] Pairing API tested
- [x] Invalid/revoked device handled
- [x] Restart/credential behavior covered by synthetic tests
- [ ] Live release extension pairing validated

### URL

- [x] Exact address-bar URL contract verified
- [x] URL validation/model/threshold verified
- [x] Safe/suspicious/caution/unavailable fusion paths verified
- [x] Stale-result invariants verified
- [ ] Live navigation behavior validated in Chrome/Edge

### EMAIL

- [x] Gmail/Outlook/Yahoo parser contracts tested with sanitized fixtures
- [x] Empty/no-open/failure paths are non-SAFE
- [x] NLP, indicators, fusion, and cloud-unavailable paths tested
- [ ] Live provider DOM extraction validated
- [x] Website result cannot suppress email result

### WEB

- [x] Public/authenticated route components build and render
- [x] Activity/report/profile/device/admin API contracts mapped
- [x] Backend admin authorization tested
- [ ] Live authenticated browser session validated
- [ ] Closed-pilot registration presentation corrected

### FAILURE HANDLING

- [x] Detector failure is not SAFE
- [x] Model failure is not SAFE
- [x] Cloud unavailable is distinct
- [x] API/oversized/malformed response errors handled
- [x] Stale state guards present and tested

### RELEASE

- [ ] Development/release extension configurations separated in current artifact
- [ ] HTTPS release endpoint configured and verified
- [ ] Production Compose config renders from documented template
- [ ] Target-like database migration completed
- [ ] Actual Chrome/Edge validation completed

## 45. Final Assessment

Authentication: **PASS WITH CONDITIONS**

Pairing: **PASS WITH CONDITIONS**

URL Detection: **PASS WITH CONDITIONS**

Email Detection: **PASS WITH CONDITIONS**

Fusion: **PASS**

Extension: **PASS WITH CONDITIONS**

Web: **PASS WITH CONDITIONS**

Administration: **PASS WITH CONDITIONS**

Database: **NOT TESTABLE**

Failure Handling: **PASS WITH CONDITIONS**

Overall Functional Risk: **HIGH pre-release risk concentrated in release
configuration, onboarding contract, target-database validation, and absent live
Chromium acceptance.**

Top 5 Functional Issues:

1. FUNC-001 — Production Compose template missing required trusted-proxy input.
2. EXT-F001 — Current extension remains HTTP-loopback development mode.
3. AUTH-F001 — Closed-pilot UI invites registration that the API rejects.
4. DB-F001 — Target-like MySQL migration has not been executed; offline path
   stops at 0011.
5. BROWSER-F001 — Chrome/Edge and live provider DOM behavior is unvalidated.

Most Important Recommendation:

Resolve the production configuration and release-extension blockers, align the
controlled-pilot registration UI with the backend flag, then run disposable
MySQL and sanitized Chrome/Edge acceptance before treating the system as ready
for the next audit.

## Automated Test Execution Record

| Check | Result |
|---|---|
| `python scripts/verify_project.py` | PASS |
| `python scripts/verify_models.py` | PASS |
| `python -m unittest discover -s tests -v` | PASS — 144 tests |
| `python -m unittest discover -s shared_platform/tests -v` | PASS — 38 tests |
| Required Python `py_compile` | PASS |
| Required extension Node syntax checks | PASS |
| Direct local web ESLint | PASS |
| Direct local web `vinext build` | PASS |
| Direct `node --test tests/rendered-html.test.mjs` | PASS — 6 tests |
| Documented `npm run lint/test/build` | NOT TESTABLE in host environment — broken global npm launcher; equivalent direct commands pass |
| `alembic heads` | PASS — one head, 0014 |
| Offline Alembic upgrade SQL | PARTIAL — stops at 0011 introspection |
| Production Compose config with root `.env.example` | FAIL — missing required trusted proxy variable |
| Local Compose config render | PASS — services not started |
| Extension release verifier | FAIL — current artifact is development/loopback |
| Live Chrome/Edge/provider DOM | NOT PERFORMED |
| Real LLM request | NOT PERFORMED |
| Real private email/message | NOT PERFORMED |
| Production deployment | NOT PERFORMED |

## Audit Limitations

- No disposable MySQL server was available; SQLite/TestClient evidence is not a
  substitute for target-dialect migration execution.
- No actual production API domain, DNS, TLS certificate, released extension ID,
  or external cloud provider was used.
- No live Chrome/Edge MV3 extension session or Gmail/Outlook/Yahoo DOM session
  was used.
- The host `npm` launcher is broken, but installed project-local lint/build/test
  executables were run directly.
- Existing earlier audit reports were treated as supporting evidence only; their
  findings were not assumed fixed without current evidence.

BANTAI FUNCTIONAL AUDIT COMPLETE

Report generated: `BANTAI_FUNCTIONAL_AUDIT.md`

Traceability generated: `BANTAI_FUNCTIONAL_TRACEABILITY.csv`

Functional test results: `BANTAI_FUNCTIONAL_TEST_RESULTS.csv`

Critical findings: 0
High findings: 2
Medium findings: 2
Low findings: 0
Informational findings: 1

Authentication: PASS WITH CONDITIONS

Pairing: PASS WITH CONDITIONS

URL Detection: PASS WITH CONDITIONS

Email Detection: PASS WITH CONDITIONS

Fusion: PASS

Extension: PASS WITH CONDITIONS

Web Application: PASS WITH CONDITIONS

Administration: PASS WITH CONDITIONS

Database: NOT TESTABLE

Overall Functional Readiness: FUNCTIONAL REMEDIATION REQUIRED

No remediation, retraining, threshold change, dataset modification, or
production deployment has been performed.
