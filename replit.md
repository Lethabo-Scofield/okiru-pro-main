# Okiru Pro — B-BBEE Compliance & Scorecard Management Platform

## Overview
Okiru Pro is a comprehensive platform for automating B-BBEE (Broad-Based Black Economic Empowerment) compliance calculations, scorecard management, and reporting for South African businesses.

## Design System
The UI follows the **Sim Design Language** (tokens defined in `apps/web/src/index.css` and `apps/web/Toolkit/src/index.css`). The brand color palette is preserved (Toolkit purple primary `265 84% 58%`, app dark/slate primary `220 14% 28%`); only structural tokens were aligned to Sim DL.

**Tokens applied:**
- **Typography**: Season font with system fallbacks; body 15px/24px (weight 450); h1–h6 follow the Sim modular scale (36/30/27/22/18/15px).
- **Radius scale**: `--radius-sm: 4px`, `--radius-md: 8px`, `--radius-lg: 12px`, `--radius-xl: 16px`. Base `--radius` = `0.5rem`.
- **Status colors** (semantic, defined in both light + dark): `--status-success`, `--status-warning`, `--status-error`, `--status-info` plus `-bg` variants. Exposed via Tailwind utilities like `bg-status-success-bg` / `text-status-error`.
- **Elevation**: `--shadow-elev-1/2/4/6` and `.elev-1`–`.elev-6` utility classes.
- **Motion**: `--motion-duration-xs/sm/base/md` (100/150/200/300ms) and `--motion-easing-standard/spring/out`.
- **Buttons**: default `min-h-10`, sm `min-h-8`, lg `min-h-12`, icon `h-10 w-10` (Sim DL sizing).
- **Typography utilities**: `.text-display`, `.text-body-md`, `.text-body-sm`, `.text-caption`, `.text-mono`.

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
4. **Reporting** — PDF (Certificate + Verification Report), Excel, and PPTX scorecard exports. All exports use dynamic pillar targets from `state.scorecard.<pillar>.target` (RCOGP Generic defaults: Ownership 25, Management 19, Skills 25, Procurement 29, SD 10, ED 7, SED 5, YES 3, Total 120). Skills programs use schema-aware field names (`programName`/`totalCost`/`categoryCode`/`race`-derived `isBlack`) with legacy fallbacks.
5. **What-If Modeling** — scenario planning for scorecard optimization

## Certificate Hub — KPI Dashboard & Supplier Registry
The Certificate Hub (`/certificates`) features:
1. **KPI Dashboard** — 6 glassmorphic metric cards: Total Suppliers, Valid Certificates, Expiring Soon, Expired, Avg B-BBEE Level, Empowering Suppliers. All KPIs compute client-side from supplier chunk data. Clicking a card filters the registry table below.
2. **Supplier Certificate Registry** — sortable, filterable table of suppliers with B-BBEE level badges, status indicators, expiry dates, and CSV export.
3. **Certificate Files** — full-text PDF content search powered by Azure AI Search (tab-based view).
4. **Certificate Upload** — drag-and-drop upload modal (header button) supporting PDF, PNG, JPG, XLS, DOC up to 50MB, multi-file (up to 20). Uploads go to Azure Blob Storage via `POST /api/certificates/upload` (auth-protected, multer, UUID-prefixed blob names scoped by org). File list auto-refreshes after upload.
5. **Expiry Date Extraction** — `POST /api/certificates/extract` reads each certificate PDF/image from Azure Blob, extracts text via pdfjs-dist (text layer) or Tesseract OCR (scanned), and uses regex NER to find expiry dates (patterns: "Valid until", "Expiry Date", "Expires", etc.). Results stored in MongoDB `certificate_metadata` collection. `GET /api/certificates/stats` returns live KPI counts computed from extracted expiry dates. Frontend shows "Extract Dates" button with SSE progress when metadata is missing.
6. **API Endpoint** — `GET/POST /api/supplier-certificates` (auth-protected, validated, in-memory).

