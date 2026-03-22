#!/bin/bash
export HOME=/root
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
set -e

PROJECT=/home/okiru/okiru-pro-main
cd $PROJECT

echo '=== [1/5] Git pull latest ==='
git config --global --add safe.directory $PROJECT
git fetch origin
git reset --hard origin/feat/okiru-integrated
echo "Updated to: $(git log -1 --format='%h %s')"

echo '=== [2/5] Generate self-signed SSL cert for 20.164.207.196 ==='
mkdir -p $PROJECT/deploy/ssl
openssl req -x509 -nodes -days 825 \
  -newkey rsa:2048 \
  -keyout $PROJECT/deploy/ssl/okiru-selfsigned.key \
  -out    $PROJECT/deploy/ssl/okiru-selfsigned.crt \
  -subj "/C=ZA/ST=Gauteng/L=Johannesburg/O=Okiru/OU=BBBEE/CN=20.164.207.196" \
  -addext "subjectAltName=IP:20.164.207.196" 2>&1
chmod 600 $PROJECT/deploy/ssl/okiru-selfsigned.key
echo 'SSL cert generated'

echo '=== [3/5] Update .env ==='
sed -i 's|^CORS_ORIGIN=http://20.164.207.196$|CORS_ORIGIN=https://20.164.207.196,http://20.164.207.196|g' $PROJECT/.env
grep -q 'GROQ_API_KEY' $PROJECT/.env || echo 'GROQ_API_KEY=PENDING' >> $PROJECT/.env
grep -q '^DOMAIN=' $PROJECT/.env || echo 'DOMAIN=20.164.207.196' >> $PROJECT/.env
grep -q '^PUBLIC_URL=' $PROJECT/.env || echo 'PUBLIC_URL=https://20.164.207.196' >> $PROJECT/.env
grep -q '^NODE_ENV=' $PROJECT/.env || echo 'NODE_ENV=production' >> $PROJECT/.env
echo 'ENV updated'

echo '=== [4/5] Build api, web, nginx ==='
docker compose -f $PROJECT/docker-compose.production.yml build --no-cache api web nginx 2>&1

echo '=== [5/5] Restart ==='
docker compose -f $PROJECT/docker-compose.production.yml up -d --remove-orphans
sleep 20
docker compose -f $PROJECT/docker-compose.production.yml ps

echo '=== Health ==='
curl -sk http://localhost:5000/health | cut -c1-200 || echo 'direct API check failed'

echo '=== DEPLOY COMPLETE ==='
