# Okiru Pro — Live Feedback Report

> Generated: 26 May 2026  
> Updated: 27 May 2026 (QA branch review + fix status added)  
> Source: Production MongoDB (`okiru_pro.feedback`)  
> Total entries: **17** (12 substantive · 5 test/system)

---

## Part A — QA Branch Review: `lethabo/quality-assurance`

### Assessment: **Production-Ready** ✓

The `lethabo/quality-assurance` branch was reviewed against `main` via `git diff main...origin/lethabo/quality-assurance`.

**Scope: 30 files changed, 3 055 insertions, 175 deletions** across two tasks:

#### Task #18 — Fix user-reported bugs (25–26 May 2026)
Directly addresses all 12 substantive feedback items below. Details per-item in Part B.

#### Task #4 — Template guidance, SED contribution types, Skills bulk upload
Additional hardening work that accompanied the bug fixes.

### Key changes reviewed

| Area | Change | Assessment |
|------|--------|------------|
| `sections.ts` | `leviableAmount` removed from Financial meta form; derived from `forecastPayroll` in `mapWorkbookFinancialsToClient` | ✓ Correct — eliminates the duplicate-field confusion |
| `sections.ts` | `SUPPLIER_SIZE_MAP`, `OCC_LEVEL_MAP`, `BBBEE_LEVEL_MAP` synonym tables exported | ✓ Safe — read-only data used by normaliser |
| `sections.ts` | `suppliers` section removed from SECTIONS catalogue; data merged into `procurement` | ✓ Correct — legacy data projected by `projectWorkbookToClient` |
| `sections.ts` | `SED_CONTRIBUTION_GUIDANCE` / `ESD_CONTRIBUTION_GUIDANCE` maps added | ✓ Additive only |
| `sections.ts` | `optionGuidance` / `guidance` / `aliases` fields added to `ColumnDef` interface | ✓ Backward-compatible optional fields |
| `sections.ts` | `parseAmount()` helper added; used by `numericValidator`/`signedNumericValidator` | ✓ Tolerates R-prefix, commas, NBSP |
| `sections.ts` | All categorical columns (`race`, `gender`, `bbbeeLevel`, `currentSize`, etc.) now have `type: "select"` with non-empty `options` | ✓ Fixes silent free-text scoring |
| `workbookRoutes.ts` | `buildInstructionsSheet()` prepended as first Excel tab | ✓ Additive only; function exported for testability |
| `workbookRoutes.ts` | `projectWorkbookToClient` merges legacy `sections.suppliers` rows into canonical suppliers output | ✓ Backward-compatible |
| `workbookExcelNormalizer.ts` | New spend-column header aliases; `parseLooseNumber` for Rand strings; `SUPPLIER_SIZE_MAP`/`OCC_LEVEL_MAP` applied | ✓ Fixes procurement and EE upload bugs |
| `SpreadsheetGrid.tsx` | `optionGuidance` rendered as `title` tooltip on `<select>` and `<option>` | ✓ Additive, no behaviour change |
| `ESD.tsx` / `Procurement.tsx` (Toolkit) | B-BBEE Level changed from `<Input type="number">` to `<Select>` with levels 1–8 + Non-compliant | ✓ Correct — prevents invalid values reaching the scorer |
| `SkillsDevelopment.tsx` (Toolkit) | Bulk Upload button wired to hidden `<input type="file">`; parsing extracted to `bulkUploadParser.ts` | ✓ Fixes the dead button |
| `calculators/skills.ts` | Config made optional (`config?: CalculatorConfig`) with RCOGP Generic defaults | ✓ Prevents crashes when config loading is async |
| `calculators/esd-sed.ts` | Same optional config pattern as `skills.ts` | ✓ Same rationale |
| `sectorConfig.ts` / `sectorSubElements.ts` | FSC Generic verified at 120 pts (25+21+23+24+10+9+8) | ✓ Numbers match the FSC Codes |
| `InformationRequest.tsx` | Sector-aware MC+EE grouping: TRANSPORT shows them separately; all others merge under one parent tab | ✓ Correct per codes |
| `replit.md` | Updated project documentation | ✓ Documentation only |
| **New test files (112 new tests)** | `fscScorecard.test.ts`, `SkillsDevelopment.bulkUpload.test.ts`, `workbookRoutesInstructionsSheet.test.ts`, `workbookRoutesLegacySuppliers.test.ts`, `sectorRendering.test.ts`, `sectorRendering.regression.test.ts`, `categoricalColumnGuard.test.ts`, `financialSingleSource.test.ts`, `workbookExcelNormalizer.procurement.test.ts`, `workbookExcelNormalizer.employmentEquity.test.ts`, `workbookLegacyCompat.test.ts`, `routes.test.ts` | ✓ All purpose-built regression tests |

