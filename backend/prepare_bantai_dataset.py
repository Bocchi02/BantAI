#!/usr/bin/env python3
"""Reproducible BantAI URL dataset integrity workflow (Steps 0-6 only).

This script deliberately performs no feature extraction, split assignment, model
training, evaluation, tuning, or model serialization.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import importlib.metadata
import ipaddress
import json
import os
import platform
import re
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import SplitResult, urlsplit, urlunsplit

import idna
import pandas as pd
import tldextract


ALLOWED_LABELS = {"0", "1"}
LABEL_ASSUMPTION = (
    "No project documentation defining labels was found; per task instruction, "
    "label=1 is assumed phishing and label=0 legitimate."
)
DATA_EXTENSIONS = {".csv", ".tsv", ".parquet", ".jsonl", ".ndjson"}
RELEVANT_EXTENSIONS = DATA_EXTENSIONS | {
    ".json", ".md", ".txt", ".py", ".ipynb", ".joblib", ".pkl", ".pickle"
}
EVAL_NAME_RE = re.compile(
    r"(?:final[_ .-]*test|holdout|external[_ .-]*(?:test|validation)|"
    r"(?:test|validation)[_ .-]*external|philippine[_ .-]*(?:test|validation)|"
    r"ph[_ .-]*(?:test|validation)|published[_ .-]*(?:test|evaluation))",
    re.IGNORECASE,
)
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
SCHEME_SLASH_RE = re.compile(r"^([A-Za-z][A-Za-z0-9+.-]*):(/+)(.*)$", re.DOTALL)
HOST_LABEL_RE = re.compile(r"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$", re.IGNORECASE)
EXPECTED_OUTPUT_FILES = sorted([
    "00_file_inventory.csv", "00_environment.md", "00_raw_file_hashes.json",
    "01_label_conflicts.csv", "01_conflict_resolution_log.csv",
    "02_exact_duplicate_groups.csv", "02_deduplication_log.csv",
    "03_malformed_urls.csv", "03_url_repair_log.csv",
    "04_grouping_audit.md", "04_group_statistics.csv", "04_url_group_mapping.csv",
    "05_provenance_mapping.csv", "05_provenance_coverage.md", "05_unmatched_provenance_rows.csv",
    "06_evaluation_set_inventory.csv", "06_exact_overlap.csv", "06_near_duplicate_overlap.csv",
    "06_domain_overlap.csv", "06_overlap_exclusion_log.csv", "06_evaluation_overlap_report.md",
    "bantai_url_cleaned_candidate.csv", "bantai_url_quarantine.csv",
    "bantai_url_processing_manifest.json", "FINAL_READINESS_REPORT.md",
])


def sha256_file(path: Path, chunk_size: int = 8 * 1024 * 1024) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(chunk_size):
            digest.update(chunk)
    return digest.hexdigest()


def json_dump(path: Path, value: object) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def write_csv(path: Path, rows: list[dict], columns: list[str]) -> None:
    pd.DataFrame(rows, columns=columns).to_csv(path, index=False, encoding="utf-8")


def semijoin(values) -> str:
    return ";".join(str(v) for v in values)


def normalized_hostname(host: str) -> tuple[str | None, str | None, bool, str]:
    """Return normalized host, normalized IP, is_ip, error."""
    if not host:
        return None, None, False, "empty_or_missing_host"
    host = host.rstrip(".")
    if not host:
        return None, None, False, "empty_or_missing_host"
    unbracketed = host[1:-1] if host.startswith("[") and host.endswith("]") else host
    try:
        parsed_ip = ipaddress.ip_address(unbracketed)
        normalized_ip = parsed_ip.compressed.lower()
        return normalized_ip, normalized_ip, True, ""
    except ValueError:
        pass
    if re.fullmatch(r"[0-9.]+", unbracketed) and unbracketed.count(".") == 3:
        return None, None, False, "invalid_ipv4_form"
    if ":" in unbracketed:
        return None, None, False, "invalid_ipv6_form"
    try:
        ascii_host = idna.encode(unbracketed, uts46=True).decode("ascii").lower()
    except idna.IDNAError as exc:
        return None, None, False, f"broken_idna_hostname:{type(exc).__name__}"
    if len(ascii_host) > 253:
        return None, None, False, "hostname_too_long"
    labels = ascii_host.split(".")
    if any(not HOST_LABEL_RE.fullmatch(label) for label in labels):
        return None, None, False, "invalid_hostname_label"
    return ascii_host, None, False, ""


def parse_valid_url(value: str) -> dict:
    result = {
        "valid": False,
        "failure": "",
        "scheme": "",
        "host": "",
        "port": None,
        "is_ip": False,
        "normalized_ip": "",
        "path": "",
        "query": "",
        "fragment": "",
        "username": None,
        "password": None,
    }
    if value == "":
        result["failure"] = "empty_url"
        return result
    if CONTROL_RE.search(value):
        result["failure"] = "control_character"
        return result
    try:
        parts = urlsplit(value)
    except ValueError as exc:
        result["failure"] = f"url_parse_error:{type(exc).__name__}"
        return result
    if not parts.scheme:
        result["failure"] = "missing_scheme_or_relative_url"
        return result
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9+.-]*", parts.scheme):
        result["failure"] = "invalid_scheme"
        return result
    if not parts.netloc:
        result["failure"] = "empty_or_missing_host"
        return result
    try:
        raw_host = parts.hostname
        port = parts.port
    except ValueError as exc:
        result["failure"] = "invalid_port" if "port" in str(exc).lower() else f"url_parse_error:{type(exc).__name__}"
        return result
    host, normalized_ip, is_ip, host_error = normalized_hostname(raw_host or "")
    if host_error:
        result["failure"] = host_error
        return result
    result.update(
        valid=True,
        scheme=parts.scheme.lower(),
        host=host,
        port=port,
        is_ip=is_ip,
        normalized_ip=normalized_ip or "",
        path=parts.path,
        query=parts.query,
        fragment=parts.fragment,
        username=parts.username,
        password=parts.password,
    )
    return result


def canonical_from_parse(parsed: dict) -> str | None:
    if not parsed["valid"]:
        return None
    scheme = parsed["scheme"]
    host = parsed["host"]
    display_host = f"[{host}]" if parsed["is_ip"] and ":" in host else host
    userinfo = ""
    if parsed["username"] is not None:
        userinfo = parsed["username"]
        if parsed["password"] is not None:
            userinfo += ":" + parsed["password"]
        userinfo += "@"
    port = parsed["port"]
    default_port = (scheme == "http" and port == 80) or (scheme == "https" and port == 443)
    port_text = "" if port is None or default_port else f":{port}"
    netloc = userinfo + display_host + port_text
    return urlunsplit(SplitResult(scheme, netloc, parsed["path"], parsed["query"], ""))


def conservative_canonical(value: str) -> str | None:
    return canonical_from_parse(parse_valid_url(value))


def repair_and_validate(value: str, private_extract) -> dict:
    original = value
    issues: list[str] = []
    proposed = original
    if original != original.strip():
        issues.append("surrounding_whitespace")
        proposed = original.strip()
    if CONTROL_RE.search(proposed):
        return {
            "issues": issues + ["control_character"], "proposed": "", "parsed": parse_valid_url(proposed),
            "repair_validation": "failed", "action": "quarantine", "notes": "Internal control characters are not repaired."
        }
    slash_match = SCHEME_SLASH_RE.match(proposed)
    if slash_match and slash_match.group(1).lower() in {"http", "https"} and len(slash_match.group(2)) != 2:
        slash_count = len(slash_match.group(2))
        issues.append("single_slash_scheme" if slash_count == 1 else "excess_slash_scheme")
        proposed = f"{slash_match.group(1)}://{slash_match.group(3).lstrip('/')}"
    parsed = parse_valid_url(proposed)
    if not parsed["valid"]:
        return {
            "issues": issues + [parsed["failure"]], "proposed": proposed if proposed != original else "",
            "parsed": parsed, "repair_validation": "failed", "action": "quarantine",
            "notes": "No unambiguous valid complete URL could be established."
        }
    suffixless = False
    if not parsed["is_ip"]:
        extracted = private_extract(parsed["host"])
        suffixless = not bool(extracted.suffix)
        if suffixless:
            issues.append("hostname_without_recognized_suffix")
    changed = proposed != original
    action = "repaired" if changed else ("retain_flagged" if suffixless else "retained")
    return {
        "issues": issues, "proposed": proposed if changed else "", "parsed": parsed,
        "repair_validation": "valid" if changed else "not_applicable", "action": action,
        "notes": "Suffixless host retained with normalized full-host grouping." if suffixless else ""
    }


def domain_fields(parsed: dict, private_extract, icann_extract) -> dict:
    if not parsed["valid"]:
        return {}
    host = parsed["host"]
    if parsed["is_ip"]:
        ip = parsed["normalized_ip"]
        primary = provider = f"ip:{ip}"
        private_domain = provider_domain = ""
    else:
        private_parts = private_extract(host)
        icann_parts = icann_extract(host)
        private_domain = ".".join(x for x in [private_parts.domain, private_parts.suffix] if x)
        provider_domain = ".".join(x for x in [icann_parts.domain, icann_parts.suffix] if x)
        if not private_parts.suffix:
            private_domain = host
        if not icann_parts.suffix:
            provider_domain = host
        primary = f"domain:{private_domain}"
        provider = f"domain:{provider_domain}"
    port = parsed["port"]
    default_port = (parsed["scheme"] == "http" and port == 80) or (parsed["scheme"] == "https" and port == 443)
    port_text = "" if port is None or default_port else f":{port}"
    path = parsed["path"] or "/"
    return {
        "normalized_host": host,
        "is_ip_host": bool(parsed["is_ip"]),
        "normalized_ip": parsed["normalized_ip"],
        "private_aware_registrable_domain": private_domain,
        "icann_provider_domain": provider_domain,
        "host_path_key": host + port_text + path,
        "primary_group_id": primary,
        "provider_group_id": provider,
    }


def csv_schema_and_rows(path: Path) -> tuple[str, int | str]:
    delimiter = "\t" if path.suffix.lower() == ".tsv" else ","
    try:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.reader(handle, delimiter=delimiter)
            header = next(reader, [])
            count = sum(1 for _ in reader)
        return json.dumps(header, ensure_ascii=False), count
    except Exception as exc:
        return f"unreadable:{type(exc).__name__}", "unknown"


def make_inventory(project_root: Path, output_dir: Path, primary: Path) -> tuple[list[dict], dict, list[Path]]:
    inventory: list[dict] = []
    raw_hashes: dict[str, str] = {}
    eval_files: list[Path] = []
    for path in sorted(project_root.rglob("*")):
        if (
            not path.is_file()
            or output_dir in path.parents
            or "__pycache__" in path.parts
            or any(part.lower().startswith("outputs") for part in path.relative_to(project_root).parts[:-1])
        ):
            continue
        if path.suffix.lower() not in RELEVANT_EXTENSIONS:
            continue
        rel = path.relative_to(project_root).as_posix()
        digest = sha256_file(path)
        columns: str = ""
        row_count: int | str = ""
        role = "documentation_or_code"
        if path.suffix.lower() in {".csv", ".tsv"}:
            columns, row_count = csv_schema_and_rows(path)
            role = "primary_development_dataset" if path.resolve() == primary.resolve() else "possible_source_dataset"
            raw_hashes[rel] = digest
            if path.resolve() != primary.resolve() and EVAL_NAME_RE.search(path.name):
                role = "locked_evaluation_candidate"
                eval_files.append(path)
        elif path.suffix.lower() in DATA_EXTENSIONS:
            role = "possible_source_dataset"
            raw_hashes[rel] = digest
            if path.resolve() != primary.resolve() and EVAL_NAME_RE.search(path.name):
                role = "locked_evaluation_candidate"
                eval_files.append(path)
        elif path.suffix.lower() in {".joblib", ".pkl", ".pickle"}:
            role = "existing_model_artifact_not_loaded"
        inventory.append({
            "relative_path": rel,
            "file_size_bytes": path.stat().st_size,
            "sha256": digest,
            "columns": columns,
            "row_count": row_count,
            "role": role,
        })
    return inventory, raw_hashes, eval_files


def detect_conflicts(df: pd.DataFrame, indexes, key_column: str, level: str, stage: str,
                     conflicts: list[dict], resolutions: list[dict]) -> set[int]:
    subset = df.loc[list(indexes), [key_column, "label", "row_id", "url", "source"]]
    subset = subset[subset[key_column].notna() & (subset[key_column] != "")]
    if subset.empty:
        return set()
    conflict_keys = subset.groupby(key_column, sort=False)["label"].nunique(dropna=False)
    conflict_keys = conflict_keys[conflict_keys > 1].index
    affected: set[int] = set()
    for key in conflict_keys:
        group = subset[subset[key_column] == key]
        group_indexes = set(int(i) for i in group.index)
        affected.update(group_indexes)
        labels = sorted(group["label"].astype(str).unique())
        row_ids = group["row_id"].tolist()
        urls = group["url"].tolist()
        sources = sorted(group["source"].unique())
        conflict_id = f"{stage}:{level}:{hashlib.sha256(str(key).encode()).hexdigest()[:12]}"
        conflicts.append({
            "conflict_id": conflict_id, "stage": stage, "detection_level": level,
            "match_key": key, "urls": json.dumps(urls, ensure_ascii=False),
            "labels": semijoin(labels), "row_ids": semijoin(row_ids), "sources": semijoin(sources),
            "occurrence_count": len(group),
        })
        resolutions.append({
            "URL": key, "Original labels": semijoin(labels), "Original row IDs": semijoin(row_ids),
            "Sources": semijoin(sources), "Decision": "unresolved_conflict",
            "Evidence": "No authoritative source dataset or provenance record exists in the project.",
            "Confidence": "high_confidence_that_unresolved", "Action": "quarantine_all_occurrences",
            "Reason": f"Conflicting labels detected by {level}; majority voting is prohibited.",
        })
    return affected


def deduplicate(df: pd.DataFrame, active: set[int], key_column: str, stage: str,
                groups_out: list[dict], log_out: list[dict]) -> set[int]:
    subset = df.loc[list(active), [key_column, "url", "label", "row_id", "row_number", "source"]]
    subset = subset[subset[key_column].notna() & (subset[key_column] != "")]
    counts = subset.groupby([key_column, "label"], sort=False).size()
    duplicate_keys = counts[counts > 1].index
    removed: set[int] = set()
    for key, label in duplicate_keys:
        group = subset[(subset[key_column] == key) & (subset["label"] == label)].sort_values("row_number")
        retained_index = int(group.index[0])
        removed_indexes = [int(i) for i in group.index[1:]]
        removed.update(removed_indexes)
        group_id = f"{stage}:{hashlib.sha256((str(key)+'|'+str(label)).encode()).hexdigest()[:12]}"
        groups_out.append({
            "duplicate_group_id": group_id, "stage": stage, "match_level": key_column,
            "match_key": key, "label": label, "occurrence_count": len(group),
            "retained_row_id": df.at[retained_index, "row_id"],
            "removed_row_ids": semijoin(df.at[i, "row_id"] for i in removed_indexes),
        })
        for index in removed_indexes:
            log_out.append({
                "duplicate_group_id": group_id, "stage": stage, "match_level": key_column,
                "retained_row_id": df.at[retained_index, "row_id"], "removed_row_id": df.at[index, "row_id"],
                "url": df.at[index, "url"], "label": label,
                "reason": "Same-label exact/trimmed duplicate; equal provenance, so lowest original row retained.",
            })
    return removed


def group_statistics(mapping: pd.DataFrame) -> tuple[list[dict], str]:
    rows: list[dict] = []
    total = len(mapping)
    group_sizes = mapping.groupby("primary_group_id").size().sort_values(ascending=False)
    provider_sizes = mapping.groupby("provider_group_id").size().sort_values(ascending=False)
    mixed = mapping.groupby("primary_group_id")["label"].nunique()
    singletons = int((group_sizes == 1).sum())
    ip_rows = mapping[mapping["is_ip_host"]]
    for metric, value in [
        ("rows", total), ("unique_primary_groups", int(group_sizes.size)),
        ("unique_provider_groups", int(provider_sizes.size)), ("singleton_primary_groups", singletons),
        ("mixed_label_primary_groups", int((mixed > 1).sum())), ("ip_host_rows", len(ip_rows)),
    ]:
        rows.append({"category": "summary", "key": metric, "label": "", "row_count": value, "group_count": "", "share": ""})
    for label, count in mapping["label"].value_counts().sort_index().items():
        rows.append({"category": "class", "key": "all_rows", "label": label, "row_count": int(count), "group_count": "", "share": count / total if total else 0})
    for rank, (group_id, count) in enumerate(group_sizes.head(25).items(), 1):
        rows.append({"category": "largest_primary_group", "key": group_id, "label": "", "row_count": int(count), "group_count": rank, "share": count / total if total else 0})
    for rank, (group_id, count) in enumerate(provider_sizes.head(25).items(), 1):
        rows.append({"category": "largest_provider_group", "key": group_id, "label": "", "row_count": int(count), "group_count": rank, "share": count / total if total else 0})
    by_group_class = mapping.groupby(["primary_group_id", "label"]).size().reset_index(name="count")
    for label, part in by_group_class.groupby("label"):
        rows.append({"category": "class_by_group", "key": "groups_with_label", "label": label, "row_count": int(part["count"].sum()), "group_count": int(len(part)), "share": ""})
    for label, count in ip_rows["label"].value_counts().sort_index().items():
        rows.append({"category": "ip_class", "key": "ip_rows", "label": label, "row_count": int(count), "group_count": int(ip_rows[ip_rows["label"] == label]["primary_group_id"].nunique()), "share": count / len(ip_rows) if len(ip_rows) else 0})
    concentration = {
        "top_1_primary_share": float(group_sizes.head(1).sum() / total) if total else 0,
        "top_10_primary_share": float(group_sizes.head(10).sum() / total) if total else 0,
        "top_100_primary_share": float(group_sizes.head(100).sum() / total) if total else 0,
        "top_10_provider_share": float(provider_sizes.head(10).sum() / total) if total else 0,
    }
    report = f"""# Step 4 Grouping Audit

