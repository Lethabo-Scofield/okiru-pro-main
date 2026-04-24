# B-BBEE Scoring Engine — Full System Overhaul Plan

**Created:** 2026-03-28
**Status:** Planning
**Goal:** Transform the current flat extraction + fragmented calculation system into a production-grade, hierarchical scoring engine with proper ontology, deterministic calculations, and guided user flow.

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

| Document | Location | Purpose | What It Teaches the System |
|----------|----------|---------|---------------------------|
| **BBBEE Toolkit (RCOGP) Template v1.4** | `AI_UnderstandingSystem/` + `BBBEE Toolkits/1. RCOGP (Generic)/` | Blank RCOGP Generic toolkit template | Tab structure, formula logic, cell references, pillar layouts, input fields. This is the "schema source of truth" for RCOGP Generic. |
| **Lake Trading Toolkit (RCOGP)** | `AI_UnderstandingSystem/` + `BBBEE Toolkits/1. RCOGP (Generic)/` | Completed/populated RCOGP toolkit for a real client | Actual data in each field, expected calculated outputs, validation target for the engine. |
| **Okiru B-BBEE Strategy Pack (Lake Trading)** | `AI_UnderstandingSystem/` | PowerPoint strategy presentation | Shows the pillar flow from current-state analysis through pillar analysis, YES, and scenario planning. Defines how the UI/report should present results. |
| **Info Request Sheet Template** | `AI_UnderstandingSystem/` | Template for gathering B-BBEE info from clients | Defines the minimum data set a client must provide. Maps directly to manual input fields. |
| **BEE Info Gathering File (Thandanani Transport)** | `AI_UnderstandingSystem/` | Populated info gathering file for a second client | Second validation target. Cross-references with the certificate and final report. |
| **Certificate (Thandanani Transport)** | `AI_UnderstandingSystem/` | PDF verification certificate | The output artifact. Shows BEE level, recognition %, validity dates. Target for "does our engine match this?" |
| **Final Report (Thandanani Transport)** | `AI_UnderstandingSystem/` | PDF verification report | Detailed pillar-by-pillar breakdown resolving back into the final scorecard. This is the most granular validation source. |
| **RCOGP Generic Data Sheets (7 files)** | `BBBEE Toolkits/1. RCOGP (Generic)/Data Sheets/` | Individual pillar input sheets | Isolated per-pillar views: General Info, MC, Skills, Procurement, Supplier Dev, Enterprise Dev, SED. Shows exact fields per pillar. |
| **ICT Generic Template + Data Sheets** | `BBBEE Toolkits/2. ICT (Generic)/` | ICT sector toolkit + 7 data sheets | ICT-specific targets, weightings, and additional fields (3rd-party ICT spend, ICT BO spend). |
| **ICT QSE Template** | `BBBEE Toolkits/3. ICT (QSE)/` | ICT QSE toolkit (combined MC+EE) | QSE-specific structure where MC and EE merge, ESD+SED combine. |
| **RCOGP QSE Template** | `BBBEE Toolkits/4. RCOGP (QSE)/` | RCOGP QSE toolkit | Same QSE structure under Revised Codes. |
| **FSC Generic Template** | `BBBEE Toolkits/5. FSC (Generic)/` | Financial Sector Code toolkit (89.7 MB) | FSC-specific pillars: Access to Financial Services, Empowerment Financing, BEE Transaction Financing. Largest and most complex. |
| **Agri Generic Template** | `BBBEE Toolkits/6. Agri (Generic)/` | AgriBEE toolkit | Agri-specific: Land Ownership, Agricultural Development, Farmworker Housing. |
| **Training Pack 2026** | `BBBEE Toolkits/7. Template slides/` | B-BBEE training presentation | Reference for how pillars/concepts are explained to users. Informs UI copy and onboarding. |

---

## Current Architecture Gaps

