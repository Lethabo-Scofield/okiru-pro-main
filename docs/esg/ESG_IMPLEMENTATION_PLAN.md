# Okiru ESG Toolkit — Implementation Plan

**Audience:** Engineers building the live ESG toolkit in okiru-pro-main  
**Source of truth:** `docs/esg/Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx`  
**Analysis companion:** `docs/esg/ESG_TOOLKIT_ANALYSIS.md`  
**UI reference:** `docs/esg/okiru_esg_glass (2).html`  
**Stack anchor:** Existing B-BBEE scorecard / workbook / company save patterns

---

## Implementation status (June 2026)

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0 — Hub + shell | **Done** | `/esg/clients`, glass theme, allowlist |
| Phase 1 — Input layer | **Done** | Section editors, GET/PUT workbook, validation subset |
| Phase 2 — Scoring engine | **Done** | `EsgToolkit/src/lib/calculators/*`, golden test E=36 S=33 G≈64.85 |
| Phase 3 — Polish | **Done** | Submit lock, XLSX export (values + scorecards), validation in toolkit dashboard |
| Phase 4 — Extended | **Done (MVP)** | Register SpreadsheetGrid editors, paste import, King5 submit gate (17/17), export v1.7 sheets |

**UX (pass 3):** No `EsgFlowStepper`. Flow is `/esg/clients` → `/esg/toolkit/:companyId` (inputs + scores + dashboard in sidebar).

**Done (June 2026 pass 4):** Fleet / Waste / Driver_Debrief / ISO_Tracker / King5 / IFRS / GARP / SAQ row grids via `SpreadsheetGrid`; `esgGridParse` paste; `buildEsgWorkbookXlsx` (28 sheets, computed E/S/G scorecard values); `validateEsgWorkbookForSubmit` blocks submit unless King5 C4:C30 = 17 statuses.

**Deferred:** Carbon credits UI (no workbook sheet in v1.7), byte-identical xlsx template export, Arango ingestion.

---

## TL;DR

Wire ESG into the hub the same way B-BBEE works today: **company entity → workbook sections (inputs) → calculator engine → dashboard summary → nested toolkit app**. Reuse `workbookRoutes`, `sections.ts` patterns, Zustand store shape, and golden-test discipline. Ship glass-morphism UI from the HTML prototype as a Tailwind theme layer on top of existing Toolkit layout primitives.

---

## 1. Current state (what exists)

| Area | Status | Path |
|------|--------|------|
| Hub card | **Hidden** — "Coming Soon" toast | `apps/web/src/pages/HubLanding.tsx` L116–120 |
| B-BBEE workbook | **Live** — create → inputs → summary → toolkit | `InformationRequest.tsx`, `workbookRoutes.ts` |
| Toolkit app | **Live** — nested at `/toolkit/*` | `apps/web/src/App.tsx` L160, `ToolkitView.tsx` |
| Sector calculators | **Live** — RCOGP, ICT, FSC variants | `apps/web/Toolkit/src/lib/sectors/*.ts` |
| Workbook validation | **Live** | `workbookValidation.ts`, `sections.ts` |
| ESG workbook analysis | **Done** | `docs/esg/` |

---

## 2. Target user flow

Match the glass HTML prototype and B-BBEE conventions:

```
Hub (/hub)
  └─ ESG Toolkit card → /esg                          [NEW]
       └─ Company picker (reuse ClientSelector pattern) [NEW]
            └─ Create / open ESG engagement             [NEW]
                 └─ Inputs (E / S / G + registers)     [NEW — workbook sections]
                      └─ Summary (validation + scores)  [NEW — like WorkbookScoreSummary]
                           └─ Toolkit (dashboard + nav) [NEW — like /toolkit/scorecard]
```

**Route proposal:**

