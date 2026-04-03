#requires -Version 5.1
<#
.SYNOPSIS
    Deploy updated images to Azure Kubernetes Service
.DESCRIPTION
    Updates Kustomize configuration with new image tags and applies to AKS.
    Includes smoke tests and automatic rollback on failure.
.PARAMETER ImageTag
    The image tag to deploy (default: latest)
.PARAMETER Namespace
    The Kubernetes namespace to deploy to
.PARAMETER AcrName
    The Azure Container Registry name
.PARAMETER Environment
    The environment overlay to use (default: prod)
.PARAMETER SkipTests
    Skip smoke tests after deployment
.PARAMETER Rollback
    Rollback to previous revision instead of deploying
.EXAMPLE
    .\03-deploy-aks.ps1 -ImageTag "abc123-20240101-120000"
.EXAMPLE
    .\03-deploy-aks.ps1 -Rollback
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$ImageTag = "latest",

    [Parameter(Mandatory = $false)]
    [string]$Namespace = "okiru-pro",

    [Parameter(Mandatory = $false)]
    [string]$AcrName = "okiruproacrde4d539b",

    [Parameter(Mandatory = $false)]
    [ValidateSet("prod", "staging")]
    [string]$Environment = "prod",

    [Parameter(Mandatory = $false)]
    [switch]$SkipTests,

    [Parameter(Mandatory = $false)]
    [switch]$Rollback
)

$ErrorActionPreference = "Stop"

$Registry = "$AcrName.azurecr.io"
$Domain = "okiru.20.164.101.114.nip.io"
$RepoRoot = git rev-parse --show-toplevel
$KustomizePath = Join-Path $RepoRoot "kubernetes/infrastructure/overlays/$Environment"

Write-Host "=== Deploy to AKS ===" -ForegroundColor Cyan
Write-Host "Environment:   $Environment"
Write-Host "Namespace:     $Namespace"
Write-Host "Image Tag:     $ImageTag"
Write-Host "Kustomize:     $KustomizePath"
Write-Host ""

# Handle rollback
if ($Rollback) {
    Write-Host "=== Performing Rollback ===" -ForegroundColor Yellow
    kubectl rollout undo deployment/api -n $Namespace
    kubectl rollout undo deployment/web -n $Namespace
    kubectl rollout undo deployment/compute -n $Namespace

    Write-Host "Waiting for rollback to complete..."
    kubectl rollout status deployment/api -n $Namespace --timeout=180s
    kubectl rollout status deployment/web -n $Namespace --timeout=180s
    kubectl rollout status deployment/compute -n $Namespace --timeout=180s

    Write-Host "Rollback completed!" -ForegroundColor Green
    return
}

# Verify kubectl connectivity
Write-Host "=== Verifying Cluster Access ===" -ForegroundColor Green
$nodes = kubectl get nodes --no-headers 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Cannot connect to Kubernetes cluster. Check your kubeconfig."
    exit 1
}
Write-Host "Connected to cluster. Nodes:"
$nodes | ForEach-Object { Write-Host "  $_" }

# Create namespace if needed
Write-Host ""
Write-Host "=== Ensuring Namespace Exists ===" -ForegroundColor Green
kubectl create namespace $Namespace --dry-run=client -o yaml | kubectl apply -f -

# Build full image references
$apiImage = "$Registry/okiru-pro/api:$ImageTag"
$webImage = "$Registry/okiru-pro/web:$ImageTag"
$computeImage = "$Registry/okiru-pro/compute:$ImageTag"

Write-Host ""
Write-Host "Image References:" -ForegroundColor Yellow
Write-Host "  API:     $apiImage"
Write-Host "  Web:     $webImage"
Write-Host "  Compute: $computeImage"

# Update Kustomize
Write-Host ""
Write-Host "=== Updating Kustomize Configuration ===" -ForegroundColor Green
Set-Location $KustomizePath

# Check if kustomize is installed
$kustomize = Get-Command kustomize -ErrorAction SilentlyContinue
if (-not $kustomize) {
    Write-Host "Kustomize not found, using kubectl kustomize..." -ForegroundColor Yellow
    $kustomizeCmd = "kubectl kustomize"
} else {
    $kustomizeCmd = "kustomize"
}

# Update images using kustomize edit
if ($kustomize) {
    & kustomize edit set image "$Registry/okiru-pro/api=$apiImage"
    & kustomize edit set image "$Registry/okiru-pro/web=$webImage"
    & kustomize edit set image "$Registry/okiru-pro/compute=$computeImage"
} else {
    # Manual sed replacement as fallback
    $kustomizationFile = Join-Path $KustomizePath "kustomization.yaml"
    $content = Get-Content $kustomizationFile -Raw

    # Replace newTag values
    $content = $content -replace "newTag:.*", "newTag: $ImageTag"
    Set-Content $kustomizationFile $content -NoNewline
}

Write-Host "Updated kustomization.yaml with new image tags"

# Build manifests
Write-Host ""
Write-Host "=== Building Manifests ===" -ForegroundColor Green
$manifests = & $kustomizeCmd build .
if (-not $manifests) {
    Write-Error "Kustomize build failed"
    exit 1
}

