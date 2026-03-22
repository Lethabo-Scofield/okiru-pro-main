#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  Okiru Azure VM Deployment Script
#  Deploys a single Ubuntu VM with Docker Compose on Azure
#
#  Prerequisites: Azure CLI installed and logged in (az login)
#  Cost: ~$30-60/month (Standard_B2ms), well within $1000 credits
# ═══════════════════════════════════════════════════════════════

# ── Configuration (edit these) ────────────────────────────────
RESOURCE_GROUP="okiru-production"
LOCATION="southafricanorth"          # Closest to SA users; change if needed
VM_NAME="okiru-vm"
VM_SIZE="Standard_B2ms"              # 2 vCPU, 8 GB RAM — good starting point
ADMIN_USER="okiru"
SSH_KEY_PATH="$HOME/.ssh/id_rsa.pub" # Path to your SSH public key

echo "═══════════════════════════════════════════════════════════"
echo "  Okiru Azure Deployment"
echo "═══════════════════════════════════════════════════════════"

# ── Step 1: Create Resource Group ─────────────────────────────
echo ""
echo "▸ Creating resource group: $RESOURCE_GROUP in $LOCATION..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output table

# ── Step 2: Create VM ────────────────────────────────────────
echo ""
echo "▸ Creating VM: $VM_NAME ($VM_SIZE)..."
az vm create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --image Ubuntu2404 \
  --size "$VM_SIZE" \
  --admin-username "$ADMIN_USER" \
  --ssh-key-values "$SSH_KEY_PATH" \
  --public-ip-sku Standard \
  --os-disk-size-gb 64 \
  --output table

# ── Step 3: Open ports (HTTP, HTTPS, SSH) ────────────────────
echo ""
echo "▸ Opening ports 80, 443, 22..."
az vm open-port \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --port 80,443,22 \
  --priority 1000 \
  --output table

# ── Step 4: Get the public IP ────────────────────────────────
echo ""
PUBLIC_IP=$(az vm show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --show-details \
  --query publicIps \
  --output tsv)

echo "▸ VM Public IP: $PUBLIC_IP"

# ── Step 5: Install Docker on the VM via SSH ─────────────────
echo ""
echo "▸ Installing Docker and Docker Compose on the VM..."
az vm run-command invoke \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --command-id RunShellScript \
  --scripts '
    # Install Docker
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker '"$ADMIN_USER"'

    # Install Docker Compose plugin
    apt-get install -y docker-compose-plugin

    # Start Docker
    systemctl enable docker
    systemctl start docker

    # Install git
    apt-get install -y git

    echo "Docker installed successfully"
    docker --version
    docker compose version
  ' \
  --output table

# ── Done ──────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  VM IP:  $PUBLIC_IP"
echo "  SSH:    ssh $ADMIN_USER@$PUBLIC_IP"
echo ""
echo "  Next steps (run on the VM via SSH):"
echo "  1. git clone your repo"
echo "  2. cp deploy/.env.production.template .env"
echo "  3. Edit .env with real passwords"
echo "  4. docker compose -f docker-compose.production.yml up -d --build"
echo "  5. Visit http://$PUBLIC_IP"
echo ""
echo "═══════════════════════════════════════════════════════════"
