# B-BBEE System Restructuring Plan
**Goal**: Single source of truth (ArangoDB) + Backend-only calculation (UCS) + Zero fallbacks

---

## Executive Summary

Current system has:
- 3 calculation paths (UCS, Zustand store.ts, frontend calculators)
- 84+ discrepancies between Excel toolkits and code
- Hardcoded fallbacks everywhere
- DocumentProcessor.tsx is 4600+ lines

Target architecture:
- ArangoDB = Only source of truth for sector rules
- UCS API = Only calculation engine
- Frontend = Data collection + display only
- Zero hardcoded values - fail loudly if config missing

---

## PHASE 1: Fix ArangoDB Sector Configs (Week 1)

### 1.1 Extract True Sector Configs from Excel
**Files to parse**: `docs/toolkits/analysis_*.txt`

| Sector | Excel File | Status |
|--------|------------|--------|
| RCOGP Generic | `BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx` | 3 criterion fixes needed |
| ICT Generic | `BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx` | 12 fixes needed |
| AGRI Generic | `BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx` | 11 fixes needed |
| FSC Generic | `BBBEE Toolkit (FSC) Template v1.0.xlsx` | Verify all - 63 sheets |
| RCOGP QSE | `BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx` | 9 fixes needed |
| ICT QSE | `BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx` | 10 fixes needed |

### 1.2 Critical Fixes Per Sector

#### RCOGP Generic (3 fixes)
```typescript
// apps/api/pipeline/sectorConfig.ts
RCOGP_GENERIC: {
  pillarConfigs: {
    managementControl: {
      execBWTarget: 0.25,      // WAS: 0.30
      execBWMaxPts: 1,         // WAS: 2
      disabledTarget: 0.02,    // WAS: 0.03
    }
  }
}
```

#### ICT Generic (12 fixes)
```typescript
ICT_GENERIC: {
  totalMaxPoints: 140,         // WAS: 133
  pillarConfigs: {
    preferentialProcurement: { maxPoints: 27 },  // WAS: 25
    enterpriseDevelopment: { maxPoints: 15 },     // WAS: 5
    socioEconomicDevelopment: { maxPoints: 12 },  // WAS: 5
    managementControl: {
      boardBlackPoints: 3,     // WAS: 2
      boardBWPoints: 2,        // WAS: 1
      execBlackPoints: 2,      // WAS: 3
      execBWPoints: 1,       // WAS: 2
      execBWTarget: 0.25,      // WAS: 0.30
      otherExecBlackPoints: 3, // WAS: 2
      otherExecBWPoints: 2,    // WAS: 1
    }
  }
}
```

#### AGRI Generic (11 fixes)
```typescript
AGRI_GENERIC: {
  pillarConfigs: {
    managementControl: { maxPoints: 23 },  // WAS: 19
    preferentialProcurement: { maxPoints: 27 },  // WAS: 25
    enterpriseDevelopment: { maxPoints: 7 },       // WAS: 5
    socioEconomicDevelopment: { maxPoints: 15 }, // WAS: 5
    // ... criterion-level fixes per audit
  }
}
```

#### RCOGP QSE (9 fixes)
```typescript
RCOGP_QSE: {
  totalMaxPoints: 108,  // WAS: 124
  pillarConfigs: {
    managementControl: { maxPoints: 15 },      // WAS: 19
    skillsDevelopment: { maxPoints: 30 },       // WAS: 25
    preferentialProcurement: { maxPoints: 21 }, // WAS: 25
    supplierDevelopment: { maxPoints: 5 },       // WAS: 15
    enterpriseDevelopment: { maxPoints: 5 },     // WAS: 10
  }
}
```

#### ICT QSE (10 fixes)
```typescript
ICT_QSE: {
  totalMaxPoints: 116,  // WAS: 124
  pillarConfigs: {
    managementControl: { maxPoints: 15 },       // WAS: 19
    skillsDevelopment: { maxPoints: 30 },      // WAS: 25
    preferentialProcurement: { maxPoints: 21 }, // WAS: 25
    supplierDevelopment: { maxPoints: 5 },      // WAS: 15
    enterpriseDevelopment: { maxPoints: 5 },   // WAS: 10
    socioEconomicDevelopment: { maxPoints: 12 }, // WAS: 5
  }
}
```

