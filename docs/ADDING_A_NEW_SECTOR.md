# Adding a New Sector — Complete Guide

This guide tells you everything you need to add a brand-new B-BBEE sector code (e.g. `MAC`, `TOURISM`, `CONSTRUCTION`) end-to-end: what information to collect first, what files to edit, what shape the engine expects, and how to verify it works.

---

## 1. What "a sector" means in this codebase

A sector is a complete scoring profile that controls:

- Which **pillars** exist and their **max points**
- The **compliance targets** for every criterion (Ownership, MC, Skills, PP, ESD, SED, etc.)
- The **level thresholds** (how many points = Level 1/2/…/8)
- Reference tables: **recognition table**, **benefit factors**, **category weightings**, **industry norms**

It is identified by two keys together: a **`sectorCode`** (e.g. `RCOGP`, `ICT`, `FSC`) and a **`scorecardType`** (`Generic` | `QSE` | `EME`). So `RCOGP` Generic and `RCOGP` QSE are two separate sector configs.

### Source of truth

`apps/api/pipeline/sectorConfig.ts` is the **single source of truth** for sector rules. Everything else (ArangoDB seed, fallback lists, frontend dropdowns) is downstream of this file.

---

## 2. Pre-flight — what to have on hand before you start

Collect these from the regulatory gazette / sector code document **before** you open the editor:

```
[ ] Sector code (3–5 letter abbreviation, e.g. MAC)
[ ] Sector full name (human-readable label)
[ ] Whether QSE / EME variants exist (each needs its own config)
[ ] Total max points (Generic and QSE if applicable)
[ ] Per-pillar max points and which pillars have a sub-minimum (% threshold)
[ ] Ownership targets: voting / women voting / EI / women EI / net value / new entrants
[ ] Management Control targets: board / exec / other exec — black + black women splits
[ ] EAP source: National or Provincial (if you support per-client provincial overrides)
[ ] Skills targets: overall / bursary / disabled spend %, learnership / absorption %
[ ] Procurement targets: empowering / QSE / EME / 51%-BO / 30%-BWO / DG decimals + max pts
[ ] ESD targets: SD% / SD pts / ED% / ED pts / graduation bonus / jobs bonus
[ ] SED target: spend % / max pts
[ ] Level thresholds (Level 1 → Level 8 minimum points)
[ ] Any sector-specific extras (FSC: AFS / EF / CE; Agri: Land Ownership; ICT: scaled levels)
[ ] Sample Excel toolkit for the sector (for extraction tab mapping)
```

When all 14 boxes are checked, you can complete the work in one sitting.

---

## 3. The full file map

Adding a sector touches up to four files. Two are required, two are optional:

| # | File | Required? | What you do |
|---|------|-----------|-------------|
| 1 | `apps/api/pipeline/sectorConfig.ts` | **Required** | Define the new `SectorConfig` const and add it to `ALL_CONFIGS` |
| 2 | `apps/web/lib/pipeline/sectorConfig.ts` | **Required** | Add a lightweight metadata entry so the web UI can list it in dropdowns |
| 3 | `apps/api/src/routes/sectors.ts` | Optional | Add to the `getFallbackSectors()` / `getFallbackSectorOptions()` arrays — only matters when ArangoDB is offline |
| 4 | `docs/TOOLKIT_TAB_MAP.md` | Optional | Document the sector's Excel toolkit shape so the extractor team has a reference |

> **One ArangoDB step**: After deploying the new code, hit `POST /api/sectors/seed` once to push the new config into the `sectorRules` collection. The runtime reads from ArangoDB first and falls back to the hardcoded config if Arango is offline.

---

## 4. What the engine needs to know about a sector

This is the **data contract** between you and the calculation engine. Every field listed here is read by `pillarCalculators.ts` / `calculationEngine.ts` while scoring; if it's missing or wrong, scores will be wrong (or the engine will throw `No sector config found`).

The contract has two halves:

1. **Static sector rules** — defined once in `sectorConfig.ts`. These are the legal/regulatory constants for the sector.
2. **Per-assessment inputs** — passed in at scoring time (employees, shareholders, suppliers, etc.). These are the company's actual data; sector-agnostic, but the engine expects every sector to support the same input shape.

### 4.1 Static sector rules — the `SectorConfig` shape

#### Identity (4 fields, all required)

