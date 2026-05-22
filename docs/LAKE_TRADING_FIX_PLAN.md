# Lake Trading Fix Plan — Why the Production Scorecard Returns 19.5 Instead of 63.56

**Audit date:** 2026-05-21
**Auditor scope:** scoring engine only. The sector config (`apps/api/pipeline/sectorConfig.ts`) and the Super Admin UI are out of scope for this plan and are not touched.
**Status:** diagnostic + plan only. No code is changed by this document.

---

## 0. TL;DR

The scoring engine math is **correct**. The two `vitest` suites that exercise the engine directly produce the exact Excel numbers (within rounding):

| Pillar | Excel ground truth | UCS engine output (vitest) |
|---|---|---|
| Ownership | 25.00 | **25.00** |
| Management Control | 11.77 | **11.75** |
| Skills Development | 0.00 | **0.00** |
| Preferential Procurement | 20.33 | **20.33** |
| Supplier Development | 3.69 | **3.69** |
| Enterprise Development | 2.36 | **2.36** |
| Socio-Economic Development | 0.41 | **0.41** |
| **Total** | **63.56** | **63.54** |

The 19.5 the user sees in production does **not** come from the calculators. It comes from the **workbook → client → scoring engine pipeline** silently dropping every field the calculators read except a few. Reconstructed pillar-by-pillar from the broken pipeline:

| Pillar | Production (reconstructed) | Expected | Deficit | Root cause |
|---|---|---|---|---|
| Ownership | **0.00** | 25.00 | −25.00 | `projectWorkbookToClient` never writes `blackOwnership`, `blackWomenOwnership`, `shares`, `shareValue`, `yearsHeld`, `isDesignatedGroup`, `blackNewEntrant`, `companyValue` |
| Management Control | **≈3.0** | 11.77 | −8.77 | `lakeTradingWorkbookFixture` writes "Senior Manager" / "Middle Manager" / "Junior Manager" / "Non-executive Director" / "Other Executive Manager", none of which match the Toolkit's designation enum (`Board`, `Senior`, `Middle`, `Junior`, `Other Executive Management`) |
| Skills Development | 0.00 | 0.00 | 0 | Correct (no training rows) |
| Preferential Procurement | **≈16.0** | 20.33 | −4.33 | Submit drops `enterpriseType` → both suppliers default to `'generic'` → QSE = 0, EME = 0. Only Empowering + BO51 still score |
| Supplier Development | **0.00** | 3.69 | −3.69 | Submit drops `category` from ESD contributions → `categorizeContributions` never matches `'supplier_development'` |
| Enterprise Development | **0.00** | 2.36 | −2.36 | Same as SD — no `category` field |
| Socio-Economic Development | 0.41 | 0.41 | 0 | Accidentally works (no category filter on SED, fallback factor = 1.0) |
| **Total** | **≈19.41 → rounds to 19.5** | **63.56** | **−44.1** | |

So the engine is healthy; the **submit-time projection** (`apps/web/server/workbookRoutes.ts::projectWorkbookToClient`) and the **demo workbook fixture** (`apps/web/src/lib/lakeTradingWorkbookFixture.ts`) together starve the calculators of the data they need.

`workbookClientSync.mapWorkbookFinancialsToClient` is fine for the financials (revenue/NPAT/leviable/TMPS). The destruction happens for shareholders, employees, suppliers, ESD contributions, and (to a lesser degree) SED contributions.

---

## 1. Bugs, by impact

Order: largest divergence first.

### Bug 1 — Ownership projection drops every scoring field (impact: −25.00)

**File:** `apps/web/server/workbookRoutes.ts` (lines ~658–669)

`projectWorkbookToClient` reads the workbook "ownership" rows and writes them to `ClientModel.shareholders` as:

```653:670:apps/web/server/workbookRoutes.ts
  const shareholders = (sec["ownership"]?.rows ?? []).map((r) => ({
    name: s((r as any).shareholderName ?? (r as any).name),
    idNumber: s((r as any).idNumber),
    race: s((r as any).race),
    gender: s((r as any).gender),
    isDisabled: Boolean((r as any).isDisabled),
    isYouth: Boolean((r as any).isYouth),
    votingRights: num((r as any).votingRights),
    economicInterest: num((r as any).economicInterest),
    shareholding: num((r as any).shareholding),
    modifiedFlowThrough: Boolean((r as any).modifiedFlowThrough),
  }));
```

The Toolkit's `calculateOwnershipScore` (`apps/web/Toolkit/src/lib/calculators/ownership.ts`) and the API's `calcOwnership` (`apps/api/pipeline/rules/pillarCalculators.ts`) read `sh.blackOwnership`, `sh.blackWomenOwnership`, `sh.shares`, `sh.shareValue`, `sh.yearsHeld`, `sh.isDesignatedGroup`, `sh.blackNewEntrant`. None of those are written, so the store loader's `|| 0` fallback (`apps/web/Toolkit/src/lib/store.ts:601–609`) makes every value zero:

