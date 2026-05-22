# Super Admin + Sector Config — Production Fix Plan

**Companion document**: `docs/SECTOR_TRUTH_LEDGER.md` (canonical truth used as the spec for every fix below).

**Files in scope** (read-only audit — do **not** modify scoring engine math files such as `bbeeScoring.ts`, `constructionScoring.ts`, calculators in `apps/web/Toolkit/src/lib/calculators/*`):

- `apps/api/pipeline/sectorConfig.ts` — pillar weights, targets, level thresholds
- `apps/api/pipeline/constructionIndicators.ts` — Construction indicator matrix (already complete, needs exposure)
- `apps/api/src/routes/sectors.ts` — `/api/sectors`, `/api/sectors/options`, `/api/sectors/:code/:type`
- `apps/api/pipeline/seedOntology.ts` — Arango seeding from sectorConfig
- `apps/api/arango/repositories/sectorRuleRepository.ts` — `StoredSectorRule` shape
- `apps/web/src/pages/SuperAdmin.tsx` — Super Admin "B-BBEE Scorecard Reference" section
- `apps/web/src/pages/Dashboard.tsx` — main dashboard (post-c4a79164 simplified version)
- `apps/web/src/pages/InformationRequest.tsx` — workbook submit flow
- `apps/web/Toolkit/src/pages/ScorecardSummary.tsx` — existing rich summary page in the Toolkit subapp
- `apps/web/Toolkit/src/App.tsx` — Toolkit router (already has `/scorecard-summary` route)

**Out of scope** (separate agents own these):
- Any `apps/api/pipeline/*Scoring*.ts` formula/math file
- Lake Trading test data (`docs/Lake Trading  Toolkit (RCOGP).xlsx`, `docs/LAKE_TRADING_TESTING_GUIDE.md`)
- Deployment / Kubernetes manifests

**Critical order**: each section is tagged P0 (production-blocking), P1 (high-priority for accuracy), P2 (polish / UX).

---

## 1. P0 — Why Super Admin pillar cells appear empty (the user's #1 complaint)

The Super Admin page shows three classes of "empty cell" because of three distinct bugs. Each cause is identified below with the **exact** line / pillar combination affected.

### 1.1 Cause (a) — Indicator rows pulled from `targets` are all-zero for Construction sectors

**Location**: `apps/api/pipeline/sectorConfig.ts` lines 1019–1056 (`ZERO_OWNERSHIP_TARGETS` … `ZERO_ESD_TARGETS`), used by Construction QSE / Contractor / BEP at lines 1080–1138.

**Effect on UI**: in `apps/web/src/pages/SuperAdmin.tsx`, `buildPillarTargetRows()` (line 392) walks `targets[bucketKey]` and only includes rows where the numeric value is `> 0`. For Construction sectors every value is 0, so **every pillar of every Construction sector shows zero indicator rows when expanded** — the user sees the pillar header (e.g. "Skills Development — 26 pts") with no rows underneath.

**Fix** (do not implement yet — plan only):

- **Option A (preferred)**: extend `/api/sectors` to enrich Construction sector configs with a derived `indicators` array sourced from `CONSTRUCTION_SCORECARDS` (already correctly populated in `constructionIndicators.ts`). Update the Arango shape `StoredSectorRule` to add an optional `indicators: Array<{code, name, element, weight, target, targetUnit, calculation, category}>` field, and have `seedOntology.ts` populate it for Construction rows. Then update `SuperAdmin.tsx` `buildPillarTargetRows()` (or add a sibling `buildIndicatorRows()` helper) to prefer `sector.indicators` over `targets[bucketKey]` when present, and group rows by `element`.
- **Option B (fallback)**: keep Super Admin reading `targets`, and back-fill `sectorConfig.ts` Construction `targets` objects with non-zero `*MaxPts` fields that mirror the indicator weights. This is brittle because the legacy `OwnershipTargets` / `MCTargets` interfaces don't map cleanly to Construction's per-indicator structure (e.g. Construction has "Black Other Executive Management" but the interface has only `otherExecBlackMaxPts`).

**Recommended**: Option A. The construction indicator matrix is already authoritative and complete; Super Admin should render it directly.

### 1.2 Cause (b) — `PILLAR_TARGET_KEY` maps two pillars to the same `targets` bucket

**Location**: `apps/web/src/pages/SuperAdmin.tsx` line 311–320:

```ts
const PILLAR_TARGET_KEY: Record<string, string> = {
  ...
  supplierDevelopment: "esd",
  enterpriseDevelopment: "esd",   // ← both pillars dereference the same bucket
  ...
};
```

