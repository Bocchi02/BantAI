Signalam v1.1.0 — Remote Hybrid AI Decision-Support

OVERVIEW
--------
Signalam checks the exact active address-bar URL and visible opened-email content
from Gmail, Outlook, or Yahoo through an authenticated HTTPS service. End users
need the browser extension and a Signalam account. They do not need Python,
Docker, local model files, a local FastAPI service, or Signalam Companion.

BRANDING COMPATIBILITY
----------------------
The web interface, extension, API descriptions, installer, exports, and release
package now use the Signalam name. Existing BANTAI_* environment variables,
browser storage keys, session cookies, database names, Docker volume names,
device credential identifiers, and frozen model identifiers are retained as
compatibility keys. Do not rename or delete those values in an existing
installation: doing so can disconnect paired browsers or hide existing data.

The frozen server models remain unchanged:

- Email: full_taglish_xlmr_512_headtail_seed13; temperature scaling
  2.2198894341340183; suspicious threshold 0.6923658179915227; 512-token
  subject_head_tail preprocessing with subject budget 96, subject tail 0.25,
  body tail 0.35, and body cleaning disabled.
- URL: BantAI RF Grouped v1.0.0; bantai_lexical_v1; 52 features; threshold
  0.547; SHA-256
  4fd1417fbca11cc60a1eb1f16e9f71c1db0d76f6ce042feae5abcc2bde528c4c.
  Shadow/non-blocking mode remains on and enforcement remains off.

Signalam supports decisions. NO STRONG WARNING SIGNS means no strong warning sign
was detected by the completed module; it is not a guarantee that a website or
email is legitimate. Gemini is contextual evidence only and cannot create the
final red email outcome by itself. Deterministic fusion still requires two
independent suspicious sources for SUSPICIOUS SIGNS FOUND.

PRIVACY AND SCOPE
-----------------
The exact `tab.url` and supported opened-email content travel over HTTPS to the
Signalam server for inference. Raw routine inputs remain transient: they are not
written to application/access logs, activity records, or durable queues. URL
activity stores only the normalized origin; email activity stores provider,
sender, and subject metadata, never the routine body.

Gemini receives only a minimized URL origin after an RF warning or bounded
email context after best-effort redaction. Full URL feedback, encrypted email
reports, and opted-in automatic samples remain separate explicit workflows.
The extension never scans embedded links, HTML, page content, redirects, TLS,
attachments, or unsupported mail providers.

SERVER DEPLOYMENT
-----------------
The production Compose stack contains:

- `gateway`: public Caddy HTTPS endpoint on ports 80/443;
- `platform`: authenticated public application API, private behind Caddy;
- `detector`: private one-worker RF/XLM-R/indicator/fusion service;
- `mysql`: private shared database.

Only Caddy publishes ports. The detector and database live on separate internal
networks reachable through the platform. The detector has a narrowly separated
egress network for backend-only Gemini calls. Caddy and Uvicorn access logging
are disabled for request inputs.

The Git clone contains model manifests, not model binaries. Before building,
transfer only the frozen active runtime files to their documented `models/`
paths through a private channel. Do not transfer rollback checkpoints,
optimizer files, or private datasets. Once detector Python dependencies are
available, run `python scripts/verify_models.py` to verify the exact artifacts.

The detector Dockerfile copies only calibration/config, tokenizer files, the
two safetensors shards and index, the RF artifact, and its manifest. Offline
Transformer variables prevent runtime downloads. `.dockerignore` excludes
rollback models, training checkpoints, optimizer files, private datasets, and
unrelated artifacts. Do not publish the model-containing detector image to a
public registry.

Copy `.env.example` to `.env` on the server and replace every placeholder. A
real deployment requires:

  BANTAI_API_DOMAIN
  BANTAI_WEB_ORIGIN
  BANTAI_EXTENSION_ORIGIN
  BANTAI_DB_RUNTIME_PASSWORD
  BANTAI_DB_MIGRATION_PASSWORD
  BANTAI_DB_ROOT_PASSWORD
  BANTAI_INTERNAL_API_KEY
  BANTAI_ENCRYPTION_KEY
  GEMINI_API_KEY

The domain must resolve to the server and ports 80/443 must be reachable so
Caddy can obtain and renew a trusted certificate. Then run:

  docker compose config
  docker compose build detector migration platform
  docker compose up -d
  docker compose ps
  curl https://<BANTAI_API_DOMAIN>/live
  curl https://<BANTAI_API_DOMAIN>/ready