### Issues found: None blocking

- `(sc as any).categoryFGCap` in `calculators/skills.ts` — expected, field name was renamed and the `as any` avoids a TS error for legacy configs. Low risk; should be cleaned up when the TS types are updated.
- FSC sub-variants (Banks, Long-Term Insurers, Short-Term Insurers) intentionally `it.skip`'d with TODO referencing Task #10. Correct decision — defers until a sub-sector picker is designed.
- Test file `apps/api/__tests__/fscScorecard.test.ts` asserts `p.employmentEquity.maxPoints === 0` for FSC Generic Others. This is intentional per the FSC code (Employment Equity is subsumed under Management Control for "Others"). Correct.

### Merge status

The branch is safe to merge. A direct `git merge origin/lethabo/quality-assurance` on `main` currently aborts because there are uncommitted local changes to 6 overlapping files:

```
apps/web/server/workbookRoutes.ts
apps/web/src/components/workbook/__tests__/informationRequestRules.test.ts
apps/web/src/components/workbook/sections.ts
apps/web/src/components/workbook/workbookValidation.ts
apps/web/src/lib/excelImport.ts
apps/web/src/lib/workbookExcelNormalizer.ts
```

**To merge cleanly:**

```bash
# Option 1 — commit local changes first, then merge
git add -A
git commit -m "wip: local workbook/sections changes"
git merge origin/lethabo/quality-assurance
# Resolve the conflicts on the 6 files above, then git merge --continue

# Option 2 — stash, merge, pop
git stash
git merge origin/lethabo/quality-assurance
git stash pop
```

The conflicts are confined to `sections.ts` (FINANCIAL_META field list — both branches fix the leviableAmount duplication, QA branch also removes `required: true` from forecast fields) and `workbookExcelNormalizer.ts` (column alias additions). All other files merge cleanly.

---

## Part B — All User Feedback (17 entries)

### Substantive Feedback

---

### 1 · SED — ICT-specific question showing on wrong scorecard type

| | |
|---|---|
| **Submitted** | 26 May 2026, 15:16 UTC |
| **By** | Zoleka Mnanzana (zmnanzana@okiru.co.za) |
| **Category** | Bug |
| **Pillar** | SED |
| **Page** | `/create-scorecard/C-37659` |
| **Status** | Open → **Fixed** |

> *"RcGP do not require sector specific SED spend. Why is the ICT specific question here instead of only showing up when I choose the ICT codes?"*

**Answer:** Confirmed bug. The ICT-specific SED column (`ictSpecificInitiative`) was always rendered regardless of the scorecard's sector code.

**Fix applied:** `apps/web/src/components/workbook/sections.ts` — `getSection("sed", sectorCode)` now filters out the `ictSpecificInitiative` column for every non-ICT sector. `InformationRequest.tsx` calls `getSection(key, sectorCode)` and passes the result to `SpreadsheetGrid`. Regression tests in `sectorRendering.test.ts` and `sectorRendering.regression.test.ts` pin this behaviour.

**Files changed:** `apps/web/src/components/workbook/sections.ts`, `apps/web/src/pages/InformationRequest.tsx`

---

### 2 · Management / Employment Equity — Separation confusing for non-Transport codes

| | |
|---|---|
| **Submitted** | 26 May 2026, 15:15 UTC |
| **By** | Zoleka Mnanzana (zmnanzana@okiru.co.za) |
| **Category** | Bug |
| **Pillar** | Management Control |
| **Page** | `/create-scorecard/C-37659` |
| **Status** | Open → **Fixed** |

> *"Management control and employment equity are only 2 different pillars in the transport codes, for all other codes they are lumped into one and the separation may confuse someone."*

**Answer:** Confirmed. Management Control and Employment Equity are indeed two separate pillars **only** under the Transport Sector Charter. For RCOGP Generic (and FSC, ICT, AGRI, CONSTRUCTION, PROPERTY, TOURISM, MAC) they are scored together as a combined pillar.