**Effect on UI**: when the user expands the **Supplier Development** pillar (e.g. RCOGP Generic shows it as 10 pts), the table renders both `sdMaxPts` (10) **and** `edMaxPts` (5) **and** the two ED bonus rows. When the user then expands **Enterprise Development** (7 pts header), the **identical four rows** appear again. The expanded section is misleading and the sum of indicators in either pillar does not match the pillar header.

**Fix**: split the ESD bucket logically in `buildPillarTargetRows()`. Filter the keys by prefix: `supplierDevelopment` pillar should only include keys starting with `sd…`; `enterpriseDevelopment` pillar should only include `ed…` keys. Alternatively, refactor `targets.esd` in `sectorConfig.ts` into `targets.supplierDevelopment` and `targets.enterpriseDevelopment` and update consumers (the scoring engine reads from these too, so check `pipeline/scoring*.ts` — but **do not modify the math** — only the data shape; the math owner can rebase on top).

**Recommended scope for this agent**: do **not** restructure `targets.esd` (touches scoring engine). Instead patch the UI: in `buildPillarTargetRows()` add a per-pillar key-prefix filter.

### 1.3 Cause (c) — Transport Large MC / EE indicator rows are stored under all-zero `*MaxPts` keys

**Location**: `apps/api/pipeline/sectorConfig.ts` lines 831–846 (TRANSPORT_GENERIC `managementControl` and `employmentEquity` targets).

```ts
managementControl: {
  boardBlackMaxPts: 0, boardBWMaxPts: 0,
  execBlackMaxPts: 0, execBWMaxPts: 0,
  ...all zeros...
},
employmentEquity: {
  seniorMaxPts: 0, middleMaxPts: 0, juniorMaxPts: 0,
  disabledMaxPts: 1, disabledTarget: 0.02,
  disabledWomenMaxPts: 1, disabledWomenTarget: 0.01,
},
```

**Effect on UI**:
- The MC pillar header says **29 pts** (from `pillarConfigs.managementControl.maxPoints`) but expanding it shows **zero indicator rows** because every `*MaxPts` is 0.
- The EE pillar header says **0 pts** (`pillarConfigs.employmentEquity.maxPoints = 0`) so the pillar is filtered out of the activeEntries entirely — the user **cannot see the 10 EE rows the canonical toolkit defines**.

**Fix**: per the canonical ledger (`SECTOR_TRUTH_LEDGER.md` §9), Transport Large has **two separate pillars** (MC=11 + EE=18). Action plan:

- In `sectorConfig.ts` `TRANSPORT_GENERIC`:
  - Change `pillarConfigs.managementControl.maxPoints` from **29** → **11**.
  - Change `pillarConfigs.employmentEquity.maxPoints` from **0** → **18**.
  - Populate `targets.managementControl` with the 9 Transport MC rows (Board B/BW 1.5/1.5, Exec Dir B/BW 1/1, Senior Top B/BW 1.5/1.5, Other Top B/BW 1/1, Bonus Independent NEDs 1). Note: the existing `MCTargets` interface does not have a slot for "Bonus Independent NEDs" — either extend the interface or hold it as an extra optional field on TRANSPORT_GENERIC and document.
  - Populate `targets.employmentEquity` with the 10 Transport EE rows (Black Senior 2.5, Black Women Senior 2.5, Black Middle 1.5, Black Women Middle 1.5, Black Junior 1.5, Black Women Junior 1.5, Black Women Semi/Unskilled 2, Disabled 1, Disabled Women 1, Bonus EAP 3). The current `EETargets` interface is too narrow — extend with optional `seniorBWMaxPts`, `middleBWMaxPts`, `juniorBWMaxPts`, `semiUnskilledWomenMaxPts`, `eapBonusMaxPts` fields. **Do not break** RCOGP/ICT/etc. which set these to 0/undefined.
- Total: 24 (Own) + 11 (MC) + 18 (EE) + 15 (Skills) + 20 (PP) + 15 (SD) + 5 (SED) = **108** ✓ unchanged.

### 1.4 Cause (d) — `employmentEquity` row in `CrossSectorTable` is misleading for merged-pillar sectors

**Location**: `apps/web/src/pages/SuperAdmin.tsx` line 287–297 `PILLAR_ORDER` array includes `"employmentEquity"`. For RCOGP, ICT, FSC, AGRI the EE row shows `—` because `maxPoints = 0`. Expert reviewers correctly call this "EE is empty" — the page **looks like** EE was forgotten, when actually EE is structurally part of MC.

**Fix** (UI only):