| Route | Page | B-BBEE analogue |
|-------|------|-----------------|
| `/esg` | EsgHubLanding or redirect to client list | `/hub` action |
| `/esg/clients` | EsgClientSelector | `ClientSelector.tsx` |
| `/esg/create/:companyId` | EsgInformationRequest (inputs) | `InformationRequest.tsx` |
| `/esg/create/:companyId/summary` | EsgScoreSummary | `WorkbookScoreSummary.tsx` |
| `/esg/toolkit/*` | EsgToolkitView (nested) | `ToolkitView` + `Toolkit/App.tsx` |

Alternative (lower friction): mount under `/toolkit/esg/*` with a `toolkitType: 'bbbee' | 'esg'` flag on the client entity. **Recommendation:** separate top-level `/esg/*` routes for clarity, shared components underneath.

---

## 3. Hub registration

### 3.1 Change `HubLanding.tsx`

Replace the coming-soon action with a live link:

```tsx
// Before
{ id: 'esg', ..., action: handleComingSoon, ... }

// After
{
  id: 'esg',
  title: 'ESG Intelligence Toolkit',
  tag: 'ESG',
  aiBadge: 'AI-Insights',
  icon: <Leaf className="w-4 h-4" />,
  link: '/esg/clients',
  description: 'Carbon, social and governance scoring aligned to King V, IFRS S1/S2 and GRI.',
  features: ['GHG inventory & carbon tax', 'E/S/G scorecards', 'Net-zero roadmap'],
}
```

Also add a hub quick-action button (mirror "Create scorecard" at L403):

```tsx
href="/esg/clients"
data-testid="action-create-esg"
```

### 3.2 App router

Add routes in `apps/web/src/App.tsx` alongside existing toolkit routes:

```tsx
const EsgToolkitView = lazy(() => import("@/pages/EsgToolkitView"));
// ...
<Route path="/esg/clients"><ProtectedRoute><EsgClientSelector /></ProtectedRoute></Route>
<Route path="/esg/create/:companyId/summary"><ProtectedRoute><EsgInformationRequest /></ProtectedRoute></Route>
<Route path="/esg/create/:companyId"><ProtectedRoute><EsgInformationRequest /></ProtectedRoute></Route>
<Route path="/esg/toolkit" nest><ProtectedRoute><EsgToolkitLoader /></ProtectedRoute></Route>
```

### 3.3 Sidebar (ESG toolkit)

New file: `apps/web/EsgToolkit/src/components/layout/EsgSidebar.tsx`

Mirror `Sidebar.tsx` pillar structure from glass HTML:

- **Overview:** Dashboard, Analytics, Net-Zero Roadmap, Carbon Credits
- **Environmental:** E Dashboard, GHG, Energy, Fleet, Waste, Water, ISO 14001
- **Social:** S Dashboard, Management Control, WSP/ATR, H&S, Community
- **Governance:** G Dashboard, Board, King V, IFRS S1/S2, GARP/ERM, Ethics
- **Data:** Data Import, Carbon Credits

Each nav item shows live score badge from calculator state (same pattern as B-BBEE pillar bars).

---

## 4. Data model & API

### 4.1 Extend company entity

Add to `shared/schema.ts` (ClientModel / WorkbookModel):

```typescript
type ToolkitType = 'bbbee' | 'esg';

interface Client {
  // existing fields...
  toolkitType?: ToolkitType;
  esgConfig?: {
    sectorVariant: string;        // Assumptions B8 (instance-locked in SG fork)
    standardsPack: string;        // Assumptions B11 (not B9)
    stanceFloor: number;          // Assumptions B9 (0.3 | 0.5 | 0.7 from stance B6)
    materialityApproach: string;  // Assumptions B10
    currency: string;
    scoringStance: 'lean' | 'standard' | 'strict';
    carbonTaxBasis: string;
    reportingPeriodStart: string;
    reportingPeriodEnd: string;
    baselineYear: string;
    netZeroTargetYear: number;
  };
}
```

### 4.2 ESG workbook sections

New file: `apps/web/src/components/esg-workbook/esgSections.ts`

Mirror `sections.ts` structure. Proposed section keys:

