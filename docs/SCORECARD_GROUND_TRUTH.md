# B-BBEE Scorecard Ground Truth

**Document Purpose**: This file contains the definitive, Excel-verified reference values for all B-BBEE scorecard calculations. All code must match these values exactly.

**Verified Against**:
- `BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx` (extracted via openpyxl)
- `Lake Trading Toolkit (RCOGP).xlsx` (ground truth validation data)

**Last Verified**: March 31, 2026

---

## 1. Grand Totals by Sector Template

| Sector Template | Total Points | Elements |
|----------------|--------------|----------|
| RCOGP (Generic) | **120** | Ownership, Management Control, Skills Development, Preferential Procurement, Supplier Development, Enterprise Development, Socio-Economic Development |
| RCOGP (QSE) | TBD | TBD |
| ICT (Generic) | TBD | TBD |
| ICT (QSE) | TBD | TBD |
| FSC (Generic) | TBD | TBD |
| Agri (Generic) | TBD | TBD |

---

## 2. RCOGP Generic — Complete Scorecard Structure

### 2.1 Pillar Max Points

| Element | Max Points | Has Sub-minimum | Sub-min Threshold |
|---------|-----------|-----------------|-------------------|
| Ownership | 25 | Yes | 40% |
| Management Control | **19** | No | — |
| Skills Development | 25 | Yes | 40% |
| Preferential Procurement | **29** | Yes | 40% |
| Supplier Development | **10** | Yes | 40% |
| Enterprise Development | **7** (5 base + 2 bonus) | No | — |
| Socio-Economic Development | 5 | No | — |
| **Grand Total** | **120** | | |
| YES Initiative | **Bonus only** | — | Level uplift, NOT additive pts |

### 2.2 Management Control Sub-Criteria (19 points total)

| Criterion | Target % | Max Pts | Notes |
|-----------|----------|---------|-------|
| Board Black | 50% | 2 | |
| Board Women | 25% | 1 | |
| **Executive Directors Black** | **50%** | **2** | **CRITICAL: NOT 60%** |
| **Executive Directors Women** | **25%** | **1** | **CRITICAL: NOT 30%** |
| Other Executive Black | 60% | 2 | |
| Other Executive Women | 30% | 1 | |
| Senior Management Black | EAP-based | 2 | Province-specific (see §4) |
| Senior Management Women | EAP-based | 1 | Province-specific |
| Middle Management Black | EAP-based | 2 | Province-specific |
| Middle Management Women | EAP-based | 1 | Province-specific |
| Junior Management Black | EAP-based | 1 | Province-specific |
| Junior Management Women | EAP-based | 1 | Province-specific |
| Disabled Employees | 3% of headcount | 2 | |
| **Total** | | **19** | |

### 2.3 Skills Development Sub-Criteria (25 points total)

| Criterion | Target | Max Pts | Formula Type |
|-----------|--------|---------|--------------|
| Learning Programmes (Black) | **3.5%** of leviable | **6** | % of base (leviable amount) |
| Bursaries (Black) | 2.5% of leviable | **4** | % of base |
| Disabled Black Learning | 0.3% of leviable | 4 | % of base |
| LAI (Learnerships, Internships, Apprenticeships) | 5% of headcount | 6 | % of headcount |
| Absorption | 2.5% rate | 5 | % of placed absorbed |
| **Total** | | **25** | |

**Key Fields**:
- Learning programme row has `isAbsorbed` field (NOT `isEmployed`)
- LAI denominator is total company headcount (NOT count of black training rows)

### 2.4 Preferential Procurement Sub-Criteria (29 points total)

| Criterion | Target | Max Pts | Notes |
|-----------|--------|---------|-------|
| Empowering Suppliers (BEE L1-L8) | 80% of TMPS | 5 | |
| QSE Suppliers | 15% of TMPS | 3 | |
| EME Suppliers | 15% of TMPS | 4 | |
| **≥51% Black Owned (BO51)** | **50%** of TMPS | **11** | **CRITICAL: NOT 40%, NOT 10 pts** |
| ≥30% Black Women Owned (BWO30) | 12% of TMPS | 4 | |
| Designated Group (Bonus row) | **2%** of TMPS | **2** | **CRITICAL: NOT 12%** |
| **Total** | | **29** | |

**CRITICAL**: Procurement has NO graduation bonus and NO jobs creation bonus. These bonuses ONLY exist in Enterprise Development.

### 2.5 Supplier Development Sub-Criteria (10 points total)

| Criterion | Target | Max Pts |
|-----------|--------|---------|
| SD Contributions | 2% of NPAT | 10 |

Recognition multipliers apply based on supplier BEE level:
- Level 1: 1.35×
- Level 2: 1.25×
- Level 3: 1.10×
- Level 4: 1.00×
- Level 5: 0.80×
- Level 6: 0.60×
- Level 7: 0.50×
- Level 8: 0.10×
- Non-compliant: 0×

### 2.6 Enterprise Development Sub-Criteria (7 points total)

| Criterion | Target | Max Pts |
|-----------|--------|---------|
| ED Contributions | 1% of NPAT | 5 (base) |
| ED Bonus 1 — Graduations | 1 bonus | 1 |
| ED Bonus 2 — Jobs Created | 1 bonus | 1 |
| **Total** | | **7** |

### 2.7 Socio-Economic Development Sub-Criteria (5 points total)

