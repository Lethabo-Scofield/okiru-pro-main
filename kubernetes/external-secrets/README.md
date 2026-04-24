# External Secrets Operator (ESO) + Azure Key Vault Setup

This directory contains templates and documentation for migrating from GitHub Actions-managed secrets to Azure Key Vault with External Secrets Operator.

## Overview

Current setup: GitHub Secrets → GitHub Actions → `kubectl create secret` → Kubernetes Secrets

Target setup: Azure Key Vault → External Secrets Operator → Kubernetes Secrets

Benefits:
- **Automatic rotation**: Secrets can be rotated in Key Vault without redeploying
- **Audit logging**: All secret access is logged in Azure
- **Centralized management**: One Key Vault per environment
- **No secrets in CI**: GitHub Actions no longer needs secret values, just workload identity

## Prerequisites

1. **External Secrets Operator** installed on AKS:
   ```bash
   helm repo add external-secrets https://charts.external-secrets.io
   helm repo update
   helm install external-secrets external-secrets/external-secrets \
     --namespace external-secrets \
     --create-namespace
   ```

2. **Azure Key Vault** created for each environment

3. **Workload Identity** or **Managed Identity** configured for ESO to access Key Vault

## Setup Steps

### 1. Create Azure Key Vault

```bash
# Production Key Vault
az keyvault create \
  --name okiru-pro-kv \
  --resource-group okiru-pro-rg \
  --location southafricanorth

# Staging Key Vault
az keyvault create \
  --name okiru-staging-kv \
  --resource-group okiru-pro-rg \
  --location southafricanorth
```

### 2. Add Secrets to Key Vault

```bash
# MongoDB credentials
az keyvault secret set --vault-name okiru-pro-kv --name mongo-initdb-root-username --value "your_username"
az keyvault secret set --vault-name okiru-pro-kv --name mongo-initdb-root-password --value "your_password"
az keyvault secret set --vault-name okiru-pro-kv --name mongodb-uri --value "your_connection_string"
az keyvault secret set --vault-name okiru-pro-kv --name mongodb-db-name --value "okiru-pro"

# ArangoDB credentials
az keyvault secret set --vault-name okiru-pro-kv --name arango-root-password --value "your_password"
az keyvault secret set --vault-name okiru-pro-kv --name arango-url --value "your_connection_string"
az keyvault secret set --vault-name okiru-pro-kv --name arango-db-name --value "okiru_pro"

# Redis credentials
az keyvault secret set --vault-name okiru-pro-kv --name redis-password --value "your_password"
az keyvault secret set --vault-name okiru-pro-kv --name redis-url --value "your_connection_string"

# Session secrets
az keyvault secret set --vault-name okiru-pro-kv --name jwt-secret --value "your_jwt_secret"
az keyvault secret set --vault-name okiru-pro-kv --name session-secret --value "your_session_secret"
az keyvault secret set --vault-name okiru-pro-kv --name api-internal-key --value "your_api_key"

# ACR pull secret (base64 encoded docker config)
az keyvault secret set --vault-name okiru-pro-kv --name acr-pull-secret --value "your_base64_dockerconfig"
```

### 3. Configure Workload Identity

```bash
# Create managed identity
az identity create \
  --name eso-identity \
  --resource-group okiru-pro-rg

# Get identity client ID
IDENTITY_CLIENT_ID=$(az identity show \
  --name eso-identity \
  --resource-group okiru-pro-rg \
  --query clientId -o tsv)

# Assign Key Vault Secrets User role
az role assignment create \
  --assignee $IDENTITY_CLIENT_ID \
  --role "Key Vault Secrets User" \
  --scope "/subscriptions/{subscription-id}/resourceGroups/okiru-pro-rg/providers/Microsoft.KeyVault/vaults/okiru-pro-kv"

# Create federated credential for ESO
az identity federated-credential create \
  --name eso-federated \
  --identity-name eso-identity \
  --resource-group okiru-pro-rg \
  --issuer "https://southafricanorth.oic.prod-aks.azure.com/{tenant-id}/{cluster-id}/v2.0" \
  --subject "system:serviceaccount:external-secrets:external-secrets-sa"
```

### 4. Apply ESO Configuration

```bash
# Create SecretStore (per namespace)
kubectl apply -f secretstore.yaml

# Create ExternalSecrets (per secret)
kubectl apply -f external-secrets/
```

## Migration from GitHub Secrets

1. **Phase 1** (Current): GitHub Actions creates secrets via `kubectl create secret`
2. **Phase 2** (ESO Setup): Deploy ESO, SecretStore, and ExternalSecrets alongside existing secrets
3. **Phase 3** (Validation): Verify ESO-created secrets work correctly
4. **Phase 4** (Switchover): Remove `kubectl create secret` from workflows, rely on ESO
5. **Phase 5** (Cleanup): Remove GitHub Secrets that are now in Key Vault

## Files in this Directory

- `secretstore-template.yaml`: Template for SecretStore resource (Workload Identity auth)
- `externalsecrets/`: ExternalSecret resources for each secret
- `setup-script.sh`: Helper script for Key Vault setup

## Secret Naming Convention

| Kubernetes Secret | Key Vault Secret Name |
|-------------------|----------------------|
| mongodb-credentials | mongo-* |
| arangodb-credentials | arango-* |
| redis-credentials | redis-* |
| session-secrets | jwt-secret, session-secret, api-internal-key |
| acr-pull-secret | acr-pull-secret |
| external-api-keys | azure-openai-*, groq-api-key |
