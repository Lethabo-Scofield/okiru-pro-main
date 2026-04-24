# Runbook: Safely Enable NetworkPolicies

**Objective:** Enable Kubernetes NetworkPolicies without breaking application connectivity.

**Risk Level:** HIGH - Can break all inter-pod communication if misconfigured.

**Prerequisites:**
- Cluster has a CNI plugin that supports NetworkPolicies (Calico, Cilium, Azure CNI with network policy enabled)
- You have cluster-admin access
- You understand the application traffic flow

---

## Phase 1: Pre-Enablement Checklist

### 1.1 Verify CNI Support

```bash
# Check if NetworkPolicies are supported
kubectl get pods -n kube-system | grep -E "(calico|cilium|azure-cni)"

# Test if policies are enforced
kubectl create -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: test-deny-all
  namespace: okiru-pro-staging
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
EOF

# Check if it was created (doesn't mean it's enforced, but verifies API availability)
kubectl get networkpolicy test-deny-all -n okiru-pro-staging

# Clean up test policy
kubectl delete networkpolicy test-deny-all -n okiru-pro-staging
```

### 1.2 Document Current Traffic Flow

```bash
# Export current services and their ports
kubectl get svc -n okiru-pro-staging -o yaml > /tmp/current-services.yaml

# Check what pods talk to what (if network monitoring available)
# If using Azure Monitor, check Network Watcher logs

# Document expected communication:
# - Web (5001) <- Ingress Controller (80/443)
# - Web (5001) -> API (5000) [internal API calls]
# - API (5000) <- Ingress Controller (80/443)
# - API (5000) -> MongoDB (27017)
# - API (5000) -> ArangoDB (8529)
# - API (5000) -> Redis (6379)
# - Compute (8000) <- API (5000)
```

### 1.3 Enable Audit Mode (If CNI Supports It)

Some CNIs support audit mode where policies are logged but not enforced.

**For Calico:**
```bash
# Set global policy to audit (log but don't block)
kubectl set env daemonset/calico-node -n calico-system FELIX_DSR_MODE=DISABLED
```

**For Cilium:**
```bash
# Enable policy audit mode
kubectl exec -it -n kube-system ds/cilium -- cilium config PolicyAuditMode=true
```

**Azure CNI:**
- Does not support audit mode - must use dry-run testing

---

## Phase 2: Dry-Run Testing

### 2.1 Apply Policies in Dry-Run Mode

```bash
# Navigate to the repo
cd kubernetes/infrastructure

# Create test namespace
kubectl create namespace netpol-test

# Copy all resources to test namespace temporarily
kubectl kustomize base > /tmp/base-manifests.yaml

# Modify the policies to only apply to test namespace
# Change all 'namespace: okiru-pro' to 'namespace: netpol-test'
sed 's/namespace: okiru-pro/namespace: netpol-test/g' \
  base/network-policies.yaml > /tmp/test-network-policies.yaml

# Apply without the blocking default-deny (commented out in original)
kubectl apply -f /tmp/test-network-policies.yaml

# Verify policies exist
kubectl get networkpolicies -n netpol-test
```

### 2.2 Test Connectivity in Isolation

```bash
# Deploy a test pod with curl/busybox
kubectl run test-client --rm -it --image=busybox:1.36 -n netpol-test -- /bin/sh

# From inside the test pod, try to reach services
nc -zv mongodb 27017
nc -zv redis 6379
nc -zv arangodb 8529
nc -zv api 5000

# If any of these fail, the policy is too restrictive
# Exit and check logs
```

### 2.3 Monitor for Denied Connections

**Check policy events:**
```bash
# Check if CNI logs denied connections
kubectl logs -n kube-system -l k8s-app=calico-node | grep -i "denied\|drop"
# OR for Cilium
kubectl logs -n kube-system -l k8s-app=cilium | grep -i "denied\|drop"
```

---

## Phase 3: Staged Rollout

### 3.1 Apply to Staging First

```bash
# Enable NetworkPolicies in staging only
cd kubernetes/infrastructure

# Un-comment the network-policies line in staging kustomization.yaml
# Edit: overlays/staging/kustomization.yaml

# Preview the changes
kubectl kustomize overlays/staging | grep -A5 "NetworkPolicy"

# Apply only NetworkPolicies first
kubectl apply -f base/network-policies.yaml -n okiru-pro-staging

# Wait and monitor
sleep 30
kubectl get events -n okiru-pro-staging --sort-by=.metadata.creationTimestamp | tail -20
```

### 3.2 Validation Steps

```bash
# 1. Check all pods are still running
kubectl get pods -n okiru-pro-staging

# 2. Check services are reachable
kubectl run test-curl --rm -it --image=curlimages/curl -n okiru-pro-staging -- \
  curl -sf http://api:5000/health

# 3. Check database connections
kubectl logs -n okiru-pro-staging -l app=api --tail=50 | grep -i "mongo\|arango\|redis"

# 4. Run full smoke tests
curl -sf https://staging.okiru.20.164.101.114.nip.io/api/health
```