- In `CrossSectorTable` (line 417), conditionally label the MC row as **"Management Control"** when EE is also a separate pillar (Transport Large/QSE), and as **"Management Control (incl. EE)"** when EE is merged.
- Hide the EE row entirely when all sectors in the table have `employmentEquity.maxPoints === 0`. Render it only when at least one sector has a non-zero EE pillar (Transport Large after fix §1.3; Transport QSE; potentially Construction QSE depending on expert review).
- Optional: when sector has EE > 0 (Transport variants), add a small footer note "Per gazetted Transport Sector Code, MC and EE are scored as separate elements."

---

## 2. P0 — Restore the post-submit Scorecard Summary page

**User quote**: "I still wanted that summary page."

### 2.1 What was lost

Commit `c4a79164` ("Go-live: simplify dashboard…") replaced the 928-line `apps/web/src/pages/Dashboard.tsx` with the current 351-line simplified version. The old Dashboard surfaced a multi-step wizard whose last visible step was labelled **"Summary"** (see old line 72 `{ key: 'summary', label: 'Summary' }`) and then **"Scorecard"**. The simplified Dashboard removed the wizard and now exposes only the **Scorecards list** + **Create Scorecard** button.

Independent of the Dashboard, the **Toolkit subapp** still has a rich Scorecard Summary page at `apps/web/Toolkit/src/pages/ScorecardSummary.tsx` (388 lines, full pillar breakdown, BEE level badge, sub-minimum cards, PDF export). It is reachable inside the Toolkit subapp via its own router at `/scorecard-summary` (see `apps/web/Toolkit/src/App.tsx` line 130).

The bug: after `InformationRequest.tsx` submit (line 697), the app navigates to `/toolkit/scorecard` (the calculator view), not to the summary. End-users land on a calculator screen with no "here is your result at a glance" view.

### 2.2 Restoration plan

Two complementary changes — both low-risk, no scoring math touched:

**(a) Re-wire the post-submit destination** in `apps/web/src/pages/InformationRequest.tsx` line 697:

```ts
// BEFORE
navigate("/toolkit/scorecard");

// AFTER (proposal)
navigate("/toolkit/scorecard-summary?from=submit");
```

The `?from=submit` query param can be used in `ScorecardSummary.tsx` to render a "Submitted successfully" eyebrow above the title.

**(b) Add a Summary entry-point to the simplified Dashboard "View Scorecard" table** in `apps/web/src/pages/Dashboard.tsx` line 305–331 (the action buttons). Today there are three buttons: **View Scorecard** (→ `/toolkit/scorecard`), **Edit Workbook** (→ `/create-scorecard/:id`), **Toolkit** (→ `/toolkit`). Add a fourth button **Summary** (→ `/toolkit/scorecard-summary`) as the leftmost primary action, with the existing "View Scorecard" demoted to secondary.

Alternative consideration: render an inline summary card directly on the Dashboard "Saved Companies" table (using `apps/web/src/components/scorecard/ScorecardPillarSummary.tsx` which already exists and supports restricted/full pillar views). The user's wording — "I still wanted that summary page" — suggests they want a discoverable page, so the entry-point button is the minimum viable fix.

### 2.3 Files to touch (summary)

- `apps/web/src/pages/InformationRequest.tsx` — line 697 navigation target.
- `apps/web/src/pages/Dashboard.tsx` — add Summary button alongside existing actions; optionally inline summary card on home view for recent companies.
- `apps/web/Toolkit/src/pages/ScorecardSummary.tsx` — optionally add a "Submitted successfully" banner when `?from=submit`. **Do not touch** the pillar/score calculations or sub-minimum thresholds in this file.

---

## 3. P1 — `sectorConfig.ts` mismatches vs canonical ledger

Mismatch table — every row is "code value" vs "canonical value" vs source citation. **All canonical values are taken from `docs/SECTOR_TRUTH_LEDGER.md` and its cited sources.**

### 3.1 Transport Large (TRANSPORT_GENERIC) — multiple

