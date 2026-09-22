# Development Commands

## Verify source and frozen invariants

```powershell
python scripts\verify_project.py
```

## Create and activate a virtual environment

```powershell
py -3.12 -m venv .venv
Set-ExecutionPolicy -Scope Process Bypass -Force
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip setuptools wheel
python -m pip install -r backend\requirements.txt
```

## Copy the existing trained models into this project

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\scripts\models\MIGRATE_EXISTING_MODELS.ps1
python scripts\verify_models.py
```

## Configure and start the remote server stack

```powershell
Copy-Item .env.example .env
# Replace every placeholder in .env, then:
docker compose config
docker compose build detector migration platform
docker compose up -d
```

This starts the public HTTPS gateway and the private platform, detector, and
MySQL services. Only Caddy publishes ports 80/443. The detector and database
are isolated on internal networks. End users never run this stack.

Production runs migrations in the one-shot `migration` service with the
`bantai_migration` role, then starts the long-running platform with the
least-privilege `bantai_runtime` role. To apply the same migration manually
from the project root, with the migration environment configured, run:

```powershell
python -m alembic -c shared_platform\alembic.ini upgrade head
```

Revision `0012_remote_server_inference` records one automatic-sampling decision
per completed remote detection. Revision `0011_contracts_ops` adds cloud operational state,
latency, review-reason history, email activity linkage, and model-identifier
capacity. Revisions 0005 and 0008 also use Alembic batch mode so fresh and
existing SQLite verification databases can reach the current head.

The legacy direct-Python launcher remains available for detector development
only:

```powershell
.\backend\START_BANTAI_V1_1.ps1 `
  -TextModelDir "D:\custom\full_taglish_xlmr_512_headtail_seed13" `
  -RfModelPath "D:\custom\bantai_rf_grouped_v1.0.0.joblib"
```

## Configure the extension for a hosted test API

```powershell
python scripts\configure_remote_endpoint.py https://api.example.org/api/v1
```

For a release ZIP, the endpoint must be supplied explicitly (or through
`BANTAI_PUBLIC_API_ORIGIN`). The packaging gate stages a copy and refuses to
write an artifact until release mode, HTTPS, host permissions, and CSP all
validate:

```powershell
python scripts\package_extension.py `
  --endpoint https://api.example.org/api/v1 `
  --output dist\signalam-extension-release.zip
```

## Run the migrated stack with the local web preview

The local integration override is explicit and loopback-only; it is not the
production deployment configuration. It preserves the existing
`bantai_bantai_mysql` volume, upgrades its Alembic revision, and runs the same
authenticated platform-to-detector path used in production:

```powershell
docker compose -f docker-compose.local.yml up -d --build
Push-Location web
Copy-Item .env.example .env.local
# Set BANTAI_API_ORIGIN=http://127.0.0.1:8080 and
# BANTAI_ALLOW_HTTP_LOOPBACK=true.
npm run dev
Pop-Location
```

The HTTP exception is accepted only when the override is explicitly enabled
and the API hostname is `localhost`, `127.0.0.1`, or `::1`. Production remains
HTTPS-only and uses `docker-compose.yml`.

This command updates the single release API configuration and matching narrow
Manifest/CSP origin. The checked-in `.invalid` endpoint must not be packaged as
a release.

## Test the legacy detector directly (development only)

```powershell
python backend\test_client.py
```

## Load the extension

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked**.
4. Choose the `extension` folder.
5. Refresh Gmail, Outlook, and Yahoo Mail.

After server or extension updates, restart the platform, detector, and gateway,
then select **Reload** for Signalam on the Extensions page. Open the web **Help**
page for pairing, device revocation, supported-provider, and troubleshooting
steps.

## Run all source, API, and web checks

```powershell
python scripts\verify_models.py
python scripts\verify_project.py
python -m unittest discover -s tests -v
python -m unittest discover -s shared_platform\tests -v
python -m py_compile backend\server.py backend\email_model.py backend\bantai_inference.py backend\extract_url_features.py backend\prepare_bantai_dataset.py backend\bantai_rf_url_model_v4b_runtime.py backend\test_client.py
node --check extension\background\service-worker.js
node --check extension\content\gmail-extractor.js
node --check extension\content\outlook-extractor.js
node --check extension\content\yahoo-extractor.js
node --check extension\popup\popup.js
Push-Location web
npm run lint
npm test
Pop-Location
```

The web `test` script performs its own production build. Tests use synthetic
content and mocked provider responses; never put a live provider call in the
automated suite.

## Initialize Git for Codex

```powershell
.\scripts\codex\INITIALIZE_CODEX_REPOSITORY.ps1 -CreateInitialCommit
```

## Start Codex CLI

```powershell
.\scripts\codex\START_CODEX.ps1
```
