#!/usr/bin/env python3
"""Verify BantAI source syntax and frozen project invariants without loading ML models."""

from __future__ import annotations

import json
import py_compile
import re
import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

EXPECTED_EMAIL_THRESHOLD = "0.6923658179915227"
EXPECTED_EMAIL_TEMPERATURE = "2.2198894341340183"
EXPECTED_URL_THRESHOLD = "0.547"
EXPECTED_MAX_LENGTH = "512"
EXPECTED_POPUP_DURATION = "5000"


def fail(message: str) -> None:
    raise RuntimeError(message)


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


def read(relative: str) -> str:
    path = ROOT / relative
    require(path.is_file(), f"Missing required file: {relative}")
    return path.read_text(encoding="utf-8")


def check_python() -> None:
    paths = sorted((ROOT / "backend").rglob("*.py"))
    paths.extend(sorted((ROOT / "tests").rglob("*.py")))

    for path in paths:
        py_compile.compile(
            str(path),
            doraise=True,
        )


def check_javascript() -> None:
    node = shutil.which("node")

    if not node:
        print("WARN: Node.js was not found; JavaScript syntax checks were skipped.")
        return

    paths = [
        ROOT / "extension" / "background" / "service-worker.js",
        ROOT / "extension" / "content" / "gmail-extractor.js",
        ROOT / "extension" / "content" / "outlook-extractor.js",
        ROOT / "extension" / "content" / "yahoo-extractor.js",
        ROOT / "extension" / "popup" / "popup.js",
    ]

    for path in paths:
        result = subprocess.run(
            [node, "--check", str(path)],
            capture_output=True,
            text=True,
            timeout=60,
        )

        if result.returncode != 0:
            fail(
                f"JavaScript syntax failed for {path.relative_to(ROOT)}:\n"
                f"{result.stderr}"
            )


def check_manifest() -> None:
    manifest = json.loads(
        read("extension/manifest.json")
    )

    require(
        manifest.get("manifest_version") == 3,
        "Manifest must remain version 3.",
    )
    require(
        manifest.get("version") == "1.1.0",
        "Expected extension version 1.1.0.",
    )
    require(
        manifest.get("minimum_chrome_version") == "127",
        "Automatic popup requires the declared minimum Chrome version 127.",
    )

    permissions = set(
        manifest.get("permissions", [])
    )

    require(
        {"scripting", "storage", "tabs"}.issubset(permissions),
        "Required extension permissions are missing.",
    )

    host_permissions = set(
        manifest.get("host_permissions", [])
    )

    required_hosts = {
        "https://mail.google.com/*",
        "https://mail.yahoo.com/*",
        "https://outlook.live.com/*",
        "http://127.0.0.1:8000/*",
    }

    require(
        required_hosts.issubset(host_permissions),
        "Required narrowly scoped host permissions are missing.",
    )


