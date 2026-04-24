# B-BBEE Scoring Engine — Integration Plan (Option A2 + P2)

**Status:** Ready for Implementation  
**Decisions:** Option A2 (Keep both flows), Option P2 (Sidebar navigation), Repurpose review step  
**Target:** Integrate Build flow into DocumentProcessor, remove standalone ScorecardBuilder

---

## Overview

Transform DocumentProcessor from a file-upload-centric workflow into a **dual-path system**:
1. **Upload Flow** (legacy): Upload → Classify → Extract → Review → Scorecard
2. **Build Flow** (new): Foundation → Pillars (sidebar nav) → Review → Scorecard

Both flows share the Review and Scorecard steps. The Build flow uses the hierarchical entity manifest and new calculation API.

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Entry Mode** | A2 — Keep both flows | Users can upload existing toolkits OR build manually from scratch |
| **Pillar Navigation** | P2 — Sidebar with free nav | Users can jump between pillars; not forced sequential |
| **Review Step** | Repurpose for both | Unified review UI shows either extracted entities (upload) or entered values (build) |
| **Scorecard Step** | Unified | Both flows use same scorecard display; Build uses API calculation |

---

## New Step Structure

### Upload Flow (Legacy)
```
company-info → choose-mode → upload → classify → extract → review → scorecard
                      ↓
                 (select "Upload Documents")
```

### Build Flow (New)
```
company-info → choose-mode → build-foundation → build-pillars (sidebar) → review → scorecard
                      ↓                                            ↓
                 (select "Build Manually")              (free nav: ownership, skills, etc.)
```

### Step Definitions

| Step | Key | Purpose | Flows |
|------|-----|---------|-------|
| `company-info` | 1 | Client name, sector, FYE | Both |
| `choose-mode` | 2 | Select Upload or Build | Both (new) |
| `upload` | 3 | File upload zone | Upload only |
| `classify` | 4 | Assign templates to files | Upload only |
| `extract` | 5 | AI extraction processing | Upload only |
| `build-foundation` | 6 | Sector, turnover, size, dates | Build only |
| `build-pillars` | 7 | Pillar sidebar with forms | Build only |
| `review` | 8 | Validate before calculation | Both |
| `scorecard` | 9 | Final results | Both |

---

## Component Mapping

### Reuse from ScorecardBuilder

| Component | Current Location | New Location | Changes |
|-----------|-----------------|--------------|---------|
| `PillarForm` | `Toolkit/src/components/scorecard-builder/` | `web/src/components/builder/PillarForm.tsx` | Update imports, add flow prop |
| `EntityFieldInputs` | `Toolkit/src/components/scorecard-builder/` | `web/src/components/builder/EntityFieldInputs.tsx` | Update imports |
| `formatters` | `Toolkit/src/components/scorecard-builder/` | `web/src/components/builder/formatters.ts` | Move as-is |
| Pillar icons/constants | In `ScorecardBuilder.tsx` | `web/src/components/builder/constants.ts` | Extract |

### New Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `ModeChooser` | `web/src/components/processor/ModeChooser.tsx` | Upload vs Build selection UI |
| `BuildFoundation` | `web/src/components/builder/BuildFoundation.tsx` | Root context form (sector, turnover, etc.) |
| `PillarSidebar` | `web/src/components/builder/PillarSidebar.tsx` | Navigation between pillars |
| `BuildReview` | `web/src/components/builder/BuildReview.tsx` | Review entered pillar data |

---

## State Management Updates

### ProcessorSession Interface (Extended)

```typescript
interface ProcessorSession {
  id: string;
  companyInfo: CompanyInfo;
  createdAt: string;
  updatedAt: string;
  
  // NEW: Flow selection
  flowMode: 'upload' | 'build' | null;
  
  // NEW: Build flow data
  rootContext?: RootContext;           // Sector, turnover, FYE, etc.
  buildValues?: Record<string, unknown>; // Pillar form values
  manifest?: EntityManifest;           // Loaded from /api/manifest
  activePillar?: string;               // Currently selected pillar
  
  // Upload flow data (existing)
  currentStep: string;
  filesData: FileData[];
  fileClassifications: Record<string, number>;
  extractionResults: ExtractionResult[];
  docStatuses: Record<number, string>;
  
  // Shared
  isComplete: boolean;
  scorecardResult?: ScorecardResult;
}
```

### URL Query Parameters

| Param | Value | Effect |
|-------|-------|--------|
| `?mode=upload` | Forces upload flow | Skip chooser, go to upload step |
| `?mode=build` | Forces build flow | Skip chooser, go to foundation step |
| `?pillar=skills` | Pre-select pillar | Build flow only, open specific pillar |
| `?session=xxx` | Resume session | Load saved session state |

---

## API Integration

### Endpoints Used

