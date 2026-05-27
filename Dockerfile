FROM python:3.12-slim-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY sana_core.py api.py ./
COPY static ./static/
COPY scripts/generate_icons.py ./scripts/

RUN python scripts/generate_icons.py \
    && python -c "from faster_whisper import WhisperModel; WhisperModel('tiny', device='cpu', compute_type='int8')"

ENV PORT=8000
EXPOSE 8000

CMD uvicorn api:app --host 0.0.0.0 --port ${PORT}
