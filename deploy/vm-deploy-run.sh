#!/bin/bash
set -e
export HOME=/root
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

PROJECT=/home/okiru/okiru-pro-main
VM_IP="20.164.207.196"
BRANCH="${DEPLOY_BRANCH:-main}"

cd $PROJECT

echo '══════════════════════════════════════════════════════════'
echo '  Okiru Production Deployment'
echo '══════════════════════════════════════════════════════════'

echo ''
echo '=== [1/7] Pull latest code ==='
git config --global --add safe.directory $PROJECT
git fetch origin
git reset --hard origin/$BRANCH
echo "Updated to: $(git log -1 --format='%h %s')"

echo ''
echo '=== [2/7] Generate self-signed SSL cert ==='
mkdir -p $PROJECT/deploy/ssl
if [ ! -f "$PROJECT/deploy/ssl/okiru-selfsigned.crt" ]; then
  openssl req -x509 -nodes -days 825 \
    -newkey rsa:2048 \
    -keyout $PROJECT/deploy/ssl/okiru-selfsigned.key \
    -out    $PROJECT/deploy/ssl/okiru-selfsigned.crt \
    -subj "/C=ZA/ST=Gauteng/L=Johannesburg/O=Okiru/OU=BBBEE/CN=$VM_IP" \
    -addext "subjectAltName=IP:$VM_IP" 2>&1
  chmod 600 $PROJECT/deploy/ssl/okiru-selfsigned.key
  echo 'SSL cert generated'
else
  echo 'SSL cert already exists, skipping'
fi

echo ''
echo '=== [3/7] Verify .env ==='
if [ ! -f "$PROJECT/.env" ]; then
  echo 'ERROR: .env file not found!'
  echo 'Create one with: cp deploy/.env.production.template .env'
  echo 'Then edit it with real passwords.'
  exit 1
fi
grep -q 'MONGO_PASSWORD' $PROJECT/.env || { echo 'ERROR: MONGO_PASSWORD missing from .env'; exit 1; }
grep -q 'SESSION_SECRET' $PROJECT/.env || { echo 'ERROR: SESSION_SECRET missing from .env'; exit 1; }
grep -q 'ARANGO_PASSWORD' $PROJECT/.env || { echo 'ERROR: ARANGO_PASSWORD missing from .env'; exit 1; }

grep -q '^DOMAIN=' $PROJECT/.env || echo "DOMAIN=$VM_IP" >> $PROJECT/.env
grep -q '^PUBLIC_URL=' $PROJECT/.env || echo "PUBLIC_URL=http://$VM_IP" >> $PROJECT/.env
grep -q '^NODE_ENV=' $PROJECT/.env || echo 'NODE_ENV=production' >> $PROJECT/.env
echo '.env verified'

echo ''
echo '=== [4/7] Build Docker images ==='
docker compose -f $PROJECT/docker-compose.production.yml build --no-cache api web computation-engine 2>&1

echo ''
echo '=== [5/7] Start all services ==='
docker compose -f $PROJECT/docker-compose.production.yml up -d --remove-orphans
echo 'Waiting 30s for services to initialize...'
sleep 30

echo ''
echo '=== [6/7] Container status ==='
docker compose -f $PROJECT/docker-compose.production.yml ps

echo ''
echo '=== [7/7] Health checks ==='
echo ''
echo '--- API direct (port 5000) ---'
curl -sf http://localhost:5000/health 2>/dev/null | cut -c1-200 || echo 'API health check: not responding (may need MongoDB)'

echo ''
echo '--- Frontend via Nginx (port 80) ---'
HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null || echo "000")
echo "HTTP status: $HTTP_CODE"

echo ''
echo '--- API via Nginx (/api/) ---'
API_CODE=$(curl -sf -o /dev/null -w "%{http_code}" http://localhost/api/health 2>/dev/null || echo "000")
echo "API via Nginx status: $API_CODE"

echo ''
echo '--- HTTPS check ---'
HTTPS_CODE=$(curl -sfk -o /dev/null -w "%{http_code}" https://localhost/ 2>/dev/null || echo "000")
echo "HTTPS status: $HTTPS_CODE"

echo ''
echo '══════════════════════════════════════════════════════════'
echo '  DEPLOYMENT COMPLETE'
echo '══════════════════════════════════════════════════════════'
echo ''
echo "  HTTP:  http://$VM_IP"
echo "  HTTPS: https://$VM_IP  (self-signed cert)"
echo "  API:   http://$VM_IP/api/"
echo ''
echo '  Useful commands:'
echo "  docker compose -f docker-compose.production.yml logs -f"
echo "  docker compose -f docker-compose.production.yml ps"
echo "  docker compose -f docker-compose.production.yml restart <service>"
echo ''
