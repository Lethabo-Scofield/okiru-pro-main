# Deployment script for Okiru Pro
$ErrorActionPreference = "Stop"

$ACR_NAME = "okiruproacrde4d539b"
$ACR_LOGIN = "$ACR_NAME.azurecr.io"
$VERSION = "v1.0.25"
$NAMESPACE = "okiru-pro"

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
$env:KUBECONFIG = "C:\Users\Administrator\Documents\GitHub\okiru-pro-main\kubeconfig.yaml"
$nodes = kubectl get nodes -o name 2>$null
if ($LASTEXITCODE -ne 0 -or -not $nodes) {
    Write-Host "ERROR: Cannot connect to Kubernetes cluster." -ForegroundColor Red
    exit 1
}
Write-Host "Connected to cluster, nodes: $nodes" -ForegroundColor Green

# Build Web image
Write-Host "`n=== Building Web Image ===" -ForegroundColor Cyan
Write-Host "Starting Web build (this may take 5-10 minutes)..." -ForegroundColor Yellow
$env:PYTHONIOENCODING = "utf-8"
az acr build --registry $ACR_NAME --image "okiru-pro/web:$VERSION" --file apps/web/Dockerfile . --timeout 3600 --no-logs
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Web build failed" -ForegroundColor Red
    exit 1
}
Write-Host "Web build complete!" -ForegroundColor Green

# Build API image
Write-Host "`n=== Building API Image ===" -ForegroundColor Cyan
Write-Host "Starting API build (this may take 5-10 minutes)..." -ForegroundColor Yellow
az acr build --registry $ACR_NAME --image "okiru-pro/api:$VERSION" --file apps/api/Dockerfile . --timeout 3600 --no-logs
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: API build failed" -ForegroundColor Red
    exit 1
}
Write-Host "API build complete!" -ForegroundColor Green

# Clear old image tags from ACR
Write-Host "`n=== Clearing Old Image Tags ===" -ForegroundColor Cyan
$webTags = az acr repository show-tags --name $ACR_NAME --repository okiru-pro/web --orderby time_asc -o tsv 2>$null
if ($webTags) {
    $tagList = $webTags -split "`n" | Where-Object { $_ -and $_ -ne $VERSION -and $_ -ne "latest" }
    foreach ($tag in $tagList) {
        $tag = $tag.Trim()
        if ($tag) {
            Write-Host "  Removing web:$tag" -ForegroundColor DarkGray
            az acr repository delete --name $ACR_NAME --image "okiru-pro/web:$tag" --yes 2>$null
        }
    }
}
$apiTags = az acr repository show-tags --name $ACR_NAME --repository okiru-pro/api --orderby time_asc -o tsv 2>$null
if ($apiTags) {
    $tagList = $apiTags -split "`n" | Where-Object { $_ -and $_ -ne $VERSION -and $_ -ne "latest" }
    foreach ($tag in $tagList) {
        $tag = $tag.Trim()
        if ($tag) {
            Write-Host "  Removing api:$tag" -ForegroundColor DarkGray
            az acr repository delete --name $ACR_NAME --image "okiru-pro/api:$tag" --yes 2>$null
        }
    }
}
Write-Host "Old tags cleared!" -ForegroundColor Green

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

# Verify ALL pods
Write-Host "`n=== Verifying All Pods ===" -ForegroundColor Cyan
kubectl get pods -n $NAMESPACE -o wide

# Test endpoints
Write-Host "`n=== Testing Endpoints ===" -ForegroundColor Cyan

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
