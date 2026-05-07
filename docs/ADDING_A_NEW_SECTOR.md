# Adding a New Sector — Step-by-Step Guide

This guide walks you through adding a brand-new B-BBEE sector code (e.g. `MAC`, `TOURISM`, `CONSTRUCTION`) end-to-end, from the source-of-truth config through to the dropdowns the user sees.

---

## 1. What "a sector" means in this codebase

A sector is a complete scoring profile that controls:

- Which pillars exist and their **max points**
- The **compliance targets** for every criterion (Ownership, MC, Skills, PP, ESD, SED, etc.)
- The **level thresholds** (how many points = Level 1/2/…/8)
- Reference tables: **recognition table**, **benefit factors**, **category weightings**, **industry norms**

It is identified by two keys together: a **`sectorCode`** (e.g. `RCOGP`, `ICT`, `FSC`) and a **`scorecardType`** (`Generic` | `QSE` | `EME`). So `RCOGP` Generic and `RCOGP` QSE are two separate sector configs.

### Source of truth

`apps/api/pipeline/sectorConfig.ts` is the **single source of truth** for sector rules. Everything else (ArangoDB seed, fallback lists, frontend dropdowns) is downstream of this file.

---

## 2. The full file map

When you add a new sector you will touch up to four files. Two are required, two are optional:

| # | File | Required? | What you do |
|---|------|-----------|-------------|
| 1 | `apps/api/pipeline/sectorConfig.ts` | **Required** | Define the new `SectorConfig` const and add it to `ALL_CONFIGS` |
| 2 | `apps/web/lib/pipeline/sectorConfig.ts` | **Required** | Add a lightweight metadata entry so the web UI can list it in dropdowns |
| 3 | `apps/api/src/routes/sectors.ts` | Optional | Add to the `getFallbackSectors()` / `getFallbackSectorOptions()` arrays — only matters when ArangoDB is offline |
| 4 | `docs/TOOLKIT_TAB_MAP.md` | Optional | Document the sector's Excel toolkit shape so the extractor team has a reference |

> **One ArangoDB step**: After deploying the new code, hit `POST /api/sectors/seed` once to push the new config into the `sectorRules` collection. The runtime reads from ArangoDB first and falls back to the hardcoded config if Arango is offline.

---

## 3. Step-by-step

### Step 1 — Define the SectorConfig (required)

Open `apps/api/pipeline/sectorConfig.ts`. Copy the closest existing sector as your template (use `RCOGP_GENERIC` for a generic 120-point scorecard, or `ICT_GENERIC` if your sector uses a 140-point scale).

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
  totalMaxPoints: 120,        // sum of pillar maxPoints (excluding YES)
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
    ownership:        { /* see OwnershipTargets interface */ },
    managementControl:{ /* see MCTargets interface */ },
    employmentEquity: { /* see EETargets interface */ },
    skills:           { /* see SkillsTargets interface */ },
    procurement:      { /* see ProcurementTargets interface */ },
    esd:              { /* see EsdTargets interface */ },
    sed:              { /* see SedTargets interface */ },
  },
  levelThresholds: STANDARD_LEVELS,        // or define a custom XXX_LEVELS array
  recognitionTable: STANDARD_RECOGNITION_TABLE,
  benefitFactors: STANDARD_BENEFIT_FACTORS,
  categoryWeightings: STANDARD_CATEGORY_WEIGHTINGS,
  industryNorms: STANDARD_INDUSTRY_NORMS,
};
```

Then register it in the lookup array a few lines below:

```ts
const ALL_CONFIGS: SectorConfig[] = [
  RCOGP_GENERIC, ICT_GENERIC, FSC_GENERIC, AGRI_GENERIC,
  RCOGP_QSE, ICT_QSE,
  MAC_GENERIC,                 // <— add it here
];
```

If your sector should be auto-detected from a free-text company description, add a regex branch to `detectSectorFromName()`:

```ts
if (/marketing|advertising|communications?/i.test(lower)) return MAC_GENERIC;
```

#### Common gotchas

- **Always verify totals.** The comment at the bottom of `RCOGP_GENERIC` (`// Ownership verification: 4+2+4+2+3+2+8 = 25 ✓`) is mandatory. Add the same audit trail for your new sector — pillar `maxPoints` must sum to `totalMaxPoints`, and each pillar's criterion `MaxPts` fields must sum to its pillar `maxPoints`.
- **Custom level thresholds.** If your sector doesn't use the default 100/95/90/80… scale, define a new `MY_SECTOR_LEVELS` array near the existing `STANDARD_LEVELS` / `ICT_LEVELS` / `FSC_LEVELS` arrays.
- **Sector-specific pillars** (e.g. FSC's *Empowerment Financing* / *Access to Financial Services* / *Consumer Education*) are optional fields on `pillarConfigs`. Only set them if the sector code defines them.
- **QSE scorecards** are separate configs. If your sector has a QSE variant, create `MAC_QSE` as a second export and add it to `ALL_CONFIGS`.

---

### Step 2 — Register the sector in the web app dropdown (required)

Open `apps/web/lib/pipeline/sectorConfig.ts` and add a metadata entry that matches the new code. This file is intentionally lightweight — it's only used so the UI can populate the sector picker without round-tripping to the API.

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

---

### Step 3 — Update the API fallback list (optional but recommended)

`apps/api/src/routes/sectors.ts` exposes `GET /api/sectors` and `GET /api/sectors/options`. When ArangoDB is reachable, sectors are read from the `sectorRules` collection. When it's not (in-memory mode, dev environments, or Arango downtime) the route returns a hardcoded fallback list.

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

---

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

---

### Step 5 — Document the toolkit shape (optional)

If the new sector ships with its own Excel toolkit template (most do), append a section to `docs/TOOLKIT_TAB_MAP.md` describing:

- The sheet count and any sector-specific tabs (e.g. FSC has *Access to Financial Services*, Agri has *Land Ownership*, *Farmworker Housing*)
- Which atomic entity fields the new tabs map to
- Any non-standard formulas

This is what the extractor and AI parsing teams use to wire up automated PDF/Excel ingestion.

---

## 4. Verifying your new sector

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

## 5. Quick checklist

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

## 6. Reference: where each piece is consumed

For deeper understanding, here's where the sector data flows downstream:

- **Calculation engine** — `apps/api/pipeline/rules/calculationEngine.ts` calls `getSectorConfig(code, type)` to load thresholds before scoring each pillar.
- **Pillar calculators** — `apps/api/pipeline/rules/pillarCalculators.ts` reads `cfg.targets.*` and `cfg.pillarConfigs.*.maxPoints` for every formula.
- **Scorecard repository** — `apps/api/arango/repositories/scorecardRepository.ts` persists results keyed by `(sectorCode, scorecardType)`.
- **Entity manifest** — `apps/api/pipeline/extraction/entityManifest.ts` generates the input field list per sector for the document extractor and the manual entry forms.
- **Frontend pickers** — `ClientInformationForm.tsx`, `BuildPillarsStep.tsx`, `EntityBuilder.tsx`, and `Dashboard.tsx` consume `listSectorConfigs()` from `apps/web/lib/pipeline/sectorConfig.ts`.

If you ever need to **rename or remove** a sector, the same file map applies in reverse — but call `SectorRuleRepository.deleteSectorRule(code, type)` first to avoid orphaned Arango rows.