| Gap | Current State | Target State |
|-----|--------------|--------------|
| **Entity extraction is flat** | `entityManifest.ts` defines a flat list of ~35 entities per sector with no hierarchy | 5-layer hierarchy: Root Context → Pillar Packs → Criterion Entities → Evidence → Derived Calculations |
| **No data-feeds-pillar mapping** | Entities know their `pillarCode` but nothing about what drives what | Graph edges: REQUIRES, FEEDS_INTO, DERIVED_FROM, VALIDATED_BY, BELONGS_TO, OVERRIDES, CONSTRAINS |
| **Excel logic not systemized** | 3 parallel calculator implementations (legacy, sector-aware, frontend) + Excel formula DAG | Single rules registry where each formula is a named node with declared inputs and outputs |
| **No ontology** | ArangoDB stores formula graphs (cells + edges) but not semantic relationships | Full ontology: SectorRule, Pillar, Criterion, EntityField, EvidenceItem, Calculation, ScoreResult nodes |
| **Manual input too shallow** | 6 fields + custom targets in DocumentProcessor | Per-pillar deep forms matching toolkit tab structure |
| **No evidence linking** | Extracted values have no traceable source | Every field links to document, page, row, or upload type |

---

## Phase Overview

| Phase | Name | Scope | Key Deliverables |
|-------|------|-------|-----------------|
| **0** | Analysis & Documentation | GoalDocs decomposition, tab mapping | `BBEE_GOAL_CONTEXT.md`, Excel tab-to-field mapping JSON |
| **1** | Master Entity Schema | Hierarchical entity model for all sectors | Restructured `entityManifest.ts` with 5 layers |
| **2** | ArangoDB Ontology | Graph restructure with proper nodes + edges | New collections, migration script |
| **3** | Rules Registry & Calc Engine | Formulas as named graph nodes | `rulesRegistry.ts`, unified calculator |
| **4** | UI: Build Section | Upload to Build, pillar-by-pillar guided flow | Refactored `DocumentProcessor.tsx` |
| **5** | Integration & Validation | Wire everything, test against real scorecards | End-to-end test passing against Lake Trading |

---

## Phase 0: Analysis & Documentation

**Goal:** Decompose GoalDocs Excel files, map every tab's fields, and create reference docs that survive context resets.

### Tasks

- [ ] **0.1** Extract tab/sheet names from each of the 6 toolkit Excel files programmatically
- [ ] **0.2** For each tab, list: input fields (cells the user fills), formula fields (cells computed), output fields (cells shown on scorecard)
- [ ] **0.3** Map each tab's fields to the entity hierarchy (which pillar, which criterion, which formula)
- [ ] **0.4** Create `docs/BBEE_GOAL_CONTEXT.md` — the base goal document explaining why each GoalDocs file matters
- [ ] **0.5** Create `docs/TOOLKIT_TAB_MAP.md` — complete field-level mapping from Excel tabs to system entities
- [ ] **0.6** Identify cross-pillar dependencies (NPAT feeds SED, ESD, Skills; Payroll feeds Skills; TMPS feeds Procurement)
- [ ] **0.7** Document the "root context" fields that determine which rules apply: sector, sector code/version, company size (EME/QSE/Generic), financial year end, verification date, applicable industry norm, province/EAP target set

### Acceptance Criteria
- Can answer "what Excel cell drives what scorecard line item" for any pillar/sector
- Context document enables any new session to understand the full system without re-reading all files

---

## Phase 1: Master Entity Schema (Hierarchical)

**Goal:** Restructure `entityManifest.ts` from a flat list into the 5-layer hierarchy.

### Current Structure (replacing)

```
entityManifest.ts -> flat array of EntityRequirement[]
  - financialEntities (5)
  - ownershipEntities (5)
  - managementControlEntities (5)
  - skillsDevelopmentEntities (5)
  - procurementEntities (4)
  - esdEntities (4)
  - sedEntities (3)
  + sector-specific (ICT: 2, FSC: 3, AGRI: 3)
```

### Target Structure

