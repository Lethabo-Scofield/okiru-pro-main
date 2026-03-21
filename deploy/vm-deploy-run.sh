#!/bin/bash
export HOME=/root
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
set -e

PROJECT=/home/okiru/okiru-pro-main
cd $PROJECT

echo '=== [1/5] Git pull latest ==='
git config --global --add safe.directory $PROJECT
git fetch origin
BRANCH=$(git branch --show-current)
git reset --hard origin/$BRANCH
echo "Code updated: $BRANCH"

echo '=== [2/5] SSL cert for 20.164.207.196 ==='
chmod +x deploy/ssl-setup.sh
bash deploy/ssl-setup.sh

echo '=== [3/5] Update .env ==='
# Switch CORS to HTTPS
sed -i 's|^CORS_ORIGIN=http://20.164.207.196$|CORS_ORIGIN=https://20.164.207.196,http://20.164.207.196|g' .env
grep -q 'GROQ_API_KEY' .env || echo 'GROQ_API_KEY=PENDING' >> .env
grep -q '^DOMAIN=' .env || echo 'DOMAIN=20.164.207.196' >> .env
grep -q '^PUBLIC_URL=' .env || echo 'PUBLIC_URL=https://20.164.207.196' >> .env
grep -q '^NODE_ENV=' .env || echo 'NODE_ENV=production' >> .env
echo '.env updated'

echo '=== [4/5] Docker build (api, web, nginx) ==='
docker compose -f docker-compose.production.yml build --no-cache api web nginx

echo '=== [5/5] Restart containers ==='
docker compose -f docker-compose.production.yml up -d --remove-orphans
sleep 15
docker compose -f docker-compose.production.yml ps

echo '=== Health ==='
curl -sk http://localhost:5000/health | cut -c1-150 || echo 'API direct check failed'

echo '=== DEPLOY DONE ==='
