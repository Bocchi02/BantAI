# BantAI Code and Dependency Audit

**Audit date:** 2026-09-15 (Asia/Manila)  
**Project:** BantAI v1.1.0  
**Review type:** Pre-production source-code, dependency, configuration, extension, database, ML, and testing audit  
**Audit basis:** The current working tree, including uncommitted files and changes visible during the review. Existing user changes were not modified.

## 1. Executive Summary

BantAI has a comparatively strong security foundation for a pre-production system. The active architecture separates the public API, private detector, browser extension, web application, and database; keeps the detector and database off host-published ports; uses Argon2 password hashing, opaque hashed session/device tokens, CSRF protection, explicit CORS origins, strict Pydantic request models, ownership checks, non-root containers, privacy-aware storage, and deterministic model fusion. The frozen URL artifact is hash-verified before `joblib.load`, and the supplied invariant, model, API, web, and extension checks passed.

The current tree is nevertheless **not ready for production deployment**. A direct production dependency, `next@16.2.6`, is within the affected ranges of two critical remote-code-execution advisories. A direct React Server Components package also has a high-severity denial-of-service advisory. Separately, an authenticated cloud-review endpoint trusts caller-provided fields to already be redacted, the checked-in extension release configuration is still HTTP loopback-only, and the public rate limiter is proxy-unaware in the declared Caddy topology. Python runtime dependencies are not locked or hash-pinned and could not be fully checked against a vulnerability database in this environment.

### Finding counts

| Severity | Count |
|---|---:|
| CRITICAL | 1 |
| HIGH | 3 |
| MEDIUM | 9 |
| LOW | 5 |
| INFORMATIONAL | 2 |
| **Total** | **20** |

### Deployment recommendation

**NOT READY FOR DEPLOYMENT**

Resolve DEP-001, DEP-002, API-001, CONFIG-001, and API-002 before a public production rollout. Complete a reproducible Python dependency vulnerability review before signing off the release.

## 2. Project Architecture Overview

The active system discovered in the repository is:

1. **Chromium Manifest V3 extension** in `extension/`. A service worker coordinates exact-address-bar URL analysis and Gmail, Outlook, and Yahoo opened-email extraction. Popup code presents independent website and email results. Pairing credentials are kept in extension storage and API requests use the paired device credential.
2. **Public platform API** in `shared_platform/app/`. FastAPI exposes account, pairing, detection, feedback, activity, cloud-review, training-data, and administrator APIs. SQLAlchemy and Alembic target MySQL. Web sessions use opaque cookie tokens; extension/companion calls use opaque bearer device tokens.
3. **Private detector service** in `backend/`. FastAPI serves the frozen RF URL model, calibrated XLM-R email model, scam-indicator engine, LLM review abstraction, and deterministic fusion. The private API is protected with an internal service key and is placed on internal Docker networks in the production Compose file.
4. **Web application** in `web/`. React 19 and Next 16 APIs are built through Vinext/Vite for a Cloudflare Worker-style runtime. A same-origin worker proxy forwards `/api/v1` requests only to a configured HTTPS API origin, with explicit loopback opt-in for development.
5. **Local Windows companion** in `backend/companion.py` and `companion/`. It stores the paired credential using platform credential storage/DPAPI fallback and proxies extension requests where applicable. PyInstaller configuration is present.
6. **Deployment** through Docker Compose, Caddy, MySQL 8.4, and separate platform/detector images. Caddy terminates TLS and sets HSTS, `nosniff`, and a no-referrer policy for the public API.
7. **Models** under `models/`. The RF model is a local Joblib artifact with a frozen SHA-256 check. The email model is a local sharded Safetensors checkpoint with a validated configuration/calibration contract.
8. **Tests** use Python `unittest`, Node's test runner, ESLint, syntax checks, and repository-specific invariant/model verification scripts.

Additional tracked trees include a large `Sneat-Template/` frontend template and `BantAI_v1_0_0_Codex_Ready_With_Local_Models/` legacy application copy. Neither is referenced by the active Dockerfiles or current runtime entry points, but both remain part of repository supply-chain and release-scope governance.

## 3. Audit Scope

### Reviewed components

- `backend/`, including detector endpoints, ML preprocessing/loading, LLM provider, redaction, caching, fusion, companion, and requirements files.
- `shared_platform/app/`, `shared_platform/alembic/`, and `shared_platform/tests/`, including authentication, authorization, sessions, CSRF, rate limits, API schemas, database models, encryption, detector gateway, cloud review, administrator routes, and migrations.
- `extension/`, including `manifest.json`, generated endpoint configuration, service worker, Gmail/Outlook/Yahoo extractors, sender-authentication helper, popup scripts/markup/styles, permissions, CSP, storage, and message flow.
- `web/`, including application views/components, API client, worker proxy/entry point, Vite/Vinext configuration, lockfile, lint configuration, and rendered-HTML tests.
- `companion/`, root scripts, deployment scripts, Dockerfiles, Compose files, Caddy configuration, environment examples, ignore rules, documentation, model manifests, and verification scripts.
- `package.json`, `package-lock.json`, both active Python requirements sets, and the legacy template's `package.json`/`yarn.lock`.
- Git-tracked filenames and accessible history for credential-pattern review. Current ignored environment files were identified as ignored and were not copied into this report.

### Verification performed

- `python scripts\verify_project.py`: PASS.
- `python scripts\verify_models.py`: PASS, including the frozen RF SHA-256 and email deployment contract.
- `python -m unittest discover -s tests -v`: 139 passed.
- `python -m unittest discover -s shared_platform\tests -v`: 34 passed.
- Required extension `node --check` checks: PASS. The project verifier also checked `sender-authentication.js`.
- Web production build through the installed Vinext CLI: PASS.
- Web rendered-HTML/API-proxy tests: 5 passed.
- ESLint through the installed ESLint CLI: PASS.
- `pip check`: no broken installed requirements.
- JavaScript lockfile advisory review: production graph reported 5 vulnerable package nodes (1 critical, 3 high, 1 moderate); full graph reported 21 vulnerable package nodes (1 critical, 16 high, 2 moderate, 2 low). Package-node counts are not unique-CVE counts.

### Limitations

- No Chrome or Edge interactive behavior test was performed; Chromium behavior is not claimed as validated.
- No live production infrastructure, DNS, TLS certificate, Cloudflare account, database privileges, backup target, secret manager, or production environment values were available.
- No real Gemini/LLM request was made. Tests use controlled providers; this complies with the project rule against real LLM calls in automated tests.
- `pip-audit` was not installed. An external bulk Python package query was not used because it would disclose the complete local environment inventory to a third party. Consequently, Python dependencies are **not certified vulnerability-free**.
- The globally installed `npm` wrapper was broken (`npm-cli.js` missing). Advisory results already obtained from the lockfile/registry review were retained, while build, lint, and tests were run directly through installed Node CLIs.
- The legacy `Sneat-Template` Yarn graph was not dynamically audited because Yarn was unavailable and its dependencies were not installed. It was statically reviewed as an unused tracked template.
- Model behavior against undisclosed production data, adversarial ML evasion, cloud-provider tenancy controls, and infrastructure penetration testing are outside this source review.

## 4. Finding Summary

