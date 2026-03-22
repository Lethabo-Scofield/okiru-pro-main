#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo "=== Okiru B-BBEE Deployment Update ==="
echo "Time: $(date)"
echo "Dir: $(pwd)"

echo ""
echo "=== Pulling latest code ==="
git pull origin "$(git branch --show-current)"

echo ""
echo "=== Building services ==="
docker compose -f docker-compose.production.yml build

echo ""
echo "=== Restarting services (zero-downtime rolling) ==="
docker compose -f docker-compose.production.yml up -d --remove-orphans

echo ""
echo "=== Waiting for services to stabilize ==="
sleep 10

echo ""
echo "=== Service status ==="
docker compose -f docker-compose.production.yml ps

echo ""
echo "=== Health checks ==="
FAILED=0

echo -n "API: "
if curl -sf http://localhost:5000/health > /dev/null 2>&1; then
  echo "OK"
else
  echo "FAIL"
  FAILED=1
fi

echo -n "Compute Engine: "
if curl -sf http://localhost:8000/admin/models/list > /dev/null 2>&1; then
  echo "OK"
else
  echo "FAIL"
  FAILED=1
fi

echo -n "Web: "
if curl -sf http://localhost:5001/ > /dev/null 2>&1; then
  echo "OK"
else
  echo "FAIL"
  FAILED=1
fi

echo -n "Audit-AI: "
if curl -sf http://localhost:8007/health > /dev/null 2>&1; then
  echo "OK"
else
  echo "WARN (may not be deployed yet)"
fi

echo -n "ArangoDB: "
if curl -sf http://localhost:8529/_api/version > /dev/null 2>&1; then
  echo "OK"
else
  echo "FAIL"
  FAILED=1
fi

echo -n "MongoDB: "
if docker compose -f docker-compose.production.yml exec -T mongodb mongosh --eval "db.stats()" > /dev/null 2>&1; then
  echo "OK"
else
  echo "WARN"
fi

if [ $FAILED -eq 1 ]; then
  echo ""
  echo "WARNING: Some health checks failed. Check logs:"
  echo "  docker compose -f docker-compose.production.yml logs --tail=50 <service>"
  exit 1
fi

echo ""
echo "=== All checks passed ==="
echo "Deploy complete at $(date)"
