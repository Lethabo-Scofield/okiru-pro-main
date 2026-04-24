#!/bin/bash
set -euo pipefail

#######################################
# Deploy to AKS using kubectl
# No local Docker needed
#######################################

IMAGE_TAG="${1:-latest}"
NAMESPACE="${2:-okiru-pro}"
ACR_NAME="okiruproacrde4d539b"
REGISTRY="${ACR_NAME}.azurecr.io"
ENVIRONMENT="prod"
KUSTOMIZE_PATH="kubernetes/infrastructure/overlays/$ENVIRONMENT"

echo "=== Deploy to AKS ==="
echo "Image Tag: $IMAGE_TAG"
echo "Namespace: $NAMESPACE"
echo "Kustomize: $KUSTOMIZE_PATH"
echo ""

# Verify kubectl
echo "Verifying kubectl..."
kubectl get nodes
echo ""

# Ensure namespace exists
echo "Ensuring namespace..."
kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl apply -f -

# Build full image refs
API_IMAGE="$REGISTRY/okiru-pro/api:$IMAGE_TAG"
WEB_IMAGE="$REGISTRY/okiru-pro/web:$IMAGE_TAG"
COMPUTE_IMAGE="$REGISTRY/okiru-pro/compute:$IMAGE_TAG"

echo "Images:"
echo "  API:     $API_IMAGE"
echo "  Web:     $WEB_IMAGE"
echo "  Compute: $COMPUTE_IMAGE"
echo ""

# Update kustomization
echo "=== Updating Kustomize ==="
cd "$KUSTOMIZE_PATH"

# Check if kustomize is available
if command -v kustomize &> /dev/null; then
    kustomize edit set image "$REGISTRY/okiru-pro/api=$API_IMAGE"
    kustomize edit set image "$REGISTRY/okiru-pro/web=$WEB_IMAGE"
    kustomize edit set image "$REGISTRY/okiru-pro/compute=$COMPUTE_IMAGE"
else
    echo "Using sed fallback..."
    sed -i "s/newTag: .*/newTag: $IMAGE_TAG/" kustomization.yaml
fi

echo "Updated kustomization.yaml"

# Build and apply
echo ""
echo "=== Applying Manifests ==="
if command -v kustomize &> /dev/null; then
    kustomize build . | kubectl apply -f -
else
    kubectl kustomize . | kubectl apply -f -
fi

# Wait for rollout
echo ""
echo "=== Waiting for Rollout ==="
kubectl rollout status deployment/api -n "$NAMESPACE" --timeout=300s
kubectl rollout status deployment/web -n "$NAMESPACE" --timeout=300s
kubectl rollout status deployment/compute -n "$NAMESPACE" --timeout=300s

# Restart to ensure new images are pulled
echo ""
echo "=== Restarting Deployments ==="
kubectl rollout restart deployment/api -n "$NAMESPACE"
kubectl rollout restart deployment/web -n "$NAMESPACE"
kubectl rollout restart deployment/compute -n "$NAMESPACE"

# Wait for restart
echo ""
echo "Waiting for pods..."
sleep 10
kubectl rollout status deployment/api -n "$NAMESPACE" --timeout=300s
kubectl rollout status deployment/web -n "$NAMESPACE" --timeout=300s
kubectl rollout status deployment/compute -n "$NAMESPACE" --timeout=300s

echo ""
echo "=== Deployment Complete ==="
kubectl get pods -n "$NAMESPACE" -o wide

echo ""
echo "Test URL: https://okiru.20.164.101.114.nip.io"
echo "Check logs: kubectl logs -n $NAMESPACE deployment/web"
