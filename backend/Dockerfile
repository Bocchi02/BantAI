FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TRANSFORMERS_OFFLINE=1 \
    HF_HUB_OFFLINE=1 \
    TOKENIZERS_PARALLELISM=false

WORKDIR /app

COPY backend/requirements-detector.txt ./backend/requirements-detector.txt
RUN pip install --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    "torch==2.8.0"
RUN pip install --no-cache-dir -r backend/requirements-detector.txt

# Copy only the frozen inference artifacts required at runtime. Training
# checkpoints such as optimizer.pt are excluded by .dockerignore.
COPY models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/calibration.json ./models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/calibration.json
COPY models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/config.json ./models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/config.json
COPY models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/model-00001-of-00002.safetensors ./models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/model-00001-of-00002.safetensors
COPY models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/model-00002-of-00002.safetensors ./models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/model-00002-of-00002.safetensors
COPY models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/model.safetensors.index.json ./models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/model.safetensors.index.json
COPY models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/tokenizer.json ./models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/tokenizer.json
COPY models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/tokenizer_config.json ./models/email_text_xlmr_v2/full_taglish_xlmr_512_headtail_seed13/tokenizer_config.json
COPY models/url_random_forest_grouped_v1/bantai_rf_grouped_v1.0.0.joblib ./models/url_random_forest_grouped_v1/bantai_rf_grouped_v1.0.0.joblib

# Keep application code last so normal code changes do not rebuild model layers.
COPY backend ./backend

WORKDIR /app/backend

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
