/**
 * The semantic pass exists to rescue fields the declared table never named —
 * without ever letting a model invent a destination, a value, or a key.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';
import { proposeFieldMappings } from '../../src/services/semanticFieldMapping.js';
import {
  mapEntitiesToCalculatorWithSemantics,
} from '../../src/services/entityCalculatorMapping.js';
import type { CaseEntities } from '../../src/services/entityResolution.js';

// The decision cache would otherwise replay one test's answer into another.
process.env.PARSER_DECISION_CACHE = 'false';

function modelReturning(reply: string): ExtractionModel {
  return { name: 'test-model', complete: vi.fn().mockResolvedValue(reply) };
}

const KEYS = [
  { key: 'ownership.black_ownership', description: 'Black ownership percentage (0-100)' },
  { key: 'skills.total_spend', description: 'Total skills development spend' },
];

function entities(fields: Record<string, unknown>): CaseEntities {
  return {
    fields: Object.fromEntries(
      Object.entries(fields).map(([field, value]) => [
        field,
        { field, value, sources: ['file.pdf'], agreementCount: 1, conflicted: false, alternatives: [] },
      ]),
    ),
  } as unknown as CaseEntities;
}

describe('proposeFieldMappings', () => {
  beforeEach(() => vi.clearAllMocks());

  it('places a field whose name the declared table never anticipated', async () => {
    const model = modelReturning('{"bbbee_ownership_black_pct":"ownership.black_ownership"}');
    await expect(proposeFieldMappings(model, ['bbbee_ownership_black_pct'], KEYS))
      .resolves.toEqual({ bbbee_ownership_black_pct: 'ownership.black_ownership' });
  });

  it('refuses a key that is not on the allowlist', async () => {
    const model = modelReturning('{"mystery_field":"ownership.secret_backdoor"}');
    await expect(proposeFieldMappings(model, ['mystery_field'], KEYS)).resolves.toEqual({});
  });

  it('ignores an answer about a field it was never asked about', async () => {
    const model = modelReturning('{"some_other_field":"skills.total_spend"}');
    await expect(proposeFieldMappings(model, ['mystery_field'], KEYS)).resolves.toEqual({});
  });

  it('returns nothing when no model is configured', async () => {
    await expect(proposeFieldMappings(null, ['mystery_field'], KEYS)).resolves.toEqual({});
  });

  it('never fails the case when the model call throws', async () => {
    const model: ExtractionModel = {
      name: 'boom',
      complete: vi.fn().mockRejectedValue(new Error('429 rate limited')),
    };
    await expect(proposeFieldMappings(model, ['mystery_field'], KEYS)).resolves.toEqual({});
  });

  it('is disabled by PARSER_SEMANTIC_MAPPING=false', async () => {
    process.env.PARSER_SEMANTIC_MAPPING = 'false';
    const model = modelReturning('{"mystery_field":"skills.total_spend"}');
    await expect(proposeFieldMappings(model, ['mystery_field'], KEYS)).resolves.toEqual({});
    delete process.env.PARSER_SEMANTIC_MAPPING;
  });
});

describe('mapEntitiesToCalculatorWithSemantics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rescues an orphan field and flags it for review', async () => {
    const model = modelReturning('{"bbbee_ownership_black_pct":"ownership.black_ownership"}');
    const result = await mapEntitiesToCalculatorWithSemantics(
      entities({ bbbee_ownership_black_pct: '32%' }),
      new Map(),
      model,
    );

    expect(result.payload['ownership.black_ownership']).toBe(32);
    const entry = result.entries.find((e) => e.key === 'ownership.black_ownership');
    expect(entry?.viaSemanticMapping).toBe(true);
    expect(entry?.sourceField).toBe('bbbee_ownership_black_pct');
    // It is no longer reported as something we read and did not use.
    expect(result.unmapped.map((u) => u.field)).not.toContain('bbbee_ownership_black_pct');
  });

  it('leaves behaviour identical when there is no model', async () => {
    const result = await mapEntitiesToCalculatorWithSemantics(
      entities({ bbbee_ownership_black_pct: '32%' }),
      new Map(),
      null,
    );
    expect(result.payload).toEqual({});
    expect(result.unmapped.map((u) => u.reason)).toContain('no_mapping');
  });

  it('drops a proposal whose value cannot be coerced to the key type', async () => {
    const model = modelReturning('{"weird_field":"ownership.black_ownership"}');
    const result = await mapEntitiesToCalculatorWithSemantics(
      entities({ weird_field: 'not a number at all' }),
      new Map(),
      model,
    );
    expect(result.payload['ownership.black_ownership']).toBeUndefined();
    expect(result.unmapped.find((u) => u.field === 'weird_field')?.reason).toBe('uncoercible');
  });

  it('never asks about fields a declared mapping already placed', async () => {
    const complete = vi.fn().mockResolvedValue('{}');
    const model: ExtractionModel = { name: 'test', complete };
    await mapEntitiesToCalculatorWithSemantics(
      entities({ measured_entity_name: 'Lake Trading' }),
      new Map(),
      model,
    );
    // measured_entity_name is declared, so there were no orphans to ask about.
    expect(complete).not.toHaveBeenCalled();
  });
});
