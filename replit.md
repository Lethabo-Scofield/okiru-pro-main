# Okiru Pro - B-BBEE Compliance & Scorecard Management Platform

## Project Overview
Okiru Pro is a comprehensive B-BBEE (Broad-Based Black Economic Empowerment) Compliance and Scorecard Management Platform for South Africa. It automates B-BBEE score calculations, manages compliance data, and generates reports across all five pillars: Ownership, Management Control, Skills Development, ESD, and SED.

## Architecture

### Monorepo Structure (pnpm workspaces)
- **`apps/web`** - Main web application (React + Vite + Express server)
- **`apps/api`** - Separate backend API service (Node.js/Express/TypeScript)
- **`apps/Computation-Engine`** - Python FastAPI service for Excel-based scorecard computation
- **`packages/types`** - Shared TypeScript types

### Tech Stack
- **Frontend**: React 19, Vite, Tailwind CSS 4, Radix UI, Tanstack Query, Zustand, Wouter
- **Backend**: Express 5, TypeScript (tsx), Helmet (security headers), Express Session
- **Databases**: MongoDB (primary data), ArangoDB (knowledge graph)
- **AI/LLM**: Groq SDK (Llama-3), Azure OpenAI (gpt-4o-mini), Google Generative AI
- **Computation**: FastAPI (Python), xlcalculator, networkx
- **Auth**: Session-based auth with bcrypt, OTP email verification, optional 2FA

## Running the Project

### Development (3 services, started in parallel by the "Project" workflow)
1. **Web App** (port 5000): `cd apps/web && pnpm run dev` — Express + Vite frontend
2. **API Server** (port 3000): `cd apps/api && pnpm run dev` — Business logic, routes, proxied from web
3. **Computation Engine** (port 8000): Python FastAPI — Excel model compilation and evaluation

The web app proxies scorecard/entity/template routes to the API server, which in turn calls the Computation Engine for formula evaluation.

### Package Management
Uses pnpm workspaces. Install dependencies from the root:
```
pnpm install
```

## Environment Variables Required
- `MONGODB_URI` - MongoDB connection string (without this, uses in-memory storage)
- `SESSION_SECRET` - Express session secret (required in production, will crash without it)
- `GROQ_API_KEY` - For AI/LLM features
- `ARANGO_URL` - ArangoDB connection URL
- `ARANGO_PASSWORD` - ArangoDB password (no hardcoded default — must be set)
- `ARANGO_DB` - ArangoDB database name (defaults to `bbbee_db`)
- `CORS_ORIGIN` - API server allowed origins (comma-separated)
- `API_SERVER_URL` - URL of API server for web proxy (default: http://127.0.0.1:3000)
- `COMPUTE_ENGINE_URL` - URL of Computation Engine (default: http://127.0.0.1:8000)
- `AZURE_OPENAI_ENDPOINT` - Optional, for Azure OpenAI extraction
- `AZURE_OPENAI_API_KEY` - Optional, for Azure OpenAI extraction
- `CORS_ORIGINS` - Computation Engine allowed origins (comma-separated)

## Production Deployment (Azure VM: 20.164.207.196)

### Architecture
- **Nginx** (port 80/443) → reverse proxy for all services
  - `/` → `web:5001` (frontend + server-side proxy)
  - `/api/` → `api:5000` (backend API)
  - `/compute/` → `computation-engine:8000` (Python engine)
  - `/arango/` → `arangodb:8529` (admin UI)
- All containers on `okiru_net` Docker bridge network, communicate by service name
- Databases (MongoDB, ArangoDB, Redis) bound to 127.0.0.1 only

### Docker Compose (`docker-compose.production.yml`)
Services: mongodb, arangodb, redis, computation-engine, api, web, nginx, certbot
Network: `okiru_net` (bridge) — containers resolve each other by service name

### Dockerfiles
- `apps/api/Dockerfile` — multi-stage Node.js build, outputs `dist/index.cjs`, port 5000
- `apps/web/Dockerfile` — multi-stage Node.js build (Vite client + Express server), outputs `dist/index.cjs`, port 5001
- `apps/Computation-Engine/Dockerfile` — Python 3.13-slim, FastAPI/uvicorn, port 8000

### Deploy Scripts (`deploy/`)
- `azure-deploy.sh` — Provision Azure VM, install Docker, open ports 22/80/443
- `remote-setup.sh` — Clone repo, generate .env with random secrets
- `vm-deploy-run.sh` — Full deploy: pull code, build images, start all services, health checks
- `vm-restart.sh` — Quick rebuild + restart after code changes
- `ssl-setup.sh` — Generate self-signed SSL cert for the VM IP
- `.env.production.template` — Template for production environment variables

### Quick Deploy (on VM)
```bash
sudo bash deploy/remote-setup.sh
nano .env  # review and edit passwords
sudo bash deploy/vm-deploy-run.sh
```

### Firewall / Azure NSG
Ports 22 (SSH), 80 (HTTP), 443 (HTTPS) must be open in the Azure NSG

## Security
- Helmet enabled on both web and API servers
- Session secret enforced in production (crashes if missing)
- No hardcoded database passwords in source code (must be set via env vars)
- CORS restricted on all services (Computation Engine uses `CORS_ORIGINS` env var)
- Rate limiting on API routes and login attempts
- OTP-based 2FA support

## Testing

### Web App (apps/web) — Vitest
```
cd apps/web && pnpm run test
```

### API (apps/api) — Vitest
```
cd apps/api && pnpm run test
```

### Computation Engine (apps/Computation-Engine) — Pytest
```
cd apps/Computation-Engine/backend && python3 -m pytest tests/ -v
```

## Replit Configuration
- Three workflows are configured: `Start application` (port 5000, webview), `API Server` (port 3000, console), `Computation Engine` (port 8000, console)
- `ALLOW_IN_MEMORY_DB=1` is set as an environment variable so the Computation Engine starts without needing a local ArangoDB instance
- The Computation Engine's `run_server.py` binds to `0.0.0.0` (changed from `127.0.0.1`) so Replit can detect the open port

## Notes
- Without `MONGODB_URI`, the app runs in in-memory mode with a demo user (username: `demo`, password: `demo`)
- Without `ARANGO_URL`/ArangoDB, the Computation Engine uses in-memory mode (`ALLOW_IN_MEMORY_DB=1`) — data will not persist
- Vite is configured with `allowedHosts: true` and `host: 0.0.0.0` for Replit proxy compatibility
