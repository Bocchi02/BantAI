from pathlib import Path
from PyInstaller.utils.hooks import collect_all

root = Path(SPECPATH).parent.parent
hiddenimports = []
datas = []
binaries = []
for package in ("transformers", "torch", "sklearn", "google.genai"):
    package_datas, package_binaries, package_hidden = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hidden

a = Analysis(
    [str(root / "companion" / "app.py")],
    pathex=[str(root), str(root / "backend")],
    binaries=binaries,
    datas=[
        (str(root / "backend"), "backend"),
        (str(root / "models"), "models"),
    ] + datas,
    hiddenimports=hiddenimports + ["server", "companion", "llm.remote_provider"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name="SignalamCompanion", console=False, icon=None)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=True, name="SignalamCompanion")
