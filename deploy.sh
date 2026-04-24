#!/usr/bin/env bash
set -euo pipefail

ACR_NAME="okiruproacrde4d539b"
ACR_LOGIN="${ACR_NAME}.azurecr.io"
VERSION="${VERSION:-v1.0.26}"
NAMESPACE="okiru-pro"
KUBECONFIG_FILE="${KUBECONFIG_FILE:-$(pwd)/kubeconfig.yaml}"

cyan()   { printf "\033[36m%s\033[0m\n" "$1"; }
green()  { printf "\033[32m%s\033[0m\n" "$1"; }
yellow() { printf "\033[33m%s\033[0m\n" "$1"; }
red()    { printf "\033[31m%s\033[0m\n" "$1"; }

cyan "=== Okiru Pro Deployment (${VERSION}) ==="

# --- 1. Azure login check ---
yellow "Checking Azure login..."
if ! az account show --query name -o tsv >/dev/null 2>&1; then
  red "Not logged into Azure. Run: az login --use-device-code"
  exit 1
fi
green "Logged in as: $(az account show --query name -o tsv)"

# --- 2. Kubernetes connectivity ---
yellow "Checking Kubernetes connectivity..."
export KUBECONFIG="$KUBECONFIG_FILE"
if ! kubectl get nodes -o name >/dev/null 2>&1; then
  red "Cannot connect to AKS. Run: az aks get-credentials --resource-group <RG> --name <AKS> --file $KUBECONFIG_FILE"
  exit 1
fi
green "Connected: $(kubectl get nodes -o name | tr '\n' ' ')"

# --- 3. Build images in ACR (cloud build, no local Docker needed) ---
cyan ""
cyan "=== Building Web Image (5-10 min) ==="
az acr build --registry "$ACR_NAME" \
  --image "okiru-pro/web:${VERSION}" \
  --image "okiru-pro/web:latest" \
  --file apps/web/Dockerfile . --timeout 3600
green "Web build complete!"

cyan ""
cyan "=== Building API Image (5-10 min) ==="
az acr build --registry "$ACR_NAME" \
  --image "okiru-pro/api:${VERSION}" \
  --image "okiru-pro/api:latest" \
  --file apps/api/Dockerfile . --timeout 3600
green "API build complete!"

# --- 4. Roll out to AKS ---
cyan ""
cyan "=== Updating Kubernetes deployments ==="
kubectl set image deployment/web "web=${ACR_LOGIN}/okiru-pro/web:${VERSION}" -n "$NAMESPACE"
kubectl set image deployment/api "api=${ACR_LOGIN}/okiru-pro/api:${VERSION}" -n "$NAMESPACE"

yellow "Waiting for web rollout..."
kubectl rollout status deployment/web -n "$NAMESPACE" --timeout=300s
yellow "Waiting for api rollout..."
kubectl rollout status deployment/api -n "$NAMESPACE" --timeout=300s

# --- 5. Show pods + smoke test ---
cyan ""
cyan "=== Pods ==="
kubectl get pods -n "$NAMESPACE" -o wide

cyan ""
cyan "=== Health check ==="
HEALTH_URL="${HEALTH_URL:-https://okiru.20.164.101.114.nip.io/api/health}"
if curl -fsS --max-time 30 "$HEALTH_URL" >/dev/null; then
  green "Health endpoint OK: $HEALTH_URL"
else
  red "Health endpoint failed: $HEALTH_URL"
fi

# --- 6. Git tag ---
if git tag -a "$VERSION" -m "Release ${VERSION}" 2>/dev/null; then
  green "Tagged: $VERSION"
else
  yellow "Tag $VERSION already exists, skipping"
fi

green ""
green "=== Deployment complete (${VERSION}) ==="
green ""
green "Verify SEO routes on production:"
green "  curl https://okiru.pro/sitemap.xml"
green "  curl https://okiru.pro/robots.txt"
green "  curl https://okiru.pro/googlea288ba49cef187fc.html"
