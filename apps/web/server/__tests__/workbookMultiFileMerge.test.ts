/**
 * Merging several workbooks into one scorecard.
 *
 * The behaviours that matter are all about not corrupting evidence: rows add up,
 * unfilled template lines are dropped, the same file twice does not double a
 * supplier's spend, and two files disagreeing on a number is reported rather
 * than silently resolved.
 */
import { describe, expect, it } from 'vitest';
import { isBlankRow, mergeWorkbooks, summariseContributions } from '../../src/lib/workbookMultiFileMerge';
import type { WorkbookRow } from '../../src/lib/workbookExcelNormalizer';

function row(fields: Record<string, unknown>, id = Math.random().toString(36).slice(2)): WorkbookRow {
  return { _id: id, ...fields } as WorkbookRow;
}

describe('blank rows', () => {
  it('treats an unfilled template line as blank', () => {
    // The real Thandanani Procurement sheet: 1,991 rows that all read "0 | 0".
    expect(isBlankRow(row({ supplierName: '', spend: 0 }))).toBe(true);
    expect(isBlankRow(row({ supplierName: '0', spend: '0' }))).toBe(true);
    expect(isBlankRow(row({}))).toBe(true);
  });

  it('does not treat a real row as blank', () => {
    expect(isBlankRow(row({ supplierName: 'Dynamic Maintenance Products', spend: 4876 }))).toBe(false);
  });
});

describe('merging', () => {
  it('adds suppliers from a second file rather than replacing them', () => {
    const merged = mergeWorkbooks([
      { filename: 'gathering.xlsm', result: { sections: { procurement: { rows: [row({ supplierName: 'Alpha', spend: 100 })] } } } },
      { filename: 'procurement.xlsm', result: { sections: { procurement: { rows: [row({ supplierName: 'Beta', spend: 200 })] } } } },
    ]);

    const names = merged.sections.procurement.rows.map((r) => r.supplierName);
    expect(names).toEqual(['Alpha', 'Beta']);
  });

  it('drops the empty template rows that would drown the real ones', () => {
    // 1,991 blanks + 2 real rows must yield 2.
    const blanks = Array.from({ length: 1991 }, () => row({ supplierName: '', spend: 0 }));
    const merged = mergeWorkbooks([
      { filename: 'gathering.xlsm', result: { sections: { procurement: { rows: blanks } } } },
      {
        filename: 'procurement.xlsm',
        result: {
          sections: {
            procurement: {
              rows: [row({ supplierName: 'Dynamic Maintenance', spend: 4876 }), row({ supplierName: 'Eikenhof', spend: 1200 })],
            },
          },
        },
      },
    ]);

    expect(merged.sections.procurement.rows).toHaveLength(2);
  });

  it('does not double a supplier when the same file is uploaded twice', () => {
    const supplier = row({ supplierName: 'Alpha', spend: 100 }, 'fixed-id');
    const merged = mergeWorkbooks([
      { filename: 'spend.xlsm', result: { sections: { procurement: { rows: [supplier] } } } },
      { filename: 'spend (1).xlsm', result: { sections: { procurement: { rows: [row({ supplierName: 'Alpha', spend: 100 }, 'other-id')] } } } },
    ]);

    // Different _id, same evidence — one supplier, not two.
    expect(merged.sections.procurement.rows).toHaveLength(1);
  });

  it('merges different sections from different files', () => {
    const merged = mergeWorkbooks([
      { filename: 'gathering.xlsm', result: { sections: { ownership: { rows: [row({ shareholderName: 'V Naidoo' })] } } } },
      { filename: 'sed.xlsm', result: { sections: { sed: { rows: [row({ beneficiary: 'Essentially Edenvale', amount: 45382 })] } } } },
    ]);

    expect(merged.sections.ownership.rows).toHaveLength(1);
    expect(merged.sections.sed.rows).toHaveLength(1);
  });

  it('reports which file supplied what', () => {
    const merged = mergeWorkbooks([
      { filename: 'gathering.xlsm', result: { sections: { ownership: { rows: [row({ shareholderName: 'V Naidoo' })] } } } },
      { filename: 'sed.xlsm', result: { sections: { sed: { rows: [row({ beneficiary: 'X', amount: 1 }), row({ beneficiary: 'Y', amount: 2 })] } } } },
    ]);

    expect(summariseContributions(merged)).toEqual(['gathering.xlsm: 1 rows', 'sed.xlsm: 2 rows']);
  });
});

describe('meta fields', () => {
  it('takes the first non-empty value and ignores blanks in later files', () => {
    const merged = mergeWorkbooks([
      { filename: 'a.xlsm', result: { sections: { financials: { rows: [], meta: { revenue: 10826271 } } } } },
      { filename: 'b.xlsm', result: { sections: { financials: { rows: [], meta: { revenue: '' } } } } },
    ]);

    expect(merged.sections.financials.meta!.revenue).toBe(10826271);
    expect(merged.conflicts).toHaveLength(0);
  });

  it('flags a disagreement instead of silently picking one', () => {
    const merged = mergeWorkbooks([
      { filename: 'a.xlsm', result: { sections: { financials: { rows: [], meta: { revenue: 10826271 } } } } },
      { filename: 'b.xlsm', result: { sections: { financials: { rows: [], meta: { revenue: 9500000 } } } } },
    ]);

    // Quietly choosing a revenue figure is how a wrong score gets certified.
    expect(merged.conflicts).toHaveLength(1);
    expect(merged.conflicts[0].field).toBe('revenue');
    expect(merged.conflicts[0].values.map((v) => v.value)).toEqual([10826271, 9500000]);
    expect(merged.conflicts[0].values[0].sources).toEqual(['a.xlsm']);
    expect(merged.warnings[0]).toMatch(/need a decision/i);
  });

  it('does not flag a conflict when both files agree', () => {
    const merged = mergeWorkbooks([
      { filename: 'a.xlsm', result: { sections: { financials: { rows: [], meta: { revenue: 100 } } } } },
      { filename: 'b.xlsm', result: { sections: { financials: { rows: [], meta: { revenue: 100 } } } } },
    ]);

    expect(merged.conflicts).toHaveLength(0);
    expect(merged.sections.financials.meta!.revenue).toBe(100);
  });
});

describe('edge cases', () => {
  it('returns an empty merge for no files rather than throwing', () => {
    const merged = mergeWorkbooks([]);
    expect(merged.sections).toEqual({});
    expect(merged.conflicts).toEqual([]);
  });

  it('handles a single file unchanged apart from blank-row removal', () => {
    const merged = mergeWorkbooks([
      { filename: 'only.xlsm', result: { sections: { procurement: { rows: [row({ supplierName: 'Alpha', spend: 1 }), row({ supplierName: '', spend: 0 })] } } } },
    ]);
    expect(merged.sections.procurement.rows).toHaveLength(1);
  });
});
