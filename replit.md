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
- `ARANGO_URL` - ArangoDB (Macrometa GDN) connection URL
- `ARANGO_PASSWORD` - ArangoDB password (no hardcoded default — must be set)
- `ARANGO_DB` - ArangoDB database name (defaults to `bbbee_db`)
- `CORS_ORIGIN` - API server allowed origins (comma-separated)
- `API_SERVER_URL` - URL of API server for web proxy (default: http://127.0.0.1:3000)
- `COMPUTE_ENGINE_URL` - URL of Computation Engine (default: http://127.0.0.1:8000)
- `AZURE_OPENAI_ENDPOINT` - Optional, for Azure OpenAI extraction
- `AZURE_OPENAI_API_KEY` - Optional, for Azure OpenAI extraction
- `CORS_ORIGINS` - Computation Engine allowed origins (no longer used; origins are hardcoded in main.py)
- `SMTP_HOST` - SMTP server hostname for email sending (OTP, password reset)
- `SMTP_PORT` - SMTP port (default: 587)
- `SMTP_USER` - SMTP authentication username
- `SMTP_PASS` - SMTP authentication password
- `SMTP_FROM` - Email "from" address (defaults to SMTP_USER)
- `APP_URL` - Public URL of the application (used in email links)

## Production Deployment

### Dockerfiles
- `apps/api/Dockerfile` — multi-stage Node.js build, outputs `dist/index.cjs`, port 5000
- `apps/web/Dockerfile` — multi-stage Node.js build (Vite client + Express server), outputs `dist/index.cjs`, port 5001
- `apps/Computation-Engine/Dockerfile` — Python 3.13-slim, FastAPI/uvicorn, port 8000 (build context must be `./apps/Computation-Engine`, NOT repo root)

### Azure AKS Deployment (Primary)

#### Infrastructure
- **ACR**: `okiruproacrde4d539b.azurecr.io` — images: `okiru-pro/api`, `okiru-pro/web`, `okiru-pro/compute`
- **AKS Namespace**: `okiru-pro`
- **Ingress Host**: `okiru.20.164.101.114.nip.io` (NGINX ingress + cert-manager with Let's Encrypt)
- **Databases**: MongoDB, ArangoDB, Redis deployed as K8s StatefulSets within the cluster

#### Port Layout (Azure K8s)
- API server: port 5000 (set via ConfigMap `API_PORT`)
- Web server: port 5001 (set via ConfigMap `WEB_PORT`)
- Compute Engine: port 8000
- Development (Replit): API=3000, Web=5000, Compute=8000

#### K8s Manifests (`kubernetes/infrastructure/`)
- `base/` — deployments, services, configmaps, ingress, storage, network policies
- `overlays/prod/` — production kustomize overlay
- Kustomize-based — use `kubectl kustomize` or `kustomize build` to render

#### Build & Deploy Scripts (`scripts/azure-cli/`)
- `00-full-cleanup-rebuild-deploy.ps1` — Full pipeline: cleanup ACR → rebuild → deploy
- `01-build-push.ps1` — Build Docker images and push to ACR (uses git SHA + timestamp tags)
- `02-force-rebuild.ps1` — Force rebuild with unique tags and push
- `03-deploy-aks.ps1` — Deploy to AKS with rollout status, smoke tests, auto-rollback on failure

#### K8s Inter-Service Communication
Services communicate via K8s service DNS names (not localhost):
- Web → API: `API_SERVER_URL=http://api:5000` (set in configmap)
- API → Compute Engine: `COMPUTE_ENGINE_URL=http://compute:8000` (set in configmap)
- `CORS_ORIGIN` (API) and `CORS_ORIGINS` (Compute Engine) must include production domains

#### Ingress Routing (`ingress.yaml`)
- `/api/auth/login|me|logout|register` (Exact) → api:5000 (API server handles auth sessions)
- `/api` (Prefix) → api:5000 (all other API routes)
- `/api/organizations`, `/api/auth/check-username` (Exact) → web:5001 (web-specific routes)
- `/api/processor-sessions` (Prefix), `/api/sector-templates` (Exact) → web:5001
- `/` (Prefix) → web:5001 (frontend)
- `/compute/(.*)` → compute:8000 (separate ingress with rewrite-target to strip `/compute` prefix)

#### K8s Security
- All pods use `readOnlyRootFilesystem: true` with emptyDir volumes at `/tmp`
- `runAsNonRoot: true`, `runAsUser: 1000`, all capabilities dropped
- Pod anti-affinity for HA (spread across nodes)
- Init containers wait for dependencies (MongoDB, Redis, API) before starting

#### K8s Secrets Required
- `mongodb-credentials`: `MONGODB_URI`
- `redis-credentials`: `REDIS_URL`
- `arangodb-credentials`: `ARANGO_URL`, `ARANGO_PASSWORD`, `ARANGO_DB_NAME`, `ARANGO_USER`, `ARANGO_VERIFY_SSL`
- `session-secrets`: `JWT_SECRET`, `SESSION_SECRET`, `API_INTERNAL_KEY`
- `external-api-keys` (optional): `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `GROQ_API_KEY`, `SMTP_HOST/PORT/USER/PASS`

#### Session Cookies
- Web server: `okiru.web.sid`, `sameSite: lax`, `secure: true` (production)
- API server: `okiru.api.sid`, `sameSite: lax`, `secure: true` (production)
- Replit environment auto-detected: uses `sameSite: none` + `secure: true` for iframe proxy

### Azure VM Deployment (Legacy/Alternative)
- VM IP: `20.164.207.196`
- Nginx reverse proxy → Docker Compose services
- Deploy scripts in `deploy/` directory
- `docker-compose.production.yml` for service orchestration

## Debug Logging

All three services use a centralized structured logging system for debugging purposes.

### Log Format
```
TIMESTAMP [LEVEL] [MODULE] Message {optional_metadata}
```
Example: `2026-04-05T16:13:13.567Z [INFO] [ApiServer] Initializing API server...`

### Log Levels
Controlled via `LOG_LEVEL` environment variable (default: `DEBUG`). Levels: `DEBUG`, `INFO`, `WARN`, `ERROR`.

### Logger Modules

**Web Server (`apps/web/server/logger.ts`)**:
- `WebServer` — Server initialization, startup, shutdown
- `WebDB` — MongoDB connection lifecycle
- `ApiProxy` — Request proxying to API server
- `Routes` — Authentication, session management, CRUD operations
- `Email` — SMTP transport, OTP/password reset emails
- `ExcelExtract` — Excel/CSV extraction pipeline

**API Server (`apps/api/src/logger.ts`)**:
- `ApiServer` — Server initialization, startup, shutdown, process signals
- `ApiDB` — MongoDB connection with retry logic
- `ArangoDB` — ArangoDB connection and database setup
- `ApiRoutes` — Route registration, session store, error handling

**Computation Engine (`apps/Computation-Engine/backend/app/core/logger.py`)**:
- `ComputeEngine.Main` — FastAPI startup/shutdown
- `ComputeEngine.AdminModels` — Model upload, compilation, evaluation endpoints
- `ComputeEngine.GraphEvaluator` — Formula graph traversal and calculation
- `ComputeEngine.ModelService` — Model lifecycle (compile, evaluate, persist)
- `ComputeEngine.ArangoDB` — Database operations, in-memory fallback

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

## Production Nginx Routing
- All `/api/*` traffic routes to the **web server** (port 5001), which handles auth, templates CRUD, processor sessions, etc.
- The web server's `apiProxy.ts` forwards specific routes (scorecard, extraction, entity-mappings) to the **API server** (port 5000)
- `/compute/` routes to the Computation Engine, `/arango/` to ArangoDB admin
- This matches the development architecture where the web server is the single entry point

## Landing Page
- Located at `apps/web/Toolkit/src/pages/LandingPage.tsx`, loaded via `LandingWrapper.tsx`
- Fully responsive with breakpoints at 480px, 760px, 900px, and 1024px
- Mobile hamburger menu at 760px with Escape-to-close and auto-close on resize
- Content reflects actual platform capabilities: toolkit import, formula graph parsing, 5-pillar scoring, document extraction
- Stats: 6 sector templates, 5 pillars scored, 12k+ formula nodes, 4 sectors covered
- Sections: Hero, Live Scorecard (animated widget), Features (3-column), Sector Coverage (4 cards), Processing Pipeline, Process Steps (4-step), CTA, Footer
- Sector cards show RCOGP, ICT, FSC, AGRI with node/edge counts from actual ArangoDB templates

## Extraction Pipeline (TDD Integration)

The extraction pipeline (`apps/api/pipeline/extractionPipeline.ts`) provides a tested integration path from extracted entities (LLM or rule-based) to the B-BBEE scorecard. It mirrors the manual flow in `DocumentProcessor.tsx` exactly.

### Key Functions
- **`mapExtractedEntitiesToToolkitInput(parseResult)`** — Maps a `ParseResult` to the `ToolkitFoundationData` + `ToolkitPillarData` shape used by the manual/build flow (ownership, management, skills, procurement, ESD, SED, YES).
- **`validateMinimumFields(mapped)`** — Validates required financial fields (revenue, NPAT, leviable amount, company name). Returns warnings for missing optional data (shareholders, employees, suppliers).
- **`runExtractionPipeline(entities, opts?)`** — End-to-end: takes `LLMExtractionResult[]`, maps → validates → builds scorecard. Returns `ExtractionPipelineResult` with mapped data, validation, and scorecard.
- **`runExtractionPipelineFromParseResult(parseResult)`** — Same pipeline but starting from an already-parsed `ParseResult` (useful for Excel-parsed data).

### Test Coverage
Tests in `apps/api/pipeline/__tests__/extractionPipeline.test.ts` (29 tests):
1. Valid entities → correct mapping + scorecard generation
2. Missing fields → validation failure, no scorecard
3. Parity with manual flow → identical scorecard output
4. No mock data usage → never falls back to "Thandani Transport"
5. Store hydration → all pillar records match manual hydration structure

### Constraints
- Does not modify scoring logic (uses `buildPipelineResult` and `entityResultsToParseResult` as-is)
- No mock fallbacks — validation fails explicitly on missing data
- Deterministic outputs — same input always produces same scorecard

## Document Processor Progress Tracking
The Company Scorecards page (Dashboard → Scorecards tab) displays progress tracking for both upload paths:
- **Upload & Extract**: Steps are Company Info → Mode → Upload → Template → Extract → Processing → Review → Summary → Scorecard
- **Build Manually**: Steps are Company Info → Mode → Foundation → Pillars → Scorecard
- Each session shows a flow type badge (Upload/Build), a progress bar with step indicators, current step label, and percentage complete
- Incomplete sessions show a "Resume" button that navigates to `/processor?session=<id>` and restores the full session state
- The API returns `flowMode` in the session list response for proper flow type detection
- Progress calculation handles unknown/legacy step values gracefully with human-readable labels

## Recent Changes (Bug Fixes & Features)

### Theme Toggle
- `apps/web/Toolkit/src/components/theme-provider.tsx` rewritten to support light/dark/system modes with localStorage persistence (was hardcoded to dark mode)

### Settings Page
- `apps/web/Toolkit/src/pages/Settings.tsx` — New settings page with Account/Profile, Appearance (theme toggle), and Role & Permissions cards
- Accessible from sidebar navigation

### Role Upgrade System
- API endpoint at `/api/auth/request-role-upgrade` (POST) for role upgrade requests (auditor → analyst → manager)
- UI in Settings page for requesting upgrades

### Document Processor Fixes
- `/api/calculate` endpoint in `apps/api/src/routes/scorecardBuilder.ts` — ArangoDB storage wrapped in try/catch so calculation results return even when ArangoDB is unavailable
- Per-page review mode: "by-page" filter in review stage groups entities by page provenance with inline entity cards
- Enhanced extraction progress UI with count and percentage indicators

### Registration Validation
- Server endpoints `/api/auth/check-username`, `/api/auth/check-email`, `/api/auth/check-subscription` with 400ms debounced inline validation on the registration form

## Notes
- Without `MONGODB_URI`, the app runs in in-memory mode with a demo user (username: `demo`, password: `demo`). Default templates are also seeded in database mode if none exist.
- Without SMTP configured (`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`), registration skips OTP verification and logs the user in directly
- Without `ARANGO_URL`/ArangoDB, the Computation Engine uses in-memory mode (`ALLOW_IN_MEMORY_DB=1`) — data will not persist
- **Template architecture**: `/api/entity-templates` returns exclusively the 6 ontology scorecard templates (RCOGP Generic, RCOGP QSE, ICT Generic, ICT QSE, FSC Generic, AGRI Generic) — served by the web server directly (not proxied to API server) using `getAllManifests()`. DocumentProcessor.tsx fetches only from `/api/entity-templates`, filtering for `isOntology: true`. The `starterTemplates.ts` file contains exactly 6 B-BBEE pillar templates (Certificate, Ownership, Management Control, Skills Development, ESD, SED). `buildConfidenceReport` groups extraction results by pillar using a field-to-pillar mapping (not pipe-delimited names). PDF parsing uses `pdfjs-dist` for actual text extraction.
- Vite is configured with `allowedHosts: true` and `host: 0.0.0.0` for Replit proxy compatibility
- Health check available at `GET /api/health` on web server and API server, and `GET /health` on Computation Engine
- Processor session routes gracefully return empty/503 when MongoDB is unavailable (no 10s timeout)
- Password reset flow: POST /api/auth/forgot-password + POST /api/auth/reset-password (rate-limited, 5 attempts/15 min)
- Pillar configs use separated `supplierDevelopment` + `enterpriseDevelopment` keys (not combined `enterpriseSupplierDevelopment`); `employmentEquity` is optional in pillarConfigs
