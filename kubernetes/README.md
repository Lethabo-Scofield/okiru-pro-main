# Okiru Pro Kubernetes Infrastructure

This directory contains the Kubernetes manifests for deploying Okiru Pro on Azure Kubernetes Service (AKS).

## Architecture

We use **Kustomize** for environment-specific configuration management:

```
kubernetes/infrastructure/
├── base/              # Shared base resources (no secrets)
│   ├── namespace.yaml
│   ├── storage/
│   ├── configmaps/
│   ├── deployments/
│   ├── services/
│   ├── ingress/
│   └── hpa/
└── overlays/
    ├── staging/       # Staging environment
    │   ├── secrets/   # Secret templates (populated by CI)
    │   └── patches/   # Environment-specific patches
    └── prod/          # Production environment
        ├── secrets/   # Secret templates (populated by CI)
        └── patches/   # Environment-specific patches
```

## Key Principles

1. **Base contains no secrets**: Secrets are only in overlay `secrets/` directories as templates
2. **Secrets are populated by CI**: GitHub Actions substitutes `${VAR}` placeholders at deploy time
3. **Environment isolation**: Each environment has its own namespace and secrets
4. **Git is the source of truth**: All non-secret configuration lives in git

## Building with Kustomize

### Prerequisites

- `kubectl` with kustomize support (built-in since v1.14)
- Or standalone `kustomize` CLI

### Validate builds locally

```bash
# Build staging configuration
kubectl kustomize overlays/staging

# Build production configuration
kubectl kustomize overlays/prod

# For debugging, output to file
kubectl kustomize overlays/prod > /tmp/prod-rendered.yaml
```

## Secrets Management

### Current Approach: CI-Injected Secrets

Secrets are managed through GitHub Actions workflows that:
1. Read from GitHub Secrets (environment-specific)
2. Substitute into template files
3. Apply to the cluster

**Template files** (safe to commit):
- `overlays/prod/secrets/secrets.yaml`
- `overlays/staging/secrets/secrets.yaml`

These contain `${VAR}` placeholders like:
```yaml
stringData:
  MONGODB_URI: "${MONGODB_URI}"
```

### Required GitHub Secrets

Per-environment secrets must be configured in GitHub:

| Secret | Description |
|--------|-------------|
| `MONGO_INITDB_ROOT_USERNAME` | MongoDB admin username |
| `MONGO_INITDB_ROOT_PASSWORD` | MongoDB admin password |
| `MONGODB_URI` | Full MongoDB connection string |
| `MONGODB_DB_NAME` | Database name |
| `ARANGO_ROOT_PASSWORD` | ArangoDB root password |
| `ARANGO_URL` | ArangoDB connection URL |
| `ARANGO_DB_NAME` | ArangoDB database name |
| `REDIS_PASSWORD` | Redis password |
| `REDIS_URL` | Redis connection URL |
| `JWT_SECRET` | JWT signing secret |
| `SESSION_SECRET` | Session encryption secret |
| `API_INTERNAL_KEY` | Internal API authentication key |
| `ACR_PULL_SECRET` | Base64 encoded docker config for ACR |

### Future: External Secrets Operator

Planned migration to External Secrets Operator + Azure Key Vault for:
- Automatic secret rotation
- Audit logging
- No secrets in GitHub Actions

## Deployment

### Via GitHub Actions (Production)

The `deploy-prod.yml` workflow:
1. Builds images with commit SHA tags
2. Substitutes secrets into templates
3. Applies full Kustomize output
4. Updates image tags to specific SHA
5. Runs smoke tests

### Manual Testing (Staging)

For development/testing:

```bash
# 1. Set environment variables
export MONGO_INITDB_ROOT_USERNAME=dev_user
export MONGO_INITDB_ROOT_PASSWORD=dev_password
# ... etc for all required secrets

# 2. Substitute and apply
envsubst < overlays/staging/secrets/secrets.yaml | kubectl apply -f -

# 3. Apply the rest of the configuration
kubectl apply -k overlays/staging
```

## Validation

All PRs touching `kubernetes/**` files trigger a kustomize build check to ensure:
- No duplicate resource IDs
- All patches apply cleanly
- Output is valid Kubernetes YAML

See `.github/workflows/kustomize-validate.yml`
