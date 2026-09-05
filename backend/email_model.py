"""Calibrated BantAI XLM-R email inference contract and preprocessing."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping, Sequence

import torch


MODEL_VERSION = "full_taglish_xlmr_512_headtail_seed13"
MODEL_NAME = "BantAI calibrated XLM-RoBERTa Email Model"
EXPECTED_CONFIG_SHA256 = (
    "ab2444e5d1e75a24e5b900443a027f38b94ddb993fa41da8f80b720bde4c59c9"
)
EXPECTED_ID2LABEL = {
    0: "LEGITIMATE",
    1: "PHISHING_SOCIAL_ENGINEERING",
}

# This is the exact preprocessing configuration inherited by the selected
# Phase 4 training run. Keep encode_email aligned with phase4_common.py.
PREPROCESSING: dict[str, Any] = {
    "max_length": 512,
    "truncation_strategy": "subject_head_tail",
    "clean_body": False,
    "subject_token_budget": 96,
    "subject_tail_fraction": 0.25,
    "body_tail_fraction": 0.35,
    "subject_structure": "Subject: segment then Body: segment",
}


@dataclass(frozen=True)
class CalibrationContract:
    model_run_id: str
    method: str
    temperature: float
    positive_class_id: int
    suspicious_threshold: float
    probability_definition: str
    config_sha256: str


def _read_json(path: Path) -> dict[str, Any]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except Exception as exc:
        raise RuntimeError(f"Could not read {path.name}: {exc}") from exc
    if not isinstance(payload, dict):
        raise RuntimeError(f"{path.name} must contain a JSON object.")
    return payload


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _normalized_id2label(config: Mapping[str, Any]) -> dict[int, str]:
    raw = config.get("id2label")
    if not isinstance(raw, Mapping):
        raise RuntimeError("Email model config.json is missing id2label.")
    try:
        return {int(class_id): str(label) for class_id, label in raw.items()}
    except (TypeError, ValueError) as exc:
        raise RuntimeError("Email model id2label keys must be integer class IDs.") from exc


def load_deployment_contract(model_dir: Path) -> CalibrationContract:
    """Validate model identity, label mapping, and the calibration artifact."""

    config_path = model_dir / "config.json"
    calibration_path = model_dir / "calibration.json"
    if not config_path.is_file():
        raise RuntimeError(f"Missing email model config: {config_path}")
    if not calibration_path.is_file():
        raise RuntimeError(f"Missing email calibration contract: {calibration_path}")

    config = _read_json(config_path)
    calibration = _read_json(calibration_path)
    actual_config_hash = _sha256_file(config_path)
    declared_config_hash = str(calibration.get("checkpoint_config_sha256", ""))

    if actual_config_hash != EXPECTED_CONFIG_SHA256:
        raise RuntimeError(
            "Email model config SHA-256 mismatch. "
            f"Expected {EXPECTED_CONFIG_SHA256}, found {actual_config_hash}."
        )
    if declared_config_hash != actual_config_hash:
        raise RuntimeError(
            "calibration.json does not match the deployed model config.json."
        )
    if _normalized_id2label(config) != EXPECTED_ID2LABEL:
        raise RuntimeError(
            "Email model label mapping mismatch. Expected class 0 LEGITIMATE and "
            "class 1 PHISHING_SOCIAL_ENGINEERING."
        )
    if int(config.get("num_labels", len(EXPECTED_ID2LABEL))) != 2:
        raise RuntimeError("Email model must expose exactly two labels.")
    if int(config.get("max_position_embeddings", 0)) < PREPROCESSING["max_length"] + 2:
        raise RuntimeError("Email model does not support the 512-token input contract.")

    model_run_id = str(calibration.get("model_run_id", ""))
    method = str(calibration.get("calibration_method", ""))
    positive_class_id = int(calibration.get("positive_class_id", -1))
    probability_definition = str(calibration.get("probability_definition", ""))
    temperature = float(calibration.get("temperature", 0.0))
    threshold = float(calibration.get("suspicious_threshold", -1.0))

    if model_run_id != MODEL_VERSION:
        raise RuntimeError(
            f"Unexpected calibrated email model ID: {model_run_id or '<missing>'}."
        )
    if method != "temperature_scaling":
        raise RuntimeError(f"Unsupported email calibration method: {method or '<missing>'}.")
    if positive_class_id != 1:
        raise RuntimeError("The calibrated positive email class must be class ID 1.")
    if probability_definition != "softmax(logits / temperature)[positive_class_id]":
        raise RuntimeError("Unexpected calibrated probability definition.")
    if temperature <= 0.0:
        raise RuntimeError("Email calibration temperature must be positive.")
    if not 0.0 <= threshold <= 1.0:
        raise RuntimeError("Email suspicious threshold must be between 0 and 1.")

    return CalibrationContract(
        model_run_id=model_run_id,
        method=method,
        temperature=temperature,
        positive_class_id=positive_class_id,
        suspicious_threshold=threshold,
        probability_definition=probability_definition,
        config_sha256=actual_config_hash,
    )


def safe_text(value: Any) -> str:
    if value is None:
        return ""
    try:
        if value != value:  # NaN-like values; API inputs are normally strings.
            return ""
    except (TypeError, ValueError):
        pass
    return str(value).strip()


def _head_tail(ids: Sequence[int], budget: int, tail_fraction: float) -> list[int]:
    if budget <= 0:
        return []
    ids = list(ids)
    if len(ids) <= budget:
        return ids
    tail = (
        max(1, min(budget - 1, int(round(budget * tail_fraction))))
        if budget > 1
        else 0
    )
    head = budget - tail
    return ids[:head] + (ids[-tail:] if tail else [])


def _special_token_ids(tokenizer: Any) -> tuple[int, int]:
    leading_id = tokenizer.cls_token_id
    trailing_id = tokenizer.sep_token_id
    if leading_id is None:
        leading_id = tokenizer.bos_token_id
    if trailing_id is None:
        trailing_id = tokenizer.eos_token_id
    if leading_id is None or trailing_id is None:
        raise RuntimeError("Encoder tokenizer lacks CLS/BOS or SEP/EOS special tokens")
    return int(leading_id), int(trailing_id)


def encode_email(
    tokenizer: Any,
    subject: Any,
    body: Any,
    preprocessing: Mapping[str, Any] = PREPROCESSING,
) -> dict[str, list[int]]:
    """Faithful runtime port of phase4_common.encode_email subject_head_tail."""

    max_length = int(preprocessing["max_length"])
    strategy = preprocessing.get("truncation_strategy", "right")
    cleanup = bool(preprocessing.get("clean_body", False))
    if cleanup:
        raise ValueError("Body cleaning is disabled for the deployed email model.")
    subject_text = safe_text(subject)
    body_text = safe_text(body)

    if strategy != "subject_head_tail":
        raise ValueError(f"Unsupported deployed truncation_strategy: {strategy}")

    special_count = int(tokenizer.num_special_tokens_to_add(pair=False))
    content_budget = max_length - special_count
    if content_budget <= 0:
        raise ValueError(f"max_length={max_length} leaves no content-token budget")

    prefix_ids = (
        tokenizer.encode("Subject: ", add_special_tokens=False, verbose=False)
        if subject_text
        else []
    )
    subject_ids = (
        tokenizer.encode(subject_text, add_special_tokens=False, verbose=False)
        if subject_text
        else []
    )
    separator_ids = (
        tokenizer.encode("\n\nBody: ", add_special_tokens=False, verbose=False)
        if subject_text
        else []
    )
    configured_subject_budget = int(
        preprocessing.get("subject_token_budget", max(32, max_length // 4))
    )
    structural_budget = min(
        content_budget,
        configured_subject_budget if subject_text else 0,
    )
    subject_payload_budget = max(
        0,
        structural_budget - len(prefix_ids) - len(separator_ids),
    )
    subject_payload = _head_tail(
        subject_ids,
        subject_payload_budget,
        float(preprocessing.get("subject_tail_fraction", 0.25)),
    )
    structured_subject = (prefix_ids + subject_payload + separator_ids)[:content_budget]
    body_budget = content_budget - len(structured_subject)
    body_ids = tokenizer.encode(body_text, add_special_tokens=False, verbose=False)
    body_payload = _head_tail(
        body_ids,
        body_budget,
        float(preprocessing.get("body_tail_fraction", 0.35)),
    )
    content_ids = structured_subject + body_payload

    leading_id, trailing_id = _special_token_ids(tokenizer)
    input_ids = [leading_id] + content_ids + [trailing_id]
    if len(input_ids) > max_length:
        raise AssertionError("Head-tail encoder exceeded max_length")

    encoded: dict[str, list[int]] = {
        "input_ids": input_ids,
        "attention_mask": [1] * len(input_ids),
    }
    if "token_type_ids" in tokenizer.model_input_names:
        encoded["token_type_ids"] = [0] * len(input_ids)
    return encoded


def count_untruncated_email_tokens(tokenizer: Any, subject: Any, body: Any) -> int:
    """Count the full structured input before subject/head-tail allocation."""

    subject_text = safe_text(subject)
    body_text = safe_text(body)
    content_ids: list[int] = []
    if subject_text:
        content_ids.extend(
            tokenizer.encode("Subject: ", add_special_tokens=False, verbose=False)
        )
        content_ids.extend(
            tokenizer.encode(subject_text, add_special_tokens=False, verbose=False)
        )
        content_ids.extend(
            tokenizer.encode("\n\nBody: ", add_special_tokens=False, verbose=False)
        )
    content_ids.extend(tokenizer.encode(body_text, add_special_tokens=False, verbose=False))
    return int(tokenizer.num_special_tokens_to_add(pair=False)) + len(content_ids)


def encoded_to_tensors(
    encoded: Mapping[str, Sequence[int]],
    device: torch.device,
) -> dict[str, torch.Tensor]:
    return {
        key: torch.tensor([list(value)], dtype=torch.long, device=device)
        for key, value in encoded.items()
    }


def calibrated_probabilities(
    logits: torch.Tensor,
    contract: CalibrationContract,
) -> torch.Tensor:
    """Divide every raw logit by temperature, then apply softmax."""

    if logits.shape[-1] != 2:
        raise ValueError("Email model logits must contain exactly two classes.")
    return torch.softmax(logits / contract.temperature, dim=-1)


def is_suspicious_probability(
    suspicious_probability: float,
    contract: CalibrationContract,
) -> bool:
    return suspicious_probability >= contract.suspicious_threshold
