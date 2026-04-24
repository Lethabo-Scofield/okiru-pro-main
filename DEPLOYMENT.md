# Okiru Pro — Production Deployment Guide

## Overview

Three services are deployed as Docker containers to Azure Kubernetes Service (AKS):

| Service | Image | Port |
|---|---|---|
| API Server | `okiru-pro/api` | 3000 |
| Web Frontend | `okiru-pro/web` | 5001 |
| Computation Engine | `okiru-pro/compute` | 8000 |

All secrets are stored in **Azure Key Vault** and injected via the External Secrets Operator.
No secrets should ever be baked into Docker images.

---

## 1. Required Secrets

### Azure Key Vault — add/update these keys

```
# Database
mongodb-uri                    # e.g. mongodb+srv://user:pass@cluster.mongodb.net/okiru
arango-root-password           # ArangoDB root password
arango-url                     # e.g. https://051f856d6032.arangodb.cloud:8529

# AI
groq-api-key                   # Groq API key (primary AI provider)

# Session
session-secret                 # Long random string, e.g. openssl rand -hex 64
api-internal-key               # Internal service auth key
```

**To set a secret in Azure Key Vault:**
```powershell
az keyvault secret set `
  --vault-name <your-keyvault-name> `
  --name groq-api-key `
  --value "gsk_xxxxxxxxxxxxxxxxxxxx"
```

Repeat for each secret above.

---

## 2. Required Environment Variables (non-sensitive)

These live in `kubernetes/infrastructure/base/configmaps/app-config.yaml` and are already committed.
Update that file if you need to change non-secret config (ports, CORS origins, compute URL, etc.).

---

## 3. Rebuild & Push Docker Images

Run from the **repo root** on any machine with Docker + Azure CLI installed.

### Step 1 — Log in to Azure and ACR
```powershell
az login
az acr login --name okiruproacrde4d539b
```

### Step 2 — Build and push all three images
```powershell
.\scripts\azure-cli\01-build-push.ps1
```

This script:
- Generates a unique tag from the git commit SHA + timestamp
- Builds `api`, `web`, and `compute` images from the repo root
- Pushes them to ACR with both the unique tag and `:latest`
- Saves the tag to `.last-image-tag` for the next step

### Step 3 — Deploy to AKS
```powershell
$tag = Get-Content .last-image-tag
.\scripts\azure-cli\03-deploy-aks.ps1 -ImageTag $tag
```

### Step 4 — Verify rollout
```powershell
kubectl rollout status deployment/api -n okiru-pro
kubectl rollout status deployment/web -n okiru-pro
kubectl rollout status deployment/compute -n okiru-pro
```

---

## 4. Production Environment Variable Checklist

Before deploying, confirm these are set in Azure Key Vault:

| Key Vault Secret | Maps to Env Var | Required |
|---|---|---|
| `mongodb-uri` | `MONGODB_URI` | Yes |
| `arango-root-password` | `ARANGO_PASSWORD` | Yes |
| `arango-url` | `ARANGO_URL` | Yes |
| `groq-api-key` | `GROQ_API_KEY` | Yes |
| `session-secret` | `SESSION_SECRET` | Yes |
| `api-internal-key` | `API_INTERNAL_KEY` | Yes |

**Do NOT set `ALLOW_IN_MEMORY_DB` in production** — this was a dev bypass that has been removed.

---

## 5. Replit ↔ Azure Key Parity

The Replit environment uses the same external services as production.
Keep these in sync:

| Service | Replit Secret Name | Azure KV Secret Name |
|---|---|---|
| MongoDB Atlas | `MONGODB_URI` | `mongodb-uri` |
| ArangoDB Cloud | `ARANGO_PASSWORD` | `arango-root-password` |
| Groq | `GROQ_API_KEY` | `groq-api-key` |
| Sessions | `SESSION_SECRET` | `session-secret` |

---

## 6. AI Provider — Groq Only

The app is configured to use **Groq** (`llama-3.3-70b-versatile`) as the sole AI provider.

- Entity generation → `GROQ_API_KEY` via `groq-sdk`
- Document extraction → `GROQ_API_KEY` via `LLMExtractor` in the API pipeline
- Azure OpenAI is supported as a primary if `AZURE_OPENAI_ENDPOINT` + `AZURE_OPENAI_KEY` are set, but is **not required**

---

## 7. Troubleshooting

**Pods not starting after deploy:**
```powershell
kubectl describe pod -l app=api -n okiru-pro
kubectl logs -l app=api -n okiru-pro --previous
```

**Secrets not injecting (External Secrets Operator):**
```powershell
kubectl get externalsecrets -n okiru-pro
kubectl describe externalsecret external-api-keys -n okiru-pro
```

**Database connection errors:**
- Check Key Vault secret values are correct (no trailing spaces)
- Verify ArangoDB Cloud firewall allows AKS egress IPs
- Verify MongoDB Atlas Network Access allows AKS egress IPs

**Image pull errors:**
```powershell
# Re-login to ACR and check pull secret
az acr login --name okiruproacrde4d539b
kubectl get secret acr-pull-secret -n okiru-pro
```