```605:609:apps/web/Toolkit/src/lib/store.ts
          blackOwnership: sh.blackOwnership || 0,
          blackWomenOwnership: sh.blackWomenOwnership || 0,
          shares: sh.shares || 0,
          shareValue: sh.shareValue || 0,
```

Result: `totalBlackVoting = 0`, no shares → `fullOwnershipAwarded = false`, every sub-line clamps to 0, total = 0.

**Fix (no schema changes):** derive scoring fields from workbook fields inside `projectWorkbookToClient`. The workbook captures `votingRights` (%), `economicInterest` (%), `shareholding` (%), `race`, `gender`, plus optional `isYouth`, `isDisabled`. For each row:

```ts
const isBlackRace = ["African", "Coloured", "Indian"].includes(s((r as any).race));
const isFemale    = s((r as any).gender) === "Female";
const votingPct   = num((r as any).votingRights) / 100;         // 100 → 1.0
const eiPct       = num((r as any).economicInterest) / 100;
const sharePct    = num((r as any).shareholding) / 100;

return {
  name, idNumber, race, gender,
  isDisabled, isYouth,
  votingRights: num((r as any).votingRights),
  economicInterest: num((r as any).economicInterest),
  shareholding: num((r as any).shareholding),
  modifiedFlowThrough,
  // NEW — fields the scoring engine actually reads:
  blackOwnership: isBlackRace ? Math.max(votingPct, eiPct) : 0,
  blackWomenOwnership: isBlackRace && isFemale ? Math.max(votingPct, eiPct) : 0,
  shares: Math.round(sharePct * 10_000) || 0,                   // any integer is fine; only relative weight matters
  shareValue: 1,                                                // unknown until workbook captures it; carrying value defaults to 1
  yearsHeld: 0,
  isDesignatedGroup: Boolean((r as any).isYouth) || Boolean((r as any).isDisabled),
  blackNewEntrant: Boolean((r as any).isNewEntrant),
};
```

This is a pure projection change (no schema migration). Net-value sub-min uses the `totalBlackVoting >= 1.0 ? 8 : ratio` fallback (see `calcOwnership` lines 517–520) so when voting is 100% black, NV still scores full 8/8.

**Side effect on other sectors:** none — `projectWorkbookToClient` is invoked only from the submit handler in `workbookRoutes.ts`, and the receiving calculators all read the same field names regardless of sector.

**Verification test:** new vitest in `apps/web/src/components/workbook/__tests__/workbookClientSync.test.ts` (or a sibling `workbookRoutes.test.ts`) that feeds `buildLakeTradingWorkbookSections()` through `projectWorkbookToClient`, then through `calculateOwnershipScore` with the RCOGP `CalculatorConfig`, and asserts ownership total **≈25**.

**Confidence:** high.

---

### Bug 2 — Designation enums diverge between workbook and scoring engine (impact: −8.77)

**File:** `apps/web/src/lib/lakeTradingWorkbookFixture.ts` (lines 34–61)

```34:42:apps/web/src/lib/lakeTradingWorkbookFixture.ts
const DESIGNATION_TO_WORKBOOK: Record<string, string> = {
  Board: "Non-executive Director",
  "Executive Director": "Executive Director",
  "Other Executive Management": "Other Executive Manager",
  Senior: "Senior Manager",
  Middle: "Middle Manager",
  Junior: "Junior Manager",
};
```

This is also baked into the workbook schema via `DESIGNATION_OPTIONS` in `apps/web/src/components/workbook/sections.ts:38–47`:

```38:47:apps/web/src/components/workbook/sections.ts
const DESIGNATION_OPTIONS = [
  "Executive Director",
  "Non-executive Director",
  "Other Executive Manager",
  "Senior Manager",
  "Middle Manager",
  "Junior Manager",
  "Semi-skilled",
  "Unskilled",
];
```

But every calculator (`apps/web/Toolkit/src/lib/calculators/management.ts:175–187`, `apps/api/pipeline/rules/pillarCalculators.ts:550–558`) groups employees by:

```
Board, Executive, Executive Director, Other Executive Management, Senior, Middle, Junior, Skilled Technical, Semi-skilled, Unskilled
```

Result for Lake demo (12 employees):
- 2 `Non-executive Director` rows → no group (lost from Board) → 0 / 3 board points
- 2 `Executive Director` rows → match → ~3 points (full execDir black + full BWO 0.5 → 2 + 1 = 3 raw, clamps fine)
- 1 `Other Executive Manager` → no group → 0 / 3 OEM points
- 2 `Senior Manager` → no group → 0 / 3 senior points
- 2 `Middle Manager` → no group → 0 / 3 middle points
- 3 `Junior Manager` → no group → 0 / 2 junior points
- 0 disabled → 0 / 2

Total MC ≈ **3.0** vs expected 11.77.

