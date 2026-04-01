#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  Okiru Azure VM Deployment Script
#  Deploys a single Ubuntu VM with Docker Compose on Azure
#
#  Prerequisites: Azure CLI installed and logged in (az login)
#  Cost: ~$30-60/month (Standard_B2ms), well within $1000 credits
# ═══════════════════════════════════════════════════════════════

RESOURCE_GROUP="okiru-production"
LOCATION="southafricanorth"
VM_NAME="okiru-vm"
VM_SIZE="Standard_B2ms"
ADMIN_USER="okiru"
SSH_KEY_PATH="$HOME/.ssh/id_rsa.pub"

echo "═══════════════════════════════════════════════════════════"
echo "  Okiru Azure Deployment"
echo "═══════════════════════════════════════════════════════════"

echo ""
echo "▸ Creating resource group: $RESOURCE_GROUP in $LOCATION..."
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --output table

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

echo ""
echo "▸ Opening ports 22, 80, 443..."
az vm open-port \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --port 22 \
  --priority 1000 \
  --output table

az vm open-port \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --port 80 \
  --priority 1001 \
  --output table

az vm open-port \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --port 443 \
  --priority 1002 \
  --output table

PUBLIC_IP=$(az vm show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --show-details \
  --query publicIps \
  --output tsv)

echo ""
echo "▸ VM Public IP: $PUBLIC_IP"

echo ""
echo "▸ Installing Docker and Docker Compose on the VM..."
az vm run-command invoke \
  --resource-group "$RESOURCE_GROUP" \
  --name "$VM_NAME" \
  --command-id RunShellScript \
  --scripts '
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker '"$ADMIN_USER"'
    apt-get install -y docker-compose-plugin git
    systemctl enable docker
    systemctl start docker
    echo "Docker installed successfully"
    docker --version
    docker compose version
  ' \
  --output table

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  VM PROVISIONING COMPLETE"
echo "═══════════════════════════════════════════════════════════"
echo ""
echo "  VM IP:  $PUBLIC_IP"
echo "  SSH:    ssh $ADMIN_USER@$PUBLIC_IP"
echo ""
echo "  Next steps (run on the VM via SSH):"
echo "  1. sudo bash deploy/remote-setup.sh"
echo "  2. Edit .env with real passwords: nano .env"
echo "  3. sudo bash deploy/vm-deploy-run.sh"
echo "  4. Visit http://$PUBLIC_IP"
echo ""
echo "═══════════════════════════════════════════════════════════"
