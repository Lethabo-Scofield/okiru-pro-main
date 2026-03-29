# --------------------
# Build stage
# --------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Use corepack+pnpm (no global setup required)
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# Copy monorepo manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy only web package manifest in order to install only web deps
COPY apps/web/package.json apps/web/package.json

# Install dependencies for apps/web only (includes dev deps for build)
RUN pnpm install --frozen-lockfile --filter ./apps/web...

# Copy web source (monorepo root ignored by .dockerignore)
COPY apps/web/ apps/web/

# Build only client assets for frontend deployment (skip server API path dependencies)
WORKDIR /app/apps/web
RUN pnpm exec vite build

# --------------------
# Production stage
# --------------------
FROM nginx:alpine

# Remove default nginx html
RUN rm -rf /usr/share/nginx/html/*

# Configure nginx to serve SPA index fallback
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from `dist/public` to nginx root
COPY --from=builder /app/apps/web/dist/public /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]