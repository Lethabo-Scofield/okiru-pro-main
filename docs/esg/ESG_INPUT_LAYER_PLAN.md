# ESG Input Layer — Build Plan (planner: Opus 4.7 → composer: Composer 2.5)

**Workbook of truth:** `docs/esg/Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx` (28 sheets, dimensions confirmed against `docs/esg/extracted/*.json`).
**Reference UI parity:** B-BBEE `InformationRequest` flow at `apps/web/src/pages/InformationRequest.tsx` + `apps/web/src/components/workbook/*`.
**Current ESG entry point:** `apps/web/src/pages/EsgInformationRequest.tsx` + `apps/web/src/components/esg-workbook/EsgWorkbookSectionEditor.tsx`.

The current ESG editor is a *flat* scalar/grid surface. It does **not** model the workbook's scopes, monthly periods, per-depot rows, register depth, or scorecard nuance. This plan replaces it with typed editors that mirror each sheet 1:1, plus the missing B-BBEE-parity primitives (paste preview, batch xlsx upload, warning-not-blocker validation, demo persistence).

Scope: **input layer only**. Derived sheets (E/S/G/EE/King5 scorecards, ESG_Dashboard, Carbon_Tax, NetZero_Roadmap, Materiality_Matrix) stay read-only — they recompute from raw inputs via `EsgToolkit/src/lib/calculators/*`.

---

## 0. Quick recap of complaints → resolution

| # | Complaint | Root cause | Fix section |
|---|-----------|------------|-------------|
| 1 | Editor too flat | `EsgWorkbookSectionEditor` only exposes ~5 scalar fields per sheet | §1, §2 |
| 2 | Validation fires before input | `validateEsgWorkbook` is unconditionally evaluated, every issue marked `critical` | §3 |
| 3 | Demo data vanishes on pillar tap | `loadGoldenDemo` PUTs N sections sequentially then `load()` re-fetches before all writes settle; toolkit shell `load()` re-fires on remount with empty workbook | §4 |
| 4 | No paste / batch / auto-fill | `EsgWorkbookSectionEditor` re-implements its own input shell, doesn't reuse `SectionWorkbookEditor` / `SpreadsheetGrid` paste plumbing | §5 |
| 5 | B-BBEE paste drops empty cells | `parseClipboardMatrix` + downstream still has a subtle "empty cells eaten" issue when shape detection or column alignment is off — failing regression tests needed | §6 |
| 6 | UI not aligned with B-BBEE | `esg-glass.css` neutralised but section editor still uses ad-hoc chrome (`bg-black/20`, `rounded-xl` instead of the B-BBEE `bg-[#141416]` / `border-white/[0.06]` family) | §7 |
| 7 | Ontology doc subpar | Lacks per-sheet depth, formulas, screenshots, glossary | §8 + ontology rewrite |

---

## 1. Per-sheet UI specification

All 28 sheets enumerated. Workbook coordinates and validation rules are from `docs/esg/extracted/<Sheet>.json`. Each input sheet maps to one section key (already declared in `apps/web/src/lib/esg/esgSections.ts`).

### 1.1 Cover (`section: cover` — NEW, scalar)
| Workbook block | Columns / cells | UI control | Section key | Validation | Data source |
|---|---|---|---|---|---|
| Entity Information | `Cover!C5–C12` (Entity, Reporting Period, Consultant, Version, Last Updated, Baseline Year, NZ Target Year, Sector) | `EsgScalarForm` (8 fields) | `cover.entity`, `cover.period`, `cover.baselineYear`, `cover.netZeroTargetYear`, `cover.sector` | Required on submit only (warning until then); `baselineYear` 2018–2030 numeric; `sector` ∈ Assumptions B8 list | Manual + prefill from `/api/clients/:id` (entity name, sector from B-BBEE record) |
| Sheet navigator | `Cover!B16–B42` | Render as static help/legend below form | — | — | Static (from extracted JSON) |

Sector list (dropdown options): "Generic, FMCG / Distribution, Transport / Logistics, Manufacturing, Financial Services, ICT / Technology, Agriculture, Mining, Construction, Retail, Hospitality, Healthcare, Education, Public Sector" (verbatim from `Assumptions!B8` data validation).

### 1.2 Assumptions (`section: assumptions`)
| Workbook block | Cells | UI control | Validation | Data source |
|---|---|---|---|---|
| Strategy toggles | `B6` (Scoring stance: Lean/Standard/Strict), `B8` (Sector), `B9` (Framework lens), `B10` (Materiality basis), `B11` (Currency), `B13` (Carbon Tax tier scope) | 6 dropdowns, each prefilled from the data-validation list extracted from `Assumptions.json` | Each required on submit (warning before); `B6` defaults "Standard" | Workbook defaults |
| Thresholds | `B37, B38, B39, B43–B55, B107, B112` (LTIFR threshold, NZ year, sector materiality factor, etc.) | Numeric inputs grouped as "Thresholds" | Range validation (e.g. `B55` LTIFR 0–10; `B107` 2030–2070) | Workbook defaults baked in fixture |
| Emission factors | `B4–B10` (EF_DIESEL etc.) — really lives on `E_Data` rows 4–10, mirrored | Numeric inputs (advanced/admin only, default-hide) | Sanity ranges per factor | DEFRA / NERSA factor table |

Control: scoring stance + sector toggle propagates to a derived `assumptions.derived` block that drives downstream pillar logic (NOT yet exposed in `esgCalculators` — flag for Phase 2 work).

### 1.3 E_Data (`section: e-data`)

This is the biggest sheet. Replace the current single grid with a **sub-tab layout** inside the section panel:

```
[Scope 1A Fleet] [Scope 1B Generators] [Scope 1C LPG] [Scope 1D Business cars]
[Scope 2 Electricity] [Solar offset] [Water] [Waste] [GHG summary (RO)] [NZ targets]
```

| Sub-tab | Workbook range | UI component | Rows × Cols | Notes |
|---|---|---|---|---|
| Scope 1A — Fleet diesel | `E_Data!A14:N18` | `EsgMonthlyGrid` (rows = 5 depots, cols = 9 months + YTD + tCO₂e + source) | 5 × 14 | YTD col L = `SUM(C:K)`; tCO₂e col M = `L * B4 / 1000` (read-only, computed in client) |
| Scope 1B — Generator diesel | `E_Data!A23:M27` | `EsgMonthlyGrid` | 5 × 13 | Same depots; tCO₂e same formula |
| Scope 1C — LPG forklifts | `E_Data!A32:M32` | `EsgMonthlyGrid` (1 row default DBN, allow append) | 1+ × 13 | tCO₂e col M = `L * B6 / 1000` |
| Scope 1D — Business cars | `E_Data!A37:M37` | `EsgMonthlyGrid` (1+ rows) | 1+ × 13 | tCO₂e col M = `L * B5 / 1000` |
| Scope 2 — Electricity | `E_Data!A41:N45` | `EsgMonthlyGrid` (5 depots, 14 cols inc. Landlord) | 5 × 14 | tCO₂e = `L * B7 / 1000`; landlord col is free-text |
| Solar generation (offset) | `E_Data!A50:M54` | `EsgMonthlyGrid` (5 depots) | 5 × 13 | tCO₂e avoided = `-L * B8 / 1000` |
| Water | `E_Data!A58:M62` | `EsgMonthlyGrid` (5 depots) | 5 × 13 | tCO₂e = `L * B9` |
| Waste % | `E_Data!A67:M67` + manual Oricol KPIs `L68, L69, L70, L71` | `EsgMonthlyGrid` (1 row %) + 4 scalar KPI inputs | — | Oricol section is March-26 actuals only |
| GHG summary | `E_Data!A75:L86` | Read-only computed table (sourced from above sub-tabs) | — | Render only after Scope 1+2 sub-tabs have data |
| Net-zero targets | `E_Data!A90:G90` | Scalar form (Scope 1+2 baseline, on-track flag) | — | `B90` is editable baseline; `F90 = L79+L82` derived |