| # | Field | Current code value | Canonical value | Source citation | Impact |
|---|---|---|---|---|---|
| T1 | `pillarConfigs.managementControl.maxPoints` | 29 (merged MC+EE) | 11 (MC only) | `Transport Codes.xlsx` Road Freight Large row 22 "Total 11" | Header miscount; expanded view empty |
| T2 | `pillarConfigs.employmentEquity.maxPoints` | 0 (hidden) | 18 (separate pillar) | `Transport Codes.xlsx` Road Freight Large row 33 "Total 18" | Pillar invisible; user can't see EE indicators |
| T3 | `targets.managementControl.*MaxPts` (all 0) | all 0 | Board 1.5/1.5, Exec Dir 1/1, Sr Top 1.5/1.5, Other Top 1/1, Bonus NED 1 | `Transport Codes.xlsx` Road Freight Large rows 23–31 | MC expanded view empty |
| T4 | `targets.employmentEquity` — missing fields | only disabled + disabled-women | needs senior, middle, junior, women equivalents, semi/unskilled women, EAP bonus | `Transport Codes.xlsx` rows 33–43 | EE expanded view almost empty |
| T5 | `targets.ownership` — sum of `*MaxPts` fields | 3 + 2 + 4 + 2 + 1 + 7 + 2 = 21 | 24 — missing: Ownership Fulfilment 1, Bonus ESOP/BBOS 2 | `Transport Codes.xlsx` rows 9, 11 | Header says 24, expanded sum is 21 — 3-pt gap |
| T6 | `targets.procurement.emeMaxPts` = 0 + `qseMaxPts` = 3 | Combined "EME + QSE" row split into two | Single row: "EME + QSE" 3 pts at 10% target | `Transport Codes.xlsx` row 42 (single row) | Splits a row that isn't split in source |
| T7 | `targets.esd.sdMaxPts` = 15 stored under `supplierDevelopment` pillar | Correct value 15 but pillar is labelled `supplierDevelopment` while toolkit labels it `Enterprise Development` | Use a documented label-override to render as "Supplier Development (Transport CoGP labels this as Enterprise Development)" | toolkit row 46 | Labelling confusion only — not a points bug |

### 3.2 Transport QSE (TRANSPORT_QSE) — choose-one display gap

| # | Field | Current code value | Canonical value | Source citation | Impact |
|---|---|---|---|---|---|
| TQ1 | UI rendering of `chooseOneGroup` | not displayed | should show "Elective: choose ONE of 4" badge | `Transport Codes.xlsx` Road Freight QSE rows 19–24 | User sees 28+27+27+25+25+25+25 = 182 in pillar header sums even though `totalPoints` = 107 |
| TQ2 | `targets.managementControl.execBlackMaxPts` = 25 | borrowed an interface field that doesn't semantically match | should be modelled as a Transport-specific row "Top management Black" 25 pts at 50.1% | `Transport Codes.xlsx` Road Freight QSE row 10 | Rendered label may say "Exec Black" instead of "Top management Black" |
| TQ3 | `targets.employmentEquity.{seniorMaxPts,middleMaxPts}` repurposed for "Black management" / "Black employees as % of total" | hijacks Generic EE field names | should be Transport-specific labels | rows 13–16 | Labelling confusion |
| TQ4 | `targets.skills.{learningProgrammesMaxPts:12.5,bursaryMaxPts:12.5}` | semantically "SD on Black employees" / "SD on Black women employees" — labels don't match | should rename or be transport-specific keys | rows 19–20 | Labelling confusion |

### 3.3 RCOGP Generic — minor

| # | Field | Current value | Canonical value | Source | Impact |
|---|---|---|---|---|---|
| R1 | `targets.ownership.economicInterestMaxPts` = 4 + (missing DG row) | DG / ownership-schemes row at 3 pts target 3% is **absent** from `OwnershipTargets` | should expose 3 pts at 3% as a separate field `dgOwnershipSchemeMaxPts` | Ground Truth §3.1 "Economic interest of Black designated groups… 3 pts at 3%" | Header says Ownership 25 but expanded sum = 4+2+4+2+8+2 = 22 (no DG row) — 3-pt gap |
| R2 | UI sub-minimum copy | shows "sub-min 40%" on Ownership badge | should read "sub-min: 40% of Net Value points (3.2 / 8 pts)" | Ground Truth §9 | Misleading wording — expert reviewers will note |

### 3.4 ICT Generic — Skills breakdown vs header

| # | Field | Current value | Canonical value | Source | Impact |
|---|---|---|---|---|---|
| I1 | `pillarConfigs.skillsDevelopment.maxPoints` = 25 vs `targets.skills.*MaxPts` sum | header 25, target rows sum = 15+7+3+0+5 = **30** | header is correct (25); the per-row values appear borrowed from ICT QSE; should be 6+4+4+6+5 = 25 per ICT Generic Excel | Ground Truth §4 + `docs/toolkits/extracted_ICT_Generic.json` | Expanded view sums to 30 but pillar header says 25 — internal inconsistency |
| I2 | `targets.ownership.votingRightsTarget` = 0.30 | ✓ correct (ICT-specific 30% vs RCOGP 25%) | n/a | Ground Truth §4 | No bug — just confirming this is intentional |

### 3.5 FSC Generic — Skills and PP breakdown vs header

