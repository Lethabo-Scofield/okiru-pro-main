# ArgoCD GitOps Setup

This directory contains ArgoCD Application manifests for GitOps deployment.

## Prerequisites

1. ArgoCD installed on the cluster:
   ```bash
   kubectl create namespace argocd
   kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
   ```

2. ArgoCD CLI configured:
   ```bash
   argocd login argocd.example.com:443
   ```

## Setup

### 1. Create the Applications

```bash
# Apply production Application
kubectl apply -f application-prod.yaml

# Apply staging Application
kubectl apply -f application-staging.yaml
```

### 2. Configure Repository Access

```bash
# Add repository to ArgoCD (if private)
argocd repo add https://github.com/your-org/okiru-pro-main.git \
  --username github-user \
  --password github-token
```

### 3. (Optional) Enable Image Updater

For automatic image updates:

```bash
# Install ArgoCD Image Updater
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/stable/manifests/install.yaml

# Configure Git write-back credentials
kubectl create secret generic git-creds \
  -n argocd \
  --from-literal=username=github-user \
  --from-literal=password=github-token
```

## How It Works

1. **Git as Source of Truth**: All Kubernetes manifests are in `kubernetes/infrastructure/`
2. **Kustomize Rendering**: ArgoCD uses `kubectl kustomize` to render overlays
3. **Automatic Sync**: Changes to git are automatically applied to the cluster
4. **Drift Detection**: Manual changes are reverted to match git state
5. **Image Updates**: ArgoCD Image Updater can automatically update image tags in git

## Monitoring

```bash
# Check application status
argocd app list

# View sync status
kubectl get application -n argocd okiru-pro-prod -o yaml

# Check for sync errors
argocd app get okiru-pro-prod
```

## Manual Sync (if needed)

```bash
# Force a sync
argocd app sync okiru-pro-prod

# View diff before syncing
argocd app diff okiru-pro-prod
```
