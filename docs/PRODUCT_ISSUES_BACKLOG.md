# Product Issues Backlog — Chengetai / User Feedback

**Source:** User acceptance feedback (Chengetai), June 2026  
**Repo:** `okiru-pro-main`  
**Status:** Documentation only — no fixes implemented in this pass  
**Last updated:** 2026-06-04

---

## 1. Executive summary

| Area | Issue count | Highest severity themes |
|------|-------------|-------------------------|
| **B-BBEE Input Layer** (Information Request / workbook grids) | 6 | Input race, dropdown/checkbox UX, Age field removal |
| **B-BBEE Toolkit / Calculator** (pillar pages, scoring) | 10 | Skills data loss on recalc, MC designation mismatch, ESD/SED scoring, procurement fields |
| **Cross-cutting** (validation, AI, dates, totals) | 3 | AI suggest vs validation rules; dropdown parity online vs Excel |
| **API / Infrastructure** | 1 | `GET /api/clients/C-LAKE-DEMO/data` → 404 |
| **ESG** (separate product track) | 0 from this feedback | See [ESG_FLOW_ONTOLOGY.md](./esg/ESG_FLOW_ONTOLOGY.md) — no direct overlap with items below |

**Total tracked issues:** **21** (IDs `BBEE-001` … `BBEE-021`)

### Severity legend

| Level | Meaning |
|-------|---------|
| **Critical** | Blocks demo/client workflow or causes data loss |
| **High** | Wrong scores or major UX failure on primary pillars |
| **Medium** | Incorrect or inconsistent UX; workaround often possible |
| **Low** | Polish, alignment, or nice-to-have field layout |

---

## 2. B-BBEE Input Layer issues

Issues affecting **Information Request**, **workbook spreadsheet/form mode**, and shared column metadata (`sections.ts`).

| ID | Area | Summary | Severity | Likely files | Open questions |
|----|------|---------|----------|--------------|----------------|
| **BBEE-001** | Input Layer | First text input is overwritten by the second while typing (suspected race/debounce/stale closure in controlled inputs). | High | `apps/web/src/pages/InformationRequest.tsx` (`MetaForm`), `apps/web/src/components/workbook/SpreadsheetGrid.tsx` (`editValue`, `commitEdit`), `apps/web/src/components/workbook/FormModeGrid.tsx`, `apps/web/src/components/workbook/SectionWorkbookEditor.tsx` | Which surface reproduces it (meta form vs grid vs Toolkit pillar)? Single section or all text fields? |
| **BBEE-002** | Input Layer | Gender, Race, Category, Province need proper dropdown options (consistent labels and full option sets). | High | `apps/web/src/components/workbook/sections.ts` (`RACE_OPTIONS`, `GENDER_OPTIONS`, `SKILLS_CATEGORY_OPTIONS`, `PROVINCE_OPTIONS`, `DESIGNATION_OPTIONS`), `apps/web/Toolkit/src/pages/pillars/ManagementControl.tsx` (`VALID_*` lists differ), `apps/web/Toolkit/src/pages/pillars/SkillsDevelopment.tsx` | Should Toolkit pillar dropdowns exactly match workbook `sections.ts`? Is “Category” skills A–G, employee designation, or ESD category? |
| **BBEE-003** | Input Layer | **Disabled** and **Foreign** should be Yes/No dropdowns, not checkboxes or free text. | Medium | `sections.ts` (`isDisabled`, `isForeign` → `type: "boolean"`), `SpreadsheetGrid.tsx`, `FormModeGrid.tsx`, `InformationRequest.tsx` (`MetaForm`) | Standardise on `Yes`/`No` strings vs boolean `true`/`false` in API/storage? |
| **BBEE-004** | Input Layer | **Completed**, **Employed**, and a third status field should be dropdowns with defined options (not checkboxes). | Medium | `sections.ts` (`employed`, `completed`, `absorbed` as boolean), `SkillsDevelopment.tsx` (checkboxes for completed; `employmentStatus` select), `workbookRoutes.ts` (projects booleans from workbook) | Confirm third field = **Absorbed** (YES path) or another Excel column label. |
| **BBEE-005** | Input Layer | Remove **Age** field — SA ID number encodes age/gender fundamentals. | Medium | `sections.ts` (`age` column on skills grid), `bbbeeInfoRequestRules.json`, `workbookRoutes.ts` (export column list includes `"Age"`), bulk upload tests | Derive age from ID in validation only, or drop from imports entirely? |
| **BBEE-006** | Input Layer | Replace **all checkboxes across toolkits** with Yes/No dropdowns. | Medium | `sections.ts` (many `type: "boolean"`), `SpreadsheetGrid.tsx`, `FormModeGrid.tsx`, `Toolkit` pillar pages (`ManagementControl.tsx`, `SkillsDevelopment.tsx`, `Procurement.tsx`, `Ownership.tsx`, `YES.tsx`, `AccessToFinancialServices.tsx`), build forms (`ESDForm.tsx`, `ProcurementForm.tsx`, etc.) | Scope: workbook only, Toolkit only, or build/upload flows too? |

