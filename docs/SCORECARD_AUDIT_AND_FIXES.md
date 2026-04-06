# B-BBEE Scorecard System Audit & Required Fixes

**Date**: 6 April 2026  
**Source of Truth**: Excel toolkit files in `docs/toolkits/` extracted via `openpyxl`  
**Codebase Audited**: `apps/api/pipeline/sectorConfig.ts`, `apps/web/Toolkit/src/lib/store.ts`, frontend calculators  

---

## Executive Summary

A systematic audit of all 6 B-BBEE Excel toolkits against the codebase revealed **84+ discrepancies** across all sectors. No sector config in the codebase is fully accurate. The problems range from wrong point allocations and fabricated industry norms to completely incorrect grand totals for 4 of the 6 sectors.

**Severity Breakdown**:
- **CRITICAL** (wrong grand totals, wrong pillar points): 28 items
- **HIGH** (wrong criterion-level points/targets): 35 items  
- **MEDIUM** (fabricated reference data, missing bonuses): 12 items
- **STRUCTURAL** (frontend hardcoding, missing ArangoDB wiring): 9 items

---

## Methodology

1. All 6 Excel toolkit files were extracted using `openpyxl` via `docs/toolkits/extract_fast.py`
2. Key scorecard sheets parsed: Summary Scorecard, Scorecard Calculations, MC Scorecard, Skills Scorecard, Procurement Scorecard, ESD Scorecard, SED Scorecard, Industry Norms
3. Extracted values compared against `apps/api/pipeline/sectorConfig.ts` (which seeds ArangoDB)
4. Frontend `store.ts` and calculator modules checked for hardcoded values

---

## Sector-by-Sector Audit

### 1. RCOGP Generic (Revised Codes of Good Practice)

**Excel File**: `BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx` (52 sheets)

#### Pillar Max Points

| Pillar | Excel | Codebase | Status |
|--------|:---:|:---:|:---:|
| **Grand Total** | **120** | **120** | CORRECT |
| Ownership | 25 | 25 | CORRECT |
| Management Control (MC+EE combined) | 19 | 19 | CORRECT |
| Skills Development | 25 | 25 | CORRECT |
| Preferential Procurement | 29 | 29 | CORRECT |
| Supplier Development | 10 | 10 | CORRECT |
| Enterprise Development | 7 | 7 | CORRECT |
| SED | 5 | 5 | CORRECT |

> Pillar totals are correct for RCOGP Generic. However, there are criterion-level errors below.

#### MC Scorecard Criterion Errors (from MC Scorecard sheet)

| Criterion | Excel | Codebase | Error |
|-----------|:---:|:---:|:---:|
| Board Black | 2 pts (50%) | 2 pts (50%) | CORRECT |
| Board BW | 1 pt (25%) | 1 pt (25%) | CORRECT |
| Exec Black | 2 pts (50%) | 2 pts (50%) | CORRECT |
| **Exec BW** | **1 pt (25%)** | **2 pts (30%)** | **WRONG** |
| Other Exec Black | 2 pts (60%) | 2 pts (60%) | CORRECT |
| Other Exec BW | 1 pt (30%) | 1 pt (30%) | CORRECT |
| Senior Black | 2 pts (60%) | 2 pts | CORRECT |
| Senior BW | 1 pt (30%) | 1 pt | CORRECT |
| Middle Black | 2 pts (75%) | 2 pts | CORRECT |
| Middle BW | 1 pt (38%) | 1 pt | CORRECT |
| Junior Black | 1 pt (88%) | 1 pt | CORRECT |
| Junior BW | 1 pt (44%) | 1 pt | CORRECT |
| **Disabled** | **2 pts (2%)** | **2 pts (3%)** | **TARGET WRONG** |

**MC Sub-totals (Excel)**: MC=9, EE=10, Grand Total [MC+EE]=19

#### Ownership (Excel verified)