| # | Field | Current value | Canonical value | Source | Impact |
|---|---|---|---|---|---|
| F1 | `pillarConfigs.skillsDevelopment.maxPoints` = 23 vs sum of `targets.skills.*MaxPts` = 6+4+4+6+5 = **25** | header 23, rows sum 25 | rows must sum to 23 per FSC Others (e.g. 2+2+3+4+4+1+4+3 from Ground Truth §5) | Ground Truth §5; `docs/toolkits/extracted_FSC_Generic.json` | Expanded view sums to 25, header 23 — internal inconsistency |
| F2 | `pillarConfigs.preferentialProcurement.maxPoints` = 24 vs sum = 5+3+4+9+4+2 = **27** | header 24, rows sum 27 | rows must sum to 24 per FSC Others (e.g. 5+3+2+7+3+2+2 from Ground Truth §5) | Ground Truth §5 | Expanded view 27 vs header 24 — internal inconsistency |
| F3 | FSC sub-sector variants (Banks / LT Insurers / ST Insurers) — completely absent | n/a | Should be modelled as separate `SectorConfig` rows under code "FSC" with `scorecardType: 'Banks'` / `'LTInsurers'` / `'STInsurers'` | Ground Truth §5; FSC docs §174 | Users in financial sub-sectors cannot pick the right scorecard |

### 3.6 AGRI Generic — Skills breakdown

| # | Field | Current value | Canonical value | Source | Impact |
|---|---|---|---|---|---|
| A1 | `targets.skills.*MaxPts` sum | 15+7+3+0+5 = **30** | should be 8+4+4+4+5 = **25** | Ground Truth §6 "Skills 8+4+4+4+5=25" | Pillar header 25 but expanded view sums to 30 |

### 3.7 RCOGP QSE — minor consistency

| # | Field | Current value | Canonical value | Source | Impact |
|---|---|---|---|---|---|
| RQ1 | `targets.managementControl` reuses Generic field names; for QSE only Board + Exec + Other Exec + Disabled apply | seniorMaxPts/middleMaxPts/juniorMaxPts all 0 ✓ but expanded view labels could be cleaner | rename or hide rows where value = 0 | Ground Truth §7 | UI noise only |

### 3.8 Construction QSE / Contractor / BEP — entirely empty when expanded

| # | Field | Current value | Canonical value | Source | Impact |
|---|---|---|---|---|---|
| C1 | All `targets` use ZERO_* constants | every field 0 | should come from `constructionIndicators.ts` indicator weights | `constructionIndicators.ts` + `docs/Construction sector codes.docx` | Every Construction pillar shows **zero** indicator rows when expanded |
| C2 | `levelThresholds` = STANDARD_LEVELS (built for 120-pt total) | 100/95/90/80/75/70/55/40 | unknown — gazette doesn't define Construction-specific level thresholds in workspace docs | n/a — `[UNVERIFIED]` | Wrong level cut-offs for 110/123-pt totals; needs expert input |

### 3.9 Cross-sector — Skills Category cap

| # | Field | Current value | Canonical value | Source | Impact |
|---|---|---|---|---|---|
| X1 | `STANDARD_CATEGORY_WEIGHTINGS` E cap | 0.25 | Ground Truth §16 says "F & G capped at 15% total skills spend" (no E cap) | three-way disagreement: code (E cap 25%, F cap 15%, G no cap weight 0); training pack (F/G capped 15%); domain doc (F & G ≤ 25%) | Skills spend allocations may be over-capped or under-capped depending on which rule the engine applies — flag for expert |

---

## 4. P0/P1 — `/api/sectors` route changes needed

These are derived from the mismatch analysis above. None of them touch scoring math.

### 4.1 P0 — Expose Construction indicator matrix via `/api/sectors`

**File**: `apps/api/src/routes/sectors.ts` lines 23–99 (the `GET /` handler) and `apps/api/pipeline/seedOntology.ts` (the seed function).

**Change**: when seeding Construction sector rows into Arango, additionally include an `indicators` array sourced from `CONSTRUCTION_SCORECARDS` keyed off the sector code + scorecard type:

```
CONSTRUCTION + QSE        → CONSTRUCTION_QSE_SCORECARD.indicators
CONSTRUCTION + Contractor → CONSTRUCTION_CONTRACTOR_SCORECARD.indicators
CONSTRUCTION + BEP        → CONSTRUCTION_BEP_SCORECARD.indicators
```

Update `StoredSectorRule` in `sectorRuleRepository.ts` to include the optional field. Update the AQL `RETURN` clauses in `sectors.ts` lines 43–51 and 67–75 to project `indicators`.

