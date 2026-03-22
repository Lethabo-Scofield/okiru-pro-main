#!/bin/bash
set -e

cd /home/okiru/okiru-pro-main

# Check what's actually in the arango image
echo "=== Testing wget in arango container ==="
docker run --rm arangodb:3.11 sh -c "which wget; which curl; which arangosh" 2>&1 || true

# Create fixed docker-compose without arango healthcheck (use start_period delay instead)
cat > docker-compose.production.yml <<'COMPOSEFILE'
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
      test: ["CMD", "arangosh", "--server.password", "${ARANGO_PASSWORD}", "--javascript.execute-string", "db._version()"]
      interval: 15s
      timeout: 10s
      retries: 10
      start_period: 30s

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

echo "=== Restarting ==="
docker compose -f docker-compose.production.yml down 2>&1
docker compose -f docker-compose.production.yml up -d 2>&1

echo "=== Waiting 90s ==="
sleep 90

echo "=== Container status ==="
docker compose -f docker-compose.production.yml ps 2>&1

echo "=== Service logs ==="
echo "--- arango ---"
docker logs okiru_arango 2>&1 | tail -5
echo "--- api ---"
docker logs okiru_api 2>&1 | tail -5
echo "--- web ---"
docker logs okiru_web 2>&1 | tail -5
echo "--- compute ---"
docker logs okiru_compute 2>&1 | tail -5
echo "--- nginx ---"
docker logs okiru_nginx 2>&1 | tail -5

echo "=== V2_DONE ==="