**Fix (preferred — translate at projection time, no UI/schema change):** add a designation alias map inside `projectWorkbookToClient` so the workbook label is converted back into the calculator enum:

```ts
const WORKBOOK_TO_DESIGNATION: Record<string, string> = {
  "Executive Director": "Executive Director",
  "Non-executive Director": "Board",
  "Other Executive Manager": "Other Executive Management",
  "Senior Manager": "Senior",
  "Middle Manager": "Middle",
  "Junior Manager": "Junior",
  "Semi-skilled": "Semi-skilled",
  "Unskilled": "Unskilled",
  // pass-through for direct enum values already used
  Board: "Board",
  Executive: "Executive",
  "Other Executive Management": "Other Executive Management",
  Senior: "Senior",
  Middle: "Middle",
  Junior: "Junior",
  "Skilled Technical": "Skilled Technical",
};

const rawDesig = s((r as any).designation ?? (r as any).occupationalLevel);
const designation = WORKBOOK_TO_DESIGNATION[rawDesig] ?? rawDesig;
```

Apply both for `designation` and `occupationalLevel`.

**Side effect on other sectors:** none — the workbook designation labels are sector-agnostic; the calculators across RCOGP / ICT / FSC / AGRI / TRANSPORT / CONSTRUCTION all key on the same set of strings.

**Verification test:** extend the Lake projection test to assert that after `projectWorkbookToClient`, **at least one** employee per scored level (Board, Executive Director, Senior, Middle, Junior) lands in `grouped[<enum>]`, and that `calculateManagementScore` returns **≈11.77 ± 0.05** for the Lake fixture.

**Confidence:** high (the enum mismatch is mechanical).

---

### Bug 3 — Supplier projection drops `enterpriseType` (impact: −4.33)

**File:** `apps/web/server/workbookRoutes.ts` (lines ~739–773)

`projectWorkbookToClient` writes `currentSize`/`size` ("EME" / "QSE" / "Large") but never sets `enterpriseType`. The store loader (`store.ts:670`) defaults to `'generic'`:

```662:673:apps/web/Toolkit/src/lib/store.ts
        suppliers: (data.procurement?.suppliers || []).map((s: any) => ({
          ...
          enterpriseType: s.enterpriseType || 'generic',
          spend: s.spend || 0,
        })),
```

`calculateProcurementScore` then never increments `qseSpend` or `emeSpend` because those branches require `sup.enterpriseType === 'qse'` / `=== 'eme'`. Lake loses **QSE 0.33 + EME 4.0 = 4.33**.

**Fix:** map `currentSize` → `enterpriseType` inside the supplier projection:

```ts
const sizeRaw = s((r as any).currentSize ?? (r as any).size).trim().toLowerCase();
const enterpriseType =
  sizeRaw === "eme" ? "eme" :
  sizeRaw === "qse" ? "qse" :
  sizeRaw === "large" ? "generic" : "generic";

suppliers.push({
  ...,
  currentSize: s((r as any).currentSize),
  size: s((r as any).currentSize),
  enterpriseType,                       // NEW — calculators read this
  ...
});
```

While you are there, also normalize `beeLevel` to a number — calculators compare with `>= 1`, which works by coercion today, but `getRecognitionMultiplier(beeLevel)` in `procurement.ts:51` looks up `config.recognitionTable.find(e => e.level === beeLevel)` with `===` (strict). Right now this silently misses any config-driven multiplier and falls back to `STANDARD_RECOGNITION_TABLE[beeLevel]` (which forgivingly accepts a string key). Cast once at projection:

```ts
const levelNum = Number(lvl);
const beeLevel = Number.isFinite(levelNum) && levelNum >= 1 && levelNum <= 8 ? levelNum : 0;
```

**Important unit bug to flag (see Bug 7 below):** the projection currently writes `blackOwnership` and `blackWomenOwnership` as **percentages (0–100)** but every calculator expects fractions (0–1). This works for Lake by accident (`100 >= 0.51` is true; `0 >= 0.30` is false). The fix in Bug 3 should normalise them too:

```ts
const blackOwn = num((r as any).currentBlackOwnership);
const blackFemOwn = num((r as any).currentBlackFemaleOwnership);
const blackOwnership = blackOwn > 1 ? blackOwn / 100 : blackOwn;
const blackWomenOwnership = blackFemOwn > 1 ? blackFemOwn / 100 : blackFemOwn;
```

**Side effect on other sectors:** none. All sectors use the same workbook supplier schema.

**Verification test:** extend the Lake projection test to assert procurement total **≈20.33 ± 0.05** after the round-trip.

**Confidence:** high.

---

### Bug 4 — ESD contributions lose their `category` (impact: −3.69 SD, −2.36 ED = −6.05)

**File:** `apps/web/server/workbookRoutes.ts` (lines ~775–797)