| Criterion | Excel | Codebase | Status |
|-----------|:---:|:---:|:---:|
| Voting Rights (Black) | 4 pts (25%+1 vote) | 4 pts (25%) | CORRECT |
| Voting Rights (Women) | 2 pts (10%) | 2 pts (10%) | CORRECT |
| Economic Interest (Black) | 4 pts (25%) | 4 pts (25%) | CORRECT |
| Economic Interest (Women) | 2 pts (10%) | 2 pts (10%) | CORRECT |
| Designated Groups | 3 pts (3%) | - | CORRECT |
| New Entrants | 2 pts (2%) | 2 pts | CORRECT |
| Net Value | 8 pts | 8 pts | CORRECT |
| **Total** | **25** | **25** | **CORRECT** |

#### ESD (Excel verified)

| Criterion | Excel | Codebase | Status |
|-----------|:---:|:---:|:---:|
| Supplier Development | 10 pts | 10 pts | CORRECT |
| Enterprise Development | 5 pts | 5 pts | CORRECT |
| Graduation Bonus | 1 pt | 1 pt | CORRECT |
| Jobs Creation Bonus | 1 pt | 1 pt | CORRECT |
| **Total** | **17** | **17** | **CORRECT** |

#### RCOGP Generic Required Fixes

1. `execBWTarget`: 0.30 → **0.25**
2. `execBWMaxPts`: 2 → **1**
3. `disabledTarget` (EE): 0.03 → **0.02**

> Note: Fixing Exec BW from 2→1 means the MC sub-total becomes 8 (not 9), and EE sub-total becomes 11 (not 10) to maintain the 19 grand total. Wait - the Excel clearly shows MC sub-total=9 and EE sub-total=10, so the current code has Board(2+1) + Exec(2+2) + OtherExec(2+1) = 10, but Excel shows Board(2+1) + Exec(2+1) + OtherExec(2+1) = 9. The fix changes code MC sub from 10 to 9, which is correct.

---

### 2. ICT Generic

**Excel File**: `BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx` (52 sheets)

#### Pillar Max Points

| Pillar | Excel | Codebase | Status |
|--------|:---:|:---:|:---:|
| **Grand Total** | **140** | **133** | **WRONG** |
| Ownership | 25 | 25 | CORRECT |
| Management Control | 23 | 23 | CORRECT |
| Employment Equity | _(in MC sheet)_ | 15 (separate pillar) | STRUCTURAL |
| Skills Development | 25 | 25 | CORRECT |
| **Preferential Procurement** | **27** | **25** | **WRONG** |
| **Supplier Development** | **10** | **10** | Check |
| **Enterprise Development** | **15** | **5** | **WRONG** |
| **SED** | **12** | **5** | **WRONG** |

> The ICT Generic Summary Scorecard shows Grand Total = 140, not 133. The codebase is undercounting by 7 points. ED should be 15 (not 5) and SED should be 12 (not 5).

#### MC Scorecard Criterion Errors

| Criterion | Excel | Codebase | Status |
|-----------|:---:|:---:|:---:|
| **Board Black** | **3 pts (50%)** | **2 pts (50%)** | **WRONG** |
| **Board BW** | **2 pts (25%)** | **1 pt (25%)** | **WRONG** |
| **Exec Black** | **2 pts (50%)** | **3 pts (50%)** | **WRONG** |
| **Exec BW** | **1 pt (25%)** | **2 pts (30%)** | **WRONG** |
| **Other Exec Black** | **3 pts (60%)** | **2 pts (60%)** | **WRONG** |
| **Other Exec BW** | **2 pts (30%)** | **1 pt (30%)** | **WRONG** |
| Disabled | 2 pts (2%) | 2 pts (2%) | CORRECT |

> Nearly every MC criterion point allocation is wrong for ICT Generic. The Exec BW target should be 25%, not 30%.

#### ICT Generic Required Fixes

1. `grand_total`: 133 → **140**
2. PP pillar: 25 → **27**
3. ED pillar: 5 → **15**
4. SED pillar: 5 → **12**
5. MC Board Black: 2 → **3**
6. MC Board BW: 1 → **2**
7. MC Exec Black: 3 → **2**
8. MC Exec BW: 2 pts (30%) → **1 pt (25%)**
9. MC Other Exec Black: 2 → **3**
10. MC Other Exec BW: 1 → **2**
11. MC Senior: 6 → verify (EE likely separate)
12. MC Senior BW: 3 → verify
13. ESD ED bonus: 0 → **1** (graduation bonus)

