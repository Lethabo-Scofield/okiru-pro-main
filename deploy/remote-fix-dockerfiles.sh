#!/bin/bash
set -e

cd /home/okiru/okiru-pro-main

# Create root workspace files needed for pnpm monorepo build
cat > pnpm-workspace.yaml <<'PWEOF'
packages:
  - 'apps/*'
  - 'packages/*'
PWEOF

# Create packages/types
mkdir -p packages/types/src

cat > packages/types/package.json <<'PTPEOF'
{
  "name": "@okiru/types",
  "version": "1.0.0",
  "type": "module",
  "types": "./src/index.ts",
  "exports": { ".": { "types": "./src/index.ts" } },
  "scripts": { "build": "tsc", "dev": "tsc --watch" },
  "devDependencies": { "typescript": "^5.9.3" }
}
PTPEOF

cat > packages/types/tsconfig.json <<'TTSEOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
TTSEOF

# The types index.ts already exists in the repo at packages/types/src/index.ts
# If not, create a minimal one
if [ ! -f packages/types/src/index.ts ]; then
  echo "export {};" > packages/types/src/index.ts
fi

# Generate pnpm-lock.yaml by running pnpm install in a temp container
# Instead, create simpler Dockerfiles that generate their own lockfile

# Rewrite API Dockerfile - standalone, no lockfile needed
cat > apps/api/Dockerfile <<'APIEOF'
FROM node:20-alpine AS builder
WORKDIR /build

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY pnpm-workspace.yaml package.json ./
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/

RUN pnpm install --no-frozen-lockfile

COPY packages/types/ packages/types/
COPY apps/api/ apps/api/

RUN cd packages/types && pnpm build || true
RUN cd apps/api && pnpm build

FROM node:20-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY --from=builder /build/pnpm-workspace.yaml /build/package.json ./
COPY --from=builder /build/pnpm-lock.yaml ./
COPY --from=builder /build/packages/types/ packages/types/
COPY --from=builder /build/apps/api/dist/ apps/api/dist/
COPY --from=builder /build/apps/api/package.json apps/api/

RUN pnpm install --prod --no-frozen-lockfile

EXPOSE 5000
ENV NODE_ENV=production PORT=5000
WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]
APIEOF

# Rewrite Web Dockerfile - standalone
cat > apps/web/Dockerfile <<'WEBEOF'
FROM node:20-alpine AS builder
WORKDIR /build

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY pnpm-workspace.yaml package.json ./
COPY packages/types/package.json packages/types/
COPY apps/web/package.json apps/web/

RUN pnpm install --no-frozen-lockfile

COPY packages/types/ packages/types/
COPY apps/web/ apps/web/

RUN cd packages/types && pnpm build || true
RUN cd apps/web && pnpm build

FROM node:20-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY --from=builder /build/pnpm-workspace.yaml /build/package.json ./
COPY --from=builder /build/pnpm-lock.yaml ./
COPY --from=builder /build/packages/types/ packages/types/
COPY --from=builder /build/apps/web/dist/ apps/web/dist/
COPY --from=builder /build/apps/web/package.json apps/web/

RUN pnpm install --prod --no-frozen-lockfile

EXPOSE 5001
ENV NODE_ENV=production PORT=5001
WORKDIR /app/apps/web
CMD ["node", "dist/index.cjs"]
WEBEOF

# Fix Computation Engine Dockerfile context paths
cat > apps/Computation-Engine/Dockerfile <<'CEEOF'
FROM python:3.13-slim
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ && rm -rf /var/lib/apt/lists/*

COPY apps/Computation-Engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/Computation-Engine/backend/ backend/

EXPOSE 8000
ENV API_HOST=0.0.0.0 API_PORT=8000 API_RELOAD=false LOG_LEVEL=info

CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
CEEOF

chown -R okiru:okiru /home/okiru/okiru-pro-main
echo "=== Workspace files and Dockerfiles fixed ==="
ls -la pnpm-workspace.yaml packages/types/package.json apps/api/Dockerfile apps/web/Dockerfile apps/Computation-Engine/Dockerfile
echo "=== FIX_DONE ==="
