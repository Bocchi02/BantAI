# BantAI Functional Remediation

Date: 2026-09-15

Baseline: `BANTAI_FUNCTIONAL_AUDIT.md` and its companion traceability/test-result CSV files. The baseline findings were treated as authoritative. This remediation was limited to functional configuration, migration compatibility, release validation, and user-facing registration capability behavior.

## 1. Executive summary

The five baseline findings were reverified and remediated to the following states:

| Finding | Original | Remediation result |
| --- | --- | --- |
| FUNC-001 production Compose template | HIGH | PASS |
| EXT-F001 extension release configuration | HIGH | PASS WITH MANUAL RELEASE ACTION |
| AUTH-F001 registration UX mismatch | MEDIUM | PASS |
| DB-F001 disposable MySQL/migration validation | MEDIUM | PASS, ONLINE MIGRATIONS ONLY |
| BROWSER-F001 interactive browser/provider validation | INFORMATIONAL | MANUAL ACCEPTANCE REQUIRED |

No production deployment, real account, private email, live phishing site, or real provider credential was used.

## 2. Remediation scope and constraints

The remediation did not change, retrain, retune, replace, or reinterpret the frozen email model, URL model, calibration, thresholds, preprocessing, datasets, or fusion rules. It did not enable public registration in the controlled-pilot Compose configuration. Automated tests did not make real LLM requests.

## 3. Fixes implemented

### FUNC-001 — production Compose required variable

Root cause: the root production `.env.example` had drifted from the required
`${BANTAI_TRUSTED_PROXY_CIDRS:?}` Compose interpolation, so a documented
deployment template could not render.

- Added required `BANTAI_TRUSTED_PROXY_CIDRS` to the root `.env.example` with a private documentation placeholder.
- Documented that only the private Caddy source network may be trusted for forwarded client identity and that the deployment operator must replace the placeholder.
- Added `scripts/validate_compose_env.py`, which detects required `${VAR:?}` values and runs read-only Compose config rendering.
- Verified the production Compose template with `docker compose --env-file .env.example -f docker-compose.yml config`.

### EXT-F001 — development/release extension configuration

Root cause: the checked-in extension is intentionally a local development
artifact, while the release gate had no reproducible path for generating and
verifying an isolated release artifact without overwriting that development
configuration.

- Preserved the checked-in local development endpoint and loopback opt-in.
- Added explicit artifact-path support and `configure_artifacts()` to `scripts/configure_remote_endpoint.py`.
- Added development validation for loopback-only HTTP and exact host/CSP policy.
- Kept release validation fail-closed for missing fields, development mode, loopback or HTTP endpoints, and host/CSP mismatches.
- Added release verifier `--config` and `--manifest` arguments so a generated artifact can be checked without modifying the repository’s development files.
- Generated a temporary synthetic release using `https://api.example.invalid/api/v1`; the release verifier passed, and the temporary files were removed.

Operator flow: configure a real HTTPS API origin with `--mode release`, verify the generated artifact, then package that generated artifact. The checked-in development configuration must not be packaged.

### AUTH-F001 — registration capability consistency

Root cause: the backend correctly disabled public registration in the remote
controlled pilot, but the web UI unconditionally presented self-registration
copy and the `/register` form.

- Added `GET /api/v1/public-config`, exposing only `public_registration_enabled`.
- Made the web application fail closed when the capability endpoint is unavailable.
- When disabled, landing-page registration CTAs are removed or changed to sign-in, `/register` is redirected to `/login`, and the auth footer says accounts are provisioned for authorized pilot users.
- Help/setup copy now says to use a provisioned account when registration is disabled.
- When enabled, the existing registration form and route remain available.
- The backend’s existing 403 guard for registration and email availability remains unchanged.

### DB-F001 — MySQL migration and readiness validation

Root cause: the initial migration creates the current SQLAlchemy metadata, so
later migrations 0012–0014 attempted to recreate fields or the rate-limit table
on a clean install; migration 0011 also requires live schema inspection and
cannot produce offline SQL.