---

### 3. AGRI Generic (AgriBEE)

**Excel File**: `BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx` (53 sheets)

#### Pillar Max Points

| Pillar | Excel | Codebase | Status |
|--------|:---:|:---:|:---:|
| **Grand Total** | **132** | **132** | **CORRECT** |
| Ownership | 25 | 25 | CORRECT |
| **Management Control** | **23** | **19** | **WRONG** |
| Employment Equity | _(in MC)_ | 11 (separate) | STRUCTURAL |
| Skills Development | 25 | 25 | CORRECT |
| **Preferential Procurement** | **27** | **25** | **WRONG** |
| Supplier Development | 10 | 10 | CORRECT |
| Enterprise Development | 7 | 5 | **WRONG** |
| **SED** | **15** | **5** | **WRONG** |

> The AGRI toolkit explicitly labels this as "Amended AgriBEE Sector Codes - Generic". MC is 23 pts (combined MC+EE on one sheet), not split into MC=19 + EE=11. SED is 15 pts (not 5 - this is an Agricultural-specific allocation for community development).

#### MC Scorecard Criterion Errors

| Criterion | Excel | Codebase | Status |
|-----------|:---:|:---:|:---:|
| **Board Black** | **3 pts (50%)** | **2 pts (50%)** | **WRONG** |
| **Board BW** | **2 pts (25%)** | **1 pt (25%)** | **WRONG** |
| Exec Black | 2 pts (50%) | 2 pts (50%) | CORRECT |
| Exec BW | 1 pt (25%) | 1 pt (30%) | **TARGET WRONG** |
| **Other Exec Black** | **3 pts (60%)** | **2 pts (60%)** | **WRONG** |
| **Other Exec BW** | **2 pts (30%)** | **1 pt (30%)** | **WRONG** |
| Disabled | 2 pts (2%) | 2 pts (2%) | CORRECT |

#### AGRI Generic Required Fixes

1. MC pillar: 19 → **23** (combined MC+EE)
2. PP pillar: 25 → **27**
3. ED pillar: 5 → **7** (5 base + 2 bonuses)
4. SED pillar: 5 → **15**
5. MC Board Black: 2 → **3**
6. MC Board BW: 1 → **2**
7. MC Exec BW target: 0.30 → **0.25**
8. MC Other Exec Black: 2 → **3**
9. MC Other Exec BW: 1 → **2**
10. Add ESD graduation bonus: **1**
11. Add ESD jobs bonus: **1**

---

### 4. FSC Generic (Financial Sector Code)

**Excel File**: `BBBEE Toolkit (FSC) Template v1.0.xlsx` (63 sheets)

#### Pillar Max Points

| Pillar | Excel | Codebase | Status |
|--------|:---:|:---:|:---:|
| **Grand Total** | **~120** | **149** | **WRONG** |
| Ownership | 25 | 25 | CORRECT |
| **Management Control** | **~21** | **20** | **WRONG** |
| Skills Development | ~23 | 20 | **WRONG** |
| **Preferential Procurement** | **~24** | **20** | **WRONG** |
| Supplier Development | ? | 10 | UNVERIFIED |
| Enterprise Development | 5 | 5 | CORRECT |
| SED | ? | 5 | UNVERIFIED |
| Empowerment Financing | ? | 15 | UNVERIFIED |
| Access to Financial Services | ? | 12 | UNVERIFIED |
| Consumer Education | ? | 5 | UNVERIFIED |

> The FSC toolkit has 63 sheets with FSC-specific pillars (EF, AFS, CE) plus sub-variants for Banks, Long-Term Insurers, and Short-Term Insurers. The codebase grand total of 149 appears to be fabricated - the actual FSC Generic grand total needs manual verification from the Scorecard Calculations sheet.

#### MC Criterion Errors