| Section key | Workbook sheet | Type |
|-------------|----------------|------|
| `esg-company-information` | Cover | meta form |
| `esg-assumptions` | Assumptions | meta form (admin/consultant editable) |
| `esg-environmental-data` | E_Data | monthly grid (9 period cols) |
| `esg-social-data` | S_Data | hybrid: headcount grid + monthly metrics |
| `esg-governance-data` | G_Data | meta form: column **B** inputs + column **F** 0–5 maturity scores (scorecard reads **F**, not booleans) |
| `esg-ee-scorecard` | EE_Scorecard | row grid (feeds S_Scorecard EE rows — **required** for social scoring) |
| `esg-fleet-register` | Fleet_Register | row grid |
| `esg-waste-register` | Waste_Register | row grid |
| `esg-driver-debrief` | Driver_Debrief | row grid |
| `esg-iso-tracker` | ISO_Tracker | row grid |
| `esg-ifrs-disclosures` | IFRS_S1_S2 | row grid |
| `esg-king5` | King5_Scorecard | row grid |
| `esg-garp-grap` | GARP_GRAP | row grid |
| `esg-saq-supplier` | SAQ_Supplier | row grid |

Scorecard outputs are **computed server-side or client-side**, not persisted as editable rows (same as B-BBEE scorecard results in `store.ts`).

### 4.3 API routes

New file: `apps/web/server/esgWorkbookRoutes.ts` (clone `workbookRoutes.ts` structure):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/esg-workbook/:companyId` | Load sections |
| PUT | `/api/esg-workbook/:companyId` | Save sections |
| POST | `/api/esg-workbook/:companyId/validate` | Run esgValidation |
| POST | `/api/esg-workbook/:companyId/submit` | Lock + timestamp |
| GET | `/api/esg-workbook/:companyId/scores` | Compute E/S/G + dashboard KPIs |
| GET | `/api/esg-workbook/:companyId/export` | XLSX export matching v1.7 layout |

Register in `apps/web/server/routes.ts`.

Optional Phase 2: Arango ingestion pipeline for ESG (mirror `templateIngester.ts`) — not required for v1 if calculators live in TypeScript.

### 4.4 Zustand store

New file: `apps/web/EsgToolkit/src/lib/esgStore.ts`

Mirror `apps/web/Toolkit/src/lib/store.ts`:

```typescript
interface EsgState {
  client: Client;
  environmental: EnvironmentalData;
  social: SocialData;
  governance: GovernanceData;
  registers: { fleet, waste, driverDebrief, isoTracker, saq };
  assumptions: EsgAssumptions;
  scorecard: EsgScorecardResult;  // { environmental, social, governance, overall, kpis }
  loadClientData(id: string): Promise<void>;
  saveClientData(): Promise<void>;
  recalculate(): void;
}
```

`recalculate()` calls calculator modules synchronously on every input change (match workbook live-recalc behaviour).

---

## 5. Calculator engine

### 5.1 File layout

```
apps/web/EsgToolkit/src/lib/
  esgConfig/
    consumer-goods.ts      # SG Consumer / FMCG variant (v1)
    assumptions-defaults.ts
  calculators/
    shared.ts              # pr(), prI(), bn(), col(), stanceFloor()
    emissionFactors.ts
    environmental.ts       # E_Scorecard logic
    social.ts                # S_Scorecard + EE bridge
    governance.ts            # G_Scorecard
    eeScorecard.ts
    king5.ts
    carbonTax.ts
    bbbeeBridge.ts
    dashboard.ts             # aggregate KPIs
    validation.ts            # Validation sheet rules
  sectors/
    sector-registry.ts       # maps Assumptions B8 → config