For non-Construction sectors, derive an equivalent `indicators` array from `targets[bucketKey]` rows at seed time (or compute on the fly in the route). This unifies the UI shape so the Super Admin can render one consistent table per pillar.

### 4.2 P1 — Sanitise pillar shape (array vs keyed object) at the API boundary

**File**: `apps/api/src/routes/sectors.ts`.

The current handler returns `pillarConfigs` as an **array** (because Arango stores `StoredPillarConfig[]` — see `sectorRuleRepository.ts` line 19–26), but the front-end normaliser `safePillarConfigs()` in `SuperAdmin.tsx` line 122 supports **both** array and object shapes. The fallback path `getFallbackSectors()` (sectors.ts line 269) only returns `code/name/type/totalPoints` — no pillarConfigs at all — which means **when Arango is down, Super Admin shows pillar headers but NO sub-elements for any sector**.

**Change**: in `getFallbackSectors()`, additionally return the full `pillarConfigs`, `targets`, and `levelThresholds` derived from the in-process `ALL_CONFIGS` registry (already imported on line 15). Otherwise Super Admin degrades to "just a list of sector codes" the moment Arango blips.

### 4.3 P1 — Add a `sectorVariants` endpoint hint

**File**: `apps/api/src/routes/sectors.ts` `GET /options` (line 104).

For FSC, the user-facing dropdown should expose the planned variant set (Banks, LT Insurers, ST Insurers, Others) so future expert work isn't gated on a new API contract. Return them as `availableVariants: ['Banks', 'LongTermInsurers', 'ShortTermInsurers', 'Others']` on the FSC row. Today only "Generic" is available; "Others" is the implicit variant in code.

---

## 5. P1 — Super Admin UI fixes (detailed)

All changes in `apps/web/src/pages/SuperAdmin.tsx`. None require new routes.

### 5.1 Split ESD bucket per pillar (fixes §1.2 + cross-section §3.7)

**Function**: `buildPillarTargetRows()` line 392.

**Change**: when `bucketKey === 'esd'`, additionally filter rows by key prefix:

- `supplierDevelopment` pillar → keep only keys matching `/^sd/` (sdMaxPts, sdPercent, etc.)
- `enterpriseDevelopment` pillar → keep only keys matching `/^ed/` (edMaxPts, edPercent, edGraduationBonus, edJobsBonus)

### 5.2 Hide empty EE row when merged into MC (fixes §1.4)

**Function**: `CrossSectorTable` line 417.

**Change**: filter `PILLAR_ORDER` to drop "employmentEquity" when **every** sector in `ordered` has `safePillarConfigs(s).employmentEquity?.maxPoints === 0`. When at least one sector has a non-zero EE pillar, keep the row but render `—` for the merged-pillar sectors AND add a tooltip/footnote: "EE measured within Management Control."

### 5.3 Re-label MC pillar header per sector

**Function**: `PILLAR_NAMES` line 248 + `SectorTabView` line 585.

**Change**: don't change the global `PILLAR_NAMES`. Instead, in `SectorTabView` derive the MC label from sector context: when the sector has a separate EE pillar (`employmentEquity.maxPoints > 0`), render "Management Control"; otherwise render "Management Control (incl. Employment Equity)". This makes the merged structure explicit without breaking the cross-sector table.

### 5.4 Render "elective — choose one of N" badge on Transport QSE pillars (fixes §3.2 TQ1)

**Function**: `ApiPillarCard` line 464.

**Change**: read `config.chooseOneGroup` (already on PillarConfig); when set, render a small amber badge `"Elective — choose 1 of N"` next to the pillar label. Add a section-level note above the pillar list: "This scorecard requires choosing exactly ONE of 4 elective pillars (Skills / PP / Enterprise Dev / SED) at 25 pts each. The 25 pts is added to the 82-pt compulsory base for a 107-pt total."

### 5.5 Sub-minimum copy precision (fixes §3.3 R2)

**Function**: `ApiPillarCard` line 489 (the sub-minimum amber badge) + line 532 (the inline note).

**Change**: for the Ownership pillar specifically, override the copy to "Sub-minimum: 40% of Net Value (3.2 / 8 pts)" instead of the generic "sub-min 40%". Skills, PP, SD, ED can keep the generic copy. Build a small `getPillarSubMinimumCopy(pillarKey, sectorCode)` helper sourced from §9 of `SECTOR_TRUTH_LEDGER.md`.

### 5.6 Surface internal inconsistencies as warnings (P1 — production debug aid)

**Function**: new `SectorIntegrityWarning` component, rendered inside `SectorTabView`.