| ID | Severity | Component | Finding | Confidence | Status |
|---|---|---|---|---|---|
| DEP-001 | CRITICAL | Web runtime | Direct `next@16.2.6` is affected by two critical RCE advisories | High | Confirmed dependency; runtime path needs final deployment verification |
| DEP-002 | HIGH | Web/RSC | `react-server-dom-webpack@19.2.6` is affected by a high-severity DoS advisory | High | Confirmed dependency; likely relevant |
| API-001 | HIGH | Public API/cloud AI | Email cloud-review route trusts caller-asserted redaction | High | Confirmed |
| CONFIG-001 | HIGH | Browser extension | Checked-in release endpoint and CSP are HTTP loopback-only | High | Confirmed |
| DEP-003 | MEDIUM | Web production graph | Additional vulnerable production transitive packages | High | Confirmed dependencies; mixed exploitability |
| DEP-004 | MEDIUM | Web build/dev graph | Sixteen high and other lower build-tool package findings | High | Confirmed dependencies; mostly build/local exposure |
| DEP-005 | MEDIUM | Python supply chain | Production Python dependencies are not reproducibly locked or fully audited | High | Confirmed hygiene gap |
| API-002 | MEDIUM | Public API/rate limiting | Proxy-unaware in-memory buckets create shared-limit and scale-out weaknesses | High | Confirmed design; deployment effect inferred from topology |
| API-003 | MEDIUM | Private detector | Email request body has no detector-side maximum length | High | Confirmed; internal reachability limits exposure |
| AUTH-001 | MEDIUM | Accounts | Registration activates unverified email identities and has no recovery flow | High | Confirmed |
| ML-001 | MEDIUM | Email model | Weight shards and tokenizer lack pinned integrity verification | High | Confirmed |
| CONFIG-002 | MEDIUM | Web frontend | Browser security headers and anti-framing policy are not set by the worker | High | Confirmed in repository; edge policy uninspected |
| LOG-001 | MEDIUM | Platform/detector | Security-event audit logging is insufficient and access logs are disabled | High | Confirmed |
| AUTH-002 | LOW | Accounts | Email-availability and registration responses permit account enumeration | High | Confirmed |
| EXT-001 | LOW | Browser extension | Popup loads Google Fonts remotely and expands extension CSP/network metadata exposure | High | Confirmed |
| CONFIG-003 | LOW | Containers | Images are mutable-tag based and runtime hardening controls are incomplete | High | Confirmed |
| REPO-001 | LOW | Repository/release scope | Launchable legacy code and a large unused template remain tracked | High | Confirmed; accidental-deployment risk |
| CODE-001 | LOW | Maintainability | Very large orchestration/extractor files and broad exception handling raise defect risk | High | Confirmed |
| TEST-001 | INFORMATIONAL | Tests | Important negative security and real-browser scenarios are not automated | High | Confirmed coverage gap |
| OPS-001 | INFORMATIONAL | Operations | No repository CI security gate, SBOM, or backup/restore automation was found | High | Confirmed repository gap; external controls unknown |

## 5. Detailed Findings

### [DEP-001] Direct Next.js Version Has Critical RCE Advisories

**Severity:** CRITICAL  
**Confidence:** High confidence  
**Category:** Vulnerable dependency / remote code execution  
**Affected Component:** Web application runtime  
**Affected File(s):** `web/package.json`, `web/package-lock.json`, `web/worker/index.js`  
**Affected Line(s):** `web/package.json:14`; `web/worker/index.js:2-26`

**Description:** The application pins `next@16.2.6`. That version is inside the affected ranges of GHSA-p293-qw3h-jr36 (CVE-2026-75604, Windows-hosted Next.js RCE) and GHSA-2xp9-vwfh-vxw4 (critical AVIF image-optimization RCE). Both advisories are fixed in Next 16.3.3 or later within the 16.x line.

**Evidence:** The package and lockfile install 16.2.6. The worker imports Vinext image optimization and exposes `/_vinext/image`, although its transform callback uses Cloudflare Images. The declared production target is Cloudflare rather than a Windows Next server. Authoritative advisory references: <https://github.com/advisories/GHSA-p293-qw3h-jr36> and <https://github.com/advisories/GHSA-2xp9-vwfh-vxw4>.

**Security Impact:** If a vulnerable path is present in the built/deployed runtime, an unauthenticated attacker could execute code in the server process. A Windows-hosted local or alternate deployment is specifically exposed to the Windows advisory. The Cloudflare/Vinext architecture may remove or alter the exact vulnerable Next implementation, but that has not been proven by an end-to-end exploitability test.

**Exploitability:** **Needs Manual Verification** for the Cloudflare production bundle; **Confirmed Relevant** for any directly hosted vulnerable Next server satisfying the advisory conditions. The direct vulnerable version is confirmed regardless of runtime mitigation.

**Recommended Fix:** Upgrade Next to a compatible release at or above 16.3.3 (prefer the current audited 16.3.x patch), regenerate the lockfile, and re-run the production build, rendered-route tests, image-route tests, and advisory scan. Verify Vinext compatibility before release.

**Example Secure Approach:** Make a narrowly scoped patch upgrade to `next@16.3.5` or another reviewed non-affected 16.3.x version, align `eslint-config-next`, rebuild from a clean install, and explicitly test malicious/invalid AVIF input against the deployed worker route. Do not apply a forced major upgrade.

**Deployment Blocking:** Yes

### [DEP-002] React Server Components Package Has a High-Severity DoS Advisory

**Severity:** HIGH  
**Confidence:** High confidence  
**Category:** Vulnerable dependency / denial of service  
**Affected Component:** Web RSC build/runtime  
**Affected File(s):** `web/package.json`, `web/package-lock.json`, Vinext RSC output  
**Affected Line(s):** `web/package.json:28`

**Description:** `react-server-dom-webpack@19.2.6` is affected by GHSA-wx67-qw84-cm4g (CVE-2026-44907), a high-severity denial-of-service issue fixed in 19.2.8.

**Evidence:** The package is a direct development dependency used by the Vinext App Router/RSC build. Advisory: <https://github.com/advisories/GHSA-wx67-qw84-cm4g>.

**Security Impact:** A crafted request reaching the affected server-component decoder can exhaust server resources or crash request handling.

**Exploitability:** **Likely Relevant.** The application actively uses a server-rendered App Router/RSC build. Whether Cloudflare/Vinext reaches precisely the vulnerable decoder for untrusted requests should be confirmed against the generated worker.

**Recommended Fix:** Upgrade to at least 19.2.8, keeping React, React DOM, and server-dom package versions compatible; then rebuild and test RSC request handling.

**Example Secure Approach:** Select a matched React patch set, regenerate `package-lock.json`, run clean build and request-fuzz tests, and retain a CI audit gate.

**Deployment Blocking:** Yes

### [API-001] Email Cloud-Review Route Trusts Caller-Asserted Redaction

**Severity:** HIGH  
**Confidence:** High confidence  
**Category:** Sensitive-data exposure / trust-boundary validation  
**Affected Component:** Public platform API and cloud LLM integration  
**Affected File(s):** `shared_platform/app/main.py`, `shared_platform/app/schemas.py`, `shared_platform/app/cloud.py`, `backend/llm/prompt_builder.py`  
**Affected Line(s):** `main.py:1855-1857`; `schemas.py:372-379`; `cloud.py:202-215`; `prompt_builder.py:77-97`

**Description:** `/api/v1/cloud-review/email` accepts fields named `redacted_sender`, `redacted_subject`, and `redacted_context` from any authenticated paired device, then forwards them to `cloud_review()` without applying server-side redaction. The generic review function sends the payload to the provider as supplied. Other cloud paths correctly call `redact_text()` before provider use.

**Evidence:** The endpoint performs device authentication, but its only privacy enforcement is field naming and maximum length. There is no `redact_text()` call between deserialization and `provider.review(payload)`. The prompt builder interpolates those fields as evidence.

**Security Impact:** A buggy, modified, or compromised paired client can send raw OTPs, phone numbers, email addresses, card/account identifiers, or other content to the third-party LLM. This violates the project's mandatory backend redaction boundary and makes privacy depend on untrusted client behavior.

**Exploitability:** **Confirmed.** Authentication is required, but the caller fully controls the values. No bypass is needed once a device token is held.

**Recommended Fix:** Treat all incoming text as untrusted/raw regardless of field name. Apply the same server-side redaction, sender minimization, length limits, and authentication minimization used by the primary detector/cloud pipeline immediately before the provider call.

