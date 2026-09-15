# BantAI Functional Re-Audit

Date: 2026-09-15

## 1. Re-audit basis

This re-audit uses `BANTAI_FUNCTIONAL_AUDIT.md` as the authoritative baseline and verifies every original finding after remediation. The original audit files remain unchanged; this report and the versioned remediation CSV files contain the new status and evidence.

## 2. Finding-by-finding status

### FUNC-001 — production Compose variable

Original status: HIGH / remediation required.

Reverification: the root `.env.example` now supplies the required trusted-proxy value, documentation explains the private Caddy trust boundary, `scripts/validate_compose_env.py` passes, and production Compose config renders successfully without starting services.

Root cause closed: template drift from the Compose-required proxy variable.

New status: PASS. The deployment operator still has to replace the placeholder with the real private Caddy source network.

### EXT-F001 — extension release configuration

Original status: HIGH / remediation required.

Reverification: development loopback configuration remains valid; release validation rejects development mode, loopback, HTTP, missing endpoint fields, and host/CSP mismatches. Eight targeted tests pass. A temporary release artifact using `https://api.example.invalid/api/v1` passed both configuration and release-verifier CLI checks.

Root cause closed: release generation is now explicit and testable without replacing the checked-in development artifact.

New status: PASS WITH MANUAL RELEASE ACTION. The checked-in development artifact is intentionally rejected by the release verifier. A real HTTPS origin must be supplied by the release operator.

### AUTH-F001 — registration UX mismatch

Original status: MEDIUM / remediation required.

Reverification: the API exposes only the non-secret registration capability flag. Disabled mode returns the controlled-pilot copy, removes registration CTAs, redirects `/register` to `/login`, and preserves backend 403 enforcement. Enabled mode retains the registration form. API, route-state, source-contract, and rendered-HTML tests pass.

Root cause closed: frontend copy and routing now consume the same deployment capability as the backend guard.

New status: PASS. The remote Compose configuration remains explicitly disabled.

### DB-F001 — MySQL migration/readiness validation

Original status: MEDIUM / remediation required.

Reverification: isolated MySQL 8.4 validation passes from an empty schema to head, verifies required tables/indexes/FKs and `rate_limit_buckets`, preserves a synthetic existing user across `0013 → 0014`, and returns application `/ready` with a test-only detector readiness stub. Migrations 0012–0014 now tolerate the current metadata-created baseline. Offline SQL generation still stops at 0011 live inspection and is documented as unsupported.

Root cause closed for online migration: clean-schema duplication is guarded. Offline SQL remains an explicit unsupported policy.

New status: PASS, ONLINE MIGRATIONS ONLY.

### BROWSER-F001 — interactive browser/provider validation

Original status: INFORMATIONAL / not testable in the audit environment.

Reverification: no interactive Chrome/Edge extension installation or controlled Gmail/Outlook/Yahoo provider account was available. The sanitized acceptance matrix is prepared and no unsupported browser claim is made.

Root cause remains environmental: interactive browser/provider surfaces are unavailable in this execution context.

New status: MANUAL ACCEPTANCE REQUIRED.

## 3. Functional journey re-audit

| Journey | Result | Evidence |
| --- | --- | --- |
| Production Compose configuration | PASS | Required proxy variable and config rendering checks |
| Development extension configuration | PASS | Loopback-scoped endpoint tests |
| Release extension artifact | PASS on synthetic artifact | HTTPS/non-loopback verifier CLI |
| Controlled-pilot landing/auth/register/help | PASS | 9 web tests and rendered landing assertion |
| Enabled registration path | PASS by capability/route/API tests | Registration-state and API capability tests |
| Clean MySQL migration | PASS | Disposable MySQL 8.4 script |
| Existing data through 0013→0014 | PASS | Synthetic user survival check |
| Application readiness after migration | PASS | `/ready` with test-only detector stub |
| Chrome/Edge core flow | MANUAL REQUIRED | No installed target browser acceptance |
| Live provider DOM flow | MANUAL REQUIRED | No controlled provider accounts |

## 4. Regression gate

The final automated count is 195 passing tests: 147 root tests, 39 shared-platform tests, and 9 web tests. There were 0 unexpected automated failures. Additional verification passed for Compose rendering, project invariants, frozen model artifacts, Python compilation, extension JavaScript syntax, web lint, web build, and Alembic head resolution.

Two non-green outcomes are intentional gates: the checked-in development extension is rejected by the release verifier, and offline Alembic SQL generation is unsupported. One manual gate remains for browser/provider acceptance.

## 5. Privacy and safety boundary

No production deployment occurred. No real credentials, private email bodies, personal mailbox, live phishing site, model replacement, threshold change, dataset publication, or real LLM request was used for this remediation.

## 6. Model and decision contract

The frozen email and URL artifact verification passed. The email model, calibration, thresholds, preprocessing, URL feature extractor, URL artifact hash, and deterministic fusion behavior remain unchanged by this remediation.

## 7. Final recommendation

READY WITH MANUAL RELEASE ACTIONS