def check_backend_invariants() -> None:
    server = read("backend/server.py")
    email_model = read("backend/email_model.py")
    requirements = read("backend/requirements.txt")

    require(
        '"max_length": 512' in email_model
        and '"truncation_strategy": "subject_head_tail"' in email_model
        and '"subject_token_budget": 96' in email_model
        and '"subject_tail_fraction": 0.25' in email_model
        and '"body_tail_fraction": 0.35' in email_model
        and '"clean_body": False' in email_model,
        "Calibrated email preprocessing contract changed.",
    )
    require(
        "load_deployment_contract" in server
        and "calibrated_probabilities" in server
        and "encode_email" in server
        and "logits / contract.temperature" in email_model,
        "Calibrated email inference path is incomplete.",
    )
    require(
        EXPECTED_EMAIL_THRESHOLD in read(
            "models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/calibration.json"
        )
        and EXPECTED_EMAIL_TEMPERATURE in read(
            "models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/calibration.json"
        ),
        "Email calibration artifact changed.",
    )
    require(
        re.search(
            r"URL_THRESHOLD\s*=\s*0\.547\b",
            server,
        ) is not None,
        "Frozen URL threshold changed.",
    )
    require(
        "BantAIInference" in server
        and "bantai_rf_url_model_v4b_runtime" not in server,
        "Grouped v1.0.0 must be the only default URL inference path.",
    )
    require(
        "EXPECTED_MODEL_SHA256" in server
        and "URL_FEATURE_EXTRACTOR" in server
        and "URL_FEATURE_NAMES" in server,
        "Grouped v1.0.0 hash and 52-feature contract checks are missing.",
    )
    require(
        '"BANTAI_URL_MODEL_ENFORCEMENT_ENABLED"' in server
        and '"false"' in server,
        "Grouped v1.0.0 must default to shadow/non-blocking mode.",
    )

    require(
        '"CURRENT_ADDRESS_BAR_URL_ONLY"' in server,
        "Current address-bar URL scope marker is missing.",
    )
    require(
        '"embedded_email_link_scanning"' in server
        and "False" in server,
        "Embedded email link scanning must remain disabled.",
    )
    require(
        "SUPPORTED_EMAIL_PROVIDERS" in server
        and '"gmail"' in server
        and '"outlook"' in server
        and '"yahoo"' in server,
        "Supported email provider restriction changed.",
    )
    require(
        "score_email_links" not in server,
        "Embedded email link scoring was reintroduced.",
    )
    require(
        'VERSION = "1.1.0"' in server,
        "Expected backend version 1.1.0.",
    )
    require(
        '"/analyze-hybrid-email"' in server,
        "Hybrid email endpoint is missing.",
    )
    require(
        '"overall_numeric_risk_score"' in server
        and "False" in server,
        "Overall numeric risk scores must remain disabled.",
    )
    require(
        "load_dotenv" in server
        and 'parent / ".env"' in server
        and "override=False" in server,
        "The backend must auto-load backend/.env without overriding OS variables.",
    )
    require(
        "python-dotenv" in requirements,
        "python-dotenv is required for backend/.env loading.",
    )

    for relative in (
        "backend/email_model.py",
        "backend/scam_indicator_engine.py",
        "backend/fusion_engine.py",
        "backend/llm/base.py",
        "backend/llm/gemini_provider.py",
        "backend/llm/schemas.py",
        "backend/llm/prompt_builder.py",
        "backend/llm/redaction.py",
        "backend/llm/cache.py",
    ):
        require((ROOT / relative).is_file(), f"Missing v1.1 module: {relative}")

    active_email_runtime_files = (
        "backend/server.py",
        "backend/Dockerfile",
        "backend/START_BANTAI_V1_1.ps1",
        "companion/app.py",
        "docker-compose.yml",
        "scripts/ENABLE_BANTAI_COMPANION_STARTUP.ps1",
        ".env.example",
    )
    for relative in active_email_runtime_files:
        active_source = read(relative)
        require(
            "checkpoint-15666" not in active_source,
            f"Legacy email checkpoint remains active in {relative}.",
        )
        require(
            re.search(r"\b0[.]378459(?:06615257263)?\b", active_source) is None,
            f"Retired email threshold remains active in {relative}.",
        )