---

## 3. B-BBEE Toolkit / Calculator issues

Issues affecting **integrated Toolkit pillar UI**, **Zustand store**, and **calculators**.

| ID | Area | Summary | Severity | Likely files | Open questions |
|----|------|---------|----------|--------------|----------------|
| **BBEE-007** | Skills Development | All dates in Skills data need one consistent format (display, import, validation). | Medium | `SkillsDevelopment.tsx` (plain `Input` for `startDate`), `sections.ts` (skills dates `type: "date"` + `dateValidator`), `NumericDateInput.tsx`, `numericDateInput.ts`, `tabularNormalize.ts` | Required canonical format: `DD/MM/YYYY`, ISO `YYYY-MM-DD`, or both with normaliser? |
| **BBEE-008** | Skills Development | Skills development **info disappears when score is calculated** (possible store overwrite on `_recalculateAll` / `loadClientData` / partial API payload). | Critical | `apps/web/Toolkit/src/lib/store.ts` (`loadClientData`, `_recalculateAll`, training program mapping drops fields), `apps/web/Toolkit/src/pages/pillars/SkillsDevelopment.tsx`, `apps/web/server/workbookRoutes.ts` (`projectWorkbookToClient` trainingPrograms), `apps/web/server/routes.ts` (`GET .../data`) | Does data vanish in UI only or also after save/reload? After “Calculate” button or automatic recalc? |
| **BBEE-009** | Skills Development | Spreadsheet **total columns** (e.g. `totalCost`, component costs) must be represented and preserved through import → store → export. | High | `sections.ts` (skills cost columns), `workbookRoutes.ts` (aggregates `totalCost`), `store.ts` (maps only subset: `cost`, `courseCost`, …), `SkillsDevelopment.tsx`, `bulkUploadParser.ts` | Which totals are formula-driven vs user-entered in Excel template? |
| **BBEE-010** | Management Control | MC needs dropdowns wherever possible (designation, province, race, gender, flags). | Medium | `ManagementControl.tsx`, `sections.ts` (`MC_EE_COLUMNS`), `ManagementForm.tsx` | Align Toolkit labels with workbook (`Other Executive Manager` vs `Other Executive Management`) — see BBEE-013. |
| **BBEE-011** | Management Control | MC needs **annual salary total** summary row at top of employee section. | Medium | `sections.ts` (`salary` per row), `ManagementControl.tsx`, `management.ts` calculator (uses headcount, not salary rollup) | Sum all rows or filtered band (e.g. executives only)? |
| **BBEE-012** | Management Control | **Exercisable voting rights of black females** (board band) “bugging” — wrong/zero actuals or broken expand row. | High | `management.ts` (`boardBWOPct`, `votingRights` on board rows), `ManagementControl.tsx` (`statsKeyByName` map), `sections.ts` (`votingRights` column), `store.ts` (employee mapping omits `votingRights`, `province`, etc.) | Failure in Toolkit breakdown table, workbook grid, or both? Sample employee row? |
| **BBEE-013** | Management Control | **Exco members** indicators “bugging” — likely designation label mismatch (`Other Executive Manager` in workbook vs `Other Executive Management` in calculator). | High | `management.ts` (`grouped['Other Executive Management']`), `sections.ts` (`DESIGNATION_OPTIONS`), `workbookRoutes.ts` (`mapDesignation`), `excelImport.ts` (returns `Other Executive Manager`), `lakeTradingWorkbookFixture.ts` (maps labels), `ManagementControl.tsx` (`VALID_DESIGNATIONS`) | Confirm Excel canonical label. Should `combineExcoSenior` affect display? |
| **BBEE-014** | Management Control | **African** not shown/translated as **Black** for B-BBEE demographics (terminology vs scoring). | Medium | `sections.ts` (`RACE_OPTIONS` uses “African”), `tabularNormalize.ts` (`black` → `African`), `workbookRoutes.ts` (`BLACK_RACES`), `foundationApi.ts` / `DocumentProcessor.tsx` (`isBlack` derivation), calculator uses `isBlack` flags | User wants label “Black” in UI while keeping African/Coloured/Indian for EE Act, or merge display only? |
| **BBEE-015** | Procurement | Procurement pillar needs explicit **total spend amount** field (not only per-supplier spend + TMPS on Financials). | Medium | `Procurement.tsx`, `Financials.tsx` (TMPS), `sections.ts` (`spend` per supplier), `procurement.ts` calculator (`tmps` target) | Same as TMPS or separate “total procurement spend” meta field? |
| **BBEE-016** | Procurement | **Registration number** column required next to **VAT** on supplier grid. | Low | `sections.ts` (`PROCUREMENT_COLUMNS` — has `vatNumber`, no `registrationNumber`), `Procurement.tsx` supplier dialog, `types.ts` (`Supplier`) | Company reg vs supplier entity reg? Mandatory for all sectors? |
| **BBEE-017** | ESD / SED | **ED/SD fail to produce results** (zero scores despite contributions). | High | `esd-sed.ts` (`calculateEsdScore`, `categorizeContributions`, NPAT targets), `ESD.tsx`, `SED.tsx`, `store.ts`, `extractionPipeline.ts` / `buildResult.ts`, `client.npat` / deemed NPAT | NPAT zero? Missing `category` on contributions? Calculator config not loaded? |
| **BBEE-018** | ESD / SED | On ESD and SED UI, system **registers ED but not SD** (pillar/category mix-up). | High | `workbookRoutes.ts` (`mapEsdCategory` defaults empty → `supplier_development`; only `enterprise*` → ED), `sections.ts` (`ESD_COLUMNS`, separate `SED_COLUMNS`), `ESD.tsx` (default `supplier_development`), `workbookSectionPillarMap.ts`, `DocumentProcessor.tsx` (SD/ED split filters) | Is bug in workbook submit projection, Toolkit add-contribution, or score breakdown labels? |

