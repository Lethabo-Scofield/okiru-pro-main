#requires -Version 5.1
<#
.SYNOPSIS
    Force rebuild and push all Docker images to Azure Container Registry
.DESCRIPTION
    This script builds all application images with proper context and pushes them to ACR.
    Use this after cleaning up old/broken images.
.PARAMETER AcrName
    The Azure Container Registry name
.PARAMETER ImageTag
    The tag to apply to built images (default: git SHA or timestamp)
.EXAMPLE
    .\02-force-rebuild.ps1 -AcrName "okiruproacrde4d539b" -ImageTag "fixed-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$AcrName = "okiruproacrde4d539b",

    [Parameter(Mandatory = $false)]
    [string]$ImageTag = $null
)

$ErrorActionPreference = "Stop"

# Generate image tag if not provided
if (-not $ImageTag) {
    try {
        $gitSha = (git rev-parse --short HEAD 2>$null)
        if (-not $gitSha) {
            $gitSha = Get-Date -Format 'yyyyMMdd-HHmmss'
        }
        $ImageTag = $gitSha
    } catch {
        $ImageTag = Get-Date -Format 'yyyyMMdd-HHmmss'
    }
}

$Registry = "$AcrName.azurecr.io"
$RepositoryPrefix = "okiru-pro"

Write-Host "=== Force Rebuild Script ===" -ForegroundColor Cyan
Write-Host "ACR: $Registry"
Write-Host "Image Tag: $ImageTag"
Write-Host ""

# Verify we're in the repo root
$repoRoot = git rev-parse --show-toplevel 2>$null
$currentDir = Get-Location
if ($repoRoot -and (Resolve-Path $repoRoot).Path -ne (Resolve-Path $currentDir).Path) {
    Write-Host "Changing to repository root: $repoRoot" -ForegroundColor Yellow
    Set-Location $repoRoot
}

# Login to Azure and ACR
Write-Host "=== Authenticating with Azure ===" -ForegroundColor Green
try {
    $account = az account show --query name -o tsv 2>$null
    if (-not $account) {
        Write-Host "Not logged into Azure. Running az login..." -ForegroundColor Yellow
        az login
    } else {
        Write-Host "Already logged in as: $account"
    }

    Write-Host "Logging into ACR..."
    az acr login --name $AcrName
} catch {
    Write-Error "Azure authentication failed: $_"
    exit 1
}

# Build and push images
Write-Host ""
Write-Host "=== Building Images ===" -ForegroundColor Green

$images = @(
    @{
        Name = "api"
        Dockerfile = "apps/api/Dockerfile"
        Context = "."
    },
    @{
        Name = "web"
        Dockerfile = "apps/web/Dockerfile"
        Context = "."
    },
    @{
        Name = "compute"
        Dockerfile = "apps/Computation-Engine/Dockerfile"
        Context = "./apps/Computation-Engine"
    }
)

$builtImages = @{}

foreach ($img in $images) {
    $imageName = "$Registry/$RepositoryPrefix/$($img.Name):$ImageTag"
    $builtImages[$img.Name] = $imageName

    Write-Host ""
    Write-Host "Building $($img.Name) image..." -ForegroundColor Cyan
    Write-Host "  Tag: $imageName"
    Write-Host "  Dockerfile: $($img.Dockerfile)"
    Write-Host "  Context: $($img.Context)"

    try {
        docker build `
            --file $($img.Dockerfile) `
            --tag $imageName `
            --build-arg BUILDKIT_INLINE_CACHE=1 `
            $($img.Context)

        if ($LASTEXITCODE -ne 0) {
            throw "Docker build failed for $($img.Name)"
        }

        Write-Host "Pushing $imageName..." -ForegroundColor Green
        docker push $imageName

        if ($LASTEXITCODE -ne 0) {
            throw "Docker push failed for $($img.Name)"
        }

        Write-Host "$($img.Name) built and pushed successfully!" -ForegroundColor Green
    } catch {
        Write-Error "Failed to build/push $($img.Name): $_"
        exit 1
    }
}

# Tag as latest
Write-Host ""
Write-Host "=== Tagging as 'latest' ===" -ForegroundColor Green
foreach ($img in $images) {
    $sourceImage = $builtImages[$img.Name]
    $latestImage = "$Registry/$RepositoryPrefix/$($img.Name):latest"

    Write-Host "Tagging $sourceImage as latest..."
    docker tag $sourceImage $latestImage
    docker push $latestImage
}

Write-Host ""
Write-Host "=== Rebuild Complete ===" -ForegroundColor Green
Write-Host "Images built with tag: $ImageTag"
Write-Host ""
Write-Host "Built images:"
foreach ($name in $builtImages.Keys) {
    Write-Host "  $name`: $($builtImages[$name])"
}
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Run: .\03-deploy-aks.ps1 -ImageTag '$ImageTag'"