The separately hosted web interface must set `BANTAI_API_ORIGIN` to
`https://<BANTAI_API_DOMAIN>` and keep `NEXT_PUBLIC_BANTAI_API_URL=/api/v1`.
Its worker proxies that same-origin path to the API so session and CSRF cookies
work without exposing backend credentials. Configure the platform's
`BANTAI_WEB_ORIGIN` to the exact hosted dashboard origin. Set
`BANTAI_TRUSTED_PROXY_CIDRS` to the private CIDR or address from which Caddy
connects to the platform. This value is required because the rate limiter only
trusts forwarded client identity from that configured proxy source; replace the
documentation placeholder in `.env.example` with the deployment-specific
private network and do not use a public client range.

Production uses a short-lived migration service with the migration role before
the long-running platform starts with the least-privilege runtime role. Migrations
are supported online against the running MySQL database; offline
`alembic upgrade --sql` generation is intentionally not supported because some
compatibility migrations inspect the live schema before changing it. Restart the
platform, detector, and gateway after updating. `/live` is process liveness;
`/ready` checks the database and actual server model loading. Do not run multiple
detector workers unless the host is intentionally sized for multiple complete
XLM-R copies.

EXTENSION RELEASE CONFIGURATION
-------------------------------
One release-time command configures both the extension API base and its narrow
host/CSP policy:

  .\.venv\Scripts\python.exe scripts\configure_remote_endpoint.py `
    https://api.example.org/api/v1 --mode release
  .\.venv\Scripts\python.exe scripts\verify_extension_release.py
  .\.venv\Scripts\python.exe scripts\package_extension.py `
    --endpoint https://api.example.org/api/v1 `
    --output dist\signalam-extension-release.zip

The packaging command stages a copy, regenerates release configuration, runs
the fail-closed verifier, and only then writes the ZIP. The checked-in
`.invalid` endpoint intentionally cannot reach a server. Replace it before
packaging or loading the release extension. Do not use an HTTP URL or silently
fall back to localhost. For local development, use explicit
`--mode development --allow-http-loopback` with a localhost or 127.0.0.1
endpoint. The endpoint may also be supplied through
`BANTAI_PUBLIC_API_ORIGIN`. After release verification, load the generated
`extension/` artifact in Chrome or Edge 127+ and reload already-open Gmail,
Outlook, and Yahoo tabs.

USER CONNECTION FLOW
--------------------
1. Sign in to the Signalam web dashboard.
2. Open Paired Devices and generate a five-minute one-time code.
3. Open the extension popup and enter the code.
4. The service worker stores only the revocable device credential and restricts
   Chrome storage access to trusted extension contexts.
5. The dashboard reports Browser extension connected separately from Server
   models ready. CORS and host permissions do not replace server authorization.
6. Revoke the device from Paired Devices or disconnect it in the popup. Account
   suspension and revocation reject subsequent requests.

Content scripts only extract supported visible email content and message the
trusted service worker. They never receive the device credential or contact the
remote API.

ACTIVITY, EXPLANATIONS, REPORTS, AND COLLECTION
-----------------------------------------------
The server records each completed detection idempotently. It retains only
permitted origin/email metadata and accurate cloud COMPLETE, SKIPPED, or
UNAVAILABLE state. A bounded ten-minute process-memory store reuses transient
input for explanations. If context expires, is evicted, is lost on restart, or
the request reaches another worker, the response clearly uses metadata-only
fallback. No raw-content retry queue exists.

Feedback is bound to the authenticated account/device and exact detection ID.
Explicit report bodies remain encrypted and unavailable through administrator
body APIs. For opted-in automatic contribution, the server checks current
consent and makes the 10% decision at most once per detection. Selected
prediction samples remain separate from human-approved labels. Opt-out stops
collection and deletes that user's automatic samples.

DEVELOPMENT AND TESTING
-----------------------
Legacy direct detector/Companion tooling remains for clearly marked development
and rollback diagnostics only; it is not part of end-user setup or the default
production request path.

For an explicit loopback integration environment, use
`docker compose -f docker-compose.local.yml up -d --build` and configure
`web/.env.local` with `BANTAI_API_ORIGIN=http://127.0.0.1:8080` plus
`BANTAI_ALLOW_HTTP_LOOPBACK=true`. This exception accepts loopback hosts only;
it is never enabled by the production Compose stack.

Run all checks from the project root:

  .\.venv\Scripts\python.exe scripts\verify_models.py
  .\.venv\Scripts\python.exe scripts\verify_project.py
  .\.venv\Scripts\python.exe -m unittest discover -s tests -v
  .\.venv\Scripts\python.exe -m unittest discover -s shared_platform\tests -v
  node --check extension\background\service-worker.js
  node --check extension\content\gmail-extractor.js
  node --check extension\content\outlook-extractor.js
  node --check extension\content\yahoo-extractor.js
  node --check extension\popup\popup.js
  Push-Location web; npm run lint; npm test; Pop-Location

Automated tests use synthetic data and mocked cloud/detector transport. They
must never make a real Gemini request. A real production domain, external host,
and published extension identity are required for final deployment acceptance;
repository tests do not prove public deployment or browser behavior.
