#!/usr/bin/env python3
"""Validate the checked-in production Compose template without starting services."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
COMPOSE_PATH = ROOT / "docker-compose.yml"
ENV_EXAMPLE_PATH = ROOT / ".env.example"
REQUIRED_VARIABLE_PATTERN = re.compile(r"\$\{([A-Z][A-Z0-9_]*)\?[^}]*\}")
ENV_LINE_PATTERN = re.compile(r"^([A-Z][A-Z0-9_]*)=(.*)$")


def required_compose_variables(compose_source: str) -> set[str]:
    return set(REQUIRED_VARIABLE_PATTERN.findall(compose_source))


def example_variables(env_source: str) -> dict[str, str]:
    values: dict[str, str] = {}
    for line in env_source.splitlines():
        match = ENV_LINE_PATTERN.match(line.strip())
        if match:
            values[match.group(1)] = match.group(2).strip()
    return values


def validate_template() -> list[str]:
    required = required_compose_variables(COMPOSE_PATH.read_text(encoding="utf-8"))
    provided = example_variables(ENV_EXAMPLE_PATH.read_text(encoding="utf-8"))
    missing = sorted(name for name in required if not provided.get(name))
    return missing


def main() -> int:
    missing = validate_template()
    if missing:
        print(f"FAIL: .env.example is missing required Compose values: {', '.join(missing)}")
        return 1

    result = subprocess.run(
        [
            "docker",
            "compose",
            "--env-file",
            str(ENV_EXAMPLE_PATH),
            "-f",
            str(COMPOSE_PATH),
            "config",
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode:
        detail = (result.stderr or result.stdout).strip().splitlines()
        print(f"FAIL: docker compose config rejected the template: {detail[-1] if detail else 'unknown error'}")
        return result.returncode
    print("PASS: all required production Compose variables are documented and Compose config renders.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
