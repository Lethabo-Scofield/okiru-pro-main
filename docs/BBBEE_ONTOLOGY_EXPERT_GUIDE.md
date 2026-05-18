# B-BBEE Ontology — Expert Input Guide

**File:** `apps/api/pipeline/bbbeeOntology.ts`  
**Version:** 1.0.0  
**Date:** 2026-05-14  
**Prepared for:** B-BBEE Domain Expert Review

---

## What is this document?

The Okiru B-BBEE platform processes Excel toolkit workbooks uploaded by clients and extracts structured data automatically.  To do this accurately it needs a *formal vocabulary* — a precise list of every concept, field, valid value, and business rule in the B-BBEE domain.

That vocabulary lives in one file: `apps/api/pipeline/bbbeeOntology.ts` (the **Ontology**).

This guide explains what the ontology does, which parts are already filled in by the engineering team, and which parts need your expert input.  **You do not need to know TypeScript** — every gap is clearly labelled `TODO:` and surrounded by readable context.

---

## How the ontology is used

| Consumer | What it uses from the ontology |
|---|---|
| **Excel Extractor** | Column alias lists — the extractor scans every column header against the aliases to find the right field |
| **Sheet Matcher** | Sheet name hints — maps workbook tabs to data categories (ownership, management, etc.) |
| **LLM Reconciler** | Enum lists — validates that GPT-4 output only returns values in the allowed sets |
| **Scoring Engine** | Business rules — thresholds and formulas for each pillar |
| **Conversational AI** | Entity relationships — lets the AI answer questions like "what is the black ownership %" |

---

## What is already filled in (engineering team)

| Area | Status |
|---|---|
| All entity definitions (Company, Financials, Shareholder, Employee, Supplier, TrainingProgram, Contribution) | ✅ Complete |
| Column alias lists for every field | ✅ Complete |
| Sheet name hint lists for all 12 sheet types | ✅ Complete |
| Enum lists: sector codes, scorecard types, EAP provinces, race groups, occupational levels, BEE levels, skills categories, ESD contribution types, designated group types | ✅ Complete (but need expert confirmation) |
| Excel coercion rules (date serials, percentage extraction, currency extraction) | ✅ Complete |
| BEE level recognition percentages (L1=135%, L2=125%, …) | ✅ Captured but **needs expert verification** |
| Skills category descriptions (A–G) | ✅ Captured but **needs expert verification** |
| Deemed NPAT logic (< 25% of industry norm triggers deemed NPAT) | ✅ Captured but **needs expert confirmation** |

---

## What the expert must fill in

Search the file `apps/api/pipeline/bbbeeOntology.ts` for `TODO:` to find every gap.  There are **38 expert TODOs** across the following themes:

---

### 1. Sector codes — completeness

**Location:** `BBBEE_ONTOLOGY.enums.sectorCodes.expertNote`

> TODO: confirm complete authoritative list; add LIQUID FUELS, MEDIA, and any recently gazetted sector codes

**What we need:**  
The full list of sector codes (with their official abbreviations) that the system should recognise, plus any new codes gazetted after 2016.

**Example of a complete entry:**

```
"RCOGP" → "Revised Codes of Good Practice (DTI, 2013, amended 2018)"
"ICT"   → "ICT Sector Code (2016)"
...
```

---

### 2. EME/QSE/Generic turnover thresholds per sector

**Location:** `BBBEE_ONTOLOGY.enums.applicableScorecards.thresholds.expertNote`  
**Location:** `BBBEE_ONTOLOGY.entities.Company.properties.applicableScorecard.expertNote`

> TODO: confirm exact turnover thresholds per sector — FSC, AGRI, MINING differ from RCOGP Generic

**What we need:**  

| Sector | EME threshold | QSE threshold | Generic threshold |
|---|---|---|---|
| RCOGP | < R10M | R10M–R50M | > R50M |
| FSC | ? | ? | ? |
| AGRI | ? | ? | ? |
| MINING | ? | ? | ? |
| ICT | ? | ? | ? |
| … | … | … | … |

---

### 3. BEE level recognition percentages

**Location:** `BBBEE_ONTOLOGY.enums.beeLevels.recognitionPercents.expertNote`

