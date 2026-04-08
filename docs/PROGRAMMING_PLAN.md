# B-BBEE Scorecard System — Fix Plan (Code-Verified)

**Date**: April 8, 2026  
**Verified Against**: Actual current codebase (not stale audit docs)  
**Strategy**: 10 focused prompts, sequential, each self-contained  
**Rule**: NO silent fallbacks. NO mock data in production paths. AutoFill button (admin-only) is the ONLY acceptable test data entry point.  
**Architecture**: ONE Unified Calculation Service (UCS) — both manual and upload paths converge on `calculationEngine.ts` backed by ArangoDB.

---

## Current State Summary (What's Already Fixed vs Still Broken)

### Already Fixed (DO NOT re-fix)
- `sectorConfig.ts` RCOGP Generic: execBWTarget=0.25, execBWMaxPts=1, disabledTarget=0.02 -- CORRECT
- `sectorConfig.ts` Grand totals: RCOGP=120, ICT=140, AGRI=132, RCOGP_QSE=108, ICT_QSE=116 -- ALL CORRECT
- `sectorConfig.ts` ICT/AGRI/QSE pillar breakdowns have been updated from old wrong values
- `calculationEngine.ts` already has `resolveSectorConfig()` that queries ArangoDB first, falls back to hardcoded
- `buildResult.ts` already has discounted level logic (sub-minimum -> drop one level)
- `store.ts` `buildEmptyScorecard()` already uses `calculatorConfig` for targets
- `store.ts` `calculateScorecard()` already passes `calculatorConfig` to all calculators
- `store.ts` `pointsToLevel()` already uses `config?.levelThresholds`
- All frontend calculators (management, procurement, skills, esd-sed) already accept `CalculatorConfig`
- Industry norms in `sectorConfig.ts` already use SARS-sourced values (not fabricated)

### Still Broken (What This Plan Fixes)

