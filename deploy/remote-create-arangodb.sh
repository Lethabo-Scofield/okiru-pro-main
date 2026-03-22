#!/bin/bash
set -e

cd /home/okiru/okiru-pro-main

# Read the arango password from .env
ARANGO_PASS=$(grep ARANGO_PASSWORD .env | cut -d= -f2)

echo "=== Creating bbbee_db database in ArangoDB ==="
docker exec okiru_arango arangosh \
  --server.password "$ARANGO_PASS" \
  --javascript.execute-string "
    try { db._createDatabase('bbbee_db'); print('Database bbbee_db created'); }
    catch(e) { print('Database may already exist: ' + e.message); }
  " 2>&1

echo "=== Restarting computation-engine ==="
docker restart okiru_compute 2>&1

echo "=== Waiting 20s ==="
sleep 20

echo "=== Container status ==="
docker compose -f docker-compose.production.yml ps 2>&1

echo "=== Compute logs ==="
docker logs okiru_compute 2>&1 | tail -10

echo "=== DB_CREATE_DONE ==="
