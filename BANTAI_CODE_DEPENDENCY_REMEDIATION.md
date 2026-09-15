# BantAI Code and Dependency Remediation

**Remediation date:** 2026-09-15 (Asia/Manila)  
**Baseline:** `BANTAI_CODE_DEPENDENCY_AUDIT.md` (preserved unchanged)  
**Scope:** Active BantAI web, extension, public platform, private detector, deployment configuration, and dependency artifacts. Frozen model behavior and artifacts were not changed.

## Outcome

The critical and high-risk code findings have been remediated in source and verified with synthetic tests. The release is **not** an approved deployment: an operator must first create the real HTTPS extension artifact, apply the new database migration, set actual private-proxy trust boundaries and secrets, and close the remaining Python CPU-wheel supply-chain gap.

## Priority 0 remediation

| Finding | Status | Remediation and verification |
|---|---|---|
| DEP-001 | FIXED | Updated the Next runtime and `eslint-config-next` to 16.3.5, then rebuilt from `npm ci`. Final `npm audit --json` reports 0 vulnerabilities. |
| DEP-002 | FIXED | Aligned `react`, `react-dom`, and `react-server-dom-webpack` at 19.2.8; the final lock resolves one compatible RSC set. Web lint, build, and six rendered tests pass. |
| API-001 | FIXED | The direct email cloud-review route now rebuilds an allowlisted payload and performs server-side redaction, sender/authentication minimization, and bounded truncation immediately before provider use. A synthetic PII test proves untrusted client payload values do not reach the provider. |
| CONFIG-001 | CODE FIXED / RELEASE ACTION REQUIRED | Endpoint generation now has explicit `development` and `release` modes; release mode permits only a non-loopback HTTPS origin and requires exact host permission/CSP alignment. The checked-in development configuration intentionally fails `scripts/verify_extension_release.py`; a real origin is required before packaging. |
| API-002 | CODE FIXED / MIGRATION REQUIRED | Replaced process-local rate-limit state with `rate_limit_buckets`, atomic database updates, trusted-proxy-only forwarded identity, Caddy header replacement, and fail-closed handling. Migration `0014_centralized_rate_limits` must be applied to the target database before release. |
| DEP-005 | PARTIALLY FIXED | Added generated, hash-checked platform and detector locks, uses `--require-hashes` for those container installs, and ran `pip-audit` on both lock files. The separately sourced CPU PyTorch runtime remains exact-version pinned at `torch==2.8.0`, but its official index could not be resolved with pip-tools' all-artifact hash mode; it remains a release follow-up. |

## Other finding remediation

| Finding | Status | Change |
|---|---|---|
| DEP-003 | FIXED | Final production npm audit: 0 vulnerabilities. |
| DEP-004 | FIXED | Updated Vite, Cloudflare Vite plugin, Wrangler, Vinext, and the RSC plugin; applied supported lock-only fixes; final complete npm audit: 0 vulnerabilities. |
| API-003 | FIXED | Detector API now has a 128 KiB request-body limit plus strict URL, provider, sender, subject, and body bounds before inference. |
| AUTH-001 | MITIGATED FOR CONTROLLED PILOT | Remote Compose disables public self-registration. Enabling it is blocked by remote runtime validation until a verified-email workflow is designed and audited. |
| ML-001 | FIXED | Added `EMAIL_MODEL_MANIFEST.json` with SHA-256 and byte-size checks for every deployed email artifact. Startup validation and `verify_models.py` fail before loading if an artifact is changed. |
| CONFIG-002 | FIXED | The web Worker applies CSP, anti-framing, nosniff, referrer, permissions, and HTTPS-only HSTS headers; rendered tests verify them. |
| LOG-001 | OPEN | Privacy-preserving operational/audit-event coverage still needs a dedicated event pipeline and retention policy. No raw email logging was introduced. |
| AUTH-002 | MITIGATED FOR CONTROLLED PILOT | The public availability and registration endpoints are disabled in the remote deployment, so they do not expose public account-existence information. |
| EXT-001 | FIXED | Removed remote Google Fonts requests from the extension, retained the Roboto system font stack, and narrowed extension CSP to local resources plus the configured API origin. |
| CONFIG-003 | PARTIALLY FIXED | Platform and detector containers are now read-only, non-root, capability-dropped, `no-new-privileges`, and have bounded temporary filesystems. Image tags are not digest-pinned. |
| REPO-001 | OPEN | The legacy/template trees remain tracked and require an owner-approved archival or separate-repository decision. |
| CODE-001 | OPEN | Broad orchestration files remain a maintainability concern; no unrelated refactor was made. |
| TEST-001 | PARTIALLY FIXED | Added negative redaction, manifest-tamper, detector-size, trusted-proxy, centralized-limiter, release-config, closed-pilot, and web-header coverage. Interactive Chrome/Edge testing remains required. |
| OPS-001 | PARTIALLY FIXED | Added a least-privilege GitHub Actions dependency/security workflow. Production backups, restore drills, image scanning, and an SBOM publication process remain operator work. |