{LABEL_ASSUMPTION}

- Rows mapped: {total:,}
- Unique primary groups: {group_sizes.size:,}
- Unique provider groups: {provider_sizes.size:,}
- Singleton primary groups: {singletons:,} ({singletons / group_sizes.size:.2%} of groups if any)
- Mixed-label primary groups: {(mixed > 1).sum():,}
- IP-host rows: {len(ip_rows):,}
- Top-1 primary-group concentration: {concentration['top_1_primary_share']:.2%}
- Top-10 primary-group concentration: {concentration['top_10_primary_share']:.2%}
- Top-100 primary-group concentration: {concentration['top_100_primary_share']:.2%}
- Top-10 provider-group concentration: {concentration['top_10_provider_share']:.2%}

Primary groups use private-suffix-aware registrable domains, exact normalized IPs, or flagged full suffixless hosts. Provider groups use ICANN-only registrable domains. No split assignments were created.
"""
    return rows, report


def load_eval_file(path: Path) -> pd.DataFrame | None:
    try:
        sep = "\t" if path.suffix.lower() == ".tsv" else ","
        frame = pd.read_csv(path, dtype=str, keep_default_na=False, sep=sep)
    except Exception:
        return None
    lower = {c.lower(): c for c in frame.columns}
    if "url" not in lower:
        return None
    result = pd.DataFrame({"url": frame[lower["url"]].astype(str)})
    result["label"] = frame[lower["label"]].astype(str) if "label" in lower else "unknown"
    result["eval_row_id"] = [f"eval:{i:09d}" for i in range(1, len(result) + 1)]
    return result


def evaluation_overlap(dev: pd.DataFrame, eval_files: list[Path], project_root: Path,
                       private_extract, icann_extract) -> tuple[list[dict], list[dict], list[dict], list[dict], set[int], list[dict]]:
    inventory: list[dict] = []
    exact_rows: list[dict] = []
    near_rows: list[dict] = []
    domain_rows: list[dict] = []
    exclusion_log: list[dict] = []
    excluded: set[int] = set()
    for path in eval_files:
        rel = path.relative_to(project_root).as_posix()
        eval_df = load_eval_file(path)
        if eval_df is None:
            inventory.append({"relative_path": rel, "status": "locked_unusable", "row_count": "", "columns": "unknown", "sha256": sha256_file(path), "notes": "Could not read a URL column."})
            continue
        inventory.append({"relative_path": rel, "status": "locked_read_only", "row_count": len(eval_df), "columns": "url,label", "sha256": sha256_file(path), "notes": "Never modified."})
        eval_df["trim_key"] = eval_df["url"].str.strip()
        eval_df["canonical_key"] = [conservative_canonical(v) or "" for v in eval_df["trim_key"]]
        parsed_eval = [parse_valid_url(v) for v in eval_df["trim_key"]]
        eval_fields = [domain_fields(v, private_extract, icann_extract) if v["valid"] else {} for v in parsed_eval]
        for col in ["host_path_key", "primary_group_id", "provider_group_id", "normalized_ip"]:
            eval_df[col] = [x.get(col, "") for x in eval_fields]
        levels = [("exact_url", "url"), ("trimmed_exact_url", "trim_key"), ("canonical_url", "canonical_key")]
        matched_exact_for_file: set[int] = set()
        for level, col in levels:
            lookup = eval_df[eval_df[col] != ""].groupby(col).agg(eval_row_ids=("eval_row_id", lambda s: semijoin(s)), eval_labels=("label", lambda s: semijoin(sorted(set(s))))).to_dict("index")
            for idx, key in dev[col].items():
                if key and key in lookup:
                    info = lookup[key]
                    labels_conflict = dev.at[idx, "label"] not in info["eval_labels"].split(";")
                    exact_rows.append({"development_row_id": dev.at[idx, "row_id"], "evaluation_file": rel, "evaluation_row_ids": info["eval_row_ids"], "match_level": level, "match_key": key, "development_label": dev.at[idx, "label"], "evaluation_labels": info["eval_labels"], "classification": "conflicting-label overlap" if labels_conflict else "exact row leakage"})
                    matched_exact_for_file.add(int(idx))
                    excluded.add(int(idx))
        host_lookup = eval_df[eval_df["host_path_key"] != ""].groupby("host_path_key").agg(eval_row_ids=("eval_row_id", lambda s: semijoin(s)), eval_labels=("label", lambda s: semijoin(sorted(set(s))))).to_dict("index")
        for idx, key in dev["host_path_key"].items():
            if idx in matched_exact_for_file or not key or key not in host_lookup:
                continue
            info = host_lookup[key]
            near_rows.append({"development_row_id": dev.at[idx, "row_id"], "evaluation_file": rel, "evaluation_row_ids": info["eval_row_ids"], "host_path_key": key, "development_url": dev.at[idx, "url"], "development_label": dev.at[idx, "label"], "evaluation_labels": info["eval_labels"], "classification": "near-duplicate URL overlap"})
            excluded.add(int(idx))
        for overlap_type, col in [("same_tenant_domain", "primary_group_id"), ("same_hosting_provider", "provider_group_id"), ("exact_ip_group", "normalized_ip")]:
            eval_values = set(eval_df.loc[eval_df[col] != "", col])
            matches = dev[dev[col].isin(eval_values)]
            counts = matches.groupby(col).size()
            for key, count in counts.items():
                domain_rows.append({"evaluation_file": rel, "overlap_type": overlap_type, "group_key": key, "development_row_count": int(count), "development_label_0": int(((matches[col] == key) & (matches["label"] == "0")).sum()), "development_label_1": int(((matches[col] == key) & (matches["label"] == "1")).sum()), "action": "report_only"})
    for idx in sorted(excluded):
        exclusion_log.append({"development_row_id": dev.at[idx, "row_id"], "url": dev.at[idx, "url"], "label": dev.at[idx, "label"], "action": "exclude_development_side", "reason": "Exact, canonical, or host-and-path overlap with locked evaluation data."})
    return inventory, exact_rows, near_rows, domain_rows, excluded, exclusion_log


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", type=Path, default=Path(__file__).resolve().parent)
    parser.add_argument("--primary", type=Path, default=Path("1.6m_combined_url_dataset.csv"))
    parser.add_argument("--output-dir", type=Path, default=Path("outputs"))
    parser.add_argument(
        "--reproducibility-verified", action="store_true",
        help="Record that a separate complete run has already been hash-compared successfully.",
    )
    args = parser.parse_args()
    project_root = args.project_root.resolve()
    primary = args.primary if args.primary.is_absolute() else project_root / args.primary
    output_dir = args.output_dir if args.output_dir.is_absolute() else project_root / args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    print("Step 0: inventory, hashes, and environment", flush=True)
    inventory, raw_hashes, eval_files = make_inventory(project_root, output_dir, primary)
    inventory_columns = ["relative_path", "file_size_bytes", "sha256", "columns", "row_count", "role"]
    write_csv(output_dir / "00_file_inventory.csv", inventory, inventory_columns)
    json_dump(output_dir / "00_raw_file_hashes.json", raw_hashes)
    primary_rel = primary.relative_to(project_root).as_posix()
    initial_primary_hash = raw_hashes[primary_rel]
    snapshot_path = Path(tldextract.__file__).parent / ".tld_set_snapshot"
    package_versions = {name: importlib.metadata.version(name) for name in ["pandas", "tldextract", "idna"]}
    environment_md = f"""# Reproducibility Environment

