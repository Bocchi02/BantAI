#!/usr/bin/env python3
"""Create a Signalam release ZIP only after fail-closed release validation."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import tempfile
import zipfile
from pathlib import Path

try:
    from .configure_remote_endpoint import configure_artifacts, validate_release_configuration
except ImportError:  # pragma: no cover - direct script execution
    from configure_remote_endpoint import configure_artifacts, validate_release_configuration


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = ROOT / "extension"
DEFAULT_OUTPUT = ROOT / "dist" / "signalam-extension-release.zip"


def package_release(source: Path, output: Path, endpoint: str) -> Path:
    """Stage, configure, validate, and package one immutable release artifact."""

    if not endpoint or not endpoint.strip():
        raise ValueError("A real operator-supplied HTTPS API endpoint is required.")
    source = source.resolve()
    output = output.resolve()
    if not (source / "config.js").is_file() or not (source / "manifest.json").is_file():
        raise ValueError("The extension source is missing config.js or manifest.json.")

    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="signalam-extension-release-") as temporary:
        staging = Path(temporary) / "extension"
        shutil.copytree(source, staging)
        config_path = staging / "config.js"
        manifest_path = staging / "manifest.json"
        configure_artifacts(config_path, manifest_path, endpoint, "release", False)
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        validated_endpoint = validate_release_configuration(
            config_path.read_text(encoding="utf-8"), manifest
        )

        temporary_zip = output.with_suffix(output.suffix + ".tmp")
        try:
            with zipfile.ZipFile(temporary_zip, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for path in sorted(staging.rglob("*")):
                    if path.is_file():
                        archive.write(path, Path("extension") / path.relative_to(staging))
            temporary_zip.replace(output)
        finally:
            if temporary_zip.exists():
                temporary_zip.unlink()
    print(f"PASS: packaged validated release for {validated_endpoint}: {output}")
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--endpoint", default=os.getenv("BANTAI_PUBLIC_API_ORIGIN", ""))
    parser.add_argument("--source", type=Path, default=DEFAULT_SOURCE)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    try:
        package_release(args.source, args.output, args.endpoint)
    except (OSError, ValueError, json.JSONDecodeError, zipfile.BadZipFile) as exc:
        print(f"FAIL: release packaging blocked: {exc}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
