# Deployment script for Okiru Pro
$ErrorActionPreference = "Stop"

$ACR_NAME = "okiruproacrde4d539b"
$ACR_LOGIN = "$ACR_NAME.azurecr.io"
$VERSION = "v1.0.25"
$NAMESPACE = "okiru-pro"
$env:KUBECONFIG = "C:\dev\okiru-pro-main\kubeconfig.yaml"
$env:PYTHONIOENCODING = "utf-8"

Write-Host "=== Okiru Pro Deployment Script ($VERSION) ===" -ForegroundColor Cyan

# Check Azure login
Write-Host "`nChecking Azure login..." -ForegroundColor Yellow
$account = az account show --query name -o tsv 2>$null
if ($LASTEXITCODE -ne 0 -or -not $account) {
    Write-Host "ERROR: Not logged into Azure. Please run 'az login' first." -ForegroundColor Red
    exit 1
}
Write-Host "Logged in as: $account" -ForegroundColor Green

# Check kubectl connectivity
Write-Host "`nChecking Kubernetes connectivity..." -ForegroundColor Yellow
$nodes = kubectl get nodes -o name 2>$null
if ($LASTEXITCODE -ne 0 -or -not $nodes) {
    Write-Host "ERROR: Cannot connect to Kubernetes cluster." -ForegroundColor Red
    exit 1
}
Write-Host "Connected to cluster, nodes: $nodes" -ForegroundColor Green

# Build Web image
Write-Host "`n=== Building Web Image ===" -ForegroundColor Cyan
Write-Host "Starting Web build..." -ForegroundColor Yellow
az acr build --registry $ACR_NAME --image "okiru-pro/web:$VERSION" --file apps/web/Dockerfile . --timeout 3600 --no-logs
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Web build failed" -ForegroundColor Red
    exit 1
}
Write-Host "Web build complete!" -ForegroundColor Green

# Build API image
Write-Host "`n=== Building API Image ===" -ForegroundColor Cyan
Write-Host "Starting API build..." -ForegroundColor Yellow
az acr build --registry $ACR_NAME --image "okiru-pro/api:$VERSION" --file apps/api/Dockerfile . --timeout 3600 --no-logs
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: API build failed" -ForegroundColor Red
    exit 1
}
Write-Host "API build complete!" -ForegroundColor Green

# Deploy to Kubernetes
Write-Host "`n=== Deploying to Kubernetes ===" -ForegroundColor Cyan

Write-Host "Updating Web deployment..." -ForegroundColor Yellow
kubectl set image deployment/web "web=$ACR_LOGIN/okiru-pro/web:$VERSION" -n $NAMESPACE
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to update Web deployment" -ForegroundColor Red
    exit 1
}

Write-Host "Updating API deployment..." -ForegroundColor Yellow
kubectl set image deployment/api "api=$ACR_LOGIN/okiru-pro/api:$VERSION" -n $NAMESPACE
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to update API deployment" -ForegroundColor Red
    exit 1
}

# Wait for rollouts
Write-Host "`nWaiting for Web rollout..." -ForegroundColor Yellow
kubectl rollout status deployment/web -n $NAMESPACE --timeout=300s
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Web rollout failed" -ForegroundColor Red
    exit 1
}

Write-Host "Waiting for API rollout..." -ForegroundColor Yellow
kubectl rollout status deployment/api -n $NAMESPACE --timeout=300s
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: API rollout failed" -ForegroundColor Red
    exit 1
}

# Verify pods
Write-Host "`n=== Verifying Pods ===" -ForegroundColor Cyan
kubectl get pods -n $NAMESPACE -o wide

# Test endpoint
Write-Host "`n=== Testing Endpoint ===" -ForegroundColor Cyan
Write-Host "Testing health endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "https://okiru.20.164.101.114.nip.io/api/health" -Method GET -TimeoutSec 30
    Write-Host "Health endpoint: SUCCESS" -ForegroundColor Green
} catch {
    Write-Host "Health endpoint: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

# Git tag
Write-Host "`n=== Tagging Release ===" -ForegroundColor Cyan
git tag -a $VERSION -m "Release $VERSION - Elite Logging System" 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "Tagged: $VERSION" -ForegroundColor Green
} else {
    Write-Host "Tag $VERSION already exists, skipping" -ForegroundColor Yellow
}

Write-Host "`n=== Deployment Complete ($VERSION) ===" -ForegroundColor Green
