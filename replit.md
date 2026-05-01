# Okiru Pro - B-BBEE Compliance Platform

## Project Overview
A comprehensive B-BBEE (Broad-Based Black Economic Empowerment) Compliance and Scorecard Management Platform. It automates extraction of data from compliance documents (Excel toolkits, PDF certificates) and performs deterministic score calculations across multiple industry sectors.

## Architecture

This is a **pnpm monorepo** with three applications:

### 1. Web App (`apps/web`) — Port 5000
- **React 19** frontend with **Vite**, **Tailwind CSS**, **Radix UI / shadcn**
- **Express** server that serves both API routes and the Vite dev server (middleware mode)
- Proxy routes forward `/api/*` to the API server on port 3000
- Entry point: `apps/web/server/index.ts`
- Start: `cd apps/web && pnpm dev`

### 2. API Server (`apps/api`) — Port 3000
- **Node.js / Express** backend with TypeScript
- Contains scoring engine, extraction pipeline, document processing
- Integrates with ArangoDB (graph data) and MongoDB (application state)
- Uses OpenAI / Azure OpenAI and Tesseract.js for OCR
- Entry point: `apps/api/index.ts`
- Start: `cd apps/api && pnpm dev`

### 3. Computation Engine (`apps/Computation-Engine`) — Port 8000
- **Python / FastAPI** service
- Compiles Excel-based scorecard models into dependency graphs using `xlcalculator` and `networkx`
- Evaluates B-BBEE formulas without needing Excel at runtime
- Entry point: `apps/Computation-Engine/run_server.py`
- Start: `cd apps/Computation-Engine && python run_server.py`

## Key Technologies
- **Frontend**: React 19, Vite, Tailwind CSS v4, Radix UI, Wouter (routing), TanStack Query, Zustand, Recharts
- **Backend**: Express v5, TypeScript, tsx, esbuild
- **Database**: ArangoDB (graph), MongoDB (documents), Redis (caching)
- **AI/ML**: OpenAI, Azure OpenAI, Tesseract.js, Groq
- **Python**: FastAPI, uvicorn, xlcalculator, networkx, python-arango
- **Package Manager**: pnpm 10 (workspaces)

## Workflows (Replit)
- **Project** (parallel): Runs all three services together
- **Start application**: Web frontend + Express server on port 5000
- **API Server**: API backend on port 3000
- **Computation Engine**: Python FastAPI service on port 8000

## Ports
- `5000` → External port 80 (main web app)
- `3000` → External port 3000 (API server)
- `8000` → External port 8000 (computation engine)
- `24679` → External port 3001 (Vite HMR websocket)

## Environment Variables (Required for full functionality)
- `MONGODB_URI` / `MONGO_URI` — MongoDB connection string
- `ARANGO_URL` — ArangoDB URL (defaults to cloud instance)
- `ARANGO_DB`, `ARANGO_USER`, `ARANGO_PASSWORD` — ArangoDB credentials
- `OPENAI_API_KEY` or Azure OpenAI variables — for AI extraction features
- `GROQ_API_KEY` — for AI chat/extraction endpoints
- `SESSION_SECRET` — express-session secret
- `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_ACCOUNT_NAME` — required for the Certificate Hub uploads/downloads against Azure Blob Storage container `clients-certs`. Provided in the Azure deployment environment.

## Certificate Hub
- **Bulk uploads**: Frontend chunks selections at 20 files per request up to a hard cap of 500 files. Backend multer accepts up to 100 files per chunk (`upload.array('files', 100)`) at 50 MB each. Progress bar shows `X/Y` while uploading.
- **Display**: Both the file list and search results show only the **company name**. The name is derived from the blob filename (`deriveCompanyName` strips UUID prefix, dates, and noise suffixes like `B-BBEE`, `EME/QSE/Generic`, `Certificate`) and then upgraded with the AI-extracted `supplierName` from MongoDB metadata when available.
- **Search**: Both `/list?search=` and `/search?q=` match against filename, derived company name, and Mongo `supplierName`, so users can search by entity even when display name and filename differ. `/search` also merges results from Azure AI Search content matching when configured.

