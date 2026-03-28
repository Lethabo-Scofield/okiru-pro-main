# --------------------
# Build stage
# --------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Enable pnpm
RUN corepack enable

# Copy workspace files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies
RUN pnpm install

# Install tsx globally for build scripts
RUN pnpm add -g tsx

# Copy full repo
COPY . .

# Build web
WORKDIR /app/apps/web
RUN pnpm run build

# --------------------
# Production stage
# --------------------
FROM nginx:alpine

# Remove default nginx html
RUN rm -rf /usr/share/nginx/html/*

# Copy built files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Optional: copy public folder if needed
# COPY --from=builder /app/apps/web/public /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]