#!/bin/bash
# Deployment script for OKIru Pro on AKS
# Usage: ./deploy.sh [environment]

set -e

ENVIRONMENT=${1:-production}
NAMESPACE="okiru-pro"

echo "=========================================="
echo "Deploying OKIru Pro to AKS"
echo "Environment: $ENVIRONMENT"
echo "Namespace: $NAMESPACE"
echo "=========================================="

# Check prerequisites
echo "Checking prerequisites..."
command -v kubectl >/dev/null 2>&1 || { echo "kubectl is required but not installed. Aborting." >&2; exit 1; }
command -v helm >/dev/null 2>&1 || { echo "helm is required but not installed. Aborting." >&2; exit 1; }

# Verify connection to cluster
echo "Verifying cluster connection..."
kubectl cluster-info || { echo "Cannot connect to cluster. Aborting." >&2; exit 1; }

# Create namespace
echo "Creating namespace..."
kubectl apply -f 01-namespace.yaml

# Check if secrets exist
if ! kubectl get secret mongodb-credentials -n $NAMESPACE >/dev/null 2>&1; then
    echo ""
    echo "WARNING: Secrets not found!"
    echo "Please edit 03-secrets.yaml with your actual values and run:"
    echo "  kubectl apply -f 03-secrets.yaml"
    echo ""
    read -p "Press enter to continue after applying secrets..."
fi

# Check if ACR pull secret exists
if ! kubectl get secret acr-pull-secret -n $NAMESPACE >/dev/null 2>&1; then
    echo ""
    echo "WARNING: ACR pull secret not found!"
    echo "Please create it with:"
    echo "  kubectl create secret docker-registry acr-pull-secret \\"
    echo "    --namespace $NAMESPACE \\"
    echo "    --docker-server=yourregistry.azurecr.io \\"
    echo "    --docker-username=USERNAME \\"
    echo "    --docker-password=PASSWORD"
    echo ""
    read -p "Press enter to continue after creating pull secret..."
fi

# Apply configurations
echo "Applying storage classes..."
kubectl apply -f 02-storage-classes.yaml

echo "Applying config maps..."
kubectl apply -f 04-configmap.yaml

echo "Applying persistent volume claims..."
kubectl apply -f 05-pvc-mongodb.yaml
kubectl apply -f 06-pvc-arangodb.yaml
kubectl apply -f 07-pvc-redis.yaml

echo "Applying database deployments..."
kubectl apply -f 08-deployment-mongodb.yaml
kubectl apply -f 09-deployment-arangodb.yaml
kubectl apply -f 10-deployment-redis.yaml

echo "Waiting for databases to be ready..."
kubectl wait --for=condition=ready pod -l app=mongodb -n $NAMESPACE --timeout=180s || echo "MongoDB not ready yet"
kubectl wait --for=condition=ready pod -l app=arangodb -n $NAMESPACE --timeout=180s || echo "ArangoDB not ready yet"
kubectl wait --for=condition=ready pod -l app=redis -n $NAMESPACE --timeout=180s || echo "Redis not ready yet"

echo "Applying application deployments..."
kubectl apply -f 11-deployment-api.yaml
kubectl apply -f 12-deployment-web.yaml
kubectl apply -f 13-deployment-compute.yaml

echo "Applying services..."
kubectl apply -f 14-services.yaml

echo "Applying cluster issuer..."
kubectl apply -f 15-cluster-issuer.yaml

echo "Applying ingress..."
kubectl apply -f 16-ingress.yaml

echo "Applying horizontal pod autoscalers..."
kubectl apply -f 17-hpa.yaml

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Checking pod status..."
kubectl get pods -n $NAMESPACE

echo ""
echo "Services:"
kubectl get svc -n $NAMESPACE

echo ""
echo "Ingress:"
kubectl get ingress -n $NAMESPACE

echo ""
echo "Next steps:"
echo "1. Check pod status: kubectl get pods -n $NAMESPACE"
echo "2. Check logs: kubectl logs -f deployment/api -n $NAMESPACE"
echo "3. Check SSL certificate: kubectl get certificates -n $NAMESPACE"
echo "4. Get ingress IP: kubectl get svc ingress-nginx-controller -n ingress-nginx"
