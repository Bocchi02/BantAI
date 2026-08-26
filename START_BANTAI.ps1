param([switch]$NoBuild)

$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
Set-Location $ProjectRoot

$Docker = Get-Command docker -ErrorAction SilentlyContinue
if ($null -eq $Docker) {
    throw "Docker Desktop is required to start BantAI. Install or start Docker Desktop, then try again."
}

& $Docker.Source info *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Docker Desktop is not ready. Start Docker Desktop, then try again."
}

$Python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
if (Test-Path -LiteralPath $Python -PathType Leaf) {
    & $Python "scripts\verify_models.py"
    if ($LASTEXITCODE -ne 0) {
        throw "BantAI model verification failed."
    }
}

$ComposeArguments = @("compose", "up", "-d")
if (-not $NoBuild) {
    $ComposeArguments += "--build"
}

& $Docker.Source @ComposeArguments
if ($LASTEXITCODE -ne 0) {
    throw "BantAI Docker services could not be started."
}

Write-Host "BantAI services are starting in Docker." -ForegroundColor Green
Write-Host "Web platform API: http://127.0.0.1:8080"
Write-Host "Detector Companion: http://127.0.0.1:8000"