```typescript
// Layer 1: Root Context
interface RootContext {
  sector: string;              // RCOGP, ICT, FSC, AGRI
  sectorCodeVersion: string;   // e.g., "Amended Codes 2013", "ICT Code 2016"
  scorecardType: 'Generic' | 'QSE' | 'EME';
  companySize: 'EME' | 'QSE' | 'Generic';
  financialYearEnd: string;
  verificationDate: string;
  applicableIndustryNorm: string;
  province: string;
  eapTargetSet: string;
}

// Layer 2: Pillar Pack
interface PillarPack {
  pillarCode: string;
  pillarName: string;
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumThreshold: number;
  criteria: CriterionEntity[];
  requiredEntities: AtomicEntity[];
}

// Layer 3: Criterion Entity
interface CriterionEntity {
  code: string;                // e.g., "OWN-VR-BLACK"
  name: string;                // "Exercisable voting rights of black people"
  pillarCode: string;
  target: number | string;     // 25% or "25% + 1 vote"
  maxPoints: number;           // 4
  formula: string;             // "min((actual / target) * maxPoints, maxPoints)"
  inputEntities: string[];     // ["blackVotingPercent"]
  bonusCondition?: string;
  capRule?: string;
  minimumThreshold?: number;
  period?: string;
  evidenceRequired: string[];
}

// Layer 4: Atomic Entity (raw extracted field)
interface AtomicEntity {
  name: string;
  fieldType: 'currency' | 'percentage' | 'count' | 'string' | 'date' | 'bee_level';
  definition: string;
  pillarCode: string;
  criterionCodes: string[];    // which criteria this feeds
  source: EvidenceRef;
  aliases: string[];
  validationRules: ValidationRules;
}

// Layer 5: Evidence Entity
interface EvidenceRef {
  documentType: string;        // 'toolkit_excel' | 'pdf_certificate' | 'manual_input' | 'info_request'
  documentName?: string;
  sheetName?: string;
  cellAddress?: string;
  pageNumber?: number;
  rowRange?: string;
  uploadedAt?: string;
  confidence?: number;
}
```

### Tasks

- [ ] **1.1** Define `RootContext` interface and add root context entities to the manifest (sector, company size, FYE, verification date, industry norm, province, EAP target set)
- [ ] **1.2** Define `CriterionEntity` interface — every scoreable line item with target, formula, max points, inputs
- [ ] **1.3** Define `EvidenceRef` interface — link every extracted value to source document/page/cell
- [ ] **1.4** Refactor Ownership pillar: break into criterion entities (VR black, VR BWO, EI black, EI BWO, designated groups, new entrants, net value) each with formula, target, inputs
- [ ] **1.5** Refactor Management Control pillar: board black %, board BWO %, exec black %, exec BWO %, EAP targets
- [ ] **1.6** Refactor Employment Equity pillar: senior, middle, junior, disabled — each with EAP-adjusted targets
- [ ] **1.7** Refactor Skills Development pillar: overall spend %, categories A-F, bursaries, learnerships, absorbed learners
- [ ] **1.8** Refactor Preferential Procurement pillar: empowering suppliers, QSE spend, EME spend, BO51, BWO30, designated group, bonus items
- [ ] **1.9** Refactor Enterprise & Supplier Development pillar: SD %, ED %, bonus graduation, bonus jobs
- [ ] **1.10** Refactor SED pillar: spend % of NPAT, qualifying beneficiaries
- [ ] **1.11** Refactor YES pillar: youth headcount targets, candidates, absorption rate, cost per candidate
- [ ] **1.12** Add sector-specific overrides per pillar (ICT: 3rd-party ICT spend; FSC: access to services, empowerment financing; AGRI: land ownership, farmworker housing)
- [ ] **1.13** Build `buildHierarchicalManifest(rootContext: RootContext)` factory that assembles the full pillar pack set for any sector/type combo
- [ ] **1.14** Ensure backward compatibility — the old `buildManifestForSector()` still works by delegating to the new hierarchy

### Acceptance Criteria
- Every entity has a `criterionCode` linking it to a scoreable line
- Every criterion has a declared formula, target, and max points
- Every entity has an `EvidenceRef` slot
- All 6 sector variants produce correct pillar packs

---

## Phase 2: ArangoDB Ontology Restructure

**Goal:** Add proper graph nodes and edges so the system can answer "what feeds where" via traversal.

### New Node Types (Document Collections)