| Criterion | Target | Max Pts |
|-----------|--------|---------|
| SED Contributions | 1% of NPAT | 5 |

---

## 3. ESD/SED Benefit Factor Types

Complete table of 14 contribution types and their benefit factors:

| Contribution Type | Factor | Applies To |
|-------------------|--------|------------|
| Grant | 1.0 | SD, ED, SED |
| Direct Cost/Cost Covering | 1.0 | SD, ED, SED |
| Discounts | 1.0 | SD, ED, SED |
| Overhead/Operating Costs | 1.0 | SD, ED, SED |
| **Interest-Free Loan** | **1.0** | SD, ED, SED |
| Standard Loan (interest-bearing) | 0.7 | SD, ED, SED |
| Guarantees | 0.03 (3% of guarantee value) | SD, ED, SED |
| Lower Interest Rate Loan | Differential benefit | SD, ED, SED |
| Minority Investment in EME/QSE | 1.0 | SD, ED |
| Professional Services (free) | 1.0 | SD, ED, SED |
| Professional Services (discounted) | Discount percentage | SD, ED, SED |
| Employee Time/Secondment | 1.0 | SD, ED, SED |
| Shorter Payment Terms | Differential benefit | SD only |
| Equity Investment | Special formula | ED only |

---

## 4. EAP Targets by Province (Management Control)

### 4.1 National EAP (Default)

| Occupational Level | Black Target | Women Target |
|-------------------|--------------|--------------|
| Top Management | 68.6% | 29.3% |
| Senior Management | 73.1% | 34.1% |
| Middle Management | 78.6% | 42.5% |
| Junior Management | 84.5% | 51.2% |

### 4.2 Provincial EAP Tables

| Province | Senior Black | Senior Women | Middle Black | Middle Women | Junior Black | Junior Women |
|----------|-------------|--------------|--------------|--------------|--------------|--------------|
| Western Cape | 55.1% | 31.1% | 65.4% | 42.2% | 74.3% | 52.6% |
| Eastern Cape | 86.8% | 45.4% | 90.2% | 50.1% | 93.2% | 55.8% |
| Northern Cape | 61.1% | 32.4% | 70.5% | 41.8% | 79.8% | 50.9% |
| Free State | 85.2% | 46.1% | 88.4% | 49.2% | 92.1% | 53.4% |
| KwaZulu-Natal | 86.3% | 42.1% | 89.5% | 46.7% | 92.8% | 52.3% |
| North West | 88.1% | 43.5% | 90.8% | 47.9% | 93.6% | 53.1% |
| Gauteng | 73.3% | 35.9% | 79.4% | 44.2% | 86.1% | 54.5% |
| Mpumalanga | 89.4% | 41.8% | 91.7% | 46.2% | 94.1% | 52.7% |
| Limpopo | 93.8% | 46.5% | 95.1% | 49.8% | 96.3% | 54.2% |

---

## 5. YES Initiative (Level Boost, Not Points)

YES is NOT part of the 120-point total. It provides level improvement:

| Company Size | Headcount Target | Max Level Improvement |
|--------------|-----------------|----------------------|
| EME | 1 | 2 levels |
| QSE | 2 | 1 level |
| Generic | 5 | 1 level |

Absorption bonus: 2.5% of placed YES youth must be absorbed into permanent employment.

---

## 6. Level Determination

| Level | Min Points | Recognition % |
|-------|-----------|---------------|
| 1 | 100+ | 135% |
| 2 | 95-99 | 125% |
| 3 | 90-94 | 110% |
| 4 | 80-89 | 100% |
| 5 | 75-79 | 80% |
| 6 | 70-74 | 60% |
| 7 | 55-69 | 50% |
| 8 | 40-54 | 10% |
| Non-compliant | <40 | 0% |

**Discounted Level**: If any sub-minimum is failed, drop one level (or to non-compliant if already Level 8).

---

## 7. Lake Trading Validation Target

When the system is fed the Lake Trading data, it must produce exactly these scores:

| Element | Expected Score | Max |
|---------|---------------|-----|
| Ownership | 25.00 | 25 |
| Management Control | 11.77 | 19 |
| Skills Development | 0.00 | 25 |
| Preferential Procurement | 20.33 | 29 |
| Supplier Development | 3.69 | 10 |
| Enterprise Development | 2.36 | 7 |
| Socio-Economic Development | 0.41 | 5 |
| **Total** | **63.56** | **120** |
| **B-BBEE Level** | **7** | |
| **Discounted Level** | **8** | |

This is the acceptance test that proves the system works correctly.

---

## 8. Critical Bugs to Never Reintroduce

1. **Executive Directors targets**: Must be 50% Black / 25% Women (NOT 60% / 30%)
2. **Procurement BO51**: Must be 50% target for 11 points (NOT 40% for 10 points)
3. **Procurement DG**: Must be 2% target (NOT 12%)
4. **Procurement bonuses**: Do NOT exist (bonuses are ED only)
5. **Skills default target**: Must be 3.5% (NOT 6%)
6. **Skills absorption**: Must use `isAbsorbed` field (NOT `isEmployed`)
7. **Grand total**: Must be 120 (NOT 111, NOT 132)
8. **MC total**: Must be 19 combined (NOT split as 8+11)
9. **ESD split**: Must be SD=10 + ED=7 (NOT combined 15)

---

## 9. Document Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-03-31 | Initial extraction from Excel toolkits via openpyxl |
