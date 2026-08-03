# Migrate BantAI to Codex

This package is prepared for Codex through:

- root and scoped `AGENTS.md` files;
- a privacy-safe `.gitignore`;
- source verification scripts;
- architecture context;
- task prompt templates;
- PowerShell helpers for Git and Codex CLI.

## Option A — Codex desktop app or IDE extension

1. Extract this ZIP.
2. Open the extracted `BantAI_v1_0_0_Codex_Ready` folder as the project.
3. Ask Codex:

```text
Read AGENTS.md and CODEX_PROJECT_CONTEXT.md. Review the repository without
editing files. Explain the URL detector flow, email detector flow, frozen
constraints, and available verification commands.
```

4. Review Codex's explanation before authorizing edits.

## Option B — Codex CLI

Install Codex CLI:

```powershell
npm install -g @openai/codex
```

Sign in:

```powershell
codex --login
```

Open this project in PowerShell:

```powershell
cd "D:\path\to\BantAI_v1_0_0_Codex_Ready"
codex
```

The project-level `AGENTS.md` gives Codex the required BantAI constraints.

## Prepare local Git history

From the project root:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\scripts\codex\INITIALIZE_CODEX_REPOSITORY.ps1
```

The script:

- initializes Git if needed;
- stages only files permitted by `.gitignore`;
- checks for large/private files;
- creates an optional initial commit when `-CreateInitialCommit` is supplied.

Example:

```powershell
.\scripts\codex\INITIALIZE_CODEX_REPOSITORY.ps1 -CreateInitialCommit
```

## Validate the source baseline

```powershell
python scripts\verify_project.py
```

Expected result:

```text
BantAI Codex migration verification: PASS
```

## Store models inside the local project

The Codex-ready project now contains local model folders. Copy the existing
trained models with:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
.\scripts\models\MIGRATE_EXISTING_MODELS.ps1
```

The script uses the existing BantAI model paths as defaults, copies the files
into the project, and verifies SHA-256 hashes.

Expected local paths:

```text
models/email_text_xlmr_v1/checkpoint-15666/
models/url_random_forest_v4b/bantai_rf_url_model_v4b_optimized.joblib
```

The model binaries are ignored by Git. Do not commit them to a public or cloud
repository. Validation logs and private screenshots also remain excluded.

## Recommended first Codex workflow

1. Ask Codex to review only.
2. Run the baseline verification.
3. Create a Git checkpoint.
4. Request one small change at a time.
5. Require Codex to run `python scripts\verify_project.py`.
6. Review the diff before accepting it.
7. Test the extension manually in Chrome or Edge.

## Windows note

The Codex CLI may be used from a terminal. When a Windows CLI setup has
compatibility problems, open the same repository through the Codex app/IDE or
through WSL while keeping private model files and validation data outside the
repository.