Depots: `BLOEM, CPT, DBN, ISANDO, PE` — seeded as default rows; user can rename/add via SpreadsheetGrid append.
Month columns: `Jul-25, Aug-25, Sep-25, Oct-25, Nov-25, Dec-25, Jan-26, Feb-26, Mar-26` (9 cols). Header derives from `Cover!C6` reporting period.

### 1.4 S_Data (`section: s-data`)

Sub-tab layout (S_Data is 82 rows tall, multiple logical blocks):

```
[EE Headcount EEA2] [Health & Safety] [Training (WSP/ATR)] [Community (CSI)] [Payroll & SDL]
```

| Sub-tab | Workbook range | Component | Notes |
|---|---|---|---|
| EE Headcount | `S_Data!A5:L11` (7 occupational levels × 10 race/gender × Total) | `EsgHeadcountGrid` (specialised) | Row labels are EEA2 L1–L7 + "Temporary"; columns Af M / Col M / Ind M / Wht M / Af F / Col F / Ind F / Wht F / For M / For F; Total col L = SUM(B:K) per row, read-only |
| H&S | `S_Data!A28:G35` (incidents, fatalities, near-miss, LTIFR formula in G35) | `EsgScalarForm` (numeric grid) | `G35 = IF(G28=0,0,(G29/G28)*200000)` — formula client-side; flag if LTIFR > 2.0 (Assumptions B55) |
| Training | `S_Data!A40:G50` (WSP submitted, ATR submitted, training spend, black training spend, learnerships) | `EsgScalarForm` | `B45` (WSP), `B46` (ATR) as Yes/No/Partial; `B43, B44, B49, B50` numeric |
| Community | `S_Data!A55:G65` (CSI spend, beneficiaries, initiatives) | `EsgScalarForm` + count of initiatives | `_initiatives_count` is a meta cell |
| Payroll & SDL | `S_Data!A70:G82` (Total payroll, SDL, FTE) | `EsgScalarForm` | `B70` payroll, `B71` SDL (auto = B70 × 1%) |

### 1.5 G_Data (`section: g-data`)

Single page, two columns:

| Block | Workbook range | UI |
|---|---|---|
| Board & Governance | `G_Data!A5:F24` (20 metrics; col B values are dropdowns or numeric; col F is auto 0–5 score) | `EsgMaturityGrid`: col A read-only labels, col B Yes/No/Partial/N/A dropdown OR numeric (per row config), col D free-text source, col F **0–5 maturity slider (computed)** rendered but disabled |
| Governance total | `G_Data!F26` | Read-only progress bar showing F26/100 |

Twelve rows have explicit dropdown data validation (B12, B13, B14, B15, B16, B17, B18, B19, B20, B21, B23, B24 — verbatim from `G_Data.json`). The other rows (B5, B6, B7, B8, B9, B10, B11, B22) are numeric. Generate the row config table once and reuse.

### 1.6 EE_Scorecard (`section: ee`)
| Block | Cells | UI |
|---|---|---|
| EE indicator scorecard | `EE_Scorecard!A5:H25` | Read-mostly grid — col B is user input (numeric % or Yes/No), col E is auto-computed score (read-only), col G shows ✓ Met / ✗ Gap status badge |
| EE numeric % rows | `B5, B6, B7, B8` (% Black, % Black female, % Black L1+L2 mgmt, % PWD) | Numeric inputs (0–100) |
| EE dropdown rows | `B9–B14` (EE Plan, EE Forum, EE numerical targets, EE reporting, EE training, Disability stretch) | Yes / Partial / No / N/A (data validation extracted) |

Visual: percentage bars in col B (Lake Trading style).

### 1.7 Fleet_Register (`section: fleet`) — already a grid; widen columns
Existing column set is correct; add three missing columns from `Fleet_Register.json`:

| Existing | Add |
|---|---|
| reg, depot, model, gvm, tare, carry, fuelCap, tracking, monthlyKm, monthlyLitres, l100Actual, l100Norm, monthlyTco2, serviceStatus, licenceExpiry | (none missing — confirmed all 15 cols present) |

Action: add **paste preview modal** (reuse `SectionImportPreviewModal` from B-BBEE) — currently raw paste skips diff review.

### 1.8 Waste_Register (`section: waste`)
| Block | Range | UI |
|---|---|---|
| Per-stream waste | `Waste_Register!A4:J40` | `EsgRegisterGrid` (existing 8 cols + 2 new: `contractor`, `invoiceRef`) |
| Cority monthly recycle % | `Waste_Register!B12:J13` | `EsgMonthlyGrid` (1 row, 9 months) — store under `_monthly` meta |
| Waste KPIs | `B16–B19` (Oricol diversion %, average recycle %, total landfill tCO₂e, contractor sustainability rating) | Read-only cards derived from grid |

### 1.9 Driver_Debrief (`section: driver-debrief`)
| Workbook range | UI |
|---|---|
| `Driver_Debrief!A3:M50` (date, depot, driver, vehicleReg, route, custHit%, planStops, actStops, planKm, actKm, fatigueFlag, comments) | `EsgRegisterGrid` (12 cols); date column uses `NumericDateInput`; route compliance auto-flag in red when actStops < planStops |

### 1.10 ISO_Tracker (`section: iso-tracker`)
| Range | UI |
|---|---|
| `ISO_Tracker!B5:I62` (one row per ISO clause; 60 rows across ISO 14001/45001/27001/26000/22000) | `EsgRegisterGrid`: requirement (RO), clause (RO), status dropdown (Fully Compliant / Partially Compliant / Gap / N/A), score 0–5 (computed: Fully=5, Partial=3, Gap=0, NA blank), weight (RO), evidence needed (RO), current evidence (free text), netZeroLink (RO) |
| Section dividers | `A3, A20, A35, A48, A57` | Render as section headers between row groups |

Status dropdowns extracted (43 sqrefs in `ISO_Tracker.json`). The fixed-row layout is required (rows are part of the standard, not user-added) → set `canAddRows={false}`, `canDeleteRows={false}` on the grid.

