<# LEGACY DEVELOPMENT ONLY: starts the retired local Companion workflow.
   End users connect the extension directly to the remote Signalam API. #>

param(
    [string]$TextModelDir = "",
    [string]$RfModelPath = "",
    [string]$PlatformApi = "http://127.0.0.1:8080",
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

$BackendDir = $PSScriptRoot
$ProjectRoot = Resolve-Path (Join-Path $BackendDir "..")
$VirtualEnvPython = Join-Path $ProjectRoot ".venv\Scripts\python.exe"

if (Test-Path -LiteralPath $VirtualEnvPython -PathType Leaf) {
    $PythonExe = $VirtualEnvPython
}
else {
    $PythonCommand = Get-Command python -ErrorAction SilentlyContinue
    if ($null -eq $PythonCommand) {
        throw "Python was not found. Restore the Signalam .venv environment before starting Companion."
    }
    $PythonExe = $PythonCommand.Source
}

if ([string]::IsNullOrWhiteSpace($TextModelDir)) {
    $TextModelDir = Join-Path `
        $ProjectRoot `
        "models\email_text_xlmr_v2\full_taglish_xlmr_512_headtail_seed13"
}

if ([string]::IsNullOrWhiteSpace($RfModelPath)) {
    $RfModelPath = Join-Path `
        $ProjectRoot `
        "models\url_random_forest_grouped_v1\bantai_rf_grouped_v1.0.0.joblib"
}

if (-not (Test-Path -LiteralPath $TextModelDir -PathType Container)) {
    throw "Email model directory was not found: $TextModelDir"
}

if (-not (Test-Path -LiteralPath $RfModelPath -PathType Leaf)) {
    throw "RF model file was not found: $RfModelPath"
}

$env:BANTAI_MODEL_DIR = (Resolve-Path -LiteralPath $TextModelDir).Path
$env:BANTAI_RF_MODEL_PATH = (Resolve-Path -LiteralPath $RfModelPath).Path

if (-not [string]::IsNullOrWhiteSpace($PlatformApi)) {
    $env:BANTAI_PLATFORM_API = $PlatformApi.TrimEnd("/")
}

Set-Location $BackendDir

Write-Host ""
Write-Host "Signalam v1.1 Hybrid AI Decision-Support Server" -ForegroundColor Green
Write-Host "=============================================="
Write-Host "Email model: $env:BANTAI_MODEL_DIR"
Write-Host "URL model:   $env:BANTAI_RF_MODEL_PATH"
Write-Host "Platform:    $env:BANTAI_PLATFORM_API"
Write-Host "Cloud reviews run automatically after local model warnings."
Write-Host "Runtime:     $PythonExe"
Write-Host "Port:        $Port"
Write-Host ""

& $PythonExe -m uvicorn server:app `
    --host 127.0.0.1 `
    --port $Port `
    --no-access-log

if ($LASTEXITCODE -ne 0) {
    throw "Signalam Companion stopped unexpectedly with exit code $LASTEXITCODE."
}
