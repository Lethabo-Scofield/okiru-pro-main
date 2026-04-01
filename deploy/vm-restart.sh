#!/bin/bash
set -e
export HOME=/root
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

PROJECT=/home/okiru/okiru-pro-main
VM_IP="20.164.207.196"
BRANCH="${DEPLOY_BRANCH:-main}"

git config --global --add safe.directory $PROJECT
cd $PROJECT

echo '=== Git current ==='
git log -1 --format='%h %s'

echo '=== Fetching ==='
git fetch origin $BRANCH

echo '=== Hard reset ==='
git reset --hard origin/$BRANCH

echo '=== Now at ==='
git log -1 --format='%h %s'

echo '=== Rebuilding and restarting ==='
docker compose -f docker-compose.production.yml build api web computation-engine 2>&1
docker compose -f docker-compose.production.yml up -d --remove-orphans

sleep 20

echo '=== Container status ==='
docker ps --format "{{.Names}} | {{.Status}}"

echo '=== Health checks ==='
curl -sf http://localhost:5000/health | cut -c1-300 || echo 'API direct: not responding'
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null || echo "000")
echo "Frontend HTTP: $HTTP_CODE"
HTTPS_CODE=$(curl -sfk -o /dev/null -w "%{http_code}" https://localhost/ 2>/dev/null || echo "000")
echo "Frontend HTTPS: $HTTPS_CODE"

echo ''
echo '=== RESTART COMPLETE ==='
