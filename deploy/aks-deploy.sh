#!/bin/bash
# Azure Kubernetes Service (AKS) Deployment Script for Okiru Pro
# This script automates the entire deployment process

set -e  # Exit on any error

# Configuration - EDIT THESE VARIABLES
RESOURCE_GROUP="okiru-pro-rg"
AKS_CLUSTER_NAME="okiru-pro-aks"
ACR_NAME="okiruproacr$(openssl rand -hex 4)"  # Auto-generated unique name
LOCATION="southafricanorth"  # Closest Azure region to South Africa
DNS_ZONE="okiru-pro.com"  # Your domain or Azure-provided domain

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    command -v az > /dev/null 2>&1 || { log_error "Azure CLI (az) not installed. Install from: https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"; exit 1; }
    command -v kubectl > /dev/null 2>&1 || { log_error "kubectl not installed. Install from: https://kubernetes.io/docs/tasks/tools/"; exit 1; }
    command -v helm > /dev/null 2>&1 || { log_error "Helm not installed. Install from: https://helm.sh/docs/intro/install/"; exit 1; }
    
    # Check Azure login
    az account show > /dev/null 2>&1 || { log_error "Not logged into Azure. Run: az login"; exit 1; }
    
    log_info "All prerequisites satisfied!"
}

# Create Resource Group
create_resource_group() {
    log_info "Creating Resource Group: $RESOURCE_GROUP..."
    az group create \
        --name $RESOURCE_GROUP \
        --location $LOCATION \
        --output table
    log_info "Resource Group created!"
}

# Create Azure Container Registry (ACR)
create_acr() {
    log_info "Creating Azure Container Registry: $ACR_NAME..."
    az acr create \
        --resource-group $RESOURCE_GROUP \
        --name $ACR_NAME \
        --sku Basic \
        --location $LOCATION \
        --admin-enabled true \
        --output table
    
    # Get ACR credentials
    ACR_USERNAME=$(az acr credential show --name $ACR_NAME --resource-group $RESOURCE_GROUP --query "username" -o tsv)
    ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --resource-group $RESOURCE_GROUP --query "passwords[0].value" -o tsv)
    
    log_info "ACR Created!"
    log_info "ACR Login Server: ${ACR_NAME}.azurecr.io"
    echo "ACR_NAME=$ACR_NAME" > .aks_env
    echo "ACR_USERNAME=$ACR_USERNAME" >> .aks_env
    echo "ACR_PASSWORD=$ACR_PASSWORD" >> .aks_env
}

# Create AKS Cluster
create_aks() {
    log_info "Creating AKS Cluster: $AKS_CLUSTER_NAME..."
    log_warn "This may take 10-15 minutes..."
    
    az aks create \
        --resource-group $RESOURCE_GROUP \
        --name $AKS_CLUSTER_NAME \
        --node-count 1 \
        --node-vm-size Standard_B4ms_v2 \
        --enable-cluster-autoscaler \
        --min-count 1 \
        --max-count 2 \
        --enable-managed-identity \
        --attach-acr $ACR_NAME \
        --generate-ssh-keys \
        --location $LOCATION \
        --output table
    
    echo "AKS_CLUSTER_NAME=$AKS_CLUSTER_NAME" >> .aks_env
    echo "RESOURCE_GROUP=$RESOURCE_GROUP" >> .aks_env
    log_info "AKS Cluster created!"
}

# Connect to AKS
connect_aks() {
    log_info "Connecting to AKS cluster..."
    az aks get-credentials \
        --resource-group $RESOURCE_GROUP \
        --name $AKS_CLUSTER_NAME \
        --overwrite-existing
    
    kubectl get nodes
    log_info "Connected to AKS!"
}

# Install NGINX Ingress Controller
install_ingress() {
    log_info "Installing NGINX Ingress Controller..."
    
    helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
    helm repo update
    
    helm install ingress-nginx ingress-nginx/ingress-nginx \
        --namespace ingress-nginx \
        --create-namespace \
        --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz \
        --set controller.replicaCount=2 \
        --wait
    
    log_info "NGINX Ingress Controller installed!"
}