| Collection | Purpose | Key Fields |
|------------|---------|------------|
| `sector_rules` | Sector-specific rule sets (replaces hard-coded sectorConfig.ts) | sectorCode, scorecardType, pillarConfigs, targets, levelThresholds |
| `criteria` | Scoreable line items within a pillar | code, name, pillarCode, target, maxPoints, formula, bonusCondition |
| `entity_fields` | Atomic data fields that can be extracted or manually entered | name, fieldType, pillarCode, criterionCodes, validationRules |
| `evidence_items` | Source document references for extracted values | documentType, documentName, sheetName, cellAddress, pageNumber, confidence |
| `calculations` | Derived values (deemed NPAT, leviable amount, TMPS, recognition %, absorption rates) | name, formula, inputs[], output, computedValue |
| `score_results` | Per-criterion and per-pillar score snapshots | criterionCode, actual, target, score, maxPoints, assessmentId |

### New Edge Types (Edge Collections)

| Edge Collection | From to To | Purpose |
|----------------|-----------|---------|
| `requires` | Criterion to EntityField | "This criterion requires this input" |
| `feeds_into` | EntityField to Criterion | "This field feeds into this criterion's calculation" |
| `derived_from` | Calculation to EntityField/Calculation | "This derived value comes from these inputs" |
| `validated_by` | EntityField to EvidenceItem | "This value is backed by this evidence" |
| `belongs_to` | Criterion to Pillar | "This criterion belongs to this pillar" |
| `overrides` | SectorRule to Criterion | "This sector rule overrides this criterion's default" |
| `constrains` | SectorRule to Pillar | "This sector rule constrains this pillar's max/threshold" |

### Tasks

- [ ] **2.1** Add new document collections: `sector_rules`, `criteria`, `entity_fields`, `evidence_items`, `calculations`, `score_results`
- [ ] **2.2** Add new edge collections: `requires`, `feeds_into`, `derived_from`, `validated_by`, `belongs_to`, `overrides`, `constrains`
- [ ] **2.3** Create indexes for new collections (criterionCode, pillarCode, sectorCode, assessmentId)
- [ ] **2.4** Create `SectorRuleRepository` — CRUD for sector rules, load from sectorConfig.ts data
- [ ] **2.5** Create `CriterionRepository` — CRUD for criteria, linked to pillars via belongs_to edges
- [ ] **2.6** Create `EntityFieldRepository` — CRUD for entity fields, linked to criteria via requires/feeds_into edges
- [ ] **2.7** Create `EvidenceRepository` — CRUD for evidence items, linked to entity fields via validated_by edges
- [ ] **2.8** Create `CalculationRepository` — CRUD for derived calculations, linked via derived_from edges
- [ ] **2.9** Create `ScoreResultRepository` — CRUD for score snapshots per assessment
- [ ] **2.10** Write seed script to populate sector_rules from existing sectorConfig.ts (all 6 variants)
- [ ] **2.11** Write seed script to populate criteria from the new hierarchical entity manifest
- [ ] **2.12** Wire cross-pillar dependency edges:
  - NPAT leads to SED criterion, ESD criterion, Skills levy base
  - Payroll/Leviable Amount leads to Skills spend targets
  - TMPS leads to Procurement spend targets
  - Headcount leads to Management Control %, Employment Equity %
  - Supplier data leads to Procurement + Supplier Development

### Acceptance Criteria
- Can traverse from any entity field to its criterion to its pillar to the sector rule
- Can answer "if I change Revenue, what scores are affected?" via graph traversal
- Existing formula graph (cells + cell_dependency) is preserved and connected to the new ontology

---

## Phase 3: Rules Registry & Calculation Engine

**Goal:** Replace the 3 fragmented calculator implementations with one rules-driven engine.

### Current Calculator Locations (to be unified)

1. `apps/api/pipeline/calculators.ts` — legacy hardcoded (233 lines)
2. `apps/api/pipeline/sectorCalculators.ts` — sector-parameterized (185 lines)
3. `apps/web/Toolkit/src/lib/calculators/` — frontend (6 files, ~700 lines total)
4. `apps/api/pipeline/tsGraphEvaluator.ts` — ArangoDB formula graph evaluator (274 lines)

### Target Architecture

