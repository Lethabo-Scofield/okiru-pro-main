# Okiru Pro — Azure AKS Deployment Guide

Complete step-by-step guide to deploy the Okiru Pro platform to Azure Kubernetes Service (AKS).

---

## Prerequisites

Install these tools on your local machine before starting:

| Tool | Install |
|------|---------|
| **Azure CLI** (`az`) | [Install Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) |
| **Docker Desktop** | [Install Docker](https://docs.docker.com/get-docker/) |
| **kubectl** | `az aks install-cli` |
| **PowerShell 5.1+** | Pre-installed on Windows; [Install on macOS/Linux](https://learn.microsoft.com/en-us/powershell/scripting/install/installing-powershell) |

---

## Step 1: Azure Login & Cluster Access

```powershell
# Login to Azure
az login

# Set your subscription (if you have multiple)
az account set --subscription "<YOUR_SUBSCRIPTION_ID>"

# Get AKS credentials (connects kubectl to your cluster)
az aks get-credentials --resource-group <YOUR_RESOURCE_GROUP> --name <YOUR_AKS_CLUSTER_NAME>

# Verify connection
kubectl get nodes
```

---

## Step 2: Create the Namespace

```powershell
kubectl create namespace okiru-pro
```

---

## Step 3: Create the ACR Pull Secret

This allows Kubernetes to pull Docker images from your Azure Container Registry.

```powershell
# Login to ACR
az acr login --name okiruproacrde4d539b

# Create image pull secret
kubectl create secret docker-registry acr-pull-secret `
  --namespace okiru-pro `
  --docker-server=okiruproacrde4d539b.azurecr.io `
  --docker-username=<ACR_USERNAME> `
  --docker-password=<ACR_PASSWORD>
```

To get your ACR credentials:
```powershell
az acr credential show --name okiruproacrde4d539b
```

---

## Step 4: Create Kubernetes Secrets

You need to create 5 secrets. Choose strong, random passwords for each value.

### 4a. MongoDB Credentials

```powershell
kubectl create secret generic mongodb-credentials `
  --namespace okiru-pro `
  --from-literal=MONGO_INITDB_ROOT_USERNAME=admin `
  --from-literal=MONGO_INITDB_ROOT_PASSWORD=<CHOOSE_A_STRONG_PASSWORD> `
  --from-literal=MONGODB_URI="mongodb://admin:<SAME_PASSWORD>@mongodb:27017/okiru_pro?authSource=admin&retryWrites=true&w=majority" `
  --from-literal=MONGODB_DB_NAME=okiru_pro
```

> Replace `<CHOOSE_A_STRONG_PASSWORD>` with a strong password (20+ chars, mixed case, numbers, symbols).
> Use the SAME password in both `MONGO_INITDB_ROOT_PASSWORD` and inside the `MONGODB_URI` connection string.

### 4b. ArangoDB Credentials

```powershell
kubectl create secret generic arangodb-credentials `
  --namespace okiru-pro `
  --from-literal=ARANGO_ROOT_PASSWORD=<CHOOSE_A_STRONG_PASSWORD> `
  --from-literal=ARANGO_PASSWORD=<SAME_PASSWORD> `
  --from-literal=ARANGO_URL="http://arangodb:8529" `
  --from-literal=ARANGO_DB_NAME=bbbee_db `
  --from-literal=ARANGO_USER=root `
  --from-literal=ARANGO_VERIFY_SSL=false
```

### 4c. Redis Credentials

```powershell
kubectl create secret generic redis-credentials `
  --namespace okiru-pro `
  --from-literal=REDIS_PASSWORD=<CHOOSE_A_STRONG_PASSWORD> `
  --from-literal=REDIS_URL="redis://:<SAME_PASSWORD>@redis:6379/0"
```

### 4d. Session Secrets

These are used for JWT tokens, session cookies, and inter-service authentication.

```powershell
kubectl create secret generic session-secrets `
  --namespace okiru-pro `
  --from-literal=JWT_SECRET=<RANDOM_64_CHAR_STRING> `
  --from-literal=SESSION_SECRET=<DIFFERENT_RANDOM_64_CHAR_STRING> `
  --from-literal=API_INTERNAL_KEY=<ANOTHER_RANDOM_64_CHAR_STRING>
```

To generate random strings (run in PowerShell):
```powershell
# Generate 3 random 64-character secrets
1..3 | ForEach-Object { -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 64 | ForEach-Object { [char]$_ }) }
```

Or on Linux/macOS:
```bash
openssl rand -hex 32    # Run 3 times for 3 different secrets
```

### 4e. External API Keys (Optional)

Only needed if you want AI features and email notifications:

```powershell
kubectl create secret generic external-api-keys `
  --namespace okiru-pro `
  --from-literal=GROQ_API_KEY=<YOUR_GROQ_KEY_OR_EMPTY> `
  --from-literal=AZURE_OPENAI_ENDPOINT=<YOUR_ENDPOINT_OR_EMPTY> `
  --from-literal=AZURE_OPENAI_API_KEY=<YOUR_KEY_OR_EMPTY> `
  --from-literal=SMTP_HOST=<YOUR_SMTP_HOST_OR_EMPTY> `
  --from-literal=SMTP_PORT=587 `
  --from-literal=SMTP_USER=<YOUR_SMTP_USER_OR_EMPTY> `
  --from-literal=SMTP_PASS=<YOUR_SMTP_PASS_OR_EMPTY>
```

If you don't have these keys yet, create the secret with empty values:
```powershell
kubectl create secret generic external-api-keys `
  --namespace okiru-pro `
  --from-literal=GROQ_API_KEY="" `
  --from-literal=AZURE_OPENAI_ENDPOINT="" `
  --from-literal=AZURE_OPENAI_API_KEY="" `
  --from-literal=SMTP_HOST="" `
  --from-literal=SMTP_PORT="587" `
  --from-literal=SMTP_USER="" `
  --from-literal=SMTP_PASS=""
```

> Without GROQ/OpenAI keys: AI entity extraction uses a local heuristic fallback (still functional).
> Without SMTP keys: Registration skips email OTP verification and logs users in directly.

---

## Step 5: Verify All Secrets Exist

```powershell
kubectl get secrets -n okiru-pro
```

You should see all of these:
```
NAME                    TYPE                             DATA   AGE
acr-pull-secret         kubernetes.io/dockerconfigjson   1      ...
mongodb-credentials     Opaque                           4      ...
arangodb-credentials    Opaque                           6      ...
redis-credentials       Opaque                           2      ...
session-secrets         Opaque                           3      ...
external-api-keys       Opaque                           7      ...
```

---

## Step 6: Build and Push Docker Images

From the project root directory on your local machine:

```powershell
.\scripts\azure-cli\01-build-push.ps1
```

This builds all 3 images (API, Web, Compute) and pushes them to ACR.
It will output an image tag like `abc1234-20260406-143000`. Save this tag.

---

## Step 7: Deploy to AKS

```powershell
.\scripts\azure-cli\03-deploy-aks.ps1 -ImageTag "<TAG_FROM_STEP_6>"
```

This will:
1. Update the Kustomize config with the new image tags
2. Apply all manifests (PVCs, ConfigMaps, Deployments, Services, Ingress)
3. Wait for all pods to become ready
4. Run smoke tests against the live URL
5. Auto-rollback if smoke tests fail

---

## Step 8: Verify Deployment

```powershell
# Check all pods are running
kubectl get pods -n okiru-pro

# Expected output (all should show Running/1/1):
# NAME                        READY   STATUS    RESTARTS   AGE
# mongodb-xxx                 1/1     Running   0          2m
# arangodb-xxx                1/1     Running   0          2m
# redis-xxx                   1/1     Running   0          2m
# api-xxx                     1/1     Running   0          1m
# api-yyy                     1/1     Running   0          1m
# web-xxx                     1/1     Running   0          1m
# web-yyy                     1/1     Running   0          1m
# compute-xxx                 1/1     Running   0          1m

# Check services
kubectl get svc -n okiru-pro

# Check ingress
kubectl get ingress -n okiru-pro

# Test the app
curl -I https://okiru.20.164.101.114.nip.io/
curl https://okiru.20.164.101.114.nip.io/api/health
```

---

## Step 9: Access the Application

Open in your browser: **https://okiru.20.164.101.114.nip.io**

Default login (if seeded): `demo` / `demo`

---

## Troubleshooting

### Pods stuck in CrashLoopBackOff
```powershell
# Check pod logs
kubectl logs -n okiru-pro deployment/api --tail=100
kubectl logs -n okiru-pro deployment/web --tail=100
kubectl logs -n okiru-pro deployment/compute --tail=100

# Check events
kubectl describe pod -n okiru-pro <POD_NAME>
```

### Pods stuck in Init (waiting for dependencies)
The API and Compute pods wait for MongoDB/ArangoDB/Redis to be ready. Check database pods first:
```powershell
kubectl logs -n okiru-pro deployment/mongodb --tail=50
kubectl logs -n okiru-pro deployment/arangodb --tail=50
kubectl logs -n okiru-pro deployment/redis --tail=50
```

### Secret values are wrong
Delete and recreate:
```powershell
kubectl delete secret mongodb-credentials -n okiru-pro
# Then re-run the create command from Step 4a
```

### Image pull errors
```powershell
# Verify ACR credentials
az acr login --name okiruproacrde4d539b

# Recreate pull secret
kubectl delete secret acr-pull-secret -n okiru-pro
# Then re-run the create command from Step 3
```

### Rollback to previous version
```powershell
.\scripts\azure-cli\03-deploy-aks.ps1 -Rollback
```

### Full cleanup and redeploy
```powershell
.\scripts\azure-cli\00-full-cleanup-rebuild-deploy.ps1
```

---

## Quick Reference: What Each Secret Controls

| Secret | Used By | Purpose |
|--------|---------|---------|
| `mongodb-credentials` | MongoDB, API, Web, Compute | Database authentication and connection |
| `arangodb-credentials` | ArangoDB, API, Compute | Knowledge graph database for scorecard templates |
| `redis-credentials` | Redis, API | Session cache and rate limiting |
| `session-secrets` | API, Web, Compute | JWT tokens, session cookies, inter-service auth |
| `external-api-keys` | API, Web | AI features (Groq/OpenAI) and email (SMTP) |
| `acr-pull-secret` | All pods | Pull Docker images from Azure Container Registry |

---

## Architecture Overview

```
                    Internet
                       │
                  NGINX Ingress
                  (TLS termination)
                       │
          ┌────────────┼────────────┐
          │            │            │
     /api/auth/*    /api/*     / (frontend)
     /api/clients   /api/...   /assets/*
          │            │            │
       API:5000     API:5000    Web:5001
          │                        │
          ├─── Compute:8000        │
          │                        │
     ┌────┴────┐              ┌────┴────┐
     │ MongoDB │              │ MongoDB │
     │ ArangoDB│              │         │
     │ Redis   │              └─────────┘
     └─────────┘
```

All services run inside the `okiru-pro` namespace and communicate via Kubernetes service DNS (e.g., `http://api:5000`, `http://compute:8000`).
