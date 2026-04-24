#!/bin/bash
# Deploy OKIru Pro to Kubernetes
# Usage: ./deploy.sh [environment] [options]
#
# Environments:
#   prod     - Deploy to production
#   staging  - Deploy to staging
#
# Options:
#   --skip-build    - Skip Docker image build
#   --skip-push     - Skip pushing images to registry
#   --skip-tests    - Skip smoke tests
#   --rollback      - Rollback on failure
#   --version TAG   - Use specific image tag (default: git sha)

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || dirname "$INFRA_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT=""
SKIP_BUILD=false
SKIP_PUSH=false
SKIP_TESTS=false
ROLLBACK_ON_FAILURE=true
VERSION=""
IMAGE_TAG=""

# Parse arguments
if [[ $# -eq 0 ]]; then
  echo "Error: Environment required (prod or staging)"
  echo "Usage: $0 [prod|staging] [options]"
  exit 1
fi

ENVIRONMENT=$1
shift

if [[ "$ENVIRONMENT" != "prod" && "$ENVIRONMENT" != "staging" ]]; then
  echo "Error: Invalid environment '$ENVIRONMENT'. Use 'prod' or 'staging'"
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-build)
      SKIP_BUILD=true
      shift
      ;;
    --skip-push)
      SKIP_PUSH=true
      shift
      ;;
    --skip-tests)
      SKIP_TESTS=true
      shift
      ;;
    --no-rollback)
      ROLLBACK_ON_FAILURE=false
      shift
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Set image tag
if [[ -n "$VERSION" ]]; then
  IMAGE_TAG="$VERSION"
else
  IMAGE_TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")
fi