```
RulesRegistry (single source of truth)
  -- Rule: OWN-VR-BLACK
     formula: min((actual / target) * maxPoints, maxPoints)
     inputs: [blackVotingPercent]
     target: 0.25
     maxPoints: 4
     sectorOverrides: { ICT: { maxPoints: 4 }, FSC: { maxPoints: 4 } }

  -- Rule: PROC-BO51
     formula: min((blackOwned51Spend / (tmps * target)) * maxPoints, maxPoints)
     inputs: [blackOwned51Spend, tmps]
     target: 0.40
     maxPoints: 11
     sectorOverrides: { ICT: { maxPoints: 9 }, FSC: { maxPoints: 5 } }

CalculationEngine
  resolve(assessmentData, sectorRule) -> ScorecardResult
    1. Load entity field values
    2. Topologically sort criteria by dependencies
    3. Evaluate each criterion using its rule
    4. Aggregate per pillar
    5. Apply sub-minimum checks
    6. Determine level
```

### Tasks

- [ ] **3.1** Create `apps/api/pipeline/rulesRegistry.ts` — define every scorecard criterion as a named rule with formula, inputs, target, maxPoints, and sector overrides
- [ ] **3.2** Populate rules from the current calculator implementations:
  - Ownership: 7 sub-lines (VR black, VR BWO, EI black, EI BWO, designated groups, new entrants, net value)
  - Management Control: 4 (board black, board BWO, exec black, exec BWO)
  - Employment Equity: 4 (senior, middle, junior, disabled)
  - Skills: 2-6 (overall spend %, bursary spend %, categories A-F)
  - Procurement: 8 (empowering, QSE, EME, BO51, BWO30, designated, graduation bonus, jobs bonus)
  - ESD: 2+bonuses (SD %, ED %, graduation bonus, jobs bonus)
  - SED: 1 (% of NPAT)
  - YES: TBD (absorption, cost)
- [ ] **3.3** Create `apps/api/pipeline/calculationEngine.ts` — the unified engine that:
  - Accepts raw entity field values + sector config
  - Resolves derived calculations (deemed NPAT, leviable amount, recognized spend)
  - Evaluates each criterion rule
  - Aggregates pillar scores
  - Checks sub-minimums
  - Applies discounting
  - Determines BEE level
- [ ] **3.4** Add recognition table logic to procurement rules (BEE level to multiplier to recognized spend)
- [ ] **3.5** Add graduation factor logic to ownership rules (years held to factor)
- [ ] **3.6** Add deemed NPAT logic (industry norm, quarter-threshold check)
- [ ] **3.7** Add sub-minimum discounting logic (drop by 1 level per failed sub-minimum pillar)
- [ ] **3.8** Create test: `calculationEngine.test.ts` — validate against Lake Trading known scorecard values
- [ ] **3.9** Create test: validate against Thandanani Transport certificate/report values
- [ ] **3.10** Refactor `buildResult.ts` to use calculationEngine instead of calling individual calculators
- [ ] **3.11** Keep Toolkit frontend calculators as-is (client-side for offline/instant calc). Long-term: extract shared rules into @okiru/bbee-core package. For now, ensure API engine produces identical results to frontend calculators for the same inputs.
- [ ] **3.12** Store rules in ArangoDB criteria collection with formulas, enabling graph traversal queries

### Acceptance Criteria
- Single `evaluateScorecard(entities, sectorCode, scorecardType) -> ScorecardResult` function
- Output matches Lake Trading: all 7 pillars within 0.01 deviation
- Output matches Thandanani Transport certificate level and recognition %
- No duplicate calculation logic across files

---

## Phase 4: UI — Merge Build Flow into DocumentProcessor + Entity Template Upgrade

**Goal:** Evolve the existing DocumentProcessor into a hierarchical Build flow that shows the pillar structure when asking users to upload or manually input. Also upgrade the entity template UI to reflect the new hierarchical entity schema.

### Key Decisions
- **Merge, not replace**: Refactor DocumentProcessor.tsx in-place. Keep the same /processor route.
- **Toolkit stays separate**: Frontend calculators in Toolkit remain client-side for offline/instant calc. The new API engine powers the DocumentProcessor Build flow.
- **Entity template UI upgrade**: The EntityBuilder.tsx (currently flat entity lists) must reflect the hierarchical structure (Root Context, Pillar Packs, Criterion Entities).

### Current UI Flow (DocumentProcessor.tsx — 3649 lines)

```
company-info -> upload -> classify -> extract -> processing -> review -> summary -> scorecard
```