# Install cert-manager
install_cert_manager() {
    log_info "Installing cert-manager..."
    
    helm repo add jetstack https://charts.jetstack.io
    helm repo update
    
    helm install cert-manager jetstack/cert-manager \
        --namespace cert-manager \
        --create-namespace \
        --set installCRDs=true \
        --wait
    
    log_info "cert-manager installed!"
}

# Wait for external IP
wait_for_external_ip() {
    log_info "Waiting for external IP..."
    
    for i in {1..30}; do
        EXTERNAL_IP=$(kubectl get svc ingress-nginx-controller -n ingress-nginx -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
        if [ ! -z "$EXTERNAL_IP" ]; then
            log_info "External IP assigned: $EXTERNAL_IP"
            echo "EXTERNAL_IP=$EXTERNAL_IP" >> .aks_env
            return
        fi
        echo -n "."
        sleep 10
    done
    
    log_warn "External IP not assigned yet. Check with: kubectl get svc -n ingress-nginx"
}

# Build and push Docker images
build_and_push_images() {
    log_info "Building and pushing Docker images..."
    
    source .aks_env
    
    # Login to ACR
    az acr login --name $ACR_NAME
    
    ACR_LOGIN_SERVER="${ACR_NAME}.azurecr.io"
    
    # Build API image
    log_info "Building API image..."
    docker build -t $ACR_LOGIN_SERVER/okiru-pro/api:latest -f apps/api/Dockerfile .
    docker push $ACR_LOGIN_SERVER/okiru-pro/api:latest
    
    # Build Web image
    log_info "Building Web image..."
    docker build -t $ACR_LOGIN_SERVER/okiru-pro/web:latest -f apps/web/Dockerfile .
    docker push $ACR_LOGIN_SERVER/okiru-pro/web:latest
    
    # Build Compute image
    log_info "Building Compute image..."
    docker build -t $ACR_LOGIN_SERVER/okiru-pro/compute:latest -f apps/Computation-Engine/Dockerfile apps/Computation-Engine
    docker push $ACR_LOGIN_SERVER/okiru-pro/compute:latest
    
    log_info "All images pushed to ACR!"
}

# Apply Kubernetes manifests
apply_manifests() {
    log_info "Applying Kubernetes manifests..."
    
    source .aks_env
    ACR_LOGIN_SERVER="${ACR_NAME}.azurecr.io"
    
    # Update image references in deployments
    sed -i "s|yourregistry.azurecr.io|${ACR_LOGIN_SERVER}|g" deploy/k8s/11-deployment-api.yaml
    sed -i "s|yourregistry.azurecr.io|${ACR_LOGIN_SERVER}|g" deploy/k8s/12-deployment-web.yaml
    sed -i "s|yourregistry.azurecr.io|${ACR_LOGIN_SERVER}|g" deploy/k8s/13-deployment-compute.yaml
    
    # Create namespace
    kubectl create namespace okiru-pro --dry-run=client -o yaml | kubectl apply -f -
    
    # Generate and apply secrets
    log_info "Creating secrets..."
    MONGO_PASSWORD=$(openssl rand -base64 32)
    ARANGO_PASSWORD=$(openssl rand -base64 32)
    REDIS_PASSWORD=$(openssl rand -base64 32)
    SESSION_SECRET=$(openssl rand -base64 64)
    JWT_SECRET=$(openssl rand -base64 64)
    
    kubectl create secret generic mongodb-credentials \
        --namespace okiru-pro \
        --from-literal=MONGO_INITDB_ROOT_USERNAME=admin \
        --from-literal=MONGO_INITDB_ROOT_PASSWORD="$MONGO_PASSWORD" \
        --from-literal=MONGODB_URI="mongodb://admin:${MONGO_PASSWORD}@mongodb:27017/okiru-pro?authSource=admin" \
        --from-literal=MONGODB_DB_NAME=okiru-pro \
        --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create secret generic arangodb-credentials \
        --namespace okiru-pro \
        --from-literal=ARANGO_ROOT_PASSWORD="$ARANGO_PASSWORD" \
        --from-literal=ARANGO_URL="http://root:${ARANGO_PASSWORD}@arangodb:8529" \
        --from-literal=ARANGO_DB_NAME=okiru_pro \
        --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create secret generic redis-credentials \
        --namespace okiru-pro \
        --from-literal=REDIS_PASSWORD="$REDIS_PASSWORD" \
        --from-literal=REDIS_URL="redis://:${REDIS_PASSWORD}@redis:6379/0" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create secret generic session-secrets \
        --namespace okiru-pro \
        --from-literal=JWT_SECRET="$JWT_SECRET" \
        --from-literal=SESSION_SECRET="$SESSION_SECRET" \
        --from-literal=API_INTERNAL_KEY="$(openssl rand -base64 32)" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create secret docker-registry acr-pull-secret \
        --namespace okiru-pro \
        --docker-server="${ACR_LOGIN_SERVER}" \
        --docker-username="$ACR_USERNAME" \
        --docker-password="$ACR_PASSWORD" \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Apply manifests
    kubectl apply -f deploy/k8s/01-namespace.yaml
    kubectl apply -f deploy/k8s/02-storage-classes.yaml
    kubectl apply -f deploy/k8s/04-configmap.yaml
    kubectl apply -f deploy/k8s/05-pvc-mongodb.yaml
    kubectl apply -f deploy/k8s/06-pvc-arangodb.yaml
    kubectl apply -f deploy/k8s/07-pvc-redis.yaml
    kubectl apply -f deploy/k8s/08-deployment-mongodb.yaml
    kubectl apply -f deploy/k8s/09-deployment-arangodb.yaml
    kubectl apply -f deploy/k8s/10-deployment-redis.yaml
    kubectl apply -f deploy/k8s/14-services.yaml
    
    # Wait for databases
    log_info "Waiting for databases to be ready..."
    kubectl wait --for=condition=ready pod -l app=mongodb -n okiru-pro --timeout=300s || true
    kubectl wait --for=condition=ready pod -l app=arangodb -n okiru-pro --timeout=300s || true
    kubectl wait --for=condition=ready pod -l app=redis -n okiru-pro --timeout=120s || true
    
    # Apply application deployments
    kubectl apply -f deploy/k8s/11-deployment-api.yaml
    kubectl apply -f deploy/k8s/12-deployment-web.yaml
    kubectl apply -f deploy/k8s/13-deployment-compute.yaml
    kubectl apply -f deploy/k8s/15-cluster-issuer.yaml
    kubectl apply -f deploy/k8s/16-ingress.yaml
    kubectl apply -f deploy/k8s/17-hpa.yaml
    
    log_info "Manifests applied!"
}

# Verify deployment
verify_deployment() {
    log_info "Verifying deployment..."
    
    kubectl get pods -n okiru-pro
    kubectl get svc -n okiru-pro
    kubectl get ingress -n okiru-pro
    
    source .aks_env
    
    log_info ""
    log_info "========================================"
    log_info "Deployment Complete!"
    log_info "========================================"
    log_info ""
    log_info "External IP: ${EXTERNAL_IP:-Pending}"
    log_info "ACR: ${ACR_NAME}.azurecr.io"
    log_info ""
    log_info "Monitor deployment:"
    log_info "  kubectl get pods -n okiru-pro -w"
    log_info "  kubectl logs -f deployment/api -n okiru-pro"
    log_info ""
    log_info "Once external IP is assigned, update DNS:"
    log_info "  A Record: okiru-pro.com -> ${EXTERNAL_IP:-YOUR_IP}"
    log_info ""
}

# Main deployment flow
main() {
    log_info "Starting Okiru Pro AKS Deployment"
    log_info "Resource Group: $RESOURCE_GROUP"
    log_info "AKS Cluster: $AKS_CLUSTER_NAME"
    log_info "ACR: $ACR_NAME"
    log_info "Location: $LOCATION"
    log_info ""
    
    check_prerequisites
    create_resource_group
    create_acr
    create_aks
    connect_aks
    install_ingress
    wait_for_external_ip
    install_cert_manager
    build_and_push_images
    apply_manifests
    verify_deployment
    
    log_info "All done! Your application is deploying."
}

# Allow sourcing for individual functions
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