log() {
  echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

# Pre-deployment checks
check_prerequisites() {
  log "Checking prerequisites..."

  local required_tools=("kubectl" "kustomize" "docker")
  for tool in "${required_tools[@]}"; do
    if ! command -v "$tool" &> /dev/null; then
      error "$tool is required but not installed"
      exit 1
    fi
  done

  # Check kubectl connection
  if ! kubectl cluster-info &> /dev/null; then
    error "Cannot connect to Kubernetes cluster"
    exit 1
  fi

  # Check namespace exists
  if ! kubectl get namespace "okiru-pro-$ENVIRONMENT" &> /dev/null; then
    log "Creating namespace: okiru-pro-$ENVIRONMENT"
    kubectl create namespace "okiru-pro-$ENVIRONMENT"
  fi

  success "Prerequisites check passed"
}

# Build Docker images
build_images() {
  if [[ "$SKIP_BUILD" == true ]]; then
    log "Skipping build (--skip-build specified)"
    return
  fi

  log "Building Docker images with tag: $IMAGE_TAG"

  cd "$REPO_ROOT"

  # Build API image
  log "Building API image..."
  docker build -t "okiruproacrde4d539b.azurecr.io/okiru-pro/api:$IMAGE_TAG" \
    -f apps/api/Dockerfile apps/api/

  # Build Web image
  log "Building Web image..."
  docker build -t "okiruproacrde4d539b.azurecr.io/okiru-pro/web:$IMAGE_TAG" \
    -f apps/web/Dockerfile apps/web/

  # Build Compute image
  log "Building Compute image..."
  docker build -t "okiruproacrde4d539b.azurecr.io/okiru-pro/compute:$IMAGE_TAG" \
    -f apps/Computation-Engine/Dockerfile apps/Computation-Engine/

  success "Images built successfully"
}

# Push images to registry
push_images() {
  if [[ "$SKIP_PUSH" == true ]]; then
    log "Skipping push (--skip-push specified)"
    return
  fi

  log "Pushing images to registry..."

  docker push "okiruproacrde4d539b.azurecr.io/okiru-pro/api:$IMAGE_TAG"
  docker push "okiruproacrde4d539b.azurecr.io/okiru-pro/web:$IMAGE_TAG"
  docker push "okiruproacrde4d539b.azurecr.io/okiru-pro/compute:$IMAGE_TAG"

  success "Images pushed successfully"
}

# Deploy to Kubernetes
deploy() {
  log "Deploying to $ENVIRONMENT environment..."

  cd "$INFRA_DIR"

  # Update image tags in kustomization
  cd "overlays/$ENVIRONMENT"

  # Create temporary kustomization with new image tags
  cat kustomization.yaml | \
    sed "s/newTag: .*/newTag: $IMAGE_TAG/g" > kustomization.yaml.tmp && \
    mv kustomization.yaml.tmp kustomization.yaml

  # Apply manifests
  log "Applying Kubernetes manifests..."
  kustomize build . | kubectl apply -f -

  # Wait for rollout
  log "Waiting for deployments to be ready..."
  kubectl rollout status deployment/api -n "okiru-pro-$ENVIRONMENT" --timeout=300s
  kubectl rollout status deployment/web -n "okiru-pro-$ENVIRONMENT" --timeout=300s
  kubectl rollout status deployment/compute -n "okiru-pro-$ENVIRONMENT" --timeout=300s

  success "Deployment completed"
}

# Run smoke tests
run_smoke_tests() {
  if [[ "$SKIP_TESTS" == true ]]; then
    log "Skipping tests (--skip-tests specified)"
    return 0
  fi

  log "Running smoke tests..."

  local namespace="okiru-pro-$ENVIRONMENT"
  local host

  if [[ "$ENVIRONMENT" == "prod" ]]; then
    host="dilm.172.171.47.94.nip.io"
  else
    host="staging.dilm.172.171.47.94.nip.io"
  fi

  # Wait for ingress
  log "Waiting for ingress to be ready..."
  sleep 10

  # Test web endpoint
  log "Testing web endpoint..."
  if curl -sf "http://$host/health" > /dev/null 2>&1 || \
     curl -sfk "https://$host/health" > /dev/null 2>&1; then
    success "Web health check passed"
  else
    error "Web health check failed"
    return 1
  fi

  # Test API endpoint
  log "Testing API endpoint..."
  if curl -sf "http://$host/api/health" > /dev/null 2>&1 || \
     curl -sfk "https://$host/api/health" > /dev/null 2>&1; then
    success "API health check passed"
  else
    error "API health check failed"
    return 1
  fi

  log "Testing internal service health via kubectl..."
  kubectl exec deployment/api -n "$namespace" -- wget -qO- http://localhost:5000/health || true

  success "Smoke tests passed"
}

# Rollback on failure
rollback() {
  if [[ "$ROLLBACK_ON_FAILURE" != true ]]; then
    warn "Rollback skipped (--no-rollback specified)"
    return
  fi

  error "Deployment failed! Initiating rollback..."

  local namespace="okiru-pro-$ENVIRONMENT"

  kubectl rollout undo deployment/api -n "$namespace"
  kubectl rollout undo deployment/web -n "$namespace"
  kubectl rollout undo deployment/compute -n "$namespace"

  # Wait for rollback
  kubectl rollout status deployment/api -n "$namespace" --timeout=180s
  kubectl rollout status deployment/web -n "$namespace" --timeout=180s
  kubectl rollout status deployment/compute -n "$namespace" --timeout=180s

  warn "Rollback completed"
}

# Cleanup on exit
cleanup() {
  # Restore original kustomization if needed
  if [[ -f "$INFRA_DIR/overlays/$ENVIRONMENT/kustomization.yaml.bak" ]]; then
    mv "$INFRA_DIR/overlays/$ENVIRONMENT/kustomization.yaml.bak" \
       "$INFRA_DIR/overlays/$ENVIRONMENT/kustomization.yaml"
  fi
}

trap cleanup EXIT

# Main execution
main() {
  log "Starting deployment to $ENVIRONMENT with image tag: $IMAGE_TAG"

  check_prerequisites
  build_images
  push_images

  # Backup kustomization
  cp "$INFRA_DIR/overlays/$ENVIRONMENT/kustomization.yaml" \
     "$INFRA_DIR/overlays/$ENVIRONMENT/kustomization.yaml.bak"

  if deploy; then
    if run_smoke_tests; then
      success "Deployment to $ENVIRONMENT completed successfully!"
      log "Application available at:"
      if [[ "$ENVIRONMENT" == "prod" ]]; then
        log "  https://dilm.172.171.47.94.nip.io"
      else
        log "  http://staging.dilm.172.171.47.94.nip.io"
      fi
    else
      rollback
      exit 1
    fi
  else
    rollback
    exit 1
  fi
}

main "$@"
