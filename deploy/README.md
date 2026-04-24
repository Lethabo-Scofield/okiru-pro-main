# Deployment Migration Notice

## Status: Migrated to Kustomize

The Kubernetes deployment configuration has been **migrated** from flat YAML files to **Kustomize** for better environment management and consistency.

## New Location

**Active Kubernetes manifests:** `kubernetes/infrastructure/`

```
kubernetes/infrastructure/
├── base/              # Shared resources (deployments, services, ingress)
│   ├── deployments/   # api.yaml, web.yaml, compute.yaml
│   ├── services/
│   ├── configmaps/
│   └── ...
└── overlays/
    ├── staging/       # Staging environment
    └── prod/          # Production environment
```

## Quick Start

### Deploy to Staging

```bash
cd kubernetes/infrastructure

# Create secrets (via CI or manual)
# Then apply:
kubectl apply -k overlays/staging
```

### Deploy to Production

Production deployments are handled automatically via GitHub Actions:
- Workflow: `.github/workflows/deploy-prod.yml`
- Uses Kustomize + commit-specific image tags

## Legacy Files

The old flat deployment files have been moved to `deploy/k8s-legacy/` for reference only.

**Do not use these for new deployments.** They are kept for:
- Historical reference
- Rollback procedures (temporary)
- Migration verification

These files will be removed in a future cleanup.

## Migration Completed

- ✅ Kustomize base + overlays structure
- ✅ Environment-specific secrets in overlays
- ✅ ConfigMap keys aligned between deployments
- ✅ Volume mounts for read-only root filesystem
- ✅ External API keys (optional) configured
- ✅ PR validation workflow for Kustomize builds

## Questions?

See `kubernetes/README.md` for detailed documentation.
