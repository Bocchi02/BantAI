param(
    [string]$SourceTextModelDir = "D:\COOOODE\Capstone\Models\Email Model\checkpoints\phase4\full_taglish_xlmr_512_headtail_seed13\best_model",

    [string]$SourceCalibrationPath = "D:\COOOODE\Capstone\Models\Email Model\deployment\full_taglish_xlmr_512_headtail_seed13\calibration.json",

    [string]$SourceRfModelPath = "D:\COOOODE\Capstone\Models\Random Forest\release\bantai-rf-grouped-v1.0.0\bantai_rf_grouped_final.joblib",

    [switch]$ReplaceExisting
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path "$PSScriptRoot\..\.."

$DestinationTextModelDir = Join-Path `
    $ProjectRoot `
    "models\email_text_xlmr_v2\full_taglish_xlmr_512_headtail_seed13"

$DestinationCalibrationPath = Join-Path `
    $DestinationTextModelDir `
    "calibration.json"

$LegacyTextModelDir = Join-Path `
    $ProjectRoot `
    "models\email_text_xlmr_v1\checkpoint-15666"

$LegacyTextArchiveDir = Join-Path `
    $ProjectRoot `
    "models\email_text_xlmr_v1\rollback_archive\checkpoint-15666"

$DestinationRfModelDir = Join-Path `
    $ProjectRoot `
    "models\url_random_forest_grouped_v1"

$DestinationRfModelPath = Join-Path `
    $DestinationRfModelDir `
    "bantai_rf_grouped_v1.0.0.joblib"

$ExpectedRfHash = "4FD1417FBCA11CC60A1EB1F16E9F71C1DB0D76F6CE042FEAE5ABCC2BDE528C4C"

function Get-RelativeFileHashes {
    param(
        [Parameter(Mandatory=$true)]
        [string]$RootPath
    )

    $ResolvedRoot = (
        Resolve-Path -LiteralPath $RootPath
    ).Path

    $Hashes = @{}

    Get-ChildItem `
        -LiteralPath $ResolvedRoot `
        -Recurse `
        -File |
    ForEach-Object {
        $Relative = $_.FullName.Substring(
            $ResolvedRoot.Length
        ).TrimStart(
            [System.IO.Path]::DirectorySeparatorChar,
            [System.IO.Path]::AltDirectorySeparatorChar
        )

        $Hashes[$Relative] = (
            Get-FileHash `
                -LiteralPath $_.FullName `
                -Algorithm SHA256
        ).Hash
    }

    return $Hashes
}

function Compare-HashMaps {
    param(
        [Parameter(Mandatory=$true)]
        [hashtable]$Source,

        [Parameter(Mandatory=$true)]
        [hashtable]$Destination
    )

    if ($Source.Count -ne $Destination.Count) {
        return $false
    }

    foreach ($Key in $Source.Keys) {
        if (-not $Destination.ContainsKey($Key)) {
            return $false
        }

        if ($Source[$Key] -ne $Destination[$Key]) {
            return $false
        }
    }

    return $true
}

if (-not (Test-Path -LiteralPath $SourceTextModelDir -PathType Container)) {
    throw "Source email model directory was not found: $SourceTextModelDir"
}

if (-not (Test-Path -LiteralPath $SourceCalibrationPath -PathType Leaf)) {
    throw "Source email calibration contract was not found: $SourceCalibrationPath"
}

if (-not (Test-Path -LiteralPath $SourceRfModelPath -PathType Leaf)) {
    throw "Source RF model file was not found: $SourceRfModelPath"
}

if (
    (Test-Path -LiteralPath $LegacyTextModelDir -PathType Container) -and
    (Test-Path -LiteralPath $LegacyTextArchiveDir -PathType Container)
) {
    throw "Both the former active legacy path and rollback archive exist. Resolve the duplicate before migration."
}

if (Test-Path -LiteralPath $LegacyTextModelDir -PathType Container) {
    New-Item `
        -ItemType Directory `
        -Path (Split-Path $LegacyTextArchiveDir -Parent) `
        -Force |
    Out-Null

    Move-Item `
        -LiteralPath $LegacyTextModelDir `
        -Destination $LegacyTextArchiveDir

    Write-Host "Archived the previous email checkpoint for explicit rollback only." -ForegroundColor Yellow
}

New-Item `
    -ItemType Directory `
    -Path (Split-Path $DestinationTextModelDir -Parent) `
    -Force |
Out-Null

New-Item `
    -ItemType Directory `
    -Path $DestinationRfModelDir `
    -Force |
Out-Null

if (Test-Path -LiteralPath $DestinationTextModelDir) {
    $ExistingFiles = Get-ChildItem `
        -LiteralPath $DestinationTextModelDir `
        -File `
        -Recurse `
        -ErrorAction SilentlyContinue |
    Where-Object {
        $_.Name -notlike "PLACE_*"
    }

    if ($ExistingFiles -and -not $ReplaceExisting) {
        throw @"
The destination email model folder already contains model files:
$DestinationTextModelDir

Run again with -ReplaceExisting to replace them.
"@
    }

    if ($ReplaceExisting) {
        Remove-Item `
            -LiteralPath $DestinationTextModelDir `
            -Recurse `
            -Force
    }
}

if (
    (Test-Path -LiteralPath $DestinationRfModelPath) -and
    (-not $ReplaceExisting)
) {
    throw @"
The destination RF model already exists:
$DestinationRfModelPath

Run again with -ReplaceExisting to replace it.
"@
}

Write-Host ""
Write-Host "Copying frozen XLM-R checkpoint..." -ForegroundColor Cyan

Copy-Item `
    -LiteralPath $SourceTextModelDir `
    -Destination $DestinationTextModelDir `
    -Recurse `
    -Force

Copy-Item `
    -LiteralPath $SourceCalibrationPath `
    -Destination $DestinationCalibrationPath `
    -Force

Write-Host "Copying frozen RF model..." -ForegroundColor Cyan

Copy-Item `
    -LiteralPath $SourceRfModelPath `
    -Destination $DestinationRfModelPath `
    -Force

Write-Host ""
Write-Host "Verifying SHA-256 hashes..." -ForegroundColor Cyan

$SourceTextHashes = Get-RelativeFileHashes `
    -RootPath $SourceTextModelDir

$DestinationTextHashes = Get-RelativeFileHashes `
    -RootPath $DestinationTextModelDir

$DestinationTextHashes.Remove("calibration.json")

if (
    -not (
        Compare-HashMaps `
            -Source $SourceTextHashes `
            -Destination $DestinationTextHashes
    )
) {
    throw "The copied email checkpoint does not match the source checkpoint."
}

$SourceCalibrationHash = (
    Get-FileHash `
        -LiteralPath $SourceCalibrationPath `
        -Algorithm SHA256
).Hash

$DestinationCalibrationHash = (
    Get-FileHash `
        -LiteralPath $DestinationCalibrationPath `
        -Algorithm SHA256
).Hash

if ($SourceCalibrationHash -ne $DestinationCalibrationHash) {
    throw "The copied email calibration contract does not match the source."
}

$SourceRfHash = (
    Get-FileHash `
        -LiteralPath $SourceRfModelPath `
        -Algorithm SHA256
).Hash

$DestinationRfHash = (
    Get-FileHash `
        -LiteralPath $DestinationRfModelPath `
        -Algorithm SHA256
).Hash

if ($SourceRfHash -ne $DestinationRfHash) {
    throw "The copied RF model does not match the source RF model."
}

if ($DestinationRfHash -ne $ExpectedRfHash) {
    throw "BantAI RF Grouped v1.0.0 SHA-256 mismatch. Expected $ExpectedRfHash, found $DestinationRfHash."
}

Write-Host ""
Write-Host "Model migration completed successfully." -ForegroundColor Green
Write-Host "Email model: $DestinationTextModelDir"
Write-Host "RF model:    $DestinationRfModelPath"
Write-Host ""
Write-Host "Next commands:"
Write-Host "python scripts\verify_models.py"
Write-Host ".\START_BANTAI.ps1"
