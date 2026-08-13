$ErrorActionPreference = "Stop"
$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

python (Join-Path $ProjectRoot "scripts\verify_models.py")
python -m pip install -r (Join-Path $ProjectRoot "backend\requirements.txt") -r (Join-Path $PSScriptRoot "requirements-build.txt")
python -m PyInstaller --noconfirm --clean (Join-Path $PSScriptRoot "BantAICompanion.spec")

$Executable = Join-Path $PSScriptRoot "dist\BantAICompanion\BantAICompanion.exe"
if ($env:BANTAI_SIGNING_CERT_THUMBPRINT) {
    & signtool sign /sha1 $env:BANTAI_SIGNING_CERT_THUMBPRINT /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $Executable
}

if (Get-Command iscc -ErrorAction SilentlyContinue) {
    & iscc (Join-Path $PSScriptRoot "installer.iss")
    $Installer = Join-Path $PSScriptRoot "installer-output\BantAICompanionSetup.exe"
    if ($env:BANTAI_SIGNING_CERT_THUMBPRINT) {
        & signtool sign /sha1 $env:BANTAI_SIGNING_CERT_THUMBPRINT /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 $Installer
    }
}
