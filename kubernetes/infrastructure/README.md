# OKIru Pro Kubernetes Infrastructure

This directory contains the Kubernetes infrastructure manifests for deploying the OKIru Pro B-BBEE Compliance Platform.

## Architecture Overview

The infrastructure is organized using **Kustomize** with a base/overlays pattern, inspired by the `sim` repository structure:

```
.
├── base/                    # Base Kubernetes manifests
│   ├── deployments/         # Application deployments
│   ├── services/           # Service definitions
│   ├── configmaps/         # Non-sensitive configuration
│   ├── storage/            # PVCs and storage classes
│   ├── ingress/            # Ingress rules
│   └── secrets/            # Secret templates
├── overlays/               # Environment-specific overlays
│   ├── prod/              # Production environment
│   └── staging/           # Staging environment
├── scripts/               # Deployment and utility scripts
└── cert-manager/          # TLS certificate configuration
```

## Services

| Service | Type | Port | Description |
|---------|------|------|-------------|
| web | Node.js/React | 5001 | Frontend UI server |
| api | Node.js/Express | 5000 | Main API backend |
| compute | Python/FastAPI | 8000 | Computation engine |
| mongodb | MongoDB 7 | 27017 | Document database |
| arangodb | ArangoDB 3.11 | 8529 | Graph database |
| redis | Redis 7 | 6379 | Cache and sessions |

## Prerequisites

- Kubernetes cluster (AKS, EKS, GKE, or on-prem)
- kubectl configured with cluster access
- Kustomize v5.0+
- Docker (for local builds)
- Azure Container Registry (or alternative)
- cert-manager (for TLS) - optional
- NGINX Ingress Controller

## Directory Structure

```
kubernetes/infrastructure/
├── base/
│   ├── kustomization.yaml
│   ├── namespace.yaml
│   ├── configmaps/
│   │   ├── app-config.yaml
│   │   ├── mongodb-config.yaml
│   │   ├── arangodb-config.yaml
│   │   └── redis-config.yaml
│   ├── deployments/
│   │   ├── api.yaml
│   │   ├── web.yaml
│   │   ├── compute.yaml
│   │   ├── mongodb.yaml
│   │   ├── arangodb.yaml
│   │   ├── redis.yaml
│   │   └── hpa.yaml
│   ├── services/
│   │   └── services.yaml
│   ├── storage/
│   │   ├── storage-classes.yaml
│   │   ├── pvc-mongodb.yaml
│   │   ├── pvc-arangodb.yaml
│   │   └── pvc-redis.yaml
│   ├── ingress/
│   │   └── ingress.yaml
│   └── secrets/
│       └── secrets-template.yaml
├── overlays/
│   ├── prod/
│   │   ├── kustomization.yaml
│   │   ├── patches/
│   │   │   ├── ingress-patch.yaml
│   │   │   ├── resource-limits.yaml
│   │   │   ├── replica-count.yaml
│   │   │   └── configmap-patch.yaml
│   │   └── secrets/
│   │       └── secrets.yaml
│   └── staging/
│       ├── kustomization.yaml
│       └── patches/
│           ├── ingress-patch.yaml
│           ├── resource-limits.yaml
│           └── replica-count.yaml
├── scripts/
│   ├── deploy.sh
│   ├── create-secrets-from-env.sh
│   └── validate-deployment.sh
└── cert-manager/
    └── cluster-issuer.yaml
```

## Quick Start

### 1. Local Development

```bash
# Start all services with Docker Compose
cd okiru-pro-main
docker-compose -f docker-compose.production.yml up
```

### 2. Deploy to Staging

```bash
cd kubernetes/infrastructure/scripts
./deploy.sh staging
```

### 3. Deploy to Production

```bash
cd kubernetes/infrastructure/scripts
./deploy.sh prod --version v1.0.0
```

## Configuration

### Environment Variables

Create a `.env.production` file with the following structure:

```bash
# MongoDB
MONGO_INITDB_ROOT_USERNAME=admin
MONGO_INITDB_ROOT_PASSWORD=your_secure_password
MONGODB_URI=mongodb://admin:your_secure_password@mongodb:27017/okiru-pro?authSource=admin
MONGODB_DB_NAME=okiru-pro

# ArangoDB
ARANGO_ROOT_PASSWORD=your_secure_password
ARANGO_URL=http+tcp://root:your_secure_password@arangodb:8529
ARANGO_DB_NAME=okiru_pro

# Redis
REDIS_PASSWORD=your_secure_password
REDIS_URL=redis://:your_secure_password@redis:6379/0

# Session/JWT
JWT_SECRET=your_64_character_random_string
SESSION_SECRET=your_64_character_random_string
API_INTERNAL_KEY=your_internal_api_key

# External APIs
AZURE_OPENAI_API_KEY=your_azure_openai_key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
GROQ_API_KEY=your_groq_key
```

