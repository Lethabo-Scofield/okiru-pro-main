# OKIru Pro - AKS Kubernetes Deployment

Complete Kubernetes manifests for deploying the OKIru Pro application on Azure Kubernetes Service (AKS).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Azure Load Balancer                         │
│                    (Nginx Ingress Controller)                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
      ┌─────▼─────┐          ┌─────▼─────┐          ┌─────▼─────┐
      │  okiru-   │          │  api.     │          │ compute.  │
      │  pro.com  │          │okiru-pro  │          │okiru-pro  │
      └─────┬─────┘          └─────┬─────┘          └─────┬─────┘
            │                       │                       │
      ┌─────▼─────┐          ┌─────▼─────┐          ┌─────▼─────┐
      │   Web     │          │    API    │          │ Compute   │
      │  (2 pods) │          │  (2 pods) │          │ (1-4 pods)│
      └───────────┘          └─────┬─────┘          └───────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
        ┌─────▼─────┐        ┌─────▼─────┐        ┌─────▼─────┐
        │  MongoDB  │        │  ArangoDB │        │   Redis   │
        │  (1 pod)  │        │  (1 pod)  │        │  (1 pod)  │
        └───────────┘        └───────────┘        └───────────┘
```

## Prerequisites

- Azure CLI (`az`)
- Kubernetes CLI (`kubectl`)
- Helm (for installing ingress-nginx and cert-manager)
- An AKS cluster running
- Azure Container Registry (ACR) with images pushed

## File Structure

| File | Description |
|------|-------------|
| `01-namespace.yaml` | Application namespace |
| `02-storage-classes.yaml` | Azure Disk storage classes |
| `03-secrets.yaml` | Secret templates (requires editing) |
| `04-configmap.yaml` | Non-sensitive configuration |
| `05-pvc-mongodb.yaml` | MongoDB PersistentVolumeClaim |
| `06-pvc-arangodb.yaml` | ArangoDB PersistentVolumeClaim |
| `07-pvc-redis.yaml` | Redis PersistentVolumeClaim |
| `08-deployment-mongodb.yaml` | MongoDB deployment |
| `09-deployment-arangodb.yaml` | ArangoDB deployment |
| `10-deployment-redis.yaml` | Redis deployment |
| `11-deployment-api.yaml` | API service deployment |
| `12-deployment-web.yaml` | Web frontend deployment |
| `13-deployment-compute.yaml` | Computation engine deployment |
| `14-services.yaml` | All ClusterIP services |
| `15-cluster-issuer.yaml` | Let's Encrypt SSL issuer |
| `16-ingress.yaml` | Nginx ingress rules |
| `17-hpa.yaml` | Horizontal Pod Autoscalers |

## Quick Start

### 1. Configure Secrets

Edit `03-secrets.yaml` and replace placeholder values:

```bash
# Generate secure passwords
openssl rand -base64 32  # For MongoDB
openssl rand -base64 32  # For ArangoDB
openssl rand -base64 32  # For JWT
```

Create the ACR pull secret:

```bash
kubectl create secret docker-registry acr-pull-secret \
  --namespace okiru-pro \
  --docker-server=yourregistry.azurecr.io \
  --docker-username=your-acr-username \
  --docker-password=your-acr-password
```

### 2. Install Ingress Nginx

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz
```

### 3. Install cert-manager

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update

helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager \
  --create-namespace \
  --set installCRDs=true
```

### 4. Deploy Application

```bash
# Apply all manifests in order
kubectl apply -f 01-namespace.yaml
kubectl apply -f 02-storage-classes.yaml
kubectl apply -f 03-secrets.yaml
kubectl apply -f 04-configmap.yaml
kubectl apply -f 05-pvc-mongodb.yaml
kubectl apply -f 06-pvc-arangodb.yaml
kubectl apply -f 07-pvc-redis.yaml
kubectl apply -f 08-deployment-mongodb.yaml
kubectl apply -f 09-deployment-arangodb.yaml
kubectl apply -f 10-deployment-redis.yaml
kubectl apply -f 11-deployment-api.yaml
kubectl apply -f 12-deployment-web.yaml
kubectl apply -f 13-deployment-compute.yaml
kubectl apply -f 14-services.yaml
kubectl apply -f 15-cluster-issuer.yaml
kubectl apply -f 16-ingress.yaml
kubectl apply -f 17-hpa.yaml
```

Or simply:

```bash
kubectl apply -f .
```

### 5. Verify Deployment

```bash
# Check all pods
kubectl get pods -n okiru-pro

