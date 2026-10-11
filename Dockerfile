# Build from the repository root to include offline AI labels and results.
FROM python:3.12-slim
WORKDIR /app/backend
COPY backend/requirements.lock .
RUN pip install --no-cache-dir -r requirements.lock
COPY backend/app ./app
COPY AI/label /app/AI/label
COPY AI/results /app/AI/results
COPY AI/prompt_versions.md /app/AI/prompt_versions.md
RUN useradd --create-home appuser && mkdir -p /app/backend/data && chown appuser:appuser /app/backend/data
USER appuser
ENV PORT=8080
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port $PORT"]