```775:787:apps/web/server/workbookRoutes.ts
  const esdContributions = (sec["esd"]?.rows ?? []).map((r) => ({
    supplierName: s((r as any).supplierName),
    currentBlackOwnership: num((r as any).currentBlackOwnership),
    currentSize: s((r as any).currentSize),
    contributionDescription: s((r as any).contributionDescription),
    contributionType: s((r as any).contributionType),
    amount: num((r as any).amount),
    dateOfTransaction: s((r as any).dateOfTransaction),
    invoiceDate: s((r as any).invoiceDate),
    paymentDate: s((r as any).paymentDate),
    primeRate: num((r as any).primeRate),
    actualRate: num((r as any).actualRate),
  }));
```

No `category` field at all. The Toolkit calculator `categorizeContributions` (`esd-sed.ts:107–123`) routes by `c.category === 'supplier_development'` / `'enterprise_development'`. With both undefined, both spends stay at 0 → both pillars score 0.

The workbook also collapses both contribution categories into one sheet (`esd`) with no column to indicate which of SD / ED a row belongs to, so the projection has no way to recover the category from data alone.

**Fix (preferred — split the workbook conceptually without UI change):** the workbook already has an `esd` section, but it represents both SD and ED. The simplest fix is to add a single column `esdCategory` (values: `Supplier Development` | `Enterprise Development`) to the workbook ESD section in `sections.ts`, and in projection map it to the calculator's expected `category` value:

```ts
const esdContributions = (sec["esd"]?.rows ?? []).map((r) => {
  const rawCat = s((r as any).esdCategory).toLowerCase();
  const category =
    rawCat.startsWith("supplier") ? "supplier_development" :
    rawCat.startsWith("enterprise") ? "enterprise_development" :
    "supplier_development";              // safe default → still counts toward SD sub-min
  const rawType = s((r as any).contributionType).toLowerCase().replace(/\s+/g, "_");
  const type =
    rawType.includes("grant") ? "grant" :
    rawType.includes("direct") ? "direct_cost" :
    rawType.includes("loan") && rawType.includes("interest_free") ? "interest_free_loan" :
    rawType.includes("loan") ? "standard_loan" :
    rawType.includes("discount") ? "discounts" :
    rawType.includes("professional") ? "professional_services_free" :
    rawType.includes("guarantee") ? "guarantees" :
    "direct_cost";
  return {
    beneficiary: s((r as any).supplierName),
    type,
    category,                            // NEW — calculator filter
    amount: num((r as any).amount),
    // ...legacy fields kept for audit
  };
});
```

(For the Lake demo workbook seed, populate the new `esdCategory` column from `lakeTradingPillars.esd.contributions[i].category`.)

**Important parity note:** the Toolkit calculator's contribution `type` field (`grant`, `direct_cost`, etc., see `ESD_BENEFIT_FACTORS` in `esd-sed.ts:17–33`) does not match the human-friendly workbook labels (`"Grant Contribution"`, `"Other Monetary"`, etc.). Without the snake-case mapping above, every contribution silently uses the fallback factor 1.0. Lake happens to need 1.0 (direct cost), but this would tank an ICT or AGRI client whose contributions are loans, guarantees, or interest-free advances.

**Side effect on other sectors:** none — adding a column is additive and any client without a category still gets the safe default. Mapping `contributionType` strings is sector-independent.

**Verification test:** assert `calculateEsdScore(projection, NPAT=33_862_998, RCOGP_config)` returns `sdTotal ≈ 3.69` and `edTotal ≈ 2.36` for the Lake fixture.

**Confidence:** high for the missing `category`; medium for the `type` mapping table (the canonical list of contribution types should be cross-checked against the spec but the keys used in `ESD_BENEFIT_FACTORS` are the authoritative source today).

---

### Bug 5 — SED contribution `type` mapping silently uses fallback factor (impact: 0 for Lake, latent for other clients)

**File:** `apps/web/server/workbookRoutes.ts` (lines ~789–797)

```789:797:apps/web/server/workbookRoutes.ts
  const sedContributions = (sec["sed"]?.rows ?? []).map((r) => ({
    beneficiaryName: s((r as any).beneficiaryName),
    descriptionOfSpend: s((r as any).descriptionOfSpend),
    ictSpecificInitiative: Boolean((r as any).ictSpecificInitiative),
    contributionType: s((r as any).contributionType),
    percentBenefitingBlack: num((r as any).percentBenefitingBlack),
    amount: num((r as any).amount),
    dateOfTransaction: s((r as any).dateOfTransaction),
  }));
```

The store loader expects `c.type` and `c.beneficiary` (see `store.ts:696–703`), not `contributionType` and `beneficiaryName`. The Lake demo accidentally still scores SED = 0.41 because (a) SED has no `category` filter, and (b) when `c.type` is undefined `SED_BENEFIT_FACTORS[undefined]` returns undefined → `?? 1.0` fallback → grant is correctly weighted 1.0.

Any future SED with a non-1.0 factor (loans, professional services, etc.) will silently mis-score.

