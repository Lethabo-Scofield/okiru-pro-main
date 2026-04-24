# Phase 1: Master Entity Schema — Full Replacement

**Phase:** 1 of 5  
**Goal:** Replace the flat entityManifest with a hierarchical system. The hierarchy is the only system. No fallbacks, no legacy shapes.

---

## Design Principle

One entity type that serves ALL purposes: extraction, calculation, UI forms, evidence tracking, and graph storage. Not a "prompt helper" bolted onto a flat list.

---

## New Type System

### EntityField (replaces EntityRequirement)

The atomic unit of data in the system. Every field users enter or documents contain.

```typescript
export interface EntityField {
  // Identity
  id: string;                        // snake_case unique key: "black_ownership_percent"
  name: string;                      // Human label: "Black Ownership Percentage"
  pillarCode: string;                // "ownership", "managementControl", etc.
  criterionCodes: string[];          // Which scoreable lines this feeds: ["OWN-VR-BLACK", "OWN-EI-BLACK"]
  
  // Data shape
  fieldType: 'currency' | 'percentage' | 'count' | 'string' | 'date' | 'bee_level' | 'boolean';
  required: boolean;
  defaultValue?: string | number | boolean;
  
  // Validation
  validation: {
    min?: number;
    max?: number;
    enum?: string[];                 // Allowed values: ["African", "Coloured", "Indian", "White"]
    sumsWith?: string[];             // Other field IDs whose values should sum with this
  };
  
  // Extraction hints (for LLM + hybrid extraction pipeline)
  extraction: {
    definition: string;              // What this field means
    aliases: string[];               // Alternative labels to search for
    zones: string[];                 // Where in docs to find this
    positiveExamples: string[];
    negativeExamples: string[];
    mustHaveKeywords: string[];
    niceToHaveKeywords: string[];
    excludeKeywords: string[];
  };

  // Evidence (populated after extraction or manual input)
  evidence?: EvidenceRef;
  
  // UI hints
  ui?: {
    inputType: 'text' | 'number' | 'select' | 'date' | 'toggle' | 'percentage';
    placeholder?: string;
    helpText?: string;
    group?: string;                  // For grouping related fields in forms
  };
}
```

### CriterionEntity (scoreable line item)

```typescript
export interface CriterionEntity {
  code: string;                      // "OWN-VR-BLACK"
  name: string;                      // "Exercisable voting rights of black people"
  pillarCode: string;
  target: number | string;           // 0.25 or "25% + 1 vote"
  maxPoints: number;
  formulaId: string;                 // "proportional" | "bonus_flag" | "net_value" | "graduated"
  inputEntities: string[];           // EntityField IDs this criterion consumes
  bonusCondition?: string;
  minimumThreshold?: number;
  evidenceRequired: string[];
  sectorOverrides?: Record<string, { target?: number | string; maxPoints?: number }>;
}
```

### PillarPack (groups criteria + entities)

```typescript
export interface PillarPack {
  pillarCode: string;
  pillarName: string;
  maxPoints: number;
  hasSubMinimum: boolean;
  subMinimumThreshold: number;
  criteria: CriterionEntity[];
  entities: EntityField[];
}
```

### RootContext (determines rules)

```typescript
export interface RootContext {
  sector: string;
  sectorCodeVersion: string;
  scorecardType: 'Generic' | 'QSE' | 'EME';
  companySize: 'EME' | 'QSE' | 'Generic';
  financialYearEnd?: string;
  verificationDate?: string;
  applicableIndustryNorm?: string;
  province?: string;
  eapTargetSet?: string;
}
```

### EvidenceRef (source tracking)

```typescript
export interface EvidenceRef {
  documentType: 'toolkit_excel' | 'pdf_certificate' | 'manual_input' | 'info_request' | 'csv_import';
  documentName?: string;
  sheetName?: string;
  cellAddress?: string;
  pageNumber?: number;
  rowRange?: string;
  uploadedAt?: string;
  confidence?: number;
}
```

### EntityManifest (the top-level type)

```typescript
export interface EntityManifest {
  sectorCode: string;
  scorecardType: string;
  rootContext: RootContext;
  pillarPacks: PillarPack[];
  sheetHints: SheetHint[];
  createdAt?: string;
}
```

### Helpers

```typescript
// Get all entities flat (for extraction pipeline)
export function getAllEntities(manifest: EntityManifest): EntityField[] {
  return manifest.pillarPacks.flatMap(p => p.entities);
}

// Get entities for a specific pillar
export function getPillarEntities(manifest: EntityManifest, pillarCode: string): EntityField[] {
  return manifest.pillarPacks.find(p => p.pillarCode === pillarCode)?.entities ?? [];
}

// Get criteria for a specific pillar
export function getPillarCriteria(manifest: EntityManifest, pillarCode: string): CriterionEntity[] {
  return manifest.pillarPacks.find(p => p.pillarCode === pillarCode)?.criteria ?? [];
}

// Convert EntityField to LLM extraction request shape (adapter for llmExtractor.ts)
export function toExtractionRequest(field: EntityField, sourceText: string, pageId: string): LLMExtractionRequest {
  return {
    entityName: field.name,
    entityType: field.fieldType,
    definition: field.extraction.definition,
    aliases: field.extraction.aliases,
    positiveExamples: field.extraction.positiveExamples,
    negativeExamples: field.extraction.negativeExamples,
    zones: field.extraction.zones,
    sourceText,
    sourcePageId: pageId,
  };
}
```

---

## Consumer Updates (All 6 files)

### 1. `extraction/index.ts`

