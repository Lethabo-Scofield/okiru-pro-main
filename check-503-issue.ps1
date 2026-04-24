# Check 503 Service Unavailable Issue
# This script diagnoses why you're getting 503 from the ingress

$NAMESPACE = "okiru-pro"
$DOMAIN = "okiru.20.164.101.114.nip.io"

Write-Host "=== Diagnosing 503 Service Unavailable ===" -ForegroundColor Cyan
Write-Host ""

# Function to run kubectl and handle errors
function Invoke-Kubectl {
    param([string]$args)
    $result = Invoke-Expression "kubectl $args 2>&1"
    if ($LASTEXITCODE -eq 0) {
        return $result
    } else {
        Write-Host "   kubectl error: $result" -ForegroundColor Red
        return $null
    }
}

Write-Host "1. Checking if pods are actually running..." -ForegroundColor Yellow
$pods = Invoke-Kubectl "get pods -n $NAMESPACE -o wide"
if ($pods) {
    Write-Host $pods -ForegroundColor White
    
    # Count ready pods
    $readyPods = ($pods | Select-String "(\d+)/(\d+)\s+Running").Matches
    $totalReady = 0
    foreach ($match in $readyPods) {
        $ready = [int]$match.Groups[1].Value
        $totalReady += $ready
    }
    Write-Host "   Total ready pods: $totalReady" -ForegroundColor $(if($totalReady -ge 3){"Green"}else{"Red"})
}

Write-Host ""
Write-Host "2. Checking services and endpoints..." -ForegroundColor Yellow
$endpoints = Invoke-Kubectl "get endpoints -n $NAMESPACE"
if ($endpoints) {
    Write-Host $endpoints -ForegroundColor White
}