| Field | Type | Notes |
|---|---|---|
| `sectorCode` | `string` | Short uppercase code, e.g. `"MAC"`. Used as the URL/DB key. |
| `sectorName` | `string` | Human-readable label, e.g. `"Marketing, Advertising & Communication (Generic)"`. |
| `scorecardType` | `'Generic' \| 'QSE' \| 'EME'` | Forms a composite key with `sectorCode`. |
| `totalMaxPoints` | `number` | Sum of all `pillarConfigs.*.maxPoints` (excluding YES). Validated by tests. |

#### Pillar configuration (`pillarConfigs`)

Each pillar entry says **how many points it's worth** and **whether it has a sub-minimum gate**. Sub-minimum gates trigger discounting (one level drop) when the company scores below the threshold.

| Pillar key | Required? | Typical max | Has sub-min? |
|---|---|---|---|
| `ownership` | ✅ | 25 | Yes (40%) |
| `managementControl` | ✅ | 19–23 | No |
| `employmentEquity` | Optional | 0 (merged into MC for most sectors) | No |
| `skillsDevelopment` | ✅ | 25 | Yes (40%) |
| `preferentialProcurement` | ✅ | 27–29 | Yes (40%) |
| `supplierDevelopment` | ✅ | 10 | Yes (40%) |
| `enterpriseDevelopment` | ✅ | 5–18 | No |
| `socioEconomicDevelopment` | ✅ | 5–12 | No |
| `yesInitiative` | Optional | 0 (level boost only) | No |
| `empowermentFinancing` | FSC only | — | — |
| `accessToFinancialServices` | FSC only | — | — |
| `consumerEducation` | FSC only | — | — |

Each entry shape:
```ts
{ maxPoints: number; hasSubMinimum: boolean; subMinimumPercent: number /* 0–100 */ }
```

#### Targets (`targets`) — every percentage and max-points the calculator needs

These are the regulatory thresholds. **Targets are decimals (0.25 = 25%), not percentages.** Max-points fields are absolute point values.

**`targets.ownership` (`OwnershipTargets`)** — used by `calcOwnership()`.

| Field | Meaning |
|---|---|
| `votingRightsTarget` / `votingRightsMaxPts` | Black voting rights target + points |
| `womenVotingTarget` / `womenVotingMaxPts` | Black women voting rights |
| `economicInterestTarget` / `economicInterestMaxPts` | Black economic interest |
| `womenEITarget` / `womenEIMaxPts` | Black women economic interest |
| `netValueMaxPts` | Net value points (capped) |
| `newEntrantsMaxPts` | New entrants bonus points |

**`targets.managementControl` (`MCTargets`)** — used by `calcMC()`.

| Field | Meaning |
|---|---|
| `boardBlackTarget` / `boardBlackMaxPts` | Black board members |
| `boardBWTarget` / `boardBWMaxPts` | Black women board members |
| `execBlackTarget` / `execBlackMaxPts` | Executive directors black (commonly 50%) |
| `execBWTarget` / `execBWMaxPts` | Executive directors black women (commonly 25%) |
| `otherExecBlackTarget` / `otherExecBlackMaxPts` | Other exec management black (commonly 60%; FSC: 75%) |
| `otherExecBWTarget` / `otherExecBWMaxPts` | Other exec management black women (commonly 30%; FSC: 38%) |
| `seniorMaxPts` / `seniorBWMaxPts` | Senior management points (target comes from EAP, not here) |
| `middleMaxPts` / `middleBWMaxPts` | Middle management points |
| `juniorMaxPts` / `juniorBWMaxPts` | Junior management points |

> Senior/middle/junior **targets are not in `SectorConfig`** — the engine reads them from the National or Provincial EAP table baked into `pillarCalculators.ts`. You only set the max-points here.

**`targets.employmentEquity` (`EETargets`)** — used by sectors that score EE separately from MC (rare; most merge it).

| Field | Meaning |
|---|---|
| `seniorMaxPts` / `middleMaxPts` / `juniorMaxPts` | Per-tier points |
| `disabledMaxPts` | Points for disabled employee target |
| `disabledTarget` | Decimal target (commonly `0.02` = 2%; older codes used 3%) |

**`targets.skills` (`SkillsTargets`)** — used by `calcSkills()`. Spend percentages are **of leviable amount**, not of revenue.

