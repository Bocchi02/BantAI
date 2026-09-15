#!/usr/bin/env python3
"""Fail closed if the checked-out extension is not a safe release artifact."""

from __future__ import annotations

import json
import argparse
from pathlib import Path

from configure_remote_endpoint import CONFIG_PATH, MANIFEST_PATH, validate_release_configuration


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=CONFIG_PATH, help="Extension config.js to verify")
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH, help="Extension manifest.json to verify")
    args = parser.parse_args()
    try:
        endpoint = validate_release_configuration(
            args.config.read_text(encoding="utf-8"),
            json.loads(args.manifest.read_text(encoding="utf-8")),
        )
    except ValueError as exc:
        print(f"FAIL: {exc}")
        return 1
    print(f"PASS: release extension configuration targets {endpoint}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