**Fix:** mirror the ESD type mapper:

```ts
const sedContributions = (sec["sed"]?.rows ?? []).map((r) => {
  const rawType = s((r as any).contributionType).toLowerCase().replace(/\s+/g, "_");
  const type =
    rawType.includes("grant") ? "grant" :
    rawType.includes("discount") ? "discounts" :
    rawType.includes("professional") ? "professional_services_free" :
    rawType.includes("human") ? "employee_time" :
    "grant";
  return {
    beneficiary: s((r as any).beneficiaryName),
    type,
    amount: num((r as any).amount),
    // ...legacy fields kept
  };
});
```

**Side effect on other sectors:** none — same as Bug 4.

**Verification test:** add SED rows of types other than `Grant Contribution` to a synthetic fixture; assert factor is applied per the table in `SCORECARD_GROUND_TRUTH.md §13`.

**Confidence:** high.

---

### Bug 6 — `loadClientData` doesn't read every field the projection writes (impact: latent ≈0 for Lake, real for other clients)

**File:** `apps/web/Toolkit/src/lib/store.ts:601–703`

Even after Bugs 1–5 are fixed at the projection level, `loadClientData` re-filters to a minimal shape. For example:

```js
shareholders: (data.ownership?.shareholders || []).map((sh: any) => ({
  id, name, ownershipType,
  blackOwnership, blackWomenOwnership, shares, shareValue,
}))
```

Drops `yearsHeld`, `isDesignatedGroup`, `blackNewEntrant`, `votingRightsPercent`, `economicInterestPercent`. Those are required by `calculateOwnershipScore` (see lines 96–100 in `ownership.ts`) — without them the calculator can't award Designated Groups, New Entrants, or apply the graduation factor.

Similarly the suppliers mapper drops `isEmpoweringSupplier`, `isForeignSupplier`, `isBlackOwned51`, `isBlackWomanOwned30`, `isDesignatedGroup`. The contributions mapper drops `benefitFactor`.

**Fix:** extend the `loadClientData` mappers to pass through every field the calculators read. This is purely additive (no removal). Concrete diff:

```ts
shareholders: (data.ownership?.shareholders || []).map((sh: any) => ({
  id: sh.id, name: sh.name, ownershipType: sh.ownershipType || 'shareholder',
  blackOwnership: sh.blackOwnership || 0,
  blackWomenOwnership: sh.blackWomenOwnership || 0,
  shares: sh.shares || 0,
  shareValue: sh.shareValue || 0,
  yearsHeld: sh.yearsHeld || 0,
  isDesignatedGroup: Boolean(sh.isDesignatedGroup),
  designatedGroupType: sh.designatedGroupType,
  blackNewEntrant: Boolean(sh.blackNewEntrant),
  votingRightsPercent: sh.votingRightsPercent ?? sh.blackOwnership ?? 0,
  economicInterestPercent: sh.economicInterestPercent ?? sh.blackOwnership ?? 0,
})),
```

Plus `yearsHeld` and `companyValue` need to be read from the ownership envelope (already partially done at `store.ts:610–616`, but `yearsHeld` is hard-coded to 0 in the API at `routes.ts:1595` — keep that in mind for verification).

**Side effect on other sectors:** none — additive only.

**Verification test:** unit test on `loadClientData` that passes a full shareholder payload and verifies every field is preserved.

**Confidence:** high.

---

### Bug 7 — `currentBlackOwnership` unit mismatch (impact: latent, masks real BO51/BWO30 errors)

**File:** `apps/web/src/lib/lakeTradingWorkbookFixture.ts:64–66` and `apps/web/server/workbookRoutes.ts:746–762`

```64:66:apps/web/src/lib/lakeTradingWorkbookFixture.ts
function pct100(fraction: number): number {
  return fraction <= 1 ? Math.round(fraction * 10000) / 100 : fraction;
}
```

Workbook stores ownership as **percentage 0–100**. `projectWorkbookToClient` passes that number through unchanged (`blackOwnership: blackOwn`). All calculators (`procurement.ts:126`, `pillarCalculators.ts:691–692`) compare against fractions:

```js
if (sup.blackOwnership >= 0.51) ...
if (sup.blackWomenOwnership >= 0.30) ...
```

`100 >= 0.51` is true → Lake's all-black suppliers still count for BO51. But:
- A `currentBlackOwnership = 30` (which the workbook means 30%) becomes `30 >= 0.51 → true` → wrongly counted as ≥51% black-owned. A 30%-black-owned supplier inflates BO51 spend.
- `currentBlackFemaleOwnership = 5` (5%) becomes `5 >= 0.30 → true` → wrongly counted as BWO30.

So the BO51 / BWO30 / DG categories silently over-count for any non-100%, non-0% supplier. This is the single most dangerous latent bug — it will give clients credit they don't deserve in procurement.

**Fix:** normalise once at projection (and at the equivalent shareholder projection in Bug 1):