| Field | Meaning |
|---|---|
| `learningProgrammesMaxPts` | Points for overall black training spend |
| `bursaryMaxPts` | Points for bursary spend |
| `disabledLearningMaxPts` | Points for disabled training spend |
| `learnershipsMaxPts` | Points for learnership/internship count |
| `absorptionMaxPts` | Points for absorbing learners as employees |
| `overallSpendPercent` | Spend target as % of leviable (e.g. `3.5`) |
| `bursarySpendPercent` | Bursary spend target as % (e.g. `2.5`) |
| `disabledSpendPercent` | Disabled training target as % (e.g. `0.3`) |
| `learnershipTargetPercent` | Learnership headcount target as % of black learners |
| `absorptionTargetPercent` | Absorption rate target as % |

**`targets.procurement` (`ProcurementTargets`)** — used by `calcProcurement()`. Targets are decimals applied to **TMPS** (Total Measured Procurement Spend).

| Field | Meaning |
|---|---|
| `allSuppliersTarget` / `allSuppliersMaxPts` | Empowering supplier spend target (e.g. `0.80` = 80% of TMPS) |
| `qseTarget` / `qseMaxPts` | QSE supplier spend target |
| `emeTarget` / `emeMaxPts` | EME supplier spend target |
| `bo51Target` / `bo51MaxPts` | 51% black-owned supplier spend |
| `bwo30Target` / `bwo30MaxPts` | 30% black-women-owned supplier spend |
| `dgTarget` / `dgMaxPts` | Designated group bonus (commonly `0.02` / 2 pts) |

> Procurement has **no bonus points** in the codes — bonuses live in ED only.

**`targets.esd` (`EsdTargets`)** — used by `calcEsd()`. Spend percentages are of **NPAT**, or the deemed NPAT if NPAT < industry quarter threshold.

| Field | Meaning |
|---|---|
| `sdPercent` / `sdMaxPts` | Supplier development spend target (e.g. `2.0`% / 10 pts) |
| `edPercent` / `edMaxPts` | Enterprise development spend target (e.g. `1.0`% / 5 pts) |
| `edGraduationBonus` | Bonus pts when an ED beneficiary graduates to a supplier |
| `edJobsBonus` | Bonus pts for ED-driven job creation |

**`targets.sed` (`SedTargets`)** — used by `calcSed()`.

| Field | Meaning |
|---|---|
| `spendPercent` | SED spend target as % of NPAT (e.g. `1.0`) |
| `maxPts` | SED max points (commonly 5; ICT: 12; FSC: 8 incl. consumer ed) |

#### Level thresholds (`levelThresholds`) — required

Determines BEE Level 1–8 from total points.

```ts
levelThresholds: Array<{ level: 1|2|...|8; minPoints: number; recognition: number }>
```

Use `STANDARD_LEVELS` for 120-point sectors, `ICT_LEVELS` for the 140-point ICT scale, or define your own at the top of the file. **Order matters**: thresholds are scanned highest-first, so always provide them sorted Level 1 → Level 8.

#### Reference tables (4 fields)

| Field | What it does | Default constant |
|---|---|---|
| `recognitionTable` | Maps a supplier's BEE level (1–8) to a recognition multiplier (1.35 → 0.10) used in procurement scoring | `STANDARD_RECOGNITION_TABLE` |
| `benefitFactors` | Discounts certain ESD contribution types (loans 0.7×, guarantees 0.03×, equity 1.0×, etc.) | `STANDARD_BENEFIT_FACTORS` |
| `categoryWeightings` | Skills training categories A–G; cap E at 25%, F at 15%, G excluded | `STANDARD_CATEGORY_WEIGHTINGS` |
| `industryNorms` | SARS norm % per industry; used to compute deemed NPAT when actual NPAT is below quarter threshold | `STANDARD_INDUSTRY_NORMS` |

For 99% of new sectors you reuse all four standard constants. Only override one if the sector code's gazette explicitly redefines the table.

### 4.2 Per-assessment inputs — what the engine expects at scoring time

These shapes are **sector-agnostic** — every sector must accept the same input arrays. You don't redefine them per sector; the calculator slices them according to your `targets`.

**`EmployeeInput[]`** — Management Control + EE. One row per person.
```ts
{
  name?: string;
  race: 'African' | 'Coloured' | 'Indian' | 'White' | 'Foreign' | string;
  gender: 'Male' | 'Female';
  designation: 'Board' | 'Executive' | 'Executive Director'
              | 'Other Executive Management'
              | 'Senior' | 'Middle' | 'Junior'
              | 'Skilled Technical' | 'Semi-skilled' | 'Unskilled';
  isDisabled: boolean;
  isForeign?: boolean;
}
```

