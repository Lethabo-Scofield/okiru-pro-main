#requires -Version 5.1
<#
.SYNOPSIS
  Build API, Web, and Compute images in Azure (ACR Tasks / az acr build - no local Docker), then deploy to AKS.

.DESCRIPTION
  Use this when GitHub Actions deploy is not available or you want a direct Azure build + kubectl rollout.

.EXAMPLE
  .\acr-cloud-build-deploy.ps1

.EXAMPLE
  .\acr-cloud-build-deploy.ps1 -SkipDeploy   # only push images to ACR

.EXAMPLE
  .\acr-cloud-build-deploy.ps1 -UntagLatest   # remove :latest on ACR before build (legacy cleanup)
#>
[CmdletBinding()]
param(
    [string] $AcrName = "okiruproacrde4d539b",
    [string] $Namespace = "okiru-pro",
    [switch] $SkipDeploy,
    [switch] $UntagLatest
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $RepoRoot

$short = git rev-parse --short HEAD
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$ImageTag = "$short-$ts"
$Registry = "$AcrName.azurecr.io"

Write-Host ""
Write-Host "=== ACR cloud build + AKS deploy ===" -ForegroundColor Cyan
Write-Host "Repo root:    $RepoRoot"
Write-Host "Registry:     $Registry"
Write-Host "Image tag:    $ImageTag" -ForegroundColor Green
Write-Host ""

Write-Host "Azure account:" -ForegroundColor Yellow
az account show --query "{name:name,id:id}" -o table
if ($LASTEXITCODE -ne 0) { Write-Error "Azure CLI not logged in. Run: az login"; exit 1 }

if ($UntagLatest) {
    Write-Host "Removing stale :latest tags (optional)..." -ForegroundColor Yellow
    foreach ($repo in @("web", "api", "compute")) {
        az acr repository untag --name $AcrName --image "okiru-pro/${repo}:latest" --yes 2>$null
    }
}

function Invoke-AcrBuild {
    param(
        [string] $ImageRepo,
        [string] $Dockerfile,
        [string] $Context
    )
    Write-Host ""
    Write-Host "=== ACR build: $ImageRepo ===" -ForegroundColor Cyan
    # --no-logs: avoids UnicodeEncodeError on Windows when ACR streams box-drawing chars (pnpm, etc.)
    az acr build `
        --registry $AcrName `
        --no-logs `
        --image "okiru-pro/${ImageRepo}:$ImageTag" `
        --image "okiru-pro/${ImageRepo}:latest" `
        --file $Dockerfile `
        --timeout 1800 `
        $Context
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# Web: monorepo root
Invoke-AcrBuild -ImageRepo "web" -Dockerfile "apps/web/Dockerfile" -Context "."
# API: monorepo root (Dockerfile copies root package.json and packages/types)
Invoke-AcrBuild -ImageRepo "api" -Dockerfile "apps/api/Dockerfile" -Context "."
# Compute: service directory
Invoke-AcrBuild -ImageRepo "compute" -Dockerfile "apps/Computation-Engine/Dockerfile" -Context "apps/Computation-Engine"

Write-Host ""
Write-Host "=== ACR builds finished ===" -ForegroundColor Green
Write-Host "Tagged: okiru-pro/api, okiru-pro/web, okiru-pro/compute -> $ImageTag and :latest"
Write-Host ""

if ($SkipDeploy) {
    Write-Host "SkipDeploy set - kubectl rollout skipped." -ForegroundColor Yellow
    Write-Host "Deploy later with:"
    Write-Host "  kubectl set image deployment/api api=$Registry/okiru-pro/api:$ImageTag -n $Namespace"
    Write-Host "  kubectl set image deployment/web web=$Registry/okiru-pro/web:$ImageTag -n $Namespace"
    Write-Host "  kubectl set image deployment/compute compute=$Registry/okiru-pro/compute:$ImageTag -n $Namespace"
    exit 0
}

Write-Host "=== Deploy to AKS (namespace $Namespace) ===" -ForegroundColor Cyan
kubectl get nodes | Out-Host

$apiImg = "$Registry/okiru-pro/api:$ImageTag"
$webImg = "$Registry/okiru-pro/web:$ImageTag"
$compImg = "$Registry/okiru-pro/compute:$ImageTag"

kubectl set image deployment/api api=$apiImg -n $Namespace
kubectl set image deployment/web web=$webImg -n $Namespace
kubectl set image deployment/compute compute=$compImg -n $Namespace

kubectl rollout restart deployment/api deployment/web deployment/compute -n $Namespace

foreach ($d in @("api", "web", "compute")) {
    kubectl rollout status "deployment/$d" -n $Namespace --timeout=300s
}

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "Prod: https://okiru.pro"
Write-Host "Image tag: $ImageTag"