### Secret Mapping

| .env.production Key | Kubernetes Secret | Secret Key |
|--------------------|--------------------|------------|
| MONGO_INITDB_ROOT_USERNAME | mongodb-credentials | MONGO_INITDB_ROOT_USERNAME |
| MONGO_INITDB_ROOT_PASSWORD | mongodb-credentials | MONGO_INITDB_ROOT_PASSWORD |
| MONGODB_URI | mongodb-credentials | MONGODB_URI |
| MONGODB_DB_NAME | mongodb-credentials | MONGODB_DB_NAME |
| ARANGO_ROOT_PASSWORD | arangodb-credentials | ARANGO_ROOT_PASSWORD |
| ARANGO_URL | arangodb-credentials | ARANGO_URL |
| ARANGO_DB_NAME | arangodb-credentials | ARANGO_DB_NAME |
| REDIS_PASSWORD | redis-credentials | REDIS_PASSWORD |
| REDIS_URL | redis-credentials | REDIS_URL |
| JWT_SECRET | session-secrets | JWT_SECRET |
| SESSION_SECRET | session-secrets | SESSION_SECRET |
| API_INTERNAL_KEY | session-secrets | API_INTERNAL_KEY |
| AZURE_OPENAI_API_KEY | external-api-keys | AZURE_OPENAI_API_KEY |
| AZURE_OPENAI_ENDPOINT | external-api-keys | AZURE_OPENAI_ENDPOINT |
| GROQ_API_KEY | external-api-keys | GROQ_API_KEY |

### Generating Secrets

```bash
# From .env.production file
./scripts/create-secrets-from-env.sh --env-file .env.production --namespace okiru-pro-prod --apply
```

## Ingress Configuration

The ingress is configured to use `dilm.172.171.47.94.nip.io` as the production domain.

### Routes

| Path | Service | Target |
|------|---------|--------|
| / | web | web:5001 |
| /api | api | api:5000 |
| /compute | compute | compute:8000 |

### TLS

TLS is automatically provisioned via cert-manager with Let's Encrypt:

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Apply ClusterIssuers and Certificates
kubectl apply -f cert-manager/cluster-issuer.yaml
```

## Health Checks

All services include:

- **Liveness Probe**: `/health` - Restarts container if unhealthy
- **Readiness Probe**: `/health` - Controls traffic routing
- **Startup Probe**: `/health` - Allows slow-starting containers

## Horizontal Pod Autoscaling

| Service | Min Replicas | Max Replicas | CPU Target | Memory Target |
|---------|--------------|--------------|------------|---------------|
| api | 3 | 10 | 70% | 80% |
| web | 3 | 10 | 70% | 80% |
| compute | 2 | 8 | 70% | 80% |

## Rollback

### Automatic Rollback

The CI/CD pipeline automatically rolls back if smoke tests fail:

1. Deployment fails health checks
2. Pipeline triggers `kubectl rollout undo`
3. Previous revision is restored within seconds

### Manual Rollback

```bash
# View rollout history
kubectl rollout history deployment/api -n okiru-pro-prod

# Rollback to previous version
kubectl rollout undo deployment/api -n okiru-pro-prod

# Rollback to specific revision
kubectl rollout undo deployment/api -n okiru-pro-prod --to-revision=2

# Rollback all services
for deploy in api web compute; do
  kubectl rollout undo deployment/$deploy -n okiru-pro-prod
done
```

## Validation

Run post-deployment validation:

```bash
# Validate deployment
./scripts/validate-deployment.sh --namespace okiru-pro-prod

# With verbose output
./scripts/validate-deployment.sh --namespace okiru-pro-prod --verbose
```

## CI/CD Pipeline (GitHub Actions)

The deployment is automated via `.github/workflows/deploy-prod.yml`:

1. **Build**: Docker images built with Git SHA tag
2. **Push**: Images pushed to ACR
3. **Secrets**: Created from GitHub Secrets
4. **Deploy**: Kustomize applies to cluster
5. **Validate**: Smoke tests verify health endpoints
6. **Rollback**: Automatic rollback on failure

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `KUBECONFIG_PROD` | Base64-encoded kubeconfig for production cluster |
| `ACR_USERNAME` | Azure Container Registry username |
| `ACR_PASSWORD` | Azure Container Registry password |
| `MONGO_INITDB_ROOT_USERNAME` | MongoDB root username |
| `MONGO_INITDB_ROOT_PASSWORD` | MongoDB root password |
| `MONGODB_URI` | MongoDB connection URI |
| `MONGODB_DB_NAME` | MongoDB database name |
| `ARANGO_ROOT_PASSWORD` | ArangoDB root password |
| `ARANGO_URL` | ArangoDB connection URL |
| `ARANGO_DB_NAME` | ArangoDB database name |
| `REDIS_PASSWORD` | Redis password |
| `REDIS_URL` | Redis connection URL |
| `JWT_SECRET` | JWT signing secret |
| `SESSION_SECRET` | Session encryption secret |
| `API_INTERNAL_KEY` | Internal API communication key |
| `AZURE_OPENAI_API_KEY` | Azure OpenAI API key |
| `AZURE_OPENAI_ENDPOINT` | Azure OpenAI endpoint URL |
| `GROQ_API_KEY` | Groq API key |

## Production Parity Testing

To ensure local development matches production:

### End-to-End Flows

1. User authentication
2. B-BBEE score calculation
3. Document upload and processing
4. Report generation
5. Data export

### Health Endpoints

```bash
# Web health
curl https://dilm.172.171.47.94.nip.io/health