#### FSC Generic (Verify all)
- Has 63 sheets with FSC-specific pillars
- Sub-variants: Banks, Long-Term Insurers, Short-Term Insurers
- Needs manual verification of all 149 current points

### 1.3 Fix Industry Norms
**Current**: `STANDARD_INDUSTRY_NORMS` in `sectorConfig.ts` has 17 fabricated values
**Fix**: Use actual SARS data from `apps/web/Toolkit/src/lib/data/industry-norms.ts`

### 1.4 ArangoDB Seeding Script
```typescript
// scripts/seedSectorConfigs.ts
// Reads from corrected sectorConfig.ts
// Seeds ArangoDB with verified configs
// Fails if any config is missing or invalid
```

---

## PHASE 2: Remove Frontend Calculators (Week 1-2)

### 2.1 Delete Frontend Calculator Files
```bash
# These files should be DELETED:
apps/web/Toolkit/src/lib/calculators/ownership.ts
apps/web/Toolkit/src/lib/calculators/management.ts
apps/web/Toolkit/src/lib/calculators/skills.ts
apps/web/Toolkit/src/lib/calculators/procurement.ts
apps/web/Toolkit/src/lib/calculators/esd-sed.ts
apps/web/Toolkit/src/lib/calculators/yes.ts
apps/web/Toolkit/src/lib/calculators/shared.ts
```

### 2.2 Remove Zustand Calculation
**File**: `apps/web/Toolkit/src/lib/store.ts`

**Remove**:
- `_recalculateAll()` function (lines ~239-249)
- `calculateScorecard()` function
- All calculator imports
- Hardcoded `emptyScorecard` values

**Keep**:
- State management (Client, pillar data)
- API calls to UCS
- `setScorecardFromAPI()` only

### 2.3 Update BuildPillarsStep
**File**: `apps/web/src/components/build/BuildPillarsStep.tsx`

**Remove**:
- `usePillarScores()` hook that calculates locally
- Calculator function imports
- `getPillarScore()` callback

**Add**:
- Real-time polling to UCS `/api/calculate` on pillar data change
- Debounced calculation (500ms after last change)
- Display "Calculating..." state

---

## PHASE 3: Split DocumentProcessor (Week 2)

### 3.1 New File Structure
```
apps/web/src/pages/
├── DocumentProcessor.tsx          # Router/entry only (200 lines)
├── flows/
│   ├── UploadFlow.tsx              # Upload mode (1200 lines)
│   ├── BuildFlow.tsx               # Build mode (1200 lines)
│   └── index.ts
├── scorecard/
│   ├── ScorecardDisplay.tsx        # Pure display component (400 lines)
│   ├── ScorecardActions.tsx        # Save/Open in Toolkit buttons
│   └── index.ts
└── hooks/
    ├── useProcessorSession.ts      # Session persistence
    ├── useFlowNavigation.ts        # Step navigation logic
    └── index.ts
```

### 3.2 DocumentProcessor.tsx (New - 200 lines max)
```typescript
// Only responsibility: Route to correct flow
export default function DocumentProcessor() {
  const [flowMode] = useState<'upload' | 'build'>('build');
  
  return flowMode === 'upload' 
    ? <UploadFlow /> 
    : <BuildFlow />;
}
```

### 3.3 BuildFlow.tsx (New - 1200 lines)
```typescript
// Build mode: Foundation → Pillars → Scorecard
export function BuildFlow() {
  const [step, setStep] = useState<'foundation' | 'pillars' | 'scorecard'>('foundation');
  const [foundationData, setFoundationData] = useState(...);
  const [pillarData, setPillarData] = useState(...);
  const [scorecard, setScorecard] = useState(null);
  
  // Calculate via UCS only
  const calculateScorecard = async () => {
    const result = await fetch('/api/calculate', {
      method: 'POST',
      body: JSON.stringify({ pillarData, foundationData })
    });
    setScorecard(await result.json());
  };
  
  return (
    <Stepper activeStep={step}>
      <FoundationStep data={foundationData} onChange={setFoundationData} />
      <PillarsStep data={pillarData} onChange={setPillarData} />
      <ScorecardDisplay data={scorecard} onRecalculate={calculateScorecard} />
    </Stepper>
  );
}
```

