param(
    [string]$TextModelDir = "",
    [string]$RfModelPath = "",
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

Write-Warning "START_BANTAI_V1_0.ps1 is retained as a compatibility launcher. Starting Signalam v1.1.0."

$Launcher = Join-Path $PSScriptRoot "START_BANTAI_V1_1.ps1"

& $Launcher `
    -TextModelDir $TextModelDir `
    -RfModelPath $RfModelPath `
    -Port $Port
