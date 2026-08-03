from __future__ import annotations

import os
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional
from urllib.parse import urlsplit

import joblib
import pandas as pd
import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
)

from bantai_rf_url_model_v4b_runtime import (
    extract_v4b_features,
)


VERSION = "1.0.0"

# Frozen XLM-RoBERTa Email NLP V1 configuration.
EMAIL_MODEL_NAME = (
    "BantAI XLM-RoBERTa "
    "NLP Classification Model V1"
)
EMAIL_THRESHOLD = 0.05
EMAIL_MAX_LENGTH = 256

# Frozen Random Forest URL V4-B configuration.
URL_MODEL_NAME = (
    "BantAI Random Forest "
    "URL Model V4-B"
)
URL_THRESHOLD = 0.6800401751682739

SUPPORTED_EMAIL_PROVIDERS = {
    "gmail",
    "outlook",
    "yahoo",
}


class Runtime:
    email_tokenizer = None
    email_model = None
    email_device: Optional[torch.device] = None
    email_model_dir: Optional[Path] = None

    url_bundle = None
    url_model = None
    url_feature_names: list[str] = []
    url_model_path: Optional[Path] = None
    url_model_version: str = "V4-B"


runtime = Runtime()


class UrlAnalysisRequest(BaseModel):
    url: str = Field(
        min_length=1,
        max_length=8192,
    )


class UrlAnalysisResponse(BaseModel):
    analysis_id: str
    detector: str
    signal: str
    current_url: str
    hostname: str
    suspicious_probability: float
    safe_probability: float
    threshold: float
    message: str
    scanned_source: str
    automatic_navigation_performed: bool


class EmailAnalysisRequest(BaseModel):
    provider: str
    sender: Optional[str] = None
    subject: str = ""
    body: str = Field(
        min_length=1,
    )


class EmailAnalysisResponse(BaseModel):
    analysis_id: str
    detector: str
    provider: str
    sender: Optional[str]
    subject: str
    signal: str
    suspicious_probability: float
    safe_probability: float
    threshold: float
    max_length: int
    original_token_count: int
    analyzed_token_count: int
    was_truncated: bool
    inference_ms: float
    device: str
    message: str


def resolve_required_path(
    environment_variable: str,
    expected_type: str,
) -> Path:
    configured = os.environ.get(
        environment_variable,
        "",
    ).strip()

    if not configured:
        raise RuntimeError(
            f"{environment_variable} is not set."
        )

    path = Path(
        configured
    ).expanduser().resolve()

    if (
        expected_type == "directory"
        and not path.is_dir()
    ):
        raise RuntimeError(
            f"{environment_variable} must point "
            f"to a directory: {path}"
        )

    if (
        expected_type == "file"
        and not path.is_file()
    ):
        raise RuntimeError(
            f"{environment_variable} must point "
            f"to a file: {path}"
        )

    return path


def load_email_model() -> None:
    model_dir = resolve_required_path(
        "BANTAI_MODEL_DIR",
        "directory",
    )

    print(
        "[BantAI v1.0.0] Loading email "
        f"model from: {model_dir}"
    )

    tokenizer = AutoTokenizer.from_pretrained(
        model_dir,
        local_files_only=True,
    )

    model = (
        AutoModelForSequenceClassification
        .from_pretrained(
            model_dir,
            local_files_only=True,
        )
    )

    device = torch.device(
        "cuda"
        if torch.cuda.is_available()
        else "cpu"
    )

    model = model.to(
        device
    )
    model.eval()

    runtime.email_tokenizer = tokenizer
    runtime.email_model = model
    runtime.email_device = device
    runtime.email_model_dir = model_dir

    print(
        "[BantAI v1.0.0] Email model "
        f"loaded on: {device}"
    )