Old exports:
```typescript
export type { EntityManifest, EntityRequirement, SheetHint, RetrievalHints, ValidationRules } from './entityManifest.js';
```
New exports:
```typescript
export type { EntityManifest, EntityField, CriterionEntity, PillarPack, RootContext, EvidenceRef, SheetHint } from './entityManifest.js';
export { buildManifest, getAllEntities, getPillarEntities, getPillarCriteria, toExtractionRequest, getAllManifests } from './entityManifest.js';
```

### 2. `routes/entityMapping.ts`

```diff
- import { buildManifestForSector } from '../../pipeline/extraction/entityManifest.js';
+ import { buildManifest, getAllEntities } from '../../pipeline/extraction/entityManifest.js';

- const manifest = buildManifestForSector(sectorCode, scorecardType);
+ const manifest = buildManifest(sectorCode, scorecardType);

- manifest.requiredEntities
+ getAllEntities(manifest)
```

### 3. `routes/hybridExtraction.ts`

```diff
- import { buildManifestForSector, type EntityManifest, type EntityRequirement } from '...';
+ import { buildManifest, getAllEntities, toExtractionRequest, type EntityManifest, type EntityField } from '...';

- const manifest = buildManifestForSector(sectorCode.toUpperCase(), scorecardType);
+ const manifest = buildManifest(sectorCode.toUpperCase(), scorecardType);

// Where it iterates entities for extraction:
- manifest.requiredEntities.map(entity => ({ entityName: entity.name, ... }))
+ getAllEntities(manifest).map(field => toExtractionRequest(field, sourceText, pageId))
```

### 4. `routes/extractAndScore.ts`

```diff
- import { buildManifestForSector } from '...';
+ import { buildManifest, getAllEntities, toExtractionRequest } from '...';

- const manifest = buildManifestForSector(sectorCode.toUpperCase(), scorecardType);
+ const manifest = buildManifest(sectorCode.toUpperCase(), scorecardType);

- manifest.requiredEntities.map((entity) => ({
-   entityName: entity.name,
-   entityType: entity.fieldType,
-   definition: entity.definition,
-   aliases: entity.aliases,
-   positiveExamples: entity.positiveExamples,
-   negativeExamples: entity.negativeExamples,
-   zones: entity.zones,
-   sourceText: combinedText,
-   sourcePageId: 'combined',
- }))
+ getAllEntities(manifest).map(f => toExtractionRequest(f, combinedText, 'combined'))
```

### 5. `routes/scorecard.ts`

```diff
- import { buildManifestForSector } from '...';
+ import { buildManifest, getAllEntities } from '...';
```
Same pattern for any `manifest.requiredEntities` usage.

### 6. `arango/entityCellMapping.ts`

```diff
- import type { EntityRequirement } from '../pipeline/extraction/entityManifest.js';
+ import type { EntityField } from '../pipeline/extraction/entityManifest.js';
```

This file uses:
- `entity.name` → stays as `field.name`
- `entity.pillarCode` → stays as `field.pillarCode`
- `entity.fieldType` → stays as `field.fieldType`
- `entity.aliases` → becomes `field.extraction.aliases`
- `entity.zones` → becomes `field.extraction.zones`
- `entity.retrievalHints.mustHave` → becomes `field.extraction.mustHaveKeywords`
- `entity.validationRules` → becomes `field.validation`

These are straightforward renames in the fuzzy matching logic.

---

## Execution Order

| # | What | Files | Est. Lines Changed |
|---|------|-------|--------------------|
| 1 | Define new interfaces in entityManifest.ts (EntityField, CriterionEntity, PillarPack, RootContext, EvidenceRef, EntityManifest) | entityManifest.ts | ~120 new |
| 2 | Define criteria data for all 8 pillars (34 criteria total) | entityManifest.ts | ~200 new |
| 3 | Rewrite entity definitions using EntityField shape (financial, ownership, MC, skills, procurement, ESD, SED + sector-specific) | entityManifest.ts | ~600 rewrite |
| 4 | Write pillar pack builders (8 functions) | entityManifest.ts | ~150 new |
| 5 | Write `buildManifest()`, `getAllEntities()`, `toExtractionRequest()` helpers | entityManifest.ts | ~60 new |
| 6 | Update extraction/index.ts exports | index.ts | ~10 |
| 7 | Update routes/entityMapping.ts | entityMapping.ts | ~8 |
| 8 | Update routes/hybridExtraction.ts | hybridExtraction.ts | ~15 |
| 9 | Update routes/extractAndScore.ts | extractAndScore.ts | ~15 |
| 10 | Update routes/scorecard.ts | scorecard.ts | ~5 |
| 11 | Update arango/entityCellMapping.ts | entityCellMapping.ts | ~30 |
| 12 | Type-check: `tsc --noEmit` | — | 0 |
| 13 | Verify: all 6 sector variants produce correct manifests | — | 0 |

---

## Verification Checklist

- [ ] `buildManifest('RCOGP', 'Generic')` → 8 pillar packs (Ownership, MC, EE, Skills, Procurement, ESD, SED, YES)
- [ ] `buildManifest('RCOGP', 'QSE')` → 7 pillar packs (no separate EE)
- [ ] `buildManifest('ICT', 'Generic')` → 8 pillar packs with ICT-specific entities added
- [ ] `buildManifest('FSC', 'Generic')` → 8 pillar packs with FSC-specific entities added
- [ ] Each pillar pack's `criteria[].maxPoints` sums to `pillarPack.maxPoints`
- [ ] `getAllEntities(manifest)` count matches what the old system produced (~35 for RCOGP Generic)
- [ ] `toExtractionRequest()` produces valid `LLMExtractionRequest` objects
- [ ] `tsc --noEmit` passes
- [ ] API smoke test: POST /api/extract-and-score still works
- [ ] API smoke test: POST /api/entity-mappings/build/RCOGP/Generic still works
