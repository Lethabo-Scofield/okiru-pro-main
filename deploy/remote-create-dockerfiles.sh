#!/bin/bash
set -e

cd /home/okiru/okiru-pro-main

# Create API Dockerfile
cat > apps/api/Dockerfile <<'APIEOF'
FROM node:20-alpine AS builder
WORKDIR /build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate \
    && pnpm install --frozen-lockfile

COPY packages/types/ packages/types/
COPY apps/api/ apps/api/

RUN pnpm --filter @okiru/types build \
    && pnpm --filter @okiru/api build

FROM node:20-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY --from=builder /build/package.json /build/pnpm-lock.yaml /build/pnpm-workspace.yaml ./
COPY --from=builder /build/packages/types/ packages/types/
COPY --from=builder /build/apps/api/dist/ apps/api/dist/
COPY --from=builder /build/apps/api/package.json apps/api/

RUN pnpm install --frozen-lockfile --prod

EXPOSE 5000
ENV NODE_ENV=production PORT=5000
WORKDIR /app/apps/api
CMD ["node", "dist/index.js"]
APIEOF

# Create Web Dockerfile
cat > apps/web/Dockerfile <<'WEBEOF'
FROM node:20-alpine AS builder
WORKDIR /build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json packages/types/
COPY apps/web/package.json apps/web/

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate \
    && pnpm install --frozen-lockfile

COPY packages/types/ packages/types/
COPY apps/web/ apps/web/

RUN pnpm --filter @okiru/types build \
    && pnpm --filter @okiru/web build

FROM node:20-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

COPY --from=builder /build/package.json /build/pnpm-lock.yaml /build/pnpm-workspace.yaml ./
COPY --from=builder /build/packages/types/ packages/types/
COPY --from=builder /build/apps/web/dist/ apps/web/dist/
COPY --from=builder /build/apps/web/package.json apps/web/

RUN pnpm install --frozen-lockfile --prod

EXPOSE 5001
ENV NODE_ENV=production PORT=5001
WORKDIR /app/apps/web
CMD ["node", "dist/index.cjs"]
WEBEOF

# Create Computation Engine Dockerfile
cat > apps/Computation-Engine/Dockerfile <<'CEEOF'
FROM python:3.13-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc g++ && rm -rf /var/lib/apt/lists/*

COPY apps/Computation-Engine/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/Computation-Engine/backend/ backend/

EXPOSE 8000
ENV API_HOST=0.0.0.0 \
    API_PORT=8000 \
    API_RELOAD=false \
    LOG_LEVEL=info

CMD ["python", "-m", "uvicorn", "backend.app.main:app", \
     "--host", "0.0.0.0", "--port", "8000", "--log-level", "info"]
CEEOF

# Create .dockerignore
cat > .dockerignore <<'IGNEOF'
node_modules
dist
build
.git
.gitignore
*.md
*.pdf
*.pptx
.env
.env.*
__pycache__
*.pyc
.pytest_cache
.vscode
.cursor
**/__pycache__
**/node_modules
**/dist
**/build
IGNEOF

chown -R okiru:okiru /home/okiru/okiru-pro-main

echo "=== Dockerfiles created ==="
ls -la apps/api/Dockerfile apps/web/Dockerfile apps/Computation-Engine/Dockerfile .dockerignore
echo "=== DOCKERFILES_DONE ==="