**Example Secure Approach:** Construct a fresh provider payload from allowlisted fields; call `sender_parts()`, `redact_text()`, `truncate_preserving_ends()`, and `minimize_authentication()` server-side; mark the payload redacted only after those transformations; add a test that submits synthetic PII to this exact public route and asserts it never reaches the fake provider.

**Deployment Blocking:** Yes

### [CONFIG-001] Extension Release Configuration Is Still HTTP Loopback-Only

**Severity:** HIGH  
**Confidence:** High confidence  
**Category:** Production misconfiguration / transport security  
**Affected Component:** Browser extension  
**Affected File(s):** `extension/config.js`, `extension/manifest.json`  
**Affected Line(s):** `config.js:1-5`; `manifest.json:12-20,28-30`

**Description:** The checked-in extension configuration points to `http://127.0.0.1:8080/api/v1`, explicitly enables HTTP loopback, grants only that API origin, and restricts `connect-src` to the same local HTTP endpoint. It is a valid local-development profile, not a production release artifact.

**Evidence:** The repository's own remote endpoint configurator and invariant tests distinguish HTTPS production configuration from explicitly opted-in local Docker behavior.

**Security Impact:** A packaged extension from the current tree will not communicate with the authenticated public API. If local companion binding or host security is compromised, loopback cleartext requests also lack transport authentication. Users may see unavailable/stale functionality and could be induced to run the wrong deployment mode.

**Exploitability:** **Confirmed configuration defect** for a production build. HTTP is limited to loopback, so this is not equivalent to cleartext Internet transmission.

**Recommended Fix:** Generate the release configuration with the exact public HTTPS API origin, update host permission and CSP consistently, and make release packaging fail when loopback mode remains enabled.

**Example Secure Approach:** Run the existing endpoint configuration script with the reviewed production HTTPS origin in a clean release checkout; validate `manifest.json` and `config.js`; package only that artifact; keep a separately named local-development build.

**Deployment Blocking:** Yes

### [DEP-003] Additional Vulnerable Packages Are Present in the Production JavaScript Graph

**Severity:** MEDIUM  
**Confidence:** High confidence  
**Category:** Vulnerable dependencies  
**Affected Component:** Web production dependency graph  
**Affected File(s):** `web/package-lock.json`  
**Affected Line(s):** Lockfile package entries for `postcss`, `sharp`, `nanoid`, and `baseline-browser-mapping`

**Description:** The production graph contains vulnerable `postcss@8.4.31`, `sharp@0.34.5`, `nanoid@3.3.12`, and `baseline-browser-mapping@2.10.30` nodes in addition to Next. Registry audit aggregated these as three high and one moderate package findings.

**Evidence:** Exact installed versions and lockfile integrity records were inspected. Advisory identifiers are summarized in Section 6.

**Security Impact:** Potential impacts include image-decoder memory-safety/RCE behavior, malicious source-map file access, malformed API misuse, and build-data parsing issues.

**Exploitability:** Mixed. Sharp/Next image handling needs deployed-route verification. PostCSS and baseline-browser-mapping appear build-time with repository-controlled inputs. No BantAI call to Nano ID with a negative/zero length was found. Therefore several are **Probably Not Exploitable** in the current request paths, but the unresolved production graph should not be accepted silently.

**Recommended Fix:** Resolve them through compatible parent/patch upgrades, re-run the lockfile audit, and document any temporary exception with exact call-path evidence and an expiry date.

**Example Secure Approach:** Upgrade Next first, inspect the resulting Sharp/PostCSS graph, add an image-route regression test, and use lockfile overrides only when upstream compatibility and the resulting graph have been verified.

**Deployment Blocking:** No, unless still unresolved after the DEP-001 upgrade or exploitability testing shows an active path

### [DEP-004] Build and Development Toolchain Contains Multiple Advisory Matches

**Severity:** MEDIUM  
**Confidence:** High confidence  
**Category:** Build-chain dependencies / developer workstation security  
**Affected Component:** Web build and local development  
**Affected File(s):** `web/package.json`, `web/package-lock.json`  
**Affected Line(s):** `web/package.json:18-30` and related lockfile entries

**Description:** The full graph reports 21 vulnerable package nodes overall: 1 critical, 16 high, 2 moderate, and 2 low. Direct outdated build dependencies include `@cloudflare/vite-plugin@1.37.1`, `vite@8.0.13`, `vinext@0.0.50`, and `wrangler@4.92.0`; their transitive graph contains affected versions of `image-size`, `fast-uri`, `js-yaml`, `undici`, `ws`, and other tooling.

**Evidence:** The direct and transitive versions are locked with registry URLs and integrity hashes. Several advisories require a malicious development-server request, crafted repository/build input, proxy feature, WebSocket use, or a dependency API that BantAI does not directly call.

**Security Impact:** A compromised build input or exposed local development server can cause denial of service, request-routing confusion, file access, or other build-host impact. Build dependencies also execute with developer/CI permissions.

**Exploitability:** Mostly **Probably Not Exploitable** in the published worker, but **Possibly Relevant** to developer/CI environments. `image-size@2.0.2` is loaded by stable Vinext and currently has no published patched 2.x release for two high DoS advisories.

**Recommended Fix:** Patch direct tools within compatible lines (`vite` 8.3.x, Cloudflare plugin 1.54.x, reviewed Wrangler patch) and manually plan Vinext migration because the suggested fixed path may involve a beta/major change. Never use a blind forced audit fix.

**Example Secure Approach:** Update one build layer at a time in a branch, use a clean lockfile install, run build/lint/render tests, compare worker output, and keep local dev servers bound to loopback.

**Deployment Blocking:** No for runtime-only release, but must be tracked before enabling shared CI or exposed preview servers

### [DEP-005] Python Production Dependencies Are Not Reproducibly Locked or Fully Audited

**Severity:** MEDIUM  
**Confidence:** High confidence  
**Category:** Dependency hygiene / supply chain  
**Affected Component:** Detector, public API, companion  
**Affected File(s):** `backend/requirements.txt`, `backend/requirements-detector.txt`, `shared_platform/requirements.txt`, both Dockerfiles  
**Affected Line(s):** All requirement lines; `backend/Dockerfile:11-15`; `shared_platform/Dockerfile:4-5`

**Description:** Key packages are unpinned or range-pinned, including FastAPI, Uvicorn, Transformers, SentencePiece, Safetensors, Pydantic, SQLAlchemy, PyMySQL, Alembic, and Google GenAI. There is no Python lockfile or hash-locked requirements artifact. Docker builds can therefore resolve different transitive packages over time.

**Evidence:** The detector Dockerfile separately pins Torch but installs the remaining range-based file from the network. The current `.venv` passed `pip check`, but its versions differ from exact detector image declarations and are not proof of the eventual image contents. `pip-audit` is absent, so no complete Python advisory result was obtained.

**Security Impact:** Builds are not reproducible, a newly published incompatible or compromised transitive release can enter without a source change, and the release cannot currently be certified against known Python advisories.

**Exploitability:** **Needs Manual Verification.** This is a confirmed assurance gap, not a claim that a specific Python package is vulnerable.

**Recommended Fix:** Generate separate, reviewed, hash-pinned production lock files for the platform and detector from declared inputs; build exact images; produce an SBOM; scan the resolved image/package set with a maintained advisory database.

**Example Secure Approach:** Use `pip-tools`, Poetry, uv, or an equivalent resolver to compile exact versions with hashes for the target Python/Linux platform, then run `pip-audit` against the locked artifacts and scan the resulting container images. Preserve the frozen model versions.

**Deployment Blocking:** Yes for final dependency sign-off

### [API-002] Rate Limiting Is Proxy-Unaware, In-Memory, and Easy to Share or Bypass

