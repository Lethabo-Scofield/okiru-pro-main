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
4. **Reporting** — PDF (Certificate + Verification Report), Excel, and PPTX scorecard exports
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
