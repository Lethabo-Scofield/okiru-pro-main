/**
 * ESG placement parity — "as good as B-BBEE" is the bar, and this pins it.
 *
 * The ESG mapper had the declared table only: any field the table did not
 * anticipate was reported `no_mapping` and went nowhere, while the B-BBEE path
 * had grown a semantic second pass. Same split of labour now on both: the
 * model proposes a key for the orphans, and every proposal must survive the
 * same coercion and the same allowlist as a declared mapping.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { mapEsgEntitiesToCalculatorWithSemantics } from '../../src/services/esgEntityCalculatorMapping.js';
import { resetDecisionCacheForTest } from '../../src/services/semanticDecisionCache.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';
import type { CaseEntities } from '../../src/services/entityResolution.js';

function entities(fields: Record<string, unknown>): CaseEntities {
  const out: CaseEntities['fields'] = {};
  for (const [field, value] of Object.entries(fields)) {
    out[field] = {
      field,
      value,
      sources: ['Pack.xlsx › E_Data'],
      agreementCount: 1,
      conflicted: false,
      alternatives: [],
    };
  }
  return { fields: out } as CaseEntities;
}

function modelProposing(map: Record<string, string>): ExtractionModel {
  return {
    name: 'test',
    async complete() { return JSON.stringify(map); },
    async completeHard() { return JSON.stringify(map); },
  };
}

beforeEach(() => resetDecisionCacheForTest());

describe('mapEsgEntitiesToCalculatorWithSemantics', () => {
  it('places an orphan field onto an allowlisted ESG key via the model', async () => {
    const result = await mapEsgEntitiesToCalculatorWithSemantics(
      entities({ site_solar_export_reading: '12450' }),
      new Map(),
      modelProposing({ site_solar_export_reading: 'energy.solar_kwh_exported' }),
    );
    expect(result.payload['energy.solar_kwh_exported']).toBe(12450);
    const entry = result.entries.find((e) => e.key === 'energy.solar_kwh_exported');
    expect(entry?.sourceField).toBe('site_solar_export_reading');
  });

  it('rejects a proposed key that is not on the ESG allowlist', async () => {
    const result = await mapEsgEntitiesToCalculatorWithSemantics(
      entities({ mystery_reading: '99' }),
      new Map(),
      modelProposing({ mystery_reading: 'energy.made_up_key' }),
    );
    expect(result.payload['energy.made_up_key']).toBeUndefined();
    // Stays reported, never silently dropped.
    expect(result.unmapped.some((u) => u.field === 'mystery_reading')).toBe(true);
  });

  it('is exactly the declared mapping when no model is available', async () => {
    const result = await mapEsgEntitiesToCalculatorWithSemantics(
      entities({ unheard_of_field: '5' }),
      new Map(),
      null,
    );
    expect(result.unmapped.some((u) => u.field === 'unheard_of_field' && u.reason === 'no_mapping')).toBe(true);
  });

  it('leaves an uncoercible proposal as uncoercible rather than forcing it', async () => {
    const result = await mapEsgEntitiesToCalculatorWithSemantics(
      entities({ site_solar_export_reading: 'not a number at all' }),
      new Map(),
      modelProposing({ site_solar_export_reading: 'energy.solar_kwh_exported' }),
    );
    expect(result.payload['energy.solar_kwh_exported']).toBeUndefined();
    expect(result.unmapped.some((u) => u.field === 'site_solar_export_reading' && u.reason === 'uncoercible')).toBe(true);
  });
});