**Change**: compute per pillar `headerPoints = config.maxPoints` vs `rowSum = sum(targetRows.points)`. When the two diverge by more than 0.5 (allow for floating point), render an amber warning card: `"⚠ Pillar header reports 25 pts but the sum of indicator rows is 30 pts — data integrity issue, see docs/SUPERADMIN_FIX_PLAN.md §3."`. This makes any future drift visible to operators immediately.

### 5.7 Construction "—" rendering (after §1.1 fix)

Once `/api/sectors` exposes `indicators` for Construction sectors (per §4.1), the Super Admin needs a parallel rendering path. Add `buildIndicatorRows(sector, pillarKey)` that consumes `sector.indicators?.filter(i => i.element === <element-mapped-from-pillarKey>)` and renders columns: Indicator | Pts | Target | Type (main/bonus) | Evidence. Reuse the existing table styling.

Construction element name mapping:
- `ownership` → `ownership`
- `managementControl` → `managementControl`
- `skillsDevelopment` → `skillsDevelopment`
- `supplierDevelopment` (header pillar in Construction sectorConfig) → `enterpriseSupplierDevelopment`
- `socioEconomicDevelopment` → `socioEconomicDevelopment`

(Construction `sectorConfig.ts` uses `supplierDevelopment` for the combined ESD pillar — preserve this mapping in the new helper.)

---

## 6. P0 — Summary page restoration plan (consolidated)

Already detailed in §2. Concrete patch list:

| File | Line | Change |
|---|---|---|
| `apps/web/src/pages/InformationRequest.tsx` | 697 | `navigate("/toolkit/scorecard")` → `navigate("/toolkit/scorecard-summary?from=submit")` |
| `apps/web/src/pages/Dashboard.tsx` | 305–331 (action button group) | Add primary "Summary" button → `/toolkit/scorecard-summary`. Demote "View Scorecard" to secondary. Keep "Edit Workbook" and "Toolkit" as is. |
| `apps/web/Toolkit/src/pages/ScorecardSummary.tsx` | new — top of header section | Optional banner when `useSearch()` query has `?from=submit`: "✓ Workbook submitted. Here is your scorecard at a glance." |

**Do not modify** any of the `calculate*Score()` calls in `ScorecardSummary.tsx` — those imports (`@toolkit/lib/calculators/*`) are part of the scoring engine owned by the other agent.

---

## 7. P2 — Sector documentation cleanup (non-blocking)

`docs/domain/_index.md` line 24 still shows the old "Total = 111 (+9 bonus)" RCOGP breakdown. `docs/domain/calculations/scoring_tables.md` line 29 mirrors that. These two files should be aligned with the verified 120-pt total in `SCORECARD_GROUND_TRUTH.md` to avoid future "which doc is right" confusion. Non-blocking because both files are advisory; the engine reads `sectorConfig.ts`.

---

## 8. Test cases to verify each fix

These are acceptance criteria, not test code (writing tests is out of scope for this agent). The other agent / QA owner should turn each bullet into a passing test before deploy.

### 8.1 Super Admin rendering (manual + integration)

1. Open `/super-admin` → "B-BBEE Scorecard Reference" section. Confirm the cross-sector table shows 11 sectors (RCOGP Gen/QSE, ICT Gen/QSE, FSC Gen, AGRI Gen, Transport Large, Transport QSE, Construction QSE/Contractor/BEP).
2. For every sector, click each pillar in `SectorTabView`. Confirm:
   - The expanded indicator rows are **non-empty** for every pillar with `maxPoints > 0`.
   - The sum of indicator `points` equals the pillar header `maxPoints` (the integrity-warning component from §5.6 must NOT render an amber card on any sector after fixes).
3. For Transport Large and Transport QSE, confirm Employment Equity is a **visible separate pillar** with its indicator rows (10 rows for Large, 5 rows + 1 bonus for QSE).
4. For RCOGP/ICT/FSC/AGRI Generic and QSE, confirm the cross-sector table either hides the EE row or shows it with a `EE measured within MC` tooltip — not a bare `—`.
5. For Transport QSE, confirm the four elective pillars each carry an amber "Elective — choose 1 of 4" badge, and the section header explains the choose-one mechanic.
6. For Construction QSE/Contractor/BEP, click each pillar — confirm indicator rows render with the correct weights from `constructionIndicators.ts` (e.g. Construction Contractor MC must show 17 indicator rows summing to 22 pts).
7. For RCOGP Generic Ownership pillar, the sub-minimum badge reads "40% of Net Value (3.2 / 8 pts)" — not the generic "sub-min 40%".

### 8.2 API contract