| Endpoint | Method | Used In | Purpose |
|----------|--------|---------|---------|
| `/api/manifest` | GET | Build flow | Load entity manifest for sector/type |
| `/api/calculate` | POST | Build flow | Calculate score from entered values |
| `/api/assessments` | POST | Build flow | Save completed assessment |
| `/api/processor-sessions` | POST/GET | Both | Persist/resume session |
| `/api/templates` | GET | Upload flow | List extraction templates |
| `/api/hybrid-extract` | POST | Upload flow | Extract entities from files |

### Build Flow API Sequence

1. **On foundation complete:**
   ```
   GET /api/manifest?sector=RCOGP&type=Generic
   → Returns EntityManifest with all pillars/entities
   ```

2. **On calculate click:**
   ```
   POST /api/calculate
   {
     assessmentId: string,
     sectorCode: string,
     scorecardType: string,
     entityValues: Record<string, EntityValue>
   }
   → Returns ScorecardResult
   ```

3. **On save:**
   ```
   POST /api/assessments
   {
     assessmentId: string,
     clientId: string,
     financialYear: string,
     sectorCode: string,
     scorecardType: string,
     values: Record<string, unknown>,
     result: ScorecardResult
   }
   ```

---

## UI Specifications

### 1. Mode Chooser Step

**Layout:** Centered card with two large options

```
┌─────────────────────────────────────────────────────┐
│         How would you like to proceed?              │
├─────────────────────┬───────────────────────────────┤
│   [Upload Icon]     │     [Build Icon]              │
│                     │                               │
│   Upload Documents  │     Build Manually            │
│                     │                               │
│   Import existing   │     Enter data pillar         │
│   B-BBEE toolkit    │     by pillar                 │
│                     │                               │
│   [Select]          │     [Select]                  │
└─────────────────────┴───────────────────────────────┘
```

**Behavior:**
- Clicking Upload → Sets `flowMode='upload'` → Navigates to `upload` step
- Clicking Build → Sets `flowMode='build'` → Navigates to `build-foundation` step
- Choice persisted to session

### 2. Build Foundation Step

**Form Fields:**
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Sector | Select | Yes | RCOGP, ICT, FSC, AGRI |
| Scorecard Type | Select | Yes | Generic, QSE (if applicable) |
| Annual Turnover | Currency | Yes | Determines QSE vs Generic |
| Financial Year End | Date | Yes | |
| Verification Date | Date | No | |
| Province | Select | Yes | For EAP targets |
| Industry Norm | Select | Yes | |

**Auto-calculation:**
- If turnover ≤ R50M and sector has QSE → Suggest QSE type
- Load manifest after sector/type selected

### 3. Build Pillars Step (P2 Sidebar)

**Layout:**
```
┌─────────────────────────────────────────────────────────────┐
│ Header: Progress 45%                                 [Calc] │
├──────────────┬──────────────────────────────────────────────┤
│              │                                              │
│  Financials  │    Ownership Pillar                         │
│  ─────────── │    ┌─────────────────────────────────────┐  │
│  Ownership ● │    │ Black Voting Rights          [__%]  │  │
│  Management  │    │ Black Women Voting           [__%]  │  │
│  Skills      │    │ ...                                 │  │
│  Procurement │    └─────────────────────────────────────┘  │
│  ESD         │                                              │
│  SED         │    [Previous]              [Next/Save]      │
│  YES         │                                              │
│              │                                              │
└──────────────┴──────────────────────────────────────────────┘
```

**Sidebar Items:**
| Pillar | Icon | Completion Indicator |
|--------|------|---------------------|
| Financials | TrendingUp | % complete + check when valid |
| Ownership | Building2 | % complete + check when valid |
| Management Control | Shield | % complete + check when valid |
| Skills Development | BookOpen | % complete + check when valid |
| Procurement | ShoppingCart | % complete + check when valid |
| ESD | Handshake | % complete + check when valid |
| SED | HeartHandshake | % complete + check when valid |
| YES | Trophy | % complete + check when valid |

**Navigation:**
- Free click between pillars (no forced sequence)
- Next/Previous buttons cycle through pillar order
- Calculate button enabled when all required fields complete

### 4. Review Step (Repurposed)

**Upload Flow Review:**
- Shows extracted entities per document
- Confidence scores
- Edit capability
- Same as current

**Build Flow Review:**
- Shows entered values grouped by pillar
- Validation status per pillar
- "Go back to {pillar}" links
- Calculate button

```
Review Your Entries

Ownership                    [Edit] →
├── Black Voting Rights: 51%
├── Black Women Voting: 25%
└── Status: ✓ Complete

Skills Development           [Edit] →
├── Training Spend: R 500,000
├── Learnerships: 5
└── Status: ⚠ Missing required fields

[Calculate Scorecard]
```

### 5. Scorecard Step (Unified)

Same display for both flows:
- Total score and level
- Pillar breakdown
- Recognition %
- Sub-minimum indicators
- Save/Export actions

---

## Dashboard Updates

### Current State
```typescript
// Dashboard.tsx line 155
<Button onClick={() => navigate("/import")}>
  <FileSpreadsheet /> Upload Excel
</Button>
```