def load_url_model() -> None:
    model_path = resolve_required_path(
        "BANTAI_RF_MODEL_PATH",
        "file",
    )

    print(
        "[BantAI v1.0.0] Loading URL "
        f"model from: {model_path}"
    )

    bundle = joblib.load(
        model_path
    )

    if not isinstance(
        bundle,
        dict,
    ):
        raise RuntimeError(
            "The RF joblib must contain "
            "the frozen V4-B model bundle."
        )

    required_keys = {
        "model",
        "feature_names",
        "threshold",
    }

    missing = required_keys - set(
        bundle.keys()
    )

    if missing:
        raise RuntimeError(
            "RF model bundle is missing: "
            f"{sorted(missing)}"
        )

    saved_threshold = float(
        bundle["threshold"]
    )

    if abs(
        saved_threshold -
        URL_THRESHOLD
    ) > 1e-12:
        raise RuntimeError(
            "RF threshold mismatch. Expected "
            f"{URL_THRESHOLD}, found "
            f"{saved_threshold}."
        )

    model = bundle["model"]

    if 1 not in list(
        model.classes_
    ):
        raise RuntimeError(
            "The RF model does not contain "
            "internal suspicious class 1."
        )

    runtime.url_bundle = bundle
    runtime.url_model = model
    runtime.url_feature_names = list(
        bundle["feature_names"]
    )
    runtime.url_model_path = model_path
    runtime.url_model_version = str(
        bundle.get(
            "model_version",
            "V4-B",
        )
    )

    print(
        "[BantAI v1.0.0] URL model "
        f"loaded with "
        f"{len(runtime.url_feature_names)} "
        "features."
    )


def validate_address_bar_url(
    value: str,
) -> tuple[str, str]:
    url = str(
        value or ""
    ).strip()

    try:
        parsed = urlsplit(
            url
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=(
                "The current address-bar URL "
                "could not be parsed."
            ),
        ) from exc

    if parsed.scheme.lower() not in {
        "http",
        "https",
    }:
        raise HTTPException(
            status_code=400,
            detail=(
                "Only HTTP and HTTPS "
                "address-bar URLs can be scanned."
            ),
        )

    if not parsed.hostname:
        raise HTTPException(
            status_code=400,
            detail=(
                "The address-bar URL does not "
                "contain a valid hostname."
            ),
        )

    return url, parsed.hostname.lower()


def build_email_input(
    subject: str,
    body: str,
) -> str:
    clean_subject = (
        subject or ""
    ).strip()

    clean_body = (
        body or ""
    ).strip()

    if clean_subject:
        return (
            f"Subject: {clean_subject}"
            f"\n\n{clean_body}"
        )

    return clean_body


@asynccontextmanager
async def lifespan(
    app: FastAPI,
):
    load_email_model()
    load_url_model()
    yield


app = FastAPI(
    title="BantAI Dual Detector API",
    version=VERSION,
    description=(
        "Independent decision-support "
        "detectors for the current address-bar "
        "URL and opened Gmail, Outlook, or "
        "Yahoo email content."
    ),
    lifespan=lifespan,
)


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "version": VERSION,
        "email_detector": {
            "loaded":
                runtime.email_model
                is not None,
            "model":
                EMAIL_MODEL_NAME,
            "threshold":
                EMAIL_THRESHOLD,
            "max_length":
                EMAIL_MAX_LENGTH,
            "supported_providers":
                sorted(
                    SUPPORTED_EMAIL_PROVIDERS
                ),
            "device": (
                str(
                    runtime.email_device
                )
                if runtime.email_device
                else None
            ),
        },
        "url_detector": {
            "loaded":
                runtime.url_model
                is not None,
            "model":
                URL_MODEL_NAME,
            "model_version":
                runtime.url_model_version,
            "threshold":
                URL_THRESHOLD,
            "scope":
                "CURRENT_ADDRESS_BAR_URL_ONLY",
        },
        "automatic_link_navigation":
            False,
        "embedded_email_link_scanning":
            False,
        "overall_risk_fusion":
            False,
    }