# Check services
kubectl get svc -n okiru-pro

# Check ingress
kubectl get ingress -n okiru-pro

# Check certificates
kubectl get certificates -n okiru-pro
```

## Resource Allocation

| Service | CPU Request | CPU Limit | Memory Request | Memory Limit | Replicas |
|---------|-------------|-----------|----------------|--------------|----------|
| API | 250m | 500m | 256Mi | 512Mi | 2-6 |
| Web | 250m | 500m | 256Mi | 512Mi | 2-6 |
| Compute | 500m | 1000m | 512Mi | 1Gi | 1-4 |
| MongoDB | 250m | 500m | 512Mi | 1Gi | 1 |
| ArangoDB | 250m | 500m | 512Mi | 1Gi | 1 |
| Redis | 100m | 250m | 128Mi | 256Mi | 1 |

**Total Estimated Cost: ~$80-100/month**

## Scaling

### Manual Scaling

```bash
# Scale API to 4 replicas
kubectl scale deployment api --replicas=4 -n okiru-pro
```

### Update HPA

```bash
kubectl edit hpa api-hpa -n okiru-pro
```

## Monitoring

### View Pod Logs

```bash
# API logs
kubectl logs -f deployment/api -n okiru-pro

# Web logs
kubectl logs -f deployment/web -n okiru-pro

# Compute logs
kubectl logs -f deployment/compute -n okiru-pro
```

### Resource Usage

```bash
kubectl top pods -n okiru-pro
kubectl top nodes
```

## Backup Strategy

### MongoDB Backup

```bash
# Create backup job
kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: CronJob
metadata:
  name: mongodb-backup
  namespace: okiru-pro
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: mongodump
            image: mongo:7.0
            command:
            - sh
            - -c
            - mongodump --host=mongodb --username=admin --password=$MONGO_PASSWORD --out=/backup/$(date +%Y%m%d)
            env:
            - name: MONGO_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: mongodb-credentials
                  key: MONGO_INITDB_ROOT_PASSWORD
          restartPolicy: OnFailure
EOF
```

## Troubleshooting

### Pod Stuck Pending

```bash
# Check events
kubectl get events -n okiru-pro --sort-by='.lastTimestamp'

# Check PVC status
kubectl get pvc -n okiru-pro
```

### SSL Certificate Issues

```bash
# Check certificate status
kubectl describe certificate okiru-pro-tls -n okiru-pro

# Check cert-manager logs
kubectl logs -n cert-manager deployment/cert-manager
```

### Database Connection Issues

```bash
# Test MongoDB connection
kubectl run mongodb-client --rm -it --image=mongo:7.0 --restart=Never -n okiru-pro -- mongosh mongodb://mongodb:27017 --username admin --password

# Test Redis connection
kubectl run redis-client --rm -it --image=redis:7-alpine --restart=Never -n okiru-pro -- redis-cli -h redis -a $(kubectl get secret redis-credentials -n okiru-pro -o jsonpath='{.data.REDIS_PASSWORD}' | base64 -d) ping
```

## Security Notes

1. **Secrets**: Never commit `03-secrets.yaml` with real values to Git. Use external secret management like Azure Key Vault for production.

2. **Network Policies**: Consider adding NetworkPolicies to restrict pod-to-pod communication.

3. **Pod Security**: All containers run as non-root with read-only root filesystems.

4. **RBAC**: Use least-privilege RBAC for service accounts.

## Cleanup

```bash
# Delete everything
kubectl delete namespace okiru-pro

# Or delete individual resources
kubectl delete -f .
```

## Support

For issues or questions, please refer to the project documentation or create an issue.
