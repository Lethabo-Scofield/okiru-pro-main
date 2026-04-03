#!/bin/bash
# Validation script for post-deployment checks
# Usage: ./validate-deployment.sh [--namespace okiru-pro-prod]

set -e

NAMESPACE="okiru-pro-prod"
VERBOSE=false
SKIP_EXTERNAL=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    --skip-external)
      SKIP_EXTERNAL=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS_COUNT=0
FAIL_COUNT=0

check_pass() {
  echo -e "${GREEN}✓${NC} $1"
  ((PASS_COUNT++))
}

check_fail() {
  echo -e "${RED}✗${NC} $1"
  ((FAIL_COUNT++))
}

check_warn() {
  echo -e "${YELLOW}⚠${NC} $1"
}

echo "=== OKIru Pro Deployment Validation ==="
echo "Namespace: $NAMESPACE"
echo ""

# Check namespace exists
if kubectl get namespace "$NAMESPACE" &> /dev/null; then
  check_pass "Namespace exists"
else
  check_fail "Namespace '$NAMESPACE' not found"
  exit 1
fi

echo ""
echo "=== Pod Status ==="
PODS=$(kubectl get pods -n "$NAMESPACE" -o name)
if [[ -n "$PODS" ]]; then
  for pod in $PODS; do
    STATUS=$(kubectl get "$pod" -n "$NAMESPACE" -o jsonpath='{.status.phase}')
    READY=$(kubectl get "$pod" -n "$NAMESPACE" -o jsonpath='{.status.containerStatuses[0].ready}')

    if [[ "$STATUS" == "Running" && "$READY" == "true" ]]; then
      check_pass "$pod is Running and Ready"
    elif [[ "$STATUS" == "Running" ]]; then
      check_warn "$pod is Running but not Ready"
    else
      check_fail "$pod status: $STATUS"
    fi

    if [[ "$VERBOSE" == true ]]; then
      kubectl get "$pod" -n "$NAMESPACE" -o wide
    fi
  done
else
  check_fail "No pods found in namespace"
fi

echo ""
echo "=== Deployment Status ==="
DEPLOYMENTS=("api" "web" "compute" "mongodb" "arangodb" "redis")
for deploy in "${DEPLOYMENTS[@]}"; do
  if kubectl get deployment "$deploy" -n "$NAMESPACE" &> /dev/null; then
    AVAILABLE=$(kubectl get deployment "$deploy" -n "$NAMESPACE" -o jsonpath='{.status.availableReplicas}')
    DESIRED=$(kubectl get deployment "$deploy" -n "$NAMESPACE" -o jsonpath='{.spec.replicas}')

    if [[ "$AVAILABLE" == "$DESIRED" ]]; then
      check_pass "Deployment '$deploy' has $AVAILABLE/$DESIRED replicas available"
    else
      check_fail "Deployment '$deploy' has $AVAILABLE/$DESIRED replicas available"
    fi
  else
    check_fail "Deployment '$deploy' not found"
  fi
done

echo ""
echo "=== Service Status ==="
SERVICES=$(kubectl get services -n "$NAMESPACE" -o name)
if [[ -n "$SERVICES" ]]; then
  for svc in $SERVICES; do
    ENDPOINTS=$(kubectl get endpoints "${svc#service/}" -n "$NAMESPACE" -o jsonpath='{.subsets[*].addresses[*].ip}' 2>/dev/null || echo "")
    if [[ -n "$ENDPOINTS" ]]; then
      check_pass "Service '${svc#service/}' has endpoints"
    else
      check_warn "Service '${svc#service/}' has no endpoints"
    fi
  done
fi

echo ""
echo "=== Ingress Status ==="
if kubectl get ingress okiru-pro-ingress -n "$NAMESPACE" &> /dev/null; then
  INGRESS_HOST=$(kubectl get ingress okiru-pro-ingress -n "$NAMESPACE" -o jsonpath='{.spec.rules[0].host}')
  check_pass "Ingress configured for host: $INGRESS_HOST"

  TLS_HOSTS=$(kubectl get ingress okiru-pro-ingress -n "$NAMESPACE" -o jsonpath='{.spec.tls[*].hosts[*]}')
  if [[ -n "$TLS_HOSTS" ]]; then
    check_pass "TLS configured for: $TLS_HOSTS"
  else
    check_warn "No TLS configuration found"
  fi
else
  check_fail "Ingress not found"
fi

echo ""
echo "=== Secrets Status ==="
REQUIRED_SECRETS=("mongodb-credentials" "arangodb-credentials" "redis-credentials" "session-secrets")
for secret in "${REQUIRED_SECRETS[@]}"; do
  if kubectl get secret "$secret" -n "$NAMESPACE" &> /dev/null; then
    check_pass "Secret '$secret' exists"
  else
    check_fail "Secret '$secret' not found"
  fi
done

echo ""
echo "=== HPA Status ==="
HPAS=$(kubectl get hpa -n "$NAMESPACE" -o name 2>/dev/null || echo "")
if [[ -n "$HPAS" ]]; then
  for hpa in $HPAS; do
    CURRENT=$(kubectl get "$hpa" -n "$NAMESPACE" -o jsonpath='{.status.currentReplicas}')
    DESIRED=$(kubectl get "$hpa" -n "$NAMESPACE" -o jsonpath='{.status.desiredReplicas}')
    MIN=$(kubectl get "$hpa" -n "$NAMESPACE" -o jsonpath='{.spec.minReplicas}')
    MAX=$(kubectl get "$hpa" -n "$NAMESPACE" -o jsonpath='{.spec.maxReplicas}')

    if [[ "$CURRENT" == "$DESIRED" ]]; then
      check_pass "HPA '${hpa#horizontalpodautoscaler.autoscaling/}': $CURRENT/$DESIRED replicas (min: $MIN, max: $MAX)"
    else
      check_warn "HPA '${hpa#horizontalpodautoscaler.autoscaling/}' scaling: $CURRENT -> $DESIRED"
    fi
  done
fi

# External health checks
echo ""
echo "=== External Health Checks ==="
if [[ "$SKIP_EXTERNAL" == false ]]; then
  HOST="dilm.172.171.47.94.nip.io"

  # Try HTTP
  if curl -sf --max-time 10 "http://$HOST/health" > /dev/null 2>&1; then
    check_pass "HTTP health check passed"
  else
    check_warn "HTTP health check failed (may be redirecting to HTTPS)"
  fi

  # Try HTTPS
  if curl -sfk --max-time 10 "https://$HOST/health" > /dev/null 2>&1; then
    check_pass "HTTPS health check passed"
  else
    check_warn "HTTPS health check failed"
  fi

  # API health check via HTTPS
  if curl -sfk --max-time 10 "https://$HOST/api/health" > /dev/null 2>&1; then
    check_pass "API health check passed"
  else
    check_warn "API health check failed"
  fi
else
  echo "Skipped (use without --skip-external to run)"
fi

echo ""
echo "=== Resource Usage ==="
kubectl top pods -n "$NAMESPACE" 2>/dev/null || echo "Metrics not available (requires metrics-server)"

echo ""
echo "=== Validation Summary ==="
echo -e "Passed: ${GREEN}$PASS_COUNT${NC}"
echo -e "Failed: ${RED}$FAIL_COUNT${NC}"

if [[ $FAIL_COUNT -gt 0 ]]; then
  echo ""
  echo "Some checks failed. Review the output above for details."
  exit 1
else
  echo ""
  echo -e "${GREEN}All validation checks passed!${NC}"
  exit 0
fi