**Severity:** MEDIUM  
**Confidence:** High confidence  
**Category:** API availability / abuse controls  
**Affected Component:** Public platform API behind Caddy  
**Affected File(s):** `shared_platform/app/main.py`, `shared_platform/Dockerfile`, `docker-compose.yml`, `deploy/Caddyfile`  
**Affected Line(s):** `main.py:126-195`; `shared_platform/Dockerfile:13`; `docker-compose.yml:74-118`; `deploy/Caddyfile:8-13`

**Description:** Non-detection rate-limit keys use `scope.client`. The production API is behind a separate Caddy container, while Uvicorn is not configured with a trusted proxy list. Uvicorn's documented default trusts forwarded headers only from `127.0.0.1`; the Caddy container source is not loopback. This can collapse users into one proxy-IP bucket. The buckets are process-local, reset on restart, and diverge across replicas.

**Evidence:** Auth requests are limited to 20 per path per five minutes using `client:path`. Detection routes instead hash Authorization, which is better scoped. Official Uvicorn proxy setting reference: <https://www.uvicorn.org/settings/>.

**Security Impact:** An unauthenticated actor can repeatedly consume the shared login/register/availability bucket and deny those operations to other users. Horizontal scaling can instead let attackers distribute requests across independent buckets.

**Exploitability:** **Likely Relevant** in the declared Compose topology. The exact ASGI client value should be confirmed in the deployed network before remediation.

**Recommended Fix:** Configure an explicit trusted-proxy boundary and use a centralized rate-limit store. Key unauthenticated account operations by a carefully parsed trusted client address plus normalized account identifier, and key authenticated operations by account/device identifiers.

**Example Secure Approach:** Accept forwarded client addresses only from the known Caddy network/address, normalize them with a well-tested proxy middleware, store sliding-window counters in Redis or the database, and add tests for multiple users behind one proxy and multiple app instances.

**Deployment Blocking:** Yes

### [API-003] Private Detector Does Not Cap Email Body Length

**Severity:** MEDIUM  
**Confidence:** High confidence  
**Category:** Resource exhaustion / input validation  
**Affected Component:** Private detector email and hybrid endpoints  
**Affected File(s):** `backend/server.py`, `backend/email_model.py`  
**Affected Line(s):** `backend/server.py:141-147,174-180`; preprocessing/tokenization paths in `backend/email_model.py`

**Description:** `EmailAnalysisRequest.body` has a minimum length but no maximum. Hybrid requests inherit the same field. The public gateway schemas cap user email bodies, but the private detector itself accepts arbitrarily large JSON bodies from any caller holding the internal key.

**Evidence:** Other detector fields use explicit maximums, and a separate pasted-message endpoint has a 10,000-character maximum. Tokenization must inspect the supplied text before applying the 512-token model window.

**Security Impact:** A compromised internal client, leaked service key, or future network exposure could cause large allocations, prolonged tokenization, CPU exhaustion, or worker unavailability.

**Exploitability:** **Possibly Relevant.** The production detector is on private networks and authenticated, materially reducing exposure.

**Recommended Fix:** Add detector-side request-byte and per-field limits independent of the public gateway; reject oversized requests before tokenization.

**Example Secure Approach:** Install a streaming request-size middleware on the detector, mirror the public 50,000-character body contract, and add oversized/chunked-body tests directly against detector endpoints.

**Deployment Blocking:** No

### [AUTH-001] Accounts Are Activated Without Email Ownership Verification

**Severity:** MEDIUM  
**Confidence:** High confidence  
**Category:** Authentication lifecycle  
**Affected Component:** Public account registration  
**Affected File(s):** `shared_platform/app/main.py`, `shared_platform/tests/test_platform.py`  
**Affected Line(s):** `main.py:338-365`; registration lifecycle test

**Description:** Registration immediately creates an `ACTIVE` account for the supplied address. No verification, password-reset, or account-recovery flow exists; the absence is also asserted by tests.

**Evidence:** `status=UserStatus.ACTIVE` is set before any ownership challenge. The route returns successful account creation after commit.

**Security Impact:** An attacker can squat on another person's email address, create misleading identity records, and prevent the real owner from registering. Future email-based features would inherit a false ownership assumption. Lost passwords have no secure recovery path.

**Exploitability:** **Confirmed.** It requires only knowledge of an unused email address; no email account access is needed.

**Recommended Fix:** Introduce expiring, single-use verification tokens and a rate-limited recovery flow. Avoid revealing whether reset/verification addresses exist.

**Example Secure Approach:** Create accounts in a pending state, store only hashed verification tokens with expiry and attempt limits, activate after successful challenge, and revoke all existing sessions after password recovery.

**Deployment Blocking:** No for a deliberately closed pilot; Yes before general public account registration

### [ML-001] Email Weight Shards and Tokenizer Are Not Integrity-Pinned

**Severity:** MEDIUM  
**Confidence:** High confidence  
**Category:** ML supply chain / artifact integrity  
**Affected Component:** XLM-R email model  
**Affected File(s):** `backend/email_model.py`, `scripts/verify_models.py`, `backend/Dockerfile`  
**Affected Line(s):** `email_model.py:78-101`; `verify_models.py:92-110`; `backend/Dockerfile:19-25`

**Description:** The email deployment contract verifies `config.json` and calibration constants, and Safetensors avoids Python pickle execution. However, the two weight shards, index, tokenizer, and tokenizer configuration are checked only for expected presence/readability, not against frozen hashes.

**Evidence:** The RF Joblib artifact is SHA-256 verified before deserialization (`backend/bantai_inference.py:26,94-96`; `verify_models.py:144-151`). No equivalent hashes cover the email weights/tokenizer copied into the detector image.

**Security Impact:** An attacker or build error able to replace local model files could silently alter classifications, degrade accuracy, or induce resource problems while the configuration/calibration check continues to pass. Safetensors limits code-execution risk but not model tampering.

**Exploitability:** **Possibly Relevant.** Exploitation requires write access to build inputs, artifact storage, or the image pipeline.

**Recommended Fix:** Record and verify SHA-256 hashes for every deployed email artifact before image build and again at detector startup; restrict artifact write permissions and provenance.

**Example Secure Approach:** Add an immutable signed manifest containing relative path, size, and SHA-256 for each required file, verify the manifest in CI/build/startup, and reject any mismatch without downloading replacements.

**Deployment Blocking:** No, but should be completed before a high-assurance release

### [CONFIG-002] Web Worker Does Not Set a Browser Security-Header Baseline

**Severity:** MEDIUM  
**Confidence:** High confidence  
**Category:** Frontend hardening / clickjacking  
**Affected Component:** Public web application  
**Affected File(s):** `web/worker/index.js`, `web/worker/api-proxy.js`, `web/.openai/hosting.json`, `web/app/layout.jsx`  
**Affected Line(s):** `web/worker/index.js:10-27`; response paths in `api-proxy.js:29-42`

**Description:** The worker returns API proxy, image, and application responses without adding a Content Security Policy, `frame-ancestors`/`X-Frame-Options`, `X-Content-Type-Options`, Referrer Policy, Permissions Policy, or HSTS. Caddy sets some headers for the separate API origin, not for the Cloudflare-hosted web frontend.

**Evidence:** No response-header wrapper or deployment header configuration was found in the web tree. External edge configuration was unavailable and could mitigate this finding.

**Security Impact:** The account UI may be framed for clickjacking, and the browser has fewer controls against content injection, MIME confusion, referrer leakage, and unnecessary powerful features.

**Exploitability:** **Confirmed in repository configuration; Needs Manual Verification** at the deployed Cloudflare edge.

**Recommended Fix:** Set a tested header policy for every web response, with route-specific exceptions if required. Start with anti-framing and `nosniff`; deploy CSP in report-only mode before enforcement.

**Example Secure Approach:** Wrap worker responses and clone/set headers: CSP with `default-src 'self'`, explicit connect/style/font/image sources, `frame-ancestors 'none'`, `object-src 'none'`, and `base-uri 'self'`; add HSTS only on HTTPS production; add an automated rendered-response header test.

