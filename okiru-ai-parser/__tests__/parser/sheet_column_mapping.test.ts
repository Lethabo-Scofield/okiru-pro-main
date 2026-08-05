/**
 * Deterministic table extraction — the model maps COLUMNS, the code reads ROWS.
 *
 * The invariant under test: however many rows the sheet has, every one of them
 * reaches the output, because the model's only job is the (tiny) column mapping
 * and the code applies it mechanically. The 14-of-23 truncation class cannot
 * recur on this path.
 */
import { describe, expect, it } from 'vitest';
import {
  applyColumnMapping,
  collectHeaders,
  mapSheetColumns,
} from '../../src/services/sheetColumnMapping.js';
import { extractSheetTable } from '../../src/services/sheetTableExtraction.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';

function model(reply: unknown): ExtractionModel {
  return { name: 'fake', complete: async () => JSON.stringify(reply) };
}

const SUPPLIER_SHAPE = {
  columns: ['supplier_name', 'claimed_spend_ex_vat', 'bee_level', 'certificate_expiry_date'],
  what: 'each supplier with the spend against them',
};

/** A 23-row supplier schedule — the exact size the model path truncated at 14. */
function supplierRows(): Array<Record<string, unknown>> {
  return Array.from({ length: 23 }, (_, i) => ({
    'Supplier Name': `Supplier ${i + 1}`,
    'Amount (Excl VAT)': (i + 1) * 1000,
    'B-BBEE Level': (i % 8) + 1,
  }));
}

const SUPPLIER_MAPPING = {
  'Supplier Name': 'supplier_name',
  'Amount (Excl VAT)': 'claimed_spend_ex_vat',
  'B-BBEE Level': 'bee_level',
};

describe('mapSheetColumns', () => {
  it('sends only headers and a small sample, never the whole table', async () => {
    let seenUser = '';
    const spying: ExtractionModel = {
      name: 'spy',
      complete: async (_system, user) => {
        seenUser = user;
        return JSON.stringify({ mapping: SUPPLIER_MAPPING });
      },
    };
    const mapping = await mapSheetColumns(spying, SUPPLIER_SHAPE, 'wb › Procurement', supplierRows());
    expect(mapping).toEqual(SUPPLIER_MAPPING);
    // Row 7 (and most others) must NOT be in the prompt — only the sample is.
    expect(seenUser).not.toContain('Supplier 7');
    expect(seenUser).toContain('Supplier 1');
    expect(seenUser).toContain('SHEET COLUMNS');
  });

  it('drops hallucinated headers, unknown fields and duplicate targets', async () => {
    const mapping = await mapSheetColumns(model({ mapping: {
      'Supplier Name': 'supplier_name',
      'No Such Column': 'bee_level',
      'Amount (Excl VAT)': 'not_a_requested_field',
      'B-BBEE Level': 'supplier_name',
    } }), SUPPLIER_SHAPE, 'wb › Procurement', supplierRows());
    expect(mapping).toEqual({ 'Supplier Name': 'supplier_name' });
  });

  it('matches headers case-insensitively when the model normalises whitespace', async () => {
    const mapping = await mapSheetColumns(model({ mapping: {
      'supplier  name': 'supplier_name',
    } }), SUPPLIER_SHAPE, 'wb › Procurement', supplierRows());
    expect(mapping).toEqual({ 'Supplier Name': 'supplier_name' });
  });

  it('returns null on model failure or an empty mapping', async () => {
    const failing: ExtractionModel = { name: 'x', complete: async () => { throw new Error('500'); } };
    expect(await mapSheetColumns(failing, SUPPLIER_SHAPE, 's', supplierRows())).toBeNull();
    expect(await mapSheetColumns(model({ mapping: {} }), SUPPLIER_SHAPE, 's', supplierRows())).toBeNull();
    expect(await mapSheetColumns(model('not json'), SUPPLIER_SHAPE, 's', supplierRows())).toBeNull();
  });
});

