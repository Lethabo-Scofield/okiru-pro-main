#!/bin/bash
set -e

cd /home/okiru/okiru-pro-main

# Create .env directly
PUBLIC_IP=$(curl -s ifconfig.me)
SESSION_SECRET=$(openssl rand -hex 32)
MONGO_PASS=$(openssl rand -hex 16)
ARANGO_PASS=$(openssl rand -hex 16)

cat > .env <<ENVFILE
MONGO_USER=okiru
MONGO_PASSWORD=${MONGO_PASS}
ARANGO_PASSWORD=${ARANGO_PASS}
ARANGO_DB=bbbee_db
SESSION_SECRET=${SESSION_SECRET}
CORS_ORIGIN=http://${PUBLIC_IP}
ENVFILE

echo "=== .env created ==="
cat .env

# Create docker-compose file directly on VM
cat > docker-compose.production.yml <<'COMPOSEFILE'
version: "3.9"

services:
  mongodb:
    image: mongo:7
    container_name: okiru_mongo
    restart: always
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER:-okiru}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD}
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
    environment:
      ARANGO_ROOT_PASSWORD: ${ARANGO_PASSWORD}
    volumes:
      - arango_data:/var/lib/arangodb3
    ports:
      - "127.0.0.1:8529:8529"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8529/_api/version"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: okiru_redis
    restart: always
    ports:
      - "127.0.0.1:6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  computation-engine:
    build:
      context: .
      dockerfile: apps/Computation-Engine/Dockerfile
    container_name: okiru_compute
    restart: always
    depends_on:
      arangodb:
        condition: service_healthy
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
    ports:
      - "127.0.0.1:8000:8000"

  api:
    build:
      context: .
      dockerfile: apps/api/Dockerfile
    container_name: okiru_api
    restart: always
    depends_on:
      mongodb:
        condition: service_healthy
      arangodb:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: "5000"
      MONGO_URI: mongodb://${MONGO_USER:-okiru}:${MONGO_PASSWORD}@mongodb:27017/okiru?authSource=admin
      ARANGO_URL: http://arangodb:8529
      ARANGO_DB: ${ARANGO_DB:-bbbee_db}
      ARANGO_USER: root
      ARANGO_PASSWORD: ${ARANGO_PASSWORD}
      COMPUTE_ENGINE_URL: http://computation-engine:8000
      SESSION_SECRET: ${SESSION_SECRET}
      CORS_ORIGIN: ${CORS_ORIGIN}
    ports:
      - "127.0.0.1:5000:5000"

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
    container_name: okiru_web
    restart: always
    depends_on:
      mongodb:
        condition: service_healthy
    environment:
      NODE_ENV: production
      PORT: "5001"
      MONGODB_URI: mongodb://${MONGO_USER:-okiru}:${MONGO_PASSWORD}@mongodb:27017/okiru_web?authSource=admin
    ports:
      - "127.0.0.1:5001:5001"

  nginx:
    image: nginx:alpine
    container_name: okiru_nginx
    restart: always
    depends_on:
      - api
      - web
      - computation-engine
    ports:
      - "80:80"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro

volumes:
  mongo_data:
  arango_data:
COMPOSEFILE

# Create nginx.conf
cat > nginx.conf <<'NGINXFILE'
worker_processes auto;
events { worker_connections 1024; }

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    sendfile    on;
    gzip        on;
    gzip_types  text/plain application/json application/javascript text/css;
    client_max_body_size 50M;

    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/s;

    upstream api_backend   { server api:5000; }
    upstream web_frontend  { server web:5001; }
    upstream compute_engine { server computation-engine:8000; }

    server {
        listen 80;
        server_name _;

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
}
NGINXFILE

chown -R okiru:okiru /home/okiru/okiru-pro-main
echo "=== FILES_READY ==="
ls -la .env docker-compose.production.yml nginx.conf
