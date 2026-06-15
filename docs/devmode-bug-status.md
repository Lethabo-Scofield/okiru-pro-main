# Okiru Pro — Dev Bug Status

> Generated: 28 May 2026  
> Cross-references `docs/feedback-report.md` against commits merged on 27–28 May 2026.  
> Source of record: production MongoDB (`okiru_pro.feedback`) · 17 entries (12 substantive · 5 test/system)

---

## Summary Table

| Bug # | Description | Status |
|-------|-------------|--------|
| 1 | SED — ICT-specific column showing on wrong sector | ✅ Fixed |
| 2 | MC / EE separation confusing for non-Transport codes | ✅ Fixed |
| 3 | No instructions on how to fill in templates | ✅ Fixed |
| 4 | Procurement Excel size / spend not picked up by scorer | ✅ Fixed |
| 5 | Procurement tab and Suppliers tab both present | ✅ Fixed |
| 6 | FSC scorecard missing elements | 🔄 Partially Fixed |
| 7 | Supplier Development — free-text instead of dropdowns | ✅ Fixed |
| 8 | Procurement duplicate sections (duplicate of #5) | ✅ Fixed |
| 9 | Management Control — free-text instead of dropdowns | ✅ Fixed |
| 10 | Skills bulk upload button not working | ✅ Fixed |
| 11 | % of payroll calculation incorrect | ✅ Fixed |
| 12 | Financial — payroll and leviable amount duplication | ✅ Fixed |

**Fix breakdown: 11 fixed · 1 partially fixed · 0 not yet addressed**  
(Items 5 & 8 are the same root cause; items 7 & 9 are the same root cause.)

---

## Fixed Bugs — Detail

### Bug 1 · SED — ICT-specific column on wrong sector
> *"RcGP do not require sector specific SED spend. Why is the ICT specific question here instead of only showing up when I choose the ICT codes?"*

**What was changed:** `getSection("sed", sectorCode)` in `sections.ts` now filters out the `ictSpecificInitiative` column for every non-ICT sector. `InformationRequest.tsx` calls `getSection(key, sectorCode)` and passes the result to `SpreadsheetGrid`.

**Files:** `apps/web/src/components/workbook/sections.ts`, `apps/web/src/pages/InformationRequest.tsx`  
**Commit:** `lethabo/quality-assurance` merge (`4956e488`) · 27 May 2026  
**Tests:** `sectorRendering.test.ts`, `sectorRendering.regression.test.ts`

---

### Bug 2 · Management Control / EE — split confusing on non-Transport codes
> *"Management control and employment equity are only 2 different pillars in the transport codes."*

**What was changed:** `getSectionGroupsForSector(sectorCode)` in `sections.ts` returns a merged parent group `management-control-ee` for all non-TRANSPORT sectors and separate top-level entries for TRANSPORT only. `InformationRequest.tsx` renders the sidebar and mobile nav from this grouped structure.

**Files:** `apps/web/src/components/workbook/sections.ts`, `apps/web/src/pages/InformationRequest.tsx`  
**Commit:** `lethabo/quality-assurance` merge (`4956e488`) · 27 May 2026  
**Tests:** `sectorRendering.test.ts`

---

### Bug 3 · All Pillars — no instructions on how to fill in templates
> *"For every template in any pillar there are ABSOLUTELY no instructions on how to complete..."*

**What was changed (two parts):**
1. **Excel export:** Every downloaded Information Request workbook now opens with an `"Instructions"` sheet as the first tab — covering date format, Rand conventions, Yes/No fields, Race/Gender options, B-BBEE Level values, Skills categories, Procurement size/measurement, and full SED/ESD contribution-type guidance. Auto-generated from `SECTIONS`/`ColumnDef` metadata so it never drifts out of sync.
2. **In-app tooltips:** Hovering any SED or ESD `Contribution Type` select cell shows a plain-language definition via `optionGuidance` on `ColumnDef`, rendered as `title` attributes in `SpreadsheetGrid.tsx`.

**Files:** `apps/web/server/workbookRoutes.ts`, `apps/web/src/components/workbook/sections.ts`, `apps/web/src/components/workbook/SpreadsheetGrid.tsx`, `apps/web/src/lib/workbookExcelNormalizer.ts`  
**Commit:** `lethabo/quality-assurance` merge (`4956e488`) · 27 May 2026  
**Tests:** `workbookRoutesInstructionsSheet.test.ts`

---

### Bug 4 · Procurement — Excel size / spend not picked up by scorer
> *"My excel sheet has the current size but this does not translate to the uploaded information for scoring."*

**What was changed:** (a) `SUPPLIER_SIZE_MAP` synonym table added — maps `"EME"`, `"Exempted Micro Enterprise"`, `"Micro Enterprise"` etc. to canonical values. (b) `parseLooseNumber` handles Rand-prefix strings. (c) Spend column header aliases added: `Rand Value`, `Amount`, `Spend`, `Procurement Spend`, `Supplier Spend`, `Total Spend`.

**Files:** `apps/web/src/components/workbook/sections.ts`, `apps/web/src/lib/workbookExcelNormalizer.ts`  
**Commit:** `lethabo/quality-assurance` merge (`4956e488`) · 27 May 2026  
**Tests:** `workbookExcelNormalizer.procurement.test.ts`

---

### Bug 5 & 8 · Procurement + Suppliers duplicate tabs
> *"We have the procurement tab as well as the suppliers tab, is there a need for both?"* (×2 reporters)

**What was changed:** `suppliers` entry removed from the `SECTIONS` catalogue in `sections.ts`. The Information Request workbook now shows only one `"Procurement / Suppliers"` tab. Existing persisted workbooks with data under `sections.suppliers` are automatically merged into the `procurement` output by `projectWorkbookToClient` in `workbookRoutes.ts`, deduplicating by `_id`.

**Files:** `apps/web/src/components/workbook/sections.ts`, `apps/web/server/workbookRoutes.ts`  
**Commit:** `lethabo/quality-assurance` merge (`4956e488`) · 27 May 2026  
**Tests:** `workbookRoutesLegacySuppliers.test.ts`, `workbookLegacyCompat.test.ts`

---

### Bug 7 & 9 · Free-text inputs instead of dropdowns (Supplier Dev, Management Control)
> *"Options should also be dropdowns not typed values."* / *"Provide dropdowns as opposed to typing the values."* (×2 reporters)

**What was changed:** All categorical `ColumnDef` entries across all sections now declare `type: "select"` with non-empty `options`. The Toolkit ESD and Procurement pages additionally replace `<Input type="number">` for B-BBEE Level with a proper `<Select>` (levels 1–8 + Non-compliant).

**Files:** `apps/web/src/components/workbook/sections.ts`, `apps/web/src/components/workbook/SpreadsheetGrid.tsx`, `apps/web/Toolkit/src/pages/pillars/ESD.tsx`, `apps/web/Toolkit/src/pages/pillars/Procurement.tsx`  
**Commit:** `lethabo/quality-assurance` merge (`4956e488`) · 27 May 2026  
**Tests:** `categoricalColumnGuard.test.ts`

---

### Bug 10 · Skills bulk upload button not working
> *"Bulk upload button is not working."*

**What was changed:** `SkillsDevelopment.tsx` now renders a hidden `<input type="file" accept=".xlsx,.xls,.csv">` wired to the button. `handleBulkUpload` parses via `xlsx`, finds the "Skills Development" sheet (falls back to sheet[0]), maps headers case- and punctuation-insensitively, normalises Race/Gender/Category/Yes-No values, skips invalid rows, and pushes valid rows through `addTrainingProgram()`. Toast shows imported/skipped counts. Parsing logic extracted to `bulkUploadParser.ts`.

**Files:** `apps/web/Toolkit/src/pages/pillars/SkillsDevelopment.tsx`, `apps/web/Toolkit/src/pages/pillars/bulkUploadParser.ts` (new)  
**Commit:** `lethabo/quality-assurance` merge (`4956e488`) · 27 May 2026  
**Tests:** 7 unit tests in `bulkUploadParser.ts` test suite

---

### Bug 11 · % of payroll calculation incorrect
> *"% of payroll is incorrect, either hard code or change the formula."*

**What was changed (two sub-fixes):**
1. `calculateSkillsScore` (and `calculateEsdScore`, `calculateSedScore`) made optional-config — `config?: CalculatorConfig` — with RCOGP Generic defaults embedded. Previously these threw `"CalculatorConfig is required"` during async config loading, crashing 84 tests and showing wrong values in the UI.
2. `computeSkillsTargets()` helper extracted and unit-tested to confirm `targetSpend = leviableAmount × overallTargetPct` arithmetic is correct.

**Files:** `apps/web/Toolkit/src/lib/calculators/skills.ts`, `apps/web/Toolkit/src/lib/calculators/esd-sed.ts`, `apps/web/Toolkit/src/pages/pillars/bulkUploadParser.ts`  
**Commits:** `lethabo/quality-assurance` merge (`4956e488`) + Task #20 (`2fcd1497`) · 26–27 May 2026  
**Tests:** `skills.test.ts` 21/21 passing (was 0/21); `esd-sed.test.ts` 16/17 passing

> **Follow-ups from Task #20:**
> - **#22** — Make sector configuration consistent across remaining calculators (`management.ts`, `procurement.ts` still throw without config)
> - **#23** — Fix ESD recognition factor for interest-free loans (1 failure in `esd-sed.test.ts`, pre-existing domain assertion)

---

### Bug 12 · Financial — payroll and leviable amount duplication
> *"We don't need payroll and leviable amount, they are the same thing."*

**What was changed:** `leviableAmount` removed from `FINANCIAL_META` in `sections.ts`. `mapWorkbookFinancialsToClient` now derives `leviableAmount` from `forecastPayroll` (preferred) → `payroll` → legacy stored `leviableAmount` (backward compat). One input field instead of two.

**Files:** `apps/web/src/components/workbook/sections.ts`, `apps/web/src/components/workbook/workbookClientSync.ts`  
**Commit:** `lethabo/quality-assurance` merge (`4956e488`) · 27 May 2026  
**Tests:** `financialSingleSource.test.ts`

---

## Partially Fixed

### Bug 6 · FSC Scorecard — missing elements
> *"The FSC scorecard is missing elements, please check the excel sheets for all the elements, it also needs the various scorecards within FSC which are not there."*

**What was done:** FSC Generic ("Others") sub-sector audited against the B-BBEE Toolkit (FSC) Template v1.0 — all 120 points verified (Ownership 25 + MC 21 + Skills 23 + Procurement 24 + Supplier Dev 10 + Enterprise Dev 9 + SED 8). Regression test `fscScorecard.test.ts` pins this.

**What remains:** The three FSC sub-variants — **Banks**, **Long-Term Insurers**, and **Short-Term Insurers** — which carry Empowerment Financing and Access to Financial Services as priority elements, are **not yet modelled**. These require a sub-sector picker UI and new pillar configurations. Tracked as **Task #10**. The three sub-variants are `it.skip`'d in the test suite with explicit TODO references.

**Files changed so far:** `apps/api/__tests__/fscScorecard.test.ts` (new regression test)

---

## Non-Bug Improvements Shipped Today (27–28 May 2026)

### SpreadsheetGrid — Excel-like ghost rows (`506169e1`)
The Information Request grid now behaves like a real spreadsheet:
- **25 blank ghost rows** always visible below the last real row (configurable via `MIN_EMPTY_ROWS`).
- Clicking or typing into a ghost cell **auto-materialises** the row — no "Add Row" button needed.
- Ghost rows are non-destructive: only committed to the data model when content is entered.
- `addRow()` removed (superseded by ghost-row materialisation); `deleteRow()` guarded against ghost indices.
- Virtual scrolling threshold (`VIRTUAL_THRESHOLD`) now based on `displayRowCount` (real + ghost) rather than raw `rows.length`.

**Files:** `apps/web/src/components/workbook/SpreadsheetGrid.tsx`

---

### Admin Rollback Feature (`506169e1`)
Super-admin can now roll back any Kubernetes deployment directly from the `SuperAdmin` page:

- **Backend** (`adminRollbackRoutes.ts`, new): 
  - `GET /api/admin/deployments` — returns `kubectl rollout history` for `web`, `api`, and `compute` deployments, parsed into structured `{ revision, changeReason, timestamp, deployedBy }` objects.
  - `POST /api/admin/rollback` — validates the target deployment and revision, runs `kubectl rollout undo --to-revision=<n>`, logs the action with actor email.
  - Both routes require `super_admin` role.
- **Ingress:** `/api/admin` path now explicitly routed to the web server (not the API backend) in `ingress.yaml`.
- **Frontend** (`SuperAdmin.tsx`): New "Deployment Rollback" section with deployment history table and rollback confirmation flow.

**Files:** `apps/web/server/adminRollbackRoutes.ts` (new), `apps/web/src/pages/SuperAdmin.tsx`, `kubernetes/infrastructure/base/ingress/ingress.yaml`

---

### Certificate Extraction Overhaul (`506169e1`)
`certificateExtractor.ts` was substantially expanded:

- **New fields extracted:** `vatNumber` (SA 10-digit format, must start with `4`), `blackOwnership` %, `blackWomenOwnership` %, `verificationAgency`, `certificateNumber`, `bbbeeScore`.
- **`isValidSupplierName()`** (exported): guards against garbage OCR output (pure numbers, placeholders, < 3 chars, < 2 letters).
- **`cleanNameFromBlobPath()`** (exported): strips UUID upload prefix, date prefixes, trailing size codes (`-EME`, `-QSE-2024`), B-BBEE noise, and applies title-case with protected abbreviations (PTY, LTD, CC, SA, etc.). Returns `null` if not a valid supplier name.
- **3-stage OCR pipeline:** Azure Document Intelligence → pdfjs selectable-text → Tesseract OCR (for fully scanned PDFs). Images run DI → Tesseract.
- **ChromaDB semantic index:** Fire-and-forget indexing after successful extraction (when `CHROMA_*` env vars are set).
- **`processOneCertificate` / `processAllCertificates`:** Updated to persist all new fields; blob-derived name preferred over OCR/LLM for upload-time names.

**Files:** `apps/api/src/services/certificateExtractor.ts`

---

### Certificate Hub UI Revamp (`506169e1`)
- **`LevelBadge` component:** Color-coded inline badge (green → red scale, L1–L8) for B-BBEE level. Shown as a new `Level` column in the certificate list.
- **`MutedDash` component:** Renders an em-dash for missing/unknown values instead of blank cells.
- **Status pills redesigned:** Inline rounded pill badges with color-coded backgrounds (green = valid, amber = expiring, red = expired), shown as a header summary bar.
- **Grid layout updated:** `grid-cols-[2fr_1fr_0.7fr_0.6fr_1fr_1fr_auto]` — new Level column added; columns rebalanced.
- **Alternating row shading:** Even/odd `isEven` prop on `CertRow` for visual separation.
- **CSS brand tokens:** `--cert-brand`, `--cert-brand-hover`, `--cert-brand-dim`, `--cert-brand-muted` injected at `:root`; all brand-colour usages reference variables.
- **Search highlight colour:** Changed from `purple-500/30` to `[#6366f1]/30` (matches brand token).
- **`cleanBlobDisplayName()`:** Client-side companion to the server's `cleanNameFromBlobPath`, used as display fallback when `companyName` is absent.

**Files:** `apps/web/src/pages/CertificateHub.tsx`

---

### FeedbackWidget — Pillar Dropdown (`506169e1`)
The in-app Feedback button now shows a **Pillar / area** dropdown that:
- Auto-infers the current pillar from the URL path (e.g. `/toolkit/pillars/skills` → "Skills Development").
- Allows manual override from all 9 B-BBEE pillar options + "General / Other".
- Sends the selected pillar value with the feedback POST, so future reports can be filtered by pillar without relying solely on the page URL.

**Files:** `apps/web/src/components/FeedbackWidget.tsx`, `apps/web/src/lib/feedbackPillars.ts` (new)

---

### Workbook Validation — Cross-field Financial Rules (`506169e1`)
`workbookValidation.ts` was enhanced:
- `validateFinancialMetaCrossFields()` exported from `sections.ts` and called during workbook validation for the `financial-information` section.
- Field name corrections: `forecastPayroll` → `payroll`, `forecastNpat` → `npat` (aligned with actual form field keys after Bug 12 fix).
- `isCriticalWorkbookIssue()` added: classifies which validation issues block scorecard submission vs. are advisory only. Critical issues: missing `companyName`/`industrySector`/`scorecardType`, missing payroll/NPAT when pillar rows are present, missing voting rights for ownership.

**Files:** `apps/web/src/components/workbook/workbookValidation.ts`, `apps/web/src/components/workbook/sections.ts`

---

### Scorecard Critical Validation — Relaxed Ownership Requirement (`506169e1`)
`scorecardCriticalValidation.ts` previously blocked scorecard calculation if no ownership entities were present. This was too strict — a zero ownership score is valid. The ownership check has been removed; only financials (revenue and NPAT being finite numbers) are now required. `_pillars` and `_pillarScopeFilter` parameters are retained for signature compatibility but no longer used internally.

**Files:** `apps/web/src/lib/scorecardCriticalValidation.ts`

---

### Ingress — Explicit `okiru.pro` Host Rules (`b09db0fd`, `506169e1`)
**Root cause of the DevMode stale-data bug:** nginx `server-alias` does not apply path-based routing rules. `okiru.pro` was a server alias pointing at the nip.io ingress, so all traffic landed at the same backend regardless of path, causing feedback and workbook API calls to miss the web server.

**Fix applied (two-phase):**
1. `b09db0fd` (26 May): Added `/api/feedback` explicit path rule to `ingress.yaml` (base), routing it to `web:5001`; added `okiru.pro` TLS + routing rules in `overlays/prod/patches/ingress-patch.yaml`.
2. `506169e1` (27 May): Added `/api/admin` → `web:5001` rule to cover the new rollback routes; staging overlay added at `overlays/staging/patches/ingress-patch.yaml`.

**Files:** `kubernetes/infrastructure/base/ingress/ingress.yaml`, `kubernetes/infrastructure/overlays/prod/patches/ingress-patch.yaml`, `kubernetes/infrastructure/overlays/staging/patches/ingress-patch.yaml`

---

## Remaining / Deferred Work

| Item | Tracking | Notes |
|------|----------|-------|
| FSC sub-variants: Banks, Long-Term Insurers, Short-Term Insurers | **Task #10** | Requires sub-sector picker UI and 3 new pillar configuration sets |
| Calculator config consistency (`management.ts`, `procurement.ts` still throw) | **Task #22** | Extend the optional-config + defaults pattern from `skills.ts` / `esd-sed.ts` to the remaining calculators |
| ESD recognition factor for interest-free loans | **Task #23** | 1 pre-existing domain assertion failure in `esd-sed.test.ts` |

---

## Test Summary (as of 27 May 2026 merge)

| Suite | Result |
|-------|--------|
| `skills.test.ts` | 21/21 ✅ (was 0/21 before Task #20) |
| `esd-sed.test.ts` | 16/17 ✅ (1 deferred — Task #23) |
| `fscScorecard.test.ts` | FSC Generic passing; 3 sub-variants `it.skip`'d |
| `sectorRendering.test.ts` + `.regression.test.ts` | All passing |
| `categoricalColumnGuard.test.ts` | All passing |
| `financialSingleSource.test.ts` | All passing |
| `workbookRoutesInstructionsSheet.test.ts` | All passing |
| `workbookRoutesLegacySuppliers.test.ts` + `workbookLegacyCompat.test.ts` | All passing |
| `workbookExcelNormalizer.procurement.test.ts` + `.employmentEquity.test.ts` | All passing |
| `bulkUploadParser.ts` unit tests | 7/7 passing |
| `routes.test.ts` | Passing |
| Total new tests shipped with QA branch | **112 tests** |

---

> **Deployed builds:**  
> `6f93c880` (27 May 12:18) — images pinned to `4956e488-202605271218` (current production)  
> Previous: `0563ce22` (27 May 10:52) — images pinned to `b09db0fd-202605271052`