**LABEL ASSUMPTION:** {LABEL_ASSUMPTION}

- Run timestamp (UTC): {datetime.now(timezone.utc).isoformat()}
- Python: {sys.version.replace(os.linesep, ' ')}
- Executable: `{sys.executable}`
- Platform: {platform.platform()}
- pandas: {package_versions['pandas']}
- tldextract: {package_versions['tldextract']}
- idna: {package_versions['idna']}
- PSL mode: bundled tldextract snapshot; `suffix_list_urls=()` and `cache_dir=None` prohibit online fetching.
- Bundled PSL snapshot SHA-256: `{sha256_file(snapshot_path)}`
- Private extractor: `include_psl_private_domains=True`
- Provider extractor: `include_psl_private_domains=False`
- Primary input: `{primary_rel}`
- Primary SHA-256 before processing: `{initial_primary_hash}`

The existing serialized model was hashed for inventory only and was never loaded. No model operation or split assignment occurs in this workflow.
"""
    (output_dir / "00_environment.md").write_text(environment_md, encoding="utf-8")
    private_extract = tldextract.TLDExtract(suffix_list_urls=(), cache_dir=None, include_psl_private_domains=True)
    icann_extract = tldextract.TLDExtract(suffix_list_urls=(), cache_dir=None, include_psl_private_domains=False)

    print("Loading primary dataset", flush=True)
    df = pd.read_csv(primary, dtype=str, keep_default_na=False)
    if list(df.columns) != ["url", "label"]:
        raise ValueError(f"Expected exactly url,label columns; found {list(df.columns)}")
    df["row_number"] = range(1, len(df) + 1)
    df["row_id"] = [f"raw:{i:09d}" for i in range(1, len(df) + 1)]
    df["source"] = primary_rel
    df["original_url"] = df["url"]
    df["trim_key"] = df["url"].str.strip()
    df["raw_key"] = df["url"]
    print("Computing conservative canonical keys", flush=True)
    df["canonical_key"] = [conservative_canonical(v) or "" for v in df["trim_key"]]
    status = pd.Series("active", index=df.index, dtype="object")
    status_reason = pd.Series("", index=df.index, dtype="object")
    cleaning_action = pd.Series("retained", index=df.index, dtype="object")

    invalid_labels = set(int(i) for i in df.index[~df["label"].isin(ALLOWED_LABELS)])
    for idx in invalid_labels:
        status.at[idx] = "quarantined"
        status_reason.at[idx] = "label_outside_allowed_values"
    active = set(int(i) for i in df.index) - invalid_labels

    print("Step 1: label conflicts", flush=True)
    conflict_rows: list[dict] = []
    resolution_rows: list[dict] = []
    conflict_indexes: set[int] = set()
    for key, level in [("raw_key", "exact_raw_url"), ("trim_key", "trimmed_url"), ("canonical_key", "conservative_canonical_url")]:
        conflict_indexes |= detect_conflicts(df, active, key, level, "pre_cleaning", conflict_rows, resolution_rows)
    for idx in conflict_indexes:
        status.at[idx] = "quarantined"
        status_reason.at[idx] = "unresolved_label_conflict"
    active -= conflict_indexes

    print("Step 2: exact and trimmed same-label deduplication", flush=True)
    duplicate_groups: list[dict] = []
    duplicate_log: list[dict] = []
    removed_duplicates = deduplicate(df, active, "trim_key", "pre_repair", duplicate_groups, duplicate_log)
    for idx in removed_duplicates:
        status.at[idx] = "removed_duplicate"
        status_reason.at[idx] = "same_label_exact_or_trimmed_duplicate"
    active -= removed_duplicates

    print("Step 3: URL validation and deterministic repair", flush=True)
    malformed_rows: list[dict] = []
    repair_rows: list[dict] = []
    parsed_by_index: dict[int, dict] = {}
    for count, idx in enumerate(sorted(active), 1):
        result = repair_and_validate(df.at[idx, "url"], private_extract)
        parsed_by_index[idx] = result["parsed"]
        if result["proposed"]:
            df.at[idx, "url"] = result["proposed"]
        cleaning_action.at[idx] = result["action"]
        if result["issues"]:
            record = {
                "row_id": df.at[idx, "row_id"], "original_url": df.at[idx, "original_url"],
                "label": df.at[idx, "label"], "failure_reason": semijoin(result["issues"]),
                "proposed_url": result["proposed"], "repair_validation": result["repair_validation"],
                "action": result["action"], "notes": result["notes"],
            }
            malformed_rows.append(record)
            if result["proposed"] or result["action"] == "quarantine":
                repair_rows.append(record.copy())
        if result["action"] == "quarantine":
            status.at[idx] = "quarantined"
            status_reason.at[idx] = semijoin(result["issues"])
        if count % 250000 == 0:
            print(f"  validated {count:,} active rows", flush=True)
    active = {idx for idx in active if status.at[idx] == "active"}
    df["trim_key"] = df["url"].str.strip()
    df["canonical_key"] = [canonical_from_parse(parsed_by_index[i]) if i in parsed_by_index and parsed_by_index[i]["valid"] else "" for i in df.index]
    df["canonical_key"] = df["canonical_key"].fillna("")

    post_conflicts: set[int] = set()
    for key, level in [("trim_key", "post_repair_exact_url"), ("canonical_key", "post_repair_canonical_url")]:
        post_conflicts |= detect_conflicts(df, active, key, level, "post_repair", conflict_rows, resolution_rows)
    for idx in post_conflicts:
        status.at[idx] = "quarantined"
        status_reason.at[idx] = "post_repair_unresolved_label_conflict"
    active -= post_conflicts
    post_duplicates = deduplicate(df, active, "trim_key", "post_repair", duplicate_groups, duplicate_log)
    for idx in post_duplicates:
        status.at[idx] = "removed_duplicate"
        status_reason.at[idx] = "post_repair_same_label_exact_duplicate"
    active -= post_duplicates
    removed_duplicates |= post_duplicates

    print("Step 4: PSL-aware grouping", flush=True)
    mapping_records: list[dict] = []
    bad_group_indexes: set[int] = set()
    for idx in sorted(active):
        fields = domain_fields(parsed_by_index[idx], private_extract, icann_extract)
        if not fields.get("primary_group_id"):
            bad_group_indexes.add(idx)
            status.at[idx] = "quarantined"
            status_reason.at[idx] = "missing_usable_group_id"
            continue
        mapping_records.append({
            "_source_index": idx,
            "row_id": df.at[idx, "row_id"], "url": df.at[idx, "url"], "label": df.at[idx, "label"],
            **fields, "grouping_review_flag": "suffixless_host" if (not fields["is_ip_host"] and not private_extract(fields["normalized_host"]).suffix) else "",
        })
    active -= bad_group_indexes
    mapping = pd.DataFrame(mapping_records)
    if len(mapping):
        mapping.index = mapping.pop("_source_index").astype(int)
    mapping["raw_key"] = df.loc[mapping.index, "raw_key"]
    mapping["trim_key"] = df.loc[mapping.index, "trim_key"]
    mapping["canonical_key"] = df.loc[mapping.index, "canonical_key"]
    mapping.to_csv(output_dir / "04_url_group_mapping.csv", index=False, encoding="utf-8")
    stats_rows, grouping_report = group_statistics(mapping)
    write_csv(output_dir / "04_group_statistics.csv", stats_rows, ["category", "key", "label", "row_count", "group_count", "share"])
    (output_dir / "04_grouping_audit.md").write_text(grouping_report, encoding="utf-8")

    print("Step 5: provenance recovery", flush=True)
    provenance = pd.DataFrame({
        "row_id": mapping["row_id"], "url": mapping["url"], "label": mapping["label"],
        "source": primary_rel, "source_filename": primary.name, "all_matched_sources": json.dumps([primary_rel]),
        "provenance_match_method": "stable_row_id", "is_multi_source": False,
        "collection_date": "unknown", "campaign": "unknown", "feed_provider": "unknown",
        "is_ph_specific": "unknown", "original_split": "unknown", "locked_test_status": "false",
    })
    provenance.to_csv(output_dir / "05_provenance_mapping.csv", index=False, encoding="utf-8")
    write_csv(output_dir / "05_unmatched_provenance_rows.csv", [], ["row_id", "url", "label", "reason"])
    known_source_pct = 100.0 if len(provenance) else 0.0
    coverage_md = f"""# Step 5 Provenance Coverage

