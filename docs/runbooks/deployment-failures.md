# Runbook: Deployment Failures

## Symptoms

- GitHub Actions workflow failing at deploy step
- `kubectl rollout status` timing out
- Pods stuck in `CrashLoopBackOff` or `ImagePullBackOff`
- New pods not starting after deployment

## Immediate Checks

```bash
# Check pod status
kubectl get pods -n okiru-pro

# Check deployment status
kubectl get deployments -n okiru-pro

# Check recent events
kubectl get events -n okiru-pro --sort-by=.metadata.creationTimestamp | tail -30

# Check rollout status
kubectl rollout status deployment/api -n okiru-pro --timeout=10s
```

## Common Causes and Fixes

### 1. Image Pull Failures (ImagePullBackOff)

```bash
# Check pod details
kubectl describe pod -n okiru-pro -l app=api

# Look for: "Failed to pull image", "unauthorized"

# Verify ACR pull secret exists
kubectl get secret acr-pull-secret -n okiru-pro

# Regenerate if needed
kubectl create secret docker-registry acr-pull-secret \
  --namespace=okiru-pro \
  --docker-server=okiruproacrde4d539b.azurecr.io \
  --docker-username=USERNAME \
  --docker-password=PASSWORD \
  --dry-run=client -o yaml | kubectl apply -f -

# Check if image tag exists
az acr repository show-tags \
  --name okiruproacrde4d539b \
  --repository okiru-pro/api \
  --orderby time_desc \
  --top 5
```

### 2. CrashLoopBackOff

```bash
# Check pod logs
kubectl logs -n okiru-pro -l app=api --previous

# Common causes:
# - Missing environment variables
# - Database connection failure
# - Out of memory (OOMKilled)

# Check if required secrets exist
kubectl get secrets -n okiru-pro | grep -E "(mongodb|arangodb|redis|session)"

# Check resource limits
kubectl describe pod -n okiru-pro -l app=api | grep -A5 "Resources"

# If OOMKilled, increase memory limit in patch:
# Edit: kubernetes/infrastructure/overlays/prod/patches/resource-limits.yaml
```

### 3. Rolling Update Stuck

```bash
# Check rollout history
kubectl rollout history deployment/api -n okiru-pro

# View rollout status details
kubectl get rs -n okiru-pro -l app=api

# If stuck, rollback to previous version
kubectl rollout undo deployment/api -n okiru-pro

# Or restart rollout
kubectl rollout restart deployment/api -n okiru-pro
```

### 4. Kustomize Build Failures

```bash
# Test Kustomize build locally
cd kubernetes/infrastructure

# For production
kubectl kustomize overlays/prod

# For staging
kubectl kustomize overlays/staging

# Check for duplicate resources (common error)
kubectl kustomize overlays/prod 2>&1 | grep -i "error"
```

## Recovery Procedures

### Manual Rollback

```bash
# Undo last rollout
kubectl rollout undo deployment/api -n okiru-pro
kubectl rollout undo deployment/web -n okiru-pro
kubectl rollout undo deployment/compute -n okiru-pro

# Wait for rollback to complete
kubectl rollout status deployment/api -n okiru-pro
kubectl rollout status deployment/web -n okiru-pro
kubectl rollout status deployment/compute -n okiru-pro
```

### Scale Down and Up

```bash
# Emergency scale down
kubectl scale deployment api --replicas=0 -n okiru-pro
kubectl scale deployment web --replicas=0 -n okiru-pro
kubectl scale deployment compute --replicas=0 -n okiru-pro

# Scale back up
kubectl scale deployment api --replicas=2 -n okiru-pro
kubectl scale deployment web --replicas=2 -n okiru-pro
kubectl scale deployment compute --replicas=1 -n okiru-pro
```

### Redeploy from Known Good Version

```bash
# Deploy specific image tag
kubectl set image deployment/api \
  api=okiruproacrde4d539b.azurecr.io/okiru-pro/api:5dc2624 \
  -n okiru-pro

kubectl set image deployment/web \
  web=okiruproacrde4d539b.azurecr.io/okiru-pro/web:5dc2624 \
  -n okiru-pro

kubectl set image deployment/compute \
  compute=okiruproacrde4d539b.azurecr.io/okiru-pro/compute:5dc2624 \
  -n okiru-pro
```

## GitHub Actions Troubleshooting

```bash
# If workflow fails during kustomize step:

# 1. Verify kustomization.yaml syntax
cd kubernetes/infrastructure/overlays/prod
kustomize edit list resource

# 2. Check if secrets are properly templated
cat secrets/secrets.yaml | grep -E "^\s+[A-Z_]+:" | head -10

# 3. Ensure base builds without secrets
kubectl kustomize ../../base
```

## Prevention

1. **Always validate Kustomize in PRs**: The `kustomize-validate.yml` workflow should pass
2. **Use immutable image tags**: Avoid `:latest` in production
3. **Test in staging first**: Deploy to staging before production
4. **Set proper resource limits**: Prevent OOMKills
5. **Enable PDBs**: Ensure rolling updates don't cause downtime

## Escalation

If issues persist:

1. Check AKS cluster health in Azure Portal
2. Verify ACR quota and health
3. Check Azure Service Health for regional issues
4. Review GitHub Actions runner logs for build failures