---

## 4. Cross-cutting issues

Validation, AI normalisation, dropdown parity, dates, and totals across **online workbook**, **Toolkit**, and **import pipeline**.

| ID | Area | Summary | Severity | Likely files | Open questions |
|----|------|---------|----------|--------------|----------------|
| **BBEE-019** | Validation / AI | AI-suggested field format **differs from validation rules** (import/AI vs `workbookValidation`). | High | `workbookRoutes.ts` (`/api/workbook/suggest-value`), `InformationRequest.tsx` (`MetaForm` + `normalizeCellForColumn` + AI popup), `tabularNormalize.ts`, `workbookValidation.ts`, `selectOptionMatch.ts`, `SpreadsheetGrid.tsx` | Which fields fail most (dates, %, race, designation)? Use AI only after deterministic normalise? |
| **BBEE-020** | Validation / Dropdowns | Dropdown options from **all toolkits** should exist in online version; validation should **train/match** dropdowns (single source of truth). | High | `sections.ts` (canonical options), `bbbeeInfoRequestRules.json`, `selectOptionMatch.ts`, `tabularNormalize.ts`, sector configs under `apps/web/Toolkit/src/lib/sectors/`, ESG: `esgSectionConfigs.ts` / `esgValidation.ts` | One shared `options` package for workbook + Toolkit + API? Include ESG in same pass? |

*Related but listed under pillar sections:* **BBEE-006**, **BBEE-007**, **BBEE-009**.

---

## 5. API / Infrastructure