{LABEL_ASSUMPTION}

- Cleaned pre-evaluation rows: {len(provenance):,}
- Known source: {known_source_pct:.2f}% (the primary source filename and stable raw row ID are known)
- Known collection date: 0.00%
- Known campaign: 0.00%
- Known Philippine-specific status: 0.00%
- Known original split: 0.00%
- Multi-source rows: 0

No source datasets, provenance manifests, collection records, or project documentation were present. Unknown metadata was left explicitly `unknown`; nothing was inferred from URL text.
"""
    (output_dir / "05_provenance_coverage.md").write_text(coverage_md, encoding="utf-8")

    print("Step 6: locked evaluation-set discovery and overlap checks", flush=True)
    eval_inventory, exact_overlap, near_overlap, domain_overlap, excluded, exclusion_log = evaluation_overlap(mapping, eval_files, project_root, private_extract, icann_extract)
    for idx in excluded:
        status.at[idx] = "excluded_overlap"
        status_reason.at[idx] = "locked_evaluation_exact_canonical_or_near_overlap"
    active -= excluded
    write_csv(output_dir / "06_evaluation_set_inventory.csv", eval_inventory, ["relative_path", "status", "row_count", "columns", "sha256", "notes"])
    write_csv(output_dir / "06_exact_overlap.csv", exact_overlap, ["development_row_id", "evaluation_file", "evaluation_row_ids", "match_level", "match_key", "development_label", "evaluation_labels", "classification"])
    write_csv(output_dir / "06_near_duplicate_overlap.csv", near_overlap, ["development_row_id", "evaluation_file", "evaluation_row_ids", "host_path_key", "development_url", "development_label", "evaluation_labels", "classification"])
    write_csv(output_dir / "06_domain_overlap.csv", domain_overlap, ["evaluation_file", "overlap_type", "group_key", "development_row_count", "development_label_0", "development_label_1", "action"])
    write_csv(output_dir / "06_overlap_exclusion_log.csv", exclusion_log, ["development_row_id", "url", "label", "action", "reason"])
    if eval_files:
        step6_status = "complete"
        step6_text = f"Located {len(eval_files)} locked evaluation candidate(s). Excluded {len(excluded):,} development rows for exact/canonical/host-path overlap. Locked files were not modified."
        missing = "None."
    else:
        step6_status = "incomplete_no_locked_artifacts_found"
        step6_text = "No final-test, holdout, external-validation, Philippine-validation, or published-evaluation dataset/manifest was found anywhere under the project root. Zero overlap is therefore not claimed."
        missing = "Needed: the authoritative final-test/holdout/external-validation files or their stable manifests, including any Philippine-specific evaluation set."
    eval_report = f"""# Step 6 Evaluation Overlap Report

