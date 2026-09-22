#define MyAppName "Signalam Companion"
#define MyAppVersion "1.0.0"
#define MyAppExeName "SignalamCompanion.exe"

[Setup]
AppId={{DD8C6F53-055E-4E3B-BF50-8B4085D8BF08}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
DefaultDirName={localappdata}\Programs\Signalam Companion
PrivilegesRequired=lowest
OutputDir=installer-output
OutputBaseFilename=SignalamCompanionSetup
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Files]
Source: "dist\SignalamCompanion\*"; DestDir: "{app}"; Flags: recursesubdirs ignoreversion

[Icons]
Name: "{autoprograms}\Signalam Companion"; Filename: "{app}\{#MyAppExeName}"

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "SignalamCompanion"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "Start Signalam Companion"; Flags: nowait postinstall skipifsilent