| ID | Area | Summary | Severity | Likely files | Open questions |
|----|------|---------|----------|--------------|----------------|
| **BBEE-021** | API / Data | `GET /api/clients/C-LAKE-DEMO/data` returns **404** although client appears to exist (missing data bundle / access / seed). | Critical | `apps/web/server/routes.ts` (`loadClientWithAccess`, `GET .../data`), `apps/web/api/[...path].ts` (Vercel handler, `ClientModel.findOne`), `lakeTradingDemoSeed.ts`, `lakeTradingWorkbookFixture.ts` (`LAKE_TRADING_DEMO_CLIENT_ID`), `storage.ts` (demo visibility for `super_admin`), `Toolkit/src/lib/api.ts` | 404 vs 401? Environment (prod tenancy guard vs dev)? Client visible from workbook list but not Mongo `clientId`? After seed, are `shareholders`/`employees` on Client doc or only in Workbook? |

### Investigation notes (BBEE-021)

- **404 causes in `routes.ts`:** client not in DB; **tenant mismatch** (`organizationId` / `createdByUserId`); **legacy client without tenancy in production** (explicit 404).
- **Lake demo:** `C-LAKE-DEMO` seeded via `seedLakeTradingDemo`; pillar arrays populated on **workbook submit** (`projectWorkbookToClient` → Client update), not necessarily on first create.
- **Vercel `api/[...path].ts`:** returns 404 if `ClientModel.findOne({ clientId })` fails; response shape also returns **empty** pillar arrays even when client exists (different symptom than 404).
- **Toolkit `loadClientData`:** expects full bundle from `/data`; failure blocks scoring trace.

---

## 6. ESG (separate track)

No items in the Chengetai list target the ESG toolkit directly. B-BBEE bridge behaviour is documented in:

- **[ESG_FLOW_ONTOLOGY.md](./esg/ESG_FLOW_ONTOLOGY.md)** — sheet/cell ontology, E/S/G pillars, B-BBEE bridge (read-only from B-BBEE structures).
- **[ESG_IMPLEMENTATION_PLAN.md](./esg/ESG_IMPLEMENTATION_PLAN.md)** — engineering phases.

**Overlap with this backlog:** **BBEE-020** (dropdown/validation parity) may later extend to `apps/web/src/lib/esg/esgValidation.ts` and `esgSectionConfigs.ts` if product wants one governance model for all toolkits.

---

## 7. Clarifications needed from product

1. **BBEE-001:** Exact reproduction steps (browser, section, first/second field names).
2. **BBEE-004:** Confirm the third dropdown field (**Absorbed** vs **YES employee** vs **Training outcome**).
3. **BBEE-005:** Accept ID-derived age for validation messages only, or remove age from exports/imports completely?
4. **BBEE-006:** Confirm scope — Information Request only vs entire Toolkit + build wizard + upload processor.
5. **BBEE-008:** “Disappears” = table rows cleared, form reset, or API returns empty `trainingPrograms` after save?
6. **BBEE-014:** Display “Black” as grouping label while keeping African/Coloured/Indian for EE reporting, or change stored values?
7. **BBEE-015:** Is total spend equal to **TMPS** or an additional aggregate field on Procurement page?
8. **BBEE-017 / BBEE-018:** Sample client/sector where ED scores but SD does not; screenshot of contribution rows with category column values.
9. **BBEE-021:** Environment (local/staging/prod), role of user, and whether client list entry is from Mongo or in-memory demo list.
10. **Designation canonical string:** Excel/toolkit authority for **Other Executive Manager** vs **Other Executive Management** (blocks BBEE-012/013).
11. **Date standard:** Single user-facing format across B-BBEE (recommend alignment with `NumericDateInput` / `dateValidator` messages: `DD/MM/YYYY` or `YYYY-MM-DD`).

---

## 8. Suggested fix order

### P0 — Unblock users and stop data/score loss

| Priority | ID | Rationale |
|----------|-----|-----------|
| P0 | **BBEE-021** | Demo client 404 blocks end-to-end testing and Toolkit load. |
| P0 | **BBEE-008** | Data disappearance on calculate undermines trust in Skills pillar. |
| P0 | **BBEE-001** | Input overwrite makes forms unusable. |
| P0 | **BBEE-013** | Designation mismatch breaks Exco/MC scoring (empty `otherExec` group). |
| P0 | **BBEE-017** | ESD/SED zero results invalidate pillar sign-off. |

### P1 — Scoring accuracy and core UX