**Deployment Blocking:** No, but Priority 1 before public release

### [LOG-001] Security-Event Audit Logging Is Insufficient

**Severity:** MEDIUM  
**Confidence:** High confidence  
**Category:** Detection and response / logging  
**Affected Component:** Public API and detector operations  
**Affected File(s):** `shared_platform/Dockerfile`, `backend/Dockerfile`, `backend/START_BANTAI_V1_1.ps1`, application routes  
**Affected Line(s):** `shared_platform/Dockerfile:13`; `backend/Dockerfile:38`; `START_BANTAI_V1_1.ps1:71`

**Description:** Both server commands disable Uvicorn access logs, and no structured security audit event system was found for failed logins, rate-limit triggers, pairing, token revocation, admin role/status actions, cloud failures, or artifact-integrity failures.

**Evidence:** Privacy tests correctly prevent raw email-body logging, but there is no complementary privacy-safe event trail for incident detection and administrative accountability.

**Security Impact:** Brute-force attempts, account abuse, administrator misuse, service-key probing, and repeated provider failures may not be detectable or attributable. Incident response and forensic confidence are reduced.

**Exploitability:** Not an exploit by itself; it increases attacker dwell time and weakens response.

**Recommended Fix:** Add structured, minimal security events with request correlation, actor/account/device pseudonymous identifiers, action, outcome, source network metadata, and timestamp. Never log secrets, tokens, raw email bodies, browsing paths, or cloud payloads.

**Example Secure Approach:** Emit allowlisted JSON events to a protected append-only sink with retention/access policy; hash sensitive identifiers with a separate logging key; alert on rate-limit bursts, repeated failures, and admin changes.

**Deployment Blocking:** No

### [AUTH-002] Account Enumeration Is Available by Design

**Severity:** LOW  
**Confidence:** High confidence  
**Category:** Authentication information disclosure  
**Affected Component:** Registration APIs  
**Affected File(s):** `shared_platform/app/main.py`  
**Affected Line(s):** `main.py:338-343,368-372`

**Description:** `/api/v1/auth/email-availability` explicitly returns whether an address exists, while duplicate registration returns a distinct conflict message.

**Evidence:** No authentication is required; the generic login error does not offset the explicit availability oracle.

**Security Impact:** Attackers can build a list of BantAI account addresses for phishing or credential-stuffing targeting. Rate limiting constrains but does not remove the leak.

**Exploitability:** **Confirmed.** It requires repeated requests with candidate email addresses.

**Recommended Fix:** Remove the public availability oracle or return a uniform registration response. If product requirements retain it, apply stronger abuse controls and accept the documented privacy tradeoff.

**Example Secure Approach:** Always return “If this address can be registered, instructions will be sent” and complete verification out of band without disclosing account existence.

**Deployment Blocking:** No

### [EXT-001] Extension Popup Loads Google Fonts Remotely

**Severity:** LOW  
**Confidence:** High confidence  
**Category:** Browser extension privacy / supply chain  
**Affected Component:** Popup UI  
**Affected File(s):** `extension/popup/popup.html`, `extension/manifest.json`  
**Affected Line(s):** `popup.html:7-9`; `manifest.json:28-30`

**Description:** The popup loads a stylesheet from Google Fonts and permits Google font/style origins in extension-page CSP.

**Evidence:** No remote JavaScript is allowed, so this is not remote-code execution. It is an external request each time font resources are needed.

**Security Impact:** The font provider can observe network metadata associated with extension-popup use; availability and presentation depend on a third party; CSP is broader than necessary.

**Exploitability:** **Confirmed privacy/hardening issue**, low impact.

**Recommended Fix:** Bundle the required WOFF2 files and CSS locally, or use a system font stack, then remove remote style/font CSP sources.

**Example Secure Approach:** Package only reviewed local fonts and keep `style-src 'self'; font-src 'self'`.

**Deployment Blocking:** No

### [CONFIG-003] Container Builds and Runtime Controls Are Not Fully Hardened

**Severity:** LOW  
**Confidence:** High confidence  
**Category:** Container supply chain / defense in depth  
**Affected Component:** Docker deployment  
**Affected File(s):** `backend/Dockerfile`, `shared_platform/Dockerfile`, `docker-compose.yml`  
**Affected Line(s):** Both Dockerfiles line 1; `docker-compose.yml:3,21`; service definitions

**Description:** Base/service images use mutable tags (`python:3.12-slim`, `caddy:2.10-alpine`, `mysql:8.4`) rather than digests. Compose does not set read-only root filesystems, dropped capabilities, `no-new-privileges`, resource limits, or explicit tmpfs mounts.

**Evidence:** Application containers do correctly run as UID 10001 and the database/detector are not host-published. Those controls reduce, but do not eliminate, container escape and resource-abuse impact.

**Security Impact:** Rebuilds can silently consume different image contents, and a compromised process retains more container capabilities/write surface than necessary. Unbounded resource consumption can affect neighboring services.

**Exploitability:** **Possibly Relevant** only after a process compromise or malicious dependency/build event.

**Recommended Fix:** Pin reviewed image digests, scan images, set least-privilege runtime controls, and define CPU/memory/process limits after ML performance testing.

**Example Secure Approach:** Keep the human-readable version tag in documentation but deploy a digest-pinned image; apply `security_opt: no-new-privileges:true`, `cap_drop: [ALL]`, read-only filesystem where compatible, dedicated writable volumes/tmpfs, and service-specific resource ceilings.

**Deployment Blocking:** No

### [REPO-001] Tracked Legacy and Template Trees Increase Accidental-Deployment Risk

**Severity:** LOW  
**Confidence:** High confidence  
**Category:** Repository hygiene / release scope  
**Affected Component:** `BantAI_v1_0_0_Codex_Ready_With_Local_Models/`, `Sneat-Template/`  
**Affected File(s):** Legacy server/extension and template dependency tree  
**Affected Line(s):** Entire named directories

**Description:** The repository contains a launchable legacy v1.0 detector/extension with older contracts and unauthenticated detector routes if run directly, plus roughly 2,243 tracked Sneat template files and an independent Yarn dependency graph. Neither is referenced by the active production Dockerfiles.

**Evidence:** The active project invariant tests reject the legacy model path, and current Dockerfiles copy selected active directories. The legacy/template code still appears to a human or automated packaging process as plausible product code.

**Security Impact:** Operators may start or package the wrong service, scanners and maintainers may miss the authoritative path, and unused dependency code expands governance/licensing/supply-chain surface.

**Exploitability:** **Probably Not Exploitable** in the declared active deployment; risk arises from release-process mistakes.

**Recommended Fix:** Define and enforce an allowlisted release manifest. Move archival code outside the production repository/build context or clearly quarantine it with non-runnable documentation. Inventory the template license before distribution.

**Example Secure Approach:** CI should fail if production artifacts include either directory; build from a minimal context containing only active code and required frozen artifacts.

**Deployment Blocking:** No

### [CODE-001] Large Orchestration Files and Broad Exception Handling Raise Defect Risk

**Severity:** LOW  
**Confidence:** High confidence  
**Category:** Maintainability / reliability  
**Affected Component:** Extension extractors, service worker, public API, companion, cloud adapters  
**Affected File(s):** `extension/content/yahoo-extractor.js`, `extension/background/service-worker.js`, `shared_platform/app/main.py`, `extension/content/outlook-extractor.js`, `backend/server.py`, `backend/companion.py`, `shared_platform/app/cloud.py`  
**Affected Line(s):** Whole-file design; representative catches at `cloud.py:218,266,351`, `companion.py:154,171,299`, `server.py:1280`

**Description:** Several security-sensitive files contain thousands of lines and combine extraction, state management, networking, caching, rendering/orchestration, and error recovery. Broad `except Exception` and silent `pass` branches are present in recovery code.

