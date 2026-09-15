FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_HUB_OFFLINE=1 \
    TOKENIZERS_PARALLELISM=false

WORKDIR /app

# The CPU wheel comes from PyTorch's official index. It remains a fixed,
# separately auditable runtime dependency because its index does not support
# pip-tools' all-artifact hash resolution.
COPY backend/requirements-detector.lock ./backend/requirements-detector.lock
RUN pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    "torch==2.8.0"
RUN pip install --no-cache-dir --require-hashes -r backend/requirements-detector.lock

# Copy only the frozen inference artifacts required at runtime. Training
# checkpoints such as optimizer.pt are excluded by .dockerignore.
COPY models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/calibration.json ./models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/calibration.json
COPY models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/config.json ./models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/config.json
COPY models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/EMAIL_MODEL_MANIFEST.json ./models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/EMAIL_MODEL_MANIFEST.json
COPY models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/model-00001-of-00002.safetensors ./models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/model-00001-of-00002.safetensors
COPY models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/model-00002-of-00002.safetensors ./models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/model-00002-of-00002.safetensors
COPY models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/model.safetensors.index.json ./models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/model.safetensors.index.json
COPY models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/tokenizer.json ./models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/tokenizer.json
COPY models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/tokenizer_config.json ./models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/tokenizer_config.json
COPY models/url_random_forest_grouped_v1/bantai_rf_grouped_v1.0.0.joblib ./models/url_random_forest_grouped_v1/bantai_rf_grouped_v1.0.0.joblib
COPY models/url_random_forest_grouped_v1/MODEL_MANIFEST.json ./models/url_random_forest_grouped_v1/MODEL_MANIFEST.json

# Keep application code last so normal code changes do not rebuild model layers.
COPY backend ./backend

RUN useradd --system --uid 10001 --home /nonexistent --shell /usr/sbin/nologin bantai \
    && chown -R bantai:bantai /app
USER bantai

WORKDIR /app/backend

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
