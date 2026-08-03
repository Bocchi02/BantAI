$ErrorActionPreference = "Stop"

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    throw "npm is not installed. Install Node.js first or use the Codex app/IDE."
}

npm install -g @openai/codex

if ($LASTEXITCODE -ne 0) {
    throw "Codex CLI installation failed."
}

Write-Host ""
Write-Host "Codex CLI installed." -ForegroundColor Green
Write-Host "Next command:"
Write-Host "codex --login"
