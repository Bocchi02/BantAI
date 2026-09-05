#!/usr/bin/env python3
"""Hash-verified single and batch inference for BantAI RF Grouped v1.0.0."""

from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
import time
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import tldextract

from extract_url_features import EXTRACTOR_VERSION, FEATURE_NAMES, one_feature_vector
from prepare_bantai_dataset import domain_fields, repair_and_validate


MODEL_NAME = "BantAI RF Grouped"
MODEL_VERSION = "v1.0.0"
MODEL_FILENAME = "bantai_rf_grouped_v1.0.0.joblib"
EXPECTED_MODEL_SHA256 = "4fd1417fbca11cc60a1eb1f16e9f71c1db0d76f6ce042feae5abcc2bde528c4c"
EXPECTED_THRESHOLD = 0.547
EXPECTED_LABEL_MEANINGS = {0: "legitimate", 1: "phishing"}


def sha256_file(path: Path, chunk_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def find_default_model(script_dir: Path) -> Path:
    candidates = [
        script_dir.parent / "models" / "url_random_forest_grouped_v1" / MODEL_FILENAME,
        script_dir / MODEL_FILENAME,
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return candidates[0]


def decision_for_probability(probability: float, threshold: float = EXPECTED_THRESHOLD) -> str:
    """Apply the frozen label mapping and inclusive release threshold."""
    return "phishing" if probability >= threshold else "legitimate"


def process_memory_stats() -> dict:
    """Return current/peak working set without an optional dependency on Windows."""
    if os.name == "nt":
        from ctypes import wintypes

        class ProcessMemoryCountersEx(ctypes.Structure):
            _fields_ = [
                ("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t),
                ("PrivateUsage", ctypes.c_size_t),
            ]

        kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        psapi = ctypes.WinDLL("psapi", use_last_error=True)
        kernel32.GetCurrentProcess.restype = wintypes.HANDLE
        get_memory = psapi.GetProcessMemoryInfo
        get_memory.argtypes = [wintypes.HANDLE, ctypes.POINTER(ProcessMemoryCountersEx), wintypes.DWORD]
        get_memory.restype = wintypes.BOOL
        counters = ProcessMemoryCountersEx()
        counters.cb = ctypes.sizeof(counters)
        handle = kernel32.GetCurrentProcess()
        ok = get_memory(handle, ctypes.byref(counters), counters.cb)
        if ok:
            return {
                "process_working_set_bytes": int(counters.WorkingSetSize),
                "process_peak_working_set_bytes": int(counters.PeakWorkingSetSize),
                "process_private_bytes": int(counters.PrivateUsage),
            }
    return {"process_memory": "not_available"}


class BantAIInference:
    def __init__(self, model_path: Path):
        started = time.perf_counter()
        self.model_path = model_path.resolve()
        actual_hash = sha256_file(self.model_path)
        if actual_hash != EXPECTED_MODEL_SHA256:
            raise ValueError(f"Model SHA-256 mismatch: expected {EXPECTED_MODEL_SHA256}, found {actual_hash}")
        self.bundle = joblib.load(self.model_path)
        if self.bundle["extractor_version"] != EXTRACTOR_VERSION:
            raise ValueError("Model and inference feature-extractor versions differ")
        if self.bundle["feature_names"] != FEATURE_NAMES:
            raise ValueError("Model and inference feature schemas differ")
        if self.bundle.get("label_meanings") != EXPECTED_LABEL_MEANINGS:
            raise ValueError("Model label meanings differ from the release contract")
        self.threshold = float(self.bundle["decision_threshold"])
        if abs(self.threshold - EXPECTED_THRESHOLD) > 1e-12:
            raise ValueError("Frozen decision threshold differs from the release threshold")
        self.model = self.bundle["model"]
        # The fitted RF was verbose during training. Silence prediction-only logging in memory.
        try:
            self.model.estimator.estimator.verbose = 0
            for calibrated in self.model.calibrated_classifiers_:
                calibrated.estimator.verbose = 0
        except AttributeError:
            pass
        self.private_extract = tldextract.TLDExtract(
            suffix_list_urls=(), cache_dir=None, include_psl_private_domains=True
        )
        self.icann_extract = tldextract.TLDExtract(
            suffix_list_urls=(), cache_dir=None, include_psl_private_domains=False
        )
        self.model_sha256 = actual_hash
        self.load_seconds = time.perf_counter() - started

    def preprocess(self, urls: list[str]) -> tuple[np.ndarray, list[dict], list[int], float]:
        started = time.perf_counter()
        records: list[dict] = []
        vectors: list[list[float]] = []
        valid_positions: list[int] = []
        for position, original_url in enumerate(urls):
            original_url = "" if original_url is None else str(original_url)
            validation = repair_and_validate(original_url, self.private_extract)
            issues = validation["issues"]
            if validation["action"] == "quarantine" or not validation["parsed"]["valid"]:
                records.append({
                    "original_url": original_url,
                    "normalized_url": "",
                    "validation_status": "rejected",
                    "validation_findings": ";".join(issues),
                    "phishing_probability": None,
                    "prediction": "rejected",
                    "decision": "rejected",
                    "decision_threshold": self.threshold,
                    "model_name": MODEL_NAME,
                    "model_version": MODEL_VERSION,
                })
                continue
            normalized_url = validation["proposed"] or original_url
            fields = domain_fields(validation["parsed"], self.private_extract, self.icann_extract)
            vector = one_feature_vector(
                normalized_url,
                fields["normalized_host"],
                fields["private_aware_registrable_domain"],
                fields["icann_provider_domain"],
                str(fields["is_ip_host"]),
            )
            vectors.append(vector)
            valid_positions.append(position)
            records.append({
                "original_url": original_url,
                "normalized_url": normalized_url,
                "validation_status": validation["action"],
                "validation_findings": ";".join(issues),
                "phishing_probability": None,
                "prediction": None,
                "decision": None,
                "decision_threshold": self.threshold,
                "model_name": MODEL_NAME,
                "model_version": MODEL_VERSION,
            })
        X = np.asarray(vectors, dtype=np.float32).reshape((-1, len(FEATURE_NAMES)))
        return X, records, valid_positions, time.perf_counter() - started

    def predict_urls(self, urls: list[str]) -> tuple[list[dict], dict]:
        X, records, valid_positions, preprocessing_seconds = self.preprocess(urls)
        prediction_started = time.perf_counter()
        if len(X):
            probabilities = self.model.predict_proba(X)[:, 1]
            for position, probability in zip(valid_positions, probabilities, strict=True):
                stable_probability = round(float(probability), 12)
                records[position]["phishing_probability"] = stable_probability
                decision = decision_for_probability(stable_probability, self.threshold)
                records[position]["prediction"] = decision
                records[position]["decision"] = decision
        prediction_seconds = time.perf_counter() - prediction_started
        stats = {
            "model_name": MODEL_NAME,
            "model_version": MODEL_VERSION,
            "model_sha256": self.model_sha256,
            "rows": len(urls),
            "accepted_rows": len(valid_positions),
            "rejected_rows": len(urls) - len(valid_positions),
            "model_load_seconds": self.load_seconds,
            "preprocessing_seconds": preprocessing_seconds,
            "prediction_seconds": prediction_seconds,
            "total_inference_seconds_excluding_load": preprocessing_seconds + prediction_seconds,
            "rows_per_second_excluding_load": len(urls) / (preprocessing_seconds + prediction_seconds) if urls else 0,
        }
        stats.update(process_memory_stats())
        return records, stats


def main() -> int:
    script_dir = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--url", action="append", help="URL to classify; repeat for multiple URLs")
    source.add_argument("--input", type=Path, help="Input CSV containing a URL column")
    parser.add_argument("--url-column", default="url")
    parser.add_argument("--output", type=Path, help="Output CSV for batch mode")
    parser.add_argument("--model", type=Path, default=find_default_model(script_dir))
    parser.add_argument("--limit", type=int, help="Optional batch row limit, useful for benchmarks")
    parser.add_argument("--benchmark-json", type=Path)
    args = parser.parse_args()
    engine = BantAIInference(args.model)
    if args.url is not None:
        records, stats = engine.predict_urls(args.url)
        print(json.dumps({"predictions": records, "runtime": stats}, indent=2, ensure_ascii=False))
    else:
        input_path = args.input if args.input.is_absolute() else Path.cwd() / args.input
        frame = pd.read_csv(input_path, dtype=str, keep_default_na=False, usecols=[args.url_column])
        if args.limit is not None:
            frame = frame.head(args.limit)
        records, stats = engine.predict_urls(frame[args.url_column].tolist())
        output_path = args.output or input_path.with_name(input_path.stem + "_predictions.csv")
        output_path = output_path if output_path.is_absolute() else Path.cwd() / output_path
        output_path.parent.mkdir(parents=True, exist_ok=True)
        pd.DataFrame(records).to_csv(output_path, index=False)
        print(json.dumps({"output": str(output_path), "runtime": stats}, indent=2))
    if args.benchmark_json:
        benchmark_path = args.benchmark_json if args.benchmark_json.is_absolute() else Path.cwd() / args.benchmark_json
        benchmark_path.parent.mkdir(parents=True, exist_ok=True)
        benchmark_path.write_text(json.dumps(stats, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