## Certificate Hub — Full-Text Search (Azure AI Search)
The Certificate Hub has been upgraded with full-text PDF content search powered by Azure AI Search.

### How It Works
1. **Ingestion Script** (`apps/api/scripts/ingestCertificates.ts`) — reads PDFs from Azure Blob Storage, extracts text via pdfjs-dist (text PDFs) or Tesseract OCR (scanned/image PDFs), chunks text (~1000 chars), and uploads to an Azure AI Search index.
2. **Search API** (`GET /api/certificates/search?q=<query>&userId=<userId>`) — combines filename matches from Blob Storage with full-text content matches from Azure AI Search, returns results grouped by document with text snippets.
3. **Frontend** (`apps/web/src/pages/CertificateHub.tsx`) — debounced search bar queries the new API; falls back to original filename-based browsing when no search query is active.
4. **OCR Support** — uses `tesseract.js` + `pdftoppm` to extract text from scanned/image PDFs that have no text layer.

### Running the Ingestion
```bash
cd apps/api && pnpm ingest:certificates
```

### Key Files
- `apps/api/src/services/azureSearch.ts` — Azure AI Search client, index management, search logic
- `apps/api/scripts/ingestCertificates.ts` — One-time ingestion script
- `apps/api/src/routes/certificates.ts` — Search endpoint (with fallback to filename search)

## Traffic Analytics — GA4 Tag + Admin Analytics (July 2026)
Google Analytics tracking on the public site plus a protected `/admin/analytics` "Traffic Analytics" dashboard backed by secure server-side GA4 Data API + Search Console endpoints.

### Public tracking tag
- The GA4 `gtag.js` tag (measurement ID `G-WF69VTV757`) lives **once** in `apps/web/index.html` `<head>`, so it loads on every route the SPA serves.
- SPA route changes are tracked via `usePageViewTracking()` (`apps/web/src/lib/gaTracker.ts`), called once in `AppRouter` (`apps/web/src/App.tsx`). It fires a `page_view` on each wouter location change; it is a safe no-op when `gtag` is unavailable.
- The measurement ID is **only** used for the client tag — it is NOT the GA4 numeric Property ID used by the backend.

### Admin page
- Route `/admin/analytics` (`apps/web/src/pages/AdminAnalytics.tsx`), wrapped in `<ProtectedRoute>` with an internal admin/super_admin role check (`hasAnyRole`). Reachable from the Hub user menu (`HubLanding.tsx`, visible to admin + super_admin).
- Uses the existing UI kit (Card/Table/Tabs/Select/Skeleton/Badge) and recharts. Date range selector (Today / 7d / 30d / 90d, default 30d). Tabs: **Overview** (metric cards with period-over-period change, real-time section auto-refreshing every 60s, traffic sources chart+table, searchable+paginated top pages, audience charts) and **Google Search** (Search Console totals + top queries + top pages).
- Every section has loading skeletons, empty states, error states with a Retry button, and a "not connected" configuration message. No fabricated numbers.

### Backend
- Service: `apps/api/src/services/googleAnalytics.ts` — service-account JWT (`google-auth-library`) mints access tokens; GA4 Data API + Search Console are called over REST via `fetch` (no gRPC). In-memory cache: historical 10 min, realtime 60s. Requests have a 20s timeout. `isAnalyticsConfigured()` / `isSearchConsoleConfigured()` gate on env presence.
- Routes: `apps/api/src/routes/adminAnalytics.ts`, mounted at `/api/admin/analytics` in `routes/index.ts`. Endpoints: `overview`, `realtime`, `sources`, `pages`, `audience`, `search-console`. All require auth + admin/super_admin, validate `range`, and return `{configured:false}` (200) when credentials are missing. Upstream Google errors are logged server-side and surfaced as a generic 502 — never leaking credentials or raw errors.
- The web server proxies `/api/admin/analytics` to the API server (added to `PROXIED_PREFIXES` in `apps/web/server/apiProxy.ts`).
- Shared response types are mirrored in `apps/web/src/types/analytics.ts` (web app does not import `@okiru/types`).