### 1.11 King5_Scorecard (`section: king5`)
| Range | UI |
|---|---|
| `King5_Scorecard!B4:I20` — 17 principles | `EsgRegisterGrid` fixed 17 rows; col C status dropdown (`Applied / Explained / Partially Applied / Not Applied`), col D weight (RO), col E score (RO = status→points), col F evidence (free text) |
| Total score | `E21` | Computed and stored as cell meta (already wired) |

Submit gate stays as `validateForSubmit` only — but is **warning** in panel until user clicks submit.

### 1.12 IFRS_S1_S2 (`section: ifrs`)
| Range | UI |
|---|---|
| `IFRS_S1_S2!A5:H30` (~22 disclosure requirements grouped S1/S2) | `EsgRegisterGrid` fixed rows; col D status dropdown (`Disclosed / Partially Disclosed / Not Disclosed / N/A`), col F current status / evidence text, col G action required text |

### 1.13 GARP_GRAP (`section: garp`)
| Range | UI |
|---|---|
| `GARP_GRAP!A5:K30` (~20 risk rows) | `EsgRegisterGrid`: risk (RO), description, dataSource, severity (1–5), control status dropdown (`Effective / Partially Effective / Ineffective / Not Assessed`), evidence, likelihood (1–5), impact (1–5), residual risk (computed) |

### 1.14 SAQ_Supplier (`section: saq`)
| Range | UI |
|---|---|
| `SAQ_Supplier!A5:K40` (~35 suppliers) | `EsgRegisterGrid`: supplier (text), seven 1–5 dropdowns (On-Time Del, Quality, H&S, Environmental, Food Safety, Correct Invoicing, Backup Support), % score (computed: avg × 20), rating A–E (computed), ESG net-zero link (text) |

### 1.15 Carbon_Tax (read-only; `section: carbon-tax-view` — render in EsgInformationRequest as RO card)
Derived from E_Data — display only, no editing. Source: `Carbon_Tax!A5:F19` (Scope rows + total + Section 12L allowance toggles fed from `Assumptions!B13`). Read via `EsgToolkit/src/lib/calculators/carbonTax.ts` (already exists).

### 1.16 NetZero_Roadmap (read-only; `section: net-zero-view`)
Source: `NetZero_Roadmap!A4:M27`. Driven by `E_Data!B90` baseline + Assumptions targets. Render as line chart only; user inputs the baseline once in E_Data (Net-Zero Targets block).

### 1.17 Materiality_Matrix (read-only)
Source: `Materiality_Matrix!A5:G31`. Computed from GARP_GRAP rows. No edits required in input layer (display in toolkit dashboard view).

### 1.18 Reference / read-only sheets

| Sheet | Section key | Treatment |
|---|---|---|
| ESG_Dashboard | — | Toolkit dashboard, not input |
| E_Scorecard, S_Scorecard, G_Scorecard | — | Read-only summary cards in `EsgScoreSummary` |
| Validation | `validation-view` (RO panel) | Surface as right-rail `WorkbookValidationPanel` mirror — see §3 |
| Audit_Log | `audit-log-view` (RO) | List `Audit_Log!A6:F30` rows; appendable in admin only |
| Standards_Map | `standards-map-view` (RO) | Render `Standards_Map!A3:I37` as filterable reference table |
| Glossary | `glossary-view` (RO) | Inline help drawer from `Glossary!A3:E101` |
| Data_Status | `data-status-view` (RO) | Toolkit-only completeness tracker (Phase 2) |
| B_BBEE_ESG | — | Bridge to B-BBEE workbook (cross-link) |
| ISO_14083 | `iso-14083` | Per-trip transport register — defer to Phase 2 (already toolkit-only page exists at `EsgIso14083.tsx`). Optional: wire as `EsgRegisterGrid` for trip entry. |

---

## 2. UI component plan

Existing `EsgWorkbookSectionEditor` → split into a thin router and specialised editors. Composition target:

```
EsgWorkbookSectionEditor (router; ~80 LOC)
├── EsgScalarForm       — meta scalar fields (Cover, Assumptions, S_Data sub-sections)
├── EsgMonthlyGrid      — depots × 9 months × derived YTD/tCO₂e (E_Data Scope 1/2/Water)
├── EsgHeadcountGrid    — EEA2 7×10 race/gender headcount matrix (S_Data)
├── EsgMaturityGrid     — Y/N/Partial col + 0–5 auto-score col (G_Data, EE_Scorecard)
├── EsgRegisterGrid     — generic SpreadsheetGrid wrapper (Fleet, Waste, Driver_Debrief, ISO_Tracker, IFRS, GARP, SAQ, King5, ISO_14083)
└── EsgSubtabContainer  — tabs within a section (E_Data has 10 sub-tabs)
```

### 2.1 Shared primitives

All editors:

1. Use `SpreadsheetGrid` as the underlying matrix when shape is row-oriented (Register grids).
2. Use `<table>` + cell `<input>` for fixed-shape grids (Headcount, Maturity, Monthly) — *but the cells must still accept paste*.
3. **Reuse** B-BBEE chrome: header row uses `bg-[#1c1c1e]`, cells `border-[#2c2c2e]`, hover `bg-white/[0.03]`. The current `bg-black/20 rounded-xl` ESG container goes away (see §7).
4. Emit `onTouch(field)` per cell so validation can skip untouched fields (see §3).
5. Expose `onPaste(matrix)` so the container can hand off Excel-shaped clipboard data (see §5).

### 2.2 `EsgMonthlyGrid` — new component
- Props: `{ rows: MonthlyRow[]; months: string[]; emissionFactor?: number; unitLabel: string; onChange; readOnly?; ytdLabel?; tco2Label? }`
- Renders: 1 header row + N data rows + 1 totals row. Cols = label + unit + months + YTD + tCO₂e + source.
- Paste handler reuses `parseClipboardMatrix` + `applyPasteToRows` (after §6 fix).
- Computes YTD and tCO₂e client-side so the user sees totals instantly (server still stores raw monthly cells).

### 2.3 `EsgHeadcountGrid` — new
- Props: `{ rows: HeadcountRow[]; onChange; readOnly? }`. Rows are EEA2 levels (typed).
- Renders 7 rows × 10 race/gender columns + auto Total column.
- Allows column-paste of Excel headcount block.

### 2.4 `EsgMaturityGrid` — new
- Props: `{ rows: { label, kind: 'yn'|'numeric', cellRef, scoreFn }[]; values; onChange }`.
- Renders col B input (dropdown or number) + col F maturity bar (computed RO). Below the grid: total score progress (0–100).

### 2.5 `EsgRegisterGrid` — wrap existing
Wrapper around `SectionWorkbookEditor` (replace the bespoke editor in `apps/web/src/components/esg-workbook/EsgWorkbookSectionEditor.tsx`). Reusing this gives us batch xlsx upload, export, and paste-preview for free.

### 2.6 `EsgSubtabContainer`
- Wrouter-state tabs inside a section panel — URL becomes `/esg/create/:id?section=e-data&tab=scope-1a`.
- Active sub-tab persisted in section meta cells (`_activeSubtab` per section) so it survives navigation.

