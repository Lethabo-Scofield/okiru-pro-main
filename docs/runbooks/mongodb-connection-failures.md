# Runbook: MongoDB Connection Failures

## Symptoms

- API pods showing `MongoNetworkError` or connection timeout errors
- Web pods unable to authenticate users
- `kubectl logs` showing: `MongoServerSelectionError: connection timed out`
- Health checks failing with database errors

## Immediate Checks

```bash
# Check MongoDB pod status
kubectl get pods -n okiru-pro -l app=mongodb

# Check MongoDB logs
kubectl logs -n okiru-pro deployment/mongodb --tail=100

# Check PVC status
kubectl get pvc -n okiru-pro

# Check if MongoDB is ready for connections
kubectl exec -it deployment/mongodb -n okiru-pro -- mongosh --eval "db.adminCommand('ping')"
```

## Common Causes and Fixes

### 1. MongoDB Pod Not Running

```bash
# Check pod events
kubectl describe pod -n okiru-pro -l app=mongodb

# If PVC is not bound
kubectl get pvc -n okiru-pro mongodb-data-pvc
kubectl describe pvc -n okiru-pro mongodb-data-pvc

# Check storage class
kubectl get storageclass
```

### 2. Authentication Failure

```bash
# Check if credentials are correct
kubectl get secret mongodb-credentials -n okiru-pro -o yaml

# Test connection manually
kubectl run mongodb-client --rm -it --image=mongo:7.0 --restart=Never -n okiru-pro -- \
  mongosh "mongodb://admin:PASSWORD@mongodb:27017" --authenticationDatabase admin

# If credentials are wrong, update the secret:
kubectl create secret generic mongodb-credentials \
  --namespace=okiru-pro \
  --from-literal=MONGO_INITDB_ROOT_USERNAME="admin" \
  --from-literal=MONGO_INITDB_ROOT_PASSWORD="CORRECT_PASSWORD" \
  --from-literal=MONGODB_URI="mongodb://admin:CORRECT_PASSWORD@mongodb:27017/okiru-pro?authSource=admin" \
  --from-literal=MONGODB_DB_NAME="okiru-pro" \
  --dry-run=client -o yaml | kubectl apply -f -

# Restart API pods to pick up new credentials
kubectl rollout restart deployment/api -n okiru-pro
```

### 3. Network Issues

```bash
# Check if MongoDB is reachable from API pod
kubectl exec -it deployment/api -n okiru-pro -- \
  sh -c "nc -zv mongodb 27017"

# Check NetworkPolicies (if enabled)
kubectl get networkpolicies -n okiru-pro

# Temporarily disable NetworkPolicies for testing
# kubectl delete networkpolicy mongodb-access -n okiru-pro
```

### 4. Resource Exhaustion

```bash
# Check MongoDB resource usage
kubectl top pod -n okiru-pro -l app=mongodb

# Check if MongoDB is OOMKilled
kubectl get pod -n okiru-pro -l app=mongodb -o yaml | grep -A5 "containerStatuses"

# If OOMKilled, increase memory limits in the deployment
# Edit: kubernetes/infrastructure/base/deployments/mongodb.yaml
```

## Recovery Procedures

### Restore from Backup

```bash
# List available backups
kubectl exec -it deployment/mongodb -n okiru-pro -- ls -la /backup

# Restore from a specific backup
kubectl exec -it deployment/mongodb -n okiru-pro -- sh -c "
  mongorestore \
    --username=admin \
    --password=PASSWORD \
    --authenticationDatabase=admin \
    --gzip \
    --drop \
    /backup/YYYYMMDD-HHMMSS
"
```

## Prevention

1. **Monitor backup jobs**: Check `kubectl get cronjobs -n okiru-pro`
2. **Set resource limits**: Ensure MongoDB has adequate CPU/memory
3. **Enable PVC monitoring**: Alert when disk usage > 80%
4. **Regular credential rotation**: Rotate passwords quarterly

## Escalation

If issues persist after trying the above:

1. Check Azure Portal for AKS cluster health
2. Verify Azure Disk status in Portal
3. Contact Azure Support if storage issues suspected
