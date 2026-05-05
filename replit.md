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

## Certificate Hub (Public B-BBEE Registry)
- **Public access**: `/certificates` is a **public** route (no `ProtectedRoute`). Anonymous visitors can browse, search, filter, and download. The landing page nav exposes a "B-BBEE Certificates" link before Sign in / Get started (desktop + mobile).
- **Auth-gated upload**: Only the upload action requires authentication. Anonymous users clicking Upload are redirected to `/auth?mode=register&redirect=/certificates`. `AuthWrapper` (`apps/web/src/pages/AuthWrapper.tsx`) honors `?redirect=<same-origin path>` and `?mode=register` query params and routes the user back after a successful login.
- **Rich metadata schema**: `certificateMetadataSchema` (`apps/api/models.ts`) carries `supplierName`, `vatNumber`, `companySize`, `bbbeeLevel`, `blackOwnership`, `blackWomenOwnership`, `expiryDate`, `uploadedByUserId`, `uploadedAt`, `updatedAt`. The hub UI surfaces all of these per row plus a status badge (Valid / Expiring / Expired / Unknown).
- **Storage fallback chain**: `/list`, `/stats`, `/search`, `/download`, `/upload` in `apps/api/src/routes/certificates.ts` use a 3-tier fallback — Azure Blob (`clients-certs` container) → MongoDB metadata → `apps/api/src/services/certificateStore.ts` (in-memory metadata + local disk under `apps/api/uploads/certificates/`). All endpoints return 200 even when none of Azure, Mongo, or Arango is configured.
- **Filters**: validity status, company size (EME/QSE/Generic/Large/Specialised), and black-ownership ranges. Search matches company name, VAT number, and filename across both backends.
- **Bulk uploads** (legacy authed flow still available): the upload modal collects metadata for a single certificate. Multer caps file size at 50 MB.

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

## Company Onboarding Flow
- After signup/login, `AuthWrapper` calls `GET /api/onboarding/me`. A `404` response means the user hasn't onboarded yet, so they're routed to `/onboarding?redirect=<original-destination>`.
- The `/onboarding` page (apps/web/src/pages/Onboarding.tsx) collects 9 fields: companyName, role, beeLevel, employeeRange, industry (+Other), annualRevenue, acquisitionSource (+Other), toolsUsed[] (+Other), biggestChallenge.
- On submit, `POST /api/onboarding` upserts the profile (keyed by userId) and the user is redirected to the original destination. When the destination is `/certificates`, the URL becomes `/certificates?openUpload=1` and `CertificateHub` auto-opens the upload modal.
- Endpoints exist on both the web server (apps/web/server/routes.ts, used in dev with in-memory storage) and the API server (apps/api/src/routes/onboarding.ts, used when MongoDB is available). Both implementations accept the same field set and the data model is shared via `packages/types` (`CompanyProfile` / `InsertCompanyProfile`). Persistence collection: `company_profiles`.

## Workspaces, Members & Invites
- Each user gets an owner workspace at signup using the company name collected on AuthPage step 1 (Company → Your Details → Credentials → Role). The register handler calls `storage.createWorkspace(name, userId)` and persists `organizationId` on the user. Workspace creation is required — the request returns 500 if it fails (no silent partial registration).
- Roles: `owner`, `collaborator`, `viewer`. Owners can rename the workspace, invite/revoke, change roles (collaborator↔viewer only), and remove members. Collaborators can invite. Viewers are read-only.
- `PATCH /api/workspaces/:id/members/:userId` only accepts `collaborator|viewer`; the owner is immutable (no ownership transfer endpoint yet).
- Invites: 14-day TTL, base64url 24-byte tokens. Public lookup at `GET /api/invites/:token` returns workspace name + invitee email (capability token model). Accepting requires the signed-in account to have a verified email matching the invite — `PATCH /api/profile` clears `isVerified` whenever the email is changed and rejects duplicates, blocking the email-swap bypass. Accepting when already a member preserves the existing role (no silent downgrade).
- Frontend pages: `/workspace` (Workspace.tsx) and `/invite/:token` (AcceptInvite.tsx). HubLanding header has a Building2 button → `/workspace`.
- Mongo models live in `apps/web/shared/schema.ts`: `workspaces`, `workspace_members` (unique on `{workspaceId, userId}`), `workspace_invites` (unique on `token`).

## Deployment
- Build: `pnpm install --frozen-lockfile=false && pnpm --filter @okiru/api build && pnpm --filter rest-express build`
- Run: Starts API server then web server in production mode
- Target: `autoscale` (Replit). Production target is **Azure AKS** via Kustomize at `kubernetes/infrastructure/overlays/prod`.

## Production Secrets (Azure AKS)
The K8s template at `kubernetes/infrastructure/overlays/prod/secrets/secrets.yaml` is populated by GitHub Actions from these GitHub Secrets (and the same values can be loaded into Azure Key Vault when using `external-secrets`):

**Required to boot:**
- `SESSION_SECRET` (≥32 random chars, not a placeholder), `JWT_SECRET`, `API_INTERNAL_KEY`
- `MONGODB_URI` (Cosmos for MongoDB API or Mongo replica set), `MONGODB_DB_NAME`, `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`
- `ARANGO_URL`, `ARANGO_DB_NAME`, `ARANGO_ROOT_PASSWORD`
- `CORS_ORIGIN` (configmap, must match the public host)

**Required for verified signup + invite emails:**
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` (Azure Communication Services Email, SendGrid, SES, etc.)
- `APP_BASE_URL` (configmap, used for invite links in emails)

**LLM / extraction:**
- `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, `AZURE_OPENAI_FAST_DEPLOYMENT`, `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`, `AZURE_OPENAI_API_VERSION`
- `GROQ_API_KEY` (optional fallback)

**Certificate Hub:**
- `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_ACCOUNT_NAME` (container `clients-certs`)
- `AZURE_SEARCH_ENDPOINT`, `AZURE_SEARCH_API_KEY`, `AZURE_SEARCH_INDEX_NAME`

**Backups + ACR:**
- `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_KEY` (backup-sync sidecar)
- `ACR_PULL_SECRET` (created directly by GHA via `kubectl create secret docker-registry`)

**Optional / Redis:**
- `REDIS_URL`, `REDIS_PASSWORD`

A copy-pasteable template lives at `deploy/.env.production.template`.
