#!/bin/bash
set -e

cd /home/okiru/okiru-pro-main

echo "=== Starting Docker Compose build and up ==="
docker compose -f docker-compose.production.yml up -d --build 2>&1

echo "=== Waiting 30s for containers to stabilize ==="
sleep 30

echo "=== Container status ==="
docker compose -f docker-compose.production.yml ps 2>&1

echo "=== BUILD_DONE ==="
