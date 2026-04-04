#requires -Version 5.1
<#
.SYNOPSIS
    One-click build and deploy with unique image tags
.DESCRIPTION
    Builds images with unique tags (git-sha-timestamp), pushes to ACR, and deploys to AKS.
    This ensures Kubernetes always pulls fresh images.
.EXAMPLE
    .\build-and-deploy.ps1
# PARAMETER SkipBuild
#   Skip Docker build (useful if images already built)
# PARAMETER SkipTests
#   Skip smoke tests after deployment
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$AcrName = "okiruproacrde4d539b",

    [Parameter(Mandatory = $false)]
    [string]$Namespace = "okiru-pro",

    [Parameter(Mandatory = $false)]
    [switch]$SkipBuild,

    [Parameter(Mandatory = $false)]
    [switch]$SkipTests
)

$ErrorActionPreference = "Stop"

# Generate unique image tag
$GitSha = (git rev-parse --short HEAD).Substring(0, 8)
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ImageTag = "$GitSha-$Timestamp"

$Registry = "$AcrName.azurecr.io"
$Domain = "okiru.20.164.101.114.nip.io"
$RepoRoot = git rev-parse --show-toplevel

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   OKIRU PRO - BUILD & DEPLOY"
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Git SHA:       $GitSha"
Write-Host "Timestamp:     $Timestamp"
Write-Host "Image Tag:     $ImageTag" -ForegroundColor Green
Write-Host "Namespace:     $Namespace"
Write-Host ""

# STEP 1: Build (if not skipped)
if (-not $SkipBuild) {
    Write-Host "STEP 1: Building Applications" -ForegroundColor Cyan
    Write-Host "----------------------------------------"
    Set-Location $RepoRoot

    # Build API
    Write-Host "Building API..." -ForegroundColor Yellow
    pnpm --filter @okiru/api build
    if ($LASTEXITCODE -ne 0) { Write-Error "API build failed"; exit 1 }

    # Build Web
    Write-Host "Building Web..." -ForegroundColor Yellow
    pnpm --filter @okiru/web build
    if ($LASTEXITCODE -ne 0) { Write-Error "Web build failed"; exit 1 }

    Write-Host "STEP 2: Building Docker Images" -ForegroundColor Cyan
    Write-Host "----------------------------------------"

    # Login to ACR
    Write-Host "Logging into ACR..." -ForegroundColor Yellow
    az acr login --name $AcrName
    if ($LASTEXITCODE -ne 0) { Write-Error "ACR login failed"; exit 1 }

    # Build and tag images
    Write-Host "Building API image..." -ForegroundColor Yellow
    docker build -t "$Registry/okiru-pro/api:$ImageTag" -f apps/api/Dockerfile .
    if ($LASTEXITCODE -ne 0) { Write-Error "API Docker build failed"; exit 1 }

    Write-Host "Building Web image..." -ForegroundColor Yellow
    docker build -t "$Registry/okiru-pro/web:$ImageTag" -f apps/web/Dockerfile .
    if ($LASTEXITCODE -ne 0) { Write-Error "Web Docker build failed"; exit 1 }

    Write-Host "Building Compute image..." -ForegroundColor Yellow
    docker build -t "$Registry/okiru-pro/compute:$ImageTag" -f apps/Computation-Engine/Dockerfile .
    if ($LASTEXITCODE -ne 0) { Write-Error "Compute Docker build failed"; exit 1 }

    # Push images
    Write-Host "STEP 3: Pushing Images to ACR" -ForegroundColor Cyan
    Write-Host "----------------------------------------"

    docker push "$Registry/okiru-pro/api:$ImageTag"
    docker push "$Registry/okiru-pro/web:$ImageTag"
    docker push "$Registry/okiru-pro/compute:$ImageTag"
}
else {
    Write-Host "STEP 1-3: Skipped (using existing images)" -ForegroundColor Yellow
    # Use latest tag if skipping build
    $ImageTag = "latest"
    Write-Host "Using tag: $ImageTag" -ForegroundColor Yellow
}

# STEP 4: Deploy to AKS
Write-Host ""
Write-Host "STEP 4: Deploying to AKS" -ForegroundColor Cyan
Write-Host "----------------------------------------"

# Update deployments with new image tag
kubectl set image deployment/api api="$Registry/okiru-pro/api:$ImageTag" -n $Namespace
kubectl set image deployment/web web="$Registry/okiru-pro/web:$ImageTag" -n $Namespace
kubectl set image deployment/compute compute="$Registry/okiru-pro/compute:$ImageTag" -n $Namespace

# Wait for rollouts
Write-Host "Waiting for deployments to roll out..." -ForegroundColor Yellow
kubectl rollout status deployment/api -n $Namespace --timeout=180s
kubectl rollout status deployment/web -n $Namespace --timeout=180s
kubectl rollout status deployment/compute -n $Namespace --timeout=180s

# STEP 5: Smoke Tests
if (-not $SkipTests) {
    Write-Host ""
    Write-Host "STEP 5: Running Smoke Tests" -ForegroundColor Cyan
    Write-Host "----------------------------------------"

    Start-Sleep -Seconds 10

    $testUrl = "https://$Domain"
    $maxRetries = 5
    $retryCount = 0
    $testSuccess = $false

    while ($retryCount -lt $maxRetries -and -not $testSuccess) {
        $retryCount++
        Write-Host "Test attempt $retryCount of $maxRetries..."

        try {
            $response = Invoke-WebRequest -Uri "$testUrl/api/health" -UseBasicParsing -ErrorAction Stop
            Write-Host "  API Health: HTTP $($response.StatusCode) ✓" -ForegroundColor Green
            $testSuccess = $true
        } catch {
            Write-Host "  Test failed: $_" -ForegroundColor Yellow
            if ($retryCount -lt $maxRetries) {
                Start-Sleep -Seconds 10
            }
        }
    }

    if (-not $testSuccess) {
        Write-Host "SMOKE TESTS FAILED" -ForegroundColor Red
        kubectl get pods -n $Namespace
        exit 1
    }

    Write-Host "All tests passed! ✓" -ForegroundColor Green
}

# Final status
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "   DEPLOYMENT COMPLETE!"
Write-Host "========================================" -ForegroundColor Green
Write-Host "Image Tag: $ImageTag"
Write-Host "URL:       https://$Domain"
Write-Host ""
Write-Host "Monitor pods:" -ForegroundColor Cyan
Write-Host "  kubectl get pods -n $Namespace -w"
Write-Host ""
Write-Host "View logs:" -ForegroundColor Cyan
Write-Host "  kubectl logs -n $Namespace deployment/api -f"
