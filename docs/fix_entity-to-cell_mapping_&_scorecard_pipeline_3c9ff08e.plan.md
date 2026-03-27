---
name: Fix Entity-to-Cell Mapping & Scorecard Pipeline
overview: Fix critical weaknesses in entity-to-cell mapping system, test with Lake Trading data, and ensure the scorecard calculation uses Excel formulas from ingested templates. The entity-to-cell logic is the rock of the system - it must be sound.
todos:
  - id: fix-semantic-tag
    content: Add description field to SemanticTag type and populate in tagCell()
    status: completed
  - id: fix-chunk-import
    content: Fix DocumentChunker method call (buildChunks -> chunkPages)
    status: completed
  - id: fix-env-loading
    content: Verify Azure OpenAI environment variables load correctly
    status: completed
  - id: fuzzy-matching
    content: Implement fuzzy string matching for entity-to-cell matching
    status: completed
  - id: improve-cell-tagging
    content: Enhance tagCell() to cover more input cells with field type heuristics
    status: completed
  - id: per-cell-confidence
    content: Add per-cell confidence tracking in EntityCellMapping
    status: completed
  - id: load-test-data
    content: Create script to load Lake Trading CSV entities
    status: completed
  - id: info-sheet-parser
    content: Create Info Request Sheet Excel parser
    status: completed
  - id: e2e-test-script
    content: Create end-to-end test script for Lake Trading validation
    status: completed
  - id: dynamic-scorecard
    content: Create DynamicScorecard component that renders from API structure
    status: completed
  - id: coverage-validator
    content: Create EntityCoveragePanel UI component
    status: completed
  - id: store-api-actions
    content: Add API integration actions to store.ts
    status: completed
  - id: validate-lake
    content: Run end-to-end validation against Lake Trading data
    status: in_progress
  - id: test-info-sheet
    content: Test Info Request Sheet upload and calculation
    status: pending
  - id: test-all-templates
    content: Validate all 6 sector templates
    status: pending
isProject: false
---

## Phase 1: Critical Bug Fixes (Entity-to-Cell Mapping)

### 1.1 Fix Missing Description Field in SemanticTag

**File:** `apps/api/pipeline/formulaGraphBuilder.ts`

The `SemanticTag` type lacks a `description` field, but the matching algorithm in `entityCellMapping.ts` tries to read `tag.description`. This breaks name/alias matching (0.75 of possible confidence score).

**Changes:**

- Add `description?: string` to SemanticTag type
- Update `tagCell()` function to populate description from cell labels, comments, or neighbor context
- Ensure description includes semantic context for matching

**Code location:** Lines 33-36 in formulaGraphBuilder.ts

### 1.2 Fix DocumentChunker Import Error

**File:** `apps/api/src/routes/hybridExtraction.ts`

The extraction endpoint has a bug where it calls `chunker.buildChunks()` but the method is actually `chunker.chunkPages()`.

**Changes:**

- Update line 274 from `buildChunks()` to `chunkPages()`

### 1.3 Ensure Azure OpenAI Loads from Environment

**File:** `apps/api/pipeline/extraction/azureOpenAIClient.ts`

The Azure OpenAI client initialization may not be reading from .env properly when running via API.

**Changes:**

- Verify `dotenv` is imported in the main entry point
- Add environment variable validation logging

## Phase 2: Enhance Entity-to-Cell Matching Algorithm

### 2.1 Implement Fuzzy String Matching

**File:** `apps/api/arango/entityCellMapping.ts`

Current matching uses exact substring inclusion (`tagDesc.includes(entityNameLower)`). This fails on word order variations.

**Changes:**

- Add Levenshtein distance or similar fuzzy matching algorithm
- Handle abbreviations ("NPAT" vs "Net Profit After Tax")
- Handle word order variations
- Update confidence scoring to use fuzzy match quality

**Implementation:** Create helper function `fuzzyMatchScore(entityName: string, cellDescription: string): number`

### 2.2 Improve Cell Tagging Coverage

**File:** `apps/api/pipeline/formulaGraphBuilder.ts`

The `tagCell()` function is conservative and misses valid input cells.

**Changes:**

- Add field type heuristics (numeric cells with nearby labels)
- Tag cells with currency patterns as 'financial' inputs
- Tag cells with percentage patterns as ownership/management inputs
- Use neighbor cell analysis (look at row labels)

### 2.3 Add Per-Cell Confidence Tracking

**File:** `apps/api/arango/entityCellMapping.ts`

Currently only the best match's confidence is stored.

**Changes:**

- Modify `EntityCellMapping` to track confidence per cell address
- Store all match candidates with their scores
- Enable disambiguation when multiple cells match

## Phase 3: Test Data Integration

### 3.1 Create Entity Loader for Test Data

**File:** `scripts/load-test-entities.mjs`

Load entities from `lake-trading.csv` into a format the API can use for testing.

**Implementation:**

- Parse CSV with columns: Entity Label, Extracted Value, Source Sheet
- Convert to entity map: `{ "Total Revenue": 150000000, "NPAT": 12000000, ... }`
- Save as JSON for reuse

