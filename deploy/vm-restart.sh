#!/bin/bash
export HOME=/root
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

git config --global --add safe.directory /home/okiru/okiru-pro-main
cd /home/okiru/okiru-pro-main

echo "=== Git current ==="
git log -1 --format='%h %s'

echo "=== Fetching ==="
git fetch origin feat/okiru-integrated

echo "=== Hard reset ==="
git reset --hard origin/feat/okiru-integrated

echo "=== Now at ==="
git log -1 --format='%h %s'

echo "=== ArangoDB condition in compose ==="
grep -A3 'arangodb:' docker-compose.production.yml | grep condition

echo "=== Starting api and nginx ==="
docker rm -f okiru_api okiru_nginx 2>/dev/null || true
docker compose -f docker-compose.production.yml up -d --no-deps api nginx

sleep 20

echo "=== Container status ==="
docker ps --format "{{.Names}} | {{.Status}}"

echo "=== API health ==="
curl -sk http://localhost:5000/health | cut -c1-300

echo "=== HTTPS check ==="
curl -sk --insecure -o /dev/null -w "HTTPS:%{http_code}" https://localhost/

echo "=== HTTP check ==="
curl -sk -o /dev/null -w "HTTP:%{http_code}" http://localhost/

echo ""
echo "=== DONE ==="
