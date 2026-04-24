# Diagnostic script for production cluster
# Run this to check the state of the okiru-pro namespace

$NAMESPACE = "okiru-pro"

Write-Host "=== Checking Production Cluster Status ===" -ForegroundColor Cyan
Write-Host ""

# Check if connected to cluster
Write-Host "1. Checking cluster connection..." -ForegroundColor Yellow
try {
    $nodes = kubectl get nodes 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   Connected to cluster" -ForegroundColor Green
        $nodes | Select-String "Ready"
    } else {
        Write-Host "   ERROR: Cannot connect to cluster" -ForegroundColor Red
        Write-Host "   Run: az aks get-credentials --resource-group <rg> --name <cluster>"
        exit 1
    }
} catch {
    Write-Host "   ERROR: kubectl not available" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "2. Checking pods in $NAMESPACE namespace..." -ForegroundColor Yellow
$pods = kubectl get pods -n $NAMESPACE -o wide 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host $pods -ForegroundColor White
    
    # Check for non-running pods
    $notRunning = $pods | Select-String "(Pending|CrashLoopBackOff|Error|Failed|Unknown)"
    if ($notRunning) {
        Write-Host "   WARNING: Some pods are not running!" -ForegroundColor Red
    }
} else {
    Write-Host "   ERROR: Cannot get pods" -ForegroundColor Red
}

Write-Host ""
Write-Host "3. Checking pod details (looking for issues)..." -ForegroundColor Yellow
$podList = kubectl get pods -n $NAMESPACE -o jsonpath="{.items[*].metadata.name}" 2>&1
if ($LASTEXITCODE -eq 0) {
    foreach ($pod in $podList.Split(" ")) {
        if ($pod -match "(api|web|compute)") {
            Write-Host "   Checking $pod..." -ForegroundColor Gray
            $status = kubectl get pod $pod -n $NAMESPACE -o jsonpath="{.status.phase}" 2>&1
            if ($status -ne "Running") {
                Write-Host "   Pod $pod status: $status" -ForegroundColor Red
                Write-Host "   Describing $pod..." -ForegroundColor Yellow
                kubectl describe pod $pod -n $NAMESPACE | Select-String "(Events:|Reason|Message|Error)" | Select-Object -First 10
                Write-Host "   Recent logs for $pod:" -ForegroundColor Yellow
                kubectl logs $pod -n $NAMESPACE --tail=10 2>&1 | Select-Object -First 10
            }
        }
    }
}

Write-Host ""
Write-Host "4. Checking service endpoints..." -ForegroundColor Yellow
$services = kubectl get svc -n $NAMESPACE 2>&1
Write-Host $services -ForegroundColor White

# Check if services have endpoints
Write-Host "   Service Endpoints:" -ForegroundColor Gray
$svcList = @("api", "web", "compute")
foreach ($svc in $svcList) {
    $endpoints = kubectl get endpoints $svc -n $NAMESPACE -o jsonpath="{.subsets[*].addresses[*].ip}" 2>&1
    if ($endpoints -and $endpoints -ne "") {
        Write-Host "   $svc endpoints: $endpoints" -ForegroundColor Green
    } else {
        Write-Host "   $svc: NO ENDPOINTS (pods not ready or selector mismatch)" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "5. Checking ingress..." -ForegroundColor Yellow
$ingress = kubectl get ingress -n $NAMESPACE 2>&1
Write-Host $ingress -ForegroundColor White

Write-Host ""
Write-Host "6. Testing health endpoints from within cluster..." -ForegroundColor Yellow
# Port-forward to test locally
Write-Host "   (Would need to port-forward to test, skipping for now)" -ForegroundColor Gray

Write-Host ""
Write-Host "7. Recent events (errors/warnings)..." -ForegroundColor Yellow
kubectl get events -n $NAMESPACE --sort-by=".lastTimestamp" | Select-String "(Warning|Error|Failed)" | Select-Object -Last 10

Write-Host ""
Write-Host "=== Diagnostics Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Common 503 Causes:" -ForegroundColor Yellow
Write-Host "  - Pods stuck in Init state (waiting for databases)" -ForegroundColor White
Write-Host "  - Health check endpoint (/health) not responding" -ForegroundColor White
Write-Host "  - Service selector not matching pod labels" -ForegroundColor White
Write-Host "  - Port mismatch between container and service" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  - If pods are in Init:0/2: Check if mongodb/redis are running" -ForegroundColor Cyan
Write-Host "  - If pods are Running but 0/1 Ready: Check health endpoint" -ForegroundColor Cyan
Write-Host "  - Run: kubectl describe pod <pod-name> -n $NAMESPACE" -ForegroundColor Cyan
