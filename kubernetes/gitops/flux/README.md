# FluxCD GitOps Setup

This directory contains FluxCD manifests for GitOps deployment.

## Prerequisites

1. Flux CLI installed:
   ```bash
   curl -s https://fluxcd.io/install.sh | sudo bash
   ```

2. Flux installed on the cluster:
   ```bash
   flux install
   ```

## Bootstrap Flux

```bash
# Bootstrap with GitHub repository
flux bootstrap github \
  --owner=your-org \
  --repository=okiru-pro-main \
  --branch=main \
  --path=./clusters/production \
  --personal
```

## Setup (Manual)

If not using bootstrap, apply the manifests directly:

### 1. Create Git Credentials Secret (if private repo)

```bash
kubectl create secret generic github-token \
  -n flux-system \
  --from-literal=username=GITHUB_USER \
  --from-literal=password=GITHUB_TOKEN
```

### 2. Create ACR Pull Secret for Flux

```bash
kubectl create secret docker-registry acr-credentials \
  -n flux-system \
  --docker-server=okiruproacrde4d539b.azurecr.io \
  --docker-username=ACR_USERNAME \
  --docker-password=ACR_PASSWORD
```

### 3. Apply the GitRepository and Kustomizations

```bash
# Production
kubectl apply -f gitrepository.yaml
kubectl apply -f kustomization-prod.yaml

# Staging
kubectl apply -f kustomization-staging.yaml
```

## How It Works

1. **GitRepository**: Points to this GitHub repo and watches for changes
2. **Kustomization**: Renders and applies Kubernetes manifests using Kustomize
3. **Image Automation**: Automatically updates image tags in git when new images are pushed
4. **Health Checks**: Ensures deployments are ready before marking sync successful

## Monitoring

```bash
# Check Flux status
flux get all

# Check specific kustomization
flux get kustomizations okiru-pro-prod

# View events
flux events

# Check logs
kubectl logs -n flux-system deployment/kustomize-controller
```

## Suspend/Resume Reconciliation

```bash
# Suspend (pause) production updates
flux suspend kustomization okiru-pro-prod

# Resume
flux resume kustomization okiru-pro-prod
```

## Force Reconcile

```bash
# Trigger immediate reconciliation
flux reconcile kustomization okiru-pro-prod

# Force with source update
flux reconcile source git okiru-pro
```

## Image Automation

Flux can automatically update image tags in your git repository when new images are pushed to ACR.

### Setup Image Automation

```bash
# Enable image automation components
flux install --components-extra=image-reflector-controller,image-automation-controller

# Create ImageRepository for each app
flux create imagerepository okiru-api \
  --image=okiruproacrde4d539b.azurecr.io/okiru-pro/api \
  --interval=1m \
  --secret-ref=acr-credentials \
  --export > imagerepository-api.yaml

# Create ImagePolicy for update strategy
flux create imagepolicy okiru-api \
  --image-ref=okiru-api \
  --select-numeric=asc \
  --filter-regex='^[a-f0-9]{7,}-[0-9]{8,}$' \
  --export > imagepolicy-api.yaml

# Create ImageUpdateAutomation for git write-back
flux create image-update-automation okiru-pro \
  --git-ref=main \
  --author-name="Flux Bot" \
  --author-email="flux@okiru.local" \
  --commit-message-template="Update images" \
  --export > imageupdateautomation.yaml
```

## Reconcile Flow

```
GitHub Repository
       |
       v
GitRepository (flux-system) - watches for commits
       |
       v
Kustomization (flux-system) - renders with kustomize build
       |
       v
Kubernetes Cluster - applies manifests
       |
       v
Health Checks - verifies deployments ready
```

## Comparison: Flux vs ArgoCD

| Feature | Flux | ArgoCD |
|---------|------|--------|
| Installation | Native Kubernetes controllers | Complex multi-component |
| Image Updates | Built-in | Requires Image Updater add-on |
| UI | CLI, Grafana dashboard | Rich web UI |
| Multi-tenancy | Namespaced resources | Projects + RBAC |
| Notifications | Built-in | Requires add-ons |

For this repository, both are provided as templates. Choose based on your team's preference and infrastructure.