**`ShareholderInput[]`** — Ownership.
```ts
{
  name: string;
  blackOwnership: number;        // decimal (0–1)
  blackWomenOwnership: number;   // decimal (0–1)
  shares: number;                // share count (used to weight)
  shareValue: number;            // for Net Value calc
  yearsHeld?: number;
  isDesignatedGroup?: boolean;
  blackNewEntrant?: boolean;
}
```

**`SupplierInput[]`** — Preferential Procurement.
```ts
{
  name: string;
  spend: number;                  // ZAR
  beeLevel: number;               // 1–8 (0 = non-compliant)
  blackOwnership: number;         // decimal
  blackWomenOwnership: number;    // decimal
  enterpriseType: 'eme' | 'qse' | 'large';
  youthOwnership?: number;
  disabledOwnership?: number;
  isDesignatedGroup?: boolean;
  isBlackOwned51?: boolean;
  isBlackWomanOwned30?: boolean;
  isEME?: boolean;
  isQSE?: boolean;
  isForeignSupplier?: boolean;    // excluded from TMPS denominator
}
```

**`TrainingProgramInput[]`** — Skills Development.
```ts
{
  id?: string;
  name?: string;
  category?: 'bursary' | 'learnership' | 'internship' | string;
  categoryCode?: 'A'|'B'|'C'|'D'|'E'|'F'|'G';   // applies categoryWeightings cap
  cost: number;                                  // ZAR
  isBlack?: boolean;
  isDisabled?: boolean;
  isAbsorbed?: boolean;
  isYesEmployee?: boolean;
  race?: string; gender?: string;
}
```

**`ContributionInput[]`** — ESD + SED.
```ts
{
  beneficiary: string;
  type: string;          // mapped via benefitFactors (grant/loan/guarantee/etc.)
  amount: number;        // ZAR
  category: 'sd' | 'ed' | 'sed';
  benefitFactor?: number; // override; defaults to lookup in cfg.benefitFactors
}
```

**`FinancialsInput`** — single object. Drives Skills (leviable amount), Procurement (TMPS), and ESD/SED (NPAT).
```ts
{
  revenue: number;
  npat: number;            // negative allowed; engine substitutes deemed NPAT if below industry quarter threshold
  leviableAmount: number;
  tmps: number;
  headcount: number;
  companyValue?: number;
  outstandingDebt?: number;
  yearsHeld?: number;
}
```

**Other context** (optional but consumed when present):
- **Province** — passed alongside employees; if set (`gauteng`, `western cape`, etc.) the engine swaps `NATIONAL_EAP` for `PROVINCIAL_EAP[<province>]`.
- **Industry name** — used to look up `industryNorms` for deemed NPAT.

### 4.3 Validation rules the engine enforces

Before scoring, the engine asserts:

1. `Σ pillarConfigs.*.maxPoints === totalMaxPoints` (excluding YES).
2. Each pillar's criterion `MaxPts` fields sum to its `maxPoints`.
3. `levelThresholds` is non-empty and sorted descending by `minPoints`.
4. `recognitionTable` covers BEE levels 0–8.
5. All `*Target` decimals are between 0 and 1 (not percentages).
6. All `*MaxPts` are non-negative numbers.

If any of these fail, `getSectorConfig()` will throw and the sector won't be usable. **Always add the audit comment** at the bottom of your sector definition (the `// Ownership verification: 4+2+4+2+3+2+8 = 25 ✓` style) — it forces you to do the math before commit.

---

## 5. Step-by-step implementation

### Step 1 — Define the SectorConfig (required)

Open `apps/api/pipeline/sectorConfig.ts`. Copy the closest existing sector as your template (`RCOGP_GENERIC` for a 120-point scorecard, `ICT_GENERIC` for a 140-point scale).

Add a new export at the bottom of the file (after the last existing sector, before the "Lookup" section):

