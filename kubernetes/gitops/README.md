# GitOps Configuration

This directory contains GitOps configurations for declarative continuous delivery using either **ArgoCD** or **FluxCD**.

## Overview

GitOps principles applied to Okiru Pro:
- **Git as Single Source of Truth**: All cluster state defined in this repository
- **Automated Synchronization**: Changes to git are automatically applied to the cluster
- **Drift Detection**: Manual cluster changes are automatically reverted
- **Declarative Infrastructure**: Infrastructure defined as code (Kustomize manifests)

## Directory Structure

```
gitops/
├── argocd/         # ArgoCD Application manifests
│   ├── application-prod.yaml
│   ├── application-staging.yaml
│   └── README.md
└── flux/           # Flux GitRepository and Kustomization manifests
    ├── gitrepository.yaml
    ├── kustomization-prod.yaml
    ├── kustomization-staging.yaml
    └── README.md
```

## Current State: GitHub Actions

The repository currently uses GitHub Actions for deployment (see `.github/workflows/`).

### GitHub Actions Flow
```
Code Push → Build Images → Update Kustomize → Apply to Cluster
```

### To Migrate to GitOps

GitOps moves the "Apply to Cluster" step from CI/CD to a cluster-based controller:

```
Code Push → Build Images → GitOps Controller Applies to Cluster
                                    ↑
Git Repository (manifests) ←───────┘
```

## Choosing ArgoCD vs Flux

| Factor | Recommendation |
|--------|---------------|
| **Team Experience** | Use what your team knows |
| **UI Preference** | ArgoCD has better web UI |
| **Simplicity** | Flux is simpler to operate |
| **Azure Integration** | Both work well with AKS |
| **Image Automation** | Flux has better native support |

## Migration Path

1. **Phase 1**: Continue using GitHub Actions for deployments (current)
2. **Phase 2**: Install GitOps tool (ArgoCD or Flux) alongside GitHub Actions
3. **Phase 3**: Let GitOps manage deployments, use GitHub Actions only for image building
4. **Phase 4**: Enable automated image updates (optional)

## Quick Start: ArgoCD

```bash
# Install ArgoCD
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Apply production Application
kubectl apply -f argocd/application-prod.yaml

# Access UI
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Login with admin user (get password: kubectl get secret argocd-initial-admin-secret -n argocd -o jsonpath="{.data.password}" | base64 -d)
```

## Quick Start: Flux

```bash
# Bootstrap Flux
flux bootstrap github \
  --owner=your-org \
  --repository=okiru-pro-main \
  --branch=main \
  --path=./kubernetes/gitops/flux \
  --personal

# Or apply manifests directly
kubectl apply -f flux/gitrepository.yaml
kubectl apply -f flux/kustomization-prod.yaml
```

## Benefits of GitOps

1. **Audit Trail**: All changes tracked in git history
2. **Rollback**: Easy rollback to any previous state via git revert
3. **No CI Access to Cluster**: Cluster credentials stay in-cluster
4. **Self-Healing**: Drift is automatically corrected
5. **Separation of Concerns**: CI builds images, GitOps deploys them

## Security Considerations

- ArgoCD/Flux use read-only access to git repository
- Cluster credentials are not in CI/CD
- Secrets are managed separately (External Secrets Operator)
- NetworkPolicies restrict GitOps tool access

## Next Steps

1. Review the setup instructions in `argocd/README.md` or `flux/README.md`
2. Set up a staging environment first to validate
3. Migrate production after staging is stable
4. Consider image automation for fully automated deployments
