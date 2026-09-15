#!/usr/bin/env python3
"""Exercise the supported online Alembic path against a disposable MySQL database."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
PLATFORM = ROOT / "shared_platform"
sys.path.insert(0, str(ROOT))


def run_alembic(*arguments: str) -> None:
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(PLATFORM)
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", *arguments],
        cwd=PLATFORM,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"Alembic {' '.join(arguments)} failed:\n{detail}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database-url", required=True)
    args = parser.parse_args()
    os.environ["BANTAI_DATABASE_URL"] = args.database_url
    os.environ.setdefault("BANTAI_CREATE_SCHEMA", "false")
    os.environ.setdefault("BANTAI_ENCRYPTION_KEY", "bWlncmF0aW9uLXRlc3Qta2V5LWRvLW5vdC11c2UtaW4tcHJvZA==")
    os.environ.setdefault("BANTAI_TRUSTED_PROXY_CIDRS", "172.20.0.0/24")

    from sqlalchemy import inspect, select, text

    from shared_platform.app.database import SessionLocal, engine
    from shared_platform.app.models import User, UserStatus

    run_alembic("upgrade", "head")
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    required_tables = {"users", "activity_events", "email_reports", "rate_limit_buckets"}
    missing_tables = required_tables - tables
    if missing_tables:
        raise RuntimeError(f"Clean migration missing tables: {sorted(missing_tables)}")

    rate_pk = inspector.get_pk_constraint("rate_limit_buckets")
    rate_indexes = {index["name"] for index in inspector.get_indexes("rate_limit_buckets")}
    if rate_pk.get("constrained_columns") != ["key_hash"]:
        raise RuntimeError("rate_limit_buckets primary key contract is incorrect")
    if "ix_rate_limit_buckets_window_started_at" not in rate_indexes:
        raise RuntimeError("rate_limit_buckets window index is missing")

    email_foreign_keys = inspector.get_foreign_keys("email_reports")
    if not any(
        foreign_key.get("referred_table") == "activity_events"
        and foreign_key.get("constrained_columns") == ["activity_event_id"]
        for foreign_key in email_foreign_keys
    ):
        raise RuntimeError("email_reports.activity_event_id foreign key is missing")

    with SessionLocal() as db:
        existing = User(
            email="migration-survival@example.invalid",
            first_name="Synthetic",
            last_name="Migration",
            password_hash="synthetic-hash",
            status=UserStatus.ACTIVE,
        )
        db.add(existing)
        db.commit()
        existing_id = existing.id

    run_alembic("downgrade", "0013_input_explanation_limit")
    run_alembic("upgrade", "head")
    with SessionLocal() as db:
        survivor = db.scalar(select(User).where(User.id == existing_id))
        if survivor is None:
            raise RuntimeError("Existing user data did not survive 0013 -> 0014 upgrade")
        if db.scalar(text("SELECT COUNT(*) FROM rate_limit_buckets")) is None:
            raise RuntimeError("rate_limit_buckets is not queryable after forward migration")

    from fastapi.testclient import TestClient
    from shared_platform.app.main import app, detector_gateway

    with patch.object(detector_gateway, "readiness", return_value={"status": "ready"}):
        with TestClient(app) as client:
            readiness = client.get("/ready")
    if readiness.status_code != 200:
        raise RuntimeError(f"Application readiness failed after migration: {readiness.status_code} {readiness.text}")
    if readiness.json().get("status") != "ready":
        raise RuntimeError("Application readiness did not return status=ready")

    print("PASS: clean head migration, 0013->0014 data survival, schema contracts, and application readiness.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
