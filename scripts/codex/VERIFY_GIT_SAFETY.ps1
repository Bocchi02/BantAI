$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path "$PSScriptRoot\..\.."
Set-Location $ProjectRoot

if (-not (Test-Path ".git")) {
    throw "This folder is not yet a Git repository."
}

$Tracked = git ls-files

$Unsafe = $Tracked | Where-Object {
    $_ -match '\.(safetensors|joblib|pkl|pth|pt)$' -or
    $_ -match 'real_world_validation_log.*\.csv$' -or
    $_ -eq '.env'
}

if ($Unsafe) {
    Write-Host "Unsafe tracked files:" -ForegroundColor Red
    $Unsafe | ForEach-Object { Write-Host " - $_" }
    exit 1
}

Write-Host "Git safety check: PASS" -ForegroundColor Green