**Evidence:** Approximate large-file sizes observed include Yahoo extractor ~4,700 lines, service worker ~3,300 lines, public API ~2,500 lines, Outlook extractor ~1,800 lines, and detector server ~1,100 lines.

**Security Impact:** Review coverage is harder to sustain; provider DOM changes, concurrency bugs, stale state, and privacy regressions can hide in complex control flow. Broad catches can convert programming errors into generic unavailability without a diagnosable event.

**Exploitability:** Not a standalone vulnerability.

**Recommended Fix:** After security blockers, separate cohesive modules and typed contracts; narrow exceptions to expected failures; retain privacy-safe telemetry and regression tests around behavior before refactoring.

**Example Secure Approach:** Extract the rate limiter, account routes, cloud routes, activity routes, and admin routes into tested routers/services; split each provider extractor into selectors, parsing, validation, and state-machine modules.

**Deployment Blocking:** No

### [TEST-001] Security-Sensitive Negative and Browser Scenarios Lack Automated Coverage

**Severity:** INFORMATIONAL  
**Confidence:** High confidence  
**Category:** Testing assurance  
**Affected Component:** Cross-component security tests  
**Affected File(s):** `tests/`, `shared_platform/tests/`, `web/tests/`  
**Affected Line(s):** Test suite scope

**Description:** Existing tests strongly cover frozen model contracts, fusion rules, privacy-safe storage, authorization, activity ownership, request size, cloud failure, redaction utilities, prompt injection, URL scope, and extension invariants. Missing or incomplete automated scenarios include server-side redaction on `/cloud-review/email`, trusted-proxy rate-limit identity, multi-process limits, chunked oversized detector bodies, security headers, account enumeration/verification lifecycle, session fixation/cookie rotation, malicious extension message senders, and real Gmail/Outlook/Yahoo/Chrome behavior.

**Evidence:** All executed suites passed, but no tests directly exercise the highlighted boundaries. No CI/browser automation definition was found.

**Security Impact:** Regressions can enter without failing the current suite, especially at deployment and browser boundaries.

**Exploitability:** Not applicable.

**Recommended Fix:** Add focused negative tests with synthetic data after remediation. Keep real LLM calls prohibited in automated tests.

**Example Secure Approach:** Use fake providers to assert redacted payloads, a two-proxy/multi-client ASGI harness for limits, response-header assertions against the built worker, and Playwright/Chrome extension tests with sanitized fixtures.

**Deployment Blocking:** No

### [OPS-001] Repository Lacks a Production Security Gate and Recovery Automation

**Severity:** INFORMATIONAL  
**Confidence:** High confidence  
**Category:** Operational readiness  
**Affected Component:** CI/CD, backups, release governance  
**Affected File(s):** Repository-wide; Docker volumes and scripts  
**Affected Line(s):** No `.github/workflows` or equivalent CI pipeline found; `docker-compose.yml:29-30,120-123`

**Description:** No repository CI/CD configuration was found to enforce tests, dependency audits, secret scanning, SBOM/container scanning, migration checks, or artifact hashes. MySQL uses a persistent volume, but no backup schedule, restore test, encryption policy, or retention configuration is present. Rollback model archives exist, but full application/database rollback is not automated.

**Evidence:** Local verification scripts are useful and passed, but are manually invoked. External organizational controls were not available and may partially mitigate this finding.

**Security Impact:** Known-vulnerable packages can enter releases, backup failure may remain unnoticed, and deployment rollback may be slow or unsafe after an incident.

**Exploitability:** Not applicable.

**Recommended Fix:** Establish a protected release pipeline and documented, tested operational runbooks.

**Example Secure Approach:** Gate merges on unit/invariant/web tests, lockfile and Python audits, secret/SBOM/image scans, model manifest verification, migration dry runs, and artifact signing; schedule encrypted database backups and quarterly restore drills.

**Deployment Blocking:** No, but backup/restore evidence is required before storing production user data

## 6. Dependency Audit

### Vulnerable Dependencies

The following table lists each package node identified by the JavaScript advisory review. “Fixed version” is the minimum known fixed version where confirmed; for aggregator/parent packages it is the compatible parent version suggested by the audit or “resolve child” where the parent itself is not the vulnerable code. Re-scan on the release date because advisories change.

| Package | Installed version | Severity | Advisory/CVE | Affected versions | Fixed version / path | Relevance |
|---|---:|---|---|---|---|---|
| `next` | 16.2.6 | Critical | GHSA-p293-qw3h-jr36 / CVE-2026-75604; GHSA-2xp9-vwfh-vxw4 | `>=16.0.0 <16.3.3` | `16.3.3`+ | Needs Manual Verification on Cloudflare; confirmed for qualifying Next hosts |
| `react-server-dom-webpack` | 19.2.6 | High | GHSA-wx67-qw84-cm4g / CVE-2026-44907 | `>=19.2.0 <19.2.8` | `19.2.8`+ | Likely Relevant; RSC build is active |
| `sharp` | 0.34.5 | High | GHSA-f88m-g3jw-g9cj; GHSA-rgj7-g3m4-5g8c | Audit-reported range includes 0.34.5 | Resolve through patched Next/Sharp graph | Possibly Relevant to image route; Cloudflare transform changes path |
| `postcss` | 8.4.31 (also safe/newer 8.5.14 node) | Moderate | GHSA-qx2v-qp2m-jg93; GHSA-6g55-p6wh-862q; GHSA-fxqj-rqcc-2cmp; GHSA-r28c-9q8g-f849 | Audit-reported range includes 8.4.31 | Resolve to current patched 8.x through parent | Probably Not Exploitable; repository-controlled CSS build input |
| `nanoid` | 3.3.12 | High | GHSA-28wg-ghj8-5hjv; GHSA-2v37-7h3g-55p8 | Audit-reported range includes 3.3.12 | Patched compatible release through parent | Probably Not Exploitable; affected API use not found |
| `baseline-browser-mapping` | 2.10.30 | Moderate | GHSA-w5vr-8v7q-w6rv | Audit-reported range includes 2.10.30 | Patched current release through Browserslist | Probably Not Exploitable; build metadata only |
| `@cloudflare/vite-plugin` | 1.37.1 | High (aggregate) | Inherits Vite/Miniflare/Wrangler child advisories | Parent graph at 1.37.1 resolves vulnerable children | Audit suggested 1.54.9 | Build/dev exposure |
| `vite` | 8.0.13 | High | GHSA-v6wh-96g9-6wx3; GHSA-fx2h-pf6j-xcff | Audit-reported range includes 8.0.13 | Audit suggested 8.3.0 | Possibly Relevant if dev/preview server exposed |
| `vinext` | 0.0.50 | High (aggregate) | Via `image-size`: GHSA-w3rx-r6r6-pgpr / CVE-2025-71330; GHSA-5p2g-fcmc-qvqq / CVE-2025-71329 | `image-size <=2.0.2` | No published patched `image-size` 2.x at audit time; review Vinext migration | Build/startup loaded; exploit needs crafted supported image input |
| `image-size` | 2.0.2 | High | GHSA-w3rx-r6r6-pgpr; GHSA-5p2g-fcmc-qvqq | `<=2.0.2` | No published patched release at audit time | Possibly Relevant; Vinext dependency, no untrusted repository image upload found |
| `wrangler` | 4.92.0 | High (aggregate) | Inherits Miniflare/Undici/ws/tooling advisories | Parent graph at 4.92.0 resolves vulnerable children | Audit suggested 4.131.2 | Local deploy/dev tooling |
| `miniflare` | 4.20260515.0 | High (aggregate) | Inherits affected Undici/ws paths | Installed graph is audit-flagged | Upgrade through Wrangler/Cloudflare plugin | Local simulation only |
| `undici` | 7.24.8 | High (aggregate) | Includes GHSA-vxpw-j846-p89q, GHSA-vmh5-mc38-953g, GHSA-pr7r-676h-xcf6, GHSA-p88m-4jfj-68fv, GHSA-35p6-xmwp-9g52 and later 2026 set | Multiple ranges include 7.24.8 | At least 7.28.0 for GHSA-35p6; use latest compatible fully patched 7.x | Possibly Relevant to local tooling/proxy features; exact APIs vary |
| `ws` | 8.18.0 | High | npm audit/GitHub ws advisory set affecting `<8.20.1` | `<8.20.1` | `8.20.1`+ | Primarily dev/Miniflare WebSocket path |
| `fast-uri` | 3.1.2 | High | GHSA-q3j6-qgpj-74h6, GHSA-4c8g-83qw-93j6, GHSA-v2hh-gcrm-f6hx, GHSA-fph4-wmhf-6fwf, GHSA-58mr-gqgx-xq4g, GHSA-qw65-cvwx-89v3 and related host-confusion set | Multiple ranges include 3.1.2 | `3.1.7`+ for the newest reviewed set | Probably Not Exploitable; transitive schema tooling, no security decision using its URI parser found |
| `js-yaml` | 4.1.1 | High | GHSA-h67p-54hq-rp68 / CVE-2026-53550; GHSA-pm4m-ph32-ghv5 and related parser advisories | Audit-reported ranges include 4.1.1 | Current compatible patched 4.x | Build/config parsing; crafted repository input required |
| `fflate` | 0.7.4 | Moderate | GHSA-px8p-9vwx-vf98 / CVE-2026-45820 | Through 0.8.2 | 0.8.3+ | Probably Not Exploitable; transitive archive-processing build path |
| `brace-expansion` | 5.0.6 and 1.1.14 | High | GHSA-3jxr-pgh4-4wmm; GHSA-mh99-2m3m-xw37; GHSA-rgw5-8g43-7pr5 | Audit-reported ranges include both nodes | Patched compatible releases through parents | Build/glob input; probably not remote runtime |
| `browserslist` | 4.28.2 | High | GHSA-c83w-8q8p-gp5w; GHSA-73r2-pq3x-2wqv | Audit-reported range includes 4.28.2 | Current patched 4.x | Build metadata only |
| `esbuild` | 0.27.3 | Low | GHSA-g7r5-x7cr-vm3v | Audit-reported range includes 0.27.3 | Patched compatible release through Vite | Dev server only; bind to loopback |
| `@babel/core` | 7.29.0 | Low | GHSA-4x5r-pxfx-6jf8 | Audit-reported range includes 7.29.0 | Patched current 7.x | Build-time parser; repository-controlled source |