```

### 5.2 Port priority (by formula count)

1. `environmental.ts` ← E_Data + E_Scorecard (224 + 55 formulas)
2. `dashboard.ts` ← ESG_Dashboard (136 formulas)
3. `governance.ts` ← G_Scorecard + King5 + IFRS + GARP
4. `social.ts` ← S_Data + S_Scorecard + EE_Scorecard
5. `carbonTax.ts`, `bbbeeBridge.ts`, `validation.ts`

Extract threshold constants from Assumptions into `assumptions-defaults.ts`; allow per-client overrides via workbook meta.

### 5.3 Scoring functions (workbook-verified; HTML is reference-only)

```typescript
// Banding floor: Assumptions B9 (derived from stance B6/B8 → 0.3 | 0.5 | 0.7)
function pr(actual: number, target: number, maxPts: number, floor: number): number;
// IF(actual>=target,max, IF(actual>=target*floor, max*actual/target, 0))

function prLtifr(ltifr: number, target: number, maxPts: number, floor: number): number;
// Workbook S_Scorecard row 17 — NOT HTML prI()

function bandedBn(yesPartialNo: string, maxPts: number): number; // Yes=max, Partial=max/2
function minCap(score: number, max: number): number;             // MIN(score,max) on D column
function statusBand(score: number, max: number): 'met' | 'partial' | 'gap';
function overallEsg(e: number, s: number, g: number): number;
// (e/100 + s/100 + g/100) / 3  — workbook ESG_Dashboard!D9

function governanceMaturity(f: number, maxPts: number): number; // G_Data F column 0–5 → G_Scorecard
```

**Do not port from HTML without diff:** `calcMC()` EAP grid (Toolkit has separate B-BBEE MC), weighted overall, `bn()` on governance booleans, waste target 75% in HTML matches `THR_WASTE` but energy/GHG rows differ.

---

## 6. Frontend — glass UI

### 6.1 Design tokens

Create `apps/web/EsgToolkit/src/styles/esg-glass.css` (or Tailwind extend):

| Token | Value | Usage |
|-------|-------|-------|
| `--bg` | `#080e14` | Page background |
| `--acc-e` | `#1de9a0` | Environmental |
| `--acc-s` | `#f5a623` | Social |
| `--acc-g` | `#9b6bff` | Governance |
| `--acc-red` | `#ff5f5f` | Critical |
| `--acc-blue` | `#4aa8ff` | Data import |
| Glass card | `bg-white/[0.04] backdrop-blur-xl border-white/[0.09]` | All cards |

Copy component patterns from `okiru_esg_glass (2).html`: score-hero, kpi-row, bar-row, ind-tbl, inp-tbl.

### 6.2 Page inventory (Phase 1 MVP)

| Page | Priority | Workbook source |
|------|----------|-----------------|
| ESG Dashboard | P0 | ESG_Dashboard |
| Data Import | P0 | E_Data + S_Data + G_Data paste engine |
| E Dashboard + GHG | P0 | E_Scorecard + E_Data summary |
| S Dashboard | P1 | S_Scorecard |
| G Dashboard | P1 | G_Scorecard |
| Validation panel | P0 | Validation sheet |
| Assumptions (settings) | P1 | Assumptions |
| Net-Zero Roadmap | P2 | NetZero_Roadmap |
| Carbon Tax | P2 | Carbon_Tax |
| IFRS / King V / GARP | P2 | respective sheets |
| B-BBEE bridge | P2 | B_BBEE_ESG |

### 6.3 Input components

Reuse existing monorepo components:

| Need | Reuse |
|------|-------|
| Monthly grid | `SpreadsheetGrid.tsx` with 9 period columns |
| Scalar forms | `FormModeGrid.tsx` |
| Dropdowns | `ColumnDef.type: 'select'` from sections pattern |
| Date periods | `NumericDateInput.tsx` |
| Paste import | Extend `workbookGridParse.ts` with ESG row-label dictionary from `okiru_esg_input_layer.md` |
| Validation popup | `CellValidationPopup.tsx` |
| Validation panel | `WorkbookValidationPanel.tsx` |

### 6.4 Data Import tab (paste engine)

Port `parsePaste()` from HTML prototype / input_layer.md:

1. Textarea paste zone per pillar (E / S / G)
2. Fuzzy row-label matching dictionary
3. Format A (metrics × months) vs Format B (months × metrics) auto-detect
4. `syncTStoD()` equivalent → update monthly arrays → `recalculate()`

