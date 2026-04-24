#!/bin/bash
# Create Kubernetes Secrets from .env.production file
# Usage: ./create-secrets-from-env.sh --env-file /path/to/.env.production --namespace okiru-pro-prod
#
# This script converts a .env.production file into Kubernetes Secrets.
# It maps environment variables to the appropriate Secret resources.

set -e

# Default values
ENV_FILE=""
NAMESPACE="okiru-pro-prod"
DRY_RUN=false
APPLY=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --namespace)
      NAMESPACE="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --apply)
      APPLY=true
      shift
      ;;
    --help)
      echo "Usage: $0 [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --env-file PATH     Path to .env.production file"
      echo "  --namespace NAME    Kubernetes namespace (default: okiru-pro-prod)"
      echo "  --dry-run           Output generated secrets without applying"
      echo "  --apply             Apply secrets to cluster (requires kubectl)"
      echo "  --help              Show this help message"
      echo ""
      echo "Environment Variables Mapping:"
      echo "  MONGO_*             -> mongodb-credentials"
      echo "  ARANGO_*            -> arangodb-credentials"
      echo "  REDIS_*             -> redis-credentials"
      echo "  JWT_SECRET          -> session-secrets"
      echo "  SESSION_SECRET      -> session-secrets"
      echo "  API_INTERNAL_KEY    -> session-secrets"
      echo "  ACR_*               -> acr-pull-secret"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$ENV_FILE" ]]; then
  echo "Error: --env-file is required"
  echo "Run with --help for usage information"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: File not found: $ENV_FILE"
  exit 1
fi

echo "Reading secrets from: $ENV_FILE"
echo "Target namespace: $NAMESPACE"
echo ""

# Load environment variables from file
set -a
source "$ENV_FILE"
set +a

# Function to create a secret manifest
create_secret_manifest() {
  local name=$1
  shift
  local data=()

  for key in "$@"; do
    local value="${!key}"
    if [[ -n "$value" ]]; then
      local encoded_value=$(echo -n "$value" | base64 | tr -d '\n')
      data+=("    $key: $encoded_value")
    fi
  done

  if [[ ${#data[@]} -eq 0 ]]; then
    echo "Warning: No data for secret $name, skipping..."
    return
  fi

  cat <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: $name
  namespace: $NAMESPACE
type: Opaque
data:
$(IFS=$'\n'; echo "${data[*]}")
---
EOF
}

# Generate mongodb-credentials secret
echo "Generating mongodb-credentials secret..."
MONGO_SECRET=$(create_secret_manifest "mongodb-credentials" \
  "MONGO_INITDB_ROOT_USERNAME" \
  "MONGO_INITDB_ROOT_PASSWORD" \
  "MONGODB_URI" \
  "MONGODB_DB_NAME")

# Generate arangodb-credentials secret
echo "Generating arangodb-credentials secret..."
ARANGO_SECRET=$(create_secret_manifest "arangodb-credentials" \
  "ARANGO_ROOT_PASSWORD" \
  "ARANGO_URL" \
  "ARANGO_DB_NAME")

# Generate redis-credentials secret
echo "Generating redis-credentials secret..."
REDIS_SECRET=$(create_secret_manifest "redis-credentials" \
  "REDIS_PASSWORD" \
  "REDIS_URL")

# Generate session-secrets secret
echo "Generating session-secrets secret..."
SESSION_SECRET=$(create_secret_manifest "session-secrets" \
  "JWT_SECRET" \
  "SESSION_SECRET" \
  "API_INTERNAL_KEY")

# Generate external-api-keys secret
echo "Generating external-api-keys secret..."
EXTERNAL_SECRET=$(create_secret_manifest "external-api-keys" \
  "AZURE_OPENAI_API_KEY" \
  "AZURE_OPENAI_ENDPOINT" \
  "GROQ_API_KEY" \
  "SENDGRID_API_KEY" \
  "SMTP_PASSWORD")

# Combine all secrets
ALL_SECRETS="${MONGO_SECRET}${ARANGO_SECRET}${REDIS_SECRET}${SESSION_SECRET}${EXTERNAL_SECRET}"

# Output or apply
if [[ "$DRY_RUN" == true ]]; then
  echo ""
  echo "=== GENERATED SECRET MANIFESTS ==="
  echo "$ALL_SECRETS"
elif [[ "$APPLY" == true ]]; then
  echo ""
  echo "Applying secrets to namespace: $NAMESPACE"
  echo "$ALL_SECRETS" | kubectl apply -f -
  echo "Secrets applied successfully!"
else
  # Default: output to stdout with instructions
  echo ""
  echo "=== GENERATED SECRET MANIFESTS ==="
  echo "$ALL_SECRETS"
  echo ""
  echo "To apply these secrets, either:"
  echo "  1. Pipe output to kubectl: $0 --env-file $ENV_FILE | kubectl apply -f -"
  echo "  2. Use --apply flag: $0 --env-file $ENV_FILE --apply"
  echo "  3. Save to file and apply manually"
fi
