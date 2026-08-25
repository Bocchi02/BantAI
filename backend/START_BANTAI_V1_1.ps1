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
        throw "Python was not found. Restore the BantAI .venv environment before starting Companion."
    }
    $PythonExe = $PythonCommand.Source
}

if ([string]::IsNullOrWhiteSpace($TextModelDir)) {
    $TextModelDir = Join-Path `
        $ProjectRoot `
        "models\email_text_xlmr_v1\checkpoint-15666"
}

if ([string]::IsNullOrWhiteSpace($RfModelPath)) {
    $RfModelPath = Join-Path `
        $ProjectRoot `
        "models\url_random_forest_v4b\bantai_rf_url_model_v4b_optimized.joblib"
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
Write-Host "BantAI v1.1 Hybrid AI Decision-Support Server" -ForegroundColor Green
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
    throw "BantAI Companion stopped unexpectedly with exit code $LASTEXITCODE."
}
