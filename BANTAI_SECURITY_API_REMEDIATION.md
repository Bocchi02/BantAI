# BantAI Security & API Remediation

## 1. Baseline

Original risk: **CRITICAL**

Original recommendation: **SECURITY REMEDIATION REQUIRED**

This remediation was performed against the findings in
`BANTAI_SECURITY_API_AUDIT.md`. The frozen URL RF model, XLM-R model,
thresholds, calibration, preprocessing, fusion behavior, datasets, and
non-blocking URL enforcement state were not changed. No external system was
attacked, no production deployment was performed, and no real credentials or
private email content were used.

## 2. Finding Disposition

| ID | Original Severity | Current Status | Summary |
|---|---|---|---|
| DEP-SEC-001 | CRITICAL | FIXED | Platform lock regenerated at cryptography 50.0.1 with a compatible authoritative constraint; fresh scan is clean. |
| CONFIG-SEC-001 | HIGH | MANUAL RELEASE ACTION REQUIRED | Fail-closed release packaging gate is implemented and synthetically verified; the checked-in development artifact remains intentionally non-release. |
| DATA-SEC-001 | MEDIUM | FIXED | Sensitive Outlook/Yahoo diagnostics were replaced with fixed event codes and a static invariant now rejects derived values. |
| DEP-SEC-002 | MEDIUM | FIXED | Detector idna constraint and hash-pinned lock now use 3.19; fresh scan and bounded hostile-IDNA test pass. |
| DB-SEC-001 | MEDIUM | LIVE VALIDATION REQUIRED | Production design separates migration/runtime credentials; disposable MySQL migration, CRUD, and DDL-denial checks pass. |
| LOG-SEC-001 | MEDIUM | FIXED | Structured, privacy-safe security events with opaque identifiers and bounded categories are implemented and tested. |
| AUTH-SEC-001 | LOW | FIXED | Unknown-account login performs one stable dummy Argon2id verification with the frozen hasher settings. |
| CSP-SEC-001 | LOW | FIXED | Web worker CSP no longer permits script `unsafe-inline`; production build and rendered tests pass. |
| API-SEC-001 | INFORMATIONAL | ACCEPTED INFORMATIONAL | Health/live/readiness responses expose only bounded operational metadata and no secrets. |

## 3. DEP-SEC-001

Previous version: `cryptography==45.0.7` (with `cryptography>=43.0,<46.0`).

New version: `cryptography==50.0.1` in `shared_platform/requirements.lock`.

Constraint change: `shared_platform/requirements.txt` now declares
`cryptography>=46.0.7,<51.0`.

Lock regeneration: `pip-compile --generate-hashes --strip-extras` was run
against the authoritative input file. The lock retains hash-pinned installs
and `shared_platform/Dockerfile` retains `--require-hashes`.

Advisory scan: fresh `pip-audit -r shared_platform/requirements.lock` reports
**No known vulnerabilities found**. A clean temporary Python 3.12 environment
installed the exact lock, `pip check` reported **No broken requirements found**,
and the resolved versions were cryptography 50.0.1 and idna 3.19.

Crypto regression results: existing authenticated AES-GCM round-trip and
invalid-authentication behavior tests pass. Synthetic encrypted report paths
remain covered by the shared-platform suite. No real key was rotated and no
production ciphertext was used.

Compatibility result: direct AES-GCM imports, key validation, SQLAlchemy
encrypted persistence, and all existing platform tests remain compatible.

Regression result: **PASS**.

## 4. CONFIG-SEC-001

The checked-in extension remains an explicit development artifact using
loopback HTTP. This is preserved for local development and is rejected by the
release verifier.

`scripts/package_extension.py` is the blocking packaging gate. It requires an
operator-supplied endpoint (argument or `BANTAI_PUBLIC_API_ORIGIN`), stages a
copy, invokes the existing release generator, validates release mode/HTTPS/
non-loopback origin/host permissions/CSP alignment, and writes a ZIP only after
validation succeeds. It never silently packages the checked-in development
configuration.

