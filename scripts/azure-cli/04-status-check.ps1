#requires -Version 5.1
<#
.SYNOPSIS
    Check status of Okiru PRO deployment in AKS
.DESCRIPTION
    Displays pod status, logs, and health checks for the application.
.PARAMETER Namespace
    The Kubernetes namespace (default: okiru-pro)
.PARAMETER Follow
    Follow logs in real-time
.PARAMETER CheckAll
    Run comprehensive health checks
.EXAMPLE
    .\04-status-check.ps1
.EXAMPLE
    .\04-status-check.ps1 -Follow
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$Namespace = "okiru-pro",

    [Parameter(Mandatory = $false)]
    [switch]$Follow,

    [Parameter(Mandatory = $false)]
    [switch]$CheckAll
)

$ErrorActionPreference = "Continue"

Write-Host "=== Okiru PRO Deployment Status ===" -ForegroundColor Cyan
Write-Host "Namespace: $Namespace"
Write-Host "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
Write-Host ""

# Pod status
Write-Host "=== Pods ===" -ForegroundColor Green
kubectl get pods -n $Namespace -o wide

# Node status
Write-Host ""
Write-Host "=== Nodes ===" -ForegroundColor Green
kubectl top node 2>$null || kubectl get nodes

# Resource usage
Write-Host ""
Write-Host "=== Resource Usage ===" -ForegroundColor Green
kubectl top pods -n $Namespace 2>$null || Write-Host "(metrics-server not available)"

# Services and endpoints
Write-Host ""
Write-Host "=== Services ===" -ForegroundColor Green
kubectl get svc -n $Namespace

Write-Host ""
Write-Host "=== Endpoints ===" -ForegroundColor Green
kubectl get endpoints -n $Namespace

# Ingress
Write-Host ""
Write-Host "=== Ingress ===" -ForegroundColor Green
kubectl get ingress -n $Namespace -o wide 2>$null || Write-Host "(no ingress found)"

# Recent events
Write-Host ""
Write-Host "=== Recent Events ===" -ForegroundColor Green
kubectl get events -n $Namespace --sort-by='.lastTimestamp' | Select-Object -Last 20

# Deployment history
Write-Host ""
Write-Host "=== Deployment History ===" -ForegroundColor Green
$deployments = @("web", "api", "compute")
foreach ($dep in $deployments) {
    Write-Host ""
    Write-Host "$dep`:"
    kubectl rollout history "deployment/$dep" -n $Namespace 2>$null | Select-Object -Last 5
}

# Health checks
if ($CheckAll) {
    Write-Host ""
    Write-Host "=== Health Checks ===" -ForegroundColor Green

    $domain = "okiru.20.164.101.114.nip.io"

    # Test via port-forward if external doesn't work
    Write-Host "Testing external endpoints..."

    try {
        $webResp = Invoke-WebRequest -Uri "https://$domain" -UseBasicParsing -TimeoutSec 10
        Write-Host "  Web (HTTPS): HTTP $($webResp.StatusCode)" -ForegroundColor Green
    } catch {
        Write-Host "  Web (HTTPS): Failed - $_" -ForegroundColor Red
    }

    try {
        $apiResp = Invoke-WebRequest -Uri "https://$domain/api/health" -UseBasicParsing -TimeoutSec 10
        Write-Host "  API Health: HTTP $($apiResp.StatusCode)" -ForegroundColor Green
    } catch {
        Write-Host "  API Health: Failed - $_" -ForegroundColor Red
    }
}

# Logs
Write-Host ""
Write-Host "=== Recent Logs ===" -ForegroundColor Green

foreach ($dep in $deployments) {
    Write-Host ""
    Write-Host "--- $dep (last 20 lines) ---" -ForegroundColor Yellow
    kubectl logs -n $Namespace "deployment/$dep" --tail=20 2>&1 | ForEach-Object { Write-Host "  $_" }
}

# Follow logs
if ($Follow) {
    Write-Host ""
    Write-Host "=== Following Web Logs (Ctrl+C to exit) ===" -ForegroundColor Cyan
    kubectl logs -n $Namespace deployment/web -f --tail=50
}

Write-Host ""
Write-Host "=== Status Check Complete ===" -ForegroundColor Green