Direct advisory references for the release-blocking findings are included in DEP-001 and DEP-002. For the fast-moving transitive set, the exact release lockfile must be re-scanned rather than treating this table as a permanent allowlist.

### Outdated Dependencies

| Package | Current | Recommended target | Reason |
|---|---:|---:|---|
| `next` | 16.2.6 | Reviewed 16.3.x, at least 16.3.3 | Critical security fixes; align `eslint-config-next` |
| `react`, `react-dom`, `react-server-dom-webpack` | 19.2.6 | Matched supported patch set; RSDW at least 19.2.8 | RSC security fix and compatibility |
| `vite` | 8.0.13 | 8.3.x after compatibility test | Security fixes without a major jump |
| `@cloudflare/vite-plugin` | 1.37.1 | 1.54.x after worker regression test | Pulls newer toolchain graph |
| `wrangler` | 4.92.0 | Reviewed 4.131.x | Transitive advisory remediation |
| `vinext` | 0.0.50 | Manual migration evaluation; do not force a beta/major upgrade | Stable line still carries unpatched `image-size`; compatibility risk is high |
| `@tailwindcss/postcss`, `tailwindcss` | 4.2.1 | Compatible 4.3.x | Maintenance and transitive graph refresh |
| `@vitejs/plugin-react` | 6.0.2 | Compatible 6.1.x | Maintenance within major |
| `@vitejs/plugin-rsc` | 0.5.26 | Compatible 0.5.x patch | RSC compatibility/security maintenance |
| `eslint` | 9.39.4 | Stay on supported 9.x unless ESLint 10 migration is planned | Major upgrade is not required for this security fix set |

### Dependency Hygiene Issues

- `web/package-lock.json` is lockfile v3; inspected registry packages resolve from the npm registry and include integrity hashes. This is a positive control.
- Install scripts are present for `fsevents`, `sharp`, `unrs-resolver`, `workerd`, and `esbuild`. These are expected packages, but install scripts execute during dependency installation and should run only in isolated CI with a clean lockfile.
- No active package was found installed directly from an arbitrary Git repository. No `curl | bash` installation pattern was found in active deployment scripts.
- Python requirements lack a lockfile and hashes (DEP-005). The active Docker base images are not digest-pinned (CONFIG-003).
- ML weights are deliberately local and ignored; no runtime model download is enabled. RF hash verification is strong; email artifact hashing is incomplete (ML-001).
- The `Sneat-Template` Yarn graph is not part of the active app but remains tracked and unaudited dynamically. Treat it as excluded from production, not as a clean dependency set.
- No automatic dependency update was performed during this audit.

## 7. Browser Extension Security

### Positive observations

- Manifest V3 is used with a service worker and a declared minimum Chromium version.
- Permissions are limited to `scripting`, `storage`, and `tabs`; no `<all_urls>` permission exists.
- Host permissions are scoped to supported webmail providers and one configured API origin.
- No `externally_connectable` or `web_accessible_resources` entry exists. No page-to-extension external messaging surface was found.
- No active `eval`, `new Function`, dynamically loaded JavaScript, `innerHTML`, or remote script was found. Popup rendering uses safe text assignment.
- Extractors are provider-specific and the project tests enforce exact `tab.url` scanning, supported email providers, no email-link crawling, and no URL downgrade of email findings.
- The background worker restricts credential storage access to trusted contexts. Raw email bodies are not persisted in extension storage; tests enforce no raw-body logging.
- The API key remains backend-only. The extension uses paired-device authentication, not the provider key.

### Risks

- The checked-in endpoint/CSP is local HTTP, so it is not a valid production artifact (CONFIG-001).
- Remote Google Fonts add privacy and supply-chain surface (EXT-001).
- Real browser and malicious-page interaction tests were not performed (TEST-001). Although no external messaging surface was found, content-script inputs remain hostile DOM data and must continue to be validated/minimized.

## 8. Production Configuration Review

| Area | Assessment |
|---|---|
| HTTPS | Caddy listens on 80/443 and sets HSTS for the API. The web proxy rejects non-HTTPS upstreams except explicit loopback. Release extension configuration is not yet HTTPS (CONFIG-001). |
| CORS | Public API uses configured explicit origins with credentials; private detector uses explicit configured web origins and no credentials. No wildcard production origin was found. |
| Cookies/CSRF | Session cookie is HttpOnly, Secure by default/forced true in Compose, SameSite Lax. CSRF uses a readable double-submit cookie and a session-bound hashed header token. State-changing web routes use CSRF dependencies. |
| Passwords/tokens | Argon2 with explicit memory/time/parallelism parameters; opaque tokens generated with `secrets` and stored as hashes. Logout/suspension/revocation behavior is tested. |
| Secrets | Required production values are environment substitutions. Current `.env` files are ignored; no confirmed committed production secret was found in accessible history. Values were not reproduced. Rotation and external secret-manager configuration were not available. |
| Debug/errors | No debug mode or user-visible stack-trace path was found. Cloud adapters convert provider failures to a generic unavailable result. Broad catches reduce diagnostics (CODE-001). |
| Network isolation | Database and detector are internal/exposed-only in Compose; Caddy is the only host-published service. Detector requires an internal key. |
| Headers | API Caddy adds HSTS, `nosniff`, no-referrer, and removes Server. Web frontend headers/anti-framing are absent from repository config (CONFIG-002). |
| Request limits | Public API/Caddy have ~256 KiB ceilings and schema limits. Private detector email input remains unbounded (API-003). |
| Rate limits | Present, but proxy/scaling design is unsafe (API-002). |
| Logging | Raw sensitive content is intentionally excluded. Privacy-safe security audit events are insufficient (LOG-001). |
| Containers | App processes are non-root and networks are separated; digest pinning and further runtime controls are missing (CONFIG-003). |