describe('applyColumnMapping', () => {
  it('emits every data row — 23 in, 23 out', () => {
    const result = applyColumnMapping(supplierRows(), SUPPLIER_MAPPING, SUPPLIER_SHAPE);
    expect(result.rows).toHaveLength(23);
    expect(result.rows[22]).toEqual({ supplier_name: 'Supplier 23', claimed_spend_ex_vat: 23000, bee_level: 7 });
    expect(result.exceptions).toEqual([]);
  });

  it('keeps cell values verbatim — numbers stay numbers, strings stay strings', () => {
    const rows = [{ 'Supplier Name': 'Alpha', 'Amount (Excl VAT)': 'R 1 030,50', 'B-BBEE Level': 4 }];
    const result = applyColumnMapping(rows, SUPPLIER_MAPPING, SUPPLIER_SHAPE);
    expect(result.rows[0].claimed_spend_ex_vat).toBe('R 1 030,50');
    expect(result.rows[0].bee_level).toBe(4);
  });

  it('skips a TOTAL row, captures its figure, and passes when rows reconcile', () => {
    const rows = [
      { 'Supplier Name': 'Alpha', 'Amount (Excl VAT)': 600 },
      { 'Supplier Name': 'Beta', 'Amount (Excl VAT)': 400 },
      { 'Supplier Name': 'TOTAL', 'Amount (Excl VAT)': 1000 },
    ];
    const result = applyColumnMapping(rows, SUPPLIER_MAPPING, SUPPLIER_SHAPE);
    expect(result.rows).toHaveLength(2);
    expect(result.stats.totalRowsSkipped).toBe(1);
    expect(result.exceptions).toEqual([]);
  });

  it('reports an exception when extracted rows do not sum to the labelled total', () => {
    const rows = [
      { 'Supplier Name': 'Alpha', 'Amount (Excl VAT)': 600 },
      { 'Supplier Name': 'Grand Total', 'Amount (Excl VAT)': 1000 },
    ];
    const result = applyColumnMapping(rows, SUPPLIER_MAPPING, SUPPLIER_SHAPE);
    expect(result.exceptions).toHaveLength(1);
    expect(result.exceptions[0]).toContain('claimed_spend_ex_vat');
    expect(result.exceptions[0]).toContain('1000');
  });

  it('forward-fills the key through a merged-cell block — 13 monthly lines, one name', () => {
    // The real SED sheet: "Essentially Edenvale" written once, then twelve
    // dated R500 lines below it. All thirteen belong to that beneficiary.
    const shape = { columns: ['beneficiary_name', 'contribution_value'], what: 'each SED beneficiary' };
    const mapping = { Beneficiary: 'beneficiary_name', 'Amount of Contribution': 'contribution_value' };
    const rows = [
      { Beneficiary: 'Essentially Edenvale', 'Amount of Contribution': 500 },
      ...Array.from({ length: 12 }, () => ({ 'Amount of Contribution': 500 })),
      { Beneficiary: 'Germiston Youth Centre', 'Amount of Contribution': 100 },
      { 'Amount of Contribution': 100 },
    ];
    const result = applyColumnMapping(rows, mapping, shape);
    expect(result.rows).toHaveLength(15);
    expect(result.rows.filter((r) => r.beneficiary_name === 'Essentially Edenvale')).toHaveLength(13);
    expect(result.rows[14].beneficiary_name).toBe('Germiston Youth Centre');
    expect(result.stats.forwardFilledRows).toBe(13);
  });

  it('does not inherit a key before the first keyed row or across a TOTAL line', () => {
    const rows = [
      { 'Amount (Excl VAT)': 999999 },
      { 'Supplier Name': 'Alpha', 'Amount (Excl VAT)': 600 },
      { 'Supplier Name': 'TOTAL', 'Amount (Excl VAT)': 600 },
      { 'Amount (Excl VAT)': 777 },
    ];
    const result = applyColumnMapping(rows, SUPPLIER_MAPPING, SUPPLIER_SHAPE);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].supplier_name).toBe('Alpha');
    expect(result.stats.keylessRowsSkipped).toBe(2);
    expect(result.stats.totalRowsSkipped).toBe(1);
  });
});

describe('collectHeaders', () => {
  it('unions keys across rows in first-seen order', () => {
    expect(collectHeaders([{ A: 1 }, { B: 2, A: 3 }, { C: 4 }])).toEqual(['A', 'B', 'C']);
  });
});

describe('extractSheetTable with parsed rows', () => {
  it('reads the table deterministically — one mapping call, all 23 rows out', async () => {
    // The shape-choice pass (its own small call) answers first; the point pinned
    // here is that the TABLE itself costs exactly one mapping call — the model
    // never re-types rows.
    let mappingCalls = 0;
    const mappingModel: ExtractionModel = {
      name: 'map-only',
      complete: async (system: string) => {
        if (/"shape"/.test(system)) return JSON.stringify({ shape: 'suppliers' });
        mappingCalls += 1;
        return JSON.stringify({ mapping: SUPPLIER_MAPPING });
      },
    };
    const result = await extractSheetTable(mappingModel, 'ESD', {
      filename: 'wb.xlsm › Procurement',
      raw_text: 'x',
      markdown: 'x',
      rows: supplierRows(),
    });
    expect(mappingCalls).toBe(1);
    const rows = result!.values[0].value as unknown[];
    expect(rows).toHaveLength(23);
  });

  it('carries reconciliation exceptions on the extraction', async () => {
    const rows = [
      { 'Supplier Name': 'Alpha', 'Amount (Excl VAT)': 600 },
      { 'Supplier Name': 'TOTAL', 'Amount (Excl VAT)': 999 },
    ];
    const result = await extractSheetTable(model({ mapping: SUPPLIER_MAPPING }), 'ESD', {
      filename: 'wb.xlsm › Procurement', raw_text: 'x', rows,
    });
    expect(result!.exceptions).toHaveLength(1);
  });

  it('falls back to the model table read when mapping fails', async () => {
    let calls = 0;
    const fallback: ExtractionModel = {
      name: 'fallback',
      complete: async (system: string) => {
        if (/"shape"/.test(system)) return '{}'; // no shape verdict → element default
        calls += 1;
        // First call (mapping) unusable; second call (legacy read) returns rows.
        return calls === 1
          ? 'no mapping here'
          : JSON.stringify({ supplier_rows: [{ supplier_name: 'Alpha', claimed_spend_ex_vat: '600' }] });
      },
    };
    const result = await extractSheetTable(fallback, 'ESD', {
      filename: 'wb.xlsm › Procurement', raw_text: 'markdown table here', rows: supplierRows(),
    });
    expect(calls).toBe(2);
    expect((result!.values[0].value as unknown[])).toHaveLength(1);
  });

  it('falls back when the mapping misses the key column', async () => {
    let calls = 0;
    const noKey: ExtractionModel = {
      name: 'nokey',
      complete: async (system: string) => {
        if (/"shape"/.test(system)) return '{}'; // no shape verdict → element default
        calls += 1;
        return calls === 1
          ? JSON.stringify({ mapping: { 'Amount (Excl VAT)': 'claimed_spend_ex_vat' } })
          : JSON.stringify({ supplier_rows: [] });
      },
    };
    const result = await extractSheetTable(noKey, 'ESD', {
      filename: 'wb.xlsm › Procurement', raw_text: 'x', rows: supplierRows(),
    });
    expect(calls).toBe(2);
    expect(result).toBeNull();
  });
});