1. **`clearData()` is never called** — zero callers outside the store definition. Old session data bleeds into new scorecards.
2. **`clearData()` doesn't reset `calculatorConfig`** — even if called, the previous sector's config would linger.
3. **Split localStorage keys** — `DocumentProcessor` uses `okiru-pro-active-client-${userId}`, `ClientProvider` uses `okiru-pro-active-client`. They disagree.
4. **React Query `staleTime: Infinity`** — cached data never auto-refreshes.
5. **`CalculatorConfig` shape mismatch** — `schema.ts` has `management.boardBlackTarget` etc, but the management calculator reads `config.managementControl.boardBlackTarget`. The property names don't match between the schema and the calculators in many places.
6. **`CalculatorConfig` missing fields** — `pillarConfigs` in schema is missing `ownership`, `enterpriseDevelopment`. The `managementControl` sub-type inside `pillarConfigs` is missing `subMinimumPercent`. The `skills` sub-type is missing `learningProgrammesMaxPts`, `bursaryMaxPts`, `disabledLearningMaxPts`, `learnershipsMaxPts`, `absorptionMaxPts`, `learnershipTargetPercent`, `absorptionTargetPercent`.
7. **Management calculator `DISABLED_TARGET` hardcoded at 0.03** — should be 0.02 (the config fallback is correct but the constant at line 25 is 0.03, and it's used when no config is provided).
8. **`sectorCalculators.ts` (backend pipeline path) `calcMCSector`** only scores Board+Exec (4 lines), ignores OtherExec, Senior, Middle, Junior, Disabled — so upload/pipeline MC scores are always too low.
9. **Entity template → scorecard wiring**: `computeDerivedInputs()` in `calculationEngine.ts` has TODO placeholders returning 0 for all employee/shareholder/supplier aggregations.
10. **`sectorConfigToCalculatorConfig` bridge is missing or incomplete** — the API needs to convert `SectorConfig` to `CalculatorConfig` format when returning config to the frontend.
11. **Lake Trading level**: Ground truth says level 7, discounted to 8. The `buildResult.ts` path handles this. Need to verify the frontend `store.ts` path also handles it (it does — lines 397-404).
12. **Silent RCOGP fallbacks everywhere** — 50+ places use `?? 25`, `?? 19`, `?? 29` etc. to silently use RCOGP Generic values when config is missing. This hides real bugs (e.g. config never loaded for ICT sector → calculator silently gives RCOGP numbers → wrong scorecard, no error). `getSectorConfig()` returns `RCOGP_GENERIC` when sector not found instead of throwing. `detectSectorFromName()` defaults to RCOGP for unrecognized names.
13. **AutoFill is clean** — `AutoFillButton.tsx` is admin-only, uses `lakeTradingDemo.ts` data, only fires on explicit user click. This is FINE and stays. But autofill should only FILL form fields, not trigger calculations or bypass validation.
14. **Level rule inconsistency** — `apps/web/lib/pipeline/buildResult.ts` line 110 uses `>= 65` for Level 6 instead of the correct `>= 70`. All other locations use `>= 70`. For scores 65-69 this produces the wrong level.
15. **Sub-minimum inconsistency across paths** — `buildResult.ts` (API pipeline) only checks 3 sub-minimums (ownership, skills, procurement) but `sectorConfig.ts` defines SD with `hasSubMinimum: true`. The Toolkit `store.ts` checks 5 sub-minimums. These must agree.
16. **THREE separate calculation engines** — Manual build uses `store.ts` → `calculators/*.ts` (frontend only). Upload/pipeline uses `buildPipelineResult` → `sectorCalculators.ts` (API). ScorecardBuilder uses `calculationEngine.ts` (API, manifest-driven). These are independent implementations of the same logic that can diverge.
17. **No ontology trace stored** — When a scorecard is calculated, the ArangoDB rules/entity templates used are not stored alongside the result. This prevents AI from later analyzing how to improve scores.
18. **`computeDerivedInputs` is hollow** — `calculationEngine.ts` lines 194-231 return zeros for all employee/shareholder/supplier aggregations — the unified engine can't actually calculate.

---

## Architecture Vision: Unified Calculation Service (UCS)

### The Problem Today

The system has **three separate calculation backends** that implement the same BBBEE logic independently:

| Path | Engine | Config Source | Used By |
|------|--------|--------------|---------|
| Manual Build | `store.ts` → `calculators/*.ts` (browser) | `CalculatorConfig` from API | Toolkit pillar forms |
| Upload/Pipeline | `buildPipelineResult` → `sectorCalculators.ts` (API) | `detectSectorFromName` → hardcoded `ALL_CONFIGS` | Excel import, LLM extraction |
| ScorecardBuilder | `calculationEngine.ts` (API, manifest-driven) | `SectorRuleRepository` (ArangoDB) → fallback hardcoded | `POST /api/calculate` |

This means the same company data can produce **different scores** depending on which path is used (e.g., upload MC calculator only scores Board+Exec while manual scores all 7 levels).

### The Target

**ONE calculation service** that both manual and upload use:

```
┌──────────────────┐    ┌──────────────────┐
│  Manual Form UI  │    │  Upload/Extract  │
│  (Toolkit forms) │    │  (AI extraction) │
└────────┬─────────┘    └────────┬─────────┘
         │                       │
         │  Entity Values        │  Entity Values
         │  (structured data)    │  (structured data)
         ▼                       ▼
┌─────────────────────────────────────────────┐
│     Unified Calculation Service (UCS)       │
│     `calculationEngine.ts` on API           │
│                                             │
│  1. Load manifest from ArangoDB             │
│  2. Validate entity completeness            │
│  3. Execute formulas (dependency-resolved)  │
│  4. Calculate sub-minimums                  │
│  5. Determine level + discounting           │
│  6. Store ontology trace for AI guidance     │
│  7. Return ScorecardResult                  │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│  ScorecardResult + OntologySnapshot         │
│  Stored in MongoDB (processorSession)       │
│  + ArangoDB (scoreResults, evidence)        │
└─────────────────────────────────────────────┘
```

### Key Principles

1. **Entity templates from ArangoDB are the source of truth** — they define what fields exist, what formulas apply, what targets/thresholds are used.
2. **Manual = form completion of entities** — the Toolkit forms ARE entity templates rendered as a UI. When user fills the form, they're populating entity values.
3. **Upload = AI-driven entity completion** — extraction produces the same entity values, just faster. Your teammate is working on extraction quality.
4. **Either way, entities go through the same calculator** — `calculationEngine.ts` backed by ArangoDB sector rules.
5. **Validation before calculation** — if required entities are missing or don't meet minimums, the service tells the user what's missing (not silent zeros).
6. **Ontology stored for AI** — the exact ArangoDB rules, thresholds, formulas used during calculation are saved alongside the result, enabling future AI guidance on "how to improve your score."
7. **Lake Trading is the acceptance test** — any path through the system, given Lake Trading entity values, must produce: total=63.56, level=7, discountedLevel=8.

### What Already Exists

- `calculationEngine.ts` already describes itself as "the unified calculator that replaces the fragmented implementations." It has:
  - ArangoDB sector config resolution (`resolveSectorConfig`)
  - Manifest loading (`buildManifest`)
  - Formula registry and dependency resolution
  - Sub-minimum tracking
  - Level determination with discounting
  - Audit trail generation
- `ScoreResultRepository` already stores per-criterion results with `formulaUsed`, `inputs`, `intermediateSteps`.
- `EvidenceRepository` stores entity values as evidence.
- `seedOntology.ts` converts manifests to ArangoDB stored shapes.

### What's Missing

1. `computeDerivedInputs` returns zeros (employee/shareholder/supplier aggregation not implemented)
2. `CalculationOptions` doesn't accept full entity arrays (employees, shareholders, suppliers, contributions)
3. Manual build path doesn't call the UCS — it uses frontend-only calculators
4. Upload path uses `buildPipelineResult` → `sectorCalculators.ts` instead of UCS
5. No ontology snapshot stored alongside scorecard results
6. No validation step (missing entities produce zeros, not errors)

---

## PROMPT -1: Fix Level Rule (CHECK THIS FIRST) (5 min)

> **Goal**: Fix the level determination inconsistency. The Lake Trading value (63.56) is correct but the level rule has bugs.

```
BEFORE doing anything else, check and fix the level determination logic.

## Bug 1: Wrong L6 threshold in web pipeline

`apps/web/lib/pipeline/buildResult.ts` line 110 uses `>= 65` for Level 6. 
Every other location in the codebase uses `>= 70`. This is WRONG.

Fix line 110:
  BEFORE: if (totalScore >= 65) return 'Level 6';
  AFTER:  if (totalScore >= 70) return 'Level 6';

Reference thresholds (from sectorConfig.ts STANDARD_LEVELS, which are CORRECT):
  Level 1: ≥100, Level 2: ≥95, Level 3: ≥90, Level 4: ≥80
  Level 5: ≥75, Level 6: ≥70, Level 7: ≥55, Level 8: ≥40

## Bug 2: API buildResult.ts only checks 3 sub-minimums

`apps/api/pipeline/buildResult.ts` lines 184-190 only checks ownership, skills, procurement.
But `sectorConfig.ts` defines supplierDevelopment with `hasSubMinimum: true, subMinimumPercent: 40`.

Read `apps/api/pipeline/buildResult.ts` lines 180-210.
Read `apps/api/pipeline/sectorConfig.ts` lines 276-292 (RCOGP pillarConfigs).

Fix: Add SD sub-minimum check to `buildResult.ts`:
```typescript
const sdSubMinThresh = pCfg.supplierDevelopment.maxPoints * (pCfg.supplierDevelopment.subMinimumPercent / 100);
const sdSubMinMet = !pCfg.supplierDevelopment.hasSubMinimum || pillarScores.supplierDevelopment >= sdSubMinThresh;
const allSubMinsMet = ownSubMinMet && skSubMinMet && prSubMinMet && sdSubMinMet;
```

## Bug 3: Verify Lake Trading level after fixes

With Lake Trading (63.56 total, Skills=0, SD=3.69):
- 63.56 → Level 7 (≥55, <70) ✓
- Skills sub-min: 0 < 10 (40% × 25) → FAILS
- SD sub-min: 3.69 < 4 (40% × 10) → FAILS  
- Discount: Level 7 + 1 = Level 8 ✓

Run the existing Lake Trading test:
cd apps/api && npx vitest run --reporter=verbose pipeline/__tests__/lakeTrading.test.ts

## Instructions:
1. Read `apps/web/lib/pipeline/buildResult.ts` lines 104-114 (level thresholds)
2. Read `apps/api/pipeline/buildResult.ts` lines 180-210 (sub-minimum checks)
3. Fix the L6 threshold from 65 to 70
4. Add SD sub-minimum check
5. Run the Lake Trading test
6. Run `npx tsc --noEmit` in both apps/api and apps/web

## DEPLOY after code changes (build BOTH web and api):
$env:KUBECONFIG="C:\Users\Administrator\Documents\GitHub\okiru-pro-main\kubeconfig.yaml"
$env:PYTHONIOENCODING="utf-8"
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 3
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/api --orderby time_desc --top 3
az acr build --registry okiruproacrde4d539b --image okiru-pro/web:v1.0.NEW --file apps/web/Dockerfile .
az acr build --registry okiruproacrde4d539b --image okiru-pro/api:v1.0.NEW --file apps/api/Dockerfile .
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 5
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/web:v1.0.NEW --image okiru-pro/web:latest --force
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/api:v1.0.NEW --image okiru-pro/api:latest --force
kubectl rollout restart deployment/web -n okiru-pro
kubectl rollout restart deployment/api -n okiru-pro
kubectl rollout status deployment/web -n okiru-pro --timeout=120s
kubectl rollout status deployment/api -n okiru-pro --timeout=120s
kubectl get pods -n okiru-pro -l app=web -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
kubectl get pods -n okiru-pro -l app=api -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
# If old image persists: kubectl delete pod -l app=web -n okiru-pro && kubectl delete pod -l app=api -n okiru-pro
```

---

## PROMPT 0: Kill ALL Silent Fallbacks and Hardcoded Values (30 min)

> **Goal**: Eliminate every silent fallback and hardcoded RCOGP value from the system. Config must be explicitly loaded or the system must tell you it's missing. AutoFill button is the ONLY acceptable test data path.

```
The system has 100+ places that silently use hardcoded RCOGP Generic values when config is missing. This means selecting ICT/FSC/AGRI/QSE but having config fail to load gives you a scorecard with RCOGP numbers and NO error. Every single one must die.

I've audited the entire codebase. Here is the COMPLETE list — fix ALL of them.

## RULE: Config is REQUIRED, not optional. If it's missing, the system screams — it does NOT produce wrong numbers.

## EXCEPTION: `AutoFillButton.tsx` and `lakeTradingDemo.ts` are admin-only dev tools. Don't touch them.

---

### AREA 1: Backend — `apps/api/pipeline/sectorConfig.ts`

**Line 744** — `getSectorConfig()` silently returns RCOGP for unknown sectors:
```typescript
return match || RCOGP_GENERIC;  // KILL THIS
```
Fix: throw if no match. Add a separate `getSectorConfigSafe()` for display-only paths.

**Lines 747-757** — `detectSectorFromName()` silently returns RCOGP:
```typescript
return RCOGP_GENERIC;  // silent fallback at end
```
Fix: add `console.warn` so you can see when this fires.

---

### AREA 2: Backend — `apps/api/src/routes/scorecard.ts`

**The `sectorConfigToCalculatorConfig()` function (lines 400-536)** has ~50 `??` fallbacks with RCOGP values:
```typescript
own.votingRightsMaxPts ?? 4       // line 436
own.womenVotingMaxPts ?? 2        // line 437
own.economicInterestMaxPts ?? 4   // line 438
own.netValueMaxPts ?? 8           // line 439
own.economicInterestTarget ?? 0.25 // line 440
mc.boardBlackTarget ?? 0.5        // line 444
mc.boardBlackMaxPts ?? 2          // line 445
mc.boardBWTarget ?? 0.25          // line 446
mc.boardBWMaxPts ?? 1             // line 447
mc.execBlackTarget ?? 0.5         // line 448
mc.execBlackMaxPts ?? 2           // line 449
mc.execBWTarget ?? 0.25           // line 450
mc.execBWMaxPts ?? 1              // line 451
ee.disabledTarget ?? 0.02         // line 452 (x2)
pMc.maxPoints ?? 19               // line 457
sk.learningProgrammesMaxPts ?? 6  // line 464
sk.bursaryMaxPts ?? 4             // line 465
sk.overallSpendPercent ?? 3.5     // line 466 (x2)
sk.bursarySpendPercent ?? 2.5     // line 467 (x2)
sk.disabledSpendPercent ?? 0.3    // line 471
pr.allSuppliersTarget ?? 0.8     // line 480 (and all procurement lines)
pr.bo51MaxPts ?? 11               // line 487
esd.sdMaxPts ?? 10                // line 494
esd.edMaxPts ?? 5                 // line 495
sed.maxPts ?? 5                   // line 500
pOwn.maxPoints ?? 25              // line 514
pMc.maxPoints ?? 19               // line 515
pSk.maxPoints ?? 25               // line 517
pPp.maxPoints ?? 29               // line 518
pSd.maxPoints ?? 10               // line 519
pEd.maxPoints ?? 7                // line 520
pSed.maxPoints ?? 5               // line 521
```

**Fix**: This function takes a FULL SectorConfig object as input — the values are ALWAYS present on SectorConfig (they're not optional fields). Remove every `??` — just use the value directly:
```typescript
// BEFORE (bad):
votingRightsMax: own.votingRightsMaxPts ?? 4,
// AFTER (correct):
votingRightsMax: own.votingRightsMaxPts,
```
The only exception: arrays that might be empty (`recognitionTable || []`, `levelThresholds || []`, etc.) — those guard against missing arrays, which is fine.

**Lines 503-508** — YES config is ENTIRELY hardcoded with no source:
```typescript
yes: {
  tier1Points: 1.5, tier2Points: 1, tier3Points: 0.5,
  tier1Multiplier: 2.5, tier2Multiplier: 1.5, tier3Multiplier: 1,
  headcountTarget5: 0.025, headcountTarget10: 0.015, headcountTarget15: 0.01,
  blackYouthPercent: 0.55,
},
```
Fix: Add YES config to `SectorConfig.targets` interface and populate from the Excel toolkits (or at minimum add a `// TODO: extract from toolkit` and keep these as they are for now since YES is sector-independent).

**Line 509** — discounting hardcoded:
```typescript
discounting: { dropLevels: 1, maxDropLevel: 4 },
```
Fix: `maxDropLevel` should be 8 (not 4). Level 8 drops to non-compliant. And this should come from config.

**Lines 570-578** — sector-config endpoint silently falls back to hardcoded when ArangoDB is down. This is fine AS LONG as it logs clearly (it already does with `console.warn`). Keep this but make sure the response includes `source: 'hardcoded'` so the frontend knows.

---

### AREA 3: Frontend calculators

**`management.ts` lines 10-26** — 8 hardcoded constants:
```typescript
const BOARD_BLACK_TARGET = 0.50;     // RCOGP-specific
const BOARD_WOMEN_TARGET = 0.25;     // RCOGP-specific
const EXEC_BLACK_TARGET = 0.50;      // RCOGP-specific
const EXEC_WOMEN_TARGET = 0.25;      // RCOGP-specific
const OTHER_EXEC_BLACK_TARGET = 0.60;// RCOGP-specific
const OTHER_EXEC_WOMEN_TARGET = 0.30;// RCOGP-specific
const DISABLED_TARGET = 0.03;        // WRONG (should be 0.02) AND RCOGP-specific
const MAX_TOTAL = 19;                // RCOGP-specific
```
Fix: These constants are ONLY used as `??` fallbacks (e.g., `cfg?.boardBlackTarget ?? BOARD_BLACK_TARGET`). Once config is required, these constants become dead code. Remove them and make `config` required (not optional) on `calculateManagementScore`. If config is null, throw — don't calculate with wrong numbers.

**`procurement.ts` lines 6-11** — hardcoded tables:
```typescript
const DEFAULT_RECOGNITION_TABLE = { 1: 1.35, 2: 1.25, ... };
const DEFAULT_BLACK_WOMEN_OWNERSHIP_THRESHOLD = 0.30;
```
Fix: Same approach — these are fallbacks for when config is null. Make config required.

**`ownership.ts` line 9** — `const MAX_TOTAL = 25;` (RCOGP only)
Fix: Remove, use config.

**`esd-sed.ts` lines 7-28** — `DEFAULT_BENEFIT_FACTORS` (14 entries)
Fix: This one is actually OK to keep as a default — benefit factors are standardized across all sectors per the B-BBEE Act. But it should still be overridable via config.

**`store.ts` line 246** — `RECOGNITION_LEVELS` hardcoded array. Already has config-aware code at line 284-290. Remove the constant.

**`exportExcel.ts` line 403** — its own copy of `RECOGNITION_TABLE`. Fix: import from shared location.

---

### AREA 4: Frontend pages

**`DocumentProcessor.tsx` line 1798** — sector silently defaults to RCOGP:
```typescript
`/api/scorecard/sector-config/${ci.sectorCode || 'RCOGP'}/${scorecardType.scorecardType || 'Generic'}`
```
Fix: If `ci.sectorCode` is empty, show a validation error ("Select a sector"). Don't silently pick RCOGP.

**`DocumentProcessor.tsx` line 1809** — acknowledged fallback, never fixed:
```typescript
// Fallback: calculators will use hardcoded defaults
```
Fix: If sector config fails to load, show a toast error. Don't proceed with calculation.

**`DocumentProcessor.tsx` lines 4201-4211** — `LEGACY_PILLARS` hardcoded for display:
```typescript
const LEGACY_PILLARS = [
  { key: 'ownership', label: 'Ownership', target: 25 },
  { key: 'managementControl', label: 'Management Control', target: 19 },
  { key: 'skillsDevelopment', label: 'Skills Development', target: 25 },
  { key: 'procurement', label: 'Preferential Procurement', target: 29 },
  ...
];
```
Fix: Pull targets from the scorecard result's own `.target` values (which already exist in the data), not from hardcoded constants. Or read from `calculatorConfig`.

**`DocumentProcessor.tsx` line 4169** — `let totalTarget = 120;`
Fix: Initialize to 0 or read from config. 120 is RCOGP-specific.

---

### AREA 5: What to KEEP (legitimate, not fallbacks)

- `AutoFillButton.tsx` + `lakeTradingDemo.ts` — admin dev tools, explicit user action
- `STANDARD_LEVELS` in `sectorConfig.ts` — these ARE the config (not a fallback of config)
- `STANDARD_RECOGNITION_TABLE` — same, part of the config definition
- `STANDARD_BENEFIT_FACTORS` — sector-independent per B-BBEE Act
- `STANDARD_CATEGORY_WEIGHTINGS` — sector-independent
- `STANDARD_INDUSTRY_NORMS` — SARS reference data
- `excelParser.ts` fallback sheet scanning — this is parsing strategy, not value defaults
- `llmExtractor.ts` Groq fallback — infrastructure resilience, not value defaults
- `BuildPillarsStep.tsx` — already dynamic via `usePillarConfig()` — GOOD, don't touch

---

## Implementation approach:

The fix is NOT just removing `??`. It's a 3-step pattern:

1. **Make config required on calculators** — change function signatures from `config?: CalculatorConfig` to `config: CalculatorConfig`. This makes TypeScript enforce that config is always passed.

2. **Guard at the store level** — in `_recalculateAll()`, if `calculatorConfig` is null, don't calculate. Set a `configMissing: true` flag on the scorecard. The UI should show "Select a sector and load config" instead of fake numbers.

3. **Remove dead constants** — once config is required, the `const BOARD_BLACK_TARGET = 0.50` etc. become dead code. Remove them.

## Instructions:
1. Read ALL files listed above — every single one
2. Apply the fixes systematically: backend API first, then calculators, then store, then pages
3. For each calculator (`management.ts`, `procurement.ts`, `skills.ts`, `esd-sed.ts`, `ownership.ts`):
   a. Change `config?: CalculatorConfig` to `config: CalculatorConfig`
   b. Remove the `??` fallback constants
   c. Access config values directly (TypeScript will now enforce they exist)
4. In `store.ts`:
   a. Add the `configMissing` guard in `_recalculateAll`
   b. Remove `RECOGNITION_LEVELS` constant (use `calculatorConfig.levelThresholds`)
   c. Remove all `?? 25`, `?? 19`, `?? 29` etc. in `buildEmptyScorecard` and `calculateScorecard` — use config values directly
5. In `scorecard.ts` API route:
   a. Remove all `??` from `sectorConfigToCalculatorConfig` — the input SectorConfig always has these values
   b. Fix `discounting.maxDropLevel` from 4 to 8
6. In `DocumentProcessor.tsx`:
   a. Show error if sectorCode is empty (don't default to RCOGP)
   b. Show toast if sector config fails to load (don't silently continue)
   c. Replace `LEGACY_PILLARS` hardcoded targets with data from the scorecard result
   d. Change `let totalTarget = 120` to read from config
7. Run `npx tsc --noEmit` in both `apps/api` and `apps/web`

CRITICAL: Do NOT touch `AutoFillButton.tsx` or `lakeTradingDemo.ts`. Do NOT touch `sectorConfig.ts` VALUES (they're already correct). Do NOT touch `excelParser.ts` fallback scanning or `llmExtractor.ts` provider fallback — those are infrastructure resilience.

## DEPLOY after code changes:
$env:KUBECONFIG="C:\Users\Administrator\Documents\GitHub\okiru-pro-main\kubeconfig.yaml"
$env:PYTHONIOENCODING="utf-8"
# Check current tags, pick next version (e.g. v1.0.26):
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 3
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/api --orderby time_desc --top 3
# Build whichever changed (web, api, or both):
az acr build --registry okiruproacrde4d539b --image okiru-pro/web:v1.0.NEW --file apps/web/Dockerfile .
az acr build --registry okiruproacrde4d539b --image okiru-pro/api:v1.0.NEW --file apps/api/Dockerfile .
# NOTE: Azure CLI on Windows may crash with charmap error — build still completes. Wait ~3min.
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 5
# Tag as :latest:
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/web:v1.0.NEW --image okiru-pro/web:latest --force
# Verify digests match:
az acr manifest show-metadata --registry okiruproacrde4d539b --name okiru-pro/web:latest --query "digest" -o tsv
az acr manifest show-metadata --registry okiruproacrde4d539b --name okiru-pro/web:v1.0.NEW --query "digest" -o tsv
# Restart + verify:
kubectl rollout restart deployment/web -n okiru-pro
kubectl rollout status deployment/web -n okiru-pro --timeout=120s
kubectl get pods -n okiru-pro -l app=web -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
# If old image persists: kubectl delete pod -l app=web -n okiru-pro
# For API: replace "web" with "api" in all commands above.
```

---

## PROMPT 1: Fix CalculatorConfig Schema + Management Constant (30 min)

> **Goal**: Make the `CalculatorConfig` type complete so ALL calculator fields can be driven by config. Fix the disabled target constant.

```
I need to fix the CalculatorConfig interface in `apps/web/shared/schema.ts` and a hardcoded constant in `apps/web/Toolkit/src/lib/calculators/management.ts`.

## Problem 1: CalculatorConfig missing fields

The frontend calculators read fields from CalculatorConfig that don't exist on the interface. This causes silent fallback to hardcoded values even when config is provided.

Read these files to see every config field the calculators try to read:
- `apps/web/Toolkit/src/lib/calculators/management.ts` — reads `config.managementControl.boardBlackTarget`, `config.managementControl.boardBlackMaxPts`, etc. (lines 102-129)
- `apps/web/Toolkit/src/lib/calculators/skills.ts` — reads `config.skills.learningProgrammesMaxPts`, `config.skills.absorptionMaxPts`, etc. (lines 154-172)
- `apps/web/Toolkit/src/lib/calculators/procurement.ts` — reads config properly, already works
- `apps/web/Toolkit/src/lib/calculators/esd-sed.ts` — reads `config.esd.supplierDevMax`, `config.esd.enterpriseDevMax`, etc.
- `apps/web/Toolkit/src/lib/store.ts` — reads `config.pillarConfigs.ownership.maxPoints`, `config.pillarConfigs.enterpriseDevelopment.maxPoints`, etc. (lines 98-113)

Then read the current schema:
- `apps/web/shared/schema.ts` — the CalculatorConfig interface (lines 14-114)

The `managementControl` sub-type inside CalculatorConfig needs ALL the fields that `management.ts` reads:
```typescript
managementControl?: {
  maxPoints: number;
  subMinimumPercent?: number;
  boardBlackTarget?: number;
  boardBlackMaxPts?: number;
  boardBWTarget?: number;
  boardBWMaxPts?: number;
  execBlackTarget?: number;
  execBlackMaxPts?: number;
  execBWTarget?: number;
  execBWMaxPts?: number;
  otherExecBlackTarget?: number;
  otherExecBlackMaxPts?: number;
  otherExecBWTarget?: number;
  otherExecBWMaxPts?: number;
  seniorMaxPts?: number;
  seniorBWMaxPts?: number;
  middleMaxPts?: number;
  middleBWMaxPts?: number;
  juniorMaxPts?: number;
  juniorBWMaxPts?: number;
  disabledTarget?: number;
  disabledMaxPts?: number;
};
```

The `employmentEquity` sub-type needs:
```typescript
employmentEquity?: {
  maxPoints: number;
  disabledTarget?: number;
  disabledMaxPts?: number;
};
```

The `skills` sub-type needs these additional fields:
```typescript
skills: {
  // existing fields...
  learningProgrammesMaxPts?: number;
  bursaryMaxPts?: number;
  disabledLearningMaxPts?: number;
  learnershipsMaxPts?: number;
  absorptionMaxPts?: number;
  learnershipTargetPercent?: number;
  absorptionTargetPercent?: number;
};
```

The `pillarConfigs` sub-type needs:
```typescript
pillarConfigs?: {
  ownership?: { maxPoints: number; subMinimumPercent?: number };
  managementControl?: { maxPoints: number; subMinimumPercent?: number };
  employmentEquity?: { maxPoints: number };
  skillsDevelopment?: { maxPoints: number; subMinimumPercent?: number };
  preferentialProcurement?: { maxPoints: number; subMinimumPercent?: number };
  supplierDevelopment?: { maxPoints: number; subMinimumPercent?: number };
  enterpriseDevelopment?: { maxPoints: number; subMinimumPercent?: number };
  socioEconomicDevelopment?: { maxPoints: number };
  yesInitiative?: { maxPoints: number };
};
```

Also add `levelThresholds`:
```typescript
levelThresholds?: Array<{ level: number; minPoints: number; recognition?: number }>;
```

## Problem 2: DISABLED_TARGET constant

In `apps/web/Toolkit/src/lib/calculators/management.ts` line 25:
```typescript
const DISABLED_TARGET = 0.03;  // WRONG - should be 0.02
```
The config fallback at line 125 correctly reads from config, but if NO config is provided the constant 0.03 is used. Change it to 0.02 to match the Excel toolkit.

## Instructions:
1. Read `apps/web/shared/schema.ts` lines 14-114
2. Read `apps/web/Toolkit/src/lib/calculators/management.ts` lines 93-130 to see what it reads
3. Read `apps/web/Toolkit/src/lib/calculators/skills.ts` lines 149-172 to see what it reads
4. Read `apps/web/Toolkit/src/lib/store.ts` lines 96-115 to see what it reads
5. Add all missing fields to CalculatorConfig (all optional with `?`)
6. Fix DISABLED_TARGET from 0.03 to 0.02
7. Run `npx tsc --noEmit` in `apps/web` to verify no type errors

## DEPLOY after code changes:
$env:KUBECONFIG="C:\Users\Administrator\Documents\GitHub\okiru-pro-main\kubeconfig.yaml"
$env:PYTHONIOENCODING="utf-8"
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 3
az acr build --registry okiruproacrde4d539b --image okiru-pro/web:v1.0.NEW --file apps/web/Dockerfile .
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 5
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/web:v1.0.NEW --image okiru-pro/web:latest --force
az acr manifest show-metadata --registry okiruproacrde4d539b --name okiru-pro/web:latest --query "digest" -o tsv
az acr manifest show-metadata --registry okiruproacrde4d539b --name okiru-pro/web:v1.0.NEW --query "digest" -o tsv
kubectl rollout restart deployment/web -n okiru-pro
kubectl rollout status deployment/web -n okiru-pro --timeout=120s
kubectl get pods -n okiru-pro -l app=web -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
# If old image persists: kubectl delete pod -l app=web -n okiru-pro
# Replace "web" with "api" if API also changed. Build BOTH if changes span apps/web AND apps/api.
```

---

## PROMPT 2: Build sectorConfigToCalculatorConfig Bridge (30 min)

> **Goal**: Create a function that converts `SectorConfig` (backend) to `CalculatorConfig` (frontend) so the API can serve correct, sector-specific config to the frontend.

```
The backend has `SectorConfig` (in `apps/api/pipeline/sectorConfig.ts`) with correct values for all 6 sectors. The frontend needs `CalculatorConfig` (in `apps/web/shared/schema.ts`). There must be a bridge function that converts one to the other.

## What to do:

1. Read the `SectorConfig` interface: `apps/api/pipeline/sectorConfig.ts` lines 132-165
2. Read the `CalculatorConfig` interface: `apps/web/shared/schema.ts` lines 14-114
3. Search for any existing conversion: `rg "sectorConfigToCalculatorConfig\|sectorConfig.*calculatorConfig\|toCalculatorConfig" apps/api/`
4. Read the API route that serves calculator config: search for `getCalculatorConfig` or `calculator-config` in `apps/api/src/routes/`
5. Read `apps/web/Toolkit/src/lib/api.ts` to see how the frontend fetches the config

Then create or fix the conversion function. It should live in `apps/api/pipeline/sectorConfig.ts` (or a new file `apps/api/pipeline/sectorConfigBridge.ts`):

```typescript
export function sectorConfigToCalculatorConfig(cfg: SectorConfig): CalculatorConfig {
  const pc = cfg.pillarConfigs;
  const t = cfg.targets;
  return {
    totalMaxPoints: cfg.totalMaxPoints,
    ownership: {
      votingRightsMax: t.ownership.votingRightsMaxPts,
      womenBonusMax: t.ownership.womenVotingMaxPts,
      economicInterestMax: t.ownership.economicInterestMaxPts,
      netValueMax: t.ownership.netValueMaxPts,
      targetEconomicInterest: t.ownership.economicInterestTarget,
      subMinNetValue: pc.ownership.subMinimumPercent / 100,
    },
    management: {
      boardBlackTarget: t.managementControl.boardBlackTarget,
      boardBlackPoints: t.managementControl.boardBlackMaxPts,
      boardWomenTarget: t.managementControl.boardBWTarget,
      boardWomenPoints: t.managementControl.boardBWMaxPts,
      execBlackTarget: t.managementControl.execBlackTarget,
      execBlackPoints: t.managementControl.execBlackMaxPts,
      execWomenTarget: t.managementControl.execBWTarget,
      execWomenPoints: t.managementControl.execBWMaxPts,
    },
    managementControl: {
      maxPoints: pc.managementControl.maxPoints,
      subMinimumPercent: pc.managementControl.subMinimumPercent,
      boardBlackTarget: t.managementControl.boardBlackTarget,
      boardBlackMaxPts: t.managementControl.boardBlackMaxPts,
      boardBWTarget: t.managementControl.boardBWTarget,
      boardBWMaxPts: t.managementControl.boardBWMaxPts,
      execBlackTarget: t.managementControl.execBlackTarget,
      execBlackMaxPts: t.managementControl.execBlackMaxPts,
      execBWTarget: t.managementControl.execBWTarget,
      execBWMaxPts: t.managementControl.execBWMaxPts,
      otherExecBlackTarget: t.managementControl.otherExecBlackTarget,
      otherExecBlackMaxPts: t.managementControl.otherExecBlackMaxPts,
      otherExecBWTarget: t.managementControl.otherExecBWTarget,
      otherExecBWMaxPts: t.managementControl.otherExecBWMaxPts,
      seniorMaxPts: t.managementControl.seniorMaxPts,
      seniorBWMaxPts: t.managementControl.seniorBWMaxPts,
      middleMaxPts: t.managementControl.middleMaxPts,
      middleBWMaxPts: t.managementControl.middleBWMaxPts,
      juniorMaxPts: t.managementControl.juniorMaxPts,
      juniorBWMaxPts: t.managementControl.juniorBWMaxPts,
    },
    employmentEquity: {
      maxPoints: pc.employmentEquity?.maxPoints ?? 0,
      disabledTarget: t.employmentEquity.disabledTarget,
      disabledMaxPts: t.employmentEquity.disabledMaxPts,
    },
    // ... map ALL remaining fields (skills, procurement, esd, sed, yes, pillarConfigs, levelThresholds)
  };
}
```

Map EVERY field. Then find the API endpoint that returns calculator config to the frontend and make it call this function with the correct SectorConfig for the client's sector.

The API route is likely in `apps/api/src/routes/scorecardBuilder.ts` or `apps/web/server/routes.ts`. Search for `calculator-config` or `calculatorConfig`.

## Instructions:
1. Read both interfaces completely
2. Search for the API endpoint
3. Create the bridge function with complete field mapping
4. Wire it into the API endpoint
5. Run `npx tsc --noEmit` in `apps/api`

## DEPLOY after code changes:
$env:KUBECONFIG="C:\Users\Administrator\Documents\GitHub\okiru-pro-main\kubeconfig.yaml"
$env:PYTHONIOENCODING="utf-8"
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/api --orderby time_desc --top 3
az acr build --registry okiruproacrde4d539b --image okiru-pro/api:v1.0.NEW --file apps/api/Dockerfile .
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/api --orderby time_desc --top 5
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/api:v1.0.NEW --image okiru-pro/api:latest --force
az acr manifest show-metadata --registry okiruproacrde4d539b --name okiru-pro/api:latest --query "digest" -o tsv
az acr manifest show-metadata --registry okiruproacrde4d539b --name okiru-pro/api:v1.0.NEW --query "digest" -o tsv
kubectl rollout restart deployment/api -n okiru-pro
kubectl rollout status deployment/api -n okiru-pro --timeout=120s
kubectl get pods -n okiru-pro -l app=api -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
# If old image persists: kubectl delete pod -l app=api -n okiru-pro
# Also deploy web if schema.ts changed (shared types).
```

---

## PROMPT 3: Fix Session Stale Data (25 min)

> **Goal**: Stop old scorecard data from bleeding into new sessions.

```
When a user finishes one scorecard and starts a new one, old data persists. Here are the VERIFIED root causes from reading the actual code:

## Root Cause 1: `clearData()` has zero callers

In `apps/web/Toolkit/src/lib/store.ts`, `clearData()` is defined at line 605 but grep shows NO callers anywhere in the codebase. It resets all pillar data but does NOT reset `calculatorConfig`.

**Fix**: 
1. Add `calculatorConfig: null` to the `clearData()` reset (line 605-623)
2. Add a new `startNewSession` action to the store interface and implementation:

```typescript
// In the interface (around line 149):
startNewSession: () => void;

// In the implementation:
startNewSession: () => {
  // Clear all store data including calculatorConfig
  set({
    isLoaded: false,
    activeClientId: null,
    client: emptyClient,
    ownership: emptyOwnership,
    management: emptyManagement,
    skills: emptySkills,
    procurement: emptyProcurement,
    esd: emptyESD,
    sed: emptySED,
    scorecard: buildEmptyScorecard(),
    pipelineOverrides: null,
    calculatorConfig: null,
    isScenarioMode: false,
    activeScenarioId: null,
    scenarios: [],
    baseSnapshot: null,
  });
  // Clear stale sessionStorage
  try {
    const keys = Object.keys(sessionStorage);
    for (const key of keys) {
      if (key.startsWith('okiru-processor-build-flow')) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {}
},
```

## Root Cause 2: Split localStorage keys

`DocumentProcessor.tsx` line 370-371 uses `okiru-pro-active-client-${userId}` while `client-context.tsx` uses `okiru-pro-active-client`. They point to different stored values.

**Fix in `apps/web/src/pages/DocumentProcessor.tsx`**:
Find `getActiveClientStorageKey` (line 370) and change it to always use the same key as ClientProvider:
```typescript
const getActiveClientStorageKey = (_userId: string | undefined) => 'okiru-pro-active-client';
```

## Root Cause 3: React Query staleTime: Infinity

`apps/web/Toolkit/src/lib/queryClient.ts` line 51: `staleTime: Infinity` means cached data NEVER expires.

**Fix**: Change to a reasonable timeout:
```typescript
staleTime: 5 * 60 * 1000,  // 5 minutes
```

## Root Cause 4: `startNewSession` not called on "new scorecard" entry points

**Fix in `apps/web/src/pages/DocumentProcessor.tsx`**:
Find where `?new=true` is handled or where a new session is created. Call `useBbeeStore.getState().startNewSession()` at that point. Search for `?new=true`, `new=true`, or `generateSessionId()`.

## Instructions:
1. Read `apps/web/Toolkit/src/lib/store.ts` — lines 605-623 (clearData) and the interface
2. Read `apps/web/src/pages/DocumentProcessor.tsx` — lines 360-420 (storage keys, session creation)
3. Read `apps/web/Toolkit/src/lib/queryClient.ts` — line 51 (staleTime)
4. Read `apps/web/Toolkit/src/lib/client-context.tsx` — lines 14-19 (localStorage key)
5. Apply all 4 fixes
6. Run `npx tsc --noEmit` in `apps/web`

IMPORTANT: Do NOT break the "resume in-progress session" flow. Only clear state when explicitly starting a NEW session.

## DEPLOY after code changes:
$env:KUBECONFIG="C:\Users\Administrator\Documents\GitHub\okiru-pro-main\kubeconfig.yaml"
$env:PYTHONIOENCODING="utf-8"
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 3
az acr build --registry okiruproacrde4d539b --image okiru-pro/web:v1.0.NEW --file apps/web/Dockerfile .
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 5
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/web:v1.0.NEW --image okiru-pro/web:latest --force
az acr manifest show-metadata --registry okiruproacrde4d539b --name okiru-pro/web:latest --query "digest" -o tsv
az acr manifest show-metadata --registry okiruproacrde4d539b --name okiru-pro/web:v1.0.NEW --query "digest" -o tsv
kubectl rollout restart deployment/web -n okiru-pro
kubectl rollout status deployment/web -n okiru-pro --timeout=120s
kubectl get pods -n okiru-pro -l app=web -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
# If old image persists: kubectl delete pod -l app=web -n okiru-pro
```

---

## PROMPT 4: Fix Backend sectorCalculators.ts MC Calculation (25 min)

> **Goal**: Fix the pipeline path's MC calculator which only scores Board+Exec, ignoring 5 other management levels.

```
The backend `calcMCSector()` in `apps/api/pipeline/sectorCalculators.ts` (line 63-89) is incomplete. It only calculates Board and Executive scores, completely ignoring:
- Other Executive Management
- Senior Management (EAP-based)
- Middle Management (EAP-based)
- Junior Management (EAP-based)
- Disabled employees

This means any scorecard generated through the upload/pipeline path (`buildResult.ts` → `buildPipelineResult()`) will have an MC score that's too low because it only counts 4 of the possible 19 points.

## Current code (line 63-89):
```typescript
export function calcMCSector(employees, cfg) {
  // Only groups Board and Executive
  // Only calculates boardBlackPts, boardBWPts, execBlackPts, execBWPts
  // Returns their sum capped at maxPts
  // MISSING: otherExec, senior, middle, junior, disabled
}
```

## Fix:
Rewrite `calcMCSector` to match the frontend's `calculateManagementScore()` logic in `apps/web/Toolkit/src/lib/calculators/management.ts`. That calculator is complete and correct — it handles all management levels.

Read these files:
1. `apps/api/pipeline/sectorCalculators.ts` — the broken backend version (lines 63-89)
2. `apps/web/Toolkit/src/lib/calculators/management.ts` — the correct frontend version (all 265 lines)
3. `apps/api/pipeline/sectorConfig.ts` — the MCTargets and EETargets interfaces (lines 31-58)

The fixed `calcMCSector` should:
1. Group employees by designation (Board, Executive, Other Executive Management, Senior, Middle, Junior)
2. Calculate proportional scores for each group using the targets from `cfg.targets.managementControl`
3. Calculate disabled employee score using `cfg.targets.employmentEquity`
4. Include EAP-based targets for Senior/Middle/Junior (use national defaults: Senior=0.731, Middle=0.786, Junior=0.845 for black; Senior=0.341, Middle=0.425, Junior=0.512 for women)
5. Sum all scores, cap at `cfg.pillarConfigs.managementControl.maxPoints`
6. Return the total

Also check `calcEESector` (line 91-113) — it calculates Senior/Middle/Junior/Disabled separately. Since RCOGP combines MC+EE into one 19-point pillar, the `buildResult.ts` adds `mcScore + eeScore`. Verify the two don't double-count.

Look at `buildResult.ts` lines 96-99:
```typescript
const mcScore = calcMCSector(parsed.employees, sectorCfg);
const eeScore = calcEESector(parsed.employees, sectorCfg);
```

And lines 109-112 where they're combined:
```typescript
managementControl: r2(mcScore),
employmentEquity: r2(eeScore),
```

For RCOGP Generic, `employmentEquity.maxPoints` is 0 in pillarConfigs, so `calcEESector` should return 0 (verify this). If it returns non-zero despite maxPoints=0, that's a bug.

## Instructions:
1. Read `apps/api/pipeline/sectorCalculators.ts` completely
2. Read `apps/web/Toolkit/src/lib/calculators/management.ts` for the correct logic
3. Fix `calcMCSector` to include all management levels
4. Verify `calcEESector` returns 0 when `employmentEquity.maxPoints` is 0
5. Run `npx tsc --noEmit` in `apps/api`

## DEPLOY after code changes:
$env:KUBECONFIG="C:\Users\Administrator\Documents\GitHub\okiru-pro-main\kubeconfig.yaml"
$env:PYTHONIOENCODING="utf-8"
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/api --orderby time_desc --top 3
az acr build --registry okiruproacrde4d539b --image okiru-pro/api:v1.0.NEW --file apps/api/Dockerfile .
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/api --orderby time_desc --top 5
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/api:v1.0.NEW --image okiru-pro/api:latest --force
az acr manifest show-metadata --registry okiruproacrde4d539b --name okiru-pro/api:latest --query "digest" -o tsv
az acr manifest show-metadata --registry okiruproacrde4d539b --name okiru-pro/api:v1.0.NEW --query "digest" -o tsv
kubectl rollout restart deployment/api -n okiru-pro
kubectl rollout status deployment/api -n okiru-pro --timeout=120s
kubectl get pods -n okiru-pro -l app=api -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
# If old image persists: kubectl delete pod -l app=api -n okiru-pro
```

---

## PROMPT 5: Lake Trading Validation — Existing Paths (20 min)

> **Goal**: Verify that Prompts -1 through 4 produce the exact Lake Trading scores through BOTH the pipeline path and frontend path. Fix any remaining discrepancies before building the UCS.

```
Lake Trading is our RCOGP Generic ground truth. After fixing the level rule (P-1), fallbacks (P0), config types (P1-P2), sessions (P3), and MC calculator (P4), the system must produce these EXACT scores through BOTH existing paths:

| Element | Expected | Max |
|---------|----------|-----|
| Ownership | 25.00 | 25 |
| Management Control | 11.77 | 19 |
| Skills Development | 0.00 | 25 |
| Preferential Procurement | 20.33 | 29 |
| Supplier Development | 3.69 | 10 |
| Enterprise Development | 2.36 | 7 |
| Socio-Economic Development | 0.41 | 5 |
| **Total** | **63.56** | **120** |
| **Level** | **7** | |
| **Discounted Level** | **8** | (Skills + SD sub-minimums failed) |

Reference: `docs/SCORECARD_GROUND_TRUTH.md` section 7.

## Check 1: Run existing unit tests

cd apps/api && npx vitest run --reporter=verbose pipeline/__tests__/lakeTrading.test.ts

ALL tests must pass. If any fail, trace through the calculator to find the bug.

## Check 2: Verify the pipeline path (buildResult.ts → sectorCalculators.ts)

Read `apps/api/pipeline/buildResult.ts` — verify:
- Level thresholds use ≥70 for L6 (fixed in P-1)
- Sub-minimum checks include SD (fixed in P-1)
- MC score uses complete calculator (fixed in P4)
- All `??` fallbacks removed (fixed in P0)

## Check 3: Verify the frontend path (store.ts → calculators)

Read `apps/web/Toolkit/src/lib/store.ts` `calculateScorecard()` — verify:
- `pointsToLevel(63.56)` returns 7
- Skills sub-min: `skillScore.subMinimumMet` is false when skills = 0
- SD sub-min: `esdScore.sdSubMinimumMet` is false when SD = 3.69 < 4.0
- `isDiscounted` is true, `discountedLevel` is 8
- Config is now REQUIRED (not optional with fallbacks)

## Check 4: Verify the two paths agree

Both paths should produce identical results for the same input. If they don't, document exactly WHERE they diverge. This divergence is what the UCS (Prompts 6-9) will fix by making them share the same engine.

## Instructions:
1. Run unit tests
2. Read `apps/api/pipeline/buildResult.ts` — verify fixes from P-1 and P4
3. Read `apps/web/Toolkit/src/lib/store.ts` — verify frontend path
4. Compare results from both paths
5. Fix any remaining discrepancies
6. Document any path divergences for P6-P9

## DEPLOY after code changes (build BOTH web and api):
$env:KUBECONFIG="C:\Users\Administrator\Documents\GitHub\okiru-pro-main\kubeconfig.yaml"
$env:PYTHONIOENCODING="utf-8"
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 3
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/api --orderby time_desc --top 3
az acr build --registry okiruproacrde4d539b --image okiru-pro/web:v1.0.NEW --file apps/web/Dockerfile .
az acr build --registry okiruproacrde4d539b --image okiru-pro/api:v1.0.NEW --file apps/api/Dockerfile .
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 5
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/web:v1.0.NEW --image okiru-pro/web:latest --force
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/api:v1.0.NEW --image okiru-pro/api:latest --force
kubectl rollout restart deployment/web -n okiru-pro
kubectl rollout restart deployment/api -n okiru-pro
kubectl rollout status deployment/web -n okiru-pro --timeout=120s
kubectl rollout status deployment/api -n okiru-pro --timeout=120s
kubectl get pods -n okiru-pro -l app=web -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
kubectl get pods -n okiru-pro -l app=api -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
# If old image persists: kubectl delete pod -l app=web -n okiru-pro && kubectl delete pod -l app=api -n okiru-pro
```

---

## PROMPT 6: Complete the Unified Calculation Service Engine (40 min)

> **Goal**: Make `calculationEngine.ts` a fully working calculation service. Implement `computeDerivedInputs`, accept full entity arrays, add data validation. This is the engine both manual and upload paths will eventually call.

```
The `calculationEngine.ts` already describes itself as "the unified calculator" but it can't actually calculate — `computeDerivedInputs()` has TODO placeholders that return 0 for all aggregations. Fix this so the engine produces correct scores when given real entity data.

## CONTEXT: This is the HEART of the Unified Calculation Service (UCS)

Both manual form completion and upload extraction produce entity values. Both should flow through this ONE engine:
- Manual path: Form data → entity values → calculationEngine → ScorecardResult
- Upload path: Extracted data → entity values → calculationEngine → ScorecardResult

The engine already has: ArangoDB config resolution, manifest loading, formula registry, sub-minimum tracking, level determination with discounting, audit trail.

What's MISSING is the ability to process real entity data (employees, shareholders, suppliers, contributions).

## Problem 1: computeDerivedInputs returns zeros

In `apps/api/pipeline/rules/calculationEngine.ts` lines 194-231:
- Management control: `computed[key] = 0; // TODO: Implement`
- Ownership: `computed.yearsHeld = 0; // TODO: Implement`

## Problem 2: CalculationOptions doesn't accept entity arrays

The `CalculationOptions` interface (line 574) has TODO comments for employees/shareholders/suppliers arrays that are never passed.

**Fix Step 1**: Expand `CalculationOptions`:
```typescript
export interface CalculationOptions {
  assessmentId: string;
  sectorCode: string;
  scorecardType: string;
  entityValues: Map<string, EntityValue>;
  crossPillarValues?: Map<string, number>;
  // Entity arrays for aggregation
  employees?: Array<{ 
    name: string; race: string; gender: string; 
    designation: string; isDisabled: boolean; 
  }>;
  shareholders?: Array<{ 
    name: string; blackOwnership: number; blackWomenOwnership: number; 
    shares: number; shareValue: number; yearsHeld?: number; 
  }>;
  suppliers?: Array<{ 
    name: string; spend: number; beeLevel: number; 
    blackOwnership: number; blackWomenOwnership: number; 
    enterpriseType: string; isDesignatedGroup?: boolean;
  }>;
  contributions?: Array<{ 
    beneficiary: string; type: string; amount: number; 
    category: 'sd' | 'ed' | 'sed'; benefitFactor?: number;
  }>;
  financials?: {
    revenue: number;
    npat: number;
    leviableAmount: number;
    tmps: number;
    headcount: number;
  };
}
```

**Fix Step 2**: Store these arrays in `CalculationContext` and implement `computeDerivedInputs`:

For MC/EE criteria:
- Filter employees by designation (Board, Executive, OtherExecutive, Senior, Middle, Junior)
- Count total and black at each level
- Calculate actual % vs EAP target for proportional scoring
- Count disabled employees

For Ownership criteria:
- Calculate weighted black ownership from shareholders
- Calculate economic interest and net value

For Procurement criteria:
- Calculate recognized spend per category (empowering, QSE, EME, BO51, BWO30, DG)
- Apply recognition multipliers based on supplier BEE level

For ESD/SED criteria:
- Sum contributions by category (SD, ED, SED)
- Apply benefit factors

**Fix Step 3**: Add DATA VALIDATION to the engine

Before calculating, the engine should check if required entity data is present. If not, return structured errors:
```typescript
interface ValidationResult {
  isValid: boolean;
  missingEntities: Array<{ pillar: string; field: string; reason: string }>;
  warnings: Array<{ pillar: string; field: string; message: string }>;
}
```

The engine should NOT silently produce zeros for missing data. It should say "Skills Development requires leviableAmount — not provided" etc.

## Problem 3: API endpoint doesn't send arrays

Read `apps/api/src/routes/scorecardBuilder.ts` — find the `/api/calculate` endpoint. Update it to accept the expanded `CalculationOptions` body (employees, shareholders, suppliers, contributions, financials).

## Problem 4: Frontend ScorecardBuilder doesn't send arrays

Read `apps/web/Toolkit/src/pages/ScorecardBuilder.tsx` — find where it calls `/api/calculate`. 
Read `apps/web/src/lib/foundationApi.ts` — find `populateAndScore`.

Update the frontend to send the full entity arrays when calling calculate.

## REFERENCE: The correct calculation logic ALREADY EXISTS in the frontend calculators

The frontend `management.ts`, `procurement.ts`, `skills.ts`, `esd-sed.ts`, `ownership.ts` are COMPLETE and CORRECT. Use their formulas as reference for implementing `computeDerivedInputs`. The key difference is that the UCS resolves targets/thresholds from ArangoDB config while the frontend reads them from `CalculatorConfig`.

## Instructions:
1. Read `apps/api/pipeline/rules/calculationEngine.ts` — full file, focus on computeDerivedInputs (194-231), CalculationOptions (574-584), createCalculationEngine (586-601)
2. Read the frontend calculators for reference logic:
   - `apps/web/Toolkit/src/lib/calculators/management.ts`
   - `apps/web/Toolkit/src/lib/calculators/procurement.ts`
   - `apps/web/Toolkit/src/lib/calculators/skills.ts`
   - `apps/web/Toolkit/src/lib/calculators/esd-sed.ts`
   - `apps/web/Toolkit/src/lib/calculators/ownership.ts`
3. Read `apps/api/src/routes/scorecardBuilder.ts` — find the calculate endpoint
4. Read `apps/web/Toolkit/src/pages/ScorecardBuilder.tsx` — find the calculate call
5. Expand CalculationOptions with entity arrays and financials
6. Implement computeDerivedInputs with REAL aggregation logic
7. Add validation that returns structured errors for missing data
8. Update the API endpoint to accept and forward expanded body
9. Update the frontend caller to send full entity data
10. Run `npx tsc --noEmit` in both `apps/api` and `apps/web`

IMPORTANT: Don't break the existing frontend calculator path yet. The manual build (store.ts → calculators/*.ts) continues to work as-is. This prompt makes the API engine CAPABLE of the same calculations. Prompt 8 will wire the manual path to use the UCS.

## DEPLOY after code changes (build BOTH web and api):
$env:KUBECONFIG="C:\Users\Administrator\Documents\GitHub\okiru-pro-main\kubeconfig.yaml"
$env:PYTHONIOENCODING="utf-8"
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 3
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/api --orderby time_desc --top 3
az acr build --registry okiruproacrde4d539b --image okiru-pro/web:v1.0.NEW --file apps/web/Dockerfile .
az acr build --registry okiruproacrde4d539b --image okiru-pro/api:v1.0.NEW --file apps/api/Dockerfile .
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 5
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/web:v1.0.NEW --image okiru-pro/web:latest --force
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/api:v1.0.NEW --image okiru-pro/api:latest --force
kubectl rollout restart deployment/web -n okiru-pro
kubectl rollout restart deployment/api -n okiru-pro
kubectl rollout status deployment/web -n okiru-pro --timeout=120s
kubectl rollout status deployment/api -n okiru-pro --timeout=120s
kubectl get pods -n okiru-pro -l app=web -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
kubectl get pods -n okiru-pro -l app=api -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
# If old image persists: kubectl delete pod -l app=web -n okiru-pro && kubectl delete pod -l app=api -n okiru-pro
```

---

## PROMPT 7: Store Ontology Snapshot for AI Guidance (25 min)

> **Goal**: When a scorecard is calculated, store the ArangoDB ontology (rules, thresholds, formulas) alongside the result so AI can later guide users on improving their score.

```
The system currently stores scorecard results but NOT the ontology/rules that produced them. When AI later wants to advise "here's how to improve from Level 8 to Level 7", it needs to know what rules, thresholds, and formulas were active during calculation.

## What to store

Create an `OntologySnapshot` that captures the calculation context:

```typescript
interface OntologySnapshot {
  // When and what was calculated
  calculatedAt: string;
  sectorCode: string;
  scorecardType: string;
  configSource: 'arango' | 'hardcoded';
  
  // The rules that drove calculation
  sectorConfig: {
    pillarConfigs: Record<string, { maxPoints: number; hasSubMinimum: boolean; subMinimumPercent: number }>;
    levelThresholds: Array<{ level: number; minPoints: number; recognition: number }>;
    totalMaxPoints: number;
  };
  
  // Per-pillar calculation trace
  pillarTraces: Array<{
    pillarCode: string;
    criteriaUsed: Array<{
      code: string;
      formulaId: string;
      target: number;
      maxPoints: number;
      actualValue: number;
      calculatedScore: number;
      inputs: Record<string, number>;
    }>;
    totalScore: number;
    subMinimumThreshold: number;
    subMinimumMet: boolean;
  }>;
  
  // What entity templates were used (for AI to know what fields matter)
  entityTemplateVersion: string;
  manifestPillars: string[]; // which pillar packs were in the manifest
  
  // What was missing or defaulted (for improvement suggestions)
  missingEntities: string[];
  zeroScorePillars: string[];
  nearSubMinimumPillars: Array<{ pillar: string; score: number; threshold: number; gap: number }>;
}
```

## Where to store it

1. **In the ScorecardResult returned by calculationEngine.ts** — extend the return type:
```typescript
interface ScorecardResult {
  // ... existing fields ...
  ontologySnapshot?: OntologySnapshot;
}
```

2. **In the ProcessorSession** — when `scorecardResult` is saved to MongoDB, the ontology goes with it.

3. **In ArangoDB ScoreResultRepository** — the `completeCalculationRun` already stores totals; extend to include the ontology snapshot.

## Implementation

1. Read `apps/api/pipeline/rules/calculationEngine.ts` — the `calculateScorecard()` method already builds `pillarResults` and `criterionResults`. Capture these into the snapshot.

2. Read `apps/api/arango/repositories/` — find `ScoreResultRepository`. Extend `completeCalculationRun` to include the ontology snapshot.

3. In `calculationEngine.ts`, at the end of `calculateScorecard()`:
   - Build the OntologySnapshot from `this.context` (sectorConfig, manifest, pillarResults)
   - Include it in the returned ScorecardResult
   - Identify near-sub-minimum pillars (score within 20% of threshold) for AI improvement hints

4. In `apps/api/src/routes/scorecardBuilder.ts` (POST /api/calculate):
   - After calculation, store the ontology snapshot in ArangoDB alongside the score results
   - Return the snapshot to the frontend

## AI Guidance Data (future use, but store now)

The ontology snapshot enables questions like:
- "Your Skills Development is 0/25 — you need training programmes worth 3.5% of your leviable amount"
- "Your Supplier Development is 3.69/10 — you need R427K more in SD contributions to pass sub-minimum"
- "If you fix Skills sub-minimum, your level improves from 8 to 7 (50% recognition)"

These aren't implemented NOW, but storing the data NOW means you can build this later.

## Instructions:
1. Read `apps/api/pipeline/rules/calculationEngine.ts` — focus on calculateScorecard() return value
2. Read `apps/api/arango/repositories/` — find ScoreResultRepository
3. Read `apps/api/models.ts` — find ProcessorSession schema
4. Define the OntologySnapshot interface in a shared location
5. Build the snapshot in calculateScorecard()
6. Store it alongside scorecard results in both MongoDB and ArangoDB
7. Return it from the API calculate endpoint
8. Run `npx tsc --noEmit` in `apps/api`

## DEPLOY after code changes:
$env:KUBECONFIG="C:\Users\Administrator\Documents\GitHub\okiru-pro-main\kubeconfig.yaml"
$env:PYTHONIOENCODING="utf-8"
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/api --orderby time_desc --top 3
az acr build --registry okiruproacrde4d539b --image okiru-pro/api:v1.0.NEW --file apps/api/Dockerfile .
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/api --orderby time_desc --top 5
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/api:v1.0.NEW --image okiru-pro/api:latest --force
az acr manifest show-metadata --registry okiruproacrde4d539b --name okiru-pro/api:latest --query "digest" -o tsv
az acr manifest show-metadata --registry okiruproacrde4d539b --name okiru-pro/api:v1.0.NEW --query "digest" -o tsv
kubectl rollout restart deployment/api -n okiru-pro
kubectl rollout status deployment/api -n okiru-pro --timeout=120s
kubectl get pods -n okiru-pro -l app=api -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
# If old image persists: kubectl delete pod -l app=api -n okiru-pro
```

---

## PROMPT 8: Wire Manual Build Path to UCS (30 min)

> **Goal**: Make the manual build "Calculate Scorecard" button call the Unified Calculation Service instead of frontend-only calculators. Both manual and upload paths now use the same engine.

```
Currently the manual build path calculates entirely in the browser:
  store.ts → calculateScorecard() → management.ts, procurement.ts, etc.

This works but it's a SEPARATE implementation from the API engine. When the API engine is fixed (Prompt 6), both should converge.

## The change:

The manual build's "Calculate Scorecard" button should:
1. Collect all form data (foundation + pillar entities)
2. POST to `/api/calculate` with the full entity data
3. Receive the ScorecardResult (with ontology snapshot) from the UCS
4. Display it in the Toolkit

This means the Toolkit's scorecard is ALWAYS produced by the same engine that the upload path uses.

## What to keep

The frontend calculators (`management.ts`, `procurement.ts`, etc.) are still valuable for:
- Real-time preview/estimates while the user fills forms (before hitting Calculate)
- Offline capability (if needed)
- Validation hints in the UI

So DON'T delete them. But the FINAL scorecard (the one that gets saved, displayed on Summary, and exported) must come from the UCS.

## Implementation

1. Read `apps/web/src/pages/DocumentProcessor.tsx` — find the "Calculate" button or `populateAndScore` call
2. Read `apps/web/src/lib/foundationApi.ts` — find `populateAndScore`
3. Read `apps/web/Toolkit/src/lib/store.ts` — find `_recalculateAll` and `calculateScorecard`

4. In `foundationApi.ts` `populateAndScore()`:
   - Instead of setting store values and calling `_recalculateAll()`, collect all entity data into the `CalculationOptions` shape
   - POST to `/api/calculate` with the full entity payload
   - Parse the returned `ScorecardResult` (including ontology snapshot)
   - Set the store's `scorecard` from the API result

5. In `DocumentProcessor.tsx`:
   - The "Calculate Scorecard" button should call the updated `populateAndScore`
   - Show loading state while API processes
   - Show validation errors if the UCS returns missing entity warnings
   - On success, display the scorecard from the UCS result

6. In `store.ts`:
   - Add a new action `setScorecardFromAPI(result: ScorecardResult)` that sets the scorecard directly from an API result
   - Keep `_recalculateAll` for real-time preview, but the official scorecard comes from `setScorecardFromAPI`

## Upload path alignment

Read `apps/api/pipeline/buildResult.ts` — `buildPipelineResult`.
This function currently uses `sectorCalculators.ts`. Eventually it should also call `calculationEngine.ts` instead, but that's a separate refactor. For now, make sure both produce the same level determination (which Prompt -1 fixes).

## Instructions:
1. Read `apps/web/src/lib/foundationApi.ts` — populateAndScore
2. Read `apps/web/src/pages/DocumentProcessor.tsx` — find Calculate button/flow
3. Read `apps/web/Toolkit/src/lib/store.ts` — _recalculateAll, calculateScorecard
4. Read `apps/api/src/routes/scorecardBuilder.ts` — POST /api/calculate endpoint
5. Update populateAndScore to POST to /api/calculate
6. Add setScorecardFromAPI action to store
7. Update DocumentProcessor to show loading/errors from UCS
8. Test with Lake Trading data: autofill → Calculate → verify 63.56, Level 7, Discounted 8
9. Run `npx tsc --noEmit` in both `apps/api` and `apps/web`

CRITICAL: Keep the frontend calculators for real-time preview. Only the FINAL scorecard (saved, exported) must come from the UCS.

## DEPLOY after code changes (build BOTH web and api):
$env:KUBECONFIG="C:\Users\Administrator\Documents\GitHub\okiru-pro-main\kubeconfig.yaml"
$env:PYTHONIOENCODING="utf-8"
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 3
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/api --orderby time_desc --top 3
az acr build --registry okiruproacrde4d539b --image okiru-pro/web:v1.0.NEW --file apps/web/Dockerfile .
az acr build --registry okiruproacrde4d539b --image okiru-pro/api:v1.0.NEW --file apps/api/Dockerfile .
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 5
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/web:v1.0.NEW --image okiru-pro/web:latest --force
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/api:v1.0.NEW --image okiru-pro/api:latest --force
kubectl rollout restart deployment/web -n okiru-pro
kubectl rollout restart deployment/api -n okiru-pro
kubectl rollout status deployment/web -n okiru-pro --timeout=120s
kubectl rollout status deployment/api -n okiru-pro --timeout=120s
kubectl get pods -n okiru-pro -l app=web -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
kubectl get pods -n okiru-pro -l app=api -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
# If old image persists: kubectl delete pod -l app=web -n okiru-pro && kubectl delete pod -l app=api -n okiru-pro
```

---

## PROMPT 9: Lake Trading End-to-End Through UCS (20 min)

> **Goal**: Validate that the complete system — manual form → UCS → scorecard — produces exact Lake Trading results. This is the final acceptance test.

```
After all previous prompts, both manual and upload paths should flow through the Unified Calculation Service. Validate with Lake Trading.

## Test 1: Unit test (calculationEngine directly)

Run the existing Lake Trading test:
cd apps/api && npx vitest run --reporter=verbose pipeline/__tests__/lakeTrading.test.ts

## Test 2: API integration test

Create or update a test that calls `POST /api/calculate` with Lake Trading entity data:

```typescript
const response = await fetch('/api/calculate', {
  method: 'POST',
  body: JSON.stringify({
    assessmentId: 'lake-trading-test',
    sectorCode: 'RCOGP',
    scorecardType: 'Generic',
    financials: {
      revenue: 274953097,
      npat: 33862998,
      leviableAmount: 2069572,
      tmps: 133730345.99,
      headcount: 12,
    },
    employees: [/* Lake Trading employee data */],
    shareholders: [/* full black ownership */],
    suppliers: [
      { name: 'EME Bulk', spend: 133696348.453, beeLevel: 1, blackOwnership: 1.0, blackWomenOwnership: 0, enterpriseType: 'eme' },
      { name: 'QSE Small', spend: 2233217.8945, beeLevel: 4, blackOwnership: 1.0, blackWomenOwnership: 0, enterpriseType: 'qse' },
    ],
    contributions: [
      { beneficiary: 'SD Beneficiary', type: 'direct_cost', amount: 250000, category: 'sd' },
      { beneficiary: 'ED Beneficiary', type: 'direct_cost', amount: 160000, category: 'ed' },
      { beneficiary: 'OPERATION SMILE', type: 'grant', amount: 27500, category: 'sed' },
    ],
  }),
});

const result = await response.json();
// Assert: total = 63.56, level = 7, discountedLevel = 8
// Assert: ontologySnapshot is present
// Assert: ontologySnapshot.zeroScorePillars includes 'skillsDevelopment'
// Assert: ontologySnapshot.nearSubMinimumPillars includes SD (3.69 < 4.0, gap = 0.31)
```

## Test 3: Manual build E2E

1. Open the Toolkit in browser
2. Click AutoFill (loads Lake Trading data)
3. Click "Calculate Scorecard"
4. Verify the scorecard shows:
   - Total: 63.56/120
   - Level: 7
   - Discounted Level: 8
   - Skills: 0/25 (sub-minimum failed)
   - SD: 3.69/10 (sub-minimum failed)

## Test 4: Ontology stored

After calculation, verify that the ontology snapshot was stored:
- Check ProcessorSession.scorecardResult.ontologySnapshot in MongoDB
- Check ScoreResultRepository in ArangoDB for the calculation run with ontology data

## If any score doesn't match:

1. Check which calculation path was used (frontend-only vs UCS API)
2. If frontend-only: verify Prompt 8 was applied (Calculate button should call /api/calculate)
3. If UCS API: check computeDerivedInputs in calculationEngine.ts
4. Compare intermediate values against the Lake Trading test file's exact values

## Expected exact values (from Excel):
- Ownership: 25.00 (25/25)
- Management Control: 11.77 (11.765470494417864/19)
- Skills Development: 0.00 (0/25)
- Preferential Procurement: 20.33 (20.333988202597936/29)
- Supplier Development: 3.69 (3.6913447533499544/10)
- Enterprise Development: 2.36 (2.3624606421439704/7)
- Socio-Economic Development: 0.41 (0.40604792286849495/5)
- Grand Total: 63.56 (63.55931201537822/120)

## Instructions:
1. Run existing unit tests
2. Create API integration test with Lake Trading data
3. Test manual build E2E
4. Verify ontology storage
5. Fix any remaining discrepancies
6. Verify `npx tsc --noEmit` passes in both apps

## DEPLOY after code changes (build BOTH web and api):
$env:KUBECONFIG="C:\Users\Administrator\Documents\GitHub\okiru-pro-main\kubeconfig.yaml"
$env:PYTHONIOENCODING="utf-8"
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 3
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/api --orderby time_desc --top 3
az acr build --registry okiruproacrde4d539b --image okiru-pro/web:v1.0.NEW --file apps/web/Dockerfile .
az acr build --registry okiruproacrde4d539b --image okiru-pro/api:v1.0.NEW --file apps/api/Dockerfile .
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 5
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/web:v1.0.NEW --image okiru-pro/web:latest --force
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/api:v1.0.NEW --image okiru-pro/api:latest --force
kubectl rollout restart deployment/web -n okiru-pro
kubectl rollout restart deployment/api -n okiru-pro
kubectl rollout status deployment/web -n okiru-pro --timeout=120s
kubectl rollout status deployment/api -n okiru-pro --timeout=120s
kubectl get pods -n okiru-pro -l app=web -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
kubectl get pods -n okiru-pro -l app=api -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"
# If old image persists: kubectl delete pod -l app=web -n okiru-pro && kubectl delete pod -l app=api -n okiru-pro
```

---

## Execution Order & Dependencies

```
PROMPT -1 (Fix level rule)             ← CHECK THIS FIRST: 5 min, verifies level thresholds
    ↓
PROMPT 0 (Kill silent fallbacks)       ← Makes bugs visible, 30 min
    ↓
PROMPT 1 (CalculatorConfig schema)     ← Foundation: types must be right, 30 min
    ↓
PROMPT 2 (SectorConfig→CalcConfig)     ← Depends on P1 types, 30 min
    ↓
PROMPT 3 (Session stale data)          ← Independent but needs P1 types, 25 min
    ↓
PROMPT 4 (Backend MC calculator)       ← Fixes pipeline path, 25 min
    ↓
PROMPT 5 (Lake Trading validation)     ← Validates P-1 + P4 are correct, 20 min
    ↓
PROMPT 6 (UCS engine completion)       ← The HEART: complete calculationEngine.ts, 40 min
    ↓
PROMPT 7 (Ontology storage)            ← Store ArangoDB rules alongside results, 25 min
    ↓
PROMPT 8 (Wire manual to UCS)          ← Manual Calculate button → API engine, 30 min
    ↓
PROMPT 9 (Lake Trading E2E via UCS)    ← Final acceptance test through unified path, 20 min
```

### Phase Summary

| Phase | Prompts | Purpose | Time |
|-------|---------|---------|------|
| **Fix Foundations** | -1, 0, 1, 2 | Level rule, fallbacks, types, config bridge | ~1h 35min |
| **Fix Existing Paths** | 3, 4, 5 | Session bugs, MC calculator, Lake Trading validation | ~1h 10min |
| **Build UCS** | 6, 7, 8, 9 | Unified engine, ontology, wire paths, final validation | ~1h 55min |

### Quick Checks Between Prompts

```bash
# After Prompt -1:
cd apps/api && npx vitest run --reporter=verbose pipeline/__tests__/lakeTrading.test.ts
cd apps/web && npx tsc --noEmit
# Verify: Lake Trading = Level 7, Discounted Level 8

# After Prompt 0:
cd apps/api && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
# Test: loading scorecard for ICT without config → should warn, not silently use RCOGP

# After Prompt 1 & 2:
cd apps/web && npx tsc --noEmit
cd apps/api && npx tsc --noEmit

# After Prompt 3:
cd apps/web && npx tsc --noEmit

# After Prompt 4:
cd apps/api && npx tsc --noEmit

# After Prompt 5:
cd apps/api && npx vitest run --reporter=verbose pipeline/__tests__/lakeTrading.test.ts
# Expected: total=63.56, level=7, discountedLevel=8

# After Prompt 6:
cd apps/api && npx tsc --noEmit
# Test: POST /api/calculate with Lake Trading entity data → correct scores

# After Prompt 7:
cd apps/api && npx tsc --noEmit
# Verify: ontologySnapshot present in calculation result

# After Prompt 8:
cd apps/web && npx tsc --noEmit
# Test: AutoFill → Calculate → verify scorecard from API (not frontend-only)

# After Prompt 9:
# Full E2E: AutoFill → Calculate → 63.56 total, Level 7, Discounted 8
# Verify ontology stored in MongoDB and ArangoDB
```

---

## Key File Map (Current, Verified)

| Purpose | File | Current State | UCS Role |
|---------|------|---------------|----------|
| Sector configs (6 sectors) | `apps/api/pipeline/sectorConfig.ts` | Values CORRECT for all sectors | Reference data (ArangoDB overrides) |
| **Calculation engine (UCS)** | **`apps/api/pipeline/rules/calculationEngine.ts`** | **Has ArangoDB resolver, computeDerivedInputs has TODOs** | **THE unified calculator** |
| Sector calculators (pipeline) | `apps/api/pipeline/sectorCalculators.ts` | MC calculator INCOMPLETE (Board+Exec only) | Legacy — eventually replaced by UCS |
| Pipeline builder | `apps/api/pipeline/buildResult.ts` | Working, has discounting logic but wrong L6, missing SD submin | Legacy — eventually uses UCS |
| Level determination | `apps/api/pipeline/levelDetermination.ts` | Working, correct thresholds | Shared utility |
| Web pipeline level | `apps/web/lib/pipeline/buildResult.ts` | **WRONG L6 threshold (65 not 70)** | Fix in Prompt -1 |
| CalculatorConfig type | `apps/web/shared/schema.ts` | INCOMPLETE — missing many fields | Frontend config shape |
| Zustand store | `apps/web/Toolkit/src/lib/store.ts` | Already dynamic with config, clearData never called | Keep for preview, official score from API |
| Management calculator (FE) | `apps/web/Toolkit/src/lib/calculators/management.ts` | COMPLETE and correct, DISABLED_TARGET=0.03 wrong | Keep for preview |
| Skills calculator (FE) | `apps/web/Toolkit/src/lib/calculators/skills.ts` | COMPLETE and correct | Keep for preview |
| Procurement calculator (FE) | `apps/web/Toolkit/src/lib/calculators/procurement.ts` | COMPLETE and correct | Keep for preview |
| ESD/SED calculator (FE) | `apps/web/Toolkit/src/lib/calculators/esd-sed.ts` | COMPLETE and correct | Keep for preview |
| Client context | `apps/web/Toolkit/src/lib/client-context.tsx` | Uses `okiru-pro-active-client` | No change |
| QueryClient | `apps/web/Toolkit/src/lib/queryClient.ts` | staleTime: Infinity (problem) | Fix in Prompt 3 |
| DocumentProcessor | `apps/web/src/pages/DocumentProcessor.tsx` | Uses DIFFERENT localStorage key, silent RCOGP fallback | Wire to UCS in Prompt 8 |
| Ground truth | `docs/SCORECARD_GROUND_TRUTH.md` | Lake Trading: 63.56, level 7→8 | Acceptance test |
| Entity manifest | `apps/api/pipeline/extraction/entityManifest.ts` | ArangoDB + static entity definitions | Source of truth for entity templates |
| Seed ontology | `apps/api/pipeline/seedOntology.ts` | Converts manifests to ArangoDB shapes | Populates ArangoDB |
| Score results repo | `apps/api/arango/repositories/` | Stores per-criterion results | Extend for ontology snapshot |
| Foundation API | `apps/web/src/lib/foundationApi.ts` | `populateAndScore` uses frontend calculators | Wire to UCS in Prompt 8 |
| Lake Trading test | `apps/api/pipeline/__tests__/lakeTrading.test.ts` | Complete, verifies all pillar scores | Acceptance test |

---

## What NOT To Touch

- `sectorConfig.ts` values — they are already correct
- The frontend calculator logic (management, skills, procurement, esd-sed) — already correct, keep for real-time preview
- Upload/extraction quality — teammate is handling entity extraction
- Python Computation Engine — separate concern
- Auth/login — separate concern
- UI styling — not in scope
- `AutoFillButton.tsx` / `lakeTradingDemo.ts` — admin-only dev tools, explicitly allowed

---

## Deployment Workflow (Include in Every Prompt)

**Append this block at the end of EVERY prompt so the AI can build and deploy after making changes.**

```
## After all code changes, build and deploy:

### Environment setup (run once per terminal session):
$env:KUBECONFIG="C:\Users\Administrator\Documents\GitHub\okiru-pro-main\kubeconfig.yaml"
$env:PYTHONIOENCODING="utf-8"

### Step 1: Determine the next version tag
# Check current latest tags:
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 3
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/api --orderby time_desc --top 3
# Increment from the highest existing tag (e.g., v1.0.25 → v1.0.26)

### Step 2: Build on ACR
# For web changes:
az acr build --registry okiruproacrde4d539b --image okiru-pro/web:v1.0.NEW --file apps/web/Dockerfile .

# For API changes:
az acr build --registry okiruproacrde4d539b --image okiru-pro/api:v1.0.NEW --file apps/api/Dockerfile .

# NOTE: The Azure CLI on Windows may crash mid-stream with a charmap encoding error.
# The build still completes on ACR. Wait ~3 minutes, then verify.

### Step 3: Verify build completed
az acr repository show-tags --name okiruproacrde4d539b --repository okiru-pro/web --orderby time_desc --top 5

### Step 4: Tag as :latest (Kustomize deploys :latest)
az acr import --name okiruproacrde4d539b --source okiruproacrde4d539b.azurecr.io/okiru-pro/web:v1.0.NEW --image okiru-pro/web:latest --force

### Step 5: Verify digests match
az acr manifest show-metadata --registry okiruproacrde4d539b --name okiru-pro/web:latest --query "digest" -o tsv
az acr manifest show-metadata --registry okiruproacrde4d539b --name okiru-pro/web:v1.0.NEW --query "digest" -o tsv
# Both must return the same sha256 digest

### Step 6: Restart deployment
kubectl rollout restart deployment/web -n okiru-pro
kubectl rollout status deployment/web -n okiru-pro --timeout=120s

### Step 7: Verify running pod
kubectl get pods -n okiru-pro -l app=web -o jsonpath="{.items[0].status.containerStatuses[0].imageID}"

# If the pod still runs old image after restart:
# kubectl delete pod -l app=web -n okiru-pro

# For API deployment, replace "web" with "api" in steps 2-7.
# Build BOTH if changes span apps/web AND apps/api.

### Key references:
# ACR: okiruproacrde4d539b
# Namespace: okiru-pro
# Kubeconfig: C:\Users\Administrator\Documents\GitHub\okiru-pro-main\kubeconfig.yaml
# Web Dockerfile: apps/web/Dockerfile
# API Dockerfile: apps/api/Dockerfile
```
