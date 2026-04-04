#requires -Version 5.1
<#
.SYNOPSIS
    Emergency force deploy - patches deployments directly without building new images
.DESCRIPTION
    Forces Kubernetes to restart pods with annotation updates
#>

$ErrorActionPreference = "Stop"

Write-Host "=== Emergency Force Deploy ===" -ForegroundColor Cyan

$Tag = Get-Date -Format "yyyyMMdd-HHmmss"
Write-Host "Deploy tag: $Tag" -ForegroundColor Yellow

Write-Host "Forcing deployment restarts..." -ForegroundColor Green

# Force restart with annotation update
kubectl patch deployment web -n okiru-pro -p "{`"spec`":{`"template`":{`"metadata`":{`"annotations`":{`"force-restart`":`"$Tag`"}}}}}"
kubectl patch deployment api -n okiru-pro -p "{`"spec`":{`"template`":{`"metadata`":{`"annotations`":{`"force-restart`":`"$Tag`"}}}}}"

Write-Host "Waiting for rollout..." -ForegroundColor Yellow
kubectl rollout status deployment/web -n okiru-pro --timeout=180s
kubectl rollout status deployment/api -n okiru-pro --timeout=180s

Write-Host "=== Deployment Complete ===" -ForegroundColor Green
Write-Host "Test login at: https://okiru.20.164.101.114.nip.io/auth"
