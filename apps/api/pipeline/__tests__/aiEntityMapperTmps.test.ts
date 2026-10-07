/**
 * TMPS in the extraction → UCS bridge: a computed figure is never presented
 * as a stated one, and a pre-exclusions total is never TMPS.
 *
 *   - `tmps_inclusions` (the total BEFORE exclusions) used to map straight to
 *     tmps, overstating the denominator by every excluded rand.
 *   - The supplier-spend fallback ran BEFORE the structured financials table
 *     was read, so a TMPS the table stated lost to the computed sum.
 *   - A stated TMPS cell holding #REF! read as 0, and the fallback filled it
 *     with the supplier sum: the broken figure became a computed one silently.
 *   - The "derived from total supplier spend" note was dead code: it checked
 *     for a missing TMPS after the fallback had already filled it.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../extraction/azureOpenAIClient.js', () => ({
  chatCompletion: vi.fn(),
  fastChatCompletion: vi.fn(),
  isAzureOpenAIConfigured: () => false,
}));

import { mapToUCSPayload, type ExtractionOutput } from '../extraction/aiEntityMapper';

const suppliers = [
  { name: 'Acme Trading', spend: 300_000, bbbeeLevel: 1 },
  { name: 'Beta Logistics', spend: 200_000, bbbeeLevel: 2 },
];

const entity = (name: string, value: unknown, status = 'approved') =>
  ({ name, value, pillar: 'financials', fieldType: 'currency', confidence: 0.9, status });

async function payloadFor(extraction: Partial<ExtractionOutput>) {
  return mapToUCSPayload({ entities: [], tables: {}, ...extraction } as ExtractionOutput);
}

describe('aiEntityMapper — TMPS provenance', () => {
  it('never takes the pre-exclusions (inclusions) total as TMPS', async () => {
    const p = await payloadFor({
      entities: [entity('tmps_inclusions', 1_234_567.89), entity('TMPS Inclusions', 1_234_567.89)],
      tables: { suppliers },
    });
    expect(p.financials.tmps).not.toBeCloseTo(1_234_567.89, 2);
  });

  it('a TMPS the structured financials table states beats the supplier sum', async () => {
    const p = await payloadFor({ tables: { suppliers, financials: [{ tmps: 750_000 }] } });
    expect(p.financials.tmps).toBe(750_000);
    expect(p.tmpsSource).toBe('stated');
  });

  it('leaves a stated TMPS that held #REF! blank instead of summing the suppliers', async () => {
    const p = await payloadFor({
      entities: [entity('Total Measured Procurement Spend', '#REF!')],
      tables: { suppliers },
    });
    expect(p.financials.tmps).toBe(0);
    expect(p.tmpsSource).toBeNull();
    expect(p.tmpsHeld).toBe('withdrawn');
    expect(p.dataQuality.missingCritical.join(' ')).toMatch(/TMPS/);
    expect(p.dataQuality.derivedValues.join(' ')).not.toMatch(/TMPS/);
  });

  it('sums the suppliers only when no TMPS was stated, and says so', async () => {
    const p = await payloadFor({ tables: { suppliers } });
    expect(p.financials.tmps).toBe(500_000);
    expect(p.tmpsSource).toBe('supplier_spend_sum');
    expect(p.dataQuality.derivedValues).toContain('TMPS (derived from total supplier spend)');
  });

  it('marks an entity-stated TMPS as stated', async () => {
    const p = await payloadFor({ entities: [entity('TMPS', 'R 1 234 567.89')], tables: { suppliers } });
    expect(p.financials.tmps).toBeCloseTo(1_234_567.89, 2);
    expect(p.tmpsSource).toBe('stated');
    expect(p.dataQuality.derivedValues.join(' ')).not.toMatch(/TMPS/);
  });
});
