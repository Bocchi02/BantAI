# BantAI Security & API Re-Audit

## 1. Original Baseline

Critical: 1  
High: 1  
Medium: 4  
Low: 2  
Informational: 1

## 2. Current Finding Status

| ID | Original Severity | Re-Audit Status | Evidence |
|---|---|---|---|
| DEP-SEC-001 | CRITICAL | FIXED | Authoritative constraint is `>=46.0.7,<51.0`; lock resolves 50.0.1; clean install, `pip check`, AES-GCM tests, and `pip-audit` pass. |
| CONFIG-SEC-001 | HIGH | MANUAL RELEASE ACTION REQUIRED | `package_extension.py` stages and validates before ZIP creation; current checked-in development config is rejected by the release verifier. |
| DATA-SEC-001 | MEDIUM | FIXED | All extension console diagnostics are fixed event codes; static invariant rejects sensitive derived arguments. |
| DEP-SEC-002 | MEDIUM | FIXED | Detector lock resolves idna 3.19; clean lock install/`pip check`, bounded hostile-IDNA test, and `pip-audit` pass. |
| DB-SEC-001 | MEDIUM | LIVE VALIDATION REQUIRED | Separate migration/runtime role design and disposable MySQL grant tests pass; production grant validation remains outstanding. |
| LOG-SEC-001 | MEDIUM | FIXED | JSON security-event emitter, opaque IDs, allow-listed categories, and sensitive-value tests pass. |
| AUTH-SEC-001 | LOW | FIXED | Stable dummy Argon2id verification removes the obvious unknown-account code-path difference; response regression passes. |
| CSP-SEC-001 | LOW | FIXED | Script CSP is self-only; build/rendered header test passes. |
| API-SEC-001 | INFORMATIONAL | ACCEPTED INFORMATIONAL | Operational probes remain bounded and secret-free. |

## 3. Dependency Security

| Component | Resolved version/state | Critical | High | Medium | Low |
|---|---|---:|---:|---:|---:|
| Shared platform | cryptography 50.0.1; idna 3.19 transitive | 0 | 0 | 0 | 0 |
| Detector | idna 3.19 | 0 | 0 | 0 | 0 |
| Web production graph | npm lockfile | 0 | 0 | 0 | 0 |
| Web full graph | npm lockfile | 0 | 0 | 0 | 0 |

No image scan is claimed because no image scanner was available.

## 4. Authentication

Argon2 password hashing remains `time_cost=3`, `memory_cost=65536`, and
`parallelism=2`. Unknown-account login performs one stable dummy verification,
and the generic failure response matches wrong-password behavior. Sessions
remain random-token/hashed, expiry-aware, HttpOnly/Secure in production,
SameSite Lax, and revocable.

## 5. Authorization / IDOR / BOLA

All existing owner/device/admin negative tests pass. User and device scopes are
enforced on activities, reports, explanations, feedback, devices, and admin
routes. No authorization control was weakened.

## 6. Sessions / CSRF

Double-submit CSRF remains required for cookie mutations and is matched against
the session-bound hash. Logout, password change, suspension, and device
revocation continue to invalidate the appropriate credentials.

## 7. CORS

Exact configured web/extension origins remain the only credentialed CORS
origins. Synthetic approved preflight passes; attacker and `null` origins are
rejected.

## 8. Rate Limiting / Proxy

Database-backed opaque rate buckets remain fail-closed. Login, pairing consume,
pairing creation, detection, cloud review, and pasted-message review have
bounded coverage. Forwarded client identity is trusted only from the configured
proxy CIDR; request-size limits remain enforced before authentication.

Device/profile/consent mutations, feedback/report submissions, automatic sample
ingest, and administrator review/status changes remain authenticated, CSRF-
protected where cookie based, owner-scoped, and guarded by duplicate or
reviewed-state checks. They are intentionally not centrally throttled because
they are low-frequency control-plane operations; a deployment-specific bucket
can be added if monitoring identifies abuse.

## 9. Input / Injection / SSRF

Strict Pydantic schemas, bounded fields, CSV formula protection, parameterized
SQLAlchemy operations, no user-controlled shell/file execution, address-bar URL
scope, and no user-URL fetching remain intact. Bounded hostile-IDNA parsing
passes without an unbounded workload.

## 10. Cloud Boundary

Cloud AI remains server-side, always enabled, redacted at the provider boundary,
origin-only for URL review, and unavailable-on-failure rather than safe. No real
provider request was sent.

## 11. Extension Security

No broad URL permissions, remote JavaScript, eval, external messaging bridge,
or credential exposure was introduced. Sensitive diagnostics are removed. The
release packager requires validated release configuration before writing a ZIP.

## 12. Database Privileges

Production Compose now has explicit `bantai_migration` and `bantai_runtime`
credentials. The runtime image no longer runs Alembic. Disposable MySQL 8.4
confirmed migration success, runtime CRUD, and runtime denial of CREATE/ALTER/
DROP. Live production grants remain a manual action.

## 13. Security Logging

`bantai.security` emits compact JSON event records with timestamps, allow-listed
codes, bounded outcomes/reasons, opaque principal/request IDs, and no private
content. Event failures do not crash critical handling. Capture tests pass.

## 14. Production Configuration

The checked-in extension is still development/loopback by design. The release
pipeline is fixed and fail-closed, but the genuine production HTTPS origin and
artifact do not exist in this checkout. Production Compose requires separate
runtime/migration secrets, HTTPS origins, private proxy CIDR, and backend-only
cloud credentials.

## 15. Regression Results

- 158 core tests: passed.
- 40 shared-platform tests: passed.
- 6 web rendered/build tests: passed.
- Web lint, model verification, Python/JavaScript checks, Compose rendering,
  dependency scans, and disposable MySQL privilege checks: passed.
- Failures: 0.

## 16. Remaining Deployment Blockers

1. Manual generation and inspection of the actual HTTPS extension release ZIP.
2. Live validation of MySQL grants, secret substitutions, proxy CIDR, firewall
   isolation, and final TLS/CDN headers.

These are genuine release-environment actions, not unresolved code findings.

## 17. Security Readiness Checklist

| Area | Result |
|---|---|
| Critical/high dependency findings | PASS — 0 in both Python locks and npm graphs |
| Authentication and session lifecycle | PASS WITH CONDITIONS — live deployment validation remains |
| Authorization/BOLA/IDOR | PASS |
| CSRF/CORS/proxy trust/rate limits | PASS |
| Input/injection/SSRF/file/shell | PASS |
| Cloud redaction and failure semantics | PASS |
| Extension source and diagnostics | PASS WITH MANUAL RELEASE ACTION |
| Database privilege boundary | PASS WITH LIVE VALIDATION REQUIRED |
| Security event privacy | PASS |
| Frozen model/threshold/data contract | PASS — unchanged |
| Production artifact/network/TLS validation | MANUAL ACTION REQUIRED |

## 18. Final Security Assessment

**READY WITH MANUAL SECURITY ACTIONS** for the next pre-deployment security/API
audit. This re-audit does not authorize deployment and does not claim that a
real production extension artifact or production database grants have been
validated.