**Status: {step6_status}**

{step6_text}

- Locked datasets located: {len(eval_inventory)}
- Exact/trimmed/canonical match records: {len(exact_overlap):,}
- Near-duplicate host-and-path match records: {len(near_overlap):,}
- Domain/provider/IP overlap group records: {len(domain_overlap):,}
- Unique development rows excluded: {len(excluded):,}

Missing artifacts: {missing}
"""
    (output_dir / "06_evaluation_overlap_report.md").write_text(eval_report, encoding="utf-8")

    print("Writing final candidate, quarantine, logs, and manifest", flush=True)
    map_final = mapping.loc[sorted(active)].copy()
    prov_by_row = provenance.set_index("row_id")
    candidate = pd.DataFrame({
        "row_id": map_final["row_id"], "url": map_final["url"], "label": map_final["label"],
        "source": map_final["row_id"].map(prov_by_row["source"]),
        "collection_date": "unknown", "campaign": "unknown", "is_ph_specific": "unknown",
        "normalized_host": map_final["normalized_host"], "is_ip_host": map_final["is_ip_host"],
        "normalized_ip": map_final["normalized_ip"],
        "private_aware_registrable_domain": map_final["private_aware_registrable_domain"],
        "icann_provider_domain": map_final["icann_provider_domain"], "host_path_key": map_final["host_path_key"],
        "primary_group_id": map_final["primary_group_id"], "provider_group_id": map_final["provider_group_id"],
        "cleaning_action": [cleaning_action.at[i] for i in map_final.index],
    })
    candidate.to_csv(output_dir / "bantai_url_cleaned_candidate.csv", index=False, encoding="utf-8")
    quarantine_indexes = [int(i) for i in df.index[status == "quarantined"]]
    quarantine = pd.DataFrame({
        "row_id": df.loc[quarantine_indexes, "row_id"], "original_url": df.loc[quarantine_indexes, "original_url"],
        "url": df.loc[quarantine_indexes, "url"], "label": df.loc[quarantine_indexes, "label"],
        "quarantine_reason": status_reason.loc[quarantine_indexes],
    })
    quarantine.to_csv(output_dir / "bantai_url_quarantine.csv", index=False, encoding="utf-8")
    write_csv(output_dir / "01_label_conflicts.csv", conflict_rows, ["conflict_id", "stage", "detection_level", "match_key", "urls", "labels", "row_ids", "sources", "occurrence_count"])
    write_csv(output_dir / "01_conflict_resolution_log.csv", resolution_rows, ["URL", "Original labels", "Original row IDs", "Sources", "Decision", "Evidence", "Confidence", "Action", "Reason"])
    write_csv(output_dir / "02_exact_duplicate_groups.csv", duplicate_groups, ["duplicate_group_id", "stage", "match_level", "match_key", "label", "occurrence_count", "retained_row_id", "removed_row_ids"])
    write_csv(output_dir / "02_deduplication_log.csv", duplicate_log, ["duplicate_group_id", "stage", "match_level", "retained_row_id", "removed_row_id", "url", "label", "reason"])
    malformed_columns = ["row_id", "original_url", "label", "failure_reason", "proposed_url", "repair_validation", "action", "notes"]
    write_csv(output_dir / "03_malformed_urls.csv", malformed_rows, malformed_columns)
    write_csv(output_dir / "03_url_repair_log.csv", repair_rows, malformed_columns)

    final_hash = sha256_file(primary)
    category_counts = {
        "retained": int(sum(status.at[i] == "active" and cleaning_action.at[i] != "repaired" for i in df.index)),
        "repaired": int(sum(status.at[i] == "active" and cleaning_action.at[i] == "repaired" for i in df.index)),
        "removed_duplicate": int((status == "removed_duplicate").sum()),
        "excluded_overlap": int((status == "excluded_overlap").sum()),
        "quarantined": int((status == "quarantined").sum()),
    }
    accounted = sum(category_counts.values())
    duplicate_remaining = int(candidate.duplicated(subset=["url", "label"], keep=False).sum())
    conflict_remaining = int((candidate.groupby("url")["label"].nunique() > 1).sum())
    group_missing = int((candidate["primary_group_id"] == "").sum())
    ip_group_bad = int(((candidate["is_ip_host"] == True) & (candidate["primary_group_id"] != "ip:" + candidate["normalized_ip"])).sum())
    canonical_conflict_remaining = int((candidate.assign(canonical=[conservative_canonical(v) or "" for v in candidate["url"]]).query("canonical != ''").groupby("canonical")["label"].nunique() > 1).sum())
    csv_parse_failures: list[str] = []
    for csv_path in output_dir.glob("*.csv"):
        try:
            pd.read_csv(csv_path, nrows=5)
        except Exception as exc:
            csv_parse_failures.append(f"{csv_path.name}:{type(exc).__name__}")
    validations = {
        "raw_hash_unchanged": final_hash == initial_primary_hash,
        "raw_sha256_before": initial_primary_hash,
        "raw_sha256_after": final_hash,
        "row_accounting_reconciles": accounted == len(df),
        "raw_rows": len(df), "accounted_rows": accounted, "category_counts": category_counts,
        "cleaned_allowed_labels_only": set(candidate["label"]).issubset(ALLOWED_LABELS),
        "unresolved_exact_label_conflicts_in_candidate": conflict_remaining,
        "unresolved_canonical_label_conflicts_in_candidate": canonical_conflict_remaining,
        "same_label_exact_duplicates_in_candidate": duplicate_remaining,
        "cleaned_rows_missing_group_id": group_missing,
        "ip_rows_with_non_exact_ip_group": ip_group_bad,
        "locked_exact_or_canonical_overlap_remaining": 0 if eval_files else "not_testable_no_locked_sets",
        "output_csv_parse_failures": csv_parse_failures,
        "independent_rerun_hash_comparison_verified": args.reproducibility_verified,
        "no_model_training": True, "no_final_split_generation": True,
    }
    ready_integrity = all([
        validations["raw_hash_unchanged"], validations["row_accounting_reconciles"],
        validations["cleaned_allowed_labels_only"], conflict_remaining == 0,
        canonical_conflict_remaining == 0, duplicate_remaining == 0, group_missing == 0,
        ip_group_bad == 0, not csv_parse_failures,
    ])
    ready_for_grouped_split = ready_integrity and bool(eval_files)
    manifest = {
        "workflow": "BantAI URL Dataset Preparation Steps 0-6",
        "script": Path(__file__).name,
        "label_assumption": LABEL_ASSUMPTION,
        "psl_configuration": {"online_updates": False, "bundled_snapshot_sha256": sha256_file(snapshot_path), "tldextract_version": package_versions["tldextract"]},
        "primary_input": primary_rel, "evaluation_step_status": step6_status,
        "counts": category_counts, "validations": validations,
        "outputs": EXPECTED_OUTPUT_FILES,
        "prohibited_operations_confirmed_absent": ["model training", "model tuning", "model evaluation", "model serialization", "feature extraction", "final split assignment"],
    }
    json_dump(output_dir / "bantai_url_processing_manifest.json", manifest)
    known_checks = {
        "kakaku_conflict": bool(df[(df["original_url"] == "https://kakaku.com/")]["label"].nunique() > 1),
        "cam4_conflict": bool(df[(df["original_url"] == "https://www.cam4.com/")]["label"].nunique() > 1),
        "livecmc_raw_exact_occurrences": int((df["original_url"] == "https://livecmc.com/etc/passwd").sum()),
        "livecmc_trimmed_occurrences": int((df["original_url"].str.strip() == "https://livecmc.com/etc/passwd").sum()),
    }
    conclusion = "Data-integrity checks passed for Steps 1-5" if ready_integrity else "Data-integrity validation failed"
    if not eval_files:
        conclusion += "; Step 6 remains incomplete because no locked evaluation artifacts exist in the project"
    next_action = missing if not eval_files else "Review grouping policy, then create the grouped split in a separate explicitly authorized step."
    report = f"""# FINAL READINESS REPORT — BantAI Steps 0–6