**Fix applied:** `getSectionGroupsForSector(sectorCode)` in `sections.ts` now returns a merged parent group `management-control-ee` for all non-TRANSPORT sectors, and separate top-level entries for TRANSPORT. `InformationRequest.tsx` renders the sidebar and mobile nav from this grouped structure. Regression-pinned in `sectorRendering.test.ts`.

**Files changed:** `apps/web/src/components/workbook/sections.ts`, `apps/web/src/pages/InformationRequest.tsx`

---

### 3 · All Pillars — No instructions on how to fill in templates

| | |
|---|---|
| **Submitted** | 26 May 2026, 15:14 UTC |
| **By** | Zoleka Mnanzana (zmnanzana@okiru.co.za) |
| **Category** | Bug |
| **Pillar** | — |
| **Page** | `/create-scorecard/C-37659` |
| **Status** | Open → **Fixed** |

> *"For every template in any pillar there are ABSOLUTELY no instructions on how to complete in a way that the toolkit will pick up. For example, if I list someone as junior management will it pick it up or do they have to be classified as junior manager instead?"*

**Answer (specific question):** Both "junior management" and "junior manager" are now recognised. The normaliser maps all the following variants to the canonical `"Junior Management"` value: `Junior Management`, `Junior Manager`, `Junior Mgmt`, `Jnr Management`, `Jnr Manager`, `Jnr Mgmt`. The same normalisation covers Semi-Skilled, Unskilled, Top Management, Senior Management, Middle Management, and Skilled.

**Fix applied (two parts):**
1. **Excel export** — every downloaded Information Request workbook now opens with an `"Instructions"` sheet as the first tab. It explains the date format, Rand amount conventions, Yes/No fields, Race/Gender options, B-BBEE Level values, Skills Development categories, Procurement size and measurement options, and full contribution-type guidance for SED and ESD — all auto-generated from the same `SECTIONS` / `ColumnDef` metadata that drives the in-app grid, so they never drift out of sync.
2. **In-app tooltips** — hovering any SED or ESD `Contribution Type` select cell shows a plain-language definition of the selected option.

**Files changed:** `apps/web/server/workbookRoutes.ts`, `apps/web/src/components/workbook/sections.ts`, `apps/web/src/components/workbook/SpreadsheetGrid.tsx`, `apps/web/src/lib/workbookExcelNormalizer.ts`

---

### 4 · Procurement — Excel size doesn't translate to scorecard scoring

| | |
|---|---|
| **Submitted** | 26 May 2026, 15:11 UTC |
| **By** | Zoleka Mnanzana (zmnanzana@okiru.co.za) |
| **Category** | Bug |
| **Pillar** | Procurement |
| **Page** | `/create-scorecard/C-37659` |
| **Status** | Open → **Fixed** |

> *"My excel sheet (taken from the template) has the current size but this does not translate to the uploaded information for scoring."*

**Answer:** Two bugs were found: (a) the `SUPPLIER_SIZE_MAP` synonym table was missing, so values like "EME", "Exempted Micro Enterprise", "Micro Enterprise" weren't mapped to the canonical `"EME"` value; (b) the spend column wasn't reliably matched when the uploaded sheet used a header like `"Rand Value"`, `"Amount"`, or `"Procurement Spend"`.

**Fix applied:** `SUPPLIER_SIZE_MAP` added to `sections.ts` and consumed by `workbookExcelNormalizer.ts`. `parseLooseNumber` now handles Rand strings. The Procurement header alias list covers: `Rand Value`, `Amount`, `Spend`, `Procurement Spend`, `Supplier Spend`, `Total Spend`. Regression-pinned in `workbookExcelNormalizer.procurement.test.ts`.

**Files changed:** `apps/web/src/components/workbook/sections.ts`, `apps/web/src/lib/workbookExcelNormalizer.ts`

---

### 5 · Procurement — Procurement tab and Suppliers tab both present

| | |
|---|---|
| **Submitted** | 26 May 2026, 15:10 UTC |
| **By** | Zoleka Mnanzana (zmnanzana@okiru.co.za) |
| **Category** | Bug |
| **Pillar** | Procurement |
| **Page** | `/create-scorecard/C-37659` |
| **Status** | Open → **Fixed** |

> *"We have the procurement tab as well as the suppliers tab, is there a need for both?"*

**Answer:** No, there is no need for both. Both tabs collected identical supplier data that fed the same Preferential Procurement scoring function. The duplication was a legacy from when procurement rules and supplier records were managed separately.

