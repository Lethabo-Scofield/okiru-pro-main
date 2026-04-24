# Migration Guide: From Existing deploy/k8s to New Infrastructure

This guide helps migrate from the existing `deploy/k8s` structure to the new `kubernetes/infrastructure` structure.

## What's Changed

### Old Structure (deploy/k8s/)
- Flat directory structure
- Environment values hardcoded in manifests
- No Kustomize support
- Manual secret management
- Single ingress configuration

### New Structure (kubernetes/infrastructure/)
- Base/overlay pattern with Kustomize
- Environment-specific overlays
- Automated secret generation from .env files
- Production and staging configurations
- Automated CI/CD pipeline
- Built-in validation and rollback

## Migration Steps

### 1. Backup Current State

```bash
# Export current deployments
kubectl get deployments -n okiru-pro -o yaml > backup/deployments-backup.yaml

# Export current services
kubectl get services -n okiru-pro -o yaml > backup/services-backup.yaml

# Export current secrets (be careful with sensitive data)
kubectl get secrets -n okiru-pro -o yaml > backup/secrets-backup.yaml
```

### 2. Prepare Environment Variables

Create `.env.production` from your existing secrets:

```bash
# Extract existing secrets (if using the old structure)
kubectl get secret mongodb-credentials -n okiru-pro -o jsonpath='{.data.MONGO_INITDB_ROOT_USERNAME}' | base64 -d
# ... repeat for all secrets

# Create .env.production based on .env.production.example
cp .env.production.example .env.production
# Edit and fill in all values
```

### 3. Create Secrets in New Namespace

```bash
cd kubernetes/infrastructure

# Create secrets from .env.production
./scripts/create-secrets-from-env.sh \
  --env-file ../../.env.production \
  --namespace okiru-pro-prod \
  --apply
```

### 4. Deploy to New Infrastructure

```bash
# Test with dry-run first
kubectl apply -k overlays/prod --dry-run=client

# Deploy to production
./scripts/deploy.sh prod --skip-build --skip-push

# Or manually with kustomize
kubectl apply -k overlays/prod
```

### 5. Validate Deployment

```bash
./scripts/validate-deployment.sh --namespace okiru-pro-prod --verbose
```

### 6. Switch Traffic (Blue-Green)

Option 1: Update DNS
- Point `dilm.172.171.47.94.nip.io` to new ingress IP
- Gradually shift traffic

Option 2: Update existing ingress
- Modify old ingress to point to new services
- Or use service selector update

### 7. Cleanup Old Resources

Once validated:

```bash
# Delete old deployments in okiru-pro namespace
kubectl delete deployment api web compute -n okiru-pro

# Optionally delete old namespace after full validation
# kubectl delete namespace okiru-pro
```

## Configuration Mapping

### Old Manifests → New Structure

| Old File | New Location | Notes |
|----------|-------------|-------|
| `deploy/k8s/01-namespace.yaml` | `base/namespace.yaml` | Simplified |
| `deploy/k8s/03-secrets.yaml` | Generated from .env | Automated creation |
| `deploy/k8s/04-configmap.yaml` | `base/configmaps/*.yaml` | Split per service |
| `deploy/k8s/08-deployment-mongodb.yaml` | `base/deployments/mongodb.yaml` | Enhanced probes |
| `deploy/k8s/11-deployment-api.yaml` | `base/deployments/api.yaml` | + init containers |
| `deploy/k8s/12-deployment-web.yaml` | `base/deployments/web.yaml` | Enhanced |
| `deploy/k8s/13-deployment-compute.yaml` | `base/deployments/compute.yaml` | Enhanced |
| `deploy/k8s/14-services.yaml` | `base/services/services.yaml` | Combined |
| `deploy/k8s/15-cluster-issuer.yaml` | `cert-manager/cluster-issuer.yaml` | + Certificate |
| `deploy/k8s/16-ingress.yaml` | `base/ingress/ingress.yaml` | + TLS patch in overlay |
| `deploy/k8s/17-hpa.yaml` | `base/deployments/hpa.yaml` | + staging patches |

### Image Tag Updates

Old:
```yaml
image: okiruproacrde4d539b.azurecr.io/okiru-pro/api:latest
```

New:
```yaml
# Kustomize handles image tags
images:
  - name: okiruproacrde4d539b.azurecr.io/okiru-pro/api
    newTag: ${GITHUB_SHA}  # Set by CI/CD
```

## Environment Differences

### Production (overlays/prod/)
- Higher resource limits
- More replicas (3+ for api/web)
- TLS enabled with cert-manager
- Stricter CORS settings
- Higher rate limits

### Staging (overlays/staging/)
- Lower resource limits
- Single replica for cost savings
- HTTP only (no TLS enforcement)
- Permissive CORS
- Lower rate limits

## GitHub Actions Migration

### Old Workflow
- Trigger: Push to main
- Action: SSH to VM and deploy

### New Workflow (.github/workflows/deploy-prod.yml)
- Trigger: Push to main or manual
- Action:
  1. Build images with commit SHA
  2. Push to ACR
  3. Create secrets from GitHub Secrets
  4. Deploy with Kustomize
  5. Run smoke tests
  6. Auto-rollback on failure

### Required Actions
1. Add new GitHub Secrets (see README.md)
2. Update repository settings
3. Test workflow on staging first

## Verification Checklist

- [ ] All secrets migrated to new namespace
- [ ] ConfigMaps have correct values
- [ ] PVCs created and bound
- [ ] Services have endpoints
- [ ] Ingress rules working
- [ ] TLS certificates valid
- [ ] HPA functioning
- [ ] Health checks passing
- [ ] Smoke tests successful
- [ ] Rollback tested
- [ ] Monitoring configured
- [ ] Logs accessible

## Rollback Plan

If migration fails:

```bash
# Immediate rollback
kubectl rollout undo deployment/api -n okiru-pro-prod
kubectl rollout undo deployment/web -n okiru-pro-prod
kubectl rollout undo deployment/compute -n okiru-pro-prod

# Or restore from backup
kubectl apply -f backup/deployments-backup.yaml

# Switch DNS back if needed
```

## Support

For migration issues:
1. Check `kubectl get events -n okiru-pro-prod --sort-by='.lastTimestamp'`
2. Review pod logs
3. Validate secret values
4. Check resource quotas