# Detailed endpoint check
Write-Host "   Detailed endpoint status:" -ForegroundColor Gray
$svcList = @("api", "web", "compute")
foreach ($svc in $svcList) {
    $ep = Invoke-Kubectl "get endpoints $svc -n $NAMESPACE -o json"
    if ($ep) {
        $hasSubsets = $ep -match '"subsets"'
        if ($hasSubsets) {
            Write-Host "   $svc: HAS ENDPOINTS" -ForegroundColor Green
        } else {
            Write-Host "   $svc: NO ENDPOINTS - pods not ready" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "3. Checking TLS certificate status..." -ForegroundColor Yellow
$certs = Invoke-Kubectl "get certificate -n $NAMESPACE"
if ($certs) {
    Write-Host $certs -ForegroundColor White
} else {
    Write-Host "   No certificates found in namespace" -ForegroundColor Gray
}

# Check cert-manager challenges
Write-Host "   Checking cert-manager orders and challenges..." -ForegroundColor Gray
$orders = Invoke-Kubectl "get order -n $NAMESPACE 2>/dev/null"
if ($orders) {
    Write-Host $orders -ForegroundColor White
} else {
    Write-Host "   (No orders found - cert-manager might not be installed or TLS secret is manual)" -ForegroundColor Gray
}

Write-Host ""
Write-Host "4. Checking ingress configuration..." -ForegroundColor Yellow
$ingress = Invoke-Kubectl "get ingress -n $NAMESPACE -o yaml"
if ($ingress) {
    # Check if TLS secret exists
    $tlsSecret = $ingress | Select-String "secretName:\s*(\S+)"
    if ($tlsSecret) {
        $secretName = $tlsSecret.Matches[0].Groups[1].Value
        Write-Host "   TLS Secret: $secretName" -ForegroundColor Cyan
        
        $secret = Invoke-Kubectl "get secret $secretName -n $NAMESPACE"
        if ($secret) {
            Write-Host "   TLS secret exists: $secretName" -ForegroundColor Green
        } else {
            Write-Host "   TLS secret NOT FOUND: $secretName" -ForegroundColor Red
            Write-Host "   This causes 503 - cert-manager may still be issuing certificate" -ForegroundColor Red
        }
    }
}

Write-Host ""
Write-Host "5. Checking ingress controller logs..." -ForegroundColor Yellow
$nginxPod = Invoke-Kubectl "get pods -n ingress-nginx -l app.kubernetes.io/name=ingress-nginx -o name 2>/dev/null | head -1"
if ($nginxPod) {
    Write-Host "   Found ingress controller: $nginxPod" -ForegroundColor Green
    Write-Host "   Recent errors:" -ForegroundColor Yellow
    $logs = Invoke-Kubectl "logs $nginxPod -n ingress-nginx --tail=50 2>/dev/null | grep -i '$DOMAIN\|error\|503'"
    if ($logs) {
        Write-Host $logs -ForegroundColor Red
    } else {
        Write-Host "   (No relevant errors found in recent logs)" -ForegroundColor Gray
    }
} else {
    Write-Host "   Could not find ingress-nginx pod (might be in different namespace)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "6. Testing different endpoints..." -ForegroundColor Yellow

# Test HTTP directly
Write-Host "   Testing HTTP (should work if pods are healthy):" -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "http://$DOMAIN" -MaximumRedirection 0 -TimeoutSec 10 -UseBasicParsing -ErrorAction SilentlyContinue
    Write-Host "   HTTP Status: $($response.StatusCode)" -ForegroundColor Green
} catch {
    $status = $_.Exception.Response.StatusCode.Value__
    Write-Host "   HTTP Error: $status" -ForegroundColor $(if($status -eq 301 -or $status -eq 308){"Yellow"}else{"Red"})
}

# Test HTTPS
Write-Host "   Testing HTTPS (may fail with certificate error):" -ForegroundColor Gray
try {
    $response = Invoke-WebRequest -Uri "https://$DOMAIN" -MaximumRedirection 0 -TimeoutSec 10 -UseBasicParsing -SkipCertificateCheck -ErrorAction SilentlyContinue
    Write-Host "   HTTPS Status: $($response.StatusCode)" -ForegroundColor Green
} catch {
    $status = $_.Exception.Response.StatusCode.Value__
    if ($status -eq 503) {
        Write-Host "   HTTPS Error: 503 Service Unavailable" -ForegroundColor Red
        Write-Host "   This confirms the issue is with the backend or TLS" -ForegroundColor Red
    } else {
        Write-Host "   HTTPS Error: $status" -ForegroundColor $(if($status -in @(301,302,307,308)){"Yellow"}else{"Red"})
    }
}

Write-Host ""
Write-Host "=== Common 503 Causes ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "A. Backend pods not ready" -ForegroundColor Yellow
Write-Host "   - Check: kubectl get pods -n $NAMESPACE" -ForegroundColor White
Write-Host "   - Fix: Wait for pods to be Running and Ready (0/1 → 1/1)" -ForegroundColor White
Write-Host ""
Write-Host "B. Health check endpoint failing" -ForegroundColor Yellow
Write-Host "   - The deployment has /health endpoint configured" -ForegroundColor White
Write-Host "   - Check: kubectl logs <pod> -n $NAMESPACE" -ForegroundColor White
Write-Host ""
Write-Host "C. TLS certificate not ready (most likely for new deployments)" -ForegroundColor Yellow
Write-Host "   - cert-manager needs time to issue Let's Encrypt certificate" -ForegroundColor White
Write-Host "   - Check: kubectl describe certificate okiru-pro-tls -n $NAMESPACE" -ForegroundColor White
Write-Host "   - Fix: Wait 2-5 minutes for certificate to be issued" -ForegroundColor White
Write-Host ""
Write-Host "D. Service selector mismatch" -ForegroundColor Yellow
Write-Host "   - Service has selector: app=api|web|compute" -ForegroundColor White
Write-Host "   - Pods must have label: app=api|web|compute" -ForegroundColor White
Write-Host "   - Check: kubectl get pods -n $NAMESPACE --show-labels" -ForegroundColor White
Write-Host ""

Write-Host "=== Next Steps ===" -ForegroundColor Cyan
Write-Host "1. If pods show 0/1 Ready: Check pod logs with 'kubectl logs <pod-name> -n $NAMESPACE'" -ForegroundColor Cyan
Write-Host "2. If TLS secret missing: Wait for cert-manager or check 'kubectl describe order -n $NAMESPACE'" -ForegroundColor Cyan
Write-Host "3. Test HTTP first to isolate HTTPS/TLS issues: curl -I http://$DOMAIN" -ForegroundColor Cyan