Manual input: 6 basic fields (blackOwnership, blackFemaleOwnership, blackBoardMembers, blackExecutiveManagement, skillsSpendOnBlack, blackLearnerships) + custom targets.

### Target UI Flow (merged into DocumentProcessor)

```
1. Company Setup (sector, type, company info, financial year)
   -- Auto-determines: Generic/QSE/EME, applicable sector config
   -- Shows the hierarchical structure: "Based on your sector, you need these pillars..."
   
2. Foundation Layer (upload OR manual per section)
   a. Client Information (company name, reg number, address, contact, sector, industry norm, province)
   b. Financials (revenue, NPAT, payroll/leviable amount, TMPS calculation, FYE, deemed NPAT check)
   -- Each section shows: "Upload a document" OR "Enter manually" toggle
   -- If upload: extraction pre-fills the form, user reviews/edits
   -- If manual: deep form matching toolkit tab depth
   
3. Pillar-by-Pillar Data Entry (each pillar as a collapsible panel or step)
   a. Ownership — shareholder register, BO%, BWO%, share values, graduation factors
      - Shows criterion sub-lines: VR black, VR BWO, EI black, EI BWO, designated groups, new entrants, net value
      - Each criterion shows target, current value, projected score
   b. Management Control — employee register with race, gender, designation, disability
   c. Employment Equity — same employee data, EAP targets per occupational level
   d. Skills Development — training programmes, categories A-F, costs, learner demographics
   e. Preferential Procurement — supplier register, BEE levels, ownership, spend, TMPS
   f. Enterprise & Supplier Development — beneficiary register, contribution types, amounts
   g. Socio-Economic Development — beneficiary register, contribution types, amounts
   h. YES Initiative — youth headcount, absorption, cost
   
4. Validation & Review
   -- Cross-checks, warnings, evidence completeness
   -- Shows "what feeds where" — user sees how their inputs affect scores
   
5. Scorecard Result
   -- Calculated scores, level, recognition %, export options
   -- Live updates as data changes (uses calculation engine)
```

### Entity Template UI Upgrade (EntityBuilder.tsx)

Current EntityBuilder shows a flat list of entities. It needs to become hierarchical:

```
Entity Template
  -- Root Context Fields (sector, company size, FYE, industry norm)
  -- Pillar: Ownership
      -- Criterion: Voting Rights (Black)
          -- Entity: Black Ownership Percentage (type: percentage, aliases: [...])
      -- Criterion: Economic Interest (Black)
          -- Entity: Shareholding Percentage
          -- Entity: Share Value
  -- Pillar: Management Control
      -- Criterion: Board Black %
          -- Entity: Employee Name
          -- Entity: Employee Race
          -- Entity: Employee Designation
  ... etc
```

Users can still add/edit individual entities, but the UI groups them by pillar and criterion, showing which scorecard line each entity feeds into.

### Tasks

- [ ] **4.1** Refactor DocumentProcessor steps: replace flat `company-info -> upload -> classify` with `company-setup -> foundation -> pillar-data -> validation -> scorecard`
- [ ] **4.2** Company Setup step: sector selection with visual cards, turnover input (auto-determines Generic/QSE/EME), financial year. Show pillar hierarchy preview ("Your scorecard will include these pillars...")
- [ ] **4.3** Foundation step: Client Info + Financials with upload-or-manual toggle per section. Port Financials depth from Toolkit Financials.tsx
- [ ] **4.4** Pillar Data step: collapsible panels for each pillar, each showing its criterion sub-lines with targets and projected scores
- [ ] **4.5** Per-pillar upload/manual toggle: user can upload a document for that specific pillar (extraction pre-fills) OR enter data manually (deep forms)
- [ ] **4.6** Ownership panel: port from Toolkit Ownership.tsx — shareholder register, full ownership threshold, graduation factors, net value
- [ ] **4.7** Management Control panel: port from Toolkit ManagementControl.tsx — employee register with board/exec/senior/middle/junior, race, gender, disability
- [ ] **4.8** Skills Development panel: port from Toolkit SkillsDevelopment.tsx — training programme register, category codes A-F, cost breakdown, learner demographics
- [ ] **4.9** Procurement panel: port from Toolkit ESD.tsx procurement section — supplier register, BEE levels, ownership, spend classification
- [ ] **4.10** ESD panel: port from Toolkit ESD.tsx contributions section — beneficiary register, contribution types, SD vs ED
- [ ] **4.11** SED panel: port from Toolkit SED.tsx — beneficiary register, contribution types, NPAT %
- [ ] **4.12** YES panel: new — youth headcount target, candidates enrolled, absorbed, cost per candidate
- [ ] **4.13** Validation step: warnings for missing data, cross-check triggers, evidence completeness summary
- [ ] **4.14** Scorecard Result step: fed by new calculation engine, live-updating as data changes
- [ ] **4.15** Progress indicator: nav sidebar or step bar showing which pillars are complete, which have warnings, which are empty
- [ ] **4.16** Upgrade EntityBuilder.tsx: group entities by pillar and criterion, tree-view structure, show which scorecard line each entity feeds into
- [ ] **4.17** Entity template API: update entity template CRUD to support hierarchical structure (pillar packs with criterion grouping)

