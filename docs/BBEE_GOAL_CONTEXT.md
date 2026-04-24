# BBEE Goal Context — Reference Document

**Created:** 2026-03-28  
**Purpose:** Explain why each document in GoalDocs matters to the B-BBEE scoring engine. Use this to reorient when context resets.

---

## Base Goal

Build a **multi-layer B-BBEE scoring engine** that:
1. Extracts data from documents OR manual input via a structured, pillar-by-pillar flow
2. Stores everything in a graph ontology (ArangoDB) as nodes + edges, not flat records
3. Computes scorecard results deterministically via a rules registry (not scattered calculator files)
4. Matches real verification output when tested against known scorecards (Lake Trading, Thandanani Transport)

The chain is: `Document → Evidence → Atomic Field → Criterion → Pillar Score → Overall Scorecard`

---

## Why Each GoalDocs Document Matters

### Template Files (Blank Scorecard Schemas)

| Document | Location | Purpose | What It Teaches the System |
|----------|----------|---------|---------------------------|
| **BBBEE Toolkit (RCOGP) Template v1.4** | `AI_UnderstandingSystem/` + `BBBEE Toolkits/1. RCOGP (Generic)/` | Blank RCOGP Generic toolkit template | **Schema source of truth** for RCOGP Generic. Contains 52 sheets: Client Information, Financials, Industry Norms, EAP, Summary Scorecard, 7 pillar scorecards + data sheets, calculation sheets. Defines exact cell references, formulas, and data collection structure. |
| **BBBEE Toolkit (ICT Generic) Template v1.4** | `BBBEE Toolkits/2. ICT (Generic)/` | Blank ICT Generic toolkit | **ICT-specific differences**: Same core 52 sheets but reordered, adds `Skills Report Data`, sector-specific fields on Enterprise Dev and SED data sheets. Different targets per pillar (e.g., Procurement max 25 vs 27). |
| **BBBEE Toolkit (ICT QSE) Template v1.1** | `BBBEE Toolkits/3. ICT (QSE)/` | Blank ICT QSE toolkit | **QSE structure**: 51 sheets (drops EAP and MC Calcs, merges MC+EE into single element). ESD+SED combined. Lower thresholds. |
| **BBBEE Toolkit (RCOGP QSE) Template v1.1** | `BBBEE Toolkits/4. RCOGP (QSE)/` | Blank RCOGP QSE toolkit | **QSE under Revised Codes**: Same 51-sheet QSE structure as ICT QSE but with RCOGP targets. |
| **BBBEE Toolkit (FSC) Template v1.0** | `BBBEE Toolkits/5. FSC (Generic)/` | Blank FSC Generic toolkit (89.7 MB) | **Most complex sector**: 63 sheets. Unique FSC-specific sheets: `EF & ESD Scorecard - Banks/Long Term`, `Transaction Financing Data`, `SED & CE Scorecard`, `AFS Scorecard - Banks/Long Term/Short Term`, `Scoring Scale`, split MC calc sheets. |
| **BBBEE Toolkit (Agri Generic) Master v1.0.1** | `BBBEE Toolkits/6. Agri (Generic)/` | Blank AgriBEE toolkit | **Agri-specific**: 53 sheets. Agri-specific fields: Land Ownership (hectares/%), Agricultural Development Contribution, Farmworker Housing. Sector-specific targets. |

### Completed Client Files (Validation Targets)

| Document | Location | Purpose | What It Validates |
|----------|----------|---------|-----------------|
| **Lake Trading Toolkit (RCOGP)** | `AI_UnderstandingSystem/` | **PRIMARY VALIDATION TARGET** — completed/populated RCOGP toolkit for Lake Trading 447 (Pty) Ltd | **Engine correctness**: Known inputs → known outputs. All 7 pillars calculated. Level outcome known. This is the benchmark for testing the calculation engine. If our engine matches Lake Trading, it's correct. |
| **BEE Information Gathering File (Thandanani Transport)** | `AI_UnderstandingSystem/` | Populated info gathering file for second client | **Secondary validation**: Different data structure (simpler, tabular). Cross-references with certificate and final report. |
| **Certificate (Thandanani Transport)** | `AI_UnderstandingSystem/` | PDF verification certificate | **Output artifact validation**: Shows final BEE Level (1-8 or Non-Compliant), Recognition % (135%, 125%, etc.), Validity dates. Target: "Does our engine produce this level?" |
| **Final Report (Thandanani Transport)** | `AI_UnderstandingSystem/` | PDF verification report | **Granular validation**: Detailed pillar-by-pillar breakdown. Shows criterion-level scores, sub-minimum status, discounting applied. Most granular validation source. |

### Support/Reference Files