---

## 7. Input validation layer

New file: `apps/web/src/components/esg-workbook/esgValidation.ts`

Mirror `workbookValidation.ts` API:

```typescript
export type EsgValidationIssue = { sectionKey, field, rowId?, message };
export function validateEsgWorkbook(sections, assumptions): EsgValidationAggregate;
export function validateEsgWorkbookForSubmit(...): EsgValidationAggregate;
```

### 7.1 Rule sources

| Rule set | Source |
|----------|--------|
| Required fields | Grey cells → `required: true` in esgSections |
| Dropdown values | Assumptions + G_Data validations |
| Cross-field | EE headcount totals, payroll/NPAT for CSI |
| Completeness | Validation sheet COUNTIF rules |
| GHG cross-check | Validation rows 19–32 manual expected values → configurable tolerances |

### 7.2 Config JSON

`apps/web/src/config/esgValidationRules.json` — editable copy of rules (mirror `bbbeeInfoRequestRules.json`).

---

## 8. Phased milestones

### Phase 0 — Foundation (1–2 weeks)

**Goal:** Hub visible, routes wired, empty shell renders glass UI.

| Task | Acceptance criteria |
|------|---------------------|
| Hub card live | ESG card navigates to `/esg/clients`; no toast |
| Routes registered | All `/esg/*` routes resolve without 404 |
| EsgToolkitView shell | Header + sidebar + `#pc` content area with glass theme |
| Company list | Can create/select company with `toolkitType: 'esg'` |

### Phase 1 — Input layer (2–3 weeks)

**Goal:** Can enter SG Consumer data and persist.

| Task | Acceptance criteria |
|------|---------------------|
| esgSections.ts | All input sections defined with columns/validations |
| esgWorkbookRoutes | GET/PUT save/load round-trip |
| E_Data monthly grid | 9 periods × 5 depots; YTD auto-sum |
| S_Data headcount grid | EEA2-style grid saves and loads |
| G_Data form | All 12 dropdown fields with validation |
| Data Import paste | Parses reference template; loads ≥5 fields |
| esgValidation | Validation sheet completeness rules pass for SG Consumer seed data |

### Phase 2 — Scoring engine (2–3 weeks)

**Goal:** Scores match workbook for SG Consumer live data.

| Task | Acceptance criteria |
|------|---------------------|
| environmental.ts | E_Scorecard total = **36** ±0.01 (max **108**) |
| social.ts | S_Scorecard total = **33** ±0.01 (max **100**) |
| governance.ts | G_Scorecard total = **64.8529** ±0.01 (max **100**) |
| dashboard.ts | Overall = **44.6176%** ±0.1% via `(E/100+S/100+G/100)/3` — **not** HTML 40/30/30 |
| Stance toggle | Lean/Standard/Strict recalculates `Assumptions!B9` floor (0.3/0.5/0.7) |
| ESG Dashboard page | KPI cards, pillar bars, executive summary |

### Phase 3 — Summary flow & polish (1–2 weeks)

**Goal:** Full create → inputs → summary → toolkit flow.

| Task | Acceptance criteria |
|------|---------------------|
| EsgInformationRequest | Mirrors InformationRequest UX (section nav, save, import) |
| EsgScoreSummary | Shows pillar scores + validation blockers before toolkit |
| Submit flow | `submittedAt` locks workbook; validation must pass |
| XLSX export | Export reproduces v1.7 sheet names and key values |
| Registers | Fleet_Register + Waste_Register grids functional |

### Phase 4 — Extended disclosure (2+ weeks)

| Task | Acceptance criteria |
|------|---------------------|
| Carbon Tax page | Liability matches Carbon_Tax sheet |
| Net-Zero Roadmap | Milestone gaps render |
| B-BBEE bridge | B_BBEE_ESG scores from ESG inputs |
| IFRS / King V pages | Checklist grids with scoring |
| Multi-sector | Second sector variant config loads without code change |

