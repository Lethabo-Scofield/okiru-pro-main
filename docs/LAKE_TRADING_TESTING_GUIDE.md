# Lake Trading Manual Input Testing Guide

**Purpose:** Step-by-step guide to test the B-BBEE scoring engine using Lake Trading 447 (Pty) Ltd data.

**Reference:** Lake Trading Toolkit (RCOGP) in `AI_UnderstandingSystem/`

---

## Quick Start

1. Go to **Dashboard** → Click **"Create Scorecard"**
2. Select **"Build Manually"** 
3. Follow the steps below

---

## Step 1: Foundation (Root Context)

Enter these values:

| Field | Value |
|-------|-------|
| **Sector Code** | RCOGP |
| **Scorecard Type** | Generic |
| **Financial Year End** | 2024-02-29 |
| **Annual Turnover** | R 45,000,000 |

Click **"Continue to Pillars"**

---

## Step 2: Ownership Pillar

**Voting Rights:**
- Black Voting %: 51.00
- Black Women Voting %: 25.50

**Economic Interest:**
- Black Economic Interest %: 51.00
- Black Women Economic Interest %: 25.50
- Designated Group %: 10.00
- New Entrant: Yes (check box)

**Company Value:**
- Total Company Value: R 15,000,000
- Total Outstanding Debt: R 2,500,000

**Shareholder Breakdown:**
- Shareholder 1: Black, 30%, 5 years held
- Shareholder 2: Black Woman, 21%, 3 years held

**Expected Score:** ~23-25 points (depending on graduation factors)

---

## Step 3: Management Control Pillar

**Board Composition:**
- Total Board Members: 5
- Black Board Members: 3 (60%)
- Black Women Board Members: 2 (40%)

**Executive Management:**
- Total Executives: 4
- Black Executives: 3 (75%)
- Black Women Executives: 1 (25%)

**Expected Score:** 7-8 points

---

## Step 4: Employment Equity Pillar

**Senior Management:**
- Total: 6
- Black: 4 (66.7%)
- Target EAP: 50%

**Middle Management:**
- Total: 15
- Black: 10 (66.7%)
- Target EAP: 60%

**Junior Management:**
- Total: 25
- Black: 20 (80%)
- Target EAP: 75%

**Disabled Employees:** 2 (2.5%)

---

## Step 5: Skills Development Pillar

**Financials:**
- Leviable Amount: R 12,000,000
- Total Skills Spend: R 480,000 (4% of leviable)
- Bursary Spend: R 120,000 (1% of leviable)

**Training Breakdown:**
- Category A (Internships): R 80,000
- Category B (Apprenticeships): R 100,000
- Category C (Learnerships - employed): R 200,000
- Category D (Learnerships - unemployed): R 60,000
- Category E: R 40,000

**Learners:**
- Total Learners: 12
- Black Learners: 10
- Absorbed: 6

**Expected Score:** 20-25 points

---

## Step 6: Preferential Procurement Pillar

**TMPS Calculation:**
- Cost of Sales: R 25,000,000
- Operating Expenses: R 8,000,000
- Exclusions (Salaries, etc.): R 10,000,000
- **TMPS: R 23,000,000**

**Supplier Spend:**
- Empowering Suppliers: R 18,400,000 (80% of TMPS)
- QSE Suppliers: R 3,450,000 (15% of TMPS)
- EME Suppliers: R 3,450,000 (15% of TMPS)
- ≥51% Black-Owned: R 9,200,000 (40% of TMPS)
- >30% Black Women-Owned: R 2,760,000 (12% of TMPS)
- Designated Group: R 2,760,000 (12% of TMPS)

**Graduation Bonus:** Yes
**Jobs Created Bonus:** Yes

**Expected Score:** 25-27 points

---

## Step 7: Enterprise & Supplier Development Pillar

**Financials:**
- NPAT: R 2,800,000
- Supplier Development (2% NPAT target): R 56,000
- Enterprise Development (1% NPAT target): R 28,000

**Contributions:**
- SD Beneficiaries: 3
- SD Total Contribution: R 60,000
- ED Beneficiaries: 2
- ED Total Contribution: R 30,000

**Bonuses:**
- Graduation Bonus: Yes
- Jobs Created Bonus: Yes

**Expected Score:** 15-17 points

---

## Step 8: Socio-Economic Development Pillar

**Financials:**
- NPAT: R 2,800,000
- SED Target (1% NPAT): R 28,000
- SED Actual Spend: R 35,000

**Contributions:**
- Beneficiaries: 2
- Black Beneficiaries %: 100%
- Nature: Education & Community Development

**Expected Score:** 5 points

---

## Expected Final Results

| Pillar | Points | Max |
|--------|--------|-----|
| Ownership | 23-25 | 25 |
| Management Control | 7-8 | 8 |
| Skills Development | 20-25 | 25 |
| Preferential Procurement | 25-27 | 27 |
| ESD | 15-17 | 15 |
| SED | 5 | 5 |
| **TOTAL** | **95-102** | **105** |

**Expected B-BBEE Level:** Level 2 or Level 1 (depending on exact scoring)
**Expected Recognition:** 125% or 135%

---

## Validation Checklist

- [ ] All 7 pillars show scores
- [ ] Sub-minimum requirements met (40% of each pillar with sub-min)
- [ ] No discounting applied
- [ ] Level matches expected (Level 1 or 2)
- [ ] Recognition % matches expected (125% or 135%)

---

## Troubleshooting

**"Fill all pillar fields to calculate" message:**
- Ensure you've entered data in ALL pillar tabs
- Check that financial fields have numeric values (not text)

**Score seems wrong:**
- Verify TMPS calculation (inclusions - exclusions)
- Check NPAT is correct for SED/ESD calculations
- Confirm graduation factors for ownership

**Can't proceed to pillars:**
- Must select Sector Code in Foundation step
- Financial Year End is required

---

## Data Source

This guide uses actual data from:
- `Lake Trading Toolkit (RCOGP)(1).xlsx`
- Located in: `AI_UnderstandingSystem/`

Cross-reference with the Excel file for exact cell values.
