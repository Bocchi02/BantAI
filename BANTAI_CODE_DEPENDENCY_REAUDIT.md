# BantAI Code and Dependency Re-Audit

**Re-audit date:** 2026-09-15 (Asia/Manila)  
**Original recommendation:** **NOT READY FOR DEPLOYMENT**  
**Original report:** `BANTAI_CODE_DEPENDENCY_AUDIT.md` (unchanged)  
**Remediation record:** `BANTAI_CODE_DEPENDENCY_REMEDIATION.md`

## Re-audit conclusion

The original web dependency blockers are resolved in the committed lockfile and the protected code paths have test evidence. The release remains **NOT READY FOR DEPLOYMENT** because deployment-specific safeguards are deliberately fail-closed until an operator completes the required actions below. This is suitable for the next pre-deployment security audit after those actions—not a production approval.

## Original finding count and current disposition

| Original severity | Original count | Fixed | Mitigated / partial | Open |
|---|---:|---:|---:|---:|
| Critical | 1 | 1 | 0 | 0 |
| High | 3 | 2 | 1 | 0 |
| Medium | 9 | 5 | 3 | 1 |
| Low | 5 | 1 | 2 | 2 |
| Informational | 2 | 0 | 2 | 0 |
| **Total** | **20** | **9** | **8** | **3** |

The table uses the original IDs and severity classifications. “Mitigated / partial” is intentionally not a closure: it includes the release configuration, migration, Python CPU-wheel locking, controlled-pilot account closure, container image pinning, test coverage, and operational controls that require further release-owner work.

## Priority 0 re-audit

| ID | Re-audit status | Evidence |
|---|---|---|
| DEP-001 | FIXED | `next@16.3.5` is locked; clean install, lint, build, rendered tests, and final npm audit passed. |
| DEP-002 | FIXED | React/RSC is aligned at 19.2.8; one compatible graph is locked and final npm audit is clean. |
| API-001 | FIXED | Provider-boundary test submits synthetic email/OTP/phone/card/account content and verifies raw values are absent from the provider payload. |
| CONFIG-001 | CODE FIXED; MANUAL ACTION REQUIRED | Release validator rejects loopback/non-HTTPS/mismatched permissions/CSP. It correctly rejects the current development artifact. |
| API-002 | CODE FIXED; MIGRATION REQUIRED | Trusted-proxy, central DB limiter, retry/concurrency behavior, and Caddy header handling are covered by shared-platform tests. Target schema migration is not run. |
| DEP-005 | PARTIALLY FIXED | Hash locks and advisory scans cover platform and detector requirements. The dedicated PyTorch CPU source is exact-version pinned but not hash-locked due its index/tooling incompatibility. |

## Dependency evidence

### JavaScript

- Clean installation: `npm ci` completed using `web/package-lock.json`.
- Runtime alignment: Next 16.3.5; React/React DOM/RSC 19.2.8.
- Toolchain alignment: Vite 8.3.0, Cloudflare Vite plugin 1.54.9+, Wrangler 4.113.0+, Vinext 1.0.0-beta.9, and RSC plugin 0.5.34.
- `npm audit --omit=dev --json`: 0 vulnerabilities.
- Final `npm audit --json`: 0 vulnerabilities over 622 resolved dependencies.

### Python

- Added `shared_platform/requirements.lock` and `backend/requirements-detector.lock`, generated with pip-tools and hashes.
- Platform and detector Dockerfiles use `pip install --require-hashes` for those lock files.
- `pip-audit` was installed in the isolated local virtual environment and run against both locks; no advisories were reported.
- The detector Dockerfile keeps the frozen CPU runtime at `torch==2.8.0` from the official PyTorch CPU index. This component is still a reproducibility exception because pip-tools failed to obtain index-wide hashes; it is not represented as fully remediated.

## Code and configuration evidence

- Direct email cloud reviews are server-redacted regardless of attacker-controlled `redacted_*` field names.
- Request limits are enforced before detector parsing/inference; individual mail fields are bounded.
- Email model startup verifies every deployed runtime artifact against the checked-in SHA-256/size manifest.
- Public remote Compose disables self-registration until verified-email infrastructure exists.
- The extension has a release-mode generator/validator; local HTTP requires explicit development opt-in.
- The public API recognizes `X-Forwarded-For` only from configured Caddy source networks, while Caddy replaces browser-supplied forwarding headers.
- Platform/detector services run with a read-only root, no added capabilities, `no-new-privileges`, and bounded temporary filesystems.
- Web Worker response headers cover CSP, framing, MIME sniffing, referrer policy, permissions policy, and HTTPS HSTS.
- CI now audits locks and verifies source/build behavior without requiring deployment secrets.

## Verification results

| Check | Result |
|---|---|
| `python scripts/verify_project.py` | PASS |
| `python scripts/verify_models.py` | PASS |
| `python -m unittest discover -s tests -v` | PASS, 144 tests |
| `python -m unittest discover -s shared_platform/tests -v` | PASS, 38 tests |
| Web `npm run lint` | PASS |
| Web `npm test` | PASS, 6 tests |
| Final complete npm audit | PASS, 0 vulnerabilities |
| Python lock advisory scans | PASS, no reported advisories |
| Compose parse without interpolation | PASS |
| Interactive Chrome/Edge behavior | NOT RUN |
| Production deployment/migration/DNS/TLS/secrets | NOT RUN |

## Remaining deployment blockers and owner actions

1. **Extension release artifact:** release owner must set the genuine HTTPS API origin and run the extension release generator and verifier. The development-loopback configuration is intentionally not releasable.
2. **Database migration:** deployment owner must back up, test, and apply Alembic revision `0014_centralized_rate_limits` before starting the new platform image.
3. **Proxy and network boundary:** operations owner must configure the actual Caddy private CIDR, verify no direct platform/detector/MySQL ingress, and enforce firewall/security-group policy.
4. **Secrets:** operations owner must supply real secrets through the approved secret store and rotate according to local policy. No secret or production domain was created by this remediation.
5. **Python CPU wheel integrity:** dependency owner must hash-lock the exact PyTorch CPU artifact through an approved immutable source/mirror and re-audit the final image input.
6. **Public accounts:** product/security owner must not enable public registration until a verified-email and recovery design is implemented and audited. The current Compose deployment is a controlled closed pilot.
7. **Operational assurance:** complete image scanning, backup/restore drill, production TLS/DNS/Cloudflare verification, and interactive Chromium tests.

## Residual non-blocking engineering work

- Introduce a privacy-safe structured security-event logging pipeline with defined access and retention controls.
- Decide whether legacy/template trees are archived, removed by owner approval, or separated from the release repository.
- Decompose oversized orchestration modules only with focused regression coverage.
- Maintain CI, lock regeneration, advisory scans, and SBOM/image provenance as release requirements.