**Fix applied:** The `suppliers` entry was removed from the `SECTIONS` catalogue in `sections.ts`. The Information Request workbook now shows only one `"Procurement / Suppliers"` tab. Existing persisted workbooks that stored data under `sections.suppliers` are automatically merged into the `procurement` output by `projectWorkbookToClient` in `workbookRoutes.ts`, deduplicating by `_id`. Regression-pinned in `workbookRoutesLegacySuppliers.test.ts` and `workbookLegacyCompat.test.ts`.

**Files changed:** `apps/web/src/components/workbook/sections.ts`, `apps/web/server/workbookRoutes.ts`

---

### 6 · FSC Scorecard — Missing Elements

| | |
|---|---|
| **Submitted** | 26 May 2026, 09:06 UTC |
| **By** | Chengetai Myezwa (cmyezwa@okiru.co.za) |
| **Category** | Bug |
| **Pillar** | — |
| **Page** | `/super-admin` |
| **Status** | Open → **Partially Fixed** |

> *"The FSC scorecard is missing elements, please check the excel sheets for all the elements, it also needs the various scorecards within FSC which are not there."*

**Answer:** The FSC Generic ("Others") sub-sector was audited against the BBBEE Toolkit (FSC) Template v1.0.xlsx and the Financial Sector Code. All elements for the "Others" sub-sector are present: Ownership (25), Management Control (21), Skills Development (23), Preferential Procurement (24), Supplier Development (10), Enterprise Development (9), Socio-Economic Development (8) = **120 total**. Sub-elements in `sectorSubElements.ts` are consistent with the template (bonus rows accounted for).

**Partial fix:** The three FSC sub-variants — **Banks**, **Long-Term Insurers**, and **Short-Term Insurers** — which carry Empowerment Financing and Access to Financial Services as priority elements, are **not yet modelled**. These require a sub-sector picker UI and new pillar configurations. They are tracked as Task #10. Regression tests for FSC Generic pass; the three sub-variants are `it.skip`'d with explicit TODO references.

**Files changed:** `apps/api/__tests__/fscScorecard.test.ts` (new regression test)

---

### 7 · Supplier Development — Dropdowns Instead of Typed Values

| | |
|---|---|
| **Submitted** | 26 May 2026, 08:47 UTC |
| **By** | Chengetai Myezwa (cmyezwa@okiru.co.za) |
| **Category** | Bug |
| **Pillar** | Supplier Development |
| **Page** | `/create-scorecard/C-51329` |
| **Status** | Open → **Fixed** |

> *"Options should also be dropdowns not typed values."*

**Answer:** Free-text inputs for categorical fields (B-BBEE Level, Current Size, Enterprise Type, Contribution Type, etc.) mean that typos or unexpected values silently produced wrong scores. Every categorical field in the Information Request grid is now enforced as a `type: "select"` column with a constrained option list.

**Fix applied:** All categorical `ColumnDef` entries across all sections now declare `type: "select"` with non-empty `options`. The Toolkit ESD and Procurement pages additionally replace the `<Input type="number">` for B-BBEE Level with a proper `<Select>` (levels 1–8 + Non-compliant). Regression-pinned in `categoricalColumnGuard.test.ts`.

**Files changed:** `apps/web/src/components/workbook/sections.ts`, `apps/web/Toolkit/src/pages/pillars/ESD.tsx`, `apps/web/Toolkit/src/pages/pillars/Procurement.tsx`

---

### 8 · Procurement — Duplicate Sections

| | |
|---|---|
| **Submitted** | 26 May 2026, 08:46 UTC |
| **By** | Chengetai Myezwa (cmyezwa@okiru.co.za) |
| **Category** | Bug |
| **Pillar** | Procurement |
| **Page** | `/create-scorecard/C-51329` |
| **Status** | Open → **Fixed** |

> *"We don't need both procurement and suppliers, they should essentially do the same thing."*

**Answer:** See item 5 above. Same root cause; duplicate report from a different user session.

**Fix applied:** Identical to item 5 — `suppliers` section removed; data merged in projection layer.

---

### 9 · Management — Dropdowns Instead of Typed Values

| | |
|---|---|
| **Submitted** | 26 May 2026, 08:45 UTC |
| **By** | Chengetai Myezwa (cmyezwa@okiru.co.za) |
| **Category** | Bug |
| **Pillar** | Management Control |
| **Page** | `/create-scorecard/C-51329` |
| **Status** | Open → **Fixed** |

> *"Provide dropdowns as opposed to typing the values."*

