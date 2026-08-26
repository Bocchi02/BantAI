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
COPY models/email_text_xlmr_v1/checkpoint-15666/config.json ./models/email_text_xlmr_v1/checkpoint-15666/config.json
COPY models/email_text_xlmr_v1/checkpoint-15666/model.safetensors ./models/email_text_xlmr_v1/checkpoint-15666/model.safetensors
COPY models/email_text_xlmr_v1/checkpoint-15666/tokenizer.json ./models/email_text_xlmr_v1/checkpoint-15666/tokenizer.json
COPY models/email_text_xlmr_v1/checkpoint-15666/tokenizer_config.json ./models/email_text_xlmr_v1/checkpoint-15666/tokenizer_config.json
COPY models/url_random_forest_v4b/bantai_rf_url_model_v4b_optimized.joblib ./models/url_random_forest_v4b/bantai_rf_url_model_v4b_optimized.joblib

# Keep application code last so normal code changes do not rebuild model layers.
COPY backend ./backend

WORKDIR /app/backend

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log"]
