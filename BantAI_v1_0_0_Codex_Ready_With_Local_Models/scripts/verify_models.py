#!/usr/bin/env python3
"""Verify local BantAI model files without loading model weights."""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

EMAIL_MODEL_DIR = (
    ROOT
    / "models"
    / "email_text_xlmr_v1"
    / "checkpoint-15666"
)

RF_MODEL_PATH = (
    ROOT
    / "models"
    / "url_random_forest_v4b"
    / "bantai_rf_url_model_v4b_optimized.joblib"
)


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
    require_file(config_path, "email model config")

    try:
        config = json.loads(
            config_path.read_text(encoding="utf-8")
        )
    except Exception as exc:
        fail(f"Could not read config.json: {exc}")

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

    weight_candidates = [
        EMAIL_MODEL_DIR / "model.safetensors",
        EMAIL_MODEL_DIR / "pytorch_model.bin",
    ]

    weight_path = next(
        (path for path in weight_candidates if path.is_file()),
        None,
    )

    if weight_path is None:
        fail(
            "Missing email model weights. Expected model.safetensors "
            "or pytorch_model.bin."
        )

    require_file(weight_path, "email model weights")

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
    require_file(RF_MODEL_PATH, "RF V4-B joblib")

    print("PASS: Email model directory")
    print(f"PASS: Email config ({config_path.name})")
    print(f"PASS: Email weights ({weight_path.name})")
    print(f"PASS: Tokenizer ({tokenizer_path.name})")
    print(f"PASS: RF model ({RF_MODEL_PATH.name})")
    print()
    print("BantAI local model verification: PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
