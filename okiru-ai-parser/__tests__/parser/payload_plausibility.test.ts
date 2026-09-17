/**
 * The payload has to make sense as a SET, not just field by field.
 *
 * Thandanani's live case: `procurement.tmps` extracted as 23 — the supplier
 * schedule's ROW COUNT — beside supplier rows summing to R3.17m. Grounding
 * passed (the document really says 23); every ratio downstream divided by 23
 * and clamped to full marks. The invariant that catches it is arithmetic — a
 * total can never be smaller than one of its own parts — and the model's only
 * job is the analyst's next sentence: what the figure probably IS, quoted from
 * the source. The suggestion is prose for a human; the payload is never edited.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  excerptAround,
  explainImplausibleFigure,
  payloadInvariantFindings,
} from '../../src/services/payloadPlausibility.js';
import { resetDecisionCacheForTest } from '../../src/services/semanticDecisionCache.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';

const SUPPLIERS = {
  sourceFile: 'Pack.xlsx › Procurement',
  values: [{
    field: 'supplier_rows',
    value: [
      { supplier_name: 'BP Edenvale', claimed_spend_ex_vat: 412797.4 },
      { supplier_name: 'Engen', claimed_spend_ex_vat: 250000 },
    ],
  }],
};

function tmpsEntry(value: number) {
  return { key: 'procurement.tmps', value, sourceFiles: ['Pack.xlsx › Finance'] };
}

describe('payloadInvariantFindings', () => {
  it('flags a TMPS smaller than a single supplier inside it', () => {
    const findings = payloadInvariantFindings([tmpsEntry(23)], [SUPPLIERS]);
    expect(findings).toHaveLength(1);
    expect(findings[0].key).toBe('procurement.tmps');
    expect(findings[0].sourceFile).toBe('Pack.xlsx › Finance');
    expect(findings[0].message).toContain('R23');
    expect(findings[0].message).toContain('score 0');
  });

  it('names the row-count coincidence when the figure equals it', () => {
    const rows = Array.from({ length: 23 }, (_, i) => ({ supplier_name: `S${i}`, claimed_spend_ex_vat: 1000 }));
    const findings = payloadInvariantFindings(
      [tmpsEntry(23)],
      [{ sourceFile: 'x', values: [{ field: 'supplier_rows', value: rows }] }],
    );
    expect(findings[0].message).toContain('ROW COUNT');
  });

  it('accepts a TMPS that can contain its schedule', () => {
    expect(payloadInvariantFindings([tmpsEntry(5_000_000)], [SUPPLIERS])).toEqual([]);
  });

  it('says nothing when there is no schedule to compare against', () => {
    expect(payloadInvariantFindings([tmpsEntry(23)], [])).toEqual([]);
  });

  it('says nothing when TMPS itself is absent', () => {
    expect(payloadInvariantFindings([], [SUPPLIERS])).toEqual([]);
  });
});

describe('explainImplausibleFigure', () => {
  beforeEach(() => resetDecisionCacheForTest());

  const modelSaying = (reply: string, spy?: { calls: number }): ExtractionModel => ({
    name: 'test',
    async complete() { if (spy) spy.calls += 1; return reply; },
  });

  it('turns a confident reading into an analyst sentence', async () => {
    const out = await explainImplausibleFigure(
      modelSaying('{"reading":"count","why":"the cell sits under a Number of Suppliers heading"}'),
      { key: 'procurement.tmps', figure: 23, excerpt: 'Number of Suppliers: 23' },
    );
    expect(out).toContain('a COUNT, not an amount');
    expect(out).toContain('Number of Suppliers');
  });

  it('says nothing rather than guessing when the model is unsure', async () => {
    const out = await explainImplausibleFigure(
      modelSaying('{"reading":"unknown","why":"cannot tell"}'),
      { key: 'procurement.tmps', figure: 23, excerpt: 'TMPS 23' },
    );
    expect(out).toBeNull();
  });

  it('rejects a reading outside the closed set', async () => {
    const out = await explainImplausibleFigure(
      modelSaying('{"reading":"probably_fine","why":"..."}'),
      { key: 'procurement.tmps', figure: 23, excerpt: 'TMPS 23' },
    );
    expect(out).toBeNull();
  });

  it('survives a model failure — the finding just ships without the sentence', async () => {
    const failing: ExtractionModel = { name: 'f', complete: vi.fn().mockRejectedValue(new Error('429')) };
    const out = await explainImplausibleFigure(failing, { key: 'k', figure: 23, excerpt: 'x 23' });
    expect(out).toBeNull();
  });

  it('asks once and replays — the same document explains the same way', async () => {
    const spy = { calls: 0 };
    const model = modelSaying('{"reading":"count","why":"row count"}', spy);
    const args = { key: 'procurement.tmps', figure: 23, excerpt: 'rows: 23' };
    await explainImplausibleFigure(model, args);
    await explainImplausibleFigure(model, args);
    expect(spy.calls).toBe(1);
  });

  it('does not call a model it does not have', async () => {
    expect(await explainImplausibleFigure(null, { key: 'k', figure: 1, excerpt: 'x' })).toBeNull();
  });
});

describe('excerptAround', () => {
  it('returns the text around the figure', () => {
    const md = 'a'.repeat(500) + ' TMPS: 23 rows ' + 'b'.repeat(500);
    const out = excerptAround(md, 23, 50);
    expect(out).toContain('TMPS: 23 rows');
    expect(out.length).toBeLessThan(160);
  });

  it('returns nothing when the figure is not in the text', () => {
    expect(excerptAround('no numbers here', 42)).toBe('');
  });
});
