FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    SLOTH_ALLOWED_ROOTS=/app

WORKDIR /app

COPY pyproject.toml README.md LICENSE .python-version uv.lock ./
COPY src ./src

RUN python -m pip install --no-cache-dir .

EXPOSE 8000

# Ollama is intentionally external to this image. Configure
# SLOTH_BRIEFING_ENDPOINT at runtime, for example:
# http://host.docker.internal:11434/v1/chat/completions
CMD ["uvicorn", "sloth_briefing_ai.api:app", "--host", "0.0.0.0", "--port", "8000"]