```ts
// ---------------------------------------------------------------------------
// MAC Generic (Marketing, Advertising & Communication)
// VERIFIED AGAINST: BBBEE Toolkit (MAC) Template v1.0.xlsx
// Grand Total: <X> points
// ---------------------------------------------------------------------------

export const MAC_GENERIC: SectorConfig = {
  sectorCode: 'MAC',
  sectorName: 'Marketing, Advertising & Communication (Generic)',
  scorecardType: 'Generic',
  totalMaxPoints: 120,
  pillarConfigs: {
    ownership:                { maxPoints: 25, hasSubMinimum: true,  subMinimumPercent: 40 },
    managementControl:        { maxPoints: 19, hasSubMinimum: false, subMinimumPercent: 0  },
    skillsDevelopment:        { maxPoints: 25, hasSubMinimum: true,  subMinimumPercent: 40 },
    preferentialProcurement:  { maxPoints: 29, hasSubMinimum: true,  subMinimumPercent: 40 },
    supplierDevelopment:      { maxPoints: 10, hasSubMinimum: true,  subMinimumPercent: 40 },
    enterpriseDevelopment:    { maxPoints: 7,  hasSubMinimum: false, subMinimumPercent: 0  },
    socioEconomicDevelopment: { maxPoints: 5,  hasSubMinimum: false, subMinimumPercent: 0  },
    yesInitiative:            { maxPoints: 0,  hasSubMinimum: false, subMinimumPercent: 0  },
  },
  targets: {
    ownership:        { /* fill OwnershipTargets — see §4.1 */ },
    managementControl:{ /* fill MCTargets */ },
    employmentEquity: { /* fill EETargets */ },
    skills:           { /* fill SkillsTargets */ },
    procurement:      { /* fill ProcurementTargets */ },
    esd:              { /* fill EsdTargets */ },
    sed:              { /* fill SedTargets */ },
  },
  levelThresholds: STANDARD_LEVELS,        // or define a custom XXX_LEVELS array
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
// Ownership verification: 4+2+4+2+3+2+8 = 25 ✓   <-- always add this audit trail
```

Then register it in the lookup array a few lines below:

```ts
const ALL_CONFIGS: SectorConfig[] = [
  RCOGP_GENERIC, ICT_GENERIC, FSC_GENERIC, AGRI_GENERIC,
  RCOGP_QSE, ICT_QSE,
  MAC_GENERIC,                 // <— add here
];
```

If your sector should be auto-detected from a free-text company description, add a regex branch to `detectSectorFromName()`:

```ts
if (/marketing|advertising|communications?/i.test(lower)) return MAC_GENERIC;
```

