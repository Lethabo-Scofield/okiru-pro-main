#!/bin/bash
set -e

cd /home/okiru/okiru-pro-main

# Create root package.json (not in the repo yet)
cat > package.json <<'PKGEOF'
{
  "name": "okiru-pro",
  "version": "1.0.0",
  "private": true,
  "description": "B-BBEE Compliance and Scorecard Management Platform",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "pnpm run --parallel dev",
    "build": "pnpm -r build"
  },
  "devDependencies": {
    "@types/node": "^20.19.35",
    "typescript": "^5.9.3"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.0.0"
}
PKGEOF

chown okiru:okiru package.json

echo "=== Root package.json created ==="
echo "=== Listing key files ==="
ls -la package.json pnpm-workspace.yaml
ls -la apps/api/Dockerfile apps/web/Dockerfile apps/Computation-Engine/Dockerfile
echo "=== ROOT_PKG_DONE ==="