def check_extension_invariants() -> None:
    worker = read("extension/background/service-worker.js")
    popup_html = read("extension/popup/popup.html")

    require(
        "AUTO_POPUP_DURATION_MS" in worker
        and EXPECTED_POPUP_DURATION in worker,
        "Five-second automatic popup invariant changed.",
    )
    require(
        "tabs.onActivated" in worker,
        "URL scanning on tab switching is missing.",
    )
    require(
        "/analyze-url" in worker
        and "/analyze-hybrid-email" in worker,
        "Current URL or hybrid email API call is missing.",
    )
    require(
        "payload.links" not in worker,
        "Embedded email link payload was reintroduced.",
    )
    require(
        "fonts.googleapis.com" in popup_html
        and "Roboto" in popup_html,
        "Roboto Google Fonts reference is missing.",
    )
    require(
        "bantai_cloud_ai_review_enabled" not in worker
        and "bantai_cloud_ai_review_enabled" not in read("extension/popup/popup.js")
        and "cloudReviewToggle" not in popup_html
        and "cloudUrlReviewToggle" not in popup_html,
        "Cloud review must be always enabled without stored toggles.",
    )
    require(
        "GEMINI_API_KEY" not in worker
        and "GEMINI_API_KEY" not in read("extension/popup/popup.js"),
        "Gemini API keys must never appear in extension source.",
    )

    for provider in ("gmail", "outlook", "yahoo"):
        extractor = read(
            f"extension/content/{provider}-extractor.js"
        )
        require(
            "extractEmailLinks" not in extractor,
            f"{provider} extractor must not extract embedded email links.",
        )


def check_codex_files() -> None:
    required = [
        "AGENTS.md",
        "extension/AGENTS.md",
        "backend/AGENTS.md",
        "CODEX_PROJECT_CONTEXT.md",
        "CODEX_MIGRATION_GUIDE.md",
        "BANTAI_BASELINE.json",
        "README.txt",
        "ARCHITECTURE.txt",
        "TEST_CHECKLIST.txt",
        ".gitignore",
    ]

    for relative in required:
        require(
            (ROOT / relative).is_file(),
            f"Missing Codex migration file: {relative}",
        )


def check_private_artifacts() -> None:
    prohibited_patterns = [
        "real_world_validation_log*.csv",
    ]

    for pattern in prohibited_patterns:
        matches = [
            path
            for path in ROOT.rglob(pattern)
            if path.is_file()
        ]

        require(
            not matches,
            "Private artifact must not be included: "
            + ", ".join(
                str(path.relative_to(ROOT))
                for path in matches
            ),
        )

    local_env = ROOT / "backend" / ".env"
    if local_env.is_file():
        git = shutil.which("git")
        require(git is not None, "Git is required to verify backend/.env privacy.")
        ignored = subprocess.run(
            [git, "check-ignore", "--quiet", str(local_env)],
            cwd=ROOT,
            capture_output=True,
            timeout=30,
        )
        require(
            ignored.returncode == 0,
            "backend/.env exists but is not ignored by Git.",
        )
        tracked = subprocess.run(
            [git, "ls-files", "--error-unmatch", "backend/.env"],
            cwd=ROOT,
            capture_output=True,
            timeout=30,
        )
        require(
            tracked.returncode != 0,
            "backend/.env must never be tracked by Git.",
        )

    # Trained model binaries are allowed locally under models/ only.
    model_binary_patterns = [
        "*.safetensors",
        "*.joblib",
        "*.pkl",
        "*.pt",
        "*.pth",
        "*.bin",
    ]

    for pattern in model_binary_patterns:
        for path in ROOT.rglob(pattern):
            if not path.is_file():
                continue

            relative = path.relative_to(ROOT)
            if any(part in {".git", ".venv", "node_modules"} for part in relative.parts):
                # Dependency environments can contain library test fixtures
                # that use model-like extensions. They are ignored local
                # tooling, not BantAI model artifacts.
                continue

            require(
                relative.parts
                and relative.parts[0] == "models",
                f"Model binary is outside the local models folder: {relative}",
            )


def main() -> int:
    checks = [
        ("Python syntax", check_python),
        ("JavaScript syntax", check_javascript),
        ("Manifest", check_manifest),
        ("Backend invariants", check_backend_invariants),
        ("Extension invariants", check_extension_invariants),
        ("Codex files", check_codex_files),
        ("Private artifacts", check_private_artifacts),
    ]

    for name, check in checks:
        check()
        print(f"PASS: {name}")

    print()
    print("BantAI Codex migration verification: PASS")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print()
        print(f"BantAI Codex migration verification: FAIL\n{exc}")
        raise SystemExit(1)
