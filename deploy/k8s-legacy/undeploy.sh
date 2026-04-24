#!/bin/bash
# Cleanup script for OKIru Pro on AKS
# Usage: ./undeploy.sh [--include-volumes]

set -e

NAMESPACE="okiru-pro"
DELETE_VOLUMES=false

# Parse arguments
if [ "$1" = "--include-volumes" ]; then
    DELETE_VOLUMES=true
fi

echo "=========================================="
echo "Removing OKIru Pro from AKS"
echo "Namespace: $NAMESPACE"
echo "Delete volumes: $DELETE_VOLUMES"
echo "=========================================="

# Warning
echo ""
echo "WARNING: This will delete all resources in the $NAMESPACE namespace!"
if [ "$DELETE_VOLUMES" = true ]; then
    echo "WARNING: PVCs will be deleted and DATA WILL BE LOST!"
fi
echo ""
read -p "Are you sure? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

# Delete deployments first (graceful shutdown)
echo "Deleting application deployments..."
kubectl delete deployment api web compute -n $NAMESPACE --ignore-not-found=true

echo "Deleting database deployments..."
kubectl delete deployment mongodb arangodb redis -n $NAMESPACE --ignore-not-found=true

# Wait for pods to terminate
echo "Waiting for pods to terminate..."
sleep 10

# Delete services
echo "Deleting services..."
kubectl delete -f 14-services.yaml --ignore-not-found=true

# Delete ingress
echo "Deleting ingress..."
kubectl delete -f 16-ingress.yaml --ignore-not-found=true

# Delete HPA
echo "Deleting horizontal pod autoscalers..."
kubectl delete -f 17-hpa.yaml --ignore-not-found=true

# Delete PVCs if requested
if [ "$DELETE_VOLUMES" = true ]; then
    echo "Deleting persistent volume claims (DATA WILL BE LOST)..."
    kubectl delete -f 05-pvc-mongodb.yaml --ignore-not-found=true
    kubectl delete -f 06-pvc-arangodb.yaml --ignore-not-found=true
    kubectl delete -f 07-pvc-redis.yaml --ignore-not-found=true
fi

# Delete namespace (removes all remaining resources)
echo "Deleting namespace..."
kubectl delete namespace $NAMESPACE --ignore-not-found=true

echo ""
echo "=========================================="
echo "Cleanup Complete!"
echo "=========================================="

if [ "$DELETE_VOLUMES" = false ]; then
    echo ""
    echo "Note: PVCs were preserved. To delete them and lose data, run:"
    echo "  ./undeploy.sh --include-volumes"
fi
