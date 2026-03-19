#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  Run this ON THE VM after SSH-ing in.
#  It clones the repo, sets up env, and starts everything.
# ═══════════════════════════════════════════════════════════════

REPO_URL="${1:-}"
if [ -z "$REPO_URL" ]; then
  echo "Usage: bash vm-setup.sh <git-clone-url>"
  echo "  e.g. bash vm-setup.sh https://github.com/yourorg/okiru-pro-main.git"
  exit 1
fi

echo "▸ Cloning repository..."
git clone "$REPO_URL" /home/okiru/okiru-pro-main
cd /home/okiru/okiru-pro-main

echo "▸ Checking out the right branch..."
git checkout feat/okiru-integrated

echo "▸ Creating .env from template..."
cp deploy/.env.production.template .env

# Generate a random session secret
SESSION_SECRET=$(openssl rand -hex 32)
sed -i "s|SESSION_SECRET=CHANGE_ME_random_64_char_string|SESSION_SECRET=$SESSION_SECRET|" .env

# Get the VM's public IP for CORS
PUBLIC_IP=$(curl -s ifconfig.me)
sed -i "s|CORS_ORIGIN=http://YOUR_VM_IP,https://okiru.yourdomain.com|CORS_ORIGIN=http://$PUBLIC_IP|" .env

echo ""
echo "▸ .env created. IMPORTANT: Edit passwords before starting!"
echo "  nano .env"
echo ""
echo "▸ When ready, start everything with:"
echo "  docker compose -f docker-compose.production.yml up -d --build"
echo ""
echo "▸ View logs with:"
echo "  docker compose -f docker-compose.production.yml logs -f"
echo ""
echo "▸ Your app will be at: http://$PUBLIC_IP"
