#!/usr/bin/env python3
"""Verify local BantAI model files without loading model weights."""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from email_model import (  # noqa: E402
    EXPECTED_ID2LABEL,
    MODEL_VERSION as EMAIL_MODEL_VERSION,
    PREPROCESSING,
    load_deployment_contract,
    verify_deployment_manifest,
)

EMAIL_MODEL_DIR = (
    ROOT
    / "models"
    / "email_text_xlmr_v2"
    / EMAIL_MODEL_VERSION
)
LEGACY_EMAIL_MODEL_ACTIVE_PATH = (
    ROOT / "models" / "email_text_xlmr_v1" / "checkpoint-15666"
)
LEGACY_EMAIL_MODEL_ARCHIVE = (
    ROOT
    / "models"
    / "email_text_xlmr_v1"
    / "rollback_archive"
    / "checkpoint-15666"
)

RF_MODEL_PATH = (
    ROOT
    / "models"
    / "url_random_forest_grouped_v1"
    / "bantai_rf_grouped_v1.0.0.joblib"
)
RF_MODEL_SHA256 = "4fd1417fbca11cc60a1eb1f16e9f71c1db0d76f6ce042feae5abcc2bde528c4c"


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    raise SystemExit(1)


def require_file(path: Path, description: str) -> None:
    if not path.is_file():
        fail(f"Missing {description}: {path}")

    if path.stat().st_size <= 0:
        fail(f"Empty {description}: {path}")


def main() -> int:
    if not EMAIL_MODEL_DIR.is_dir():
        fail(f"Missing email model directory: {EMAIL_MODEL_DIR}")

    config_path = EMAIL_MODEL_DIR / "config.json"
    calibration_path = EMAIL_MODEL_DIR / "calibration.json"
    require_file(config_path, "email model config")
    require_file(calibration_path, "email calibration contract")

    try:
        config = json.loads(config_path.read_text(encoding="utf-8"))
        verify_deployment_manifest(EMAIL_MODEL_DIR)
        contract = load_deployment_contract(EMAIL_MODEL_DIR)
    except Exception as exc:
        fail(str(exc))

    architecture_text = " ".join(
        config.get("architectures", [])
    ).lower()

    model_type = str(
        config.get("model_type", "")
    ).lower()

    if (
        "xlm" not in architecture_text
        and "xlm" not in model_type
    ):
        print(
            "WARN: config.json does not clearly identify an XLM-R architecture."
        )

    index_path = EMAIL_MODEL_DIR / "model.safetensors.index.json"
    require_file(index_path, "email model weight index")
    try:
        index = json.loads(index_path.read_text(encoding="utf-8"))
        weight_files = sorted(set(index["weight_map"].values()))
    except Exception as exc:
        fail(f"Could not read sharded email weight index: {exc}")
    if not weight_files:
        fail("Email model weight index does not name any weight shards.")
    for filename in weight_files:
        require_file(EMAIL_MODEL_DIR / filename, f"email model weight shard {filename}")

    tokenizer_candidates = [
        EMAIL_MODEL_DIR / "sentencepiece.bpe.model",
        EMAIL_MODEL_DIR / "tokenizer.json",
        EMAIL_MODEL_DIR / "sentencepiece.model",
    ]

    tokenizer_path = next(
        (path for path in tokenizer_candidates if path.is_file()),
        None,
    )

    if tokenizer_path is None:
        fail(
            "Missing tokenizer asset. Expected sentencepiece.bpe.model, "
            "sentencepiece.model, or tokenizer.json."
        )

    require_file(tokenizer_path, "tokenizer asset")
    if LEGACY_EMAIL_MODEL_ACTIVE_PATH.exists():
        fail(
            "Legacy email model still occupies its former active path: "
            f"{LEGACY_EMAIL_MODEL_ACTIVE_PATH}"
        )
    if not LEGACY_EMAIL_MODEL_ARCHIVE.is_dir():
        fail(f"Missing rollback-only email model archive: {LEGACY_EMAIL_MODEL_ARCHIVE}")
    require_file(
        LEGACY_EMAIL_MODEL_ARCHIVE / "config.json",
        "rollback-only email model config",
    )
    legacy_weight_candidates = (
        LEGACY_EMAIL_MODEL_ARCHIVE / "model.safetensors",
        LEGACY_EMAIL_MODEL_ARCHIVE / "pytorch_model.bin",
    )
    legacy_weight_path = next(
        (path for path in legacy_weight_candidates if path.is_file()),
        None,
    )
    if legacy_weight_path is None:
        fail("Rollback-only email model weights are missing.")
    require_file(legacy_weight_path, "rollback-only email model weights")
    require_file(RF_MODEL_PATH, "RF Grouped v1.0.0 joblib")
    digest = hashlib.sha256()
    with RF_MODEL_PATH.open("rb") as handle:
        while chunk := handle.read(8 * 1024 * 1024):
            digest.update(chunk)
    actual_hash = digest.hexdigest()
    if actual_hash != RF_MODEL_SHA256:
        fail(f"RF Grouped v1.0.0 SHA-256 mismatch: {actual_hash}")

    print("PASS: Email model directory")
    print(f"PASS: Email config ({config_path.name})")
    print("PASS: Email artifact manifest (SHA-256 and size verified)")
    print(
        "PASS: Email label mapping "
        f"({EXPECTED_ID2LABEL[0]}, {EXPECTED_ID2LABEL[1]})"
    )
    print(f"PASS: Email weights ({len(weight_files)} safetensors shards)")
    print(f"PASS: Tokenizer ({tokenizer_path.name})")
    print(
        "PASS: Email calibration "
        f"({contract.method}, temperature={contract.temperature}, "
        f"threshold={contract.suspicious_threshold})"
    )
    print(
        "PASS: Email preprocessing "
        f"({PREPROCESSING['truncation_strategy']}, max_length={PREPROCESSING['max_length']})"
    )
    print(
        "PASS: Legacy email model retained for rollback only "
        f"({LEGACY_EMAIL_MODEL_ARCHIVE.relative_to(ROOT)})"
    )
    print(f"PASS: RF Grouped v1.0.0 ({RF_MODEL_PATH.name}, SHA-256 verified)")
    print()
    print("BantAI frozen server model artifact verification: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
