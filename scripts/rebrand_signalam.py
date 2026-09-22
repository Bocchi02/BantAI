"""Apply the product-name migration without changing frozen model or protocol IDs.

The old spelling remains in a few serialized identifiers so existing installs,
database records, and model contracts continue to work after the UI rebrand.
"""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOTS = (
    ROOT / "web" / "app",
    ROOT / "web" / "tests",
    ROOT / "extension",
    ROOT / "backend",
    ROOT / "shared_platform" / "app",
    ROOT / "shared_platform" / "tests",
    ROOT / "companion",
)
CURRENT_DOCUMENTS = (
    "AGENTS.md",
    "ARCHITECTURE.txt",
    "CODEX_PROJECT_CONTEXT.md",
    "CODEX_MIGRATION_GUIDE.md",
    "DEVELOPMENT_COMMANDS.md",
    "README.txt",
    "TEST_CHECKLIST.txt",
    "WEB_PLATFORM_MVP.md",
    "backend/AGENTS.md",
    "extension/AGENTS.md",
    "deploy/LOCAL_EXTENSION.md",
    "web/README.md",
    "shared_platform/README.md",
)
SOURCE_SUFFIXES = {".js", ".jsx", ".mjs", ".html", ".json", ".py", ".iss", ".spec", ".ps1"}
SKIP_PARTS = {"node_modules", ".venv", "__pycache__", "dist", "build"}
FROZEN_OR_COMPATIBLE = (
    "BantAI RF Grouped",
    "BantAI calibrated XLM-RoBERTa Email Model",
    "BantAIInference",
    "BantAISenderAuthentication",
    "X-BantAI-Internal-Key",
    'CREDENTIAL_SERVICE = "BantAI Companion"',
    'Path(local_data) / "BantAI" / "companion.dat"',
)


def rebrand(source: str) -> str:
    placeholders: dict[str, str] = {}
    for index, name in enumerate(FROZEN_OR_COMPATIBLE):
        marker = f"__SIGNALAM_COMPAT_{index}__"
        if name in source:
            placeholders[marker] = name
            source = source.replace(name, marker)
    source = source.replace("BantAI", "Signalam")
    for marker, name in placeholders.items():
        source = source.replace(marker, name)
    return source


def main() -> None:
    for relative_path in CURRENT_DOCUMENTS:
        path = ROOT / relative_path
        original = path.read_text(encoding="utf-8")
        updated = rebrand(original)
        if updated != original:
            path.write_text(updated, encoding="utf-8", newline="")
            print(path.relative_to(ROOT))
    for source_root in SOURCE_ROOTS:
        for path in source_root.rglob("*"):
            if not path.is_file() or path.suffix not in SOURCE_SUFFIXES:
                continue
            if any(part in SKIP_PARTS for part in path.parts):
                continue
            original = path.read_text(encoding="utf-8")
            updated = rebrand(original)
            if updated != original:
                path.write_text(updated, encoding="utf-8", newline="")
                print(path.relative_to(ROOT))


if __name__ == "__main__":
    main()
