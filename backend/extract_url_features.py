#!/usr/bin/env python3
"""Deterministic, stateless lexical URL feature extraction for BantAI."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from collections import Counter
from pathlib import Path
from urllib.parse import urlsplit

import numpy as np
import pandas as pd


EXTRACTOR_VERSION = "bantai_lexical_v1"
SUSPICIOUS_RE = re.compile(
    r"(?:login|signin|verify|secure|account|update|confirm|password|banking|wallet|"
    r"webscr|bonus|free|click|admin|support|authenticate|recover|invoice|payment|"
    r"paypal|microsoft|apple|amazon|google|facebook|yahoo|telegram|whatsapp|docusign)",
    re.IGNORECASE,
)
TOKEN_RE = re.compile(r"[a-z0-9]+", re.IGNORECASE)
ENCODED_RE = re.compile(r"%[0-9a-fA-F]{2}")
FEATURE_NAMES = [
    "url_length", "host_length", "registrable_domain_length", "provider_domain_length",
    "path_length", "query_length", "fragment_length", "path_depth", "query_param_count",
    "subdomain_count", "tld_length", "digit_count", "letter_count", "special_count",
    "digit_ratio", "letter_ratio", "special_ratio", "dot_count", "hyphen_count",
    "underscore_count", "slash_count", "at_count", "question_count", "equals_count",
    "ampersand_count", "percent_count", "colon_count", "semicolon_count",
    "host_digit_count", "host_digit_ratio", "host_hyphen_count", "host_dot_count",
    "domain_digit_count", "domain_hyphen_count", "is_https", "is_http", "is_ip_host",
    "has_explicit_port", "has_userinfo", "has_fragment", "has_query", "has_punycode",
    "is_suffixless_host", "host_equals_registrable", "url_entropy", "token_count",
    "mean_token_length", "max_token_length", "suspicious_token_count", "encoded_octet_count",
    "max_repeated_char_run", "path_extension_length",
]


def sha256_file(path: Path, chunk_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def group_hash(value: str) -> int:
    return int.from_bytes(hashlib.sha256(value.encode("utf-8")).digest()[:8], "big", signed=False)


def row_number(row_id: str) -> int:
    return int(row_id.rsplit(":", 1)[-1])


def entropy(value: str) -> float:
    if not value:
        return 0.0
    length = len(value)
    return -sum((count / length) * math.log2(count / length) for count in Counter(value).values())


def max_repeat(value: str) -> int:
    best = current = 0
    previous = None
    for char in value:
        if char == previous:
            current += 1
        else:
            current = 1
            previous = char
        if current > best:
            best = current
    return best


def one_feature_vector(url: str, host: str, registrable: str, provider: str, is_ip_text: str) -> list[float]:
    try:
        parts = urlsplit(url)
        path, query, fragment = parts.path, parts.query, parts.fragment
        has_userinfo = parts.username is not None
        try:
            explicit_port = parts.port is not None
        except ValueError:
            explicit_port = False
        scheme = parts.scheme.lower()
    except ValueError:
        path = query = fragment = scheme = ""
        has_userinfo = explicit_port = False
    lower = url.lower()
    url_len = len(url)
    digits = sum(char.isdigit() for char in url)
    letters = sum(char.isalpha() for char in url)
    special = url_len - digits - letters
    host_digits = sum(char.isdigit() for char in host)
    domain_digits = sum(char.isdigit() for char in registrable)
    tokens = TOKEN_RE.findall(lower)
    token_lengths = [len(token) for token in tokens]
    host_labels = host.split(".") if host else []
    domain_labels = registrable.split(".") if registrable else []
    subdomains = max(0, len(host_labels) - len(domain_labels))
    tld_length = len(provider.rsplit(".", 1)[-1]) if "." in provider else 0
    suffixless = bool(host and "." not in provider and is_ip_text.lower() != "true")
    last_path_segment = path.rsplit("/", 1)[-1]
    extension_length = len(last_path_segment.rsplit(".", 1)[-1]) if "." in last_path_segment else 0
    return [
        url_len, len(host), len(registrable), len(provider), len(path), len(query), len(fragment),
        sum(bool(segment) for segment in path.split("/")), (query.count("&") + 1) if query else 0,
        subdomains, tld_length, digits, letters, special,
        digits / url_len if url_len else 0, letters / url_len if url_len else 0,
        special / url_len if url_len else 0, url.count("."), url.count("-"), url.count("_"),
        url.count("/"), url.count("@"), url.count("?"), url.count("="), url.count("&"),
        url.count("%"), url.count(":"), url.count(";"), host_digits,
        host_digits / len(host) if host else 0, host.count("-"), host.count("."),
        domain_digits, registrable.count("-"), scheme == "https", scheme == "http",
        is_ip_text.lower() == "true", explicit_port, has_userinfo, bool(fragment), bool(query),
        "xn--" in host, suffixless, bool(host and host == registrable), entropy(url), len(tokens),
        (sum(token_lengths) / len(token_lengths)) if token_lengths else 0,
        max(token_lengths) if token_lengths else 0, len(SUSPICIOUS_RE.findall(lower)),
        len(ENCODED_RE.findall(url)), max_repeat(url), extension_length,
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--role", choices=["train", "validation", "test"], required=True)
    parser.add_argument("--chunksize", type=int, default=100_000)
    parser.add_argument("--max-rows", type=int)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    input_path = args.input if args.input.is_absolute() else root / args.input
    output_path = args.output if args.output.is_absolute() else root / args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    input_hash_before = sha256_file(input_path)
    usecols = [
        "row_id", "url", "label", "normalized_host", "is_ip_host",
        "private_aware_registrable_domain", "icann_provider_domain", "primary_group_id",
    ]
    matrices: list[np.ndarray] = []
    labels: list[np.ndarray] = []
    row_numbers: list[np.ndarray] = []
    group_hashes: list[np.ndarray] = []
    processed = 0
    for chunk in pd.read_csv(input_path, dtype=str, keep_default_na=False, usecols=usecols, chunksize=args.chunksize):
        if args.max_rows is not None and processed + len(chunk) > args.max_rows:
            chunk = chunk.iloc[: args.max_rows - processed]
        vectors = [
            one_feature_vector(url, host, domain, provider, is_ip)
            for url, host, domain, provider, is_ip in zip(
                chunk["url"], chunk["normalized_host"], chunk["private_aware_registrable_domain"],
                chunk["icann_provider_domain"], chunk["is_ip_host"], strict=True
            )
        ]
        matrices.append(np.asarray(vectors, dtype=np.float32))
        labels.append(chunk["label"].astype(np.uint8).to_numpy())
        row_numbers.append(np.fromiter((row_number(v) for v in chunk["row_id"]), dtype=np.int64, count=len(chunk)))
        group_hashes.append(np.fromiter((group_hash(v) for v in chunk["primary_group_id"]), dtype=np.uint64, count=len(chunk)))
        processed += len(chunk)
        print(f"{args.role}: extracted {processed:,} rows", flush=True)
        if args.max_rows is not None and processed >= args.max_rows:
            break
    X = np.concatenate(matrices)
    y = np.concatenate(labels)
    raw_row_number = np.concatenate(row_numbers)
    primary_group_hash = np.concatenate(group_hashes)
    if X.shape[1] != len(FEATURE_NAMES):
        raise RuntimeError(f"Feature width mismatch: {X.shape[1]} vs {len(FEATURE_NAMES)}")
    np.savez_compressed(
        output_path, X=X, y=y, raw_row_number=raw_row_number,
        primary_group_hash=primary_group_hash,
    )
    input_hash_after = sha256_file(input_path)
    output_hash = sha256_file(output_path)
    manifest = {
        "extractor_version": EXTRACTOR_VERSION,
        "role": args.role,
        "input": str(input_path),
        "input_sha256_before": input_hash_before,
        "input_sha256_after": input_hash_after,
        "input_unchanged": input_hash_before == input_hash_after,
        "output": str(output_path),
        "output_sha256": output_hash,
        "rows": int(len(y)),
        "feature_count": len(FEATURE_NAMES),
        "feature_names": FEATURE_NAMES,
        "dtype": "float32",
        "label_dtype": "uint8",
        "row_identifier": "original raw row number parsed from stable row_id",
        "group_identifier": "first 64 bits of SHA-256(primary_group_id), used only for deterministic subpartitioning",
        "stateless": True,
        "learned_preprocessing": False,
    }
    manifest_path = output_path.with_suffix(".manifest.json")
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    unique_labels, unique_counts = np.unique(y, return_counts=True)
    label_summary = {str(int(label)): int(count) for label, count in zip(unique_labels, unique_counts, strict=True)}
    print(json.dumps({"role": args.role, "shape": X.shape, "labels": label_summary, "sha256": output_hash}, default=int, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
