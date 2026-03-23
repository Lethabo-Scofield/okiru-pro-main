#!/bin/bash
set -e

cd /home/okiru/okiru-pro-main

# Fix xlcalculator version - 2.0.2 doesn't exist, latest is 0.5.0
cat > apps/Computation-Engine/requirements.txt <<'REQEOF'
fastapi==0.111.1
uvicorn[standard]==0.24.0
pydantic-settings==2.3.0
openpyxl==3.1.2
xlcalculator==0.5.0
networkx==3.2
python-arango==8.0.0
requests==2.31.0
REQEOF

echo "=== Fixed requirements.txt ==="
cat apps/Computation-Engine/requirements.txt

# Now build again
echo "=== Starting Docker Compose build ==="
docker compose -f docker-compose.production.yml up -d --build 2>&1

echo "=== Waiting 30s for containers to stabilize ==="
sleep 30

echo "=== Container status ==="
docker compose -f docker-compose.production.yml ps 2>&1

echo "=== BUILD_DONE ==="