### Acceptance Criteria
- User can complete a full scorecard via manual input only (no uploads required)
- User can upload documents for some pillars and manually enter others (per-pillar toggle)
- Each pillar panel shows criterion sub-lines with targets and projected scores
- Manual input forms match the depth of the Toolkit pillar pages
- Entity templates in EntityBuilder show hierarchical pillar/criterion grouping
- The flow produces a valid ScorecardResult matching the calculation engine output

---

## Phase 5: Integration & Validation

**Goal:** Wire everything together and validate against real scorecards.

### Tasks

- [ ] **5.1** Connect Build section forms to entity field values to calculation engine to scorecard result
- [ ] **5.2** Connect upload path to entity extraction to entity field values to calculation engine
- [ ] **5.3** Store completed assessments in ArangoDB with full ontology (entity fields, evidence items, criteria scores, pillar scores)
- [ ] **5.4** Test: Lake Trading end-to-end — upload Lake Trading toolkit, extract, calculate, compare to known result
- [ ] **5.5** Test: Thandanani Transport end-to-end — upload info gathering file, extract, calculate, compare to certificate
- [ ] **5.6** Test: Manual entry — enter Lake Trading data manually, calculate, compare
- [ ] **5.7** Test: Sector variants — verify RCOGP Generic, ICT Generic, FSC Generic, AGRI Generic produce correct max totals and level thresholds
- [ ] **5.8** Graph traversal queries: "what feeds where" query works (change NPAT, see SED, ESD, Skills impacts)
- [ ] **5.9** Evidence audit: every value in the scorecard result can trace back to its source (document + cell or manual input)
- [ ] **5.10** Performance: scorecard calculation completes in under 500ms

### Acceptance Criteria
- Lake Trading: all 7 pillars match within 0.01 points
- Thandanani Transport: level and recognition % match certificate
- Graph traversal returns correct dependency chains
- Full provenance trail from scorecard to evidence

---

## Execution Order for Today

### Morning Block (Foundation)
1. **Phase 0.1-0.3** — Extract Excel tabs, map fields (need this to inform everything)
2. **Phase 1.1-1.3** — Define the 3 core interfaces (RootContext, CriterionEntity, EvidenceRef)
3. **Phase 1.4** — Refactor Ownership pillar as the first pillar (most well-understood)

### Midday Block (Engine)
4. **Phase 3.1-3.3** — Create rules registry + calculation engine (start with Ownership only)
5. **Phase 3.8** — Test against Lake Trading ownership values
6. **Phase 1.5-1.10** — Expand to remaining pillars
7. **Phase 3.4-3.7** — Add recognition table, graduation, deemed NPAT, sub-minimum logic

### Afternoon Block (ArangoDB + UI)
8. **Phase 2.1-2.3** — Add new ArangoDB collections
9. **Phase 2.10-2.11** — Seed sector rules and criteria
10. **Phase 4.1-4.5** — Build section wizard structure + foundation steps
11. **Phase 4.6-4.12** — Pillar forms (can be iterative)

### Evening Block (Integration)
12. **Phase 5.1-5.3** — Wire forms to engine to results
13. **Phase 5.4-5.6** — Validation tests
14. **Phase 2.12** — Cross-pillar dependency edges

---