---

## 9. Test strategy

### 9.1 Golden tests (primary)

Pattern: `apps/web/Toolkit/src/lib/calculators/__tests__/fsc-banks-golden.test.ts`

Create:

```
apps/web/EsgToolkit/src/lib/calculators/__tests__/
  esg-consumer-golden.test.ts     # SG Consumer live data snapshot
  esg-assumptions.test.ts         # Threshold / EF constants
  esg-emission-factors.test.ts    # GHG calc vs Validation sheet manual checks
  esg-validation.test.ts          # Completeness rules
  esg-stance.test.ts              # Lean/Standard/Strict partial credit
```

**Golden fixture source:** Extracted JSON from `docs/esg/extracted/E_Data.json`, `E_Scorecard.json`, etc.

```typescript
describe('ESG Consumer Goods — golden snapshot', () => {
  it('E pillar scores 36/108', () => {
    expect(result.environmental.score).toBeCloseTo(36, 1);
  });
  it('overall ESG is 44.6176% (workbook D9)', () => {
    expect(result.overall.percent).toBeCloseTo(0.446176, 4);
  });
});
```

### 9.2 Integration tests

| Test | Path pattern |
|------|--------------|
| Workbook save/load | `esgWorkbookRoutes.test.ts` |
| Section rendering | `esgSectionRendering.test.ts` (mirror `sectorRendering.test.ts`) |
| Paste parser | `esgGridParse.paste.test.ts` |
| Hub card link | `HubLanding.esg.test.tsx` |

### 9.3 Regression anchor

Check in a frozen `esg-consumer-golden.json` fixture derived from v1.7 workbook computed values. When workbook updates to v1.8, diff fixture deliberately.

---

## 10. B-BBEE reuse checklist

When implementing each piece, copy from the B-BBEE path:

- [ ] Section defs → `sections.ts` ColumnDef / SectionDef pattern
- [ ] Workbook CRUD → `workbookRoutes.ts` handler shape
- [ ] Client sync → `workbookClientSync.ts` (financials mapping)
- [ ] Grid editing → `SpreadsheetGrid.tsx` + `SectionWorkbookEditor.tsx`
- [ ] Store lifecycle → `store.ts` loadClientData / saveClientData
- [ ] Summary gate → `WorkbookScoreSummary.tsx` → navigate to toolkit
- [ ] Sector config → `fsc-banks.ts` CalculatorConfig pattern
- [ ] Golden tests → `fsc-banks-golden.test.ts` structure
- [ ] Hub card → `HubLanding.tsx` featured/active card pattern

---

## 11. Open questions for product owner

1. **Separate ESG companies or extend existing B-BBEE clients?** Can one company have both a B-BBEE scorecard and an ESG engagement simultaneously?
2. **Route namespace:** `/esg/*` vs `/toolkit/esg/*` — preference?
3. **Assumptions editing:** Consultant-only (like super-admin) or client-editable in Settings?
4. **Score parity tolerance:** Must web scores match Excel to 2 decimal places, or is ±0.5 pt acceptable on partial-credit indicators?
5. **ISO_14083 sheet:** Include in v1 UI or defer to Phase 4?
6. **Prior period panel:** Required for MVP (trend arrows) or Phase 2?
7. **Carbon credits register:** Add new section or skip until workbook v1.8?
8. **Multi-sector priority:** Which sector variant after SG Consumer FMCG?
9. **B-BBEE bridge:** Show inside ESG toolkit only, or also surface on existing B-BBEE dashboard?
10. **Authentication / roles:** Same pillar permissions model as B-BBEE (`usePillarPermission`) or simpler for v1?
11. **Export format:** Must export be byte-identical to xlsx template, or values-only acceptable?
12. **Overall formula:** Ship workbook `D9` as-is, or normalize E by 108?
13. **LTIFR null handling:** Workbook zero vs HTML unpenalised null.
14. **Governance UX:** Single 0–5 scale per field (workbook) vs Yes/Partial/No (HTML prototype)?