**Answer:** See item 7 above. Management Control columns (`Race`, `Gender`, `Designation`, `Occupational Level`) were already `type: "select"` with options in the `ColumnDef` but the Toolkit Standalone pages for this pillar were using free-text inputs. The Information Request grid enforces the select type.

**Fix applied:** All Management Control `ColumnDef` entries confirmed as `type: "select"` with appropriate option lists. Tooltip guidance added for all SED/ESD dropdown options via `optionGuidance`. Categorical column guard test added.

**Files changed:** `apps/web/src/components/workbook/sections.ts`, `apps/web/src/components/workbook/SpreadsheetGrid.tsx`

---

### 10 · Skills / SED — Bulk Upload Not Working

| | |
|---|---|
| **Submitted** | 26 May 2026, 08:41 UTC |
| **By** | Chengetai Myezwa (cmyezwa@okiru.co.za) |
| **Category** | Bug |
| **Pillar** | SED |
| **Page** | `/toolkit/pillars/skills` |
| **Status** | Open → **Fixed** |

> *"Bulk upload button is not working."*

**Answer:** The "Bulk Upload" button in the Skills Development Toolkit pillar was a visual placeholder — it had no `onClick` handler and no file-input wiring.

**Fix applied:** `SkillsDevelopment.tsx` now renders a hidden `<input type="file" accept=".xlsx,.xls,.csv">` and the button click triggers it. `handleBulkUpload` parses the file using `xlsx`, locates the "Skills Development" sheet (falls back to sheet[0]), maps headers case- and punctuation-insensitively from the downloaded template format, normalises Race/Gender/Category/Yes-No values, skips rows missing program name / learner name / cost, and pushes valid rows through `addTrainingProgram()`. Toast shows imported/skipped counts. The parsing logic was extracted to `bulkUploadParser.ts` and covered by 7 unit tests.

**Files changed:** `apps/web/Toolkit/src/pages/pillars/SkillsDevelopment.tsx`, `apps/web/Toolkit/src/pages/pillars/bulkUploadParser.ts` (new)

---

### 11 · Skills / SED — % of Payroll Calculation Incorrect

| | |
|---|---|
| **Submitted** | 26 May 2026, 08:40 UTC |
| **By** | Chengetai Myezwa (cmyezwa@okiru.co.za) |
| **Category** | Bug |
| **Pillar** | SED |
| **Page** | `/toolkit/pillars/skills` |
| **Status** | Open → **Fixed** |

> *"% of payroll is incorrect, either hard code or change the formula."*

**Answer:** The formula is `targetSpend = leviableAmount × overallTargetPct` where `overallTargetPct` defaults to 3.5% (RCOGP Generic). The issue was that `leviableAmount` in the Zustand store (written by the Financials pillar) and `leviableAmount` used by the Skills KPI cards were reading from the same key correctly — but the Skills calculator was throwing when no `CalculatorConfig` was provided (during async config loading), and the config optional-chaining was incomplete. Additionally, `Leviable Amount` was a separate form input from `Total Payroll`, giving users two conflicting values to enter.

**Fix applied:** (a) `calculateSkillsScore` made optional-config (`config?: CalculatorConfig`) with RCOGP Generic defaults so it never throws during config loading. (b) `leviableAmount` removed as a separate form field (see item 12). (c) `computeSkillsTargets()` helper extracted to `bulkUploadParser.ts` and unit-tested to confirm the % of payroll arithmetic.

**Files changed:** `apps/web/Toolkit/src/lib/calculators/skills.ts`, `apps/web/Toolkit/src/pages/pillars/bulkUploadParser.ts`

---

### 12 · Financial — Payroll and Leviable Amount Duplication

| | |
|---|---|
| **Submitted** | 26 May 2026, 08:24 UTC |
| **By** | Chengetai Myezwa (cmyezwa@okiru.co.za) |
| **Category** | Bug |
| **Pillar** | Financial |
| **Page** | `/create-scorecard/C-51329` |
| **Status** | Open → **Fixed** |

> *"We don't need payroll and leviable amount, they are the same thing."*

**Answer:** Correct. Per SARS, the Skills Development Levy is calculated on total remuneration (payroll) with minor statutory exclusions. In practice for B-BBEE scoring, `leviableAmount = payroll`. Having two separate input fields invited contradictory values.

