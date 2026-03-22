#!/bin/bash
set -e

cd /home/okiru

# Clone repo
if [ ! -d "okiru-pro-main" ]; then
  git clone https://github.com/Lethabo-Scofield/okiru-pro-main.git
fi

cd okiru-pro-main
git fetch origin
git checkout feat/okiru-integrated

# Create .env from template
cp deploy/.env.production.template .env

# Generate secrets
PUBLIC_IP=$(curl -s ifconfig.me)
SESSION_SECRET=$(openssl rand -hex 32)
MONGO_PASS=$(openssl rand -hex 16)
ARANGO_PASS=$(openssl rand -hex 16)

# Apply to .env
sed -i "s|SESSION_SECRET=CHANGE_ME_random_64_char_string|SESSION_SECRET=${SESSION_SECRET}|" .env
sed -i "s|CORS_ORIGIN=http://YOUR_VM_IP,https://okiru.yourdomain.com|CORS_ORIGIN=http://${PUBLIC_IP}|" .env
sed -i "s|MONGO_PASSWORD=CHANGE_ME_strong_password_here|MONGO_PASSWORD=${MONGO_PASS}|" .env
sed -i "s|ARANGO_PASSWORD=CHANGE_ME_strong_password_here|ARANGO_PASSWORD=${ARANGO_PASS}|" .env

chown -R okiru:okiru /home/okiru/okiru-pro-main

echo "=== .env contents ==="
cat .env
echo "=== ENV_SETUP_DONE ==="
