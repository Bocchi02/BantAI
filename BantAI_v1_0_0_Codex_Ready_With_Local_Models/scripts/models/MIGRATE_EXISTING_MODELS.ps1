param(
    [string]$SourceTextModelDir = "D:\COOOODE\Capstone\Codes\Text_Detection\meajor_cleaned_preprocessed_audit\meajor_training_ready_splits\external_validation_prepared\checkpoint-15666",

    [string]$SourceRfModelPath = "D:\COOOODE\Capstone\Codes\URL_Detection\rf_model_v4b-final\rf_url_model_v4b\bantai_rf_url_model_v4b_optimized.joblib",

    [switch]$ReplaceExisting
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path "$PSScriptRoot\..\.."

$DestinationTextModelDir = Join-Path `
    $ProjectRoot `
    "models\email_text_xlmr_v1\checkpoint-15666"

$DestinationRfModelDir = Join-Path `
    $ProjectRoot `
    "models\url_random_forest_v4b"

$DestinationRfModelPath = Join-Path `
    $DestinationRfModelDir `
    "bantai_rf_url_model_v4b_optimized.joblib"

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

if (-not (Test-Path -LiteralPath $SourceRfModelPath -PathType Leaf)) {
    throw "Source RF model file was not found: $SourceRfModelPath"
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

if (
    -not (
        Compare-HashMaps `
            -Source $SourceTextHashes `
            -Destination $DestinationTextHashes
    )
) {
    throw "The copied email checkpoint does not match the source checkpoint."
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

Write-Host ""
Write-Host "Model migration completed successfully." -ForegroundColor Green
Write-Host "Email model: $DestinationTextModelDir"
Write-Host "RF model:    $DestinationRfModelPath"
Write-Host ""
Write-Host "Next commands:"
Write-Host "python scripts\verify_models.py"
Write-Host ".\START_BANTAI.ps1"