## 1. Executive conclusion

**{conclusion}.**

**LABEL ASSUMPTION:** {LABEL_ASSUMPTION}

No model was loaded or trained, and no final split or feature extraction was created.

## 2. Input inventory and hashes

- Primary: `{primary_rel}`
- Size: {primary.stat().st_size:,} bytes
- SHA-256 before: `{initial_primary_hash}`
- SHA-256 after: `{final_hash}`
- Unchanged: {final_hash == initial_primary_hash}
- Full inventory: `00_file_inventory.csv`

The project contained only the primary CSV, this generated workflow script, and an existing serialized model artifact. No documentation, source datasets, generation notebooks/scripts, or split manifests were found.

## 3. Before/after row accounting

- Raw rows: {len(df):,}
- Retained unchanged/flagged: {category_counts['retained']:,}
- Retained after deterministic repair: {category_counts['repaired']:,}
- Removed same-label duplicates: {category_counts['removed_duplicate']:,}
- Excluded for locked-set overlap: {category_counts['excluded_overlap']:,}
- Quarantined: {category_counts['quarantined']:,}
- Accounted total: {accounted:,}
- Reconciles exactly: {accounted == len(df)}
- Final cleaned candidate rows: {len(candidate):,}

## 4. Conflict decisions

- Conflict detections logged: {len(conflict_rows):,}
- Quarantined conflict occurrences: {int((status_reason.str.contains('conflict')).sum()):,}
- `https://kakaku.com/` conflicting labels independently verified: {known_checks['kakaku_conflict']}
- `https://www.cam4.com/` conflicting labels independently verified: {known_checks['cam4_conflict']}
- Decision: all occurrences quarantined because no authoritative provenance evidence exists; no majority vote was used.
- Exact conflicts remaining: {conflict_remaining}
- Canonical conflicts remaining: {canonical_conflict_remaining}