```ts
const blackOwnership = blackOwn > 1 ? blackOwn / 100 : blackOwn;
const blackWomenOwnership = blackFemOwn > 1 ? blackFemOwn / 100 : blackFemOwn;
```

**Side effect on other sectors:** improves correctness across all sectors that use the workbook submit path.

**Verification test:** feed a supplier with `currentBlackOwnership = 30` and assert that `bo51Spend` excludes it; feed one with `currentBlackOwnership = 75` and assert it is included.

**Confidence:** high.

---

### Bug 8 — `loadClientData` defaults `beeLevel` to `4`, hiding non-compliant suppliers (impact: latent)

**File:** `apps/web/Toolkit/src/lib/store.ts:665`

```js
beeLevel: s.beeLevel || 4,
```

If a workbook supplier has no B-BBEE level (or "Non-compliant"), the loader silently treats them as Level 4 (100% recognition). Procurement is then inflated. Lake suppliers all have explicit Level 1 / 4, so the bug is silent for Lake, but real for production data.

**Fix:** default to `0` (non-compliant); leave the calculator's recognition multiplier of 0 to do the right thing.

```ts
beeLevel: Number(s.beeLevel) || 0,
```

**Side effect on other sectors:** improves correctness across all sectors.

**Verification test:** supplier with `beeLevel: ""` ⇒ recognised spend = 0.

**Confidence:** high.

---

### Bug 9 — UCS engine returns `beeLevel` without applying the sub-minimum discount (impact: test failure, score is correct)

**File:** `apps/api/pipeline/rules/calculationEngine.ts:1182–1212` (the second `determineLevel` is `pillarCalculators.calculateAllPillars` which sets `beeLevel` and `discountedLevel` separately, then the caller — `calculationEngine.ts:1499–1530` — never threads `discountedLevel` into the returned `ScorecardResult.beeLevel`).

Lake test failures in `apps/api/pipeline/__tests__/lakeTradingUCS.test.ts`:

```
× B-BBEE Level: 8 (discounted from 7 — Skills sub-minimum failed)
  → expected 7 to be 8
```

`calcAllPillars` returns `{ beeLevel: 7, discountedLevel: 8, isDiscounted: true }`. The simplified `calculateScorecard` factory in `calculationEngine.ts:1519–1530` returns `result.beeLevel` (= 7) and ignores `discountedLevel`. The test (and downstream consumers) expects the discounted value.

This does not contribute to the 19.5 issue but it does mean the API's reported level is wrong by one step whenever any pillar fails its sub-minimum.

**Fix:** in `calculationEngine.ts::calculateScorecard` (the second one, line ~1427), replace `beeLevel: result.beeLevel` with the discounted value when applicable:

```ts
beeLevel: result.isDiscounted ? result.discountedLevel : result.beeLevel,
```

(Or expose both; pick one contract and stick to it.)

**Side effect on other sectors:** UCS API consumers will start seeing discounted levels — desired behaviour per spec.

**Verification test:** the existing `lakeTradingUCS.test.ts` will go green.

**Confidence:** high.

---

### Bug 10 — UCS engine simplified path returns no `ontologySnapshot`, no per-criterion breakdown, and no `enterpriseSupplierDevelopment` aggregate pillar (impact: test failures, no scoring impact)

**File:** `apps/api/pipeline/rules/calculationEngine.ts:1427–1533`

The "simplified" `calculateScorecard` (the one the UCS tests call) returns `pillars` with a single synthetic `*-total` criterion (`toPillarResult` line 1411–1424), no `ontologySnapshot`, and no combined ESD pillar. The UCS test expects:

- `result.ontologySnapshot.zeroScorePillars.includes('skillsDevelopment')`
- `result.pillars.find(p => p.pillarCode === 'enterpriseSupplierDevelopment')` with `criteria` containing `ESD-SD` and `ESD-ED`
- `result.subMinimums['enterpriseSupplierDevelopment'] === true`

These are contract gaps between the calculator and the test, not math bugs. The full `CalculationEngine.calculateScorecard()` (line 1016) does produce all of these, but the simplified factory bypasses it.

**Fix options (pick one):**
1. Wire the simplified path through `CalculationEngine.calculateScorecard()` so it returns an ontology snapshot and pillar-criterion breakdown.
2. Update the test to match the simplified contract.

Recommend (1) because ontology snapshots are used by AI guidance downstream.

**Side effect on other sectors:** none — additive metadata.

**Verification test:** the existing `lakeTradingUCS.test.ts` will go green for the remaining 6 failing tests.

**Confidence:** medium — needs design judgement on which path is canonical.

---

## 2. Does the scoring engine actually read sector config?

Yes — both halves do, when given valid inputs:

- **Toolkit (frontend) calculators** (`apps/web/Toolkit/src/lib/calculators/*.ts`): every target, max-points and sub-minimum-percent value is read from `CalculatorConfig` (loaded via `loadCalculatorConfig` → `/api/clients/:id/calculator-config` → fallback `/api/scorecard/sector-config/:sector/:type`). Hardcoded numbers exist only as `??` fallbacks (eg `cfg?.otherExecBlackTarget ?? 0.60`) — they kick in only when the config is missing a field, which should not happen for the sectors in `sectorConfig.ts`.
- **API pillar calculators** (`apps/api/pipeline/rules/pillarCalculators.ts`): same story — `cfg.pillarConfigs[*].maxPoints`, `cfg.targets.procurement.bo51Target`, etc. are all sector-config-driven.

The `STANDARD_RECOGNITION_TABLE` in `procurement.ts:10–13` is the one hard-coded artefact that isn't sector-config-driven, but the calculator does check `config.recognitionTable` first — so the override path exists.

**Conclusion:** sector config is correctly consumed. The engine is not the source of the divergence. Bug 9 in `calculationEngine.ts` (using `result.beeLevel` instead of `discountedLevel`) is the only place a config-derived value is partially ignored, and even that one is independent of the 19.5 vs 63.56 gap.

---

## 3. Does `workbookClientSync` drop fields?

`mapWorkbookFinancialsToClient` (the file the user named `workbookClientSync.ts`) is correct for the financials it owns: it returns `revenue`, `npat`, `leviableAmount`, `tmps`, `industrySector`, `scorecardType`, `annualTurnover`. The unit test `workbookClientSync.test.ts` covers those and passes.

The actual dropping happens in **`projectWorkbookToClient`** (`apps/web/server/workbookRoutes.ts::653–802`), which is the rest of the projection (shareholders / employees / suppliers / contributions). That function is the locus for Bugs 1, 3, 4, 5.

It is therefore accurate to say: **`workbookClientSync.ts` does not drop fields, but the sibling `projectWorkbookToClient` in `workbookRoutes.ts` drops most of the scoring-relevant fields for ownership, suppliers and ESD/SED contributions.**

---

## 4. Does the Lake Trading test fixture match ground truth?

Yes for the canonical test (`apps/api/pipeline/__tests__/lakeTradingUCS.test.ts`):
- `FINANCIALS` matches §17 (NPAT 33 862 998, Revenue 274 953 097, Leviable 2 069 572, TMPS 133 730 345.99, headcount 12).
- `EMPLOYEES` mirrors `lakeTradingEmployees` from `apps/web/src/lib/lakeTradingDemo.ts`.
- `SUPPLIERS` mirror the procurement fixture.
- `CONTRIBUTIONS` mirror the SD/ED/SED amounts (250 000 / 160 000 / 27 500).
- `EXPECTED` numbers match §17.

The only mismatches in the test versus the actual engine output (verified by running it):
- Test expects `result.beeLevel === 8` (the discounted value). Engine returns `7`. → Bug 9.
- Test expects a combined `enterpriseSupplierDevelopment` pillar with `ESD-SD` and `ESD-ED` criteria. Engine returns separate `supplierDevelopment` + `enterpriseDevelopment` pillars. → Bug 10.
- Test expects `result.ontologySnapshot`. The simplified `calculateScorecard` factory doesn't build one. → Bug 10.

`lakeTradingDemo.ts::lakeTradingExpectedScores` and `lakeTrading.test.ts::EXCEL_SCORES` are both accurate.

`lakeTradingWorkbookFixture.ts` is **the most divergent fixture from ground truth**: it discards racial classification on the ownership row, it remaps designations away from the calculator enum (Bug 2), and it doesn't carry ESD category. Fixing the projection (Bug 1, 2, 4) is sufficient — but the fixture should also be updated to populate the new columns once they exist, otherwise the demo will still under-score even after the projection bug is fixed.

---

## 5. Test plan for fixes (ordered by impact)

| Order | Bug | Test (new or modified) | Asserts |
|---|---|---|---|
| 1 | Bug 1 (Ownership) | New `apps/web/server/__tests__/workbookProjection.test.ts` | `calculateOwnershipScore(projectWorkbookToClient(buildLakeTradingWorkbookSections()).shareholders … ) ≈ 25` |
| 2 | Bug 2 (Designations) | Same file | every Lake employee designation is in the calculator enum; `calculateManagementScore … ≈ 11.77 ± 0.05` |
| 3 | Bug 3 (Supplier enterpriseType + unit normalisation) | Same file | `calculateProcurementScore … ≈ 20.33 ± 0.05`; supplier with 30% black ownership does **not** count for BO51 |
| 4 | Bug 4 (ESD category + type) | Same file | `calculateEsdScore … sdTotal ≈ 3.69, edTotal ≈ 2.36` |
| 5 | Bug 5 (SED type mapping) | Same file | `calculateSedScore … ≈ 0.41` |
| 6 | Bug 6 (Store loader drops fields) | New `apps/web/Toolkit/src/lib/__tests__/loadClientData.test.ts` | round-trip fixture → loader preserves `yearsHeld`, `isDesignatedGroup`, `blackNewEntrant`, `isEmpoweringSupplier`, etc. |
| 7 | Bug 7 (% vs fraction) | Procurement test in same file | 30% supplier excluded from BO51; 75% included |
| 8 | Bug 8 (beeLevel default) | Procurement test in same file | supplier with empty `beeLevel` ⇒ recognised spend 0 |
| 9 | Bug 9 (discounted level) | Existing `lakeTradingUCS.test.ts` will go green | `beeLevel === 8` |
| 10 | Bug 10 (ontology snapshot) | Existing `lakeTradingUCS.test.ts` will go green | `ontologySnapshot.zeroScorePillars` includes `skillsDevelopment`; ESD aggregate pillar exists |

