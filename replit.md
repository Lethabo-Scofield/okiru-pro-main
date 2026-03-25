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

### Development
The workflow `Start application` runs:
```
cd apps/web && pnpm run dev
```
This starts the Express server (with Vite middleware) on port 5000.

### Package Management
Uses pnpm workspaces. Install dependencies from the root:
```
pnpm install --no-frozen-lockfile --ignore-scripts
```

## Environment Variables Required
- `MONGODB_URI` - MongoDB connection string (without this, uses in-memory storage)
- `GROQ_API_KEY` - For AI/LLM features
- `SESSION_SECRET` - Express session secret
- `OPENAI_API_KEY` - Optional, for OpenAI features
- `GOOGLE_AI_API_KEY` - Optional, for Google AI features

## Notes
- Without `MONGODB_URI`, the app runs in in-memory mode with a demo user (username: `demo`, password: `demo`)
- The `packageManager` field was removed from root `package.json` to avoid pnpm version conflicts in Replit
- Vite is configured with `allowedHosts: true` and `host: 0.0.0.0` for Replit proxy compatibility
