#!/bin/bash
set -euo pipefail

#######################################
# Azure Container Registry Cleanup Script
# Deletes old/broken images and untagged manifests
#######################################

# Configuration
ACR_NAME="okiruproacrde4d539b"
REPOSITORIES=("okiru-pro/web" "okiru-pro/api" "okiru-pro/compute")
RETENTION_DAYS=7

echo "=== ACR Cleanup Script ==="
echo "Registry: $ACR_NAME"
echo "Repositories: ${REPOSITORIES[*]}"
echo ""

# Login to Azure (uncomment if not already logged in)
# az login
# az account set --subscription "your-subscription-id"

# Login to ACR
echo "Logging into ACR..."
az acr login --name "$ACR_NAME"

echo ""
echo "=== Current Image Inventory ==="
for repo in "${REPOSITORIES[@]}"; do
    echo "Repository: $repo"
    az acr repository show-tags --name "$ACR_NAME" --repository "$repo" --output table || true
    echo ""
done

# Delete 'latest' tag from all repositories (force rebuild)
echo "=== Deleting 'latest' tags (will force rebuild) ==="
for repo in "${REPOSITORIES[@]}"; do
    echo "Deleting latest tag from $repo..."
    az acr repository untag --name "$ACR_NAME" --image "$repo:latest" --yes || true
done

# Delete untagged manifests (dangling images)
echo ""
echo "=== Cleaning up untagged/dangling manifests ==="
for repo in "${REPOSITORIES[@]}"; do
    echo "Checking for untagged manifests in $repo..."
    UNTAGGED=$(az acr manifest list-metadata --name "$ACR_NAME" --repository "$repo" \
        --query "[?tags==null].digest" --output tsv 2>/dev/null || true)

    if [ -n "$UNTAGGED" ]; then
        for digest in $UNTAGGED; do
            echo "  Deleting untagged manifest: $digest"
            az acr repository delete --name "$ACR_NAME" --image "$repo@$digest" --yes || true
        done
    else
        echo "  No untagged manifests found"
    fi
done

# Delete old images (older than RETENTION_DAYS)
echo ""
echo "=== Cleaning up images older than $RETENTION_DAYS days ==="
CUTOFF_DATE=$(date -u -d "-$RETENTION_DAYS days" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -v-${RETENTION_DAYS}d -u +%Y-%m-%dT%H:%M:%SZ)

for repo in "${REPOSITORIES[@]}"; do
    echo "Checking $repo for old images..."

    # Get all manifests older than cutoff date, excluding 'latest' if it exists
    OLD_MANIFESTS=$(az acr manifest list-metadata --name "$ACR_NAME" --repository "$repo" \
        --query "[?lastUpdateTime < '$CUTOFF_DATE' && tags[0] != 'latest'].digest" \
        --output tsv 2>/dev/null || true)

    if [ -n "$OLD_MANIFESTS" ]; then
        for digest in $OLD_MANIFESTS; do
            echo "  Deleting old manifest: $digest"
            az acr repository delete --name "$ACR_NAME" --image "$repo@$digest" --yes || true
        done
    else
        echo "  No old images to cleanup"
    fi
done

echo ""
echo "=== Cleanup Complete ==="
echo "Final image inventory:"
for repo in "${REPOSITORIES[@]}"; do
    echo "Repository: $repo"
    az acr repository show-tags --name "$ACR_NAME" --repository "$repo" --output table || true
    echo ""
done