### New State
```typescript
<Button onClick={() => navigate("/processor")}>
  <Building2 /> Build Scorecard
</Button>
```

**Changes:**
- Label: "Upload Excel" → "Build Scorecard"
- Icon: `FileSpreadsheet` → `Building2`
- Route: `/import` → `/processor` (no query param = show chooser)

---

## File Modification Checklist

### 1. Routes & Entry Points
- [ ] `apps/web/src/App.tsx` — Remove ScorecardBuilder route
- [ ] `apps/web/Toolkit/src/pages/Dashboard.tsx` — Update button label/icon/route

### 2. DocumentProcessor Core
- [ ] `apps/web/src/pages/DocumentProcessor.tsx`
  - [ ] Add `flowMode` to state
  - [ ] Add `choose-mode` step
  - [ ] Add `build-foundation` step
  - [ ] Add `build-pillars` step with sidebar
  - [ ] Update step navigation logic
  - [ ] Integrate `/api/manifest` loading
  - [ ] Integrate `/api/calculate` call
  - [ ] Update `ProcessorSession` interface
  - [ ] Update persistSession for new fields

### 3. New Components (Create)
- [ ] `apps/web/src/components/processor/ModeChooser.tsx`
- [ ] `apps/web/src/components/builder/BuildFoundation.tsx`
- [ ] `apps/web/src/components/builder/PillarSidebar.tsx`
- [ ] `apps/web/src/components/builder/BuildReview.tsx`
- [ ] `apps/web/src/components/builder/constants.ts`

### 4. Component Migration (Move from Toolkit)
- [ ] `apps/web/src/components/builder/PillarForm.tsx` (from Toolkit)
- [ ] `apps/web/src/components/builder/EntityFieldInputs.tsx` (from Toolkit)
- [ ] `apps/web/src/components/builder/formatters.ts` (from Toolkit)

### 5. API Routes (Verify/Update)
- [ ] `apps/api/src/routes/scorecardBuilder.ts` — Ensure endpoints working
- [ ] `apps/api/src/routes/index.ts` — Verify router mounting
- [ ] `apps/api/index.ts` — Verify seeding on startup

### 6. Cleanup (After Migration)
- [ ] `apps/web/Toolkit/src/pages/ScorecardBuilder.tsx` — Delete
- [ ] `apps/web/Toolkit/src/components/scorecard-builder/` — Delete directory

---

## Validation Strategy (Lake Trading)

### Test Cases

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | Full Build Flow | Complete all pillars with Lake data | Match known scorecard |
| 2 | Partial Save | Fill 2 pillars, refresh, resume | Data restored |
| 3 | Pillar Navigation | Jump from Ownership to Skills | No data loss |
| 4 | Upload Still Works | Use legacy upload flow | Extraction works |
| 5 | Calculation API | Trigger calculate | Returns valid ScorecardResult |
| 6 | Save Assessment | Complete and save | Persisted to ArangoDB |

### Lake Trading Expected Values

| Pillar | Expected Score | Key Inputs |
|--------|---------------|------------|
| Ownership | 25.0 | 100% black owned |
| Management | ~15-19 | Board/exec black % |
| Skills | Varies | 6% of payroll spend |
| Procurement | Varies | BEE supplier spend |
| ESD | Varies | 2% NPAT |
| SED | Varies | 1% NPAT |
| **Total** | **Level 1-2** | **~100+ points** |

---

## Implementation Order

1. **Phase 1: Cleanup & Setup**
   - Remove ScorecardBuilder route
   - Move components from Toolkit to web
   - Verify API endpoints responding

2. **Phase 2: Core Integration**
   - Add ModeChooser to DocumentProcessor
   - Add BuildFoundation step
   - Add build-pillars step with sidebar
   - Wire /api/manifest loading

3. **Phase 3: Calculation & Save**
   - Replace client-side calc with /api/calculate
   - Wire /api/assessments save
   - Update Review step for build flow

4. **Phase 4: Polish & Validation**
   - Dashboard button update
   - Lake Trading validation
   - Bug fixes

5. **Phase 5: Cleanup**
   - Delete standalone ScorecardBuilder
   - Delete Toolkit components
   - Final testing

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking upload flow | Keep upload path unchanged; chooser defaults to it |
| API not ready | Add fallback to client-side calc temporarily |
| Performance with many fields | Virtualize form fields; lazy load pillars |
| User confusion | Add tooltips; highlight active flow |

---

## Success Criteria

- [ ] User can complete Build flow end-to-end
- [ ] Lake Trading data produces expected scorecard
- [ ] Upload flow still works as before
- [ ] Both flows share Review and Scorecard steps
- [ ] Session persistence works for both flows
- [ ] Standalone ScorecardBuilder removed
- [ ] All TypeScript types valid
- [ ] No console errors

---

**Plan Ready:** Awaiting implementation signal
