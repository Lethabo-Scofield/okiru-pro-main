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
2. **API Server** (port 3000): `cd apps/api && npx tsx index.ts` — Business logic, routes, proxied from web
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

## Production Deployment (Azure VM)
Uses Docker Compose (`docker-compose.production.yml`) with:
- MongoDB 7, ArangoDB 3.11, Redis 7
- Nginx reverse proxy with SSL
- All three app services containerized

Dockerfiles:
- `apps/api/Dockerfile` — builds to `dist/index.cjs` via esbuild, runs with Node.js
- `apps/web/Dockerfile` — builds client + server to `dist/index.cjs`, runs with Node.js (includes Express backend)
- `apps/Computation-Engine/Dockerfile` — Python FastAPI with uvicorn

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

## Notes
- Without `MONGODB_URI`, the app runs in in-memory mode with a demo user (username: `demo`, password: `demo`)
- The Computation Engine uses `ALLOW_IN_MEMORY_DB=1` to bypass ArangoDB for unit tests
- Vite is configured with `allowedHosts: true` and `host: 0.0.0.0` for Replit proxy compatibility