#### Common gotchas
- **Custom level thresholds.** If your sector doesn't use the default 100/95/90/80… scale, define a new `MY_SECTOR_LEVELS` array near the existing ones.
- **Sector-specific pillars** (e.g. FSC's *Empowerment Financing*, *Access to Financial Services*, *Consumer Education*) are optional fields on `pillarConfigs`. Only set them if the sector code defines them.
- **QSE scorecards** are separate configs. If your sector has a QSE variant, create `MAC_QSE` as a second export and add it to `ALL_CONFIGS`.

### Step 2 — Register the sector in the web app dropdown (required)

Open `apps/web/lib/pipeline/sectorConfig.ts`. This file is intentionally lightweight — only used so the UI can populate the sector picker without round-tripping to the API.

```ts
export const MAC_GENERIC: SectorConfig = {
  code: 'MAC_GENERIC',
  name: 'Marketing, Advertising & Communication (Generic)',
  description: 'Generic scorecard for the MAC sector code',
  scorecardTypes: ['generic', 'qse', 'eme'],
};

const ALL_CONFIGS: SectorConfig[] = [
  RCOGP_GENERIC, ICT_GENERIC, FSC_GENERIC, AGRI_GENERIC,
  RCOGP_QSE, ICT_QSE,
  MAC_GENERIC,                 // <— add here
];
```

If you add `detectSectorFromName()` keyword matching here too, the web side will auto-pick the sector from the company's industry text.

### Step 3 — Update the API fallback list (recommended)

`apps/api/src/routes/sectors.ts` exposes `GET /api/sectors` and `GET /api/sectors/options`. When ArangoDB is reachable, sectors are read from the `sectorRules` collection. When it's not, the route returns a hardcoded fallback list.

Add your new sector to **both** helper functions at the bottom of that file:

```ts
function getFallbackSectors() {
  return [
    /* ... existing entries ... */
    { code: 'MAC', name: 'MAC Sector Code (Generic)', type: 'Generic', totalPoints: 120 },
  ];
}

function getFallbackSectorOptions() {
  return [
    /* ... existing entries ... */
    { value: 'MAC', label: 'Marketing, Advertising & Communication (MAC)', code: 'MAC', hasQSE: false, availableTypes: ['Generic'] },
  ];
}
```

### Step 4 — Push it into ArangoDB (one-time, in each environment)

The runtime caches sector rules in ArangoDB. After deploying the new code:

```bash
# As an authenticated admin user (or via curl with a session cookie):
curl -X POST http://localhost:3000/api/sectors/seed
```

This calls `seedOntology({ force: true })` which:

1. Reads every `SectorConfig` from `ALL_CONFIGS` (including your new one)
2. Builds the entity manifest for each via `buildManifest(sectorCode, scorecardType)`
3. Upserts into the `sectorRules`, `criteria`, and `entityFields` Arango collections

Re-run this in each environment (dev, staging, prod) after the deploy.

> If ArangoDB is offline you can skip this — the API will use the fallback list from Step 3 until Arango is back, then auto-seed on first request.

### Step 5 — Document the toolkit shape (optional)

If the new sector ships with its own Excel toolkit template (most do), append a section to `docs/TOOLKIT_TAB_MAP.md` describing:

- The sheet count and any sector-specific tabs
- Which atomic entity fields the new tabs map to
- Any non-standard formulas

This is what the extractor and AI parsing teams use to wire up automated PDF/Excel ingestion.

---

## 6. Verifying your new sector

After Step 4, run these smoke checks:

```bash
# 1. Sector appears in the listing
curl -s http://localhost:3000/api/sectors | jq '.sectors[] | select(.code=="MAC")'

# 2. Dropdown options include it
curl -s http://localhost:3000/api/sectors/options | jq '.options[] | select(.code=="MAC")'

# 3. Full config round-trips correctly
curl -s http://localhost:3000/api/sectors/MAC/Generic | jq '.config.totalMaxPoints'

# 4. Manifest builds without errors
curl -s "http://localhost:3000/api/sectors/MAC/manifest?type=Generic" | jq '.manifest | keys'
```

In the web app, open the **Build / Client Information** step and confirm the new sector appears in the picker. Run a small scorecard end-to-end to confirm the calculator picks up the new `pillarConfigs.maxPoints` and `targets.*`.

If you hit a `No sector config found for sectorCode="MAC"` error from the calculator, you forgot Step 1's `ALL_CONFIGS` registration.

---

## 7. Quick checklist

```
[ ] 1. Defined new export in apps/api/pipeline/sectorConfig.ts
[ ] 2. Added to ALL_CONFIGS in the same file
[ ] 3. (optional) Added regex branch to detectSectorFromName()
[ ] 4. Verified pillar totals sum correctly (write the audit comment!)
[ ] 5. Added metadata entry to apps/web/lib/pipeline/sectorConfig.ts
[ ] 6. Updated fallback arrays in apps/api/src/routes/sectors.ts
[ ] 7. Deployed and ran POST /api/sectors/seed
[ ] 8. Smoke-tested all four GET /api/sectors/* endpoints
[ ] 9. (optional) Documented the toolkit shape in docs/TOOLKIT_TAB_MAP.md
```

---

## 8. Reference — where each piece is consumed downstream

- **Calculation engine** — `apps/api/pipeline/rules/calculationEngine.ts` calls `getSectorConfig(code, type)` to load thresholds before scoring each pillar.
- **Pillar calculators** — `apps/api/pipeline/rules/pillarCalculators.ts` reads `cfg.targets.*` and `cfg.pillarConfigs.*.maxPoints` for every formula.
- **Scorecard repository** — `apps/api/arango/repositories/scorecardRepository.ts` persists results keyed by `(sectorCode, scorecardType)`.
- **Entity manifest** — `apps/api/pipeline/extraction/entityManifest.ts` generates the input field list per sector for the document extractor and the manual entry forms.
- **Frontend pickers** — `ClientInformationForm.tsx`, `BuildPillarsStep.tsx`, `EntityBuilder.tsx`, and `Dashboard.tsx` consume `listSectorConfigs()` from `apps/web/lib/pipeline/sectorConfig.ts`.

If you ever need to **rename or remove** a sector, the same file map applies in reverse — but call `SectorRuleRepository.deleteSectorRule(code, type)` first to avoid orphaned Arango rows.
