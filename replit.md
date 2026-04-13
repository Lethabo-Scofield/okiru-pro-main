# Okiru Pro — B-BBEE Compliance & Scorecard Management Platform

## Overview
Okiru Pro is a comprehensive platform for automating B-BBEE (Broad-Based Black Economic Empowerment) compliance calculations, scorecard management, and reporting for South African businesses.

## Architecture
This is a **pnpm monorepo** with three services:

### Services
| Service | Path | Port | Tech |
|---|---|---|---|
| Web App | `apps/web` | 5000 | React 19, Vite, Express (SSR/proxy) |
| API Server | `apps/api` | 3000 | Node.js, Express 5, TypeScript |
| Computation Engine | `apps/Computation-Engine` | 8000 | Python 3, FastAPI, uvicorn |

### Shared Packages
- `packages/types` — Shared TypeScript type definitions

## Workflows
- **Start application** — runs `apps/web` (React frontend + Express server on port 5000)
- **API Server** — runs `apps/api` (backend API on port 3000)
- **Computation Engine** — runs `apps/Computation-Engine` (Python FastAPI on port 8000)

## Tech Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Radix UI, TanStack Query, Wouter
- **Backend (Node)**: Express 5, tsx, MongoDB/Mongoose, ArangoDB, Redis
- **Backend (Python)**: FastAPI, uvicorn, python-arango, networkx, openpyxl
- **AI/LLM**: OpenAI (Azure), Google Generative AI, Groq
- **Auth**: Passport.js (local strategy), express-session

## Key Features
1. **B-BBEE Scorecard Management** — pillar-by-pillar data entry (Ownership, Management Control, Skills Development, ESD, SED, YES)
2. **Document Extraction** — AI-powered parsing of PDFs and Excel toolkits
3. **Formula Graph Engine** — dependency-aware B-BBEE calculation pipeline
4. **Reporting** — PDF and PPTX scorecard export
5. **What-If Modeling** — scenario planning for scorecard optimization

## External Dependencies (require configuration)
- **MongoDB** — set `MONGODB_URI` environment variable
- **ArangoDB** — set `ARANGO_URL`, `ARANGO_USER`, `ARANGO_PASSWORD`, `ARANGO_DB`
- **OpenAI/Azure OpenAI** — set `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT`
- **Groq** — set `GROQ_API_KEY`
- **Redis** — set `REDIS_URL`

## Running Without External Services
The app gracefully degrades when external services are unavailable:
- Falls back to **in-memory storage** when MongoDB is not connected
- Computation Engine uses **in-memory DB mode** when ArangoDB is unavailable
- AI endpoints return errors when API keys are not set

## Development
```bash
# Install all packages
pnpm install

# Run all services in parallel
pnpm dev

# Run individual services
pnpm dev:web   # Web app
pnpm dev:api   # API server
```