> TODO: confirm recognition % values per current Gazette — Level 1=135% is RCOGP Generic; verify FSC and other sectors differ

**What we need:**  
Confirm or correct:

| Level | RCOGP Generic | FSC | AGRI | Other? |
|---|---|---|---|---|
| 1 | 135% | ? | ? | ? |
| 2 | 125% | ? | ? | ? |
| 3 | 110% | ? | ? | ? |
| 4 | 100% | ? | ? | ? |
| 5 | 80% | ? | ? | ? |
| 6 | 60% | ? | ? | ? |
| 7 | 50% | ? | ? | ? |
| 8 | 10% | ? | ? | ? |
| Non-compliant | 0% | ? | ? | ? |

---

### 4. Ownership pillar scoring details

**Location:** `BBBEE_ONTOLOGY.businessRules.ownership`  
**Location:** Various `expertNote` fields on `Shareholder` entity

> TODO: fill in all sub-scores, points, and thresholds for Generic/QSE/EME

**What we need for RCOGP Generic:**

| Sub-element | Max points | Threshold for full points | Sub-minimum? |
|---|---|---|---|
| Voting Rights (Black) | ? | ?% | Yes/No |
| Economic Interest (Black) | ? | ?% | Yes/No |
| Net Value | ? | Formula | Yes/No |
| Black Women Ownership | ? | ?% | Yes/No |
| Designated Groups | ? | ?% bonus | Yes/No |
| New Entrant | ? | Criteria | Yes/No |
| **Total Ownership** | **25** | 40% sub-min | **Yes** |

Also provide:
- Modified flow-through formula for holding company chains
- Graduation factor table (currently implemented as: ≤1yr=1.0, 1–3yr=0.9, 3–5yr=0.8, 5–10yr=0.7, >10yr=0.6 — please confirm)

---

### 5. Management Control sub-scores

**Location:** `BBBEE_ONTOLOGY.businessRules.managementControl`

> TODO: fill in EAP comparator methodology, sub-score weights

**What we need:**

| Sub-element | Occupational levels counted | Max points | EAP source |
|---|---|---|---|
| Board representation | Board | ? | ? |
| Top Management | Executive + Executive Director | ? | ? |
| Senior Management | Senior | ? | ? |
| Middle Management | Middle | ? | ? |
| Junior Management | Junior | ? | ? |
| Disability | All | ? | 2% target? |
| **Total MC** | | **? pts** | |

Also provide:
- Which edition of Stats SA data is used for EAP percentages (Census 2011, QLFS 2020, etc.)
- Whether province-specific EAP is mandatory or if National EAP is acceptable as default

---

### 6. Skills Development categories and targets

**Location:** `BBBEE_ONTOLOGY.enums.skillsCategories.descriptions.expertNote`  
**Location:** `BBBEE_ONTOLOGY.businessRules.skillsDevelopment`

> TODO: confirm exact definitions of categories A–G  
> TODO: confirm Generic 1.5% vs QSE 2% target

**What we need:**

| Category | Full description | Leviable amount target (Generic) | Notes |
|---|---|---|---|
| A | Learnerships / apprenticeships | ? | SETA-accredited only? |
| B | Skills programmes / short courses | ? | |
| C | Bursaries (employed) | ? | |
| D | Bursaries (unemployed) | ? | |
| E | Internships | ? | |
| F | External unaccredited training | ? | Cap? |
| G | Informal / on-the-job training | ? | Cap? |

Also:
- Sub-minimum threshold for skills pillar
- Is there a separate black women learner sub-element?
- Absorption bonus: how many points and which categories qualify?

---

### 7. Preferential Procurement pillar

**Location:** `BBBEE_ONTOLOGY.businessRules.preferentialProcurement`

> TODO: fill in TMPS definition, recognition %, bonus supplier criteria

**What we need:**
- Complete TMPS inclusion and exclusion list per Code 400
- Empowering Supplier criteria (what sub-elements must they demonstrate?)
- Designated group supplier bonus: criteria and points
- Sub-minimum rule: what % of TMPS to QSE/EME suppliers is required?

---

### 8. ESD / SED targets