### 3.4 ScorecardDisplay.tsx (New - 400 lines)
```typescript
// Pure display - no calculation
interface Props {
  data: ScorecardResult | null;
  loading?: boolean;
  error?: string;
  onRecalculate: () => void;
}

export function ScorecardDisplay({ data, loading, error, onRecalculate }: Props) {
  // Display only - all data comes from props
  // Shows loading spinner when calculating
  // Shows error if calculation failed
}
```

---

## PHASE 4: Make UCS the ONLY Calculator (Week 2-3)

### 4.1 UCS Endpoint Changes
**File**: `apps/api/pipeline/calculationService.ts`

**Current**: Mixed logic with some hardcoded fallbacks
**Target**: 
- Reads sector config from ArangoDB ONLY
- Throws error if sector config not found
- Throws error if any required field is missing
- Returns complete scorecard with all pillars

```typescript
export async function calculateScorecard(input: CalculationInput) {
  // 1. Fetch sector config from ArangoDB
  const sectorConfig = await getSectorConfigFromArangoDB(input.sectorCode);
  if (!sectorConfig) {
    throw new Error(`Sector config not found: ${input.sectorCode}`);
  }
  
  // 2. Validate all required inputs present
  const missing = validateInputs(input, sectorConfig);
  if (missing.length > 0) {
    throw new Error(`Missing required inputs: ${missing.join(', ')}`);
  }
  
  // 3. Calculate (no fallbacks allowed)
  const result = performCalculation(input, sectorConfig);
  
  // 4. Return
  return result;
}
```

### 4.2 Remove All Frontend Calculation

**Files to update**:
1. `apps/web/src/pages/DocumentProcessor.tsx` - Remove `normalizeUCSResult`, use UCS directly
2. `apps/web/src/components/build/BuildPillarsStep.tsx` - Remove `usePillarScores`, poll UCS
3. `apps/web/Toolkit/src/lib/store.ts` - Remove `_recalculateAll`, only `setScorecardFromAPI`

**Pattern everywhere**:
```typescript
// BAD (current):
const score = calculateOwnershipScore(data, config);

// GOOD (target):
const { scorecard } = await fetch('/api/calculate', { body: JSON.stringify(data) });
```