---

## 3. Validation rule catalogue

### 3.1 Sources

- `Validation!A4:E32` — 12 completeness checks, 4 manual cross-checks (extracted JSON).
- Per-cell data validations: 6 (Assumptions), 1 (E_Data B90 list), 12 (G_Data Y/N), 6 (EE), 17 (King5), 22 (IFRS), 18 (GARP), 43 (ISO_Tracker), 84 (SAQ), 1 (Waste) — total **209 distinct sqrefs** in `data_validations` arrays.

### 3.2 New `EsgRule` model

```ts
type EsgRuleSeverity = "warning" | "error";          // never "critical" by default
type EsgRuleScope = "field" | "section" | "workbook";
type EsgRuleTrigger = "always" | "touched" | "submit";  // ← fixes complaint #2

type EsgRule = {
  id: string;            // stable, e.g. "e-data.fleet.months-complete"
  scope: EsgRuleScope;
  sectionId: string;
  fieldRef?: string;     // cell ref OR row+key
  severity: EsgRuleSeverity;
  trigger: EsgRuleTrigger;
  message: string;
  evaluate: (workbook: EsgWorkbookData, touched: TouchedState) => boolean; // true = pass
};
```

Default for *every* rule: `severity: "warning"`, `trigger: "touched" | "submit"`. Only the **submit-gate rules** become `severity: "error"`, and only when `validateForSubmit` is called (panel and `ContinueToSummary` action).

### 3.3 Touch tracking
- Add `touchedState: Record<string, Record<string, true>>` to `useEsgStore`.
- Setter `markTouched(sectionId, fieldRef)` called from every editor when the user edits or blurs a cell.
- Rule evaluator only counts a rule *failure* when `trigger === "submit"` (always evaluated on submit attempt) or `trigger === "touched"` && touchedState matches.
- For empty workbooks, `validateEsgWorkbook(workbook, touchedState)` returns ALL rules as `pass: undefined` (= "not yet checked"). Panel renders these as muted bullets ("⏳ Pending input") rather than red ✗.

### 3.4 Rule catalogue (Phase-1 subset, ≈ 24 rules)

| Rule id | Section | Field | Severity | Trigger | Message |
|---|---|---|---|---|---|
| `cover.entity-required` | cover | entity | warning→error | submit | Entity name required |
| `cover.period-required` | cover | period | warning→error | submit | Reporting period required |
| `cover.baseline-year-valid` | cover | baselineYear | warning | touched | Baseline year should be between 2018 and 2030 |
| `assumptions.sector-required` | assumptions | B8 | warning→error | submit | Pick a sector before submit |
| `assumptions.stance-required` | assumptions | B6 | warning | touched | Defaulted to "Standard" |
| `e-data.fleet.months-complete` | e-data | scope1A.months | warning→error | submit | Expected 9 months of fleet diesel data, found {n} |
| `e-data.electricity.months-complete` | e-data | scope2.months | warning→error | submit | Expected 9 months electricity, found {n} |
| `e-data.water.months-complete` | e-data | water.months | warning | submit | Expected 9 months water |
| `e-data.solar-implausible` | e-data | scope2.solarOffset | warning | touched | Solar generated exceeds grid consumption |
| `e-data.baseline-set` | e-data | B90 | warning | submit | Net-Zero baseline (tCO₂e) not set |
| `s-data.headcount-positive` | s-data | L12 | warning→error | submit | EE total headcount must be > 0 |
| `s-data.ee-mgmt-female` | s-data | F5/L5 | warning | touched | Female representation at L1 is 0% |
| `s-data.ltifr-threshold` | s-data | G35 | warning | touched | LTIFR > Assumptions!B55 threshold |
| `s-data.wsp-submitted` | s-data | B45 | warning | submit | WSP submission status unknown |
| `g-data.code-of-ethics` | g-data | B15 | warning | submit | Code of ethics flag not set |
| `g-data.popia-io` | g-data | B17 | warning | submit | POPIA Information Officer flag not set |
| `g-data.score-positive` | g-data | F26 | warning | submit | Governance total score is 0 |
| `ee.ee-plan` | ee | B9 | warning | submit | EE plan submission status not set |
| `fleet.has-rows` | fleet | _rows | warning | submit | Fleet register is empty |
| `waste.has-rows` | waste | _rows | warning | touched | No waste stream entries |
| `king5.principles-complete` | king5 | _principles_filled | warning→error | submit | King V requires all 17 principle statuses (found {n}) |
| `ifrs.disclosures-started` | ifrs | _yes_count | warning | submit | No IFRS S1/S2 disclosures marked Disclosed |
| `iso.gap-rate` | iso-tracker | _gap_count | warning | touched | More than 50% of ISO clauses are gaps |
| `saq.score-coverage` | saq | _scored_count | warning | submit | < 10 suppliers scored |

(See `apps/web/src/lib/esg/esgValidationRules.ts` — new file — for canonical catalogue. One row per rule, generated from this table.)

### 3.5 Panel (`EsgValidationPanel` rewrite)

Mirror B-BBEE's `WorkbookValidationPanel` chrome (amber-tinted card, expandable per-section, filter input). Replace the current ESG panel's harsh red ✗ icons with:

| State | Icon | Color |
|---|---|---|
| Untouched + warning rule | `Circle` outline | `text-[#48484a]` ("not yet checked") |
| Touched + pass | `CheckCircle2` | `text-emerald-400` |
| Touched + warning | `AlertTriangle` | `text-amber-300` |
| Submit attempted + error | `XCircle` | `text-red-400` |

Add a "Submit ready" tally at the top: `n of m rules passing · k warnings · j blockers`. Blockers only appear when user clicks the submit button (the `EsgValidationAggregate.blockers` array stays in the API).

---

## 4. Demo data persistence fix

### 4.1 Root cause

Two race conditions chained:

1. `EsgInformationRequest.loadGoldenDemo()` calls `updateSectionCells` per section in a loop. Each call PUTs to `/api/esg/workbook/:id/section/:sectionKey`. After the loop, it calls `load(companyId)` which fetches `/api/esg/workbook/:id`. If any PUT is still in-flight when GET runs (Express + Mongo is not strictly sequential per connection), GET returns workbook without the latest section → demo "disappears" partially.
2. `EsgToolkitShell.tsx` and `EsgInformationRequest.tsx` both call `useEsgStore.load(companyId)` on mount / when the companyId effect re-fires. Wouter `Link` navigation between `/esg/toolkit/:id` and `/esg/create/:id` re-mounts both shells. If the demo was written purely client-side (or PUTs failed silently), the GET re-fetch returns an empty workbook and replaces the store.

### 4.2 Fix (server-first, atomic seed)