**Location:** `BBBEE_ONTOLOGY.businessRules.esd` and `.sed`

> TODO: confirm SD 2% + ED 1% + SED 1% of NPAT

**What we need:**
- Confirm RCOGP Generic targets: SD = 2% NPAT, ED = 1% NPAT, SED = 1% NPAT
- Confirm whether deemed NPAT applies to both ESD and SED
- Jobs created bonus: formula and evidence requirements
- For SED: must 100% of beneficiaries be black, or is partial black benefit acceptable?

---

### 9. Designated group definitions

**Location:** `BBBEE_ONTOLOGY.enums.designatedGroupTypes.expertNote`

> TODO: are 'rural community' or 'collective ownership structures' additional types?

**What we need:**
- Complete list of designated group types recognised under current Codes
- Evidence requirements for each type (e.g. birth certificate for youth, medical certificate for disability)

---

### 10. New Entrant definition

**Location:** `BBBEE_ONTOLOGY.entities.Shareholder.properties.blackNewEntrant.expertNote`

> TODO: definition of 'new entrant' per Codes — asset threshold? Prior participation?

**What we need:**
- Exact definition of "new entrant to the economy" per Codes
- Asset threshold or other qualifying criteria
- How it must be evidenced in a verification

---

### 11. TMPS inclusions and exclusions (complete list)

**Location:** `BBBEE_ONTOLOGY.entities.Financials.properties.tmpsInclusions.expertNote`  
**Location:** `BBBEE_ONTOLOGY.entities.Financials.properties.tmpsExclusions.expertNote`

> TODO: provide complete list of what is included vs excluded in TMPS per Codes statement 400

**What we need:** A full list such as:

**Inclusions:**
- Cost of sales
- Capital expenditure
- Depreciation on owned assets
- …

**Exclusions:**
- Payments to non-SA residents
- Payments to public entities
- Inter-group transactions
- Import costs
- …

---

## How to provide your input

You have two options:

**Option A — Edit the TypeScript file directly**  
Open `apps/api/pipeline/bbbeeOntology.ts`, search for `TODO:`, and replace each `expertNote: "TODO: ..."` with the actual value. For example:

```typescript
// BEFORE:
expertNote: "TODO: confirm recognition % — Level 1 = 135%?"

// AFTER (you fill in):
expertNote: "CONFIRMED: Level 1 = 135% per RCOGP Generic Amended Codes 2018 Gazette 41266"
```

**Option B — Fill in this document**  
Fill in the tables above and return it to the engineering team. They will update the ontology file accordingly.

---

## Example: Completed vs Incomplete entry

**Incomplete (current state):**

```typescript
beeLevel: {
  description: "The supplier's B-BBEE recognition level",
  type: "number",
  validation: { min: 1, max: 8 },
  expertNote: "TODO: confirm recognition % per level — Level 1=135%? Level 2=125%? etc."
}
```

**Completed (after expert input):**

```typescript
beeLevel: {
  description: "The supplier's B-BBEE recognition level",
  type: "number",
  validation: { min: 1, max: 8 },
  scoringNote: "RCOGP Generic recognition: L1=135%, L2=125%, L3=110%, L4=100%, L5=80%, L6=60%, L7=50%, L8=10%, non-compliant=0%. Source: Amended Codes Gazette 41266, 2018.",
  expertNote: "CONFIRMED. FSC differs — FSC L1=110%, L2=105%. See FSC Code 400."
}
```

---

## Priority order

The following TODOs have the highest impact on scoring accuracy and should be addressed first:

1. **BEE level recognition percentages** — affects every supplier procurement calculation
2. **Ownership sub-scores and thresholds** — affects every entity's primary pillar
3. **Skills Development category definitions and targets** — affects skills spend allocation
4. **ESD/SED targets** — affects 2 pillars and deemed NPAT usage
5. **EME/QSE turnover thresholds by sector** — affects scorecard classification
6. **TMPS inclusions/exclusions** — affects procurement denominator

---

## Contact

Once you have reviewed this guide and the ontology file, please return your input to the engineering team via:
- Direct edits to the TypeScript file (preferred), or
- Annotated copy of this markdown document

Questions about the technical structure of the file can be directed to the engineering team.