### 4.3 Add Loading States
- "Calculating scorecard..." spinner
- Debounced calculation (don't calculate on every keystroke)
- Error boundary for calculation failures

---

## PHASE 5: Zero Fallback Policy (Week 3)

### 5.1 Policy Definition
```typescript
// ZERO FALLBACKS - If data is missing, the system FAILS

// BAD:
const value = config.value ?? DEFAULT_VALUE;  // NEVER DO THIS

// GOOD:
if (config.value === undefined) {
  throw new Error('Config missing required field: value');
}
const value = config.value;
```

### 5.2 Files to Audit

| File | Lines to Check | Action |
|------|---------------|--------|
| `sectorConfig.ts` | All `??` operators | Replace with validation |
| `store.ts` | `emptyScorecard` | Remove - fetch from API |
| `calculationService.ts` | All defaults | Remove - throw instead |
| `BuildPillarsStep.tsx` | Hardcoded PILLARS | Use API config |

### 5.3 Validation Layer
```typescript
// apps/api/pipeline/validation.ts
export function validateSectorConfig(config: any): string[] {
  const errors: string[] = [];
  
  if (!config.totalMaxPoints) errors.push('totalMaxPoints required');
  if (!config.pillarConfigs) errors.push('pillarConfigs required');
  
  for (const [pillar, cfg] of Object.entries(config.pillarConfigs)) {
    if (cfg.maxPoints === undefined) errors.push(`${pillar}.maxPoints required`);
    if (cfg.subMinimumPercent === undefined) errors.push(`${pillar}.subMinimumPercent required`);
  }
  
  return errors;
}

// Call on startup - fail fast if configs invalid
const errors = validateSectorConfig(config);
if (errors.length > 0) {
  throw new Error(`Invalid sector config: ${errors.join(', ')}`);
}
```

---

## PHASE 6: End-to-End Testing (Week 4)

### 6.1 Test Cases (from SCORECARD_AUDIT_AND_FIXES.md)

| Test Case | Sector | Expected Total | Expected Level |
|-----------|--------|---------------|----------------|
| Lake Trading | RCOGP Generic | 63.56 | 7 (discounted to 8) |
| Zero Data | RCOGP Generic | 0 | 9 |
| Perfect Score | RCOGP Generic | 120 | 1 |
| Sub-Minimum Fail | RCOGP Generic | Varies | Discounted |

### 6.2 Test Each Sector
- [ ] RCOGP Generic
- [ ] ICT Generic
- [ ] AGRI Generic
- [ ] FSC Generic
- [ ] RCOGP QSE
- [ ] ICT QSE

### 6.3 Test Error Cases
- [ ] Missing sector config → Should fail loudly
- [ ] Missing pillar data → Should fail loudly
- [ ] Invalid calculator config → Should fail loudly

---

## Migration Order

**Week 1**:
1. Fix sector configs in `sectorConfig.ts` (Phase 1)
2. Seed ArangoDB with corrected configs
3. Remove frontend calculators (Phase 2)

**Week 2**:
1. Split DocumentProcessor (Phase 3)
2. UCS becomes only calculator (Phase 4)

**Week 3**:
1. Zero fallback policy (Phase 5)
2. Error handling

**Week 4**:
1. End-to-end testing (Phase 6)
2. Fix any remaining issues

---

## Success Criteria

- [ ] All 6 sectors have correct configs in ArangoDB
- [ ] No frontend calculation exists (all removed)
- [ ] UCS is the only calculation engine
- [ ] Zero hardcoded fallbacks anywhere
- [ ] Lake Trading test case produces 63.56/120
- [ ] DocumentProcessor is <500 lines (split into files)
- [ ] If config missing, system fails with clear error
- [ ] All 84+ discrepancies from audit are fixed

---

## Files to Delete

```bash
# Calculators (all frontend calculation)
apps/web/Toolkit/src/lib/calculators/ownership.ts
apps/web/Toolkit/src/lib/calculators/management.ts
apps/web/Toolkit/src/lib/calculators/skills.ts
apps/web/Toolkit/src/lib/calculators/procurement.ts
apps/web/Toolkit/src/lib/calculators/esd-sed.ts
apps/web/Toolkit/src/lib/calculators/yes.ts
apps/web/Toolkit/src/lib/calculators/shared.ts
apps/web/Toolkit/src/lib/calculators/index.ts

# Old DocumentProcessor (after split)
apps/web/src/pages/DocumentProcessor.tsx.bak
```

## New Files to Create

```bash
# Split DocumentProcessor
apps/web/src/pages/flows/UploadFlow.tsx
apps/web/src/pages/flows/BuildFlow.tsx
apps/web/src/pages/scorecard/ScorecardDisplay.tsx
apps/web/src/pages/scorecard/ScorecardActions.tsx
apps/web/src/pages/hooks/useProcessorSession.ts
apps/web/src/pages/hooks/useFlowNavigation.ts

# Validation
apps/api/pipeline/validation.ts

# Seeding
scripts/seedSectorConfigs.ts
```

---

## Team Task Assignment

### Backend Engineer
- Fix `sectorConfig.ts` (84+ discrepancies)
- Create ArangoDB seeding script
- Enhance UCS to be only calculator
- Add validation layer

### Frontend Engineer 1
- Remove Zustand calculation from `store.ts`
- Remove all calculator files
- Update BuildPillarsStep to poll UCS

### Frontend Engineer 2
- Split DocumentProcessor.tsx
- Create UploadFlow.tsx
- Create BuildFlow.tsx

### Frontend Engineer 3
- Create ScorecardDisplay.tsx
- Add loading states
- Add error boundaries

### QA Engineer
- Test all 6 sectors
- Verify Lake Trading = 63.56
- Test error cases (missing config, etc.)

---

**Next Action**: Review this plan, then start Phase 1 (sector config fixes).