### Setup required (Google Cloud) — analytics stays "not connected" until done
1. Create a Google Cloud service account; download its JSON key.
2. Enable **Google Analytics Data API** and **Google Search Console API** in that Cloud project.
3. Grant the service account **read** access to: (a) the GA4 property (Analytics Admin → Property Access Management → Viewer), and (b) the Search Console property `sc-domain:okiru.pro` (already DNS-verified).
4. Set the server env vars (see `apps/api/.env.example`): `GOOGLE_ANALYTICS_PROPERTY_ID` (numeric GA4 Property ID — NOT the measurement ID), `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (escaped `\n` handled automatically), `GOOGLE_SEARCH_CONSOLE_PROPERTY` (default `sc-domain:okiru.pro`).

## External Dependencies (require configuration)
- **MongoDB** — set `MONGODB_URI` environment variable
- **ArangoDB** — set `ARANGO_URL`, `ARANGO_USER`, `ARANGO_PASSWORD`, `ARANGO_DB`
- **Azure AI Search** — set `AZURE_SEARCH_ENDPOINT`, `AZURE_SEARCH_API_KEY`, `AZURE_SEARCH_INDEX_NAME`
- **Azure Blob Storage** — set `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_ACCOUNT_NAME`
- **OpenAI/Azure OpenAI** — set `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_KEY`, `AZURE_OPENAI_DEPLOYMENT`
- **Groq** — set `GROQ_API_KEY`
- **Redis** — set `REDIS_URL`

## Running Without External Services
The app gracefully degrades when external services are unavailable:
- Falls back to **in-memory storage** when MongoDB is not connected
- Computation Engine uses **in-memory DB mode** when ArangoDB is unavailable
- AI endpoints return errors when API keys are not set

## Information Request — Mongo-less dev fallback (May 2026, `lethabo/quality-assurance`)
- **`/api/clients` in-memory fallback** — `GET/POST/GET:id/PATCH:id/DELETE:id/GET:id/data/POST:id/bulk-import` now branch on `isMongoConnected()`. Without Mongo they read/write a shared module-level Map in `apps/web/server/clientsMemoryStore.ts` instead of letting Mongoose buffer and time out. The Mongo path is unchanged. The same tenant filter (org-or-creator) is applied in both branches via the new `loadClientWithAccess` helper.
- **Workbook GET tenant check** — `authorizeWorkbookAccess` in `apps/web/server/workbookRoutes.ts` now consults the in-memory clients store when `!mongoReady()`. An unknown or cross-tenant `companyId` returns `404 "Company not found"` instead of synthesising a fresh workbook stamped with the caller's org. The Mongo branch was hardened to return 404 for cross-tenant access too (was 403, leaked existence).
- **Submit unchanged** — when Mongo is absent, `POST /api/workbook/:id/submit` still returns a clean `503 "Database unavailable — cannot submit workbook."` (no silent write to memory).
- **Known dead code (follow-up)** — `apps/api/src/routes/index.ts` still mounts an unused `clientsRouter` (`apps/api/src/routes/clients.ts`); browser requests go to the web server's `/api/clients` before reaching the API proxy, so the API copy never runs. Remove in a follow-up to stop drift.
- **Hardened Mongo client access** — `loadClientWithAccess` now refuses access to legacy records missing both `organizationId` and `createdByUserId` in production (logged via `logger.warn`); dev still tolerates them for fixtures. The Mongo `GET /api/clients` list now uses `{$or: [{createdByUserId}, {organizationId}]}` to match the in-memory branch and to never list with an empty filter when the user has no org.
- **Tests** — `apps/web/server/__tests__/clientsFallback.test.ts` (10 tests, all passing). Covers `listClientsForTenant`/`canAccessClient` unit behaviour (including cross-tenant denial and null-tenancy orphan denial) plus an HTTP round-trip against the dev server: `/api/clients` 200 empty → 200 after create → list includes the new client, `/api/workbook/:owned` 200, `/api/workbook/:unknown` 404, submit still 503. Run with `pnpm --filter rest-express vitest run server/__tests__/clientsFallback.test.ts`. The HTTP tests use `REPLIT_DEV_DOMAIN` (HTTPS) because the session cookie is `Secure` in Replit.

## Production Deployment
- **Replit**: Build command builds both `apps/api` and `apps/web`; `scripts/start-production.sh` starts both servers
- **Docker/K8s**: Separate Dockerfiles for each service (`apps/api/Dockerfile`, `apps/web/Dockerfile`, `apps/Computation-Engine/Dockerfile`)
- The web server proxies `/api/certificates` (and other API routes) to the API server — both must be running

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

## Onboarding & Team Invitations (May 2026)
The team invitation system was hardened to feel collaborative (Google Drive style), not like a generic platform email.

- **Inviter-branded email** — `sendWorkspaceInviteEmail()` in `apps/web/server/email.ts` sends from `"<Inviter Name> · <Company> (via Okiru)"` with `Reply-To` set to the inviter, so replies go to a real person. Subject reads `"<Inviter> invited you to "<Project>" on Okiru"` and the body lists inviter, company, project, role, recipient, expiry, and a single Open Project CTA. Pure builder `buildWorkspaceInviteEmail()` is exported for unit tests; user-supplied fields are HTML-escaped.
- **Invite create route** (`POST /api/workspaces/:workspaceId/invites`) now blocks self-invites, blocks inviting an existing member of the workspace, blocks duplicate active pending invites for the same email (`storage.findActivePendingInvite`), sends the invite email best-effort, and writes a `workspace.invite.create` audit log on every outcome. The list endpoint strips raw tokens — only the email recipient ever sees the token.
- **Accept route** validates the invite is `pending`, that the signed-in user's email matches the invite email, is idempotent if the user is already a member, and writes `workspace.invite.accept` audit logs (success + each failure reason: `not_found`, `expired`/`accepted`/`revoked`, `email_mismatch`).
- **Revoke route** is tenant-scoped (`(inviteId, workspaceId)` match enforced in storage) and audit-logged.
- **Tokens & expiry** — 24-byte `crypto.randomBytes` base64url tokens, default 14-day expiry. `publicInviteStatus()` derives `pending|accepted|revoked|expired`.
- **Tests** — `apps/web/server/__tests__/invites.test.ts` (15 tests, all passing) covers token entropy/uniqueness, expiry math, accept/revoke semantics, tenant isolation on revoke and `findActivePendingInvite`, the email template content, HTML escaping, and missing-company fallback. Run with `pnpm --filter rest-express vitest run server/__tests__/invites.test.ts`.

## Information Request — in-memory fallback & tenant check (May 2026)
Hardened on `lethabo/quality-assurance` after a manual E2E pass.

- **`/api/clients` in-memory fallback (P1)** — `GET`, `POST`, `GET/:id`, `PATCH/:id`, `DELETE/:id`, `GET/:id/data`, and `POST/:id/bulk-import` in `apps/web/server/routes.ts` now branch on `isMongoConnected()`. When Mongo is offline they read/write the shared `MemoryStorage` via new IStorage methods (`listClientsForUser`, `getClientByClientId`, `updateClientByClientId`, `deleteClientByClientId`); when it's connected, behaviour is unchanged (still goes through `ClientModel` with `buildClientVisibilityFilter`). Lets the Information Request CompanyPicker list and create companies in dev without MongoDB.
- **Tenant guard on `/api/clients/:clientId*` (IDOR fix)** — All per-id routes (`GET`, `PATCH`, `DELETE`, `GET/:id/data`, `POST/:id/bulk-import`) now run through a shared `loadClientWithAccess()` helper that loads the client (Mongo or memory), then requires the caller to be the creator, a member of the same `organizationId`, or a `super_admin` viewing a `lakeTradingDemo` client. Unknown id → 404; cross-tenant → 403 (logged). Closes a pre-existing IDOR on the per-id handlers surfaced during code review of the P1 fallback.
- **Tenant check on workbook GET (P3)** — `authorizeWorkbookAccess()` in `apps/web/server/workbookRoutes.ts` no longer skips the client-existence check when Mongo is down. The no-Mongo branch loads the client from `storage`, returns `404` if it doesn't exist, and `403` if it belongs to a different tenant. Stops `GET /api/workbook/:anyId` from synthesising a workbook stamped with the caller's org for arbitrary ids.
- **Submit still 503s cleanly** when Mongo is absent (unchanged) — the in-memory fallback is read/write for the workbook editor; submit remains a Mongo-only operation that surfaces a clear "Database unavailable" error.
- **Tests** — `apps/web/server/__tests__/clientsFallback.test.ts` (10 tests) cover empty/non-empty listing, tenancy filtering (own user, same org, super_admin demo-visibility), CRUD by `clientId`, and the workbook GET 404/403/200 matrix. Run with `pnpm --filter rest-express exec vitest run server/__tests__/clientsFallback.test.ts`.
- **Follow-up — duplicate `/api/clients`** — `apps/api/src/routes/index.ts:117` ships a second `/api/clients` implementation that is unreachable in dev (the API server has no auth session for the web cookie) and effectively dead code. Leave for a dedicated cleanup task.

## Task 4 — Template guidance, SED contribution types, Skills bulk upload (May 2026)
Hardened on `lethabo/quality-assurance` per `.local/tasks/task-4.md`.

- **New "Instructions" sheet in the Information Request Excel export** — `buildInstructionsSheet()` in `apps/web/server/workbookRoutes.ts` is prepended to every downloaded workbook. It spells out the date format (`dd/mm/yyyy`), Rand-numeric convention, Yes/No convention, accepted Race / Gender / Size / B-BBEE Level / Measured-Under / Skills-Category values, and a full table of recognised SED and ESD contribution types with one-line definitions sourced from the Codes (Statements 400 and 500). Source of truth for the contribution-type guidance is `SED_CONTRIBUTION_GUIDANCE` / `ESD_CONTRIBUTION_GUIDANCE` in `apps/web/src/components/workbook/sections.ts` (so the same text appears in the in-app grid tooltips).
- **In-app SED/ESD contribution-type guidance** — `ColumnDef` gained optional `guidance` and `optionGuidance` fields. `SpreadsheetGrid.tsx` renders `optionGuidance[currentValue] || guidance` as the `title` on the `<select>` and per-option, so hovering the SED / ESD Contribution Type cell explains what each option means. Wired on both `ESD_COLUMNS` and `SED_COLUMNS`.
- **Skills Development — Bulk Upload (Toolkit)** — `apps/web/Toolkit/src/pages/pillars/SkillsDevelopment.tsx` previously had a dead "Bulk Upload" button. It now opens a hidden `<input type="file" accept=".xlsx,.xls,.csv">` and `handleBulkUpload()` parses the file with `xlsx`, prefers the "Skills Development" sheet (matching the downloaded template), case- and punctuation-insensitively maps headers from the template (`Training Program Name *`, `Category *`, `Learner Name *`, all cost columns, etc.), normalises Race/Gender/Category/Yes-No values, skips rows missing program/learner/cost, and pushes valid rows through `addTrainingProgram()`. Surfaces a toast with imported/skipped counts.
- **Skills target-spend source** — confirmed `targetSpend = leviableAmount * overallTargetPct` reads `leviableAmount` directly from the Zustand store (`skills.leviableAmount`) — the same key the Financials pillar writes to. No mismatch to fix; payroll/leviable changes propagate immediately to the Skills KPI cards.
- **FSC scorecard completeness** — audited `apps/api/pipeline/sectorConfig.ts` (`FSC_GENERIC`, totals **120** = 25+21+23+24+10+9+8 for the "Others" sub-sector) against `apps/api/pipeline/sectorSubElements.ts` (`FSC:Generic` already enumerates Ownership / MC+EE / Skills / PP / SD / ED / SED+Consumer Education sub-elements consistent with the BBBEE Toolkit (FSC) Template v1.0.xlsx). The "Others" sub-sector has **no** Empowerment Financing (`empowermentFinancing` and `accessToFinancialServices` PillarConfig interface slots exist for sub-variants but are intentionally 0 for Others, per the FSC code). The FSC sub-variants (Banks, Long-Term Insurers, Short-Term Insurers) which **do** have Empowerment Financing + Access to Financial Services as priority elements are not modelled yet — that is left as a follow-up so a dedicated sub-sector picker can be designed.
- **Route verification — `/hub` and `/test`** — `/hub` is mounted in `apps/web/src/App.tsx` (`<ProtectedRoute><HubLanding /></ProtectedRoute>`) and serves the Hub landing as expected. `/test` is **not** an application route — the wouter `Switch` falls through to the `NotFound` catch-all. If a `/test` route is required, add it to `App.tsx` alongside `/devmode`; no action taken in this task since it was a verification ask only.

## Regression suite — May 2026 BBBEE fixes (Task #18, `lethabo/quality-assurance`)
Locks in Tasks #2/#3/#4. All 112 new tests pass across 10 test files. The 84 pre-existing `Toolkit/src/lib/calculators/__tests__/skills.test.ts` failures (April 2026, commit `9afe7bc6d`) and other long-standing failures (Toolkit `esd-sed.test.ts`, `pipeline/scoringEngine.test.ts`, `src/routes/__tests__/clients.test.ts`, network-dependent auth tests, `session-store.test.ts`) are out of scope and unchanged.

**New test files**
- `apps/web/src/lib/__tests__/workbookExcelNormalizer.procurement.test.ts` — spend-column header aliases, `parseLooseNumber` Rand/negative contract, `SUPPLIER_SIZE_MAP` synonyms, Procurement/Suppliers sheet dedupe.
- `apps/web/src/lib/__tests__/workbookExcelNormalizer.employmentEquity.test.ts` — `OCC_LEVEL_MAP` direct assertions + Excel-upload round trip for Employees / Management Control sheets.
- `apps/web/src/lib/__tests__/workbookLegacyCompat.test.ts` — legacy "Suppliers" sheet routes into the canonical `procurement` section without data loss; SECTIONS catalogue no longer exposes `suppliers`.
- `apps/web/src/components/workbook/__tests__/sectorRendering.regression.test.ts` — TRANSPORT splits MC/EE; every other sector (RCOGP, GENERIC, ICT, FSC, MAC, CONSTRUCTION, AGRI, PROPERTY, TOURISM) merges them; `SED_COLUMNS` is never mutated; storage keys are stable across sector switches.
- `apps/web/src/components/workbook/__tests__/categoricalColumnGuard.test.ts` — every categorical `ColumnDef` is `type: "select"` with non-empty `options`; B-BBEE Level options match the canonical list; Toolkit `ESD.tsx`/`Procurement.tsx` render the level as a `<Select>` (source-level smoke check, no RTL).
- `apps/web/src/components/workbook/__tests__/financialSingleSource.test.ts` — `FINANCIAL_META` has no `leviableAmount` field; `mapWorkbookFinancialsToClient` is the single derivation point (`forecastPayroll` → `leviableAmount` → `payroll` fallback).
- `apps/web/Toolkit/src/pages/pillars/__tests__/SkillsDevelopment.bulkUpload.test.ts` — extracted `parseSkillsBulkUploadBuffer` helper: template parsing, case/punctuation-insensitive headers, Race/Gender/Category/Yes-No normalisation, skip counters, garbage workbook error string, % of payroll arithmetic.
- `apps/web/server/__tests__/workbookRoutesInstructionsSheet.test.ts` — `buildInstructionsSheet()` documents date format, amount conventions, auto-generates per-sheet column reference from SECTIONS (with Required / Type / Accepted-values cells per column); SED/ESD guidance maps cover every dropdown option; `buildXlsx()` places "Instructions" first.
- `apps/web/server/__tests__/workbookRoutesLegacySuppliers.test.ts` — persisted workbook JSON with the legacy `sections.suppliers` key still projects into the canonical `suppliers` client output via `projectWorkbookToClient`; dedupes by `_id` across `procurement` + `suppliers`; merges distinct rows.
- `apps/web/src/__tests__/routes.test.ts` — App.tsx declares `/hub`, `/dashboard`, `/certificates`, `/super-admin`; does NOT declare `/test`.
- `apps/api/__tests__/fscScorecard.test.ts` — `FSC_GENERIC` totals 120 (25+21+23+24+10+9+8); `SECTOR_PILLAR_SUB_ELEMENTS['FSC:Generic']` row totals reconcile with pillar caps once bonus rows are accounted for; FSC Banks / LTI / STI sub-variants are `it.skip` with a TODO referencing follow-up Task #10.

**Production code touched (minimal)**
- `apps/web/server/workbookRoutes.ts` — added `export` to `buildInstructionsSheet` so the instructions-sheet test can call it directly. No behaviour change.
- `apps/web/Toolkit/src/pages/pillars/bulkUploadParser.ts` (new) + `SkillsDevelopment.tsx` (refactor) — extracted the inline xlsx parsing from `handleBulkUpload` into a sibling `parseSkillsBulkUploadBuffer()` helper that is pure / testable. The component now calls the helper and routes its `{ programs, skipped, error }` result through the existing toast UX. No user-visible change.

**Commands**
```bash
# Web — runs all 9 new web/Toolkit/server tests + the existing suite
pnpm --filter rest-express exec vitest run
# Just the new files (~5s):
pnpm --filter rest-express exec vitest run \
  src/lib/__tests__/workbookExcelNormalizer.procurement.test.ts \
  src/lib/__tests__/workbookExcelNormalizer.employmentEquity.test.ts \
  src/lib/__tests__/workbookLegacyCompat.test.ts \
  src/components/workbook/__tests__/sectorRendering.regression.test.ts \
  src/components/workbook/__tests__/categoricalColumnGuard.test.ts \
  src/components/workbook/__tests__/financialSingleSource.test.ts \
  src/__tests__/routes.test.ts \
  server/__tests__/workbookRoutesInstructionsSheet.test.ts \
  server/__tests__/workbookRoutesLegacySuppliers.test.ts \
  Toolkit/src/pages/pillars/__tests__/SkillsDevelopment.bulkUpload.test.ts

