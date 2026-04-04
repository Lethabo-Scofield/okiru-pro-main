#requires -Version 5.1
<#
.SYNOPSIS
    Build and push Docker images with unique tags
.DESCRIPTION
    Builds images with git commit hash + timestamp tags, pushes to ACR.
    This ensures Kubernetes always pulls fresh images.
.EXAMPLE
    .\01-build-push.ps1
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$AcrName = "okiruproacrde4d539b",

    [Parameter(Mandatory = $false)]
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

# Generate unique image tag: git-short-sha-timestamp
$GitSha = (git rev-parse --short HEAD).Substring(0, 8)
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$ImageTag = "$GitSha-$Timestamp"

$Registry = "$AcrName.azurecr.io"
$RepoRoot = git rev-parse --show-toplevel

Write-Host "=== Build & Push Images ===" -ForegroundColor Cyan
Write-Host "Git SHA:       $GitSha"
Write-Host "Timestamp:     $Timestamp"
Write-Host "Image Tag:     $ImageTag" -ForegroundColor Green
Write-Host "Registry:      $Registry"
Write-Host ""

# Login to ACR
Write-Host "=== Logging into ACR ===" -ForegroundColor Green
az acr login --name $AcrName
if ($LASTEXITCODE -ne 0) {
    Write-Error "ACR login failed"
    exit 1
}

# Build images with unique tags
if (-not $SkipBuild) {
    Write-Host ""
    Write-Host "=== Building Images ===" -ForegroundColor Green
    Set-Location $RepoRoot

    # Build API
    Write-Host "Building API image..." -ForegroundColor Cyan
    docker build -t "$Registry/okiru-pro/api:$ImageTag" -t "$Registry/okiru-pro/api:latest" -f apps/api/Dockerfile .
    if ($LASTEXITCODE -ne 0) { Write-Error "API build failed"; exit 1 }

    # Build Web
    Write-Host "Building Web image..." -ForegroundColor Cyan
    docker build -t "$Registry/okiru-pro/web:$ImageTag" -t "$Registry/okiru-pro/web:latest" -f apps/web/Dockerfile .
    if ($LASTEXITCODE -ne 0) { Write-Error "Web build failed"; exit 1 }

    # Build Compute
    Write-Host "Building Compute image..." -ForegroundColor Cyan
    docker build -t "$Registry/okiru-pro/compute:$ImageTag" -t "$Registry/okiru-pro/compute:latest" -f apps/Computation-Engine/Dockerfile .
    if ($LASTEXITCODE -ne 0) { Write-Error "Compute build failed"; exit 1 }
}

# Push images
Write-Host ""
Write-Host "=== Pushing Images to ACR ===" -ForegroundColor Green

docker push "$Registry/okiru-pro/api:$ImageTag"
docker push "$Registry/okiru-pro/web:$ImageTag"
docker push "$Registry/okiru-pro/compute:$ImageTag"

# Also update latest tag
docker push "$Registry/okiru-pro/api:latest"
docker push "$Registry/okiru-pro/web:latest"
docker push "$Registry/okiru-pro/compute:latest"

Write-Host ""
Write-Host "=== Build & Push Complete ===" -ForegroundColor Green
Write-Host "Image Tag: $ImageTag" -ForegroundColor Yellow
Write-Host ""
Write-Host "To deploy, run:" -ForegroundColor Cyan
Write-Host "  .\03-deploy-aks.ps1 -ImageTag $ImageTag"

# Save tag to file for CI/CD pipelines
$ImageTag | Out-File -FilePath (Join-Path $RepoRoot ".last-image-tag") -NoNewline
