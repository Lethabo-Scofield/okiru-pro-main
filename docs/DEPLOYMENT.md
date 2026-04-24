# Deployment Guide

## Overview

This project uses **GitHub Actions** for automated CI/CD to Azure Kubernetes Service (AKS).

## The Problem We Fixed

### Issue: Stale Deployments (Old Code Running)

Using `latest` tag causes Kubernetes to cache images and not pull fresh builds:

```
1. Build v1 → Push :latest → Deploy (works)
2. Build v2 → Push :latest → Kubernetes sees SAME tag → Uses cached v1 (BROKEN!)
```

### Solution: Unique Image Tags

Every build gets a unique tag: `{git-short-sha}-{timestamp}`

```
1. Build v1 → Push :abc1234-20250404-120000 → Deploy ✓
2. Build v2 → Push :def5678-20250404-121500 → Deploy ✓ (forced pull)
```

## GitHub Actions Workflows

### 1. Automatic Deployment (On Push to Main)

**File:** `.github/workflows/build-deploy-aks.yml`

Triggers on every push to `main` or merged PR:

```yaml
on:
  push:
    branches: ["main", "master"]
```

**What it does:**
1. Generates unique image tag (git-sha-timestamp)
2. Builds API, Web, and Compute apps
3. Builds Docker images with unique tags
4. Pushes to Azure Container Registry (ACR)
5. Updates Kubernetes deployments with new image tags
6. Runs smoke tests
7. Auto-rollback on failure

### 2. Manual Deployment

**File:** `.github/workflows/manual-deploy.yml`

Trigger via GitHub UI → Actions → Manual Deploy → Run workflow

Options:
- Choose environment (prod/staging)
- Specify image tag (or build new)
- Skip tests (emergency deploys)

### 3. Rollback

**File:** `.github/workflows/rollback.yml`

Quickly rollback to previous version if something breaks.

## Required Secrets

Set these in GitHub Repository Settings → Secrets:

| Secret | Description |
|--------|-------------|
| `AZURE_CLIENT_ID` | Azure Service Principal App ID |
| `AZURE_CLIENT_SECRET` | Azure Service Principal Password |
| `AZURE_SUBSCRIPTION_ID` | Azure Subscription ID |
| `AZURE_TENANT_ID` | Azure Tenant ID |
| `VITE_API_URL` | API URL for frontend builds |

## How to Deploy

### Option 1: Push to Main (Automatic)

```bash
git add .
git commit -m "Your changes"
git push origin main
```

GitHub Actions will automatically:
- Build with unique tag
- Push to ACR
- Deploy to AKS
- Run tests

### Option 2: Manual Deploy

1. Go to GitHub → Actions → "Manual Deploy to AKS"
2. Click "Run workflow"
3. Choose options
4. Click "Run"

### Option 3: Local Script (PowerShell)

```powershell
cd scripts/azure-cli
.\build-and-deploy.ps1
```

## Verifying Deployments

### Check deployment status:

```bash
kubectl get pods -n okiru-pro
kubectl get deployments -n okiru-pro
```

### Check which image is running:

```bash
kubectl get deployment api -n okiru-pro -o jsonpath='{.spec.template.spec.containers[0].image}'
kubectl get deployment web -n okiru-pro -o jsonpath='{.spec.template.spec.containers[0].image}'
```

### View rollout history:

```bash
kubectl rollout history deployment/api -n okiru-pro
kubectl rollout history deployment/web -n okiru-pro
```

## Troubleshooting

### Pods stuck in ImagePullBackOff

**Cause:** Image not found in registry

**Fix:**
```bash
# Check if image exists in ACR
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web

# Redeploy with correct tag
kubectl set image deployment/web web=okiruproacrde4d539b.azurecr.io/okiru-pro/web:CORRECT_TAG -n okiru-pro
```

### Deployment not updating

**Cause:** Same image tag being used

**Fix:**
1. Use GitHub Actions with unique tags
2. Or manually force restart:
```bash
kubectl rollout restart deployment/api -n okiru-pro
kubectl rollout restart deployment/web -n okiru-pro
```

### Smoke tests failing

**Cause:** App not ready or health check failing

**Fix:**
```bash
# Check logs
kubectl logs -n okiru-pro deployment/web --tail=100
kubectl logs -n okiru-pro deployment/api --tail=100

# Check health manually
curl https://okiru.20.164.101.114.nip.io/api/health
```

## Architecture

```
GitHub Push
    ↓
GitHub Actions
    ├── Build Apps (pnpm build)
    ├── Build Docker Images
    ├── Tag: {git-sha}-{timestamp}
    ├── Push to ACR
    └── Deploy to AKS
            ├── Update Deployment
            ├── Wait for Rollout
            ├── Smoke Tests
            └── Auto-Rollback (on failure)
```

## Contact

For deployment issues, contact the DevOps team or check GitHub Actions logs.
