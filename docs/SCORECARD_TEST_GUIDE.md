# Okiru Pro B-BBEE Scorecard — Test Guide & System Audit

## Table of Contents

1. [System Overview](#1-system-overview)
2. [What the BBBEE Toolkit Provides for Testing](#2-what-the-bbbee-toolkit-provides-for-testing)
3. [Scorecard Test Scenarios](#3-scorecard-test-scenarios)
4. [Step-by-Step Test Guide](#4-step-by-step-test-guide)
5. [What Is Missing for Scorecard Creation](#5-what-is-missing-for-scorecard-creation)
6. [Security Issues (CRITICAL)](#6-security-issues)
7. [Database Issues](#7-database-issues)
8. [UI Fixes & Tweaks](#8-ui-fixes--tweaks)
9. [Code Quality & Architecture Issues](#9-code-quality--architecture-issues)
10. [Priority Fix List](#10-priority-fix-list)

---

## 1. System Overview

**Stack:** pnpm monorepo with Express API + React/Vite frontend + Python FastAPI compute engine  
**Databases:** MongoDB (users, clients, entities) + ArangoDB (scorecard graph, formulas)  
**Auth:** Cookie-based sessions with bcrypt  
**AI:** Groq LLM for entity extraction from uploaded documents  

### Architecture Map

```
apps/
├── api/              Express TypeScript API (port 5000)
│   ├── models.ts     MongoDB Mongoose schemas (13 collections)
│   ├── arango/       ArangoDB connection + collections (15 doc + 7 edge)
│   ├── pipeline/     Compute client, extraction, NER engine
│   └── src/routes/   REST endpoints
├── web/              React 19 + Vite + Tailwind 4
│   ├── src/pages/    Dashboard, DocumentProcessor, EntityBuilder
│   ├── Toolkit/      B-BBEE calculator UI (Zustand store)
│   └── server/       SSR server with its own routes
└── Computation-Engine/  Python FastAPI scorecard evaluator
```

---

## 2. What the BBBEE Toolkit Provides for Testing

The toolkit at `BBBEE Toolkit/Okiru BBBEE Toolkit/` contains 4 HTML files with embedded JavaScript data:

### Usable Test Resources

| File | What It Contains | Use For Testing |
|------|-----------------|----------------|
| `BBBEE_scorecard selection.html` | Sector weightings for all supported codes | Verify calculator targets match gazette |
| `BBBEE_Toolkit_Complete.html` | Ownership tables, indicator targets, level thresholds | Verify scorecard layout and scoring rules |
| `ComplianceHub_Landing.html` | Hub navigation structure | UI reference for scorecard flow |
| `BBBEE_Certificate_Hub.html` | Certificate display, level colors (1-5) | Reference for certificate/results view |

### Official Sector Weightings (from `BBBEE_scorecard selection.html`)

#### Generic Large Enterprise (Amended CoGP) — Total: 109 pts
| Element | Points |
|---------|--------|
| Ownership | 25 |
| Management Control | 19 |
| Skills Development | 20 |
| Enterprise & Supplier Development (ESD) | 40 |
| Socio-Economic Development (SED) | 5 |

#### Generic QSE (R10m–R50m) — Total: 100 pts
| Element | Points |
|---------|--------|
| Ownership | 25 |
| Management Control | 15 |
| Skills Development | 25 |
| Enterprise & Supplier Development (ESD) | 30 |
| Socio-Economic Development (SED) | 5 |

#### FSC – Banks & Life Offices — Total: 120 pts (7 elements)
| Element | Points |
|---------|--------|
| Ownership | 23 |
| Management Control | 20 |
| Skills Development | 20 |
| Procurement & ESD | 15 |
| Socio-Economic Dev & Consumer Education | 5 |
| Empowerment Financing & ESD | 25 |
| Access to Financial Services | 12 |

#### AgriBEE Large — Total: 119 pts
| Element | Points |
|---------|--------|
| Ownership | 25 |
| Management Control | 19 |
| Skills Development | 20 |
| Enterprise & Supplier Development | 40 |
| Socio-Economic Development (SED) | 15 |

#### Property (PSCC) Large — Total: 117 pts (7 elements)
| Element | Points |
|---------|--------|
| Ownership | 30 |
| Management Control | 9 |
| Employment Equity | 13 |
| Skills Development | 19 |
| Enterprise & Supplier Development | 39 |
| Socio-Economic Development | 2 |
| Economic Development | 5 |

#### ICT — Total: 100 pts (7 elements)
| Element | Points |
|---------|--------|
| Ownership | 20 |
| Management Control | 10 |
| Employment Equity | 10 |
| Skills Development | 17 |
| Preferential Procurement | 20 |
| Enterprise Development | 11 |
| Socio-Economic Development Initiatives | 12 |

### B-BBEE Level Thresholds
| Level | Score Required | Recognition |
|-------|---------------|-------------|
| Level 1 | 100+ pts | 135% recognition |
| Level 2 | 95+ pts | 125% recognition |
| Level 3 | 90+ pts | 110% recognition |
| Level 4 | 80+ pts | 100% recognition |
| Level 5 | 75+ pts | 80% recognition |
| Level 6 | 70+ pts | 60% recognition |
| Level 7 | 55+ pts | 50% recognition |
| Level 8 | 40+ pts | 10% recognition |
| Non-Compliant | <40 pts | 0% recognition |

### Entity Size Thresholds
| Size | Turnover | Auto Level |
|------|----------|------------|
| Large Enterprise | > R50M | Must be verified |
| QSE | R10M – R50M | Must be verified |
| EME | < R10M | Auto Level 4 |

---

## 3. Scorecard Test Scenarios

### Scenario A: Level 1 (Full Compliance) — Generic Large Enterprise

**Company:** "Mzansi Holdings (Pty) Ltd"  
**Sector:** Generic (Amended CoGP)  
**Type:** Large Enterprise  
**Revenue:** R120,000,000  
**NPAT:** R18,000,000  
**Financial Year:** 2025  

**Ownership Data:**
| Shareholder | Shares | Black% | Black Women% | Share Value | New Entrant |
|------------|--------|--------|-------------|-------------|-------------|
| Themba Trust | 300 | 1.0 | 0.0 | R30,000,000 | No |
| Nomsa Investment | 200 | 1.0 | 1.0 | R20,000,000 | No |
| Sarah Capital | 150 | 1.0 | 1.0 | R15,000,000 | Yes |
| Global Partners | 350 | 0.0 | 0.0 | R35,000,000 | No |

Company Value: R100,000,000  
Outstanding Debt: R5,000,000  
Years Held: 8  

**Expected Result:** ~21/25 (Ownership)

**Employee Data (Management Control):**
| Name | Gender | Race | Designation | Disabled |
|------|--------|------|-------------|----------|
| Thabo Mokoena | Male | Black | Board | No |
| Naledi Dlamini | Female | Black | Board | No |
| Johan van Wyk | Male | White | Board | No |
| Sipho Ndlovu | Male | Black | Executive | No |
| Fatima Patel | Female | Indian | Executive | No |
| David Smith | Male | White | Executive | No |
| Zandile Mkhize | Female | Black | Senior | No |
| Peter Brown | Male | White | Senior | No |
| Lerato Moloi | Female | Black | Middle | No |
| Bongani Sithole | Male | Black | Middle | No |
| Linda Naidoo | Female | Indian | Middle | No |
| Mark Wilson | Male | White | Middle | No |
| Thembi Zungu | Female | Black | Junior | Yes |
| Mpho Tau | Male | Black | Junior | No |
| Yvonne Swart | Female | White | Junior | No |

**Expected Result:** ~14/19 (Management Control)

**Training Programs (Skills Development):**
| Program | Category | Cost | Employee | Is Employed | Is Black |
|---------|----------|------|----------|-------------|----------|
| Leadership Dev | Learnerships | R150,000 | Lerato Moloi | Yes | Yes |
| IT Skills | Skills Programmes | R80,000 | Mpho Tau | Yes | Yes |
| Finance Cert | Professional Programmes | R120,000 | Bongani Sithole | Yes | Yes |
| Bursary 1 | Bursaries | R60,000 | External | No | Yes |
| Bursary 2 | Bursaries | R45,000 | External | No | Yes |
| Internship | Internships | R40,000 | External | No | Yes |

Leviable Amount (payroll): R8,000,000  
**Expected Result:** ~15/20 (Skills Development)

**Suppliers (Procurement & ESD):**
| Supplier | BEE Level | Black Owned % | Annual Spend |
|----------|-----------|---------------|-------------|
| Mzansi Supplies | 1 | 0.85 | R15,000,000 |
| Rainbow Tech | 2 | 0.51 | R8,000,000 |
| Heritage Services | 1 | 1.0 | R5,000,000 |
| Premier Logistics | 3 | 0.30 | R12,000,000 |
| Global Import Co | 4 | 0.0 | R20,000,000 |

TMPS (Total Measured Procurement Spend): R60,000,000  
**Expected Result:** ~22/29 (Procurement)

**ESD Contributions:**
| Beneficiary | Type | Amount | Category |
|------------|------|--------|----------|
| Township Bakery | Grant | R800,000 | Supplier Development |
| Youth Co-op | Loan | R500,000 | Enterprise Development |
| Tech Startup | Investment | R300,000 | Enterprise Development |

**Expected Result:** ~12/16 (ESD)

**SED Contributions:**
| Beneficiary | Type | Amount | Category |
|------------|------|--------|----------|
| Local School | Donation | R120,000 | Education |
| Community Centre | Sponsorship | R60,000 | Community |

SED Target: 1% of NPAT = R180,000  
**Expected Result:** ~5/5 (SED)

**Total Expected:** ~89/109 → **Level 3**

---

### Scenario B: Level 4 (Minimum Compliance) — Generic QSE

**Company:** "Vuka Consulting CC"  
**Sector:** Generic (Amended CoGP)  
**Type:** QSE  
**Revenue:** R25,000,000  
**NPAT:** R3,500,000  
**Financial Year:** 2025  

**Ownership:** 40% black-owned, 15% black women  
- 2 shareholders, 400 shares + 600 shares  
- Shareholder 1: 400 shares, 0.8 black, 0.3 BWO, R10M value  
- Shareholder 2: 600 shares, 0.0 black, 0.0 BWO, R15M value  
- Company Value: R25M, Debt: R2M, Years Held: 5  

**Employees:** 8 total (Board 1, Executive 1, Senior 2, Middle 2, Junior 2)  
- 4 black (50% overall), 2 black women  
- 0 disabled  

**Training:** R200,000 total, 3 programs, Leviable: R4M  
**Procurement:** R12M TMPS, 3 suppliers (Levels 2, 3, 5)  
**ESD:** R100,000 supplier dev only  
**SED:** R30,000 donation  

**Total Expected:** ~65/100 → **Level 7**

---

### Scenario C: EME (Auto Level 4)

**Company:** "Nathi's Plumbing"  
**Revenue:** R8,000,000 (< R10M = EME)  
**Type:** EME  

**Expected:** Auto Level 4 (no scorecard required)  
**If ≥51% black-owned:** Auto Level 2  
**If 100% black-owned:** Auto Level 1  

---

### Scenario D: Non-Compliant Entity

**Company:** "Legacy Corp Ltd"  
**Sector:** Generic Large  
**Revenue:** R200,000,000  
**NPAT:** R30,000,000  

**Ownership:** 5% black (no BWO, no new entrants)  
**Management:** 2 black of 20 employees  
**Training:** R50,000 total  
**Procurement:** All Level 4+ suppliers, 0% black-owned  
**ESD:** R0  
**SED:** R0  

**Expected Total:** ~18/109 → **Non-Compliant**

---

## 4. Step-by-Step Test Guide

### Pre-requisites

```bash
# 1. Start MongoDB
mongod

# 2. Start ArangoDB
# Ensure ArangoDB is running on default port 8529

# 3. Set environment variables
# apps/api/.env
MONGO_URI=mongodb://localhost:27017/okiru
SESSION_SECRET=<generate-a-real-secret>
ARANGO_URL=http://localhost:8529
ARANGO_DB=okiru
ARANGO_USER=root
ARANGO_PASSWORD=<your-real-password>
CORS_ORIGIN=http://localhost:5173
GROQ_API_KEY=<your-key>
COMPUTE_ENGINE_URL=http://127.0.0.1:8000

# 4. Install and start all services
pnpm install
pnpm --filter @okiru/api dev
pnpm --filter @okiru/web dev

# 5. Start compute engine (optional, for ArangoDB scorecard path)
cd apps/Computation-Engine
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Test Flow: Manual Scorecard Creation

1. **Register & Login**
   - POST `/api/auth/register` with `{ username, password, fullName, email }`
   - POST `/api/auth/login` with `{ username, password }`
   - Verify session cookie is set

2. **Create Client**
   - POST `/api/clients` with company details from Scenario A
   - Note the returned `clientId`

3. **Add Financial Year**
   - POST `/api/financial-years` with `{ clientId, year: 2025, revenue, npat }`

4. **Add Shareholders (Ownership)**
   - POST `/api/clients/:id/shareholders` (repeat for each shareholder)
   - Add ownership data: POST includes `{ companyValue, outstandingDebt, yearsHeld }`

5. **Add Employees (Management Control)**
   - POST `/api/clients/:id/employees` (repeat for each employee)
   - Ensure proper `designation` values: Board, Executive, Senior, Middle, Junior

6. **Add Training Programs (Skills Development)**
   - POST `/api/clients/:id/training-programs` for each program
   - Include `{ name, category, cost, employeeId, isEmployed, isBlack }`

7. **Add Suppliers (Procurement)**
   - POST `/api/clients/:id/suppliers` for each supplier
   - Include `{ name, beeLevel, blackOwnership, spend }`
   - PATCH `/api/clients/:id/procurement` with `{ tmps }`

8. **Add ESD/SED Contributions**
   - POST `/api/clients/:id/esd-contributions`
   - POST `/api/clients/:id/sed-contributions`

9. **View Scorecard in Toolkit**
   - Navigate to `/toolkit/:clientId/scorecard`
   - Verify all pillar scores are populated
   - Verify total score and B-BBEE level

10. **Run ArangoDB Scorecard Path (if compute engine running)**
    - POST `/api/scorecard/compile` with model definition
    - POST `/api/scorecard/evaluate` with client data
    - Verify result matches Toolkit calculator

### Test Flow: Document-to-Scorecard (AI Extraction)

1. **Upload document** via DocumentProcessor page
2. **Select template** for entity extraction
3. **Run extraction** — verify entities are identified
4. **Review extracted entities** in the review panel
5. **Bridge to Toolkit** — NOTE: automated mapping to pillar forms does NOT currently exist (see Missing Features)

---

## 5. What Is Missing for Scorecard Creation

### CRITICAL MISSING FEATURES

| # | Feature | Impact | Where to Build |
|---|---------|--------|----------------|
| 1 | **Sector Code Selection UI** | Users cannot select between Generic/QSE/EME or sector-specific codes (FSC, AGRI, Property, ICT) | New page or settings panel in Toolkit |
| 2 | **Scorecard Type Selector** | All calculations use Generic Large defaults; no QSE or sector-specific targets | `CalculatorConfig` exists but no UI to switch configs |
| 3 | **EME Auto-Classification** | Companies < R10M should auto-classify as EME (Level 4, or Level 2 if ≥51% black-owned) | Logic needed in client creation or scorecard page |
| 4 | **YES Initiative Form** | Scorecard shows YES as placeholder (0 pts); no data entry form | New component in Toolkit |
| 5 | **Document-to-Scorecard Bridge** | After AI extraction, data must be manually re-entered into pillar forms | Mapping layer from extracted entities to Toolkit store |
| 6 | **Processor Sessions Backend** | Frontend calls `POST/GET/DELETE /api/processor-sessions` but NO backend routes exist | `apps/api/src/routes/processorSessions.ts` needed |
| 7 | **Multi-year Scorecard Comparison** | Financial year history exists but scorecard only shows current year | UI for year-over-year trends |
| 8 | **Printable Certificate/Report** | No formatted B-BBEE certificate export | PDF generation using existing `exportPdf.ts` |
| 9 | **Profile Picture Upload** | Returns "not yet implemented" | Storage backend (S3 or local) |

### FEATURES THAT EXIST BUT ARE INCOMPLETE

| # | Feature | Status | Gap |
|---|---------|--------|-----|
| 1 | Ownership Calculator | Working | Graduation table only goes to year 10; verify against gazette |
| 2 | Management Control | Working | `subMinimumMet` always returns `true` (hardcoded line 161) |
| 3 | Skills Development | Working | No learnerships-vs-bursaries breakdown visible in UI |
| 4 | Procurement | Working | TMPS auto-calculation unclear on cascade to scorecard |
| 5 | ESD | Working | Supplier Dev and Enterprise Dev combined in one form |
| 6 | SED | Working | No NPAT target percentage displayed |
| 7 | Scenarios | Working | Snapshot/restore but no comparison view |
| 8 | Excel Import | Working | Import logs exist but error detail is minimal |

---

## 6. Security Issues

### CRITICAL

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 1 | **Hardcoded ArangoDB password `Okiru123!`** | `apps/api/arango/connection.ts:29`, `scripts/cleanup-wrong-ingestion.ts:19` | Remove default; fail at startup if env var missing |
| 2 | **5 route files have ZERO authentication** | `documents.ts`, `templates.ts`, `scorecard.ts`, `entityTemplates.ts`, `extractAndScore.ts` | Add `requireAuth` middleware |
| 3 | **Compute Engine uses `X-Admin: true` header** with no validation | `pipeline/computeClient.ts` | Implement proper service-to-service auth (shared secret or mTLS) |

### HIGH

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 4 | **Session secret fallback in production** | `apps/web/server/routes.ts` uses `'okiru-entity-studio-dev-secret'` | Remove fallback; throw if missing |
| 5 | **No CSRF protection** | `sameSite: 'none'` in production widens CSRF surface | Add CSRF token middleware |
| 6 | **File upload accepts any type** | multer config lacks file type validation | Whitelist: `.xlsx`, `.csv`, `.pdf`, `.docx` |
| 7 | **No rate limiting on auth endpoints** | `POST /api/auth/login` has no brute force protection | Add `express-rate-limit` to auth routes specifically |

### MEDIUM

| # | Issue | Location | Fix |
|---|-------|----------|-----|
| 8 | Error stack traces may leak in production | Various catch blocks | Sanitize error responses in production |
| 9 | CORS allows any origin in dev | `cors({ origin: corsOrigin })` | Ensure `CORS_ORIGIN` is set properly in production |
| 10 | No input size limits on JSON body | Express default is high | Add `express.json({ limit: '1mb' })` |

---

## 7. Database Issues

### Schema Problems

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 1 | **Monetary values use JavaScript `Number`** (all financial fields across 8 schemas) | IEEE 754 floating-point errors in B-BBEE compliance calculations | Switch to `Schema.Types.Decimal128` |
| 2 | **`createdAt` stored as ISO String** (7 schemas) | Cannot use MongoDB date operators, no TTL indexes | Use `{ type: Date, default: Date.now }` |
| 3 | **9 schemas missing timestamps entirely** (shareholders, employees, suppliers, etc.) | No audit trail for compliance-critical data changes | Add `{ timestamps: true }` |
| 4 | **No enum constraints** on `role`, `industrySector`, `gender`, `race`, `designation`, `status` | Invalid data can enter the system | Add `enum` validators |
| 5 | **Percentage fields accept any number** (`blackOwnership`, `blackWomenOwnership`) | Values > 1.0 or < 0 break calculations | Add `min: 0, max: 1` validators |

### Missing Indexes

| Collection | Index Needed | Impact |
|-----------|-------------|--------|
| `cells` (ArangoDB) | `graphId` persistent | **All cell queries do full collection scans — biggest perf issue** |
| `cell_dependency` (ArangoDB) | `graphId` persistent | Edge scans on graph deletion |
| `scorecards` (ArangoDB) | `sourceFile` persistent | Full scan on scorecard lookups |
| `scorecards` (ArangoDB) | `(sectorCode, scorecardType)` compound | Full scan on sector queries |
| `importLogs` (MongoDB) | `userId` | Full scan on log queries |
| `financialYears` (MongoDB) | `(clientId, year)` unique compound | Allows duplicate years per client |

### Data Integrity Issues

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 1 | **Client cascade delete is incomplete** — misses `Document`, `DocumentChunk`, ArangoDB `assessments`, `cell_values`, `calculation_results` | Orphaned records across both databases after client deletion | Add to cascade |
| 2 | **Cascade delete is not transactional** — `Promise.all` with no MongoDB transaction | Partial cleanup on failure with no rollback | Wrap in `session.startTransaction()` |
| 3 | **Employee delete does not cascade to training programs** | `trainingProgram.employeeId` becomes orphan reference | Add cascade or nullify |
| 4 | **No schema migration framework** | Schema changes require manual data migration | Add `migrate-mongo` or similar |
| 5 | **3 ArangoDB edge collections defined but never used** (`depends_on`, `derived_from`, `sector_applies`) | Dead schema, wasted resources | Remove or implement |
| 6 | **ArangoDB has no connection retry logic** (MongoDB does) | Single failed connection = app crash | Add retry matching MongoDB pattern |

---

## 8. UI Fixes & Tweaks

### Accessibility (CRITICAL)

| # | Issue | Where | Fix |
|---|-------|-------|-----|
| 1 | Zero `aria-*` attributes in DocumentProcessor (1,800 lines) | `DocumentProcessor.tsx` | Add `aria-label`, `role`, `aria-current` to all interactive elements |
| 2 | Step indicator has no screen reader support | `DocumentProcessor.tsx:973-997` | Add `role="navigation"`, `aria-current="step"` |
| 3 | Table row actions only visible on mouse hover | `Dashboard.tsx:720-825` | Add keyboard focus handlers, remove `pointer-events-none` |
| 4 | Drag-and-drop has no keyboard alternative | `DocumentProcessor.tsx` | Add file input fallback with visible button |
| 5 | Progress bars missing ARIA | `DocumentProcessor.tsx` | Add `role="progressbar"`, `aria-valuenow` |
| 6 | Low contrast text: `#636366` on black (ratio 2.6:1) | `Dashboard.tsx` | Use `#a1a1aa` or lighter for AA compliance (4.5:1) |
| 7 | Font sizes `text-[9px]` and `text-[10px]` are too small | `Dashboard.tsx:735-738` | Minimum 11px (0.6875rem) |

### Responsive Design

| # | Issue | Where | Fix |
|---|-------|-------|-----|
| 8 | Document review splits into 2 narrow columns on mobile | `DocumentProcessor.tsx:1637` | `flex-col md:flex-row` + `w-full md:w-1/2` |
| 9 | Toolkit sidebar has no mobile collapse | `AppLayout.tsx` | Add hamburger toggle with overlay |
| 10 | Scorecard 7-column table unreadable on mobile | `Scorecard.tsx:378-449` | Card layout below `md:` breakpoint |
| 11 | Header overflows on small screens | `DocumentProcessor.tsx:949-968` | Wrap or hide nav items below `sm:` |

### Forms & Validation

| # | Issue | Where | Fix |
|---|-------|-------|-----|
| 12 | Company info form has no inline validation | `DocumentProcessor.tsx:1083-1184` | Add red borders, error messages on blur |
| 13 | `annualTurnover` accepts free text, expects number | `DocumentProcessor.tsx` | Add `type="number"` or masked input |
| 14 | `registrationNumber` has no format validation | `DocumentProcessor.tsx` | Regex: `YYYY/NNNNNN/NN` |
| 15 | Ownership form: `blackOwnership` accepts values outside 0-1 | `Ownership.tsx:71` | Add min/max validation |
| 16 | Supplier form: `spend` accepts 0 or negative | `ESD.tsx` | Add `min: 0` validation |

### Missing States & Feedback

| # | Issue | Where | Fix |
|---|-------|-------|-----|
| 17 | Empty pillar pages show no guidance | Toolkit pillar pages | Add "Add your first shareholder" empty states |
| 18 | Scorecard shows zeros with no guidance | `Scorecard.tsx` | Add "Enter data in pillar pages" prompt |
| 19 | Background API saves fail silently | `store.ts` (30+ `.catch(console.error)`) | Show error toasts on save failure |
| 20 | Session loading has no timeout/cancel | `DocumentProcessor.tsx:456` | Add 10s timeout + retry button |

### Component Architecture

| # | Issue | Impact | Fix |
|---|-------|--------|-----|
| 21 | `DocumentProcessor.tsx` is 1,812 lines | Hard to maintain, test, review | Split into ~5 components |
| 22 | `Dashboard.tsx` is 850 lines managing 3 pages | No deep-linking, no browser back | Split into route-based pages |
| 23 | Duplicated `StoredTemplate`/`ProcessorSession` interfaces | Type drift risk | Move to shared `types.ts` |
| 24 | 25+ `any` types in DocumentProcessor | No type safety | Define proper interfaces |
| 25 | No TanStack Query in Dashboard/DocProcessor | No caching, refetch, dedup | Migrate from raw `fetch()` |

---

## 9. Code Quality & Architecture Issues

### TypeScript `any` Hotspots

| File | Count | Priority |
|------|-------|----------|
| `exportExcel.ts` | 53 | Low (export utility) |
| `DocumentProcessor.tsx` | 25 | High (core page) |
| `api.ts` | 18 | High (API client) |
| `excel-parser.ts` | 16 | Medium |
| `exportPdf.ts` | 15 | Low |
| `exportPptx.ts` | 14 | Low |
| `store.ts` | 8 | High (state layer) |

### Architectural Concerns

| # | Issue | Impact |
|---|-------|--------|
| 1 | **Two backend stacks** — `apps/api` and `apps/web/server` both have auth, routes, and models | Confusion about which backend handles what; duplicated schemas |
| 2 | **Mixed API patterns** — Dashboard uses raw `fetch()`, Toolkit uses `api.ts` module | No shared API client; inconsistent error handling |
| 3 | **Management Control `subMinimumMet` hardcoded to `true`** | Management control never triggers sub-minimum penalty | Implement actual threshold check |
| 4 | **No integration tests** between API and frontend | Scorecard end-to-end flow untested | Add Playwright or Cypress tests |
| 5 | **No CI test pipeline** for calculators beyond unit tests | Calculator bugs can ship undetected | Add to GitHub Actions |

---

## 10. Priority Fix List

### Phase 1: Security (Do Before ANY Testing)

- [ ] Remove hardcoded `Okiru123!` from `connection.ts` and `cleanup-wrong-ingestion.ts`
- [ ] Add `requireAuth` to `documents.ts`, `templates.ts`, `scorecard.ts`, `entityTemplates.ts`, `extractAndScore.ts`
- [ ] Generate real `SESSION_SECRET`; remove fallback in `apps/web/server/routes.ts`
- [ ] Add file type whitelist to multer upload config
- [ ] Add rate limiting to `/api/auth/login` and `/api/auth/register`

### Phase 2: Database (Do Before Production)

- [ ] Add ArangoDB indexes: `cells.graphId`, `cell_dependency.graphId`, `scorecards.sourceFile`, `scorecards.(sectorCode,scorecardType)`
- [ ] Add MongoDB compound unique index on `financialYears(clientId, year)`
- [ ] Add `{ timestamps: true }` to all 9 schemas missing timestamps
- [ ] Add enum validation on `role`, `gender`, `race`, `designation`, `status`, `industrySector`
- [ ] Add min/max validation on percentage and monetary fields
- [ ] Complete the client cascade delete (Documents, Chunks, ArangoDB assessments)
- [ ] Wrap cascade delete in MongoDB transaction

### Phase 3: Missing Scorecard Features

- [ ] Build sector code selection UI (dropdown with configs from toolkit data)
- [ ] Build scorecard type selector (Generic Large / QSE / EME)
- [ ] Implement EME auto-classification logic
- [ ] Fix `subMinimumMet` in management calculator (currently always `true`)
- [ ] Build YES Initiative data entry form
- [ ] Create `/api/processor-sessions` backend routes
- [ ] Build document-to-scorecard entity mapping layer

### Phase 4: UI Polish

- [ ] Add accessibility attributes to all interactive elements
- [ ] Fix responsive layout for DocumentProcessor review page
- [ ] Add mobile sidebar collapse to Toolkit
- [ ] Add inline form validation with error messages
- [ ] Replace silent `.catch(console.error)` with user-facing toasts
- [ ] Split DocumentProcessor.tsx into smaller components
- [ ] Give Dashboard sub-pages proper URL routes
- [ ] Fix color contrast issues (minimum 4.5:1 ratio)

### Phase 5: Code Quality

- [ ] Replace `any` types with proper interfaces in DocumentProcessor, api.ts, store.ts
- [ ] Migrate Dashboard/DocumentProcessor to TanStack Query
- [ ] Add ArangoDB connection retry logic
- [ ] Switch monetary fields to `Decimal128`
- [ ] Add integration tests for scorecard creation flow
- [ ] Add error boundaries at route level