8. `GET /api/sectors` with Arango up: response includes `indicators` arrays for Construction rows; each row matches `constructionIndicators.ts` 1-to-1.
9. `GET /api/sectors` with Arango simulated down (kill connection): response returns 200 with `source: 'fallback'`, AND the fallback payload includes `pillarConfigs`, `targets`, `levelThresholds` for every sector (not just code/name/type/totalPoints).
10. `GET /api/sectors/options`: FSC row carries `availableVariants: ['Banks', 'LongTermInsurers', 'ShortTermInsurers', 'Others']` (advisory hint for future variants).

### 8.3 Post-submit summary

11. Complete the workbook flow at `/create-scorecard/<id>` → submit. Confirm browser lands on `/toolkit/scorecard-summary?from=submit`. The summary page shows the BEE level badge, sub-minimum cards, all 8 pillar bars with scores, and an optional "Submitted successfully" banner.
12. From `/dashboard`, the "Summary" button on a saved company opens `/toolkit/scorecard-summary` for that company.

### 8.4 Sector config integrity (data-only)

13. Add a one-shot integrity test in `apps/api/__tests__/sectorConfig.integrity.test.ts` (a new test file is acceptable for the QA agent to author) that iterates every sector in `ALL_CONFIGS` and asserts:
    - `totalMaxPoints === sum(pillarConfigs.<pillar>.maxPoints)` for all pillars with `chooseOneGroup === undefined`
    - For pillars with `chooseOneGroup`, only one pillar per group is added to the sum
    - For every pillar with `maxPoints > 0`, the sum of `targets[bucketKey].*MaxPts` is within 0.5 of `pillarConfigs.<pillar>.maxPoints` (Construction sectors are exempt while ZERO_*_TARGETS is still in place — until §4.1 is implemented).

---

## 9. Implementation ordering (production-blocking first)

1. **P0** — §1.3 Transport Large pillar split (MC=11, EE=18) — affects production immediately because Transport Large customers see wrong pillar shape.
2. **P0** — §1.1 Construction indicator exposure via `/api/sectors` — affects Construction customers who see empty pillar bodies.
3. **P0** — §2 Summary page restoration — directly requested by user.
4. **P0** — §4.2 Fallback payload completeness — prevents Super Admin from going blank on Arango blip.
5. **P1** — §1.2 ESD bucket split in `buildPillarTargetRows()` — fixes duplicate rows in RCOGP/ICT/FSC/AGRI Generic.
6. **P1** — §1.4 + §5.2/5.3 EE row hiding for merged-pillar sectors.
7. **P1** — §3.1 T5 ownership gap + §3.4 ICT Skills + §3.5 FSC Skills/PP + §3.6 AGRI Skills inconsistencies.
8. **P1** — §3.3 R1 RCOGP Ownership DG/ownership-scheme row addition.
9. **P1** — §5.4 Transport QSE elective badge.
10. **P1** — §5.5 Sub-minimum copy precision.
11. **P1** — §5.6 Integrity warning UI component.
12. **P2** — §7 domain doc alignment with Ground Truth.
13. **Expert review (blocking)** — items §3.8 C2 Construction level thresholds; ledger §15 list (Construction QSE source docx, FSC sub-sectors, Skills F/G caps).

---

## 10. Sectors with no canonical source in workspace (flagged for expert)

These are repeated from ledger §15 for visibility:

| Sector / topic | What's missing | Where it would normally live |
|---|---|---|
| Construction QSE | Source docx ("CONSTRUCTION_QUALIFYING_SMALL_ENTERPRISE_(QSE)_SCORECARD") not present | should be under `docs/` |
| Construction level thresholds | Mapping from points → B-BBEE level for 110/123-pt scales | Construction Sector Code gazette, Annex level table |
| FSC Banks / LT Insurers / ST Insurers | None implemented; only "Others" sub-sector exists in code | dedicated FSC sub-sector toolkits |
| Transport Large / Transport QSE level thresholds | No canonical table; placeholder uses linear scaling | Transport Sector Code gazette, Annex level table |
| ICT QSE MC per-row weights | Inferred from extracted JSON; not in any markdown ground-truth doc | ICT QSE Excel toolkit (already in workspace) — needs an authoritative extraction pass |
| RCOGP QSE — Designated Group bonus on PP | Currently 2 pts; not stated explicitly in Ground Truth § for QSE | RCOGP QSE Excel toolkit |
| Skills Category F & G caps | Three-way disagreement: code, training pack, domain doc | Codes of Good Practice, Statement 300 |
| Liquid Fuels / Media / other sector codes | Not implemented; expert TODO from `BBBEE_ONTOLOGY_EXPERT_GUIDE.md` | DTI gazette per sector |

---
