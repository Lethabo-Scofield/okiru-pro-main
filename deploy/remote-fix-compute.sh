#!/bin/bash
set -e

cd /home/okiru/okiru-pro-main

# Fix Computation Engine Dockerfile - set correct WORKDIR and PYTHONPATH
cat > apps/Computation-Engine/Dockerfile <<'CEEOF'
FROM python:3.13-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ && rm -rf /var/lib/apt/lists/*

COPY apps/Computation-Engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/Computation-Engine/backend/ /app/

ENV PYTHONPATH=/app
ENV API_HOST=0.0.0.0 API_PORT=8000 API_RELOAD=false LOG_LEVEL=info

EXPOSE 8000
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
CEEOF

echo "=== Rebuilding computation-engine ==="
docker compose -f docker-compose.production.yml up -d --build computation-engine 2>&1

echo "=== Waiting 30s ==="
sleep 30

echo "=== Container status ==="
docker compose -f docker-compose.production.yml ps 2>&1

echo "=== Compute logs ==="
docker logs okiru_compute 2>&1 | tail -15

echo "=== COMPUTE_FIX_DONE ==="