| Priority | ID | Rationale |
|----------|-----|-----------|
| P1 | **BBEE-012** | Board black female voting rights / breakdown mapping. |
| P1 | **BBEE-018** | SD vs ED registration affects dual sub-minimums. |
| P1 | **BBEE-002** | Dropdown option sets are foundation for BBEE-003/004/006. |
| P1 | **BBEE-019** | Align AI suggest with deterministic validation to reduce reject loops. |
| P1 | **BBEE-009** | Preserve cost totals through projection and store. |
| P1 | **BBEE-020** | Single source of truth for options across surfaces. |

### P2 — Polish and field layout

| Priority | ID | Rationale |
|----------|-----|-----------|
| P2 | **BBEE-003**, **BBEE-004**, **BBEE-006** | Yes/No dropdown standardisation (after option source fixed). |
| P2 | **BBEE-005** | Remove Age column when ID validation sufficient. |
| P2 | **BBEE-007** | Date format consistency. |
| P2 | **BBEE-010**, **BBEE-011** | MC dropdown coverage + salary summary row. |
| P2 | **BBEE-014** | African/Black labelling for verifiers. |
| P2 | **BBEE-015**, **BBEE-016** | Procurement total spend + registration column. |

---

## Appendix A — Code investigation index

| Topic | Primary locations |
|-------|-------------------|
| Skills store / recalc | `apps/web/Toolkit/src/lib/store.ts`, `apps/web/Toolkit/src/pages/pillars/SkillsDevelopment.tsx` |
| MC employees / race / gender / province | `apps/web/Toolkit/src/pages/pillars/ManagementControl.tsx`, `apps/web/src/components/workbook/sections.ts`, `apps/web/Toolkit/src/lib/calculators/management.ts` |
| Procurement suppliers / VAT | `apps/web/src/components/workbook/sections.ts` (`PROCUREMENT_COLUMNS`), `apps/web/Toolkit/src/pages/pillars/Procurement.tsx` |
| ESD / SED contributions | `apps/web/Toolkit/src/lib/calculators/esd-sed.ts`, `apps/web/server/workbookRoutes.ts`, `apps/web/Toolkit/src/pages/pillars/ESD.tsx`, `SED.tsx` |
| `selectOptionMatch` / `tabularNormalize` / grids | `apps/web/src/lib/selectOptionMatch.ts`, `apps/web/src/lib/tabularNormalize.ts`, `SpreadsheetGrid.tsx`, `FormModeGrid.tsx` |
| `/api/clients/:id/data` | `apps/web/server/routes.ts`, `apps/web/api/[...path].ts`, `apps/web/Toolkit/src/lib/api.ts` |
| African vs Black mapping | `tabularNormalize.ts`, `workbookRoutes.ts` (`BLACK_RACES`), `sections.ts` (`RACE_OPTIONS`) |
| LAKE-DEMO | `lakeTradingWorkbookFixture.ts`, `lakeTradingDemoSeed.ts`, `LAKE_TRADING_DEMO_CLIENT_ID = "C-LAKE-DEMO"` |

---

## Appendix B — Issue ID quick reference

| ID | One-line summary |
|----|------------------|
| BBEE-001 | First input overwritten by second |
| BBEE-002 | Gender/Race/Category/Province dropdowns |
| BBEE-003 | Disabled/Foreign → Yes/No dropdowns |
| BBEE-004 | Completed/Employed/(third) → dropdowns |
| BBEE-005 | Remove Age field (use ID) |
| BBEE-006 | All checkboxes → Yes/No dropdowns |
| BBEE-007 | Skills dates consistent format |
| BBEE-008 | Skills data disappears on calculate |
| BBEE-009 | Preserve spreadsheet total columns |
| BBEE-010 | MC more dropdowns |
| BBEE-011 | MC annual salary total row |
| BBEE-012 | Black female board voting rights bug |
| BBEE-013 | Exco members bug (designation mismatch) |
| BBEE-014 | African → Black terminology |
| BBEE-015 | Procurement total spend field |
| BBEE-016 | Registration # next to VAT |
| BBEE-017 | ED/SD no results |
| BBEE-018 | ESD/SED registers ED not SD |
| BBEE-019 | AI format vs validation mismatch |
| BBEE-020 | Online dropdowns + validation parity |
| BBEE-021 | C-LAKE-DEMO `/data` 404 |