# API health
curl https://dilm.172.171.47.94.nip.io/api/health

# Compute health (internal)
kubectl exec deployment/api -n okiru-pro-prod -- wget -qO- http://compute:8000/health
```

### Feature Flags

Verify feature flags are correctly set in production ConfigMaps:

```bash
kubectl get configmap app-config -n okiru-pro-prod -o yaml
```

## Disaster Recovery

### Backup Strategy

```bash
# MongoDB backup
kubectl exec deployment/mongodb -n okiru-pro-prod -- mongodump --archive --gzip > mongodb-backup-$(date +%Y%m%d).gz

# ArangoDB backup
kubectl exec deployment/arangodb -n okiru-pro-prod -- arangodump --output-directory /tmp/backup
kubectl cp okiru-pro-prod/$(kubectl get pod -l app=arangodb -n okiru-pro-prod -o jsonpath='{.items[0].metadata.name}'):/tmp/backup ./arangodb-backup-$(date +%Y%m%d)
```

### Recovery Commands

```bash
# Restore MongoDB
kubectl exec -i deployment/mongodb -n okiru-pro-prod -- mongorestore --archive --gzip < mongodb-backup-YYYYMMDD.gz

# Restore ArangoDB
kubectl cp ./arangodb-backup-YYYYMMDD okiru-pro-prod/$(kubectl get pod -l app=arangodb -n okiru-pro-prod -o jsonpath='{.items[0].metadata.name}'):/tmp/backup
kubectl exec deployment/arangodb -n okiru-pro-prod -- arangorestore --input-directory /tmp/backup
```

## Troubleshooting

### View Logs

```bash
# Application logs
kubectl logs -l app=api -n okiru-pro-prod --tail=100 -f

# Previous container logs (after crash)
kubectl logs -l app=api -n okiru-pro-prod --previous

# All pods in namespace
kubectl logs -n okiru-pro-prod --all-containers
```

### Common Issues

**Issue**: Pods stuck in Pending
```bash
# Check events
kubectl get events -n okiru-pro-prod --sort-by='.lastTimestamp'

# Check PVC status
kubectl get pvc -n okiru-pro-prod
```

**Issue**: ImagePullBackOff
```bash
# Verify ACR credentials
kubectl get secret acr-pull-secret -n okiru-pro-prod

# Check image exists
docker pull okiruproacrde4d539b.azurecr.io/okiru-pro/api:latest
```

**Issue**: CrashLoopBackOff
```bash
# Check container logs
kubectl logs deployment/api -n okiru-pro-prod

# Check resource limits
kubectl describe pod -l app=api -n okiru-pro-prod
```

## Resource Limits

### Production

| Service | CPU Request | CPU Limit | Memory Request | Memory Limit |
|---------|-------------|-----------|----------------|--------------|
| api | 500m | 1000m | 512Mi | 1Gi |
| web | 500m | 1000m | 512Mi | 1Gi |
| compute | 1000m | 2000m | 1Gi | 2Gi |
| mongodb | 500m | 1000m | 1Gi | 2Gi |
| arangodb | 500m | 1000m | 1Gi | 2Gi |
| redis | 100m | 250m | 128Mi | 256Mi |

### Staging

| Service | CPU Request | CPU Limit | Memory Request | Memory Limit |
|---------|-------------|-----------|----------------|--------------|
| api | 250m | 500m | 256Mi | 512Mi |
| web | 250m | 500m | 256Mi | 512Mi |
| compute | 500m | 1000m | 512Mi | 1Gi |
| mongodb | 250m | 500m | 512Mi | 1Gi |
| arangodb | 250m | 500m | 512Mi | 1Gi |
| redis | 100m | 250m | 128Mi | 256Mi |

## Security Considerations

- All containers run as non-root (UID 1000)
- Read-only root filesystems
- Security contexts with dropped capabilities
- Secrets never committed to Git
- Network policies can be added for additional isolation
- Regular base image updates recommended

## Support

For issues or questions:
- Check the troubleshooting section above
- Review application logs
- Validate resource usage
- Verify secret configuration
