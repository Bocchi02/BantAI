FROM python:3.12-slim

WORKDIR /app
COPY shared_platform/requirements.lock ./shared_platform/requirements.lock
RUN pip install --no-cache-dir --require-hashes -r shared_platform/requirements.lock
COPY shared_platform ./shared_platform
COPY backend ./backend

RUN useradd --system --uid 10001 --home /nonexistent --shell /usr/sbin/nologin bantai \
    && chown -R bantai:bantai /app
USER bantai

CMD ["uvicorn", "shared_platform.app.main:app", "--host", "0.0.0.0", "--port", "8080", "--no-access-log"]
