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

## Construction Sector (May 2026)
The Construction Sector Code is supported as a first-class sector with three entity-type variants. All scoring is indicator-level and computed from a declarative matrix — no hardcoded route logic.

### Files
- `apps/api/pipeline/constructionIndicators.ts` — indicator matrices for all three entity types (source of truth, sourced from the Construction QSE and Construction Sector Codes documents in `attached_assets/`).
- `apps/api/pipeline/constructionScoring.ts` — pure scoring engine. Reads the matrix, returns the standard scorecard shape (`totalScore`, `elementScores`, `indicators[]` with `achievedPoints`/`availablePoints`/`target`/`actual`/`gap`/`status`/`missingFields`/`recommendation`).
- `apps/api/src/routes/construction.ts` — API routes (mounted at `/api/construction`).
- `apps/api/__tests__/construction.test.ts` — 22 tests, all passing. Run: `pnpm --filter @okiru/api exec vitest run __tests__/construction.test.ts`.

### Entity Types & Element Totals
| Entity | Code | Ownership | MC | Skills | ESD | SED | Total |
|---|---|---|---|---|---|---|---|
| Construction QSE | `construction_qse` | 30 | 20 | 26 | 29 | 5 | **110** |
| Construction Contractor | `construction_contractor` | 31 | 22 | 26 | 38 | 6 | **123** |
| Construction BEP | `construction_bep` | 31 | 22 | 34 | 30 | 6 | **123** |

BEP intentionally has no Junior Management row in MC (per source). Bonus indicators sit inside their parent element and are capped at the element max.

### API
- `GET /api/construction/entity-types` — list of supported entities.
- `GET /api/construction/template/:entityType` — full indicator matrix for an entity (used by the data-entry UI).
- `POST /api/construction/evaluate` — body `{ entityType, indicators: { <inputKey>: value }, financials: { npat, leviableAmount, totalMeasuredProcurementSpend }, africanEapPercent? }` → returns the scorecard.

Missing data is handled gracefully — indicators with no input or with missing dependent financials return `status: "missing_data"` with `missingFields` populated, never throw.

### Frontend
The sector dropdown (`apps/web/src/components/build/ClientInformationForm.tsx`) and the `/api/sectors/options` fallback both include `CONSTRUCTION` with `availableTypes: ['Contractor', 'BEP', 'QSE']`.

### Caveats / TODOs in source
- QSE skills second-tier indicator (`qse.skills.spend_black_secondary`) — the source docx target appears as 25%; verify against the gazetted scorecard before relying on it for production verification.
- Construction-specific level thresholds were not in the supplied source documents; the engine returns total points only and lets the existing level threshold layer (or a Construction-specific extension) translate scores to a B-BBEE level.

## Enterprise Security (Apr 2026)
The platform was upgraded for enterprise security review. Full deliverable in `ENTERPRISE_SECURITY_REVIEW.md`.

- **RBAC** — action-based permissions catalogue (`apps/api/src/security/permissions.ts`) with default role mappings (`auditor`, `analyst`, `manager`, `admin`, legacy `user`). Tenant-scoped overrides via Mongoose `rbacRoles`/`rbacRoleAssignments`. Use `requirePermission(PERMISSIONS.X)` middleware on routes.
- **Audit log** — append-only `auditLogs` MongoDB collection. Schema-level pre-hooks block update/delete. `recordAudit(req, event)` is fire-and-log (best-effort). Admin query at `GET /api/admin/audit-logs` (requires `audit.read`, hard-pinned to caller's session org). The web server writes to the same collection via `apps/web/server/securityAudit.ts`.
- **Tenant isolation** — `requireTenantOwnership({ resourceType, loader })` and `assertSameTenant(...)` in `apps/api/src/security/tenant.ts`. Cross-tenant attempts return 403 and are audited.
- **Request security** — strict CORS allowlist with rejection logging in `apps/api/index.ts`; zod-backed `validateBody` / `validateQuery` middleware in `apps/api/src/security/validate.ts` (applied to register, login, audit query).
- **Tests** — `apps/api/__tests__/security/*.test.ts` (55 tests, all passing). Run with `pnpm --filter @okiru/api exec vitest run __tests__/security`.
