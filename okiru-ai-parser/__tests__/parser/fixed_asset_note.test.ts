/**
 * Small entities' statements print the fixed-asset note as cost, accumulated
 * depreciation and carrying value for two years, with no movement lines. When
 * the cost did not move and nothing anywhere says additions, disposals or a
 * purchase of assets, the capital expenditure is nil, and the code says so,
 * labelled derived. In every other case it derives nothing. Invented figures.
 */
import { describe, expect, it } from 'vitest';
import { fixedAssetCapex } from '../../src/services/fixedAssetNote.js';
import { addFixedAssetCapex } from '../../src/services/caseExtraction.js';
import type { DocumentExtraction } from '../../src/services/aiExtraction.js';

function note(opts: { costNow?: string; costBefore?: string; extra?: string; total?: string[] } = {}): string {
  const costNow = opts.costNow ?? '5 300 000';
  const costBefore = opts.costBefore ?? '5 300 000';
  const total = opts.total ?? [costNow, '3 100 000', '2 200 000', costBefore, '3 100 000', '2 200 000'];
  return `## 3.

<table>
<tr><th rowspan="3">Property, plant and equipment</th><th></th><th>2025</th><th rowspan="2">Carrying value</th><th></th><th>2024</th><th rowspan="2">Carrying value</th></tr>
<tr><th>Cost</th><th>Accumulated depreciation</th><th>Cost</th><th>Accumulated depreciation</th></tr>
<tr><th>R</th><th>R</th><th>R</th><th>R</th><th>R</th><th>R</th></tr>
<tr><td>Land</td><td>2 200 000</td><td>-</td><td>2 200 000</td><td>2 200 000</td><td>-</td><td>2 200 000</td></tr>
<tr><td>Vehicles</td><td>3 100 000</td><td>3 100 000</td><td>-</td><td>3 100 000</td><td>3 100 000</td><td>-</td></tr>
<tr><td></td>${total.map((t) => `<td>${t}</td>`).join('')}</tr>
</table>

${opts.extra ?? 'The carrying amounts can be reconciled as follows.'}
`;
}

describe('fixedAssetCapex', () => {
  it('derives nil when the total cost is the same at both year ends and nothing moved', () => {
    const result = fixedAssetCapex(note());
    expect(result).toEqual({ value: 0, basis: expect.stringMatching(/same total cost at 2024 and 2025 year end \(R5 300 000\)/) });
  });

  it('reads the note as a markdown table, its two header rows flattened into one', () => {
    const markdown = [
      '## 3.',
      '',
      '| Property, plant and equipment | Cost R | 2025 Accumulated depreciation R | Carrying value R | Cost R | 2024 Accumulated depreciation R | Carrying value R |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      '| Land | 2 200 000 | - | 2 200 000 | 2 200 000 | - | 2 200 000 |',
      '| Vehicles | 3 100 000 | 3 100 000 | - | 3 100 000 | 3 100 000 | - |',
      '|  | 5 300 000 | 3 100 000 | 2 200 000 | 5 300 000 | 3 100 000 | 2 200 000 |',
      '',
      'The carrying amounts can be reconciled as follows.',
    ].join('\n');
    expect(fixedAssetCapex(markdown)?.value).toBe(0);
    expect(fixedAssetCapex(markdown.replace('reconciled as follows.', 'Additions 10 000'))).toBeNull();
  });

  it('derives nothing when the statements print an additions line', () => {
    expect(fixedAssetCapex(note({ extra: '<table><tr><td>Additions</td><td>120 000</td></tr></table>' }))).toBeNull();
  });

  it('derives nothing when the cash flow shows a purchase of equipment', () => {
    expect(fixedAssetCapex(note({ extra: 'Purchase of property, plant and equipment (45 000)' }))).toBeNull();
  });

  it('reports, and never computes, a cost that moved without a movement line', () => {
    const result = fixedAssetCapex(note({
      costNow: '5 400 000',
      total: ['5 400 000', '3 100 000', '2 300 000', '5 300 000', '3 100 000', '2 200 000'],
    }));
    expect(result).toEqual({ value: null, note: expect.stringMatching(/moved from R5 300 000 to R5 400 000/) });
  });

  it('reads the year order the header prints', () => {
    const reversed = note().replace('<th>2025</th>', '<th>20X</th>').replace('<th>2024</th>', '<th>2025</th>').replace('<th>20X</th>', '<th>2024</th>');
    expect(fixedAssetCapex(reversed)?.value).toBe(0);
  });

  it('derives nothing when the total row does not check out as cost less depreciation', () => {
    expect(fixedAssetCapex(note({ total: ['5 300 000', '3 000 000', '2 200 000', '5 300 000', '3 100 000', '2 200 000'] }))).toBeNull();
  });

  it('derives nothing from a table that is not a fixed-asset note', () => {
    expect(fixedAssetCapex(note().replace('Property, plant and equipment', 'Trade receivables'))).toBeNull();
    expect(fixedAssetCapex('')).toBeNull();
  });
});

describe('addFixedAssetCapex', () => {
  function afs(values: Record<string, unknown>, missing: string[]): DocumentExtraction {
    return {
      documentId: 'annual_financial_statements',
      documentName: 'AFS',
      sourceFile: 'afs.pdf',
      values: Object.entries(values).map(([field, value]) => ({ field, value, sourceFile: 'afs.pdf', sourceDocumentId: 'annual_financial_statements' })),
      missingFields: missing,
      unexpectedFields: [],
      exceptions: [],
    };
  }

  it('fills capital_expenditure, labelled derived, only where the statements asked for it', () => {
    const asked = afs({ current_year_revenue: '1 000' }, ['capital_expenditure']);
    const notAsked = afs({ current_year_revenue: '1 000' }, []);
    addFixedAssetCapex([asked, notAsked], () => note());
    const capex = asked.values.find((v) => v.field === 'capital_expenditure');
    expect(capex?.value).toBe(0);
    expect(capex?.source?.method).toBe('derived');
    expect(asked.missingFields).toEqual([]);
    expect(notAsked.values.some((v) => v.field === 'capital_expenditure')).toBe(false);
  });

  it('never replaces a printed figure', () => {
    const printed = afs({ capital_expenditure: '75 000' }, ['capital_expenditure']);
    addFixedAssetCapex([printed], () => note());
    expect(printed.values.filter((v) => v.field === 'capital_expenditure').map((v) => v.value)).toEqual(['75 000']);
  });

  it('says why when the cost moved', () => {
    const asked = afs({}, ['capital_expenditure']);
    addFixedAssetCapex([asked], () => note({ costNow: '5 400 000', total: ['5 400 000', '3 100 000', '2 300 000', '5 300 000', '3 100 000', '2 200 000'] }));
    expect(asked.values).toEqual([]);
    expect(asked.exceptions.join(' ')).toMatch(/not derived/);
  });
});