## 9. Code Quality Findings

Maintainability findings are separate from confirmed security vulnerabilities:

- Large, multi-responsibility service worker, provider extractors, and API modules make review and safe change difficult (CODE-001).
- Broad exception handling often implements availability/privacy fallbacks, but unexpected defects can be silently collapsed into `UNAVAILABLE` without security telemetry.
- The repository contains substantial dead/legacy release surface not referenced by the active application (REPO-001).
- Hard-coded frozen thresholds, model identities, and popup duration are intentional project contracts and are protected by tests; they are not reported as generic “magic values.”
- URL and email orchestration contains strong explicit invariants: exact address-bar scanning, independent signals, cloud gating, deduplication, redaction, and non-guarantee language.
- Database code primarily uses parameterized SQLAlchemy expressions. Raw SQL observed in migrations/readiness is static, not built from request values. Sessions are dependency-managed; constraints/ownership tests cover core user data paths.
- No file-upload endpoint was identified. Explicit feedback/report bodies are database-encrypted and are not exposed in administrator responses; export routes omit email bodies.

## 10. Testing Gaps

The existing suite is meaningful and passed, but production security coverage should add:

1. A route-level test proving `/api/v1/cloud-review/email` redacts synthetic OTP, phone, email, card, and account identifiers at the final provider boundary.
2. Trusted-proxy and rate-limit tests for multiple clients behind Caddy, forged forwarding headers, multiple app workers, and restart behavior.
3. Direct detector tests for oversized Content-Length, chunked bodies, very long Unicode, pathological tokenizer input, and concurrency/resource ceilings.
4. Web response tests for CSP, anti-framing, HSTS-on-production, Referrer Policy, Permissions Policy, and `nosniff`.
5. Account verification, generic recovery responses, single-use/expiry, session invalidation, and enumeration resistance.
6. Extension integration tests in actual Chrome/Edge with sanitized Gmail, Outlook, and Yahoo fixtures; hostile DOM changes; forged sender/header UI; worker restart; and popup timing.
7. Dependency and container scans against clean release artifacts, not only a developer environment.
8. Migration upgrade/rollback tests against MySQL 8.4 with least-privilege credentials and realistic concurrency.
9. Model artifact tamper tests for every email weight/tokenizer file after a signed manifest is introduced.
10. Backup restore, key rotation, admin bootstrap/removal, and incident audit-log tests.

## 11. Deployment Blockers

### BLOCKER-01

**Description:** Direct Next.js version is within two critical RCE advisory ranges.  
**Affected component:** Web application dependency graph.  
**Required remediation:** Upgrade to an audited compatible fixed release, rebuild from a clean lockfile, re-scan, and validate the generated Cloudflare/Vinext runtime and image route.

### BLOCKER-02

**Description:** React Server Components package has a high-severity DoS advisory.  
**Affected component:** Web RSC build/runtime.  
**Required remediation:** Align React/RSC packages on a fixed compatible patch set and re-test the built worker.

### BLOCKER-03

**Description:** The public email cloud-review endpoint can forward unredacted caller content to the third-party LLM.  
**Affected component:** Public API/cloud privacy boundary.  
**Required remediation:** Enforce redaction/minimization immediately before every provider call and add a route-level regression test.

### BLOCKER-04

**Description:** The checked-in extension release artifact is configured for local HTTP loopback.  
**Affected component:** Chromium extension packaging.  
**Required remediation:** Generate, verify, and package a release-specific HTTPS endpoint/permission/CSP configuration; fail release builds on loopback mode.

### BLOCKER-05

**Description:** Public abuse limits are keyed to a likely shared proxy address and are not consistent across instances.  
**Affected component:** Public API/Caddy topology.  
**Required remediation:** Establish a trusted proxy configuration and centralized, identity-aware rate limiting; verify it in the deployed topology.

### BLOCKER-06

**Description:** The resolved Python production dependency set has no lock/hashes and no complete vulnerability scan.  
**Affected component:** Platform and detector container supply chain.  
**Required remediation:** Produce exact hash-pinned locks/SBOMs for both images and pass an advisory/container scan on the final artifacts.

## 12. Recommended Remediation Order

### Priority 0 — Must Fix Before Deployment

1. DEP-001: patch Next.js and validate deployed runtime exploitability.
2. API-001: enforce backend redaction on the direct email cloud-review route.
3. CONFIG-001: create a production HTTPS extension artifact.
4. DEP-002: patch and align the React Server Components stack.
5. API-002: correct trusted-proxy and centralized rate limiting.
6. DEP-005: lock and audit the exact Python production image dependencies.

### Priority 1 — Fix Before Public Release

1. CONFIG-002: enforce web anti-framing and security headers.
2. AUTH-001: add email ownership verification and secure recovery before open registration.
3. DEP-003: clear or time-bound all production JavaScript advisory findings.
4. ML-001: hash/sign all email model/tokenizer artifacts.
5. API-003: cap private detector body/request sizes.
6. LOG-001: add privacy-safe security audit events.

### Priority 2 — Recommended Hardening

1. CONFIG-003: pin container digests and add runtime least-privilege/resource controls.
2. AUTH-002: eliminate or formally accept the email enumeration oracle.
3. EXT-001: bundle fonts locally and narrow extension CSP.
4. TEST-001: add negative, proxy, header, detector-resource, and real-browser coverage.
5. DEP-004: update the build toolchain deliberately and document any no-fix Vinext/image-size exception.

### Priority 3 — Maintenance

1. CODE-001: decompose large orchestration files behind existing behavioral tests.
2. REPO-001: quarantine/remove unused legacy/template code from release scope.
3. OPS-001: add CI security gates, signed artifacts, SBOMs, backup/restore drills, and application/database rollback procedures.

## 13. Final Deployment Checklist

- [ ] No Critical vulnerabilities
- [ ] High-severity vulnerabilities addressed
- [ ] Production secrets stored securely
- [x] Debug mode disabled
- [x] Authentication reviewed
- [x] Authorization reviewed
- [x] API access controls verified
- [ ] Dependency vulnerabilities reviewed and resolved/accepted with evidence
- [x] Browser extension permissions minimized
- [ ] HTTPS enforced in the release extension artifact
- [ ] Security headers configured for the web frontend
- [x] CORS restricted
- [ ] Database production privileges reviewed on the live target
- [ ] Security-event logging implemented and reviewed
- [x] Sensitive information excluded from application logs by code/tests
- [ ] ML model loading fully integrity-secured
- [ ] Backups configured and restore-tested
- [ ] Full application/database rollback procedure available and tested
- [ ] Security testing completed on final production artifacts and actual Chrome/Edge

Checked items mean the repository contains direct evidence for that control; they do not substitute for live-environment validation.

## 14. Final Assessment

**Overall Risk:** Critical

**Deployment Recommendation:** **NOT READY FOR DEPLOYMENT**

**Top 5 issues to address:**

1. Upgrade `next@16.2.6` out of both critical RCE advisory ranges and test the real generated worker/image route.
2. Enforce server-side redaction on `/api/v1/cloud-review/email` immediately before the provider boundary.
3. Generate and gate a production HTTPS extension endpoint/permission/CSP configuration.
4. Upgrade the matched React Server Components stack out of CVE-2026-44907.
5. Correct proxy-aware centralized rate limiting and finish a reproducible Python dependency scan/lock before release sign-off.

No source-code fixes, dependency updates, migrations, deletions, or production-configuration changes were performed during this audit.
