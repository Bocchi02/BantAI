param(
    [int]$Port = 8000
)

$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot
$BackendLauncher = Join-Path `
    $ProjectRoot `
    "backend\START_BANTAI_V1_0.ps1"

& $BackendLauncher -Port $Port
