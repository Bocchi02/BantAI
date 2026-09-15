#!/usr/bin/env python3
"""Set the one release-time HTTPS API endpoint in extension config and policy."""

from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / "extension" / "config.js"
MANIFEST_PATH = ROOT / "extension" / "manifest.json"
MAIL_HOSTS = {
    "https://mail.google.com/*",
    "https://mail.yahoo.com/*",
    "https://outlook.live.com/*",
    "https://outlook.office.com/*",
    "https://outlook.office365.com/*",
    "https://outlook.cloud.microsoft/*",
}


def validated_endpoint(value: str, allow_http_loopback: bool = False) -> tuple[str, str]:
    endpoint = value.strip().rstrip("/")
    parsed = urlsplit(endpoint)
    local_http = allow_http_loopback and parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
    if (parsed.scheme != "https" and not local_http) or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("The extension API endpoint must be an HTTPS URL without credentials.")
    if parsed.query or parsed.fragment:
        raise ValueError("The extension API endpoint cannot contain a query or fragment.")
    expected_path = parsed.path.rstrip("/")
    if expected_path != "/api/v1":
        raise ValueError("The extension API endpoint must end with /api/v1.")
    return endpoint, f"{parsed.scheme}://{parsed.netloc}"


def validate_release_configuration(config_source: str, manifest: dict) -> str:
    """Reject development endpoint settings before a release is packaged."""

    endpoint_match = re.search(r'apiBase:\s*"([^"]+)"', config_source)
    mode_match = re.search(r'buildMode:\s*"([^"]+)"', config_source)
    loopback_match = re.search(r"allowHttpLoopback:\s*(true|false)", config_source)
    if not endpoint_match or not mode_match or not loopback_match:
        raise ValueError("Extension configuration is incomplete.")
    if mode_match.group(1) != "release" or loopback_match.group(1) != "false":
        raise ValueError("A release extension must use release mode with loopback disabled.")

    endpoint, origin = validated_endpoint(endpoint_match.group(1), False)
    if endpoint.startswith("http://") or urlsplit(endpoint).hostname in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("A release extension must use a non-loopback HTTPS API origin.")

    hosts = set(manifest.get("host_permissions") or [])
    api_hosts = {
        host
        for host in hosts
        if host.startswith(("http://", "https://"))
        and not any(mail_host == host for mail_host in MAIL_HOSTS)
    }
    if api_hosts != {f"{origin}/*"}:
        raise ValueError("Release host_permissions must contain exactly the configured API origin.")

    policy = str((manifest.get("content_security_policy") or {}).get("extension_pages") or "")
    connect_match = re.search(r"(?:^|;)\s*connect-src\s+([^;]+)", policy)
    if not connect_match or connect_match.group(1).strip() != origin:
        raise ValueError("Release CSP connect-src must contain exactly the configured API origin.")
    return endpoint


def validate_development_configuration(config_source: str, manifest: dict) -> str:
    """Validate a development artifact without permitting non-loopback HTTP."""

    endpoint_match = re.search(r'apiBase:\s*"([^"]+)"', config_source)
    mode_match = re.search(r'buildMode:\s*"([^"]+)"', config_source)
    loopback_match = re.search(r"allowHttpLoopback:\s*(true|false)", config_source)
    if not endpoint_match or not mode_match or not loopback_match:
        raise ValueError("Extension configuration is incomplete.")
    if mode_match.group(1) != "development":
        raise ValueError("A development extension must use development mode.")

    endpoint, origin = validated_endpoint(endpoint_match.group(1), True)
    parsed = urlsplit(endpoint)
    is_local_http = parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1"}
    if (loopback_match.group(1) == "true") != is_local_http:
        raise ValueError("allowHttpLoopback must match an HTTP localhost or 127.0.0.1 development endpoint.")

    hosts = set(manifest.get("host_permissions") or [])
    api_hosts = {
        host
        for host in hosts
        if host.startswith(("http://", "https://"))
        and not any(mail_host == host for mail_host in MAIL_HOSTS)
    }
    if api_hosts != {f"{origin}/*"}:
        raise ValueError("Development host_permissions must contain exactly the configured API origin.")

    policy = str((manifest.get("content_security_policy") or {}).get("extension_pages") or "")
    connect_match = re.search(r"(?:^|;)\s*connect-src\s+([^;]+)", policy)
    if not connect_match or connect_match.group(1).strip() != origin:
        raise ValueError("Development CSP connect-src must contain exactly the configured API origin.")
    return endpoint


def configure_artifacts(
    config_path: Path,
    manifest_path: Path,
    configured_endpoint: str,
    mode: str,
    allow_http_loopback: bool,
) -> tuple[str, str]:
    """Write one development or release configuration to explicit artifact paths."""

    if mode not in {"development", "release"}:
        raise ValueError("mode must be development or release")
    if mode == "release" and allow_http_loopback:
        raise ValueError("release mode cannot enable HTTP loopback")
    endpoint, origin = validated_endpoint(
        configured_endpoint,
        allow_http_loopback=mode == "development" and allow_http_loopback,
    )
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    manifest["host_permissions"] = sorted(MAIL_HOSTS | {f"{origin}/*"})
    manifest["content_security_policy"]["extension_pages"] = (
        "script-src 'self'; object-src 'none'; "
        "base-uri 'self'; "
        f"connect-src {origin}; style-src 'self'; font-src 'self';"
    )
    config_path.write_text(
        "// Generated by scripts/configure_remote_endpoint.py.\n"
        "globalThis.BANTAI_CONFIG = Object.freeze({\n"
        f"  buildMode: {json.dumps(mode)},\n"
        f"  apiBase: {json.dumps(endpoint)},\n"
        f"  allowHttpLoopback: {str(mode == 'development' and allow_http_loopback).lower()}\n"
        "});\n",
        encoding="utf-8",
    )
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    if mode == "release":
        validate_release_configuration(config_path.read_text(encoding="utf-8"), manifest)
    else:
        validate_development_configuration(config_path.read_text(encoding="utf-8"), manifest)
    return endpoint, origin


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("endpoint", nargs="?", help="BantAI API base, or set BANTAI_PUBLIC_API_ORIGIN")
    parser.add_argument("--mode", choices=("development", "release"), required=True)
    parser.add_argument("--allow-http-loopback", action="store_true", help="Allow HTTP only on localhost or 127.0.0.1 in explicit development mode")
    parser.add_argument("--config-path", type=Path, default=CONFIG_PATH, help=argparse.SUPPRESS)
    parser.add_argument("--manifest-path", type=Path, default=MANIFEST_PATH, help=argparse.SUPPRESS)
    args = parser.parse_args()
    configured_endpoint = args.endpoint or os.getenv("BANTAI_PUBLIC_API_ORIGIN", "")
    if not configured_endpoint:
        parser.error("endpoint or BANTAI_PUBLIC_API_ORIGIN is required")
    endpoint, _ = configure_artifacts(
        args.config_path,
        args.manifest_path,
        configured_endpoint,
        args.mode,
        args.allow_http_loopback,
    )
    print(f"Configured BantAI extension API: {endpoint}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