1. Add `POST /api/esg/workbook/:companyId/seed-demo` endpoint in `apps/web/server/esgWorkbookRoutes.ts`. Server-side it constructs the golden workbook (port `SG_CONSUMER_GOLDEN_CELLS` into a fixture file in `apps/web/server/esgGoldenFixture.ts`) and writes ALL sections in one `findOneAndUpdate` call. Mirrors B-BBEE's `/api/admin/demo/lake-trading`.
2. `EsgInformationRequest.loadGoldenDemo()` becomes:
   ```ts
   await fetch(`${API_BASE}/api/esg/workbook/${id}/seed-demo`, { method: "POST", credentials: "include" });
   await load(companyId, companyName);
   ```
3. `useEsgStore.load` gains a "skip if fresh" guard:
   ```ts
   if (state.companyId === companyId && state.workbook && Date.now() - state.workbookLoadedAt < 30_000) return;
   ```
   Pages can pass `force: true` after seed/save flows.
4. Bonus: in `EsgToolkitShell` and `EsgInformationRequest`, when companyId is unchanged but the effect re-fires (StrictMode double-mount, parent re-render), don't reload.

### 4.3 Tests

- `apps/web/server/__tests__/esgWorkbookRoutes.test.ts` — assert `POST /seed-demo` writes all 13 sections atomically; GET immediately after returns them.
- `apps/web/src/pages/__tests__/EsgInformationRequest.demo.test.tsx` — render, click "Load demo data", await save status, navigate to another section tab → assert workbook still populated. Then unmount + remount → still populated.

---

## 5. Copy/paste, batch upload, auto-fill

### 5.1 Paste handler

All input editors funnel through one paste pipeline:

```
ClipboardEvent
  → parseClipboardMatrix (fix in §6)
  → expandClipboardMatrix
  → normalizePaste (apps/web/src/lib/aiMappingClient.ts) ← deterministic-first + AI fallback (already works for B-BBEE)
  → applyPasteToRows  /  applyPasteToCells (for fixed grids like Headcount and Monthly)
  → editor.onChange
  → store.updateSectionCells
```

`applyPasteToCells` is a **new** helper (`apps/web/src/lib/esg/esgGridPaste.ts`) for fixed-shape grids: given an anchor (row,col) and a matrix, write to literal cell refs without creating new rows. Required by `EsgMonthlyGrid` and `EsgHeadcountGrid` because their rows are predefined (depots, EEA2 levels).

### 5.2 Excel xlsx batch upload (whole workbook)

New endpoint:
```
POST /api/esg/workbook/:companyId/import
Content-Type: multipart/form-data
Field: file=<v1.7 xlsx>
```

Server flow (`apps/web/server/esgWorkbookRoutes.ts` + new `apps/web/src/lib/esg/esgWorkbookImport.ts`):

1. Parse xlsx via `xlsx` lib (already imported by B-BBEE excelImport).
2. For each sheet matching a known `EsgWorkbookSheetMap` (Cover→cover, E_Data→e-data, S_Data→s-data, etc.), extract relevant blocks using known coordinates from `docs/esg/extracted/<Sheet>.json`.
3. Return `{ sections: { [sectionId]: { cells } }, warnings: string[], unmatchedSheets: string[] }` — DO NOT persist yet.
4. Client renders a preview modal (reuse `SectionImportPreviewModal` pattern; new component `EsgImportPreviewModal`) showing per-section row deltas. User confirms → second call `PUT /api/esg/workbook/:id/section/:k` per section (or new `PUT /api/esg/workbook/:id` bulk endpoint that takes the entire payload).

UI: add an "Import xlsx" button next to "Load demo data" in `EsgInformationRequest` header.

### 5.3 Auto-fill rules (heuristics)

- When `Cover!Sector` is set → suggest Assumptions sector toggle (`assumptions.B8`); user accepts via toast.
- When `E_Data` Scope 1 months ≥ 6 → autocompute YTD into the read-only column (already in client formulas).
- When `S_Data` payroll (B70) set → auto-fill SDL (B71) as `B70 × 0.01`.
- When `S_Data` headcount totals (`L5..L11`) set → trigger `EE_Scorecard!B5` recompute (`% Black = sum of black levels ÷ total`).

Each rule lives in `apps/web/src/lib/esg/esgAutofill.ts` as a pure function `(workbook) => Patch[]`. Editor surfaces them as a non-blocking toast: "Auto-fill SDL from payroll? [Apply] [Dismiss]".

---

## 6. B-BBEE paste empty-cell regression

### 6.1 What's confirmed in the parser

`apps/web/src/lib/workbookGridParse.ts::parseClipboardMatrix` already pushes empty cells (it splits on the delimiter unconditionally). So the unit test `"a\t\tb\n"` → `[["a","","b"]]` should pass today.

### 6.2 What's likely broken

Downstream of the parser:

1. **`applyPasteToRows` (workbookGridParse.ts, line 256–262)** — grid-shape branch loops `for (let c = 0; c < sourceLine.length; c++)`, writing `target[col.key] = src[col.key]`. If `src` was built by `matrixToRowsByPosition` and the empty cell's coerced value is `""`, this *should* write `""`. BUT `Object.assign(target, src)` is used on the `mapHeaders` path (line 251) — that one DOES preserve empty keys because `matrixToRowsByPosition` fills every column at the end. We need explicit tests covering both paths.
2. **`tabularNormalize.normalizeMatrix` line 507** — `if (line.every((c) => ... String(c).trim() === "")) continue;` drops all-empty *rows*, which is correct. But there's no test asserting that *partial-empty* rows preserve column alignment.
3. **SpreadsheetGrid `handlePaste`** — `parseClipboardMatrix(text)` then `expandClipboardMatrix` then `applyPasteToRows`. `expandClipboardMatrix` is fine for empty cells (only fires for single-cell pastes).

### 6.3 Required fixes (with tests)

Add the following tests to `apps/web/src/lib/__tests__/workbookGridParse.paste.test.ts`:

```ts
it("preserves empty interior cells (a\\t\\tb)", () => {
  expect(parseClipboardMatrix("a\t\tb\n")).toEqual([["a", "", "b"]]);
});

it("preserves leading empty cells", () => {
  expect(parseClipboardMatrix("\t\ta\tb\n")).toEqual([["", "", "a", "b"]]);
});

it("preserves trailing empty cells", () => {
  expect(parseClipboardMatrix("a\tb\t\t\n")).toEqual([["a", "b", "", ""]]);
});

it("applyPasteToRows writes empty cell into middle column", () => {
  const cols: ColumnDef[] = [
    { key: "first", label: "First", type: "text" },
    { key: "middle", label: "Middle", type: "text" },
    { key: "last", label: "Last", type: "text" },
  ];
  const existing = [{ _id: "r1", first: "X", middle: "Y", last: "Z" }];
  const matrix = parseClipboardMatrix("a\t\tb\n");
  const next = applyPasteToRows(existing, cols, matrix, { row: 0, col: 0 }, false);
  expect(next[0].first).toBe("a");
  expect(next[0].middle).toBe("");
  expect(next[0].last).toBe("b");
});
```

Add to `apps/web/src/lib/__tests__/tabularNormalize.test.ts`:

