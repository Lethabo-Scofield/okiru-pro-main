#!/bin/bash
set -e

PROJECT=/home/okiru/okiru-pro-main
VM_IP="20.164.207.196"

echo "============================================"
echo "  Okiru VM Fix & Deploy Script"
echo "============================================"
echo ""

cd $PROJECT

echo "[1/9] Stopping all containers..."
docker stop web-prod 2>/dev/null && docker rm web-prod 2>/dev/null || true
docker compose -f docker-compose.production.yml down 2>/dev/null || true
echo "Done."

echo ""
echo "[2/9] Fixing git permissions..."
sudo chown -R okiru:okiru $PROJECT
echo "Done."

echo ""
echo "[3/9] Writing .dockerignore..."
cat > $PROJECT/.dockerignore << 'DOCKERIGNORE'
node_modules
**/node_modules
**/dist
**/__pycache__
**/*.pyc
.git
.gitignore
.replit
replit.nix
.config
.local
.cache
.upm
.pythonlibs
.vscode
.cursor
deploy/ssl
.env
.env.*
*.pdf
*.pptx
DOCKERIGNORE
echo ".dockerignore written."

echo ""
echo "[4/9] Patching apps/api/package.json (add esbuild)..."
if ! grep -q '"esbuild"' $PROJECT/apps/api/package.json; then
  sed -i 's/"cross-env": "^10.1.0",/"cross-env": "^10.1.0",\n    "esbuild": "^0.25.0",/' $PROJECT/apps/api/package.json
  echo "esbuild added to api devDependencies."
else
  echo "esbuild already present."
fi

echo ""
echo "[5/9] Writing Dockerfiles..."

cat > $PROJECT/apps/api/Dockerfile << 'APIDOCKERFILE'
FROM node:20-alpine AS builder
WORKDIR /build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json packages/types/
COPY apps/api/package.json apps/api/

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate \
    && pnpm install --no-frozen-lockfile \
    && npm rebuild esbuild

COPY packages/types/ packages/types/
COPY apps/api/ apps/api/

RUN pnpm --filter @okiru/types build \
    && cd apps/api && node build.js

FROM node:20-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

COPY --from=builder /build/package.json /build/pnpm-lock.yaml /build/pnpm-workspace.yaml ./
COPY --from=builder /build/packages/types/ packages/types/
COPY --from=builder /build/apps/api/dist/ apps/api/dist/
COPY --from=builder /build/apps/api/package.json apps/api/

RUN pnpm install --no-frozen-lockfile --prod

EXPOSE 5000
ENV NODE_ENV=production PORT=5000
WORKDIR /app/apps/api
CMD ["node", "dist/index.cjs"]
APIDOCKERFILE

cat > $PROJECT/apps/web/Dockerfile << 'WEBDOCKERFILE'
FROM node:20-alpine AS builder

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/types/package.json packages/types/
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/

RUN pnpm install --no-frozen-lockfile \
    && npm rebuild esbuild

COPY packages/types/ packages/types/
COPY apps/api/src/ apps/api/src/
COPY apps/api/pipeline/ apps/api/pipeline/
COPY apps/api/models.ts apps/api/models.ts
COPY apps/api/schema.ts apps/api/schema.ts
COPY apps/web/ apps/web/

WORKDIR /app/packages/types
RUN pnpm run build

WORKDIR /app/apps/web
RUN pnpm run build

FROM node:20-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

COPY --from=builder /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=builder /app/packages/types/package.json packages/types/
COPY --from=builder /app/apps/web/package.json apps/web/
COPY --from=builder /app/apps/api/package.json apps/api/

RUN pnpm install --no-frozen-lockfile --prod

COPY --from=builder /app/apps/web/dist/ apps/web/dist/

EXPOSE 5001
ENV NODE_ENV=production PORT=5001
WORKDIR /app/apps/web
CMD ["node", "dist/index.cjs"]
WEBDOCKERFILE

echo "Dockerfiles written."

echo ""
echo "Patching apps/api/build.js (externalize pdfjs-dist)..."
cat > $PROJECT/apps/api/build.js << 'BUILDJS'
import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/index.cjs",
  external: [
    "bcrypt",
    "pdfjs-dist",
  ],
  sourcemap: true,
  minify: false,
});

console.log("Build complete: dist/index.cjs");
BUILDJS
echo "build.js patched."

echo ""
echo "[6/9] Writing docker-compose.production.yml..."

cat > $PROJECT/docker-compose.production.yml << 'COMPOSEFILE'
networks:
  okiru_net:
    driver: bridge

services:
  mongodb:
    image: mongo:7
    container_name: okiru_mongo
    restart: always
    networks:
      - okiru_net
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER:-okiru}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD:?set MONGO_PASSWORD}
    volumes:
      - mongo_data:/data/db
    ports:
      - "127.0.0.1:27017:27017"
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5

  arangodb:
    image: arangodb:3.11
    container_name: okiru_arango
    restart: always
    networks:
      - okiru_net
    environment:
      ARANGO_ROOT_PASSWORD: ${ARANGO_PASSWORD:?set ARANGO_PASSWORD}
    volumes:
      - arango_data:/var/lib/arangodb3
    ports:
      - "127.0.0.1:8529:8529"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8529/_api/version"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 30s

  redis:
    image: redis:7-alpine
    container_name: okiru_redis
    restart: always
    networks:
      - okiru_net
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  computation-engine:
    build:
      context: ./apps/Computation-Engine
      dockerfile: Dockerfile
    image: okiru/compute-engine:latest
    container_name: okiru_compute
    restart: always
    networks:
      - okiru_net
    depends_on:
      arangodb:
        condition: service_started
      redis:
        condition: service_healthy
    environment:
      ARANGO_URL: http://arangodb:8529
      ARANGO_USER: root
      ARANGO_PASSWORD: ${ARANGO_PASSWORD}
      ARANGO_DB: ${ARANGO_DB:-bbbee_db}
      REDIS_URL: redis://redis:6379
      API_HOST: "0.0.0.0"
      API_PORT: "8000"
      API_RELOAD: "false"
      LOG_LEVEL: info
      ALLOW_IN_MEMORY_DB: "0"
      CORS_ORIGINS: http://api:5000,http://web:5001
    ports:
      - "127.0.0.1:8000:8000"

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    image: okiru/api:latest
    container_name: okiru_api
    restart: always
    networks:
      - okiru_net
    depends_on:
      mongodb:
        condition: service_healthy
      arangodb:
        condition: service_started
    environment:
      NODE_ENV: production
      PORT: "5000"
      MONGO_URI: mongodb://${MONGO_USER:-okiru}:${MONGO_PASSWORD}@mongodb:27017/okiru?authSource=admin
      ARANGO_URL: http://arangodb:8529
      ARANGO_DB: ${ARANGO_DB:-bbbee_db}
      ARANGO_USER: root
      ARANGO_PASSWORD: ${ARANGO_PASSWORD}
      COMPUTE_ENGINE_URL: http://computation-engine:8000
      SESSION_SECRET: ${SESSION_SECRET:?set SESSION_SECRET}
      CORS_ORIGIN: ${CORS_ORIGIN:-http://20.164.207.196,https://20.164.207.196}
      GROQ_API_KEY: ${GROQ_API_KEY:-}
      AZURE_OPENAI_ENDPOINT: ${AZURE_OPENAI_ENDPOINT:-}
      AZURE_OPENAI_API_KEY: ${AZURE_OPENAI_API_KEY:-}
      AZURE_OPENAI_DEPLOYMENT: ${AZURE_OPENAI_DEPLOYMENT:-gpt-4o-mini}
    ports:
      - "127.0.0.1:5000:5000"

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    image: okiru/web:latest
    container_name: okiru_web
    restart: always
    networks:
      - okiru_net
    depends_on:
      mongodb:
        condition: service_healthy
      api:
        condition: service_started
    environment:
      NODE_ENV: production
      PORT: "5001"
      MONGODB_URI: mongodb://${MONGO_USER:-okiru}:${MONGO_PASSWORD}@mongodb:27017/okiru_web?authSource=admin
      SESSION_SECRET: ${SESSION_SECRET:?set SESSION_SECRET}
      API_SERVER_URL: http://api:5000
      GROQ_API_KEY: ${GROQ_API_KEY:-}
    ports:
      - "127.0.0.1:5001:5001"

  nginx:
    image: nginx:alpine
    container_name: okiru_nginx
    restart: always
    networks:
      - okiru_net
    depends_on:
      - api
      - web
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./deploy/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./deploy/ssl:/etc/nginx/ssl:ro

volumes:
  mongo_data:
  arango_data:
COMPOSEFILE

echo "docker-compose.production.yml written."

echo ""
echo "[7/9] Writing deploy/nginx.conf..."

mkdir -p $PROJECT/deploy

cat > $PROJECT/deploy/nginx.conf << 'NGINXFILE'
worker_processes auto;
events { worker_connections 1024; }

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    sendfile    on;
    tcp_nopush  on;
    gzip        on;
    gzip_types  text/plain application/json application/javascript text/css application/x-javascript text/xml application/xml;
    client_max_body_size 200M;
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;

    upstream api_backend    { server api:5000; }
    upstream web_frontend   { server web:5001; }
    upstream compute_engine { server computation-engine:8000; }

    server {
        listen 80;
        server_name _;

        add_header X-Content-Type-Options "nosniff" always;
        add_header X-Frame-Options "SAMEORIGIN" always;

        location /api/ {
            limit_req zone=api_limit burst=50 nodelay;
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_read_timeout 300s;
        }

        location /compute/ {
            proxy_pass http://compute_engine/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_read_timeout 300s;
        }

        location / {
            proxy_pass http://web_frontend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }

    server {
        listen 443 ssl;
        server_name _;
        ssl_certificate     /etc/nginx/ssl/okiru-selfsigned.crt;
        ssl_certificate_key /etc/nginx/ssl/okiru-selfsigned.key;
        ssl_protocols       TLSv1.2 TLSv1.3;
        ssl_ciphers         HIGH:!aNULL:!MD5;

        location /api/ {
            limit_req zone=api_limit burst=50 nodelay;
            proxy_pass http://api_backend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_read_timeout 300s;
        }

        location /compute/ {
            proxy_pass http://compute_engine/;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_read_timeout 300s;
        }

        location / {
            proxy_pass http://web_frontend;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}
NGINXFILE

echo "nginx.conf written."

echo ""
echo "[8/9] Generating SSL cert (if missing)..."
mkdir -p $PROJECT/deploy/ssl
if [ ! -f "$PROJECT/deploy/ssl/okiru-selfsigned.crt" ]; then
  openssl req -x509 -nodes -days 825 \
    -newkey rsa:2048 \
    -keyout $PROJECT/deploy/ssl/okiru-selfsigned.key \
    -out $PROJECT/deploy/ssl/okiru-selfsigned.crt \
    -subj "/C=ZA/ST=Gauteng/L=Johannesburg/O=Okiru/CN=$VM_IP" \
    -addext "subjectAltName=IP:$VM_IP" 2>/dev/null
  chmod 600 $PROJECT/deploy/ssl/okiru-selfsigned.key
  echo "SSL cert generated."
else
  echo "SSL cert already exists."
fi

echo ""
echo "[9/9] Building and starting all services..."
cd $PROJECT
docker compose -f docker-compose.production.yml build --no-cache api web computation-engine
docker compose -f docker-compose.production.yml up -d

echo ""
echo "Waiting 30 seconds for services to start..."
sleep 30

echo ""
echo "============================================"
echo "  Container Status"
echo "============================================"
docker compose -f docker-compose.production.yml ps

echo ""
echo "============================================"
echo "  Health Checks"
echo "============================================"
echo -n "Frontend (port 80): "
curl -sf -o /dev/null -w "%{http_code}" http://localhost/ 2>/dev/null || echo "FAIL"
echo ""
echo -n "API via nginx:      "
curl -sf -o /dev/null -w "%{http_code}" http://localhost/api/health 2>/dev/null || echo "FAIL"
echo ""
echo -n "API direct (5000):  "
curl -sf -o /dev/null -w "%{http_code}" http://localhost:5000/health 2>/dev/null || echo "FAIL"
echo ""
echo -n "HTTPS (443):        "
curl -sfk -o /dev/null -w "%{http_code}" https://localhost/ 2>/dev/null || echo "FAIL"
echo ""

echo ""
echo "============================================"
echo "  DEPLOY COMPLETE"
echo "  App: http://$VM_IP"
echo "============================================"