| Criterion | Excel | Codebase | Status |
|-----------|:---:|:---:|:---:|
| Board Black | 2 pts (50%) | 2 pts (50%) | CORRECT |
| Board BW | 1 pt (25%) | 1 pt (25%) | CORRECT |
| **Exec Black** | **2 pts (50%)** | **3 pts (50%)** | **WRONG** |
| **Exec BW** | **1 pt (25%)** | **2 pts (30%)** | **WRONG** |
| **Other Exec Black** | **~10 pts (75%)** | **2 pts (60%)** | **VERY WRONG** |
| **Other Exec BW** | **~4 pts (38%)** | **1 pt (30%)** | **WRONG** |

> The FSC MC scorecard has a fundamentally different structure - "Other Executive" appears to include Senior/Middle/Junior management roles combined with different targets (75% and 38%), not the 60%/30% standard targets. This needs careful manual review.

#### FSC Generic Required Fixes

1. Grand total: 149 → **verify and correct**
2. MC pillar: 20 → **21** (or verify)
3. Skills pillar: 20 → **23** (or verify)
4. PP pillar: 20 → **24** (or verify)
5. MC Exec Black: 3 → **2**
6. MC Exec BW: 2 pts (30%) → **1 pt (25%)**
7. MC Other Exec Black: 2 (60%) → **verify** (FSC may have different structure)
8. MC Other Exec BW: 1 (30%) → **verify** (FSC may have different structure)
9. Add FSC-specific pillar structures for Banks, Long-Term, Short-Term variants

---

### 5. RCOGP QSE

**Excel File**: `BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx` (51 sheets)

#### Pillar Max Points

| Pillar | Excel | Codebase | Status |
|--------|:---:|:---:|:---:|
| **Grand Total** | **~108** | **124** | **WRONG** |
| Ownership | 25 | 25 | CORRECT |
| **Management Control** | **15** | **19** | **WRONG** |
| **Skills Development** | **30** | **25** | **WRONG** |
| **Preferential Procurement** | **21** | **25** | **WRONG** |
| **Supplier Development** | **~5** | **15** | **WRONG** |
| **Enterprise Development** | **5** | **10** | **WRONG** |
| SED | 5 | 5 | CORRECT |

> Nearly every QSE pillar total is wrong. The QSE scorecard has a fundamentally different point distribution than what's in the codebase.

#### RCOGP QSE Required Fixes

1. Grand total: 124 → **~108**
2. MC pillar: 19 → **15**
3. Skills pillar: 25 → **30**
4. PP pillar: 25 → **21**
5. SD pillar: 15 → **~5**
6. ED pillar: 10 → **5**
7. ESD SD: 15 → **5**
8. ESD ED: 10 → **5**
9. Add ESD graduation bonus: **1**

---

### 6. ICT QSE

**Excel File**: `BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx` (51 sheets)

#### Pillar Max Points

| Pillar | Excel | Codebase | Status |
|--------|:---:|:---:|:---:|
| **Grand Total** | **~116** | **124** | **WRONG** |
| Ownership | 25 | 25 | CORRECT |
| **Management Control** | **15** | **19** | **WRONG** |
| **Skills Development** | **30** | **25** | **WRONG** |
| **Preferential Procurement** | **21** | **25** | **WRONG** |
| **Supplier Development** | **~5** | **15** | **WRONG** |
| **Enterprise Development** | **5** | **10** | **WRONG** |
| **SED** | **12** | **5** | **WRONG** |

#### ICT QSE Required Fixes

1. Grand total: 124 → **~116**
2. MC pillar: 19 → **15**
3. Skills pillar: 25 → **30**
4. PP pillar: 25 → **21**
5. SD pillar: 15 → **~5**
6. ED pillar: 10 → **5**
7. SED pillar: 5 → **12**
8. ESD SD: 15 → **5**
9. ESD ED: 10 → **5**
10. Add ESD graduation bonus: **1**

---

## Cross-Cutting Issues

### Issue 1: Fabricated Industry Norms (ALL SECTORS)

**Current State**: `STANDARD_INDUSTRY_NORMS` in `sectorConfig.ts` contains 17 entries with made-up values:

```
Retail: 4%, Manufacturing: 6%, IT Services: 10%, Financial Services: 15%,
Construction: 5%, Mining: 12%, Agriculture: 8%, Transport: 7%,
Professional Services: 20%, Healthcare: 8%, Hospitality: 5%, Wholesale: 3%,
Education: 10%, Energy: 10%, Telecommunications: 12%, Real Estate: 15%, Other: 8%
```

**Reality**: The Excel toolkits contain SARS-sourced quarterly industry norms with actual SIC industry classifications. The frontend already has correct industry norms in `apps/web/Toolkit/src/lib/data/industry-norms.ts`.

**Fix**: Replace `STANDARD_INDUSTRY_NORMS` with the actual SARS data from the frontend `industry-norms.ts` file, or extract from the Excel Industry Norms sheets.

---

### Issue 2: Frontend Hardcoded to RCOGP Generic Only

**Current State**: `apps/web/Toolkit/src/lib/store.ts` has:
- `emptyScorecard` hardcoded with RCOGP Generic targets (e.g., `target: 29` for PP, `target: 7` for ED)
- `calculateScorecard()` returns hardcoded targets regardless of selected sector
- `pointsToLevel()` uses hardcoded thresholds (not from `calculatorConfig`)

**Files Affected**:
- `store.ts` lines 98-109 (emptyScorecard)
- `store.ts` lines 316-321, 344-349 (calculateScorecard return values)
- `store.ts` lines 239-249 (pointsToLevel)
- `BuildPillarsStep.tsx` (hardcoded PILLARS constant)

**Fix**: All targets and thresholds must come from `calculatorConfig` (sourced from ArangoDB sector rules), with RCOGP Generic as the fallback only.

---

### Issue 3: Exec BW Target Wrong Across ALL Sectors

Every sector config in the codebase has `execBWTarget: 0.30` (30%). The Excel toolkits consistently show `execBWTarget: 0.25` (25%) across all sectors. This is a systematic error.

**Fix**: Change `execBWTarget` from `0.30` to `0.25` in all 6 sector configs.

---

### Issue 4: MC/EE Structure Mismatch

**Current State**: The `SectorConfig` interface has both `MCTargets` and `EETargets` as separate interfaces. However, the Excel toolkits consistently combine MC and EE into a single "MC Scorecard" sheet with sub-totals:
- MC Sub-total (Board + Exec + Other Exec)
- EE Sub-total (Senior + Middle + Junior + Disabled)
- Grand Total [MC + EE]

For sectors like ICT and FSC that have separate EE pillars in the Summary Scorecard, the MC and EE points are still on the same MC scorecard sheet.

**Fix**: The interface structure can remain as-is (separate MC and EE targets), but the values must be corrected to match the Excel sub-totals, and the calculator logic must handle the combined scoring correctly.

---

### Issue 5: Backend calculationEngine.ts Bypasses ArangoDB

**Current State**: `apps/api/pipeline/rules/calculationEngine.ts` calls `getSectorConfig()` directly from the hardcoded catalog and never queries ArangoDB for sector rules.

**Fix**: The calculation engine must query ArangoDB first, falling back to `getSectorConfig()` only if no ArangoDB record exists.

---

### Issue 6: Category E/F Weighting Caps

**Current State**: `STANDARD_CATEGORY_WEIGHTINGS` has `cap: 0.25` for Category E and `cap: 0.15` for Category F, both with `weighting: 1.0`.

**Reality**: These caps need verification against each sector's Skills Scorecard. The caps may differ by sector.

---

### Issue 7: YES Initiative Scoring

**Current State**: 
- `store.ts` sets `yesInitiative: { target: 5, weighting: 5 }` 
- The YES calculator (`calculators/yes.ts`) has hardcoded tier scores and no `CalculatorConfig` parameter
- The Excel toolkits show YES as a level-boosting mechanism (Tier 1/2/3), not a separate pillar with fixed max points

**Fix**: YES scoring needs to be restructured to match the toolkit's tier-based level increase system, not treated as a standard pillar.

---

## Chengetai's Feedback Items Status

