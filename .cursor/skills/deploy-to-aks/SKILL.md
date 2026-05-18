---
name: deploy-to-aks
description: >-
  Build Docker images, push to Azure Container Registry, update Kustomize
  overlays, and deploy to AKS. Use when the user asks to deploy, release,
  push a new build, update images, or roll out changes to production.
---

# Deploy to AKS

End-to-end workflow for shipping a new build of Okiru Pro (api, web, compute)
to the production AKS cluster.

## Prerequisites

- Azure CLI (`az`) authenticated with ACR push permissions
- `kubectl` pointing at the correct AKS context (verify with `kubectl config current-context`)
- PowerShell on Windows (commands below use PowerShell syntax)

## 1. Pick a Tag

Generate a tag from the current short SHA and timestamp:

```powershell
$sha = (git rev-parse --short=8 HEAD)
$ts  = (Get-Date -Format "yyyyMMddHHmm")
$tag = "$sha-$ts"            # e.g. d44e4952-202605071721
```

## 2. Build and Push Images to ACR

Registry: `okiruproacrde4d539b.azurecr.io`
Image path pattern: `okiruproacrde4d539b.azurecr.io/okiru-pro/<service>:<tag>`

Build each service from the repo root. **Note:** the compute Dockerfile
expects its own directory as the build context (not the repo root).

```powershell
# api and web — build context is repo root
az acr build --registry okiruproacrde4d539b `
  --image okiru-pro/api:$tag `
  --file apps/api/Dockerfile .

az acr build --registry okiruproacrde4d539b `
  --image okiru-pro/web:$tag `
  --file apps/web/Dockerfile .

# compute — build context is apps/Computation-Engine/
az acr build --registry okiruproacrde4d539b `
  --image okiru-pro/compute:$tag `
  --file apps/Computation-Engine/Dockerfile `
  apps/Computation-Engine
```

**Windows encoding caveat:** if log streaming breaks encoding, append
`--no-logs` to each `az acr build` command and confirm success from the
exit code (`$LASTEXITCODE -eq 0`) or the Azure portal.

## 3. Pin the Tag in Kustomize (prod overlay)

Edit `kubernetes/infrastructure/overlays/prod/kustomization.yaml` — set
`newTag` to the new tag for all three images under the `images:` block:

```yaml
images:
- name: okiruproacrde4d539b.azurecr.io/okiru-pro/api
  newTag: "<tag>"
- name: okiruproacrde4d539b.azurecr.io/okiru-pro/compute
  newTag: "<tag>"
- name: okiruproacrde4d539b.azurecr.io/okiru-pro/web
  newTag: "<tag>"
```

## 4. Apply to the Cluster

From `kubernetes/infrastructure`, render and apply the prod overlay:

```powershell
Set-Location kubernetes/infrastructure
kubectl kustomize overlays/prod | kubectl apply -f -
```

## 5. Roll Pods (optional — forces fresh replicas immediately)

```powershell
kubectl rollout restart deployment/api deployment/web deployment/compute -n okiru-pro

kubectl rollout status deployment/api     -n okiru-pro --timeout=300s
kubectl rollout status deployment/web     -n okiru-pro --timeout=300s
kubectl rollout status deployment/compute -n okiru-pro --timeout=120s
```

## 6. Verify

```powershell
kubectl get pods -n okiru-pro -l app=api
kubectl get pods -n okiru-pro -l app=web
```

Confirm each pod's image includes the new tag. Then check the health
endpoint:

```
https://okiru.pro/health  → expect 200
```

## Caveats

- **compute CrashLoopBackOff with Arango HTTP 401**: this is a cluster
  secrets / ArangoDB user-permissions issue, not fixed by bumping the image
  alone.

## Optional: Commit the Overlay

After a successful deploy, commit the updated `kustomization.yaml` so git
matches what is live:

```powershell
git add kubernetes/infrastructure/overlays/prod/kustomization.yaml
git commit -m "chore(deploy): pin images to $tag"
```