---

## Plan amendments (pass 2)

### Golden test corrections

Update Phase 2 and `esg-consumer-golden.test.ts` targets:

| Metric | Was (pass 1) | Must be (workbook) |
|--------|--------------|-------------------|
| S pillar | 24 / 84 | **33 / 100** |
| Overall | 44.6% (ambiguous) | **44.6176%** from `(36+33+64.8529)/300` |
| `prI()` for LTIFR | Port from HTML | Port **S_Scorecard row 17** formula |
| Governance inputs | `bn(popia)` etc. | **`G_Data.F*` 0–5** mapped per `G_Scorecard.md` |

### Calculator module additions

| Module | Reason |
|--------|--------|
| `eeScorecard.ts` | EE_Scorecard → S_Scorecard rows 5–10 |
| `gDataMaturity.ts` | F-column scoring shared by G_Scorecard |
| `fleetPartial.ts` | SUMPRODUCT L/100km within norm |
| `assumptionsSync.ts` | Stance → `B9` floor; `B107` SBTi year |

### Validation rules (mirror `Validation` sheet)

- `COUNTIF(E_Data months)=9` for diesel, electricity, water
- `S_Data!L12>0` for EE (currently **fails** on live data — expect FAIL until headcount entered)
- `COUNTA(King5!C4:C30)=17` (currently **7** — submit should block if enforced)
- GHG manual block: configurable expected tCO₂e per depot (rows 19–32)

### UI / prototype alignment

| Component | Source of truth |
|-----------|-----------------|
| Glass HTML | Layout, nav, paste UX only |
| Workbook xlsx | All numeric scores and formulas |
| `okiru_esg_backend.md` | **Secondary** — drift on S max (100), overall, LTIFR, governance types |

### Phase 1 scope bump

Add **EE_Scorecard** + **ISO_Tracker** + **Waste_Register** to Phase 1 (not Phase 3): E_Scorecard rows 19–29 and S row 19 already depend on them.

### B-BBEE bridge

`bbbeeBridge.ts` must read `EE_Scorecard!E15` and `Assumptions!B9` as floor for Ownership/Skills/SED partial credit — same pattern as `B_BBEE_ESG.json` formulas.

---

## 12. Suggested first PR (smallest shippable slice)

**Title:** "Enable ESG hub card and scaffold EsgToolkitView"

1. `HubLanding.tsx` — link ESG card to `/esg/clients`
2. `App.tsx` — add `/esg/clients` and `/esg/toolkit` routes
3. `EsgClientSelector.tsx` — clone ClientSelector with `toolkitType: 'esg'`
4. `EsgToolkitView.tsx` — glass shell with sidebar + placeholder dashboard
5. `esg-glass.css` — design tokens
6. Test: hub card navigates; shell renders

Est. **~800 LOC**, zero calculator logic, unblocks parallel work on sections + API.

---

## 13. File manifest (new files)

```
apps/web/src/pages/
  EsgClientSelector.tsx
  EsgInformationRequest.tsx
  EsgToolkitView.tsx
  EsgScoreSummary.tsx

apps/web/EsgToolkit/src/
  App.tsx
  lib/esgStore.ts
  lib/esgConfig/consumer-goods.ts
  lib/calculators/{environmental,social,governance,dashboard,validation}.ts
  components/layout/EsgSidebar.tsx
  pages/{Dashboard,DataImport,Environmental,Social,Governance}.tsx
  styles/esg-glass.css

apps/web/src/components/esg-workbook/
  esgSections.ts
  esgValidation.ts

apps/web/src/config/
  esgValidationRules.json

apps/web/server/
  esgWorkbookRoutes.ts

docs/esg/
  ESG_TOOLKIT_ANALYSIS.md          ✅
  ESG_IMPLEMENTATION_PLAN.md       ✅
  extracted/                       ✅
  screenshots/                     ✅
```

---

*Plan version 1.0 — derived from workbook v1.7 SG Consumer live data extraction, June 2026.*