## Key Cross-Pillar Dependencies to Wire

```
Client Information --- drives --> Rule Selection (sector, type, thresholds)
Financials --------- drives --> Skills (leviable amount base)
                                SED (NPAT %)
                                ESD (NPAT %)
                                YES (NPAT base)
Ownership ---------- drives --> Ownership Scoring
                                (sometimes) Recognition Logic
Management Control - shares --> Employment Equity (same workforce data)
Payroll ------------ drives --> Skills Development (% of leviable amount)
Supplier Data ------ drives --> Procurement (BEE level, ownership, spend)
                                Supplier Development (beneficiaries)
Beneficiary Records  drives --> ESD (amount, type, black ownership %)
                                SED (amount, qualifying criteria)
Youth Headcount ---- drives --> YES (targets, absorption, cost)
```

---

## File Change Inventory

### New Files
| File | Purpose |
|------|---------|
| `docs/BBEE_GOAL_CONTEXT.md` | Base goal + GoalDocs role reference |
| `docs/TOOLKIT_TAB_MAP.md` | Excel tab to entity field mapping |
| `apps/api/pipeline/rulesRegistry.ts` | Criterion rules with formulas, sector overrides |
| `apps/api/pipeline/calculationEngine.ts` | Unified scoring engine |
| `apps/api/pipeline/calculationEngine.test.ts` | Engine validation tests |
| `apps/api/arango/repositories/sectorRuleRepository.ts` | Sector rules CRUD |
| `apps/api/arango/repositories/criterionRepository.ts` | Criteria CRUD |
| `apps/api/arango/repositories/entityFieldRepository.ts` | Entity fields CRUD |
| `apps/api/arango/repositories/evidenceRepository.ts` | Evidence items CRUD |
| `apps/api/arango/repositories/calculationRepository.ts` | Derived calculations CRUD |
| `apps/api/arango/repositories/scoreResultRepository.ts` | Score snapshots CRUD |
| `apps/web/src/components/build/` | Per-pillar form components extracted from DocumentProcessor |

### Modified Files
| File | Change |
|------|--------|
| `apps/api/pipeline/extraction/entityManifest.ts` | Add hierarchy (RootContext, CriterionEntity, EvidenceRef, PillarPack) |
| `apps/api/pipeline/types.ts` | Extend PipelineResult with criterion-level detail |
| `apps/api/arango/collections.ts` | Add 6 new document + 7 new edge collections |
| `apps/api/pipeline/buildResult.ts` | Delegate to calculationEngine instead of individual calculators |
| `apps/web/src/pages/DocumentProcessor.tsx` | Merge Build flow in-place: hierarchical steps, per-pillar upload/manual, criterion-level display |
| `apps/web/src/pages/EntityBuilder.tsx` | Upgrade to hierarchical view: group entities by pillar and criterion |
| `apps/api/src/routes/entityTemplates.ts` | Support hierarchical entity template structure |
| `apps/api/models.ts` | Update EntityTemplate schema for hierarchical structure |
| `apps/api/arango/entityCellMapping.ts` | Connect to new criterion/entity nodes |

### Preserved (no breaking changes)
| File | Reason |
|------|--------|
| `apps/api/pipeline/calculators.ts` | Legacy, keep for backward compat until engine is validated |
| `apps/api/pipeline/sectorCalculators.ts` | Keep as reference, eventually deprecated |
| `apps/api/pipeline/sectorConfig.ts` | Data source for ArangoDB seed, stays as fallback |
| `apps/web/Toolkit/` | Independent toolkit app, keep as-is |

---

## Risk Mitigation

1. **Do not break existing paths** — The current import/extract/score pipeline must keep working. All new code is additive until validated.
2. **Lock one sector first** — Start with RCOGP Generic, validate, then replicate pattern to others.
3. **Schema is sector-agnostic** — The CriterionEntity and PillarPack interfaces work for all sectors; sector-specific differences are in the targets/maxPoints, not the schema shape.
4. **Test-driven** — Lake Trading is the validation anchor. Every phase must pass the Lake Trading test before moving to the next.
5. **Markdown docs survive context resets** — The BBEE_GOAL_CONTEXT.md and TOOLKIT_TAB_MAP.md contain enough information to resume work in a new session.
