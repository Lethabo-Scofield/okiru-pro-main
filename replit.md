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

## Deployment
- Build: `pnpm install --frozen-lockfile=false && pnpm --filter @okiru/api build && pnpm --filter rest-express build`
- Run: Starts API server then web server in production mode
- Target: `autoscale`