@app.post(
    "/analyze-url",
    response_model=
        UrlAnalysisResponse,
)
def analyze_url(
    request:
        UrlAnalysisRequest,
) -> UrlAnalysisResponse:
    if runtime.url_model is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "The frozen URL model "
                "is not loaded."
            ),
        )

    current_url, hostname = (
        validate_address_bar_url(
            request.url
        )
    )

    feature_values = (
        extract_v4b_features(
            current_url
        )
    )

    frame = pd.DataFrame([
        feature_values
    ]).reindex(
        columns=
            runtime.url_feature_names,
        fill_value=0,
    )

    suspicious_class_index = (
        list(
            runtime.url_model
            .classes_
        ).index(1)
    )

    suspicious_probability = float(
        runtime.url_model
        .predict_proba(
            frame
        )[0][
            suspicious_class_index
        ]
    )

    signal = (
        "SUSPICIOUS"
        if suspicious_probability
        >= URL_THRESHOLD
        else "SAFE"
    )

    if signal == "SUSPICIOUS":
        message = (
            "Warning signs were found in this "
            "web address. Avoid entering "
            "passwords, OTPs, or payment "
            "details until the website is "
            "verified."
        )
    else:
        message = (
            "No strong warning signs were "
            "found in this web address. "
            "Continue carefully because SAFE "
            "is not a guarantee."
        )

    return UrlAnalysisResponse(
        analysis_id=
            str(
                uuid.uuid4()
            ),
        detector=
            "CURRENT_URL",
        signal=
            signal,
        current_url=
            current_url,
        hostname=
            hostname,
        suspicious_probability=
            suspicious_probability,
        safe_probability=
            1.0 -
            suspicious_probability,
        threshold=
            URL_THRESHOLD,
        message=
            message,
        scanned_source=
            "BROWSER_ADDRESS_BAR",
        automatic_navigation_performed=
            False,
    )


@app.post(
    "/analyze-email",
    response_model=
        EmailAnalysisResponse,
)
def analyze_email(
    request:
        EmailAnalysisRequest,
) -> EmailAnalysisResponse:
    if (
        runtime.email_model is None
        or runtime.email_tokenizer
        is None
        or runtime.email_device
        is None
    ):
        raise HTTPException(
            status_code=503,
            detail=(
                "The frozen email model "
                "is not loaded."
            ),
        )

    provider = (
        request.provider or ""
    ).strip().lower()

    if (
        provider not in
        SUPPORTED_EMAIL_PROVIDERS
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                "Email detection is enabled "
                "only for Gmail, Outlook, "
                "and Yahoo."
            ),
        )

    model_input = build_email_input(
        request.subject,
        request.body,
    )

    if not model_input:
        raise HTTPException(
            status_code=400,
            detail=(
                "The opened email does not "
                "contain analyzable text."
            ),
        )

    full_encoding = (
        runtime.email_tokenizer(
            model_input,
            add_special_tokens=True,
            truncation=False,
        )
    )

    original_token_count = len(
        full_encoding[
            "input_ids"
        ]
    )

    encoded = (
        runtime.email_tokenizer(
            model_input,
            return_tensors="pt",
            truncation=True,
            max_length=
                EMAIL_MAX_LENGTH,
        )
    )

    analyzed_token_count = int(
        encoded[
            "input_ids"
        ].shape[1]
    )

    encoded = {
        key:
            value.to(
                runtime.email_device
            )
        for key, value
        in encoded.items()
    }

    start = time.perf_counter()

    with torch.inference_mode():
        logits = (
            runtime.email_model(
                **encoded
            ).logits
        )

        probabilities = torch.softmax(
            logits,
            dim=-1,
        )[0]

    if (
        runtime.email_device.type
        == "cuda"
    ):
        torch.cuda.synchronize()

    inference_ms = (
        time.perf_counter() -
        start
    ) * 1000.0

    safe_probability = float(
        probabilities[0].item()
    )

    suspicious_probability = float(
        probabilities[1].item()
    )

    signal = (
        "SUSPICIOUS"
        if suspicious_probability
        >= EMAIL_THRESHOLD
        else "SAFE"
    )

    if signal == "SUSPICIOUS":
        message = (
            "The email contains language "
            "patterns that need careful "
            "review. Verify the sender before "
            "following requests or sharing "
            "information."
        )
    else:
        message = (
            "No strong suspicious language "
            "was detected. Continue carefully "
            "because SAFE is not a guarantee "
            "that the email is legitimate."
        )

    return EmailAnalysisResponse(
        analysis_id=
            str(
                uuid.uuid4()
            ),
        detector=
            "SUPPORTED_EMAIL_CONTENT",
        provider=
            provider,
        sender=
            request.sender,
        subject=
            request.subject,
        signal=
            signal,
        suspicious_probability=
            suspicious_probability,
        safe_probability=
            safe_probability,
        threshold=
            EMAIL_THRESHOLD,
        max_length=
            EMAIL_MAX_LENGTH,
        original_token_count=
            original_token_count,
        analyzed_token_count=
            analyzed_token_count,
        was_truncated=(
            original_token_count >
            analyzed_token_count
        ),
        inference_ms=
            inference_ms,
        device=
            str(
                runtime.email_device
            ),
        message=
            message,
    )