# Show what will change
Write-Host ""
Write-Host "=== Checking Deployment Changes ===" -ForegroundColor Green
kubectl diff -f - <<< $manifests 2>&1 | Select-Object -First 50 | ForEach-Object { Write-Host $_ }

# Apply manifests
Write-Host ""
Write-Host "=== Applying Manifests ===" -ForegroundColor Green
$manifests | kubectl apply -f -
if ($LASTEXITCODE -ne 0) {
    Write-Error "kubectl apply failed"
    exit 1
}

# Wait for rollout
Write-Host ""
Write-Host "=== Waiting for Rollout ===" -ForegroundColor Green

$deployments = @("api", "web", "compute")
$deploymentSuccess = $true

foreach ($dep in $deployments) {
    Write-Host "Waiting for $dep deployment..." -ForegroundColor Cyan
    try {
        kubectl rollout status "deployment/$dep" -n $Namespace --timeout=300s
        if ($LASTEXITCODE -ne 0) {
            throw "Rollout failed for $dep"
        }
    } catch {
        Write-Error "Rollout failed for $dep`: $_"
        $deploymentSuccess = $false
        break
    }
}

if (-not $deploymentSuccess) {
    Write-Host ""
    Write-Host "=== Deployment Failed - Rolling Back ===" -ForegroundColor Red

    foreach ($dep in $deployments) {
        kubectl rollout undo "deployment/$dep" -n $Namespace 2>$null
    }

    foreach ($dep in $deployments) {
        kubectl rollout status "deployment/$dep" -n $Namespace --timeout=180s 2>$null
    }

    Write-Host "Rollback completed. Check logs for details." -ForegroundColor Red
    exit 1
}

# Restart deployments to ensure new images are pulled
Write-Host ""
Write-Host "=== Restarting Deployments to Pull New Images ===" -ForegroundColor Green
foreach ($dep in $deployments) {
    kubectl rollout restart "deployment/$dep" -n $Namespace
}

# Wait for restart
Write-Host ""
Write-Host "Waiting for pods to be ready..."
Start-Sleep -Seconds 10

foreach ($dep in $deployments) {
    kubectl rollout status "deployment/$dep" -n $Namespace --timeout=300s
}

# Smoke tests
if (-not $SkipTests) {
    Write-Host ""
    Write-Host "=== Running Smoke Tests ===" -ForegroundColor Green

    Start-Sleep -Seconds 15  # Give services time to stabilize

    $testUrl = "https://$Domain"
    $maxRetries = 5
    $retryCount = 0
    $testSuccess = $false

    while ($retryCount -lt $maxRetries -and -not $testSuccess) {
        $retryCount++
        Write-Host "Test attempt $retryCount of $maxRetries..."

        try {
            # Test web endpoint
            $webResponse = Invoke-WebRequest -Uri $testUrl -UseBasicParsing -MaximumRedirection 0 -ErrorAction Stop
            Write-Host "  Web check: HTTP $($webResponse.StatusCode)" -ForegroundColor Green

            # Test API health
            $apiResponse = Invoke-WebRequest -Uri "$testUrl/api/health" -UseBasicParsing -ErrorAction Stop
            Write-Host "  API health: HTTP $($apiResponse.StatusCode)" -ForegroundColor Green

            $testSuccess = $true
        } catch {
            Write-Host "  Test failed: $_" -ForegroundColor Yellow
            if ($retryCount -lt $maxRetries) {
                Write-Host "  Retrying in 10 seconds..."
                Start-Sleep -Seconds 10
            }
        }
    }

    if (-not $testSuccess) {
        Write-Host ""
        Write-Host "SMOKE TESTS FAILED" -ForegroundColor Red

        # Show pod status
        Write-Host ""
        Write-Host "Pod Status:" -ForegroundColor Yellow
        kubectl get pods -n $Namespace

        # Show recent logs
        Write-Host ""
        Write-Host "Recent Web Logs:" -ForegroundColor Yellow
        kubectl logs -n $Namespace deployment/web --tail=50 2>&1

        # Prompt for rollback
        $rollback = Read-Host "Rollback to previous version? (y/N)"
        if ($rollback -eq "y" -or $rollback -eq "Y") {
            . $MyInvocation.MyCommand.Path -Rollback
        }

        exit 1
    }

    Write-Host ""
    Write-Host "All smoke tests passed!" -ForegroundColor Green
}

# Show final status
Write-Host ""
Write-Host "=== Deployment Status ===" -ForegroundColor Green
kubectl get pods -n $Namespace -o wide

Write-Host ""
Write-Host "=== Deployment Complete ===" -ForegroundColor Green
Write-Host "Application URL: https://$Domain"
Write-Host ""
Write-Host "Commands to monitor:" -ForegroundColor Cyan
Write-Host "  kubectl get pods -n $Namespace -w"
Write-Host "  kubectl logs -n $Namespace deployment/web -f"
Write-Host "  kubectl logs -n $Namespace deployment/api -f"
