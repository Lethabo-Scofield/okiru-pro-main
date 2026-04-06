# GitOps Configuration

This directory contains GitOps configurations for both **Flux CD** and **ArgoCD**.
You can choose either tool to manage your cluster state declaratively.

## Overview

GitOps ensures that the state of your cluster matches the configuration in Git.
Any changes pushed to the repository are automatically applied to the cluster.

## Choose Your GitOps Tool

### Option 1: Flux CD (Recommended for AKS)

Flux is a CNCF-graduated project that works well with Azure Kubernetes Service.

**Advantages:**
- Native multi-tenancy support
- Built-in image automation
- Azure Key Vault integration (for secrets)
- No persistent UI required (reduces attack surface)

**Installation:**

```bash
# Install Flux CLI
choco install flux

# Bootstrap Flux on your cluster
flux bootstrap github \
  --owner=Lethabo-Scofield \
  --repository=okiru-pro-main \
  --branch=main \
  --path=kubernetes/clusters/production \
  --personal \
  --components-extra=image-reflector-controller,image-automation-controller
```

**Apply GitOps Configuration:**

```bash
# Apply GitRepository sources
kubectl apply -f kubernetes/gitops/flux/gitrepository.yaml

# Apply Kustomizations (one per environment)
kubectl apply -f kubernetes/gitops/flux/kustomization-staging.yaml
kubectl apply -f kubernetes/gitops/flux/kustomization-prod.yaml

# Apply Image Automation (for automatic image updates)
kubectl apply -f kubernetes/gitops/flux/image-automation.yaml
```

**View Status:**

```bash
# Check GitRepository sync status
flux get sources git

# Check Kustomization status
flux get kustomizations

# Check Image Repository (ACR) status
flux get image repositories

# Check Image Policies
flux get image policies

# Check all resources
flux get all
```

**Trigger Manual Sync:**

```bash
# Reconcile GitRepository immediately
flux reconcile source git okiru-pro

# Reconcile Kustomization immediately
flux reconcile kustomization okiru-pro-prod
```

### Option 2: ArgoCD

ArgoCD provides a rich web UI and is excellent for visualizing your deployments.

**Advantages:**
- Rich web UI for visualization
- SSO integration
- Application grouping and project management
- Easy rollback via UI

**Installation:**

```bash
# Create ArgoCD namespace
kubectl create namespace argocd

# Install ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# (Optional) Install ArgoCD Image Updater for automatic image updates
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj-labs/argocd-image-updater/stable/manifests/install.yaml
```

**Access the UI:**

```bash
# Port-forward to access UI
kubectl port-forward svc/argocd-server -n argocd 8080:443

# Get admin password (initial)
kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}" | base64 -d
```

Then open https://localhost:8080 in your browser.

**Apply Applications:**

```bash
# Apply staging application
kubectl apply -f kubernetes/gitops/argocd/application-staging.yaml

# Apply production application
kubectl apply -f kubernetes/gitops/argocd/application-prod.yaml
```

**Configure Git Credentials (for private repos):**

```bash
# Create SSH key pair for ArgoCD
ssh-keygen -t ed25519 -C "argocd@okiru.local" -f argocd-ssh-key

# Add public key to GitHub deploy keys

# Create secret in ArgoCD namespace
kubectl create secret generic github-ssh-key \
  -n argocd \
  --from-file=ssh-privatekey=argocd-ssh-key \
  --from-file=ssh-publickey=argocd-ssh-key.pub
```

## Image Automation

Both tools support automatic image updates:

### Staging (Automatic)

Staging automatically deploys new images as they are built.

- **Flux:** Uses `ImagePolicy` with `alphabetical` ordering (newest SHA tag)
- **ArgoCD:** Uses Image Updater with `latest` strategy

### Production (Manual/Controlled)

Production requires explicit versioning for controlled rollouts.

- **Flux:** Uses `ImagePolicy` with `semver` constraints (e.g., `>=1.0.0`)
- **ArgoCD:** Uses Image Updater with `semver` strategy

To enable production automation:

1. Tag releases with semantic versions (e.g., `v1.2.3`)
2. Enable the ImageUpdateAutomation (Flux) or set `enabled: "true"` (ArgoCD)
3. Ensure automated tests pass in staging before production deployment

## Security Considerations

### Secrets Management

GitOps tools do NOT handle secrets well. Use these alternatives:

1. **External Secrets Operator** (recommended): Syncs secrets from Azure Key Vault
2. **Sealed Secrets**: Encrypt secrets for Git storage
3. **SOPS**: Encrypt secrets with Azure Key Vault

See `kubernetes/external-secrets/` for Azure Key Vault integration.

### RBAC

Restrict GitOps tool permissions:

- Flux: Use `ServiceAccount` with minimal permissions per namespace
- ArgoCD: Use projects to restrict application deployment scope

### Network Policies

```yaml
# Restrict GitOps traffic
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-gitops
spec:
  podSelector:
    matchLabels:
      app.kubernetes.io/part-of: okiru-pro
  policyTypes:
    - Ingress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: flux-system  # or argocd
```

## Troubleshooting

### Flux

```bash
# Check events
flux events

# Check logs
kubectl logs -n flux-system deployment/kustomize-controller
kubectl logs -n flux-system deployment/source-controller

# Suspend/Resume automation
flux suspend kustomization okiru-pro-prod
flux resume kustomization okiru-pro-prod
```

### ArgoCD

```bash
# Check application status
argocd app get okiru-pro-prod

# Sync application manually
argocd app sync okiru-pro-prod

# View diff between Git and cluster
argocd app diff okiru-pro-prod
```

## Migration Path

To migrate from CI/CD to GitOps:

1. **Phase 1:** Deploy GitOps tooling alongside existing CI/CD
2. **Phase 2:** Enable GitOps with `prune: false` (no deletion of existing resources)
3. **Phase 3:** Once stable, enable `prune: true` and reduce CI/CD to build-only
4. **Phase 4:** Disable CI/CD deployment steps, keep only for builds and tests

## Files Reference

```
kubernetes/gitops/
├── README.md                           # This file
├── flux/
│   ├── gitrepository.yaml              # GitRepository CRDs (sources)
│   ├── kustomization-staging.yaml      # Staging Kustomization + ImageUpdateAutomation
│   ├── kustomization-prod.yaml       # Production Kustomization + ImageUpdateAutomation
│   └── image-automation.yaml           # ImageRepository + ImagePolicy for all services
└── argocd/
    ├── application-staging.yaml        # Staging Application + Image Updater config
    └── application-prod.yaml           # Production Application + Image Updater config
```

## Next Steps

1. Choose GitOps tool (Flux or ArgoCD)
2. Install on cluster
3. Apply configurations
4. Verify sync works
5. (Optional) Enable image automation
6. (Optional) Set up notifications (Slack, Teams, Discord)

## Resources

- [Flux Documentation](https://fluxcd.io/docs/)
- [ArgoCD Documentation](https://argo-cd.readthedocs.io/)
- [GitOps Principles](https://opengitops.dev/)
