param(
    [switch]$DoNotStart
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Launcher = Join-Path $ProjectRoot "backend\START_BANTAI_V1_1.ps1"
$PythonExe = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$EmailModel = Join-Path $ProjectRoot "models\email_text_xlmr_v2\full_taglish_xlmr_512_headtail_seed13"
$UrlModel = Join-Path $ProjectRoot "models\url_random_forest_grouped_v1\bantai_rf_grouped_v1.0.0.joblib"

foreach ($RequiredFile in @($Launcher, $PythonExe, $UrlModel)) {
    if (-not (Test-Path -LiteralPath $RequiredFile -PathType Leaf)) {
        throw "BantAI Companion cannot be enabled because a required file is missing: $RequiredFile"
    }
}

if (-not (Test-Path -LiteralPath $EmailModel -PathType Container)) {
    throw "BantAI Companion cannot be enabled because the email model directory is missing: $EmailModel"
}

$PowerShellExe = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$StartupCommand = '"{0}" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{1}"' -f $PowerShellExe, $Launcher
$RunKey = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"

New-Item -Path $RunKey -Force | Out-Null
New-ItemProperty `
    -Path $RunKey `
    -Name "BantAICompanion" `
    -Value $StartupCommand `
    -PropertyType String `
    -Force | Out-Null

if (-not $DoNotStart) {
    $AlreadyRunning = $false
    try {
        $Health = Invoke-RestMethod -Uri "http://127.0.0.1:8000/health" -TimeoutSec 2
        $AlreadyRunning = $Health.version -eq "1.1.0"
    }
    catch {
        $AlreadyRunning = $false
    }

    if (-not $AlreadyRunning) {
        Start-Process `
            -FilePath $PowerShellExe `
            -ArgumentList @(
                "-NoProfile",
                "-WindowStyle", "Hidden",
                "-ExecutionPolicy", "Bypass",
                "-File", ('"{0}"' -f $Launcher)
            ) `
            -WindowStyle Hidden
    }
}

Write-Host "BantAI Companion startup is enabled for the current Windows account."