| Document | Location | Purpose | What It Informs |
|----------|----------|---------|-----------------|
| **Info Request Sheet Template** | `AI_UnderstandingSystem/` | Template for gathering B-BBEE info from clients | **Minimum data requirements**: Defines the essential fields a client must provide. Maps directly to manual input fields in the Build flow. |
| **Okiru B-BBEE Strategy Pack (Lake Trading)** | `AI_UnderstandingSystem/` | PowerPoint strategy presentation | **UI/Report structure**: Shows the pillar flow from current-state analysis through pillar analysis, YES, and scenario planning. Defines how the UI should present results and how the strategy pack should be structured. |
| **Training Pack 2026** | `BBBEE Toolkits/7. Template slides/` | B-BBEE training presentation | **User-facing copy**: Reference for how pillars/concepts are explained to users. Informs UI copy, help text, and onboarding. |

### Individual Data Sheets (Isolated Per-Pillar Views)

These are the **data collection forms** that map directly to manual input fields:

| File | Pillar | Sheets | Purpose |
|------|--------|--------|---------|
| **1. General Information_RCOGP_Generic.xlsx** | Foundation | Executive Summary (21 fields), Validations (lookup lists) | Client info: Company name, sector, industry, BEE level, FYE, company size, revenue, NPAT, leviable amount |
| **2. Management Control_RCOGP_generic.xlsx** | Management Control | Employees (21 columns), Instructions | Employee register: Full name, gender, race, designation, disabled, foreign, ID, hire/termination dates, salary, province |
| **3. Skills Development_RCOGP_generic.xlsx** | Skills Development | Skills Dev. (35 columns), Instructions | Training programmes: Program name, category (A-G), ABET, mandatory, bursary, provider, learner demographics, costs (course, travel, accommodation, catering, stationery, facility, salary, other), dates |
| **4. Preferential Procurement_RCOGP_Generic.xlsx** | Procurement | Suppliers (18 columns, 704 data rows), Explanations, Instructions | Supplier register: Name, company size, BEE level, VAT, empowering supplier, ownership %s, supplier dev recipient, 3-year contract, spend, location, certificate expiry |
| **5. Supplier Development_RCOGP_generic.xlsx** | ESD - Supplier Dev | Suppliers (17 columns), Lists, Size List, Instructions | SD contributions: Supplier name, dates, ownership, size, contribution description, type (14 options), amount, invoice/payment dates, rates |
| **6. Enterprise Development_RCOGP_generic.xlsx** | ESD - Enterprise Dev | Beneficiaries (15 columns), Lists, Size List, Instructions | ED contributions: Beneficiary name, dates, ownership, size, contribution description, type (13 options), amount, rates |
| **7. Socioeconomic Development_RCOGP_generic.xlsx** | SED | Beneficiaries (15 columns), Lists, Instructions | SED contributions: Beneficiary name, description, date, type (7 options), black benefit %, amount, 6 demographic counts (African/Coloured/Indian × Male/Female) |

### ICT Generic Data Sheets (Sector Comparison)

| File | ICT-Specific Differences from RCOGP |
|------|-------------------------------------|
| **6. Enterprise Development_ICT_Generic.xlsx** | Adds **"ICT Company?"** (Yes/No) field — not present in RCOGP |
| **7. Socioeconomic Development_ICT_Generic.xlsx** | Adds **"ICT Specific Initiative?"** (Yes/No) field — not present in RCOGP |

---

## Key Insights from Document Analysis

### 1. Sheet Structure is Consistent Across Sectors

All 6 sector variants share a **common core**:
- **Foundation**: Client Information, Financials, Industry Norms, Summary Scorecard
- **Pillar Scorecards**: 7 pillar scorecards (Ownership, MC, Skills, Procurement, ESD, SED, YES)
- **Pillar Data**: Data sheets per pillar where inputs are collected
- **Calculations**: Formula sheets connecting inputs to scorecards
- **Strategy**: 18 "Empower" sheets for strategy pack generation

**Differences are additive**:
- QSE: Drops EAP, merges MC+EE, combines ESD+SED
- FSC: Adds Access to Financial Services, Empowerment Financing, Transaction Financing
- ICT: Adds ICT-specific initiative flags
- Agri: Adds Land Ownership, Agricultural Development, Farmworker Housing

### 2. Data Sheets Define the User Input Model

The 7 individual data sheet files (General Info, MC, Skills, Procurement, Supplier Dev, Enterprise Dev, SED) define **exactly what fields users must enter**:
- Which fields are compulsory (marked with *)
- Accepted values (validation lists)
- Field types (text, date, percentage, numeric)
- Default values

These map directly to the **manual input forms** in the Build section UI.

### 3. The Calculation Chain

From the toolkit structure, the calculation chain is:

```
Data Sheets (Inputs)
    ↓
Calculation Sheets (Formulas)
    ↓
Pillar Scorecards (Criterion-level scores)
    ↓
Summary Scorecard (Pillar totals)
    ↓
Level Determination (With sub-minimum checks)
```