### 3.2 Create Info Request Sheet Parser

**File:** `apps/api/pipeline/parsers/infoRequestSheetParser.ts`

The Info Request Sheet Template.xlsx has a specific structure different from standard BBBEE toolkits.

**Implementation:**

- Parse multiple sheets (Information Request, Finance, Ownership, Management, YES, Skills, Procurement, ESD, SED)
- Extract row-based data (employees, suppliers, contributions as arrays)
- Map to entity manifest format
- Handle the "rows 2+" pattern for lists

### 3.3 Build End-to-End Test Script

**File:** `scripts/test-e2e-scorecard.mjs`

Complete pipeline test:

1. Load Lake Trading entities from CSV
2. Build entity-to-cell mapping for RCOGP Generic template (Graph: 51320)
3. Apply entities to get cell overrides
4. Call `/api/templates/51320/evaluate` with overrides
5. Compare calculated scores against expected values from completed toolkit

**Expected Results:**

- Total Score: ~80 points (matching Lake Trading Level 4/5)
- Ownership: ~20-25 points
- Management: ~15-19 points
- Skills: ~20-25 points
- Procurement: ~20-25 points
- ESD/SED: Combined ~10-15 points

## Phase 4: Scorecard UI Integration

### 4.1 Create Dynamic Scorecard Component

**File:** `apps/web/Toolkit/src/components/scorecard/DynamicScorecard.tsx`

Replace the hardcoded Scorecard.tsx with a dynamic version.

**Implementation:**

- Fetch pillar structure from `/api/templates/{id}/structure`
- Render pillars dynamically based on template
- Fetch scores from `/api/templates/{id}/evaluate`
- Display sub-indicators from formula graph

### 4.2 Create Entity Coverage Validator

**File:** `apps/web/Toolkit/src/components/scorecard/EntityCoveragePanel.tsx`

Before calculation, show which entities are:

- Mapped (green)
- Missing (red) 
- Low confidence (yellow)

Uses `/api/entity-mappings/{sector}/{type}` endpoint.

### 4.3 Update Store for API Integration

**File:** `apps/web/Toolkit/src/lib/store.ts`

Add actions:

- `calculateFromTemplate(graphKey: string, entities: Record<string, any>)`
- `loadTemplateStructure(graphKey: string)`
- `validateEntityCoverage(sector: string, type: string, entities: any[])`

## Phase 5: Validation & Verification

### 5.1 Validate Against Lake Trading

**Method:** Run end-to-end test with Lake Trading data

**Success Criteria:**

- Entity coverage: >80% of required entities mapped
- Total score within 5 points of expected (~80)
- All 7 pillars show reasonable scores
- No formula evaluation errors

### 5.2 Test Info Request Sheet Upload

**Method:** Upload Info Request Sheet Template.xlsx through UI

**Success Criteria:**

- All sheets parsed correctly
- List data (employees, suppliers) extracted as arrays
- Entities mapped to cells
- Score calculated matches manual calculation

### 5.3 Test All 6 Sector Templates

**Method:** Run validation for each template

- RCOGP Generic (Graph: 51320)
- ICT Generic (Graph: 43376)
- ICT QSE (Graph: 58105)
- RCOGP QSE (Graph: 60980)
- FSC Generic (Graph: 64094)
- AGRI Generic (Graph: 23718)

## Critical Files to Modify

### Backend:

1. `apps/api/pipeline/formulaGraphBuilder.ts` - Add description field to SemanticTag
2. `apps/api/arango/entityCellMapping.ts` - Fix matching algorithm, add fuzzy matching
3. `apps/api/src/routes/hybridExtraction.ts` - Fix chunker method call
4. `apps/api/pipeline/parsers/infoRequestSheetParser.ts` - New parser for Info Request Sheet

### Frontend:

1. `apps/web/Toolkit/src/pages/Scorecard.tsx` - Make dynamic
2. `apps/web/Toolkit/src/lib/store.ts` - Add API integration actions
3. `apps/web/Toolkit/src/components/scorecard/DynamicScorecard.tsx` - New component

### Scripts:

1. `scripts/test-e2e-scorecard.mjs` - End-to-end validation
2. `scripts/load-test-entities.mjs` - Load Lake Trading CSV

## Testing Strategy

1. **Unit Tests:**
  - Fuzzy matching algorithm with various entity/cell combinations
  - Semantic tag generation for different cell types
  - Entity coverage validation logic
2. **Integration Tests:**
  - Load Lake Trading CSV → Extract entities → Map to cells → Calculate score
  - Info Request Sheet upload → Parse → Extract → Calculate
3. **Validation Tests:**
  - Compare calculated scores with manual Lake Trading scores
  - Test all 6 sector templates
  - Verify entity coverage thresholds

## Success Metrics

- Entity mapping coverage: >80%
- Score calculation accuracy: Within 5 points of expected
- End-to-end latency: <30 seconds
- API availability: All endpoints functional
- Formula evaluation: Zero errors on valid inputs

