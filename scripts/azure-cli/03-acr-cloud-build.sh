#!/bin/bash
set -euo pipefail

#######################################
# Cloud-based build using Azure ACR Tasks
# No local Docker needed - builds run in Azure
#######################################

ACR_NAME="okiruproacrde4d539b"
IMAGE_TAG="${1:-$(git rev-parse --short HEAD)-$(date +%Y%m%d-%H%M%S)}"
REGISTRY="${ACR_NAME}.azurecr.io"
REPO_PREFIX="okiru-pro"

echo "=== Azure ACR Cloud Build ==="
echo "Registry: $REGISTRY"
echo "Image Tag: $IMAGE_TAG"
echo ""

# Ensure logged in
echo "Checking Azure login..."
az account show --query name -o tsv

# Clean up old images first
echo ""
echo "=== Cleaning up old 'latest' tags ==="
for repo in web api compute; do
    echo "Removing $REPO_PREFIX/$repo:latest..."
    az acr repository untag --name "$ACR_NAME" --image "$REPO_PREFIX/$repo:latest" --yes 2>/dev/null || echo "  (not found)"
done

# Build web image (uses monorepo context)
echo ""
echo "=== Building Web Image (Cloud) ==="
echo "This runs in Azure, no local Docker needed..."
az acr build \
    --registry "$ACR_NAME" \
    --image "$REPO_PREFIX/web:$IMAGE_TAG" \
    --image "$REPO_PREFIX/web:latest" \
    --file apps/web/Dockerfile \
    --timeout 600 \
    .

# Build API image
echo ""
echo "=== Building API Image (Cloud) ==="
# API Dockerfile expects monorepo root (root package.json, packages/types, etc.)
az acr build \
    --registry "$ACR_NAME" \
    --image "$REPO_PREFIX/api:$IMAGE_TAG" \
    --image "$REPO_PREFIX/api:latest" \
    --file apps/api/Dockerfile \
    --timeout 600 \
    .

# Build Compute image
echo ""
echo "=== Building Compute Image (Cloud) ==="
az acr build \
    --registry "$ACR_NAME" \
    --image "$REPO_PREFIX/compute:$IMAGE_TAG" \
    --image "$REPO_PREFIX/compute:latest" \
    --file apps/Computation-Engine/Dockerfile \
    --timeout 600 \
    ./apps/Computation-Engine

echo ""
echo "=== Build Complete ==="
echo "Image Tag: $IMAGE_TAG"
echo ""
echo "Next step: Run deploy script"
echo "  ./04-deploy-aks.sh $IMAGE_TAG"
