#requires -Version 5.1
<#
.SYNOPSIS
    Complete cleanup, rebuild, and deploy pipeline using Azure CLI
.DESCRIPTION
    This script orchestrates the full process:
    1. Cleans up old/broken images from ACR
    2. Rebuilds all images with fresh tags
    3. Deploys to AKS with rolling update
    Use this when pods are stuck with old broken images.
.PARAMETER SkipCleanup
    Skip the ACR cleanup step
.PARAMETER SkipBuild
    Skip the Docker build step (use existing 'latest' images)
.PARAMETER ImageTag
    Custom image tag (auto-generated if not provided)
.EXAMPLE
    .\00-full-cleanup-rebuild-deploy.ps1
.EXAMPLE
    .\00-full-cleanup-rebuild-deploy.ps1 -ImageTag "hotfix-$(Get-Date -Format 'yyyyMMdd')"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [switch]$SkipCleanup,

    [Parameter(Mandatory = $false)]
    [switch]$SkipBuild,

    [Parameter(Mandatory = $false)]
    [string]$ImageTag = $null,

    [Parameter(Mandatory = $false)]
    [string]$AcrName = "okiruproacrde4d539b",

    [Parameter(Mandatory = $false)]
    [string]$Namespace = "okiru-pro"
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host @"
╔═══════════════════════════════════════════════════════════════════╗
║           OKIRU PRO - FULL CLEANUP & REDEPLOY PIPELINE            ║
╚═══════════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Cyan

$startTime = Get-Date

# Generate image tag if not provided
if (-not $ImageTag) {
    try {
        $gitSha = (git rev-parse --short HEAD 2>$null)
        if (-not $gitSha) {
            $gitSha = Get-Random -Maximum 9999
        }
        $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $ImageTag = "$gitSha-$timestamp"
    } catch {
        $ImageTag = Get-Date -Format 'yyyyMMdd-HHmmss'
    }
}

Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  ACR Name:    $AcrName"
Write-Host "  Image Tag:   $ImageTag"
Write-Host "  Namespace:   $Namespace"
Write-Host "  SkipCleanup: $SkipCleanup"
Write-Host "  SkipBuild:   $SkipBuild"
Write-Host ""

# Verify prerequisites
Write-Host "=== Checking Prerequisites ===" -ForegroundColor Green

$tools = @("az", "docker", "kubectl")
foreach ($tool in $tools) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Error "Required tool '$tool' not found in PATH"
        exit 1
    }
    Write-Host "  $tool`: OK"
}

# Verify Azure login
Write-Host ""
Write-Host "=== Verifying Azure Authentication ===" -ForegroundColor Green
$account = az account show --query name -o tsv 2>$null
if (-not $account) {
    Write-Host "Not logged into Azure. Initiating login..." -ForegroundColor Yellow
    az login
} else {
    Write-Host "Logged in as: $account"
}

# Step 1: Cleanup ACR
if (-not $SkipCleanup) {
    Write-Host ""
    Write-Host "=== STEP 1: Cleaning up ACR ===" -ForegroundColor Green

    # Convert to bash path if on Windows with WSL/Git Bash
    $cleanupScript = Join-Path $scriptDir "01-cleanup-acr.sh"

    if (Test-Path $cleanupScript) {
        # Copy script content and execute with bash
        $bashPath = "C:\Program Files\Git\bin\bash.exe"
        if (-not (Test-Path $bashPath)) {
            $bashPath = "bash"  # Assume in PATH
        }

        Write-Host "Running cleanup script..."
        & $bashPath $cleanupScript
    } else {
        Write-Warning "Cleanup script not found at $cleanupScript"
        Write-Host "Running inline cleanup..."

        # Inline cleanup using Azure CLI
        az acr login --name $AcrName

        $repos = @("okiru-pro/web", "okiru-pro/api", "okiru-pro/compute")
        foreach ($repo in $repos) {
            Write-Host "Cleaning up $repo..."
            # Delete latest tag
            az acr repository untag --name $AcrName --image "$repo`:latest" --yes 2>$null || Write-Host "  (latest tag may not exist)"

            # Delete untagged manifests
            $manifests = az acr manifest list-metadata --name $AcrName --repository $repo --query "[?tags==null].digest" -o tsv 2>$null
            if ($manifests) {
                foreach ($digest in $manifests -split "`n") {
                    if ($digest) {
                        Write-Host "  Deleting untagged: $digest"
                        az acr repository delete --name $AcrName --image "$repo@$digest" --yes
                    }
                }
            }
        }
    }
} else {
    Write-Host ""
    Write-Host "=== STEP 1: Skipping Cleanup ===" -ForegroundColor Yellow
}

# Step 2: Build Images
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "=== STEP 2: Building Images ===" -ForegroundColor Green

    $buildScript = Join-Path $scriptDir "02-force-rebuild.ps1"
    if (Test-Path $buildScript) {
        & $buildScript -AcrName $AcrName -ImageTag $ImageTag
    } else {
        Write-Error "Build script not found at $buildScript"
        exit 1
    }
} else {
    Write-Host ""
    Write-Host "=== STEP 2: Skipping Build (using 'latest' tag) ===" -ForegroundColor Yellow
    $ImageTag = "latest"
}

# Step 3: Deploy to AKS
Write-Host ""
Write-Host "=== STEP 3: Deploying to AKS ===" -ForegroundColor Green

$deployScript = Join-Path $scriptDir "03-deploy-aks.ps1"
if (Test-Path $deployScript) {
    & $deployScript -ImageTag $ImageTag -Namespace $Namespace -AcrName $AcrName
} else {
    Write-Error "Deploy script not found at $deployScript"
    exit 1
}

# Summary
$endTime = Get-Date
$duration = $endTime - $startTime

Write-Host ""
Write-Host @"
╔═══════════════════════════════════════════════════════════════════╗
║                      PIPELINE COMPLETE                            ║
╚═══════════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Green

Write-Host "Deployment Summary:" -ForegroundColor Yellow
Write-Host "  Image Tag:   $ImageTag"
Write-Host "  Duration:    $($duration.ToString('hh\:mm\:ss'))"
Write-Host "  Namespace:   $Namespace"
Write-Host ""
Write-Host "Verify deployment:" -ForegroundColor Cyan
Write-Host "  kubectl get pods -n $Namespace"
Write-Host "  kubectl logs -n $Namespace deployment/web"
Write-Host ""
Write-Host "Test the application:" -ForegroundColor Cyan
Write-Host "  curl -I https://okiru.20.164.101.114.nip.io/"
