# Toolkit Tab Map — Complete Field-to-Entity Mapping

**Created:** 2026-03-28  
**Purpose:** Map every Excel toolkit tab and field to the hierarchical entity system. Reference for extraction, manual input forms, and calculation dependencies.

---

## Table of Contents

1. [Sheet Structure Overview](#1-sheet-structure-overview)
2. [Foundation Sheets](#2-foundation-sheets)
3. [Ownership Pillar](#3-ownership-pillar)
4. [Management Control Pillar](#4-management-control-pillar)
5. [Skills Development Pillar](#5-skills-development-pillar)
6. [Preferential Procurement Pillar](#6-preferential-procurement-pillar)
7. [Enterprise & Supplier Development Pillar](#7-enterprise--supplier-development-pillar)
8. [Socio-Economic Development Pillar](#8-socio-economic-development-pillar)
9. [YES Initiative Pillar](#9-yes-initiative-pillar)
10. [Cross-Pillar Dependencies](#10-cross-pillar-dependencies)
11. [Sector-Specific Sheets](#11-sector-specific-sheets)

---

## 1. Sheet Structure Overview

### Common Core Sheets (All Sectors)

| # | Sheet Name | Category | Purpose | Maps to System |
|---|------------|----------|---------|----------------|
| 1 | Client Information | Foundation | Company details, contact info | Root Context entities |
| 2 | Financials | Foundation | Revenue, NPAT, payroll, TMPS components | Financial entities |
| 3 | Industry Norms | Foundation | Industry norm lookup for deemed NPAT | Root Context |
| 4 | EAP | Foundation | Economically Active Population targets (Generic only) | Root Context |
| 5 | Summary Scorecard | Output | Final pillar scores and level | ScorecardResult |
| 6 | Scorecard Calculations | Calculation | Orchestration formulas | Calculation nodes |
| 7-13 | [Pillar] Scorecard | Output | Per-pillar criterion scores | Score nodes |
| 14-20 | [Pillar] Data | Input | Raw data entry (row-based) | Atomic Entity fields |
| 21-27 | [Pillar] Calcs | Calculation | Formula chains per pillar | Calculation nodes |
| 28+ | Empower/* | Strategy | Strategy pack slides | Not directly mapped |

### Sheet Count by Sector

| Sector | Sheets | Notes |
|--------|--------|-------|
| RCOGP Generic | 52 | Baseline |
| ICT Generic | 53 | +Skills Report Data |
| RCOGP QSE | 51 | -EAP, -MC Calcs, merged elements |
| ICT QSE | 51 | -EAP, -MC Calcs, merged elements |
| FSC Generic | 63 | +Access to Financial Services, Empowerment Financing, Transaction Financing |
| Agri Generic | 53 | +Land Ownership, Agricultural Development, Farmworker Housing |

---

## 2. Foundation Sheets

### 2.1 Client Information

**Excel Location**: Sheet "Client Information"  
**System Pillar**: Root Context  
**Purpose**: Determines which rules apply before any scorecard calculation

| Excel Field | Entity Name | Field Type | Compulsory | Notes |
|-------------|-------------|------------|------------|-------|
| Company Name | companyName | string | Yes | Legal entity name |
| Trading Name | tradingName | string | No | DBA name |
| Registration Number | registrationNumber | string | Yes | CIPC number |
| VAT Number | vatNumber | string | No | SARS VAT number |
| Physical Address | physicalAddress | string | Yes | Street address |
| Postal Address | postalAddress | string | No | If different |
| Contact Person | contactPerson | string | Yes | Primary contact |
| Contact Email | contactEmail | string | Yes | |
| Contact Phone | contactPhone | string | Yes | |
| Sector Code | sectorCode | enum | Yes | RCOGP, ICT, FSC, AGRI |
| Industry | industry | enum | Yes | Affects industry norm |
| Company Size | companySize | enum | Auto | EME/QSE/Generic from turnover |
| Annual Turnover | turnover | currency | Yes | Determines company size |
| Financial Year End | financialYearEnd | date | Yes | Measurement period end |
| Number of Employees | headcount | count | Yes | Total employees |

### 2.2 Financials

**Excel Location**: Sheet "Financials"  
**System Pillar**: Foundation (feeds multiple pillars)  
**Purpose**: Financial drivers for all NPAT and payroll-based calculations

| Excel Field | Entity Name | Field Type | Compulsory | Feeds Into |
|-------------|-------------|------------|------------|------------|
| Total Revenue | totalRevenue | currency | Yes | Deemed NPAT check |
| NPAT | npat | currency | Yes | SED (1%), ESD SD (2%), ESD ED (1%), Deemed NPAT calc |
| Leviable Amount | leviableAmount | currency | Yes | Skills targets (3.5%, 2.5%) |
| Total Payroll | totalPayroll | currency | No | Cross-checks leviable amount |
| TMPS Inclusions | tmpsInclusions | currency | Yes | TMPS calculation |
| TMPS Exclusions | tmpsExclusions | currency | Yes | TMPS calculation |
| Total Measured Procurement Spend | tmps | currency | Calc | All procurement targets (base) |

**Derived Calculations from Financials**:

| Calculation | Formula | Output Entity |
|-------------|---------|---------------|
| Current Margin | `(npat / totalRevenue) * 100` | currentMargin |
| Quarter Threshold | `industryNorm / 4` | quarterThreshold |
| Is Below Quarter? | `currentMargin < quarterThreshold` | isBelowQuarter |
| Deemed NPAT | `isBelowQuarter ? (totalRevenue * (industryNorm / 100)) : npat` | deemedNpat |
| Deemed NPAT Used | `isBelowQuarter` | deemedNpatUsed |

### 2.3 Industry Norms

**Excel Location**: Sheet "Industry Norms"  
**System Pillar**: Root Context  
**Purpose**: Lookup table for industry-specific NPAT norms

| Industry | Norm % | Usage |
|----------|--------|-------|
| Retail | 4% | If margin < 1%, deemed NPAT = Revenue × 4% |
| Manufacturing | 6% | If margin < 1.5%, deemed NPAT = Revenue × 6% |
| IT Services | 10% | If margin < 2.5%, deemed NPAT = Revenue × 10% |
| ... | ... | Full list in `industry-norms.ts` |

---

## 3. Ownership Pillar

### 3.1 Ownership Scorecard (Output Sheet)

**Excel Location**: Sheet "Ownership Scorecard"  
**System Pillar**: Ownership  
**Max Points**: 25  
**Has Sub-Minimum**: Yes (40% = 10 points)

| Criterion Code | Criterion Name | Target | Max Points | Formula |
|----------------|----------------|--------|------------|---------|
| OWN-VR-BLACK | Exercisable voting rights of Black people | 25% + 1 vote | 4 | `min((actual / 0.25) * 4, 4)` |
| OWN-VR-BWO | Exercisable voting rights of Black women | 10% | 2 | `min((actual / 0.10) * 2, 2)` |
| OWN-EI-BLACK | Economic interest of Black people | 25% | 4 | `max(gradFactor * 4, (actual / 0.25) * 4)` |
| OWN-EI-BWO | Economic interest of Black women | 10% | 2 | `min((actual / 0.10) * 2, 2)` |
| OWN-DG | Economic interest of Black designated groups | 10% | 3 | `min((actual / 0.10) * 3, 3)` |
| OWN-NE | Economic interest of Black new entrants | New entrant present | 2 | `hasNewEntrant ? 2 : 0` |
| OWN-NV | Net value | Complex formula | 8 | See below |

**Net Value Formula**:
```
IF fullOwnershipAwarded (≥25% Black voting):
  netValuePoints = 8
ELSE IF hasNetValueData (companyValue > 0 AND shareholder shareValue > 0):
  For each shareholder:
    pct = shares / totalShares
    debtAttributable = outstandingDebt * pct
    carryingValue = shareValue * pct
    shareValueAllocated = companyValue * pct
    deemedValue = (shareValueAllocated - debtAttributable) / carryingValue
    netValuePointsAgg += max(0, deemedValue) * blackOwnership
  netValuePoints = min(8, netValuePointsAgg)
ELSE:
  netValuePoints = (blackVotingPercent >= 100%) ? 8 : min(8, (blackVotingPercent / 25%) * 8)
```

### 3.2 Ownership Data (Input Sheet)

**Excel Location**: Sheet "Ownership Data"  
**System Pillar**: Ownership  
**Row Structure**: One row per shareholder

| Excel Column | Entity Name | Field Type | Compulsory | Notes |
|--------------|-------------|------------|------------|-------|
| Shareholder Name | shareholderName | string | Yes | Legal entity or individual name |
| ID/Registration Number | shareholderId | string | No | For verification |
| Black Ownership % | blackOwnershipPercent | percentage | Yes | 0-100% |
| Black Women Ownership % | blackWomenOwnershipPercent | percentage | Yes | 0-100% |
| Black New Entrant? | isBlackNewEntrant | boolean | No | Affects OWN-NE criterion |
| Designated Group? | isDesignatedGroup | boolean | No | Affects OWN-DG criterion |
| Voting Rights % | votingRightsPercent | percentage | Yes | Usually = ownership % |
| Economic Interest % | economicInterestPercent | percentage | Yes | Usually = ownership % |
| Shares Held | sharesHeld | count | Yes | Absolute number |
| Share Value | shareValue | currency | No | For net value calc |

### 3.3 Ownership Calcs Formula (Calculation Sheet)

**Excel Location**: Sheet "Ownership Calcs Formula"  
**System Pillar**: Ownership  
**Purpose**: Formula chain connecting inputs to criterion scores

| Cell | Formula | Output |
|------|---------|--------|
| Total Black Voting | `SUMPRODUCT(OwnershipData[Black Ownership %], OwnershipData[Voting Rights %])` | totalBlackVotingPercent |
| Total Black Women Voting | `SUMPRODUCT(OwnershipData[Black Women Ownership %], OwnershipData[Voting Rights %])` | totalBlackWomenVotingPercent |
| Full Ownership Awarded | `totalBlackVotingPercent >= 25%` | fullOwnershipAwarded |
| Graduation Factor | `LOOKUP(yearsHeld, GraduationTable)` | graduationFactor |

### 3.4 Outstanding Debts Calcs (Calculation Sheet)

**Excel Location**: Sheet "Oustanding Debts Calcs"  
**System Pillar**: Ownership  
**Purpose**: Net value debt allocation per shareholder

| Excel Field | Entity Name | Field Type | Notes |
|-------------|-------------|------------|-------|
| Total Outstanding Debt | totalOutstandingDebt | currency | Affects net value calc |
| Debt Attributable per Shareholder | debtAttributable | currency | `totalOutstandingDebt * (shares / totalShares)` |

### 3.5 Ownership - Company Value Data (Input Sheet)

**Excel Location**: Sheet "Ownership - Company Value Data"  
**System Pillar**: Ownership  
**Purpose**: Company valuation for net value calculation

| Excel Field | Entity Name | Field Type | Compulsory |
|-------------|-------------|------------|------------|
| Company Value | companyValue | currency | Yes (for net value) |
| Valuation Date | valuationDate | date | No |
| Valuation Method | valuationMethod | string | No |

---

## 4. Management Control Pillar

### 4.1 MC Scorecard (Output Sheet)

**Excel Location**: Sheet "MC Scorecard"  
**System Pillar**: Management Control  
**Max Points**: RCOGP Generic 8, ICT Generic 8, FSC Generic 8, AGRI Generic 8, QSE 19  
**Has Sub-Minimum**: No

**RCOGP Generic Criteria**:

| Criterion Code | Criterion Name | Target | Max Points | Formula |
|----------------|----------------|--------|------------|---------|
| MC-BOARD-BLACK | Board participation - Black | 50% | 1 | `min((actual / 0.50) * 1, 1)` |
| MC-BOARD-BWO | Board participation - Black women | 25% | 1 | `min((actual / 0.25) * 1, 1)` |
| MC-EXEC-BLACK | Executive management - Black | **50%** | 2 | `min((actual / 0.50) * 2, 2)` |
| MC-EXEC-BWO | Executive management - Black women | 30% | 2 | `min((actual / 0.30) * 2, 2)` |

**QSE Criteria** (combined MC+EE):

| Criterion Code | Criterion Name | Target | Max Points |
|----------------|----------------|--------|------------|
| MC-BOARD-BLACK | Board participation - Black | 50% | 3 |
| MC-BOARD-BWO | Board participation - Black women | 25% | 2 |
| MC-EXEC-BLACK | Executive management - Black | **50%** | 4 |
| MC-EXEC-BWO | Executive management - Black women | 30% | 4 |
| MC-SENIOR | Senior management | EAP-based | 3 |
| MC-MIDDLE | Middle management | EAP-based | 3 |

### 4.2 MC Data / MC Report Data (Input Sheets)

**Excel Location**: Sheets "MC Data", "MC Report Data"  
**System Pillar**: Management Control + Employment Equity  
**Row Structure**: One row per employee

| Excel Column | Entity Name | Field Type | Compulsory | Notes |
|--------------|-------------|------------|------------|-------|
| Full Name | employeeName | string | Yes | |
| Gender | gender | enum | Yes | Male, Female |
| Race | race | enum | Yes | African, Coloured, Indian, White |
| Designation | designation | enum | Yes | Board, Executive, Senior, Middle, Junior, Semi-skilled, Unskilled |
| Disabled | isDisabled | boolean | Yes | Yes/No |
| Foreign | isForeign | boolean | Yes | Yes/No (excluded from calcs) |
| ID Number | idNumber | string | No | |
| Hire Date | hireDate | date | No | |
| Termination Date | terminationDate | date | No | Exclude if terminated |
| Province | province | enum | No | Affects EAP target |

**Designation Mapping**:

| Designation | Occupational Level | EAP Category |
|-------------|-------------------|--------------|
| Executive Director | Top Management | Board/Executive |
| Non-executive Director | Top Management | Board |
| Other Executive Manager | Top Management | Executive |
| Senior Manager | Senior Management | Senior |
| Middle Manager | Middle Management | Middle |
| Junior Manager | Junior Management | Junior |
| Semi-skilled | Semi-skilled | Junior |
| Unskilled | Unskilled | Junior |

### 4.3 MC Calcs (Calculation Sheet)

**Excel Location**: Sheet "MC Calcs"  
**System Pillar**: Management Control  
**Purpose**: Calculate percentages per designation and race

| Calculation | Formula |
|-------------|---------|
| Total Board Members | `COUNTIFS(Designation, "*Director*")` |
| Black Board Members | `COUNTIFS(Designation, "*Director*", Race, "African") + ...` |
| Black Board % | `blackBoardMembers / totalBoardMembers` |
| Black Women Board % | `countifs(Designation, "*Director*", Race, "African", Gender, "Female") / totalBoardMembers` |

---

## 5. Skills Development Pillar

### 5.1 Skills Scorecard (Output Sheet)

**Excel Location**: Sheet "Skills Scorecard"  
**System Pillar**: Skills Development  
**Max Points**: RCOGP 25, ICT 25, FSC 20, AGRI 25, QSE 25  
**Has Sub-Minimum**: Yes (40% = 10 points RCOGP/ICT/AGRI/QSE, 8 points FSC)

**Criteria**:

| Criterion Code | Criterion Name | Target | Max Points | Formula |
|----------------|----------------|--------|------------|---------|
| SKILLS-GEN | Skills spend - General | 3.5% of leviable | 20 (RCOGP/ICT/AGRI/QSE), 15 (FSC) | `min((actualSpend / (leviableAmount * 0.035)) * maxPoints, maxPoints)` |
| SKILLS-BURS | Bursary spend | 2.5% of leviable | 5 | `min((bursarySpend / (leviableAmount * 0.025)) * 5, 5)` |

**Category Weightings** (sub-criteria):

| Category | Description | Weighting |
|----------|-------------|-----------|
| A | Internships | 100% |
| B | Apprenticeships | 100% |
| C | Learnerships - employed | 100% |
| D | Learnerships - unemployed | 100% |
| E | Category E | 75% |
| F | Category F | 15% |
| G | Informal training | 0% |

### 5.2 Skills Data (Input Sheet)

**Excel Location**: Sheet "Skills Data"  
**System Pillar**: Skills Development  
**Row Structure**: One row per training intervention

| Excel Column | Entity Name | Field Type | Compulsory | Notes |
|--------------|-------------|------------|------------|-------|
| Training Program Name | programName | string | Yes | |
| Category | category | enum | Yes | A, B, C, D, E, F, G |
| ABET | isAbet | boolean | No | |
| Mandatory Training | isMandatory | boolean | No | |
| Bursary - Higher Education | isBursary | boolean | No | Affects SKILLS-BURS |
| Training Provider | provider | string | No | |
| Invoice/Transaction Date | transactionDate | date | Yes | |
| Learner Name | learnerName | string | Yes | |
| ID Number | learnerId | string | No | |
| Gender | learnerGender | enum | Yes | Male, Female |
| Race | learnerRace | enum | Yes | African, Coloured, Indian, White |
| Disabled | learnerDisabled | boolean | Yes | |
| Foreign | learnerForeign | boolean | Yes | |
| Employment Status | employmentStatus | enum | No | Permanent, Fixed-Term, Unemployed |
| YES Employee | isYesEmployee | boolean | No | Links to YES pillar |
| Completed | isCompleted | boolean | No | |
| Absorbed | isAbsorbed | boolean | No | Affects YES absorption |
| Course Cost | courseCost | currency | No | |
| Travel Cost | travelCost | currency | No | |
| Accommodation Cost | accommodationCost | currency | No | |
| Catering Cost | cateringCost | currency | No | |
| Stationery Cost | stationeryCost | currency | No | |
| Training Facility Cost | facilityCost | currency | No | |
| Salary Cost | salaryCost | currency | No | Stipends for B/C/D |
| Other Costs | otherCosts | currency | No | |
| Start Date | startDate | date | No | |
| End Date | endDate | date | No | |

### 5.3 Employee Demographics (Input Sheet)

**Excel Location**: Sheet "Employee Demographics"  
**System Pillar**: Skills Development  
**Purpose**: Summary demographic data for Skills reporting

| Excel Field | Entity Name | Field Type | Notes |
|-------------|-------------|------------|-------|
| Total Employees | totalEmployees | count | |
| Black Employees | blackEmployees | count | African + Coloured + Indian |
| Black Women Employees | blackWomenEmployees | count | |
| Disabled Employees | disabledEmployees | count | |

---

## 6. Preferential Procurement Pillar

### 6.1 Procurement Scorecard (Output Sheet)

**Excel Location**: Sheet "Procurement Scorecard"  
**System Pillar**: Preferential Procurement  
**Max Points**: **RCOGP 29**, ICT 25, FSC 20, AGRI 25, QSE 25  
**Has Sub-Minimum**: Yes (40%)

**Criteria**:

| Criterion Code | Criterion Name | Target | Max Points | Formula |
|----------------|----------------|--------|------------|---------|
| PROC-EMP | Spend from Empowering Suppliers | 80% of TMPS | 5 | `min((empoweringSpend / (tmps * 0.80)) * 5, 5)` |
| PROC-QSE | Spend on QSE Suppliers | 15% of TMPS | 3 | `min((qseSpend / (tmps * 0.15)) * 3, 3)` |
| PROC-EME | Spend on EME Suppliers | 15% of TMPS | 4 | `min((emeSpend / (tmps * 0.15)) * 4, 4)` |
| PROC-BO51 | Spend on ≥51% Black-Owned | **50% of TMPS** | **11 (RCOGP)**, 9 (ICT/AGRI), 5 (FSC) | `min((bo51Spend / (tmps * 0.50)) * maxPoints, maxPoints)` |
| PROC-BWO30 | Spend on >30% Black Women-Owned | 12% of TMPS | 4 (RCOGP/ICT/AGRI), 4 (FSC) | `min((bwo30Spend / (tmps * 0.12)) * 4, 4)` |
| PROC-DG | Spend on Designated Group Suppliers | **2% of TMPS** | 2 | `min((dgSpend / (tmps * 0.02)) * 2, 2)` |
| PROC-GRAD | Bonus: Graduation of ED Beneficiaries | Tick-box | 1 | `graduationBonus ? 1 : 0` |
| PROC-JOBS | Bonus: Jobs Created | Tick-box | 1 | `jobsCreatedBonus ? 1 : 0` |

**Recognition Table** (affects all spend calculations):

| BEE Level | Recognition % | Multiplier |
|-----------|---------------|------------|
| Level 1 | 135% | 1.35 |
| Level 2 | 125% | 1.25 |
| Level 3 | 110% | 1.10 |
| Level 4 | 100% | 1.00 |
| Level 5 | 80% | 0.80 |
| Level 6 | 60% | 0.60 |
| Level 7 | 50% | 0.50 |
| Level 8 | 10% | 0.10 |
| Non-compliant | 0% | 0.00 |

### 6.2 Procurement Data / PP Report Data (Input Sheets)

**Excel Location**: Sheets "Procurement Data", "PP Report Data"  
**System Pillar**: Preferential Procurement  
**Row Structure**: One row per supplier

| Excel Column | Entity Name | Field Type | Compulsory | Notes |
|--------------|-------------|------------|------------|-------|
| Supplier Name | supplierName | string | Yes | |
| Current Company Size | supplierSize | enum | Yes | Generic, QSE, EME |
| B-BBEE Level | supplierBeeLevel | enum | No | 1-8, Non-compliant |
| VAT Number | supplierVat | string | No | |
| Empowering Supplier? | isEmpoweringSupplier | boolean | No | Affects PROC-EMP |
| Date of First Procurement | firstProcurementDate | date | No | |
| Size at First Procurement | sizeAtFirstProcurement | enum | No | |
| Current Black Ownership | blackOwnershipPercent | percentage | No | Affects PROC-BO51 |
| Current Black Female Ownership | blackWomenOwnershipPercent | percentage | No | Affects PROC-BWO30 |
| Flow-through Black Ownership | flowThroughOwnership | percentage | No | |
| Black Designated Group Ownership | designatedGroupOwnership | percentage | No | Affects PROC-DG |
| Supplier Development Recipient? | isSupplierDevRecipient | boolean | No | Links to ESD-SD |
| 3 Year Contract in Place? | hasThreeYearContract | boolean | No | |
| Spend | spendAmount | currency | Yes | Affects all criteria via recognition % |
| Location | location | string | No | |
| Certificate Expiry Date | certificateExpiry | date | No | |

### 6.3 TMPS (Calculation Sheet)

**Excel Location**: Sheet "TMPS"  
**System Pillar**: Preferential Procurement  
**Purpose**: Calculate Total Measured Procurement Spend

| Calculation | Formula | Output Entity |
|-------------|---------|---------------|
| Total Inclusions | `costOfSales + operatingExpenses + capitalExpenditure + otherInclusions` | tmpsInclusions |
| Total Exclusions | `imports + salaries + statutory + depreciation + otherExclusions` | tmpsExclusions |
| TMPS | `totalInclusions - totalExclusions` | tmps |

---

## 7. Enterprise & Supplier Development Pillar

### 7.1 ESD Scorecard (Output Sheet)

**Excel Location**: Sheet "ESD Scorecard"  
**System Pillar**: Enterprise & Supplier Development  
**Max Points**: RCOGP Generic 15, ICT Generic 15, FSC Generic 15, AGRI Generic 15, QSE 25  
**Has Sub-Minimum**: No

**Criteria**:

| Criterion Code | Criterion Name | Target | Max Points | Formula |
|----------------|----------------|--------|------------|---------|
| ESD-SD | Supplier Development | 2% of NPAT | 10 (Generic), 15 (QSE) | `min((sdSpend / (npat * 0.02)) * maxPoints, maxPoints)` |
| ESD-ED | Enterprise Development | 1% of NPAT | **7 (Generic: 5 base + 2 bonus)**, 10 (QSE) | `min((edSpend / (npat * 0.01)) * maxPoints, maxPoints)` |
| ESD-GRAD | Bonus: Graduation to SD | Tick-box | 1 | `graduationBonus ? 1 : 0` |
| ESD-JOBS | Bonus: Jobs Created | Tick-box | 1 | `jobsCreatedBonus ? 1 : 0` |

**Benefit Factors** (contribution type multipliers):

| Contribution Type | SD Benefit Factor | ED Benefit Factor |
|-------------------|-------------------|-------------------|
| Grant contribution | 100% | 100% |
| Direct cost | 100% | 100% |
| Discounts | 100% | 100% |
| Overhead costs | 100% | 100% |
| Interest-free loan | 100% | 100% |
| Standard loan | 70% | 70% |
| Guarantees | 3% of value | 3% of value |
| Lower interest rate | Benefit differential | Benefit differential |
| Minority investment | 100% | 100% |
| Professional services (free) | 100% | 100% |
| Professional services (discounted) | Discount % | Discount % |
| Employee time | 100% | 100% |
| Shorter payment periods | Benefit differential | N/A (SD only) |

### 7.2 ESD Data / ESD Report Data (Input Sheets)

**Excel Location**: Sheets "ESD Data", "ESD Report Data"  
**System Pillar**: Enterprise & Supplier Development  
**Row Structure**: One row per contribution

**Supplier Development** (separate sheet in RCOGP, combined in QSE):

| Excel Column | Entity Name | Field Type | Compulsory | Notes |
|--------------|-------------|------------|------------|-------|
| Supplier Name | beneficiaryName | string | Yes | |
| Date of First Assistance | firstAssistanceDate | date | Yes | |
| Black Ownership when First Assisted | initialBlackOwnership | percentage | Yes | |
| Size when First Assisted | initialSize | enum | Yes | Generic, QSE, EME |
| Current Black Ownership | currentBlackOwnership | percentage | Yes | |
| Current Size | currentSize | enum | Yes | |
| Contribution Description | contributionDescription | string | Yes | |
| Date of Transaction | transactionDate | date | Yes | |
| Contribution Type | contributionType | enum | Yes | 14 options (see 7.1) |
| Amount | contributionAmount | currency | Yes | |
| Invoice Date | invoiceDate | date | No | For shorter payment periods |
| Payment Date | paymentDate | date | No | For shorter payment periods |
| Prime Rate | primeRate | percentage | No | For loans |
| Actual Rate | actualRate | percentage | No | For loans |

**Enterprise Development** (separate sheet in RCOGP, combined in QSE):

| Excel Column | Entity Name | Field Type | Compulsory | Notes |
|--------------|-------------|------------|------------|-------|
| Beneficiary Name | beneficiaryName | string | Yes | |
| Date of First Assistance | firstAssistanceDate | date | Yes | |
| Black Ownership when First Assisted | initialBlackOwnership | percentage | Yes | |
| Size when First Assisted | initialSize | enum | Yes | |
| Current Black Ownership | currentBlackOwnership | percentage | Yes | |
| Current Size | currentSize | enum | Yes | |
| Contribution Description | contributionDescription | string | Yes | |
| Date of Transaction | transactionDate | date | Yes | |
| Contribution Type | contributionType | enum | Yes | 13 options (no shorter payment) |
| Amount | contributionAmount | currency | Yes | |
| Prime Rate | primeRate | percentage | No | |
| Actual Rate | actualRate | percentage | No | |

**ICT-Specific Field** (File 6):

| Excel Column | Entity Name | Field Type | Notes |
|--------------|-------------|------------|-------|
| ICT Company? | isIctCompany | boolean | Sector-specific flag |

### 7.3 ESD and SED Calcs (Calculation Sheet)

**Excel Location**: Sheet "ESD and SED Calcs"  
**System Pillar**: ESD + SED  
**Purpose**: Calculate weighted contributions, NPAT targets, and criterion scores

| Calculation | Formula |
|-------------|---------|
| Weighted SD Contribution | `SUM(sdContributions[Amount * BenefitFactor])` |
| Weighted ED Contribution | `SUM(edContributions[Amount * BenefitFactor])` |
| SD Target | `npat * 0.02` |
| ED Target | `npat * 0.01` |

---

## 8. Socio-Economic Development Pillar

### 8.1 SED Scorecard (Output Sheet)

**Excel Location**: Sheet "SED Scorecard"  
**System Pillar**: Socio-Economic Development  
**Max Points**: 5 (all sectors)  
**Has Sub-Minimum**: No

**Criteria**:

| Criterion Code | Criterion Name | Target | Max Points | Formula |
|----------------|----------------|--------|------------|---------|
| SED-SPEND | SED Contributions | 1% of NPAT | 5 | `min((sedSpend / (npat * 0.01)) * 5, 5)` |

### 8.2 SED Data / SED Report Data (Input Sheets)

**Excel Location**: Sheets "SED Data", "SED Report Data", "SED & CE Data" (FSC)  
**System Pillar**: Socio-Economic Development  
**Row Structure**: One row per contribution

| Excel Column | Entity Name | Field Type | Compulsory | Notes |
|--------------|-------------|------------|------------|-------|
| Beneficiary Name | beneficiaryName | string | Yes | |
| Description of Spend | spendDescription | string | Yes | |
| Date of Transaction | transactionDate | date | Yes | |
| Contribution Type | contributionType | enum | Yes | 7 options |
| % of Spend Benefiting Black Individuals | blackBenefitPercent | percentage | Yes | |
| Amount | contributionAmount | currency | Yes | |
| Province | province | enum | No | |
| Business Unit | businessUnit | string | No | |
| Number of African Male Beneficiaries | africanMaleBeneficiaries | count | No | Demographic tracking |
| Number of African Female Beneficiaries | africanFemaleBeneficiaries | count | No | |
| Number of Coloured Male Beneficiaries | colouredMaleBeneficiaries | count | No | |
| Number of Coloured Female Beneficiaries | colouredFemaleBeneficiaries | count | No | |
| Number of Indian Male Beneficiaries | indianMaleBeneficiaries | count | No | |
| Number of Indian Female Beneficiaries | indianFemaleBeneficiaries | count | No | |

**Contribution Types (SED-specific, 7 options)**:
1. Grant contribution
2. Direct cost incurred in supporting socioeconomic development
3. Discounts in addition to normal business practices
4. Overhead costs incurred in supporting socioeconomic development
5. Professional services rendered at no cost
6. Professional services rendered at a discount
7. Time of employees productively deployed in assisting beneficiaries

**ICT-Specific Field** (File 7):

| Excel Column | Entity Name | Field Type | Notes |
|--------------|-------------|------------|-------|
| ICT Specific Initiative? | isIctSpecificInitiative | boolean | Sector-specific flag |

---

## 9. YES Initiative Pillar

### 9.1 YES Scorecard (Output Sheet)

**Excel Location**: Sheet "YES"  
**System Pillar**: YES Initiative  
**Purpose**: Youth Employment Service bonus qualification and tier achievement

**Qualification Criteria**:

| Requirement | Target |
|-------------|--------|
| Headcount | Based on size: <500 employees = 2.5% of headcount; 500-1000 = 1.5%; >1000 = 1% |
| Absorption | 25% of YES employees absorbed into permanent positions (Tier 1) |
| OR | 50% absorption (Tier 2) |
| OR | 100% absorption (Tier 3) |

**YES Tiers**:

| Tier | Absorption Rate | Benefit |
|------|-----------------|---------|
| Tier 1 | 25% | +1 BEE level (if ≥50% black youth) |
| Tier 2 | 50% | +2 BEE levels (if ≥50% black youth) |
| Tier 3 | 100% | +1 BEE level (automatic) |

### 9.2 YES Data (Input)

**Excel Location**: Interspersed in Skills Data (isYesEmployee flag) and dedicated YES tracking
**System Pillar**: YES Initiative

| Entity Name | Field Type | Notes |
|-------------|------------|-------|
| yesHeadcountTarget | count | Based on total employees |
| yesYouthEnrolled | count | Youth employed under YES programme |
| yesBlackYouthCount | count | For 50% threshold check |
| yesAbsorbedCount | count | Permanent hires after YES |
| yesAbsorptionRate | percentage | `absorbedCount / youthEnrolled` |
| yesCostPerCandidate | currency | Average cost per YES employee |
| yesTierAchieved | enum | Tier 1/2/3 or None |
| yesBeeLevelIncrease | count | 0, 1, or 2 levels |

---

## 10. Cross-Pillar Dependencies

### 10.1 Financial Drivers

| Source Field | Source Pillar | Feeds Into | Target Pillar(s) | Formula Context |
|--------------|---------------|------------|------------------|-----------------|
| npat | Financials | SED target, ESD SD target, ESD ED target, Deemed NPAT | SED, ESD, Ownership | All % of NPAT calculations |
| leviableAmount | Financials | Skills spend targets | Skills | 3.5% and 2.5% targets |
| totalRevenue | Financials | Deemed NPAT check | All (via deemed NPAT) | Quarter threshold check |
| industryNorm | Root Context | Deemed NPAT calc | All (via deemed NPAT) | `revenue × (norm/100)` |

### 10.2 Workforce Data Sharing

| Source Data | Source Pillar | Feeds Into | Target Pillar(s) |
|-------------|---------------|------------|------------------|
| Employee register (MC Data) | Management Control | Board/Exec % calculations | Management Control |
| Employee register (MC Data) | Management Control | Occupational level demographics | Employment Equity |
| Employee register (MC Data) | Management Control | Existing employee skills count | Skills Development |
| Employee Demographics summary | Skills | Skills spend category weightings | Skills Development |

### 10.3 Procurement Data Sharing

| Source Data | Source Pillar | Feeds Into | Target Pillar(s) |
|-------------|---------------|------------|------------------|
| Supplier register | Procurement | Recognition % multipliers | Procurement scoring |
| Supplier register | Procurement | Supplier Development beneficiaries | ESD - Supplier Dev |
| TMPS | Procurement | All procurement targets | Procurement (base for all %) |
| Supplier dev recipient flag | Procurement | ESD SD beneficiary identification | ESD - Supplier Dev |

### 10.4 Skills to YES Linkage

| Source Data | Source Pillar | Feeds Into | Target Pillar |
|-------------|---------------|------------|---------------|
| isYesEmployee flag | Skills | YES headcount tracking | YES Initiative |
| isAbsorbed flag | Skills | YES absorption calculation | YES Initiative |

---

## 11. Sector-Specific Sheets

### 11.1 FSC Generic (Financial Sector Code)

**Unique Sheets** (not in other sectors):

| Sheet | Purpose | FSC-Specific Entities |
|-------|---------|----------------------|
| EF & ESD Scorecard - Banks | Empowerment Financing + ESD for banks | efBanksScore, efBanksMaxPoints |
| EF & ESD Scorecard - Long Term | EF + ESD for long-term insurers | efLongTermScore |
| Transaction Financing Data | BEE transaction financing input | transactionFinancingAmount |
| SED & CE Scorecard | SED + Consumer Education combined | ceScore, ceMaxPoints |
| SED & CE Data | Consumer Education contributions | ceBeneficiary, ceAmount |
| AFS Scorecard - Banks | Access to Financial Services - banks | afsBanksScore |
| AFS Scorecard - Long Term | AFS - long-term | afsLongTermScore |
| AFS Scorecard - Short Term | AFS - short-term | afsShortTermScore |
| AFS Definitions - Banks | AFS criteria definitions | - |
| AFS Data - Short Term | AFS contribution data | afsBeneficiary, afsAmount |
| Scoring Scale | FSC-specific level thresholds | - |

### 11.2 Agri Generic (AgriBEE)

**Agri-Specific Fields** (in data sheets):

| Field | Location | Type | Purpose |
|-------|----------|------|---------|
| Land Ownership - Black (hectares or %) | Ownership Data | percentage/count | Agricultural land ownership metric |
| Agricultural Development Contribution | Enterprise Dev | currency | Support for emerging black farmers |
| Farmworker Housing Investment | SED | currency | Housing and living conditions |

### 11.3 ICT Generic

**ICT-Specific Fields** (already documented in sections 7.2 and 8.2):

| Field | Location | Type | Purpose |
|-------|----------|------|---------|
| ICT Company? | Enterprise Dev Data | boolean | Flag for ICT sector classification |
| ICT Specific Initiative? | SED Data | boolean | Flag for ICT-aligned SED |

---

## Quick Reference: Entity-to-Cell Mapping

### Ownership
```
ownership.shareholders[].name           -> Ownership Data!A:A
ownership.shareholders[].blackOwnership -> Ownership Data!C:C
ownership.shareholders[].shareValue     -> Ownership Data!J:J
ownership.companyValue                  -> Ownership - Company Value Data!A2
ownership.yearsHeld                     -> Ownership Data![column]
ownership.totalOutstandingDebt          -> Oustanding Debts Calcs!A2
```

### Management Control
```
management.employees[].name        -> MC Data!A:A
management.employees[].gender      -> MC Data!B:B
management.employees[].race        -> MC Data!C:C
management.employees[].designation -> MC Data!D:D
management.employees[].isDisabled  -> MC Data!E:E
```

### Skills
```
skills.programs[].name         -> Skills Data!A:A
skills.programs[].category     -> Skills Data!B:B
skills.programs[].courseCost   -> Skills Data!T:T
skills.programs[].learnerName  -> Skills Data!I:I
skills.programs[].isYesEmployee -> Skills Data!Q:Q
```

### Procurement
```
procurement.suppliers[].name          -> Procurement Data!A:A
procurement.suppliers[].beeLevel      -> Procurement Data!C:C
procurement.suppliers[].blackOwnership -> Procurement Data!H:H
procurement.suppliers[].spend         -> Procurement Data!N:N
procurement.tmps                      -> TMPS!CalculatedCell
```

### ESD
```
esd.supplierDev[].beneficiaryName -> Supplier Development!A:A
esd.supplierDev[].amount          -> Supplier Development!J:J
esd.enterpriseDev[].beneficiaryName -> Enterprise Development!A:A
esd.enterpriseDev[].amount        -> Enterprise Development!J:J
```

### SED
```
sed.contributions[].beneficiaryName -> SED Data!A:A
sed.contributions[].amount          -> SED Data!F:F
sed.contributions[].blackBenefitPercent -> SED Data!E:E
```

---

## Related Documents

- `BBEE_GOAL_CONTEXT.md` — Explains why each GoalDocs file matters
- `BBEE_SCORING_ENGINE_PLAN.md` (in `.kilo/plans/`) — Full implementation roadmap
