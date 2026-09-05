#!/usr/bin/env python3
"""Run deterministic synthetic smoke cases through the local email model."""

from __future__ import annotations

import sys
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
sys.path.insert(0, str(BACKEND))

from email_model import MODEL_VERSION  # noqa: E402


MODEL_DIR = ROOT / "models" / "email_text_xlmr_v2" / MODEL_VERSION
os.environ["BANTAI_MODEL_DIR"] = str(MODEL_DIR)

import server  # noqa: E402


CASES = (
    (
        "routine_project_update",
        "Synthetic project update",
        "The scheduled internal meeting remains tomorrow at ten. No action is required.",
    ),
    (
        "urgent_credential_request",
        "Urgent synthetic account alert",
        "Verify your password and one-time code immediately or the synthetic account will close.",
    ),
)


def main() -> int:
    server.load_email_model()

    for name, subject, body in CASES:
        result = server.analyze_email(
            server.EmailAnalysisRequest(
                provider="gmail",
                subject=subject,
                body=body,
            )
        )
        print(
            f"{name}: suspicious_probability={result.suspicious_probability:.12f}; "
            f"classification={result.signal}; tokens={result.analyzed_token_count}; "
            f"model={result.model_version}; calibration={result.calibration_method}"
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
