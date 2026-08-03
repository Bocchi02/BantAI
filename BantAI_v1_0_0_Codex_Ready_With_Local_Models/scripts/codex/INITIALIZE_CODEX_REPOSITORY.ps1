param(
    [switch]$CreateInitialCommit
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path "$PSScriptRoot\..\.."

Set-Location $ProjectRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "Git is not installed or is not available in PATH."
}

if (-not (Test-Path ".git")) {
    git init
}

Write-Host ""
Write-Host "Running BantAI verification..." -ForegroundColor Cyan
python scripts\verify_project.py

if ($LASTEXITCODE -ne 0) {
    throw "Project verification failed. Git staging was stopped."
}

$SensitiveMatches = Get-ChildItem -Recurse -File |
    Where-Object {
        (
            $_.Name -like 'real_world_validation_log*.csv' -or
            $_.Name -eq '.env'
        ) -and
        $_.FullName -notlike "$ProjectRoot\models\*"
    }

if ($SensitiveMatches) {
    Write-Host ""
    Write-Host "Private files were found:" -ForegroundColor Red
    $SensitiveMatches | ForEach-Object {
        Write-Host " - $($_.FullName)"
    }

    throw "Remove or relocate the listed private files before initializing the repository."
}

git add .

$StagedModelBinaries = git diff --cached --name-only |
    Where-Object {
        $_ -match '\.(safetensors|joblib|pkl|pth|pt|bin)$'
    }

if ($StagedModelBinaries) {
    Write-Host ""
    Write-Host "Model binaries were unexpectedly staged:" -ForegroundColor Red
    $StagedModelBinaries | ForEach-Object {
        Write-Host " - $_"
    }

    throw "Model binaries must remain local and ignored by Git."
}

Write-Host ""
Write-Host "Files staged for the Codex-ready repository:" -ForegroundColor Green
git status --short

if ($CreateInitialCommit) {
    git commit -m "Initialize BantAI v1.0.0 Codex-ready repository"

    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "Git could not create the commit. Configure your local Git name and email, then retry:" -ForegroundColor Yellow
        Write-Host 'git config user.name "Your Name"'
        Write-Host 'git config user.email "you@example.com"'
        exit 1
    }
}

Write-Host ""
Write-Host "Codex repository preparation completed." -ForegroundColor Green
