# Okiru Pro - B-BBEE Compliance Platform

## Overview
B-BBEE Compliance and Scorecard Management Platform. A monorepo containing a React + Express web app, a separate API server, and a Python computation engine.

## Monorepo Structure
- `apps/web/` — Main full-stack app (React frontend + Express backend). **This is the primary app.**
- `apps/api/` — Separate API server (references `@okiru/types` workspace package)
- `apps/Computation-Engine/` — Python computation service
- `packages/types/` — Shared TypeScript types

## Running the App
The primary app (`apps/web`) runs on **port 5000**. It combines:
- React frontend served via Vite middleware in dev mode
- Express backend with session auth, storage, and AI features

**Workflow**: `cd apps/web && npm run dev`

## Dependency Installation
Because this is a pnpm monorepo with workspace: protocol references, use npm with flags to install in `apps/web`:
```
cd apps/web && npm install --no-workspaces --legacy-peer-deps
```

## Environment Variables
The app gracefully degrades without these (using in-memory storage):
- `MONGODB_URI` — MongoDB Atlas connection string (optional; enables persistence)
- `GROQ_API_KEY` — Groq API key for AI features (optional)
- `SESSION_SECRET` — Express session secret (auto-generates if not set)

## Demo Mode
Without `MONGODB_URI`, the app runs in in-memory mode with:
- Demo user: username `demo`, password `demo`
- 3 pre-seeded B-BBEE templates

## Tech Stack
- **Frontend**: React 19, Vite, TailwindCSS, Radix UI, Wouter
- **Backend**: Express.js (TypeScript), express-session, bcryptjs
- **Database**: MongoDB (Mongoose), with in-memory fallback
- **AI**: Groq SDK (llama-3.3-70b)
- **Build**: esbuild (server), Vite (client)

## Deployment
- **Target**: autoscale
- **Build**: `cd apps/web && npm install --no-workspaces --legacy-peer-deps && npm run build`
- **Run**: `cd apps/web && cross-env NODE_ENV=production node dist/index.cjs`