Synthetic tests cover development rejection, HTTPS acceptance, HTTP and all
loopback forms, missing endpoint, host-permission mismatch, CSP mismatch, and
loopback-enabled release rejection. The real production origin and extension
ID remain operator supplied.

Status: **CODE/PIPELINE FIXED — REAL RELEASE ARTIFACT REQUIRES OPERATOR ACTION**.

## 5. DATA-SEC-001

Outlook and Yahoo sender/subject/body-count diagnostics and full URL metadata
were removed from console arguments. Remaining diagnostics use fixed event
codes such as `EMAIL_EXTRACTED`, `EXTRACTOR_LOADED`, and
`SEND_MESSAGE_FAILED`; no raw error, sender, subject, body, token, or URL value
is passed to the console.

`ProjectInvariantTests.test_extension_console_diagnostics_are_fixed_non_sensitive_events`
scans every extension JavaScript source and rejects arguments derived from
message metadata, page locations, credentials, or response values.

Extraction behavior and provider scope are unchanged. Status: **FIXED**.

## 6. DEP-SEC-002

Previous idna version: `3.13`.

New idna version: `3.19` in `backend/requirements-detector.txt`,
`backend/requirements.txt`, and the regenerated hash-pinned detector lock.

Fresh `pip-audit -r backend/requirements-detector.lock` reports **No known
vulnerabilities found**. Existing URL parsing tests pass, including a bounded
Unicode label that is rejected in under one second without an unbounded
resource-exhaustion payload. A clean temporary environment installed the exact
hash-pinned detector lock; `pip check` reported **No broken requirements
found**, and the resolved `idna` version was 3.19.

Status: **FIXED**.

## 7. DB-SEC-001

Production Compose now creates roles through `deploy/mysql/create-roles.sh`:

- `bantai_migration` receives only schema-scoped migration privileges and is
  used by the one-shot `migration` service.
- `bantai_runtime` receives only runtime DML privileges and is used by the
  long-running platform.
- The platform image no longer runs Alembic during every application restart.
- The local development Compose override retains its explicit convenience
  migration command.

Disposable MySQL 8.4 validation passed: the migration role reached Alembic
head; the runtime role started the API and performed normal CRUD; runtime
CREATE, ALTER, and DROP operations were denied. Live production grants and
secret-manager substitutions still require operator validation.

Status: **CODE/DEPLOYMENT DESIGN FIXED — LIVE VALIDATION REQUIRED**.

## 8. LOG-SEC-001

`shared_platform/app/security_events.py` implements JSON security events with:
timestamp, allow-listed event code, bounded outcome/reason categories, keyed
opaque principal IDs, and keyed opaque request correlation IDs. The emitter
never accepts or serializes private content and deliberately fails open for
telemetry errors so request handling is not crashed.

Implemented event types include login success/failure, session revocation,
suspension, rate-limit and request-size blocks, pairing/device lifecycle,
administrator review/status changes, cloud unavailability, and model-result
integrity failures. Sensitive-value capture tests pass. Deployment should send
the `bantai.security` logger to an access-controlled destination with a
documented, organization-approved retention period; no legal retention period
is invented here.

Status: **FIXED**.

## 9. AUTH-SEC-001

Login now uses a stable pre-generated synthetic Argon2id hash with
`m=65536,t=3,p=2` when the account lookup misses, then returns the same generic
401 response used for a wrong password. It does not generate a hash per
request, and it is not associated with a real account.

The bounded API regression test confirms unknown-account and wrong-password
responses are identical. Status: **FIXED**.

## 10. CSP-SEC-001

Before: `script-src 'self' 'unsafe-inline'`.

After: `script-src 'self'`.

The current Vinext output and application sources do not require an inline
application script. The web production build, rendered HTML suite, and a
header assertion confirming the absence of script `unsafe-inline` all pass.

Status: **FIXED**.

