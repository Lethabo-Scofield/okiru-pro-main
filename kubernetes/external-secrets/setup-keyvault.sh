#!/bin/bash
# Setup script for Azure Key Vault and External Secrets Operator
# 
# Usage:
#   ./setup-keyvault.sh --environment prod --vault-name okiru-pro-kv
#   ./setup-keyvault.sh --environment staging --vault-name okiru-staging-kv

set -e

# Parse arguments
ENVIRONMENT=""
VAULT_NAME=""
RESOURCE_GROUP="okiru-pro-rg"
LOCATION="southafricanorth"
SUBSCRIPTION_ID=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --environment)
      ENVIRONMENT="$2"
      shift 2
      ;;
    --vault-name)
      VAULT_NAME="$2"
      shift 2
      ;;
    --resource-group)
      RESOURCE_GROUP="$2"
      shift 2
      ;;
    --location)
      LOCATION="$2"
      shift 2
      ;;
    --subscription-id)
      SUBSCRIPTION_ID="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$ENVIRONMENT" || -z "$VAULT_NAME" ]]; then
  echo "Usage: $0 --environment <prod|staging> --vault-name <vault-name> [--resource-group <rg>] [--location <location>]"
  exit 1
fi

echo "=== Setting up Azure Key Vault for $ENVIRONMENT ==="
echo "Vault Name: $VAULT_NAME"
echo "Resource Group: $RESOURCE_GROUP"
echo "Location: $LOCATION"

# Create Key Vault
echo "Creating Key Vault..."
az keyvault create \
  --name "$VAULT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --location "$LOCATION" \
  --enable-rbac-authorization \
  --sku Standard

# Output instructions
echo ""
echo "=== Key Vault Created: $VAULT_NAME ==="
echo ""
echo "Next steps:"
echo "1. Add secrets to the Key Vault:"
echo ""
echo "   # MongoDB credentials"
echo "   az keyvault secret set --vault-name $VAULT_NAME --name mongo-initdb-root-username --value 'your_username'"
echo "   az keyvault secret set --vault-name $VAULT_NAME --name mongo-initdb-root-password --value 'your_password'"
echo "   az keyvault secret set --vault-name $VAULT_NAME --name mongodb-uri --value 'your_connection_string'"
echo "   az keyvault secret set --vault-name $VAULT_NAME --name mongodb-db-name --value 'okiru-$ENVIRONMENT'"
echo ""
echo "   # ArangoDB credentials"
echo "   az keyvault secret set --vault-name $VAULT_NAME --name arango-root-password --value 'your_password'"
echo "   az keyvault secret set --vault-name $VAULT_NAME --name arango-url --value 'your_connection_string'"
echo "   az keyvault secret set --vault-name $VAULT_NAME --name arango-db-name --value 'okiru_$ENVIRONMENT'"
echo ""
echo "   # Redis credentials"
echo "   az keyvault secret set --vault-name $VAULT_NAME --name redis-password --value 'your_password'"
echo "   az keyvault secret set --vault-name $VAULT_NAME --name redis-url --value 'your_connection_string'"
echo ""
echo "   # Session secrets (generate strong random values)"
echo "   az keyvault secret set --vault-name $VAULT_NAME --name jwt-secret --value '\$(openssl rand -base64 32)'"
echo "   az keyvault secret set --vault-name $VAULT_NAME --name session-secret --value '\$(openssl rand -base64 32)'"
echo "   az keyvault secret set --vault-name $VAULT_NAME --name api-internal-key --value '\$(openssl rand -base64 32)'"
echo ""
echo "2. Configure Workload Identity for External Secrets Operator"
echo "3. Apply the ExternalSecret manifests from externalsecrets/"
echo ""
