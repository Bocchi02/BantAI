#define MyAppName "BantAI Companion"
#define MyAppVersion "1.0.0"
#define MyAppExeName "BantAICompanion.exe"

[Setup]
AppId={{DD8C6F53-055E-4E3B-BF50-8B4085D8BF08}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={localappdata}\Programs\BantAI Companion
PrivilegesRequired=lowest
OutputDir=installer-output
OutputBaseFilename=BantAICompanionSetup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "dist\BantAICompanion\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\BantAI Companion"; Filename: "{app}\{#MyAppExeName}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "BantAICompanion"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Start BantAI Companion"; Flags: nowait postinstall skipifsilent
