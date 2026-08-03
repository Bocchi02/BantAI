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

## Start the local backend

```powershell
.\START_BANTAI.ps1
```

Optional custom model paths are still supported:

```powershell
.\backend\START_BANTAI_V1_0.ps1 `
  -TextModelDir "D:\custom\checkpoint-15666" `
  -RfModelPath "D:\custom\bantai_rf_url_model_v4b_optimized.joblib"
```

## Test the API after the server starts

```powershell
python backend\test_client.py
```

## Load the extension

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked**.
4. Choose the `extension` folder.
5. Refresh Gmail, Outlook, and Yahoo Mail.

## Initialize Git for Codex

```powershell
.\scripts\codex\INITIALIZE_CODEX_REPOSITORY.ps1 -CreateInitialCommit
```

## Start Codex CLI

```powershell
.\scripts\codex\START_CODEX.ps1
```