## Material source changes

- `shared_platform/app/cloud.py` and `shared_platform/app/main.py`: server-owned direct email cloud-review redaction boundary.
- `shared_platform/app/rate_limit.py`, `models.py`, and Alembic `0014_centralized_rate_limits.py`: shared database limiter and trusted forwarded identity.
- `deploy/Caddyfile` and `docker-compose.yml`: forwarding-header sanitation, remote registration closure, and container hardening.
- `scripts/configure_remote_endpoint.py` and `scripts/verify_extension_release.py`: explicit development/release extension configuration checks.
- `backend/server.py`: request-size middleware and model-input bounds.
- `backend/email_model.py`, `scripts/verify_models.py`, and the email model manifest: frozen artifact integrity verification.
- `web/worker/index.js`, extension manifest/popup, and web tests: response-security headers and extension CSP/font hardening.
- `web/package-lock.json`, `shared_platform/requirements.lock`, and `backend/requirements-detector.lock`: reproducible dependency artifacts.
- `.github/workflows/security.yml`: CI audit/build gate.

## Required manual release actions

1. Choose the actual public API HTTPS origin, then run `scripts/configure_remote_endpoint.py --mode release` with `BANTAI_PUBLIC_API_ORIGIN` set by the release operator. Run `scripts/verify_extension_release.py` and package that generated extension artifact. Do not ship the checked-in development-loopback artifact.
2. Back up and validate the target database, then run Alembic through revision `0014_centralized_rate_limits`. Do not deploy an API that would fail closed because the new table is absent.
3. Set `BANTAI_TRUSTED_PROXY_CIDRS` to the real private Caddy source address/CIDR, confirm Caddy is the only path to the public API, and apply host/network firewall policy. No production value was invented here.
4. Provision real secrets only through the target secret-management process: database passwords, internal API key, encryption key, Gemini key, administrator bootstrap credentials, and the actual Caddy domain. Rotate any values exposed during prior testing according to the deployment owner's procedure.
5. Keep `BANTAI_PUBLIC_REGISTRATION_ENABLED=false` for the controlled pilot. Before any public onboarding, implement independently verified email ownership with expiring single-use tokens, resend throttling, generic public responses, and recovery semantics, then conduct a focused security review.
6. Resolve the PyTorch CPU-index hash-lock limitation (or adopt an approved artifact mirror with immutable hashes) and re-run the Python supply-chain audit against the exact image inputs.
7. Run image scanning, backup/restore validation, real DNS/TLS/Cloudflare checks, and interactive Chrome/Edge smoke tests before a deployment decision.

## Verification evidence

- `python scripts/verify_project.py`: PASS.
- `python scripts/verify_models.py`: PASS, including RF hash and email manifest validation.
- `python -m unittest discover -s tests -v`: PASS, 144 tests.
- `python -m unittest discover -s shared_platform/tests -v`: PASS, 38 tests after the added closed-pilot check.
- `node --check` for required extension worker/content/popup scripts: PASS through the project verifier and direct syntax checks.
- `npm ci`, `npm run lint`, and `npm test` in `web/`: PASS; rendered tests: 6/6.
- Final `npm audit --json`: 0 vulnerabilities (production and development graphs).
- `pip-audit -r shared_platform/requirements.lock` and `pip-audit -r backend/requirements-detector.lock`: completed with no reported advisory output.
- `docker compose -f docker-compose.yml config --no-interpolate --quiet`: PASS. No deployment values were supplied.

## Constraints retained

No model was retrained, replaced, retuned, removed, or loaded from a network source. The frozen email preprocessing, temperature, threshold, model identity, URL model identity, RF threshold, and RF SHA-256 remain unchanged. No real LLM request, production deployment, database migration, DNS/TLS operation, credential creation, or live browser test was performed.