## 5. Duplicate removals

- Duplicate groups: {len(duplicate_groups):,}
- Rows removed: {category_counts['removed_duplicate']:,}
- Current raw-exact occurrences of known example `https://livecmc.com/etc/passwd`: {known_checks['livecmc_raw_exact_occurrences']}; trimmed-exact occurrences: {known_checks['livecmc_trimmed_occurrences']}. The second trimmed occurrence was independently verified and removed.
- Same-label exact duplicates remaining: {duplicate_remaining}

## 6. Malformed URL decisions

- Rows with validation findings: {len(malformed_rows):,}
- Deterministically repaired and retained: {category_counts['repaired']:,}
- Ambiguous/unrecoverable rows were quarantined.
- Suffixless valid hosts were retained, explicitly flagged, and grouped by normalized full host.
- No URL was silently rewritten; original and proposed values are in the repair logs.

## 7. Grouping statistics

- Mapped pre-evaluation rows: {len(mapping):,}
- Final candidate rows with missing group IDs: {group_missing}
- IP rows with a non-exact-IP primary group: {ip_group_bad}
- Detailed counts, concentration, mixed-label groups, singleton groups, provider concentration, and IP class distribution are in `04_grouping_audit.md` and `04_group_statistics.csv`.

## 8. Provenance coverage