### 4. Root Context Determines Everything

Before any scorecard calculation, these fields determine which rules apply:

| Field | Determines |
|-------|------------|
| **Sector Code** | Which sector config (RCOGP, ICT, FSC, AGRI) |
| **Company Size** | Generic vs QSE vs EME (affects scorecard type, targets, thresholds) |
| **Turnover** | Auto-determines company size if not explicitly set |
| **Financial Year End** | Measurement period |
| **Verification Date** | Which code version applies |
| **Industry** | Industry norm for deemed NPAT calculation |
| **Province** | EAP targets (national vs provincial demographics) |

### 5. Cross-Pillar Dependencies

Data from one pillar feeds calculations in others:

| Source Pillar | Feeds Into |
|---------------|------------|
| **Financials** (Revenue, NPAT) | SED target (1% of NPAT), ESD targets (2%/1% of NPAT), Deemed NPAT check, YES cost base |
| **Financials** (Leviable Amount) | Skills spend targets (3.5% / 2.5% of leviable) |
| **Procurement** (TMPS) | All procurement sub-line targets (80%, 15%, 40%, 12% of TMPS) |
| **Management Control** (Employee Register) | MC scoring (board/exec %), EE scoring (occupational levels), Skills (learner employment status) |
| **Procurement** (Supplier Register) | Procurement scoring (BEE level, ownership, spend), Supplier Development (beneficiaries) |

---

## Quick Reference: File Locations

```
GoalDocs/
├── AI_UnderstandingSystem/
│   ├── BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx      # RCOGP Generic blank template
│   ├── Lake Trading Toolkit (RCOGP)(1).xlsx           # VALIDATION TARGET
│   ├── Okiru B-BBEE Strategy Pack_Lake Trading.pptx   # UI/report structure reference
│   ├── Info Request Sheet Template.xlsx               # Minimum data requirements
│   ├── BEE Information Gathering File - Thandanani Transport.xlsm  # Secondary validation
│   ├── Certificate - Thandanani Transport BE13609-300126.pdf       # Output validation
│   └── Final Report - Thandanani Transport BE13609-300126.pdf      # Granular validation
│
└── BBBEE Toolkits/
    ├── 1. RCOGP (Generic)/
    │   ├── BBBEE Toolkit (RCOGP)_Template_v.1.4.xlsx
    │   ├── Okiru Toolkit (RCOGP)_Template_v.1.0.xlsx
    │   ├── Lake Trading Toolkit (RCOGP).xlsx
    │   └── Data Sheets/                                 # 7 isolated data entry forms
    │       ├── 1. General Information_RCOGP_Generic.xlsx
    │       ├── 2. Management Control_RCOGP_generic.xlsx
    │       ├── 3. Skills Development_RCOGP_generic.xlsx
    │       ├── 4. Preferential Procurement_RCOGP_Generic.xlsx
    │       ├── 5. Supplier Development_RCOGP_generic.xlsx
    │       ├── 6. Enterprise Development_RCOGP_generic.xlsx
    │       └── 7. Socioeconomic Development_RCOGP_generic.xlsx
    │
    ├── 2. ICT (Generic)/
    │   ├── BBBEE Toolkit (ICT Generic)_Template_v.1.4.xlsx
    │   └── Datasheets/                                  # 7 ICT data entry forms
    │
    ├── 3. ICT (QSE)/
    │   └── BBBEE Toolkit (ICT QSE)_Template_v.1.1.xlsx
    │
    ├── 4. RCOGP (QSE)/
    │   └── BBBEE Toolkit (RCOGP QSE)_Template_v.1.1.xlsx
    │
    ├── 5. FSC (Generic)/
    │   └── BBBEE Toolkit (FSC) Template v1.0.xlsx       # Most complex (63 sheets)
    │
    ├── 6. Agri (Generic)/
    │   └── BBBEE Toolkit (Agri Generic)_Master_v.1.0.1.xlsx
    │
    └── 7. Template slides/
        └── Okiru B-BBEE Training Pack_ 2026.pptx
```

---

## How to Use This Document

When resuming work after context reset:

1. **Understand the goal**: Multi-layer scoring engine matching Lake Trading output
2. **Know the validation target**: Lake Trading toolkit → known scorecard output
3. **Reference the source of truth**: RCOGP Generic template (52 sheets) defines the schema
4. **Understand sector differences**: ICT adds ICT-specific flags, FSC adds financial services sheets, QSE merges MC+EE
5. **Map UI to data sheets**: The 7 data sheet files define manual input forms
6. **Know the calculation chain**: Data → Formulas → Pillar Scores → Summary → Level

---

## Related Documents

- `TOOLKIT_TAB_MAP.md` — Complete field-level mapping from Excel tabs to system entities
- `BBEE_SCORING_ENGINE_PLAN.md` (in `.kilo/plans/`) — Full implementation plan with phases