```ts
it("normalizeMatrix preserves empty middle cells", () => {
  const cols: ColumnDef[] = [/* same 3 */];
  const result = normalizeMatrix([["a", "", "b"]], cols, { hasHeaderRow: false, startColIndex: 0 });
  const rows = toGridRows(result, cols);
  expect(rows[0]).toMatchObject({ first: "a", middle: "", last: "b" });
});
```

These will surface the actual bug. Likely patch surface in `matrixToRowsByPosition`:

```ts
for (let c = 0; c < line.length; c++) {
  const colIdx = mapHeaders ? c : startCol + c;
  const key = mapHeaders ? colKeys[c] : columns[colIdx]?.key;
  if (!key) continue;
  // do NOT skip empty source cells — they must overwrite target
  const col = columns.find((x) => x.key === key);
  const val = coerceCellValue(key, col, line[c] ?? "");
  row[key] = val;        // unconditional write
  if (val !== "" && val !== null && val !== undefined && val !== false) hasData = true;
}
```

Note: the **current** code already writes unconditionally — confirm test failure first, then narrow the fix. If tests pass, the bug is elsewhere (likely in editor-level paste handler or `coerceCellValue` for `select` columns where an empty source might trigger fuzzy suggestion).

### 6.4 ESG reuses the fix

The same primitives are imported by every ESG editor (`EsgMonthlyGrid`, `EsgRegisterGrid`, etc.) so once §6.3 lands, ESG paste also preserves column alignment.

---

## 7. UI consistency (B-BBEE parity)

### 7.1 CSS audit

`apps/web/src/styles/esg-glass.css` already aligns the page wash (`--esg-bg: #000`). Remaining gaps vs B-BBEE `InformationRequest`:

| Surface | B-BBEE | ESG today | Action |
|---|---|---|---|
| Section panel | `bg-[#141416] border-white/[0.06] rounded-2xl` | `bg-white/[0.02] border-[var(--esg-glass-border)] rounded-2xl` | Re-skin: use the same `bg-[#141416]` (set `--esg-section-bg: #141416`) |
| Section header | `px-6 py-4 border-b border-white/[0.06]` (`SectionWorkbookEditor`) | Inline header in custom editor with no separator | Add the same header band |
| Save button | `bg-blue-500 text-white` for primary, `bg-[#1c1c1e]` for secondary | `bg-[var(--esg-acc-e)] text-[#080e14]` (green) | Use neutral grey for "Save section" (green only for Continue) |
| Empty grid | Ghost rows with `bg-[#0e0e10]` cells | Same SpreadsheetGrid → ok | — |
| Sidebar tab | `text-[#d1d1d6] · bg-white/[0.08]` for active | `text-[var(--esg-text)] · bg-white/[0.08]` active | Already aligned; verify hover state |
| Validation panel | Amber-tinted `border-amber-500/20 bg-amber-500/[0.06]` | Glass card | Re-skin to amber when warnings exist, emerald when all pass |
| Page tint | None (true black) | None (already removed green) | Confirm no leftover `--esg-acc-e` background usage |

Action: introduce `--esg-section-bg`, `--esg-input-bg`, `--esg-input-border` in `esg-glass.css` matching `#141416 / #0e0e10 / #2c2c2e`, then update editor markup to use these tokens. No green page tint anywhere.

### 7.2 Component skin changes

