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

  // Decided 11 Oct 2026: the supplier sum by default; the stated figure is
  // reported beside it and used only on the client's explicit choice.
  it('scores the supplier sum by default and reports the TMPS the financials table states', async () => {
    const p = await payloadFor({ tables: { suppliers, financials: [{ tmps: 750_000 }] } });
    expect(p.financials.tmps).toBe(500_000);
    expect(p.tmpsSource).toBe('supplier_spend_sum');
    expect(p.tmpsStated).toBe(750_000);
    expect(p.dataQuality.warnings.join(' ')).toMatch(/state 750000; the supplier schedule sums to 500000/);
  });

  it('uses the stated TMPS only when the client explicitly chose it', async () => {
    const p = await mapToUCSPayload({ entities: [], tables: { suppliers, financials: [{ tmps: 750_000 }] } } as ExtractionOutput, { tmpsChoice: 'stated' });
    expect(p.financials.tmps).toBe(750_000);
    expect(p.tmpsSource).toBe('stated');
    // Any other value is no choice.
    const label = await mapToUCSPayload({ entities: [], tables: { suppliers, financials: [{ tmps: 750_000 }] } } as ExtractionOutput, { tmpsChoice: 'Stated' });
    expect(label.financials.tmps).toBe(500_000);
  });

  it('never scores a chosen stated TMPS below the suppliers listed', async () => {
    const p = await mapToUCSPayload({ entities: [], tables: { suppliers, financials: [{ tmps: 30_000 }] } } as ExtractionOutput, { tmpsChoice: 'stated' });
    expect(p.financials.tmps).toBe(500_000);
    expect(p.tmpsSource).toBe('supplier_spend_sum');
    expect(p.tmpsStated).toBe(30_000);
  });

  it('a stated TMPS that held #REF! is reported; the score stays on the supplier sum', async () => {
    const p = await payloadFor({
      entities: [entity('Total Measured Procurement Spend', '#REF!')],
      tables: { suppliers },
    });
    expect(p.financials.tmps).toBe(500_000);
    expect(p.tmpsSource).toBe('supplier_spend_sum');
    expect(p.tmpsHeld).toBe('withdrawn');
    expect(p.tmpsStated).toBeNull();
    expect(p.dataQuality.warnings.join(' ')).toMatch(/spreadsheet error/);
  });

  it('a #REF! TMPS with no supplier listed stays blank, not computed', async () => {
    const p = await payloadFor({ entities: [entity('Total Measured Procurement Spend', '#REF!')] });
    expect(p.financials.tmps).toBe(0);
    expect(p.tmpsHeld).toBe('withdrawn');
    expect(p.dataQuality.missingCritical.join(' ')).toMatch(/spreadsheet error/);
  });

  it('sums the suppliers when no TMPS was stated, and says so', async () => {
    const p = await payloadFor({ tables: { suppliers } });
    expect(p.financials.tmps).toBe(500_000);
    expect(p.tmpsSource).toBe('supplier_spend_sum');
    expect(p.tmpsStated).toBeNull();
    expect(p.dataQuality.derivedValues).toContain('TMPS (derived from total supplier spend)');
  });

  it('an entity-stated TMPS is reported beside the supplier sum', async () => {
    const p = await payloadFor({ entities: [entity('TMPS', 'R 1 234 567.89')], tables: { suppliers } });
    expect(p.financials.tmps).toBe(500_000);
    expect(p.tmpsStated).toBeCloseTo(1_234_567.89, 2);
  });

  it('with no supplier listed, a stated TMPS stands (there is no sum)', async () => {
    const p = await payloadFor({ entities: [entity('TMPS', 'R 1 234 567.89')] });
    expect(p.financials.tmps).toBeCloseTo(1_234_567.89, 2);
    expect(p.tmpsSource).toBe('stated');
  });
});
