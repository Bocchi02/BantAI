param(
    [string]$TextModelDir = "",
    [string]$RfModelPath = "",
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

$BackendDir = $PSScriptRoot
$ProjectRoot = Resolve-Path (Join-Path $BackendDir "..")

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

$env:BANTAI_MODEL_DIR = (
    Resolve-Path -LiteralPath $TextModelDir
).Path

$env:BANTAI_RF_MODEL_PATH = (
    Resolve-Path -LiteralPath $RfModelPath
).Path

Set-Location $BackendDir

Write-Host ""
Write-Host "BantAI v1.0 Dual Detector Server" -ForegroundColor Green
Write-Host "================================"
Write-Host "Email model: $env:BANTAI_MODEL_DIR"
Write-Host "URL model:   $env:BANTAI_RF_MODEL_PATH"
Write-Host "Port:        $Port"
Write-Host ""

python -m uvicorn server:app `
    --host 127.0.0.1 `
    --port $Port
