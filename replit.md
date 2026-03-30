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
- **Backend**: Express 5, TypeScript (tsx), Passport.js (local auth), Express Session
- **Databases**: MongoDB (primary data), ArangoDB (knowledge graph)
- **AI/LLM**: Groq SDK (Llama-3), OpenAI, Google Generative AI
- **Computation**: FastAPI (Python), xlcalculator, networkx
- **Auth**: Passport.js local strategy with session-based auth

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
- `GROQ_API_KEY` - For AI/LLM features
- `SESSION_SECRET` - Express session secret
- `OPENAI_API_KEY` - Optional, for OpenAI features
- `GOOGLE_AI_API_KEY` - Optional, for Google AI features

## Testing

### Web App (apps/web) — Vitest
```
cd apps/web && pnpm run test
```
10 test files, 181 tests covering: Toolkit utilities, calculator engines (skills, shared, scorecard-integration, procurement, ownership, management, esd-sed), server routes, and email.

### API (apps/api) — Vitest
```
cd apps/api && pnpm run test
```
Tests the B-BBEE scoring engine: manifest building, scorecard calculation, and all sector variants.

### Computation Engine (apps/Computation-Engine) — Pytest
```
cd apps/Computation-Engine/backend && python3 -m pytest tests/ -v
```
Tests model compilation and evaluation. Uses in-memory DB when `ALLOW_IN_MEMORY_DB=1` (set automatically in tests).

## Notes
- Without `MONGODB_URI`, the app runs in in-memory mode with a demo user (username: `demo`, password: `demo`)
- The Computation Engine uses `ALLOW_IN_MEMORY_DB=1` to bypass ArangoDB for unit tests
- Vite is configured with `allowedHosts: true` and `host: 0.0.0.0` for Replit proxy compatibility