The umbrella end-to-end assertion to run after all fixes:

```ts
const sections = buildLakeTradingWorkbookSections();
const projection = projectWorkbookToClient({ ...emptyWb, sections });
const config = await getCalculatorConfig("RCOGP", "Generic");
const ownership = calculateOwnershipScore({ shareholders: projection.shareholders, companyValue: 50_000_000, outstandingDebt: 0, yearsHeld: 3, ... }, config);
const mgmt = calculateManagementScore({ employees: projection.employees }, config, "Gauteng");
const sk = calculateSkillsScore({ leviableAmount: projection.financials.leviableAmount, trainingPrograms: projection.trainingPrograms }, config);
const proc = calculateProcurementScore({ tmps: projection.financials.tmps, suppliers: projection.suppliers }, config);
const esd = calculateEsdScore({ contributions: projection.esdContributions, graduationBonus: false, jobsCreatedBonus: false }, projection.financials.npat, config);
const sed = calculateSedScore({ contributions: projection.sedContributions }, projection.financials.npat, config);
expect(ownership.total + mgmt.total + sk.total + proc.total + esd.sdTotal + esd.edTotal + sed.total).toBeCloseTo(63.56, 1);
```

---

## 6. Risk / sequencing

- Bugs 1–5 are inside one file (`workbookRoutes.ts`) plus one demo fixture. They are mechanical, low-risk, and additive — they cannot break a working code path because no working code path currently feeds the calculators.
- Bugs 6–8 are inside the Toolkit loader. They are additive too but should ship together with Bugs 1–5 so the new fields actually reach the calculators.
- Bugs 9–10 are inside the UCS engine and unrelated to the 19.5 issue; ship as a separate, small commit so the lakeTrading-UCS suite goes fully green.
- None of the fixes touch `apps/api/pipeline/sectorConfig.ts` or the Super Admin UI, per the audit boundary.

---

## 7. Confidence summary

| Bug | Confidence | Reason |
|---|---|---|
| 1 (Ownership) | High | Mechanically verified: every consumer of `sh.blackOwnership` returns 0 |
| 2 (Designations) | High | Enum mismatch is observable in source; UCS test (with correct enums) passes |
| 3 (Supplier enterpriseType) | High | Loader explicitly defaults to `'generic'` |
| 4 (ESD category) | High | `categorizeContributions` filters by `category`, projection omits it |
| 5 (SED type) | High | Loader expects `c.type`, projection writes `contributionType` |
| 6 (Loader drops fields) | High | Diff between calculator inputs and loader output is enumerable |
| 7 (% vs fraction unit) | High | Latent risk; current pass-through is accidentally OK only at 0% / 100% |
| 8 (beeLevel default) | High | Default 4 overstates non-compliant suppliers; latent for Lake |
| 9 (Discounted level) | High | UCS test expectation matches spec, engine returns base level |
| 10 (Ontology / ESD pillar) | Medium | Needs design call on simplified vs full path |

---

## 11. YES Initiative — not a cause of the 19.5 vs 63.56 gap

**Audited**: 2026-05-21 against `docs/Lake Trading  Toolkit (RCOGP).xlsx`.

Lake Trading Excel shows:

- **Grand total (7 pillars)**: 63.56 / 120
- **YES Points (bonus)**: **0** (`Scorecard Calculations` sheet; `YES Achieved? = No`)
- **Qualify for YES?**: **No** (YES sheet)
- Summary row labelled **YES points** also shows 63.56 — this is the toolkit formula *Current Points + YES Points* when bonus = 0, **not** an extra pillar or missing +3

The 19.5 production total is caused by workbook projection bugs (§1), not YES exclusion. Lake demo data has zero YES candidates; excluding YES bonus is **correct** for this dataset.

| Total | Points | Applies to Lake? |
|---|---|---|
| Without YES bonus | **63.56** / 120 | Yes — authoritative |
| With Tier 2 YES bonus (+3) | **66.56** / 123 | No — Lake does not qualify |

Full YES rules: `docs/YES_INITIATIVE_CLARIFICATION.md` and `docs/SECTOR_TRUTH_LEDGER.md` §16.