## 11. API-SEC-001

The public `/health`, `/live`, and `/ready` probes retain intentionally useful
service/version/readiness metadata. They do not expose database hosts or
credentials, internal filesystem/model paths, API keys, tokens, stack traces,
or cloud secrets. `/ready` returns a generic 503 on dependency failure.

Status: **ACCEPTED INFORMATIONAL**.

## 12. Dependency Re-Scan

| Component | Critical | High | Medium | Low |
|---|---:|---:|---:|---:|
| shared platform locked Python dependencies | 0 | 0 | 0 | 0 |
| detector locked Python dependencies | 0 | 0 | 0 | 0 |
| web production npm graph | 0 | 0 | 0 | 0 |
| web full npm graph | 0 | 0 | 0 | 0 |

No image scanner was available in the environment, so no image-scan result is
claimed.

## 13. Authorization Regression

The 40-test shared-platform suite passes. Synthetic User A/User B/admin/device
ownership, BOLA/IDOR, CSRF, device revocation, suspension, admin denial,
trusted-proxy, and rate-limit regressions remain green.

### Rate-limit coverage review

Pairing-code creation is now limited to 10 requests per five-minute
cookie/network bucket; pairing consumption is limited by client address, and
detector, login, message-review, and cloud-review routes retain their existing
credential-scoped buckets. Device revocation, profile/consent mutations,
feedback/report submissions, automatic training samples, and administrator
review/status mutations remain authenticated and CSRF-protected (where cookie
based), with per-user/device ownership checks and duplicate/reviewed-state
guards. They were intentionally left outside the central limiter because they
are low-frequency control-plane operations rather than anonymous or cloud-cost
amplifying paths; the deployment operator should add a bounded administrative
bucket if observed traffic or abuse warrants it.

## 14. Cloud Boundary Regression

Cloud redaction tests pass at the fake provider boundary. Email bodies remain
redacted before provider submission, URL review remains origin-only and warning
gated, malformed/provider failures remain `UNAVAILABLE`, and prompt-injection
tests remain green. No real LLM request was made.

## 15. Extension Security Regression

Five extension JavaScript syntax checks pass. Release-gate tests pass for all
required invalid and synthetic-valid cases. The current development artifact
continues to fail the release verifier as intended.

## 16. Full Regression Results

- Core synthetic/unit suite: **158 passed, 0 failed**.
- Shared-platform API suite: **40 passed, 0 failed**.
- Web production build/rendered tests: **6 passed, 0 failed**.
- Web lint: **passed**.
- Frozen model/project verification: **passed**.
- Python/JavaScript syntax verification: **passed**.
- Production Compose rendering: **passed**.
- Disposable MySQL online migration and privilege checks: **passed**.

## 17. Remaining Security Risks

1. A real HTTPS release extension artifact still must be generated and
   independently inspected by the release operator.
2. Production secret-manager values, Caddy source CIDR, live MySQL grants,
   firewall/network isolation, and final TLS/CDN headers require deployment
   environment validation.
3. The available webmail provider DOM behavior and Chrome/Edge interactive
   lifecycle were not tested in a real browser session here.

## 18. Required Manual Release Actions

Before the next pre-deployment audit, the operator must:

1. Set the actual HTTPS `BANTAI_PUBLIC_API_ORIGIN`/release endpoint and run
   `scripts/package_extension.py`.
2. Review the generated manifest/CSP and retain the validated ZIP as the only
   release artifact.
3. Configure real Caddy trusted-proxy CIDR and verify final TLS/CDN headers.
4. Validate the production MySQL role grants and secret references using the
   migration job, then confirm the runtime account cannot perform DDL.
5. Confirm detector/database network isolation and production firewall rules.

No real values are invented in this report.

## 19. Remediation Conclusion

**READY FOR SECURITY RE-AUDIT**. The code and verification gates are complete;
the separate re-audit records the remaining release-environment actions.
BantAI is not approved for deployment by this report.
