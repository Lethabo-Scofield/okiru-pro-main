# Azure CLI Deployment Scripts

This directory contains PowerShell and Bash scripts for managing the Okiru PRO deployment on Azure Kubernetes Service (AKS) using Azure CLI.

## Quick Start

### Full Pipeline (Cleanup → Rebuild → Deploy)

```powershell
# One command to fix broken deployments
.\00-full-cleanup-rebuild-deploy.ps1
```

### Individual Steps

```powershell
# Step 1: Cleanup old/broken images from ACR
bash 01-cleanup-acr.sh

# Step 2: Rebuild all images
.\02-force-rebuild.ps1 -ImageTag "hotfix-$(Get-Date -Format 'yyyyMMdd')"

# Step 3: Deploy to AKS
.\03-deploy-aks.ps1 -ImageTag "<tag-from-step-2>"

# Step 4: Check status
.\04-status-check.ps1
```

## Scripts

### 00-full-cleanup-rebuild-deploy.ps1
**Master script** - Orchestrates the entire pipeline:
1. Cleans up old/broken images from ACR
2. Rebuilds all Docker images
3. Deploys to AKS with rolling update
4. Runs smoke tests
5. Automatic rollback on failure

**Usage:**
```powershell
# Full pipeline with auto-generated tag
.\00-full-cleanup-rebuild-deploy.ps1

# Custom tag
.\00-full-cleanup-rebuild-deploy.ps1 -ImageTag "fix-assets-20240101"

# Skip cleanup (faster if already cleaned)
.\00-full-cleanup-rebuild-deploy.ps1 -SkipCleanup

# Skip build (use existing 'latest' images)
.\00-full-cleanup-rebuild-deploy.ps1 -SkipBuild
```

### 01-cleanup-acr.sh
**Cleanup script** - Removes old images from Azure Container Registry:
- Deletes `latest` tags (forces rebuild)
- Removes untagged/dangling manifests
- Cleans up images older than 7 days
- Shows inventory before/after

**Usage:**
```bash
# Requires Azure CLI login
bash scripts/azure-cli/01-cleanup-acr.sh
```

### 02-force-rebuild.ps1
**Build script** - Rebuilds all Docker images:
- Uses correct build context (monorepo root)
- Tags with git SHA + timestamp
- Also tags as `latest`
- Pushes to ACR

**Usage:**
```powershell
# Auto-generated tag
.\02-force-rebuild.ps1

# Custom tag
.\02-force-rebuild.ps1 -ImageTag "abc123-20240101-120000"
```

### 03-deploy-aks.ps1
**Deploy script** - Updates AKS deployment:
- Updates Kustomize with new image tags
- Applies manifests with rolling update
- Waits for rollout completion
- Runs smoke tests
- Automatic rollback on failure

**Usage:**
```powershell
# Deploy with a specific tag
.\03-deploy-aks.ps1 -ImageTag "abc123-20240101-120000"

# Skip smoke tests
.\03-deploy-aks.ps1 -SkipTests

# Rollback to previous revision
.\03-deploy-aks.ps1 -Rollback
```

### 04-status-check.ps1
**Status script** - Shows deployment status:
- Pod status and resource usage
- Services and endpoints
- Recent events
- Deployment history
- Health checks
- Logs

**Usage:**
```powershell
# Quick status check
.\04-status-check.ps1

# Follow web logs
.\04-status-check.ps1 -Follow

# Comprehensive check including HTTP tests
.\04-status-check.ps1 -CheckAll
```

## Prerequisites

1. **Azure CLI** installed and logged in:
   ```powershell
   az login
   az account set --subscription "your-subscription"
   ```

2. **Docker** installed and logged into ACR:
   ```powershell
   az acr login --name okiruproacrde4d539b
   ```

3. **kubectl** configured:
   ```powershell
   az aks get-credentials --resource-group okiru-pro-rg --name okiru-pro-aks
   ```

4. **Kustomize** (optional - script falls back to `kubectl kustomize`)

## Common Scenarios

### Fix MIME Type Errors (Blank Screen)

The root cause is usually outdated/broken images in ACR. To fix:

```powershell
# Full rebuild and deploy
.\00-full-cleanup-rebuild-deploy.ps1
```

This will:
1. Delete the broken `latest` images from ACR
2. Rebuild with correct context
3. Deploy and verify

### Deploy Quick Hotfix

```powershell
# If you just need to rebuild and deploy
.\00-full-cleanup-rebuild-deploy.ps1 -SkipCleanup
```

### Verify Deployment

```powershell
# Check pod status
.\04-status-check.ps1

# Follow logs in real-time
.\04-status-check.ps1 -Follow

# Run HTTP health checks
.\04-status-check.ps1 -CheckAll
```

### Manual Rollback

```powershell
# If deployment is broken
.\03-deploy-aks.ps1 -Rollback
```

Or via kubectl:
```bash
kubectl rollout undo deployment/web -n okiru-pro
kubectl rollout undo deployment/api -n okiru-pro
kubectl rollout undo deployment/compute -n okiru-pro
```

## Troubleshooting

### "Cannot find built frontend" Error

The web Dockerfile needs the monorepo root as context. The scripts handle this correctly by using context=`.` instead of `context=./apps/web`.

### ImagePullBackOff Errors

1. Verify ACR credentials:
   ```bash
   kubectl get secret acr-pull-secret -n okiru-pro
   ```

2. Check image exists:
   ```bash
   az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web
   ```

### Pods Stuck on Old Image

Even after deploying new images, pods may still use old cached images. The scripts handle this by:
1. Changing image tags (forces pull)
2. Running `kubectl rollout restart`
3. Using `imagePullPolicy: Always`

## GitHub Actions Alternative

If you prefer CI/CD, the `.github/workflows/deploy-prod.yml` workflow is fixed to use the correct build context. Trigger it:
- Push to `main` branch
- Manual trigger via GitHub UI

The workflow now uses:
```yaml
context: .  # Was: ./apps/web (incorrect for monorepo)
```