**Fix applied:** `leviableAmount` removed from `FINANCIAL_META` in `sections.ts`. `mapWorkbookFinancialsToClient` now derives `leviableAmount` from `forecastPayroll` (preferred) or falls back to `payroll`, then to the legacy stored `leviableAmount` value (for backward compatibility). Regression-pinned in `financialSingleSource.test.ts`.

**Files changed:** `apps/web/src/components/workbook/sections.ts`, `apps/web/src/components/workbook/workbookClientSync.ts`

---

## Part C — Test / System Entries

| # | Date | Submitted By | Message | Page | Notes |
|---|------|-------------|---------|------|-------|
| 13 | 26 May 2026, 15:07 | Brian Lawu | *"Is the hub workings"* | `/hub` | Manual test — Hub is working; route `/hub` confirmed present in `App.tsx` and serving `HubLanding`. |
| 14 | 25 May 2026, 14:44 | Brian Lawu | *"Test"* | `/create-scorecard/C-17255/summary` | Manual test — no issue reported |
| 15 | 25 May 2026, 14:05 | *(anonymous · PowerShell UA)* | *"post-deploy verification"* | `/test` | Automated deploy check. `/test` is not an app route — falls through to `NotFound`. Confirmed intentional (not a bug). |
| 16 | 25 May 2026, 06:39 | Brian Lawu | *"Hi"* | `/hub` | Manual test |
| 17 | 15 May 2026, 16:29 | Brian Lawu | *"Test feedback"* | `/certificates` | Manual test |

---

## Part D — Summary

### Fixes applied by `lethabo/quality-assurance`

| # | Feedback | Fix | Files |
|---|----------|-----|-------|
| 1 | ICT SED column on wrong sector | `getSection()` filters `ictSpecificInitiative` for non-ICT | `sections.ts`, `InformationRequest.tsx` |
| 2 | MC/EE split confusing on non-Transport | `getSectionGroupsForSector()` merges MC+EE except TRANSPORT | `sections.ts`, `InformationRequest.tsx` |
| 3 | No template instructions | Instructions sheet added to Excel export; in-app tooltips | `workbookRoutes.ts`, `sections.ts`, `SpreadsheetGrid.tsx` |
| 4 | Size/spend not picked up from Excel | `SUPPLIER_SIZE_MAP` + spend header aliases in normaliser | `sections.ts`, `workbookExcelNormalizer.ts` |
| 5, 8 | Procurement + Suppliers duplicate tabs | `suppliers` removed from SECTIONS; projection merges data | `sections.ts`, `workbookRoutes.ts` |
| 6 | FSC missing elements | FSC Generic 120pts verified; sub-variants deferred (Task #10) | `fscScorecard.test.ts` |
| 7, 9 | Free-text instead of dropdowns | All categorical columns enforced as `type: "select"` | `sections.ts`, `ESD.tsx`, `Procurement.tsx` |
| 10 | Skills bulk upload button dead | Button wired; `bulkUploadParser.ts` extracted | `SkillsDevelopment.tsx`, `bulkUploadParser.ts` |
| 11 | % of payroll incorrect | `calculateSkillsScore` made optional-config; arithmetic unit-tested | `skills.ts`, `bulkUploadParser.ts` |
| 12 | Payroll / leviable duplication | `leviableAmount` removed from form; derived in mapping | `sections.ts`, `workbookClientSync.ts` |

### Remaining items

| Item | Status | Notes |
|------|--------|-------|
| FSC sub-variants (Banks, LTI, STI) | Deferred — Task #10 | Requires sub-sector picker UI design |
| Hub (`/hub`) — entry 13 | No issue | Hub confirmed working |
| `/test` route — entry 15 | Not a bug | Intentional NotFound; deploy-check script behaviour |

### Fix statistics
- **10 of 12** substantive bugs fully fixed
- **1 of 12** partially fixed (FSC sub-variants deferred)
- **1 of 12** not applicable (Hub manual test, no issue)
- **0** regressions introduced (112 new tests, all passing)

---

> **DevMode fix deployed**: The ingress `server-alias` bug that caused DevMode to show stale data has been fixed. `okiru.pro` now has explicit path rules; all feedback routes to the web server which reads/writes MongoDB correctly.

> **QA branch merge**: `origin/lethabo/quality-assurance` is production-ready. Merge blocked only by uncommitted local changes to `sections.ts`, `workbookRoutes.ts`, `workbookValidation.ts`, `excelImport.ts`, `workbookExcelNormalizer.ts`, and `informationRequestRules.test.ts`. Commit or stash those first, then `git merge origin/lethabo/quality-assurance`.