# API — FSC scorecard regression
pnpm --filter @okiru/api exec vitest run __tests__/fscScorecard.test.ts
```

## Enterprise Security (Apr 2026)
The platform was upgraded for enterprise security review. Full deliverable in `ENTERPRISE_SECURITY_REVIEW.md`.

- **RBAC** — action-based permissions catalogue (`apps/api/src/security/permissions.ts`) with default role mappings (`auditor`, `analyst`, `manager`, `admin`, legacy `user`). Tenant-scoped overrides via Mongoose `rbacRoles`/`rbacRoleAssignments`. Use `requirePermission(PERMISSIONS.X)` middleware on routes.
- **Audit log** — append-only `auditLogs` MongoDB collection. Schema-level pre-hooks block update/delete. `recordAudit(req, event)` is fire-and-log (best-effort). Admin query at `GET /api/admin/audit-logs` (requires `audit.read`, hard-pinned to caller's session org). The web server writes to the same collection via `apps/web/server/securityAudit.ts`.
- **Tenant isolation** — `requireTenantOwnership({ resourceType, loader })` and `assertSameTenant(...)` in `apps/api/src/security/tenant.ts`. Cross-tenant attempts return 403 and are audited.
- **Request security** — strict CORS allowlist with rejection logging in `apps/api/index.ts`; zod-backed `validateBody` / `validateQuery` middleware in `apps/api/src/security/validate.ts` (applied to register, login, audit query).
- **Tests** — `apps/api/__tests__/security/*.test.ts` (55 tests, all passing). Run with `pnpm --filter @okiru/api exec vitest run __tests__/security`.