**Note**: Without MongoDB and ArangoDB, the app runs with in-memory storage (data won't persist across restarts). Core UI features still work.

## Shared Packages
- `packages/types` (`@okiru/types`) — shared TypeScript types used by both web and API
- `packages/data-layer` (`@okiru/data-layer`) — implementation-free abstractions for the centralized data access layer (Repository, Unit of Work, Data Access Factory, Provider Registry). Provides a `/testing` subpath export with `FakeUnitOfWork` and `FakeDataAccessFactory` so route handlers can be unit-tested without any database. See `packages/data-layer/README.md`.

## Centralized Data Layer (apps/api/src/data-layer)
A pragmatic adoption of the Repository / UoW / Data Access Factory pattern from the architecture docs in `attached_assets/`:

- **Domain interfaces** in `domain/` (e.g. `IUserRepository`/`UserView`, `IClientRepository`/`ClientView`) describe what the app needs from storage in framework-agnostic terms.
- **Mongo provider** in `mongo/` implements those interfaces using the existing `mongoose` models. `MongoUnitOfWork` exposes one repo per migrated entity (`users`, `clients`, ...) and shares a single Mongoose session across all of them so cross-repository writes participate in the same transaction (when the topology supports it).
- **`buildDataLayer()`** (`data-layer/index.ts`) wires the provider into an `InMemoryProviderRegistry` keyed by the `DATA_PROVIDER` env var (defaults to `mongo`). Returns `{ provider, factory }`. The factory is stored on `app.locals.dataLayer` from `apps/api/index.ts`.
- **`attachUow(factory)` middleware** opens a fresh Unit of Work per request and exposes it as `req.uow`. The companion `withUowErrorHandler()` rolls back any UoW that's still open if the route throws.
- **Production route**: `/api/clients` is fully migrated. `createClientsRouter(factory)` mounts under the data layer; GET/POST/PATCH/logo all flow through `req.uow.clients.*`. Strict zod schemas reject unknown fields on create/update so attackers cannot mass-assign `organizationId`, `id`, or `createdAt`. DELETE and `GET /:id/data` still call `storage.ts` for cross-entity work that depends on entities not yet migrated.
- **POC route**: `GET /api/data-layer-demo/users/by-username/:username` — minimal reference for adding new entities.
- **Testing**: `apps/api/src/data-layer/__tests__/data-layer.test.ts` (21 tests) and `apps/api/src/routes/__tests__/clients.test.ts` (9 tests) cover the §9 fake pattern, the IClientRepository contract, mass-assignment guards, and UoW rollback on error.
- **Migration playbook**: `docs/architecture/DATA-LAYER-MIGRATION-PLAYBOOK.md` documents the 6-step recipe and lists which entities are still on `storage.ts`.

## Production Hardening
- **Env validation** (`apps/api/src/env.ts`): zod-validated config; refuses to boot in production without a strong `SESSION_SECRET`, `MONGO_URI`, and `CORS_ORIGIN`.
- **Session store**: fails closed in production — refuses to boot if MongoDB is unavailable rather than silently using `MemoryStore`.
- **Security middleware**: helmet, compression, CORS allowlist, body limits (50 MB), per-request id logging, global 120 req/min rate limit, stricter 10 req/min limiter on `/api/auth`.
- **Production error handler**: strips stack traces from 500 responses in `NODE_ENV=production`.
- **Graceful shutdown**: SIGTERM/SIGINT close the HTTP server then mongoose, with a 10-second hard-kill safety timer.

## Deployment
- Build: `pnpm install --frozen-lockfile=false && pnpm --filter @okiru/api build && pnpm --filter rest-express build`
- Run: Starts API server then web server in production mode
- Target: `autoscale`