- Replace every `bg-black/20` in `EsgWorkbookSectionEditor` with `bg-[var(--esg-input-bg,#0e0e10)]`.
- Replace `bg-[var(--esg-acc-e)] text-[#080e14]` save button with `bg-[#1c1c1e] hover:bg-[#2c2c2e] text-white border border-[#2c2c2e]`. Keep green only for "Continue to Summary" (matches B-BBEE's "Continue" CTA).
- Sidebar pill counts use `text-[#8e8e93]` like B-BBEE InformationRequest section tabs.

---

## 8. Ontology rewrite spec (delivered as the rewritten `ESG_FLOW_ONTOLOGY.md`)

Required content (replaces today's 152-line doc):

1. **Top-of-doc consultant journey** — 1-page mermaid diagram + numbered "day-1 onboarding" workflow.
2. **Per-sheet section** for all 28 sheets:
   - Purpose
   - Persona (who enters)
   - Linked screenshot reference (`docs/esg/screenshots/<Sheet>.png`)
   - Workbook ranges (`<Sheet>!A1:Z99`)
   - Cell-level field table
   - Formulas → derived sheet → KPI
   - Web section key + editor type
3. **Pillar dependency graph** — mermaid showing E_Data → E_Scorecard → ESG_Dashboard.D9, etc.
4. **Web section ↔ sheet ↔ screenshot table** (already in §3 today; expand).
5. **Glossary** — pulled from `docs/esg/extracted/Glossary.json` (101 rows, including Scope 1/2/3, GHG Protocol, King V, IFRS S2, EEA2, LTIFR, etc.).
6. **HTTP API** — list every endpoint with example payloads (current doc has only the table).
7. **Submit gate** — exact rule set evaluated by `validateEsgWorkbookForSubmit`.
8. **Audit log conventions** — how `Audit_Log` integrates.

Pre-rewritten in this same PR (see file `docs/esg/ESG_FLOW_ONTOLOGY.md` after this plan is applied). Composer should treat the ontology as fixed scope — only add per-section diagrams and embed screenshots, no new prose decisions.

---

## 9. Implementation phase order (Composer task list)

Each task ≤ 200 LOC and self-testable. Numbered for sequential execution.

### Phase A — Plumbing (≤ 4 hours)

**A1. Touched-state in store** — `apps/web/EsgToolkit/src/lib/esgStore.ts`
- Add `touched: Record<string, Set<string>>`, `markTouched(sectionId, fieldRef)`, `resetTouched(sectionId)`.
- Acceptance: `useEsgStore` exposes `touched` and a memoized helper `isTouched(sectionId, ref)`. Vitest unit test asserts mark/reset behaviour. 50 LOC.

**A2. Rule model + Phase-1 catalogue** — new file `apps/web/src/lib/esg/esgValidationRules.ts`
- Implement `EsgRule`, `EsgRuleEvaluation`, `evaluateEsgRules(workbook, touched, mode)`. `mode = "live" | "submit"`.
- Port the 24 Phase-1 rules from §3.4.
- Acceptance: golden test feeds workbook + touched into `evaluateEsgRules`, asserts pass/warning/error transitions match the table.

**A3. Refactor `esgValidation.ts`** — `apps/web/src/lib/esg/esgValidation.ts`
- Re-export `validateEsgWorkbook(workbook, touched?, mode="live")` and `validateEsgWorkbookForSubmit(workbook)` using `evaluateEsgRules`.
- Acceptance: existing callers don't break. Existing tests pass; new tests for "no fail without touch" added.

**A4. Demo-data atomic seed endpoint** — `apps/web/server/esgWorkbookRoutes.ts`
- Add `POST /:companyId/seed-demo`.
- Add `apps/web/server/esgGoldenFixture.ts` (move SG_CONSUMER_GOLDEN_CELLS server-side).
- Acceptance: new test `apps/web/server/__tests__/esgWorkbookRoutes.test.ts` — POST seeds all 13 sections, GET returns all 13.

**A5. Store load guard + loadGoldenDemo refactor** — `EsgInformationRequest.tsx`, `EsgToolkitShell.tsx`, `esgStore.ts`
- `load` gains `force?: boolean` flag, skips re-fetch when `companyId` unchanged and `workbook` already loaded within last 30s.
- `loadGoldenDemo` calls new endpoint, then `load(companyId, name, { force: true })`.
- Acceptance: tests in §4.3 pass.

### Phase B — Editors (≤ 8 hours)

**B1. `EsgScalarForm`** — `apps/web/src/components/esg-workbook/EsgScalarForm.tsx`
- Render typed field array with B-BBEE chrome (`#141416` panel, `#0e0e10` inputs).
- Props: `{ fields: FieldDef[]; values; onChange; onTouch }`.
- Acceptance: Cover and Assumptions sections render with all fields; vitest snapshot test.

**B2. `EsgMonthlyGrid`** — `apps/web/src/components/esg-workbook/EsgMonthlyGrid.tsx`
- Fixed depots × 9-month matrix.
- Paste handler delegating to `applyPasteToCells` (new helper).
- Computed YTD + tCO₂e cols.
- Acceptance: vitest test pastes 5×9 matrix → cells written; YTD shows sum; tCO₂e shows L × factor / 1000.

**B3. `EsgHeadcountGrid`** — `apps/web/src/components/esg-workbook/EsgHeadcountGrid.tsx`
- 7 EEA2 rows × 10 race/gender cols + Total.
- Paste handler reads 7×10 block.
- Acceptance: vitest unit test asserts total = sum of row; column-paste preserves alignment.

**B4. `EsgMaturityGrid`** — `apps/web/src/components/esg-workbook/EsgMaturityGrid.tsx`
- Combines Y/N/Partial dropdowns OR numeric inputs with auto-computed 0–5 score column.
- Reusable for G_Data + EE_Scorecard.
- Acceptance: vitest test asserts F26 total = sum of F-column scores.

**B5. `EsgSubtabContainer`** — `apps/web/src/components/esg-workbook/EsgSubtabContainer.tsx`
- Wires sub-tab nav + URL query param `tab=`.
- Persists `_activeSubtab` cell on store.
- Acceptance: rendering test confirms active tab survives section nav.

**B6. Editor router rewrite** — `apps/web/src/components/esg-workbook/EsgWorkbookSectionEditor.tsx`
- ≤ 80 LOC. Routes section id → one of the typed editors.
- Cover, Assumptions → `EsgScalarForm`.
- e-data → `EsgSubtabContainer` of `EsgMonthlyGrid` instances.
- s-data → `EsgSubtabContainer` of `EsgHeadcountGrid` + `EsgScalarForm` blocks.
- g-data, ee → `EsgMaturityGrid`.
- fleet, waste, driver-debrief, iso-tracker, king5, ifrs, garp, saq → `EsgRegisterGrid` (reuse `SectionWorkbookEditor`).
- Acceptance: each section renders without errors with empty workbook (no "fields not configured" placeholder anywhere).

### Phase C — Paste / upload / validation panel (≤ 4 hours)

**C1. Paste empty-cell regression suite** — `apps/web/src/lib/__tests__/workbookGridParse.paste.test.ts`, `apps/web/src/lib/__tests__/tabularNormalize.test.ts`
- Add tests from §6.3.
- If tests fail: patch `matrixToRowsByPosition` or `coerceCellValue` so empty source cells overwrite the target with `""`.
- Acceptance: all four new tests pass.

**C2. `applyPasteToCells` helper** — `apps/web/src/lib/esg/esgGridPaste.ts`
- For fixed-shape grids; writes matrix from anchor without creating new rows; preserves empty cells.
- Acceptance: unit tests for monthly + headcount scenarios.

**C3. `EsgValidationPanel` rewrite** — `apps/web/src/components/esg-workbook/EsgValidationPanel.tsx`
- Mirrors B-BBEE chrome. Subscribes to `touched`. Renders 4-state icons (untouched/pass/warning/error).
- Acceptance: rendering test shows correct counts; clicking a rule jumps to section/field.

**C4. xlsx import endpoint + UI** — `apps/web/server/esgWorkbookRoutes.ts`, `apps/web/src/lib/esg/esgWorkbookImport.ts`, `apps/web/src/components/esg-workbook/EsgImportPreviewModal.tsx`
- `POST /:companyId/import` parses xlsx and returns `{ sections, warnings, unmatchedSheets }` without writing.
- UI "Import xlsx" button → file picker → preview modal → confirm → bulk PUT.
- Acceptance: end-to-end test feeds the golden SG xlsx → all 13 sections populated; preview shows expected counts.

**C5. Auto-fill toasts** — `apps/web/src/lib/esg/esgAutofill.ts`
- Runs after `updateSectionCells`; surfaces patch suggestions via toast.
- Acceptance: unit test for sector + SDL rules.

### Phase D — Polish (≤ 2 hours)

**D1. CSS token alignment** — `apps/web/src/styles/esg-glass.css`, `EsgInformationRequest.tsx`
- Add `--esg-section-bg`, `--esg-input-bg`, `--esg-input-border`. Replace `bg-black/20`, `bg-white/[0.02]`.
- Acceptance: visual regression — no remaining green page tint; section panels match B-BBEE `bg-[#141416]`.

**D2. Save button skin** — `EsgWorkbookSectionEditor`, scalar editors
- Neutral grey for Save section; green only for Continue.
- Acceptance: snapshot test.

**D3. Documentation** — `docs/esg/ESG_INPUT_LAYER_PLAN.md` (this file), `docs/esg/ESG_FLOW_ONTOLOGY.md` (rewrite).
- Acceptance: README links updated; ontology rewrite covers all 28 sheets with screenshots.

---

## 10. Test plan

### 10.1 Unit (vitest)
- `EsgScalarForm.test.tsx` — render fields, onTouch fires on edit.
- `EsgMonthlyGrid.test.tsx` — paste 5×9 → cells; YTD recompute; tCO₂e shown.
- `EsgHeadcountGrid.test.tsx` — total col sums; paste 7×10 preserves empty cells (linked to §6).
- `EsgMaturityGrid.test.tsx` — Y → 5 score; Partial → 2.5; No → 0.
- `esgValidationRules.test.ts` — table-driven; assert each rule's pass/warning/error transitions.
- `esgAutofill.test.ts` — sector + SDL + headcount rules.
- `esgWorkbookImport.test.ts` — parse the v1.7 fixture xlsx, assert sections.
- `workbookGridParse.paste.test.ts` — empty-cell preservation (§6.3).
- `tabularNormalize.test.ts` — empty-cell preservation through normalizeMatrix.

### 10.2 Component / persistence
- `EsgInformationRequest.demo.test.tsx` — load demo → re-render → workbook still populated.
- `EsgInformationRequest.paste.test.tsx` — paste into e-data Scope 1A → cells survive section nav.
- `EsgValidationPanel.test.tsx` — untouched workbook shows 0 warnings; touching a field flips the rule.

### 10.3 Server e2e
- `apps/web/server/__tests__/esgWorkbookRoutes.test.ts` — seed-demo writes atomically; import endpoint parses xlsx.

### 10.4 Visual / manual smoke
- Storybook (or `npm run dev`): each editor at /esg/create/:id with empty + populated states. Confirm B-BBEE chrome parity.

---

## 11. Files Composer will touch

### New
1. `apps/web/src/components/esg-workbook/EsgScalarForm.tsx`
2. `apps/web/src/components/esg-workbook/EsgMonthlyGrid.tsx`
3. `apps/web/src/components/esg-workbook/EsgHeadcountGrid.tsx`
4. `apps/web/src/components/esg-workbook/EsgMaturityGrid.tsx`
5. `apps/web/src/components/esg-workbook/EsgRegisterGrid.tsx` (thin wrapper around `SectionWorkbookEditor`)
6. `apps/web/src/components/esg-workbook/EsgSubtabContainer.tsx`
7. `apps/web/src/components/esg-workbook/EsgImportPreviewModal.tsx`
8. `apps/web/src/lib/esg/esgValidationRules.ts`
9. `apps/web/src/lib/esg/esgGridPaste.ts`
10. `apps/web/src/lib/esg/esgAutofill.ts`
11. `apps/web/src/lib/esg/esgWorkbookImport.ts`
12. `apps/web/server/esgGoldenFixture.ts`
13. `apps/web/src/lib/__tests__/esgValidationRules.test.ts`
14. `apps/web/src/lib/__tests__/esgAutofill.test.ts`
15. `apps/web/src/lib/__tests__/esgWorkbookImport.test.ts`
16. `apps/web/src/components/esg-workbook/__tests__/EsgScalarForm.test.tsx`
17. `apps/web/src/components/esg-workbook/__tests__/EsgMonthlyGrid.test.tsx`
18. `apps/web/src/components/esg-workbook/__tests__/EsgHeadcountGrid.test.tsx`
19. `apps/web/src/components/esg-workbook/__tests__/EsgMaturityGrid.test.tsx`
20. `apps/web/src/components/esg-workbook/__tests__/EsgValidationPanel.test.tsx`
21. `apps/web/src/pages/__tests__/EsgInformationRequest.demo.test.tsx`
22. `apps/web/src/pages/__tests__/EsgInformationRequest.paste.test.tsx`

### Modified
- `apps/web/src/components/esg-workbook/EsgWorkbookSectionEditor.tsx` (rewrite as router; ≤ 80 LOC)
- `apps/web/src/components/esg-workbook/EsgValidationPanel.tsx` (re-skin + 4-state logic)
- `apps/web/src/lib/esg/esgValidation.ts` (delegate to rules engine)
- `apps/web/src/lib/esg/esgSections.ts` (add `cover` section; add per-section `editorType` field)
- `apps/web/src/lib/esg/esgGridSections.ts` (no change — column defs already correct)
- `apps/web/EsgToolkit/src/lib/esgStore.ts` (add touched state + load guard)
- `apps/web/src/pages/EsgInformationRequest.tsx` (Import button; demo seed via endpoint; validation panel wiring)
- `apps/web/server/esgWorkbookRoutes.ts` (new seed-demo + import endpoints)
- `apps/web/src/styles/esg-glass.css` (new CSS tokens, drop any green tint)
- `apps/web/src/lib/workbookGridParse.ts` (empty-cell fix per §6.3; only if test fails)
- `apps/web/src/lib/tabularNormalize.ts` (same)
- `apps/web/src/lib/__tests__/workbookGridParse.paste.test.ts` (new tests)
- `apps/web/src/lib/__tests__/tabularNormalize.test.ts` (new tests)
- `apps/web/server/__tests__/esgWorkbookRoutes.test.ts` (extend with seed/import tests)
- `docs/esg/ESG_FLOW_ONTOLOGY.md` (full rewrite — see ontology spec §8)

---

## 12. Blocker risks

1. **Bulk PUT endpoint vs per-section** — Mongo `findOneAndUpdate` with `sections` mixed type is large. If payload > 16MB per doc the update fails. Mitigation: keep per-section PUT calls but wrap demo-seed in a single server-side compose (handled in §4 fix).
2. **xlsx import sheet detection** — the v1.7 sheet names use underscores (e.g. `E_Data`); some prior versions used spaces. Normalise sheet-name lookup (`name.replace(/[\s_]/g, "").toLowerCase()`).
3. **Computed cells in derived sheets** — we store raw inputs; scorecards reflect them via calculators. Ensure `EsgMonthlyGrid` does NOT persist computed YTD/tCO₂e (keep only entered cells; calculator recomputes).
4. **Touched state hydration** — touched is in-memory; refreshing the page clears it. Acceptable for Phase 1 (warnings will re-evaluate as user touches fields). Phase 2 may persist touched to LocalStorage.
5. **Paste handler depth** — `coerceCellValue` for `select` columns runs fuzzy match on empty string; confirm it returns `""` not a suggestion. Test `expect(coerceCellValue("status", { type: "select", options: ["A","B"] }, "")).toBe("")` and patch if needed.
6. **Ontology screenshot embedding** — markdown images in the repo render only in some viewers. Use relative paths (`./screenshots/E_Data.png`). Verify with VS Code preview.

---

## 13. LOC estimate

| Phase | LOC | Hours |
|---|---|---|
| A (plumbing) | ~450 | 4 |
| B (editors) | ~900 | 8 |
| C (paste/upload/panel) | ~600 | 4 |
| D (polish + docs) | ~300 | 2 |
| **Total** | **~2,250** | **~18** |

Within the 2-day budget.

---

## 14. Acceptance checklist for the user

When Composer is done, the user can:

1. Open `/esg/create/<companyId>` and see 14 input sections (Cover, Assumptions, E_Data with 10 sub-tabs, S_Data with 5 sub-tabs, G_Data, EE, Fleet, Waste, Driver_Debrief, ISO_Tracker, King5, IFRS, GARP, SAQ).
2. See no validation ✗ icons until they touch a field, then warnings appear for that field only.
3. Click "Load demo data" and see all 13 sections populated. Navigate to E_Data → S_Data → back to E_Data — data persists.
4. Paste an Excel block with empty cells into E_Data Scope 1A → empty cells preserved, column alignment intact.
5. Click "Import xlsx" → drop the v1.7 golden file → see preview with 28 sheet mappings → confirm → workbook is populated server-side.
6. Click "Continue to Summary" with King5 incomplete → see exactly the blockers panel for the missing principles.
7. Compare page side-by-side with B-BBEE `InformationRequest` — same chrome, same panel design, same paste UX.
8. Read `docs/esg/ESG_FLOW_ONTOLOGY.md` and see each sheet documented with screenshot, formulas, and consumer KPI.
