$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path "$PSScriptRoot\..\.."

if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    throw "Codex CLI is not installed. Run scripts\codex\INSTALL_CODEX_CLI.ps1 or open this folder in the Codex app/IDE."
}

Set-Location $ProjectRoot

python scripts\verify_project.py

if ($LASTEXITCODE -ne 0) {
    throw "BantAI verification failed. Fix the baseline before starting Codex."
}

codex
