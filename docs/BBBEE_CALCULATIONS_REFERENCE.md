# B-BBEE Calculations Reference

> **Generated:** 2026-03-20  
> **Source:** `apps/api/pipeline/sectorConfig.ts`, `calculators.ts`, `sectorCalculators.ts`, `buildResult.ts`, ArangoDB formula graphs  
> **Accuracy baseline:** Lake Trading 447 (Pty) Ltd — ALL 7 PILLARS PASSED (0.000–0.004 max deviation)

---

## Table of Contents

1. [Sector Configurations](#1-sector-configurations)
2. [Level Determination](#2-level-determination)
3. [Ownership Calculations](#3-ownership-calculations)
4. [Management Control Calculations](#4-management-control-calculations)
5. [Employment Equity Calculations](#5-employment-equity-calculations)
6. [Skills Development Calculations](#6-skills-development-calculations)
7. [Preferential Procurement Calculations](#7-preferential-procurement-calculations)
8. [Enterprise & Supplier Development Calculations](#8-enterprise--supplier-development-calculations)
9. [Socio-Economic Development Calculations](#9-socio-economic-development-calculations)
10. [YES Initiative](#10-yes-initiative)
11. [Sub-Minimum Rules & Discounting](#11-sub-minimum-rules--discounting)
12. [Financials & NPAT Calculation](#12-financials--npat-calculation)
13. [Formula Graph Dependency Structure](#13-formula-graph-dependency-structure)
14. [ArangoDB Stored Templates](#14-arangodb-stored-templates)
15. [Lake Trading Accuracy Test Results](#15-lake-trading-accuracy-test-results)

---

## 1. Sector Configurations

All six sector templates are stored as formula graphs in ArangoDB and implemented in `apps/api/pipeline/sectorConfig.ts`.

### 1.1 Pillar Maximums by Sector

| Pillar | RCOGP Generic | ICT Generic | FSC Generic | AGRI Generic | RCOGP QSE | ICT QSE |
|--------|:---:|:---:|:---:|:---:|:---:|:---:|
| Ownership | 25 | 25 | 25 | 25 | 25 | 25 |
| Management Control | 8 | 8 | 8 | 8 | 19 | 19 |
| Employment Equity | 11 | 15 | 12 | 11 | 0 | 0 |
| Skills Development | 25 | 25 | 20 | 25 | 25 | 25 |
| Preferential Procurement | 27 | 25 | 20 | 25 | 25 | 25 |
| Enterprise & Supplier Dev | 15 | 15 | 15 | 15 | 25 | 25 |
| Socio-Economic Dev | 5 | 5 | 5 | 5 | 5 | 5 |
| **Total** | **116** | **118** | **105** | **114** | **124** | **124** |

### 1.2 Sub-Minimum Thresholds

| Pillar | RCOGP | ICT | FSC | AGRI | Notes |
|--------|:---:|:---:|:---:|:---:|-------|
| Ownership | 40% | 40% | 40% | 40% | Of pillar max (= 10 pts) |
| Skills Development | 40% | 40% | 40% | 40% | Of pillar max (= 10 pts) |
| Preferential Procurement | 40% | 40% | 40% | 40% | Of pillar max (= 10.8/10/8/10 pts) |
| Management Control | — | — | — | — | No sub-minimum |
| ESD | — | — | — | — | No sub-minimum |
| SED | — | — | — | — | No sub-minimum |

### 1.3 Sector Detection Logic

```
Input name/sector string → detect sector:
  ICT keywords: "ict", "information.*communic", "technology", "telecom", "software", "digital"
  QSE keywords: "qse", "qualifying small"
  FSC keywords: "fsc", "financial sector", "banking", "insurance", "investment"
  AGRI keywords: "agri", "agriculture", "farming", "agribee"
  Default: RCOGP Generic
```

---

## 2. Level Determination

### 2.1 BEE Level Thresholds (all sectors)

| Level | Min Points | Recognition % | Procurement Recognition |
|:---:|:---:|:---:|:---:|
| 1 | ≥ 100 | 135% | 1.35× spend |
| 2 | ≥ 95 | 125% | 1.25× spend |
| 3 | ≥ 90 | 110% | 1.10× spend |
| 4 | ≥ 80 | 100% | 1.00× spend |
| 5 | ≥ 75 | 80% | 0.80× spend |
| 6 | ≥ 70 | 60% | 0.60× spend |
| 7 | ≥ 55 | 50% | 0.50× spend |
| 8 | ≥ 40 | 10% | 0.10× spend |
| NC | < 40 | 0% | 0.00× spend |

### 2.2 Sub-Minimum Discount Rule

If **any** sub-minimum threshold is not met AND the entity is not already Non-Compliant:

```
Discounted Level = Achieved Level + 1
(capped at Level 8)
```

Example: Achieved Level 3 but Skills Development sub-minimum failed → **Level 4**

---

## 3. Ownership Calculations

**Source:** `calcOwnershipSector()` in `sectorCalculators.ts`  
**Reference sheet:** `Ownership Scorecard`, `Ownership Calcs Formula`

### 3.1 Voting Rights

```
Shareholding weight(i) = shares(i) / total_shares
Black voting % = Σ weight(i) × blackOwnership(i)

Voting Rights Points = min(
  (Black voting % / votingTarget) × votingMaxPts,
  votingMaxPts
)
```

| Sector | Target | Max Pts |
|--------|:---:|:---:|
| RCOGP Generic | 25% | 4 |
| ICT Generic | 25% | 4 |
| FSC Generic | 25% | 4 |
| AGRI Generic | 25% | 4 |
| RCOGP QSE | 25% | 4 |
| ICT QSE | 25% | 4 |

### 3.2 Black Women Voting Rights

```
Black women voting % = Σ weight(i) × blackWomenOwnership(i)

Women Voting Points = min(
  (Black women % / womenTarget) × womenMaxPts,
  womenMaxPts
)
```

| Sector | Target | Max Pts |
|--------|:---:|:---:|
| All sectors | 10% | 2 |

### 3.3 Economic Interest

```
Economic Interest % = Σ weight(i) × blackOwnership(i)

EI Points = min(
  (EI % / eiTarget) × eiMaxPts,
  eiMaxPts
)
```

| Sector | Target | Max Pts |
|--------|:---:|:---:|
| All sectors | 25% | 8 |

### 3.4 Net Value Points

**With company value data:**
```
For each shareholder(i):
  allocated = companyValue × weight(i)
  debt_attr = outstandingDebt × weight(i)
  net_value_agg += max(0, (allocated - debt_attr) / shareValue(i)) × blackOwnership(i)

Net Value Points = min(net_value_agg × netValueMaxPts, netValueMaxPts)
```

**Without company value data (fallback):**
```
if totalBlackVoting >= 100%:
  Net Value Points = netValueMaxPts (full 8 pts)
else:
  Net Value Points = min((totalBlackVoting / 25%) × netValueMaxPts, netValueMaxPts)
```

| Sector | Max Pts |
|--------|:---:|
| All sectors | 8 |

### 3.5 Total Ownership

```
Ownership Total = min(
  VotingPts + WomenPts + EIPts + NetValuePts,
  25
)
```

### 3.6 Ownership Sub-Minimum

```
Sub-min threshold = 40% of 8 pts = 3.2 pts (net value component)

Sub-min MET if:
  Net Value Points ≥ 3.2  OR  Black voting ≥ 100%
```

---

## 4. Management Control Calculations

**Source:** `calcMCSector()` in `sectorCalculators.ts`  
**Reference sheet:** `MC Scorecard`, `MC Scorecard (Exco + Senior)`

### 4.1 Board Representation

```
Board Black % = count(black board members) / total board members
Board BW % = count(black women board members) / total board members

Board Black Pts = min(
  (Board Black % / boardBlackTarget) × boardBlackMaxPts,
  boardBlackMaxPts
)
Board BW Pts = min(
  (Board BW % / boardBWTarget) × boardBWMaxPts,
  boardBWMaxPts
)
```

| Sector | Black Target | Black Max Pts | BW Target | BW Max Pts |
|--------|:---:|:---:|:---:|:---:|
| RCOGP Generic | 50% | 1 | 25% | 1 |
| ICT Generic | 50% | 2 | 25% | 1 |
| FSC Generic | 50% | 2 | 25% | 1 |
| AGRI Generic | 50% | 1 | 25% | 1 |
| RCOGP QSE | 50% | 3 | 25% | 2 |
| ICT QSE | 50% | 3 | 25% | 2 |

### 4.2 Executive / C-Suite Representation

```
Exec Black % = count(black executives) / total executives
Exec BW % = count(black women executives) / total executives

Exec Black Pts = min(
  (Exec Black % / execBlackTarget) × execBlackMaxPts,
  execBlackMaxPts
)
Exec BW Pts = min(
  (Exec BW % / execBWTarget) × execBWMaxPts,
  execBWMaxPts
)
```

| Sector | Black Target | Black Max Pts | BW Target | BW Max Pts |
|--------|:---:|:---:|:---:|:---:|
| RCOGP Generic | 60% | 2 | 30% | 2 |
| ICT Generic | 60% | 3 | 30% | 2 |
| FSC Generic | 60% | 3 | 30% | 2 |
| AGRI Generic | 60% | 2 | 30% | 2 |
| RCOGP QSE | 60% | 4 | 30% | 4 |
| ICT QSE | 60% | 4 | 30% | 4 |

### 4.3 Total MC

```
MC Total = min(
  BoardBlackPts + BoardBWPts + ExecBlackPts + ExecBWPts,
  maxPoints
)
```

**Black person definition:** Race ∈ {African, Coloured, Indian}

---

## 5. Employment Equity Calculations

**Source:** `calcEESector()` in `sectorCalculators.ts`  
**Reference sheet:** `Employee Demographics`, `MC Calcs`  
> **Note:** EE is a separate pillar for Generic scorecards; merged with MC for QSE (EE maxPoints = 0 for QSE)

### 5.1 Senior Management

```
Senior Black % = count(black Senior staff) / total Senior staff

Senior Pts = min(
  (Senior Black % / 100%) × seniorMaxPts,
  seniorMaxPts
)
```

| Sector | Max Pts |
|--------|:---:|
| RCOGP Generic | 5 |
| ICT Generic | 6 |
| FSC Generic | 5 |
| AGRI Generic | 5 |

### 5.2 Middle Management

```
Middle Black % = count(black Middle staff) / total Middle staff

Middle Pts = min(
  (Middle Black % / 100%) × middleMaxPts,
  middleMaxPts
)
```

| Sector | Max Pts |
|--------|:---:|
| RCOGP Generic | 4 |
| ICT Generic | 5 |
| FSC Generic | 4 |
| AGRI Generic | 4 |

### 5.3 Junior Management / Skilled Level

```
Junior Pts = min(
  (Junior Black % / 100%) × juniorMaxPts,
  juniorMaxPts
)
```

| Sector | Max Pts |
|--------|:---:|
| RCOGP Generic | 4 (EE combined) |
| ICT Generic | 2 |
| FSC Generic | 2 |
| AGRI Generic | 4 |

### 5.4 Disabled Employees

```
Disabled % = count(disabled employees) / total employees

Disabled Pts = min(
  disabled% ≥ target ? disabledMaxPts : (disabled% / target) × disabledMaxPts,
  disabledMaxPts
)
```

| Sector | Target | Max Pts |
|--------|:---:|:---:|
| RCOGP Generic | 2% | 2 |
| ICT Generic | 2% | 2 |
| FSC Generic | 3% | 1 |
| AGRI Generic | 2% | 2 |

---

## 6. Skills Development Calculations

**Source:** `calcSkillsSector()` in `sectorCalculators.ts`  
**Reference sheet:** `Skills Scorecard`, `Skills Calcs`

### 6.1 Overall Skills Spend

```
Target Overall = Leviable Amount × overallSpendPercent%

Black Skills Spend = Σ cost(training) where isBlack = true

General Score = min(
  (Black Skills Spend / Target Overall) × overallMaxPts,
  overallMaxPts
)
```

| Sector | Spend % | Max Pts |
|--------|:---:|:---:|
| RCOGP Generic | 3.5% | 20 |
| ICT Generic | 3.5% | 20 |
| FSC Generic | 3.5% | 15 |
| AGRI Generic | 3.5% | 20 |
| RCOGP QSE | 3.5% | 20 |
| ICT QSE | 3.5% | 20 |

### 6.2 Bursary / Scholarship Spend

```
Target Bursary = Leviable Amount × bursarySpendPercent%

Bursary Spend = Σ cost(training) where isBlack = true AND category = "bursary"

Bursary Score = min(
  (Bursary Spend / Target Bursary) × bursaryMaxPts,
  bursaryMaxPts
)
```

| Sector | Spend % | Max Pts |
|--------|:---:|:---:|
| All sectors | 2.5% | 5 |

### 6.3 Total Skills

```
Skills Total = min(General Score + Bursary Score, maxPoints)
```

### 6.4 Skills Sub-Minimum

```
Sub-min threshold = 40% of overallMaxPts

RCOGP: 40% × 20 = 8 pts minimum
Sub-min MET if: General Score ≥ 8
```

---

## 7. Preferential Procurement Calculations

**Source:** `calcProcurementSector()` in `sectorCalculators.ts`  
**Reference sheet:** `Procurement Scorecard`, `TMPS`

### 7.1 Total Measured Procurement Spend (TMPS)

```
TMPS = Total revenue
     − Exclusions (inter-company, pass-through, etc.)
     = Inclusions − Exclusions

Procurement Target = TMPS × 80%
```

### 7.2 Recognised Spend

BEE recognition multipliers applied per supplier level:

| BEE Level | Recognition % |
|:---:|:---:|
| 1 | 135% |
| 2 | 125% |
| 3 | 110% |
| 4 | 100% |
| 5 | 80% |
| 6 | 60% |
| 7 | 50% |
| 8 | 10% |
| NC / 0 | 0% |

```
Recognised Spend = Σ (supplier_spend × recognition_multiplier)
```

### 7.3 Base Score

```
Base Max = maxPoints − bonusMaxPts
         = 27 − 2 = 25 (RCOGP Generic)

Base Score = min(
  (Recognised Spend / Procurement Target) × Base Max,
  Base Max
)
```

### 7.4 Bonus Points (51% Black-Owned Suppliers)

```
Bonus Points = Σ (supplier_spend / TMPS × 2) for suppliers with blackOwnership ≥ 51%

Bonus = min(Bonus Points, bonusMaxPts)
```

| Sector | Bonus Max Pts |
|--------|:---:|
| All sectors | 2 |

### 7.5 Total Procurement

```
Procurement Total = min(Base Score + Bonus, maxPoints)
```

### 7.6 Procurement Sub-Minimum

```
RCOGP: 40% × 25 = 10 pts minimum (from base score only)
Sub-min MET if: Base Score ≥ 10
```

---

## 8. Enterprise & Supplier Development Calculations

**Source:** `calcEsdSector()` in `sectorCalculators.ts`  
**Reference sheet:** `ESD Scorecard`, `ESD and SED Calcs`

### 8.1 Benefit Factor by Contribution Type

| Contribution Type | Benefit Factor |
|-------------------|:-----------:|
| Grant | 1.0 |
| Grant Contribution | 1.0 |
| Interest-Free Loan | 0.7 |
| Professional Services | 0.8 |
| Other/Default | 1.0 |

### 8.2 Supplier Development Score

```
Target SD = NPAT × sdPercent%

SD Spend (recognised) = Σ (amount × benefitFactor) for category = "supplier_development"

SD Score = min(
  (SD Spend / Target SD) × sdMaxPts,
  sdMaxPts
)
```

| Sector | SD Spend % | SD Max Pts |
|--------|:---:|:---:|
| RCOGP Generic | 2.0% | 10 |
| ICT Generic | 2.0% | 10 |
| FSC Generic | 2.0% | 10 |
| AGRI Generic | 2.0% | 10 |
| RCOGP QSE | 2.0% | 15 |
| ICT QSE | 2.0% | 15 |

### 8.3 Enterprise Development Score

```
Target ED = NPAT × edPercent%

ED Spend (recognised) = Σ (amount × benefitFactor) for category = "enterprise_development"

ED Score = min(
  (ED Spend / Target ED) × edMaxPts,
  edMaxPts
)
```

| Sector | ED Spend % | ED Max Pts |
|--------|:---:|:---:|
| RCOGP Generic | 1.0% | 5 |
| ICT Generic | 1.0% | 5 |
| FSC Generic | 1.0% | 5 |
| AGRI Generic | 1.0% | 5 |
| RCOGP QSE | 1.0% | 10 |
| ICT QSE | 1.0% | 10 |

### 8.4 Total ESD

```
ESD Total = min(SD Score + ED Score, maxPoints)
```

---

## 9. Socio-Economic Development Calculations

**Source:** `calcSedSector()` in `sectorCalculators.ts`  
**Reference sheet:** `SED Scorecard`, `SED Data`

```
Target SED = NPAT × spendPercent%
           = NPAT × 1.0% (all sectors)

SED Spend = Σ amount for all SED contributions (amount > 0)

SED Score = min(
  (SED Spend / Target SED) × maxPts,
  maxPts
)
```

| Sector | Spend % | Max Pts |
|--------|:---:|:---:|
| All sectors | 1.0% | 5 |

---

## 10. YES Initiative

**Reference sheet:** `YES`

The YES (Youth Employment Service) initiative provides level-up rewards:

| Tier | Condition | Reward |
|------|-----------|--------|
| Tier 1 | 100% of headcount target + 2.5% absorption | 1 level up |
| Tier 2 | 150% of headcount target + 5% absorption | 1 level up + 3 bonus points |
| Tier 3 | 200% of headcount target | 2 levels up |

**Headcount target formula:**
```
YES Target = max(
  1.5% × permanent staff headcount,
  Option 2 calculation,
  Option 3 calculation
)
```

---

## 11. Sub-Minimum Rules & Discounting

**Source:** `buildResult.ts` (lines 182–203)

### 11.1 Three Pillars with Sub-Minimums

```
Ownership sub-min:     Ownership Points ≥ (maxPoints × 40%)  OR  Net Value ≥ 3.2 pts
Skills sub-min:        Skills Points ≥ (maxPoints × 40%)
Procurement sub-min:   Base Procurement Points ≥ (baseMax × 40%)
```

### 11.2 Discounting Logic

```
if any sub-min NOT met AND entity NOT Non-Compliant:
  discounted_level_num = achieved_level + 1
  final_level = determineBeeLevel(LEVEL_POINTS_THRESHOLDS[discounted_level_num - 1])
else:
  final_level = achieved_level
```

### 11.3 MC+EE Combined Detection

Some toolkit versions report Management Control and Employment Equity as a single combined score. The pipeline auto-detects this:

```
Combined if:
  (a) explicit 'managementControlAndEE' key present, OR
  (b) managementControl value > mcMax + 0.5 AND no employmentEquity key

Split formula:
  If combined ref is valid (≤ mceeMax × 1.5):
    ratio = combinedRef / combinedCalc
    MC pts = min(mcMax, calcMC × ratio)
    EE pts = min(eeMax, calcEE × ratio)
```

---

## 12. Financials & NPAT Calculation

**Source:** `buildResult.ts` (lines 34–59)  
**Reference sheet:** `Financials`, `Client Information`

### 12.1 Core Financial Inputs

| Field | Source | Usage |
|-------|--------|-------|
| Revenue | Client Information | TMPS base, deemed NPAT |
| NPAT | Financials | ESD/SED targets |
| Leviable Amount | Skills Data | Skills Development targets |
| TMPS | TMPS sheet | Procurement targets |
| Payroll | Employee Demographics | Fallback for leviable amount |

### 12.2 Deemed NPAT (Low-Margin Fallback)

When actual NPAT margin is too low, a sector industry norm is applied:

```
Actual margin = NPAT / Revenue × 100%
Threshold = industryNorm × 25%

Use deemed NPAT if:
  NPAT ≤ 0  OR  actual margin < threshold

Deemed NPAT = Revenue × (industryNorm / 100)
Effective NPAT = max(deemedNpat, 0)
```

### 12.3 Industry Norms by Sector

Industry norms are stored in the `Industry Norms` sheet of each toolkit and looked up by sector/industry type.

---

## 13. Formula Graph Dependency Structure

**Source:** `formulaGraphBuilder.ts`, ArangoDB `formula_graphs` collection  
**Reference:** 52-sheet RCOGP toolkit schema

### 13.1 High-Level Dependency Flow

```
Client Information
    │
    ├── Financials ─────────────────────────────────────────────┐
    │       └── NPAT, Revenue, Leviable Amount, TMPS            │
    │                                                            │
    ├── Ownership Data ────────────→ Ownership Scorecard ────┐  │
    │   Ownership - Company Value                             │  │
    │   Outstanding Debts Calcs                               │  │
    │   Ownership Calcs Formula                               │  │
    │                                                         │  │
    ├── MC Data ──────────────────→ MC Scorecard ──────────┐  │  │
    │   Employee Demographics                   MC Calcs   │  │  │
    │   MC Scorecard (Exco+Senior)                         │  │  │
    │                                                      │  │  │
    ├── Skills Data ──────────────→ Skills Scorecard ───┐  │  │  │
    │   Skills Toolkit                    Skills Calcs  │  │  │  │
    │                                                   │  │  │  │
    ├── Procurement Data ─────────→ Procurement Score ─┐│  │  │  │
    │   TMPS                                           ││  │  │  │
    │   PP Report Data                                 ││  │  │  │
    │                                                  ││  │  │  │
    ├── ESD Data ─────────────────→ ESD Scorecard ──┐  ││  │  │  │
    │   ESD and SED Calcs                           │  ││  │  │  │
    │                                               │  ││  │  │  │
    ├── SED Data ─────────────────→ SED Scorecard ─┐│  ││  │  │  │
    │                                              ││  ││  │  │  │
    └── EAP / Industry Norms                       ││  ││  │  │  │
                                                   ││  ││  │  │  │
                           Scorecard Calculations ←┘┘  ┘┘  ┘  ┘  ┘
                                    │
                                    └──→ Summary Scorecard
```

### 13.2 Key Ownership Formula Relationships

| Cell (Sheet!Ref) | Formula | Notes |
|------------------|---------|-------|
| `Ownership Calcs Formula!*` | Deemed Value A = (B-C)/D | Flowthrough formula |
| `Ownership Calcs Formula!*` | Formula A = B × (1/(25%×C)) × 8 | Adjusted ownership |
| `Ownership Calcs Formula!*` | Formula B = B/C × 8 | Simple ratio |
| `Outstanding Debts Calcs!*` | Net value = allocated - debt | Per shareholder |

### 13.3 Scorecard Calculation Sheet Key Formulas

```
Total BEE Points = Ownership + MC + EE + Skills + Procurement + ESD + SED + YES
BEE Level = VLOOKUP(Total, LevelTable, 2) or INDEX/MATCH
Recognition % = VLOOKUP(Level, RecognitionTable, 2)
```

### 13.4 TMPS Calculation

```
TMPS = SUM(Inclusions) - SUM(Exclusions)

Inclusions: all supplier payments
Exclusions:
  - Inter-company transactions
  - Pass-through costs
  - Imports (where sector allows)
  - Government levies/taxes
```

---

## 14. ArangoDB Stored Templates

**Connection:** `http://127.0.0.1:8529` (server-local) | DB: `bbbee_db`  
**Exposed via:** `GET /api/templates` (no auth required)

### 14.1 Current Formula Graphs in ArangoDB

| Key | Source File | Sector | Type | Nodes | Edges | Status |
|-----|-------------|--------|------|------:|------:|--------|
| `7017` | `rcogp.xlsx` | RCOGP | Generic | 3,111 | 6,091 | ✅ Template |
| `14016` | `ict_generic.xlsx` | ICT | Generic | 3,684 | 7,057 | ✅ Template |
| `21604` | `ict_qse.xlsx` | ICT | QSE | 1,473 | 2,271 | ✅ Template |
| `24359` | `rcogp_qse.xlsx` | RCOGP | QSE | 1,449 | 2,219 | ✅ Template |
| `27306` | `agri.xlsx` | AGRI | Generic | 3,096 | 5,997 | ✅ Template |
| `34167` | `fsc.xlsx` | FSC | Generic | 2,934 | 5,876 | ✅ Template |
| `56030` | `Lake Trading Toolkit (RCOGP)(1).xlsx` | RCOGP | Generic | 3,112 | 6,091 | ⚠️ **CLIENT FILE — WRONG** |

> **⚠️ WARNING:** Entry `56030` is a client assessment file (Silver Lake Trading 447 (Pty) Ltd) that was ingested as an RCOGP Generic template. It must be removed. See [Ingestion Issue](#142-ingestion-issue--fix).

### 14.2 Ingestion Issue & Fix

**Root Cause:**  
The Lake Trading toolkit (`Lake Trading Toolkit (RCOGP)(1).xlsx`) was uploaded via `POST /api/templates/ingest` without checking whether the file is a blank template or a client-populated file. The extractor reads cell values from the Excel file and stores them as indicator `maxPoints` — when the file is client-populated, it reads actual data values as "max points."

**Evidence:**
- RCOGP Generic (key `56030`) shows `totalMaxPoints: 162.09` instead of 116
- Ownership pillar `maxPoints: 54` instead of 25
- YES Initiative `maxPoints: 48.5` — these are Lake Trading's actual YES calculation outputs
- SED `maxPoints: 0` — Lake Trading had no SED spend, so target cells read as 0

**Fix Required:**
1. Delete `formula_graphs/56030` and associated scorecard `scorecards/55360` from ArangoDB
2. Add validation to `templateIngester.ts` to reject client-populated files (check: is total extracted maxPoints reasonable?)
3. Re-ingest only from `BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx` (the actual blank template)

To delete via the admin cleanup endpoint (see `POST /api/templates/cleanup`):
```bash
curl -X DELETE http://20.164.207.196/api/templates/56030
```

### 14.3 Template Collections Schema

```
scorecards          → ScorecardTemplate (name, sectorCode, scorecardType, totalMaxPoints, levelThresholds)
pillars             → Pillar (scorecardId, name, code, maxPoints, hasSubMinimum, subMinimumThreshold)
indicators          → Indicator (pillarId, name, code, maxPoints, description)
compliance_targets  → ComplianceTarget (indicatorId, sectorCode, targetValue, targetUnit, targetBase, weighting)
formula_graphs      → FormulaGraph (scorecardType, sectorCode, version, nodeCount, edgeCount, sheets)
cells               → Cell (graphId, address, sheet, formula, value, dependsOn, semanticTag)
cell_dependency     → Edge (from: cell, to: cell)  ← depends-on relationship
```

---

## 15. Lake Trading Accuracy Test Results

**File:** `Lake Trading  Toolkit (RCOGP).xlsx` (23.5 MB, 52 sheets)  
**Client:** Silver Lake Trading 447 (Pty) Ltd  
**Test run:** 2026-03-20 | **Status: ✅ ALL PASSED**

### 15.1 Pillar Results

| Pillar | Calculated | Toolkit Ref | Deviation | Status |
|--------|:---:|:---:|:---:|:---:|
| Ownership | 25.00 / 25 | 25.00 | 0.000 | ✅ PASS |
| Management Control | 1.18 / 8 | 1.18 | 0.000 | ✅ PASS |
| Employment Equity | 10.59 / 11 | 10.59 | 0.000 | ✅ PASS |
| Skills Development | 0.00 / 25 | 0.00 | 0.000 | ✅ PASS |
| Preferential Procurement | 20.33 / 27 | 20.33 | 0.004 | ✅ PASS |
| Enterprise & Supplier Dev | 3.69 / 15 | 3.69 | 0.001 | ✅ PASS |
| Socio-Economic Dev | 0.41 / 5 | 0.41 | 0.004 | ✅ PASS |
| **TOTAL** | **61.20** | N/A | — | **✅ LEVEL 8** |

### 15.2 Extraction Stats

| Metric | Value |
|--------|------:|
| Sheets processed | 51 / 52 |
| Shareholders extracted | 6 |
| Employees extracted | 12 |
| Suppliers extracted | 46 |
| Training programmes | 16 |
| ESD contributions | 2 |
| SED contributions | 1 |
| Validation issues | 0 |

### 15.3 Graph Stats

| Metric | Value |
|--------|------:|
| Total cells | 20,489 |
| Formula cells | 11,084 |
| Dependency edges | 28,947 |
| Sheets processed | 51 |

### 15.4 Performance Timings

| Phase | Duration |
|-------|:--------:|
| Excel Parse (23.5 MB) | 222s |
| Pipeline Calculation | 21ms |
| Formula Graph Build | 32s |
| **Total** | **~255s** |

> **Note:** Parse time of 222s is above the 60s target. Performance optimization target: use streaming parser for files > 5MB.

### 15.5 Lake Trading Summary

Silver Lake Trading 447 (Pty) Ltd achieved **Level 8** (10% procurement recognition) primarily because:
- **Skills Development = 0** — No qualifying black skills spend against a 3.5% leviable amount target
- **Management Control = 1.18/8** — Limited black board/executive representation (small company, 12 employees)
- **Ownership = 25/25** — Fully black-owned (100%)
- **Procurement = 20.33/27** — Strong supplier BEE compliance
- **Sub-minimum: Skills FAILED** — Would trigger a level discount if not already at Level 8

---

## Appendix A: EAP Targets (Economically Active Population)

Used by the MC Toolkit for proportional representation targets:

| Province | African | Coloured | Indian | White | Black Total |
|----------|:---:|:---:|:---:|:---:|:---:|
| National | 78.8% | 8.8% | 2.6% | 9.8% | 90.2% |
| Gauteng | 73.5% | 5.2% | 4.0% | 17.3% | 82.7% |
| Western Cape | 33.8% | 45.6% | 1.4% | 19.2% | 80.8% |
| Northern Cape | 35.3% | 52.7% | 0.7% | 11.3% | 88.7% |

---

## Appendix B: Procurement Inclusion/Exclusion Rules (TMPS)

| Spend Category | Include | Notes |
|----------------|:-------:|-------|
| Local suppliers | ✅ | All B-BBEE rated |
| Pass-through costs | ❌ | Pure resale without value-add |
| Inter-company (related party) | ❌ | Intra-group transactions |
| Government entities | ❌ | Rates, taxes, levies |
| Imports | ✅/❌ | Sector-specific rules |
| Subcontracting | ✅ | Where entity controls selection |

---

## Appendix C: Validation Rules

Applied by `validateAll()` in `apps/api/pipeline/extraction/validator.ts`:

| Rule | Condition | Severity |
|------|-----------|----------|
| Shareholding totals | Σ shares = 100% | Error |
| Black ownership range | 0 ≤ BO ≤ 100% | Error |
| Black women ≤ black total | BWO ≤ BO | Error |
| Revenue > 0 | Must have positive revenue | Warning |
| NPAT range | Can be negative (triggers deemed NPAT) | Info |
| Employee designation | Must be: Board, Executive, Senior, Middle, Junior | Warning |

---

*End of document. For implementation details see `apps/api/pipeline/` and `apps/api/arango/`.*
