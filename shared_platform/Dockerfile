FROM python:3.12-slim

WORKDIR /app
COPY shared_platform/requirements.txt ./shared_platform/requirements.txt
RUN pip install --no-cache-dir -r shared_platform/requirements.txt
COPY shared_platform ./shared_platform
COPY backend ./backend

CMD ["sh", "-c", "python -m alembic -c shared_platform/alembic.ini upgrade head && exec uvicorn shared_platform.app.main:app --host 0.0.0.0 --port 8080 --no-access-log"]