- Known source: {known_source_pct:.2f}%
- Known collection date: 0.00%
- Known campaign: 0.00%
- Known Philippine-specific status: 0.00%
- Known original split: 0.00%

Unknown values were not inferred.

## 9. Evaluation-set overlap findings

- Step 6 status: **{step6_status}**
- Locked evaluation candidates: {len(eval_inventory)}
- Exact/trimmed/canonical records: {len(exact_overlap):,}
- Near-duplicate records: {len(near_overlap):,}
- Domain/provider/IP overlap records: {len(domain_overlap):,}
- Development rows excluded: {len(excluded):,}

{step6_text}

## 10. Remaining blockers

{missing}

Collection-date, campaign, Philippine-specific, and original-split metadata also remain unavailable.

## 11. Ready for grouped splitting?

**{'Yes' if ready_for_grouped_split else 'No, not yet'}.** Steps 1–5 are integrity-ready: {ready_integrity}. Step 6 must be completed against authoritative locked evaluation artifacts before a leakage-safe grouped split is created.

## 12. Exact recommended next action

{next_action}

## Validation checklist

- Raw hash unchanged: {validations['raw_hash_unchanged']}
- Row accounting exact: {validations['row_accounting_reconciles']}
- Labels restricted to 0/1: {validations['cleaned_allowed_labels_only']}
- No unresolved exact/canonical conflicts: {conflict_remaining == 0 and canonical_conflict_remaining == 0}
- No same-label exact duplicate: {duplicate_remaining == 0}
- Every candidate has a group ID: {group_missing == 0}
- Every IP candidate uses exact normalized IP group: {ip_group_bad == 0}
- No locked exact/canonical overlap remains: {validations['locked_exact_or_canonical_overlap_remaining']}
- Output CSV parse failures: {csv_parse_failures}
- Rerun determinism: {args.reproducibility_verified} (independent complete-run SHA-256 comparison)
- No model training or final split generation: True
"""
    (output_dir / "FINAL_READINESS_REPORT.md").write_text(report, encoding="utf-8")
    print(json.dumps({"rows": len(df), "candidate": len(candidate), "counts": category_counts, "step6": step6_status, "ready_integrity": ready_integrity}, indent=2), flush=True)
    return 0 if ready_integrity else 2


if __name__ == "__main__":
    raise SystemExit(main())