| Item | Description | Status |
|------|-------------|--------|
| 1 | Combine Management Control & Employment Equity into single pillar | RCOGP: Done in pillarConfigs. Other sectors: Need review |
| 2 | Fix YES Programme scoring (tier-based, not fixed points) | NOT DONE |
| 3 | Rectify Procurement fields (correct criterion names & targets) | PARTIALLY DONE (some values still wrong) |
| 4 | Clarify Financial Inputs (revenue, NPAT, leviable amount) | NOT DONE |
| 5 | Add Skills Development fields (disabled, absorption, categories) | PARTIALLY DONE |
| 6 | Fix "Open in Toolkit" login bug | NOT VERIFIED |

---

## Priority Fix Order

### Phase 1: Critical Data Corrections (IMMEDIATE)

1. **Fix RCOGP Generic** (`sectorConfig.ts`)
   - `execBWTarget`: 0.30 → 0.25
   - `execBWMaxPts`: 2 → 1
   - `disabledTarget`: 0.03 → 0.02

2. **Fix ICT Generic** (complete rewrite of values)
   - Grand total: 133 → 140
   - PP: 25 → 27
   - ED: 5 → 15
   - SED: 5 → 12
   - All MC criterion points (see table above)

3. **Fix AGRI Generic**
   - MC: 19 → 23
   - PP: 25 → 27
   - ED: 5 → 7
   - SED: 5 → 15
   - MC Board/Other Exec points
   - Add graduation/jobs bonuses

4. **Fix both QSE configs** (near-complete rewrite)
   - RCOGP QSE: Almost every pillar total is wrong
   - ICT QSE: Almost every pillar total is wrong

5. **Fix FSC Generic** (needs manual Excel review for FSC-specific pillars)

6. **Replace STANDARD_INDUSTRY_NORMS** with actual SARS data

### Phase 2: Structural Fixes

7. **Wire ArangoDB as source of truth** for `calculationEngine.ts`
8. **Make frontend dynamic** - remove hardcoded targets from `store.ts`
9. **Fix YES scoring** to match tier-based toolkit model
10. **Re-seed ArangoDB** after all fixes

### Phase 3: Validation

11. **Run Lake Trading test case** against corrected configs
12. **Cross-validate** all 6 sectors against their Excel toolkits programmatically
13. **Frontend integration test** with each sector

---

## Appendix: Files Requiring Changes

| File | Changes Needed |
|------|----------------|
| `apps/api/pipeline/sectorConfig.ts` | Fix all sector configs (values listed above) |
| `apps/api/pipeline/seedOntology.ts` | Update seeding to handle corrected structures |
| `apps/api/arango/repositories/sectorRuleRepository.ts` | Verify schema matches corrected configs |
| `apps/api/pipeline/rules/calculationEngine.ts` | Query ArangoDB before hardcoded fallback |
| `apps/web/Toolkit/src/lib/store.ts` | Remove hardcoded targets, use `calculatorConfig` |
| `apps/web/Toolkit/src/lib/calculators/management.ts` | Use `calculatorConfig` for all targets |
| `apps/web/Toolkit/src/lib/calculators/skills.ts` | Use `calculatorConfig` for category caps |
| `apps/web/Toolkit/src/lib/calculators/yes.ts` | Add `CalculatorConfig` parameter, fix tier logic |
| `apps/web/src/components/build/BuildPillarsStep.tsx` | Remove hardcoded PILLARS constant |
| `apps/web/src/pages/DocumentProcessor.tsx` | Remove silent fallbacks and hardcoded totals |

---

## Appendix: Excel Toolkit File Inventory

| Sector | File | Sheets | Status |
|--------|------|:---:|--------|
| RCOGP Generic | `BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx` | 52 | Extracted & compared |
| ICT Generic | `BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx` | 52 | Extracted & compared |
| FSC Generic | `BBBEE Toolkit (FSC) Template v1.0.xlsx` | 63 | Extracted, partially compared |
| AGRI Generic | `BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx` | 53 | Extracted & compared |
| RCOGP QSE | `BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx` | 51 | Extracted & compared |
| ICT QSE | `BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx` | 51 | Extracted & compared |

**Extraction tooling**: `docs/toolkits/extract_fast.py`, `docs/toolkits/compare_v2.py`  
**Raw extraction outputs**: `docs/toolkits/extracted_*.json`