- Made migrations `0012_remote_server_inference`, `0013_input_explanation_limit`, and `0014_centralized_rate_limits` inspect the current schema before adding or removing objects. This supports the repository’s metadata-created baseline and older databases that genuinely lack those objects.
- Added `scripts/validate_disposable_mysql.py` for clean-head migration, schema/index/FK/rate-limit checks, `0013 → 0014` data-survival validation, and application readiness.
- Ran the script against an isolated MySQL 8.4 container with synthetic credentials only. The container was removed after testing.
- Documented the migration policy as online-only. Offline SQL generation remains unsupported because migration 0011 intentionally inspects the live schema.

### BROWSER-F001 — manual acceptance preparation

Root cause: this execution environment did not provide an installed Chrome or
Edge extension target, controlled provider accounts, or live provider DOMs.

The following sanitized acceptance matrix is prepared but not claimed as completed:

| Surface | Required manual check | Status |
| --- | --- | --- |
| Chrome | Load the generated release extension, check exact active URL flow, popup result, and no page/DOM URL crawling | REQUIRED |
| Edge | Repeat the Chrome core flow in Edge | REQUIRED |
| Gmail | Open a controlled synthetic/sanitized message and verify extraction, cloud gating, fusion, and popup behavior | REQUIRED; live provider DOM unavailable here |
| Outlook | Same controlled provider acceptance | REQUIRED; live provider DOM unavailable here |
| Yahoo Mail | Same controlled provider acceptance | REQUIRED; live provider DOM unavailable here |

No personal mailbox or live phishing site was used.

## 4. Targeted test evidence

The versioned evidence is in:

- `BANTAI_FUNCTIONAL_REMEDIATION_TRACEABILITY.csv`
- `BANTAI_FUNCTIONAL_REMEDIATION_TEST_RESULTS.csv`

Targeted results:

- Extension endpoint tests: 8 passed.
- Registration capability tests: 3 passed.
- Public-config/closed-pilot API tests: passed.
- Synthetic release CLI verification: passed.
- Disposable MySQL validation: passed.
- Compose template validation: passed.

## 5. Regression evidence

- Root suite: 147 passed.
- Shared-platform suite: 39 passed.
- Web suite: 9 passed.
- Web ESLint: passed.
- Web production build: passed.
- Python compile checks: passed.
- Extension JavaScript syntax checks: passed.
- `scripts/verify_project.py`: passed.
- `scripts/verify_models.py`: passed.
- Alembic heads: `0014_centralized_rate_limits`.

The checked-in release verifier rejecting the development artifact is an intentional guard, not an unexpected regression. The offline SQL command failing at the documented live-inspection boundary is also intentional policy behavior.

## 6. Manual acceptance and release actions

Before release, an operator must:

1. Replace the proxy CIDR placeholder with the actual private Caddy source network.
2. Configure and verify a release extension artifact against the real HTTPS API origin.
3. Run the Chrome and Edge core acceptance matrix.
4. Run controlled Gmail, Outlook, and Yahoo Mail DOM acceptance if provider accounts are available; otherwise record the provider checks as outstanding manual acceptance.
5. Confirm remote runtime settings keep public registration disabled and provision authorized users through the administrator workflow.

## 7. ML/model contract verification

The frozen model verification passed, including the exact email calibration temperature and threshold, 512-token head/tail preprocessing, grouped URL artifact and SHA-256, URL threshold, and model identity. The remediation did not touch model weights, dataset files, threshold constants, or deterministic fusion logic.

## 8. Known limitations

- Interactive Chrome/Edge behavior was not exercised in this environment.
- Live Gmail/Outlook/Yahoo DOM extraction was not exercised.
- Offline Alembic SQL generation is not supported; deployment migrations must run online against MySQL.
- The checked-in extension remains a development artifact by design until an operator generates and verifies the release artifact.

## 9. Recommendation

READY WITH MANUAL RELEASE ACTIONS
