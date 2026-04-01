#!/bin/bash
set -e

PROJECT=/home/okiru/okiru-pro-main

if [ ! -d "$PROJECT" ]; then
  echo '=== Cloning repository ==='
  git clone https://github.com/Lethabo-Scofield/okiru-pro-main.git $PROJECT
fi

cd $PROJECT
git fetch origin
git checkout main

echo '=== Creating .env from template ==='
cp deploy/.env.production.template .env

PUBLIC_IP=$(curl -s ifconfig.me)
SESSION_SECRET=$(openssl rand -hex 32)
MONGO_PASS=$(openssl rand -hex 16)
ARANGO_PASS=$(openssl rand -hex 16)

sed -i "s|SESSION_SECRET=CHANGE_ME_random_64_char_string|SESSION_SECRET=${SESSION_SECRET}|" .env
sed -i "s|CORS_ORIGIN=http://20.164.207.196,https://20.164.207.196|CORS_ORIGIN=http://${PUBLIC_IP},https://${PUBLIC_IP}|" .env
sed -i "s|MONGO_PASSWORD=CHANGE_ME_strong_password_here|MONGO_PASSWORD=${MONGO_PASS}|" .env
sed -i "s|ARANGO_PASSWORD=CHANGE_ME_strong_password_here|ARANGO_PASSWORD=${ARANGO_PASS}|" .env
sed -i "s|DOMAIN=20.164.207.196|DOMAIN=${PUBLIC_IP}|" .env
sed -i "s|PUBLIC_URL=http://20.164.207.196|PUBLIC_URL=http://${PUBLIC_IP}|" .env

chown -R okiru:okiru $PROJECT

echo ''
echo '=== Setup complete ==='
echo "VM IP: $PUBLIC_IP"
echo ''
echo 'IMPORTANT: Review and edit .env before deploying:'
echo "  nano $PROJECT/.env"
echo ''
echo 'Then deploy with:'
echo "  sudo bash $PROJECT/deploy/vm-deploy-run.sh"
echo ''
