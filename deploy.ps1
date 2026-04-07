# Deployment script for Okiru Pro
$ErrorActionPreference = "Stop"

Write-Host "=== Okiru Pro Deployment Script ===" -ForegroundColor Cyan

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
$env:KUBECONFIG = "C:\Users\Administrator\Documents\GitHub\okiru-pro-main\kubeconfig.yaml"
$nodes = kubectl get nodes -o name 2>$null
if ($LASTEXITCODE -ne 0 -or -not $nodes) {
    Write-Host "ERROR: Cannot connect to Kubernetes cluster." -ForegroundColor Red
    exit 1
}
Write-Host "Connected to cluster, nodes: $nodes" -ForegroundColor Green

# Build API image
Write-Host "`n=== Building API Image ===" -ForegroundColor Cyan
Write-Host "Starting API build (this may take 5-10 minutes)..." -ForegroundColor Yellow
az acr build --registry okiruacr --image okiru-api:v1.0.22 --file apps/api/Dockerfile . --no-format
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: API build failed" -ForegroundColor Red
    exit 1
}
Write-Host "API build complete!" -ForegroundColor Green

# Build Web image
Write-Host "`n=== Building Web Image ===" -ForegroundColor Cyan
Write-Host "Starting Web build (this may take 5-10 minutes)..." -ForegroundColor Yellow
az acr build --registry okiruacr --image okiru-web:v1.0.22 --file apps/web/Dockerfile . --no-format
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Web build failed" -ForegroundColor Red
    exit 1
}
Write-Host "Web build complete!" -ForegroundColor Green

# Deploy to Kubernetes
Write-Host "`n=== Deploying to Kubernetes ===" -ForegroundColor Cyan

Write-Host "Updating API deployment..." -ForegroundColor Yellow
kubectl set image deployment/api api=okiruacr.azurecr.io/okiru-api:v1.0.22 -n okiru-pro
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to update API deployment" -ForegroundColor Red
    exit 1
}

Write-Host "Updating Web deployment..." -ForegroundColor Yellow
kubectl set image deployment/web web=okiruacr.azurecr.io/okiru-web:v1.0.22 -n okiru-pro
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to update Web deployment" -ForegroundColor Red
    exit 1
}

# Wait for rollouts
Write-Host "`nWaiting for API rollout..." -ForegroundColor Yellow
kubectl rollout status deployment/api -n okiru-pro --timeout=300s
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: API rollout failed" -ForegroundColor Red
    exit 1
}

Write-Host "Waiting for Web rollout..." -ForegroundColor Yellow
kubectl rollout status deployment/web -n okiru-pro --timeout=300s
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Web rollout failed" -ForegroundColor Red
    exit 1
}

# Verify pods
Write-Host "`n=== Verifying Pods ===" -ForegroundColor Cyan
kubectl get pods -n okiru-pro -l app=api -o wide
kubectl get pods -n okiru-pro -l app=web -o wide

# Test endpoints
Write-Host "`n=== Testing Endpoints ===" -ForegroundColor Cyan

Write-Host "Testing health endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "https://okiru.20.164.101.114.nip.io/api/health" -Method GET -TimeoutSec 30
    Write-Host "Health endpoint: SUCCESS" -ForegroundColor Green
} catch {
    Write-Host "Health endpoint: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Testing sectors endpoint..." -ForegroundColor Yellow
try {
    $sectors = Invoke-RestMethod -Uri "https://okiru.20.164.101.114.nip.io/api/sectors/options" -Method GET -TimeoutSec 30
    Write-Host "Sectors endpoint: SUCCESS - Found $($sectors.Count) sectors" -ForegroundColor Green
} catch {
    Write-Host "Sectors endpoint: FAILED - $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "Testing processor-sessions endpoint..." -ForegroundColor Yellow
try {
    $sessions = Invoke-RestMethod -Uri "https://okiru.20.164.101.114.nip.io/api/processor-sessions" -Method GET -TimeoutSec 30
    Write-Host "Sessions endpoint: SUCCESS (authenticated)" -ForegroundColor Green
} catch {
    if ($_.Exception.Response.StatusCode -eq 401) {
        Write-Host "Sessions endpoint: SUCCESS (401 expected for unauthenticated)" -ForegroundColor Green
    } else {
        Write-Host "Sessions endpoint: FAILED - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n=== Deployment Complete ===" -ForegroundColor Green