### 3.3 Monitor for 24 Hours

**Metrics to watch:**
- Application error rates (should not increase)
- Database connection failures (should be 0)
- Pod restart counts (should not increase)
- Service response times (should not degrade)

**If issues detected:**
```bash
# Emergency rollback - delete all NetworkPolicies
kubectl delete networkpolicies --all -n okiru-pro-staging

# This immediately allows all traffic
```

---

## Phase 4: Production Rollout

### 4.1 Schedule Maintenance Window

- Choose low-traffic period
- Notify stakeholders
- Have rollback plan ready

### 4.2 Apply to Production

```bash
# Enable NetworkPolicies in production
# Edit: overlays/prod/kustomization.yaml
# Un-comment: - network-policies.yaml

# Apply the change
kubectl apply -k overlays/prod

# Monitor immediately
kubectl get pods -n okiru-pro
kubectl get events -n okiru-pro --sort-by=.metadata.creationTimestamp | tail -30
```

### 4.3 Validation

```bash
# Run full production smoke tests
curl -sf https://okiru.20.164.101.114.nip.io/api/health

# Check application logs for connection errors
kubectl logs -n okiru-pro -l app=api --tail=100 | grep -i "error\|fail\|timeout"

# Check all pods are ready
kubectl get pods -n okiru-pro
```

---

## Phase 5: Post-Enablement

### 5.1 Add Default Deny (Optional - Higher Security)

**WARNING:** This blocks ALL traffic by default. Only enable if all explicit policies work correctly.

```bash
# Uncomment in base/network-policies.yaml:
# ---
# # Default deny all ingress traffic
# apiVersion: networking.k8s.io/v1
# kind: NetworkPolicy
# metadata:
#   name: default-deny-ingress
#   namespace: okiru-pro
# spec:
#   podSelector: {}
#   policyTypes:
#     - Ingress

# Apply
kubectl apply -f base/network-policies.yaml -n okiru-pro
```

### 5.2 Document the Configuration

Update this runbook with:
- Date enabled
- Any issues encountered
- CNI version being used
- Any exceptions or custom rules added

---

## Emergency Procedures

### Immediate Rollback

If application becomes unreachable:

```bash
# Delete all NetworkPolicies in namespace (allows all traffic immediately)
kubectl delete networkpolicies --all -n okiru-pro

# Verify connectivity is restored
kubectl get pods -n okiru-pro
```

### Debug Connection Issues

```bash
# Check which policy is blocking
kubectl describe networkpolicy -n okiru-pro

# Test from a pod
kubectl exec -it deployment/api -n okiru-pro -- /bin/sh
nc -zv mongodb 27017

# Check policy selectors match pod labels
kubectl get pods -n okiru-pro --show-labels
kubectl get networkpolicy -n okiru-pro -o yaml | grep -A10 "podSelector"
```

---

## Troubleshooting Common Issues

### Issue: Pods Can't Reach Databases

**Symptoms:** API pods log connection errors to MongoDB/Redis/ArangoDB

**Diagnosis:**
```bash
# Check policy allows from api to database
kubectl get networkpolicy mongodb-access -n okiru-pro -o yaml
# Verify the podSelector matches the api pod labels
kubectl get pod -n okiru-pro -l app=api --show-labels
```

**Fix:** Update the policy's matchLabels or the pod's labels to match.

### Issue: Ingress Can't Reach Web/API

**Symptoms:** 504 Gateway Timeout from ingress

**Diagnosis:**
```bash
# Check ingress controller namespace labels
kubectl get namespace ingress-nginx --show-labels
# Should have: name=ingress-nginx

# If not, either:
# 1. Add label: kubectl label namespace ingress-nginx name=ingress-nginx
# 2. Update policy to match actual ingress namespace
```

### Issue: Web Can't Call Internal API

**Symptoms:** Web UI shows errors, API unreachable from web

**Diagnosis:**
```bash
# Check web-access policy
# The current policy only allows from ingress
# Internal API calls need a separate rule or web pods need direct API access
```

**Fix:** Add an egress policy from web to api or update api-access policy.

---

## Checklist Summary

| Step | Staging | Production |
|------|---------|------------|
| Verify CNI support | [ ] | [ ] |
| Document traffic flow | [ ] | [ ] |
| Dry-run test | [ ] | N/A |
| Apply policies | [ ] | [ ] |
| Validate connectivity | [ ] | [ ] |
| Monitor 24 hours | [ ] | N/A |
| Enable default deny (optional) | [ ] | [ ] |

**DO NOT proceed to Production until Staging is stable for 24+ hours.**
