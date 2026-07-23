/**
 * Sheet TABLE extraction — the extractor the 109-doc matrix could not provide.
 *
 * The matrix extracts single evidence records; a workbook Procurement sheet is
 * 23 suppliers and a Social Development sheet is 12 beneficiaries. This returns
 * EVERY row, which is what carries the Procurement and SED points.
 */
import { describe, expect, it } from 'vitest';
import { extractSheetTable } from '../../src/services/sheetTableExtraction.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';

function model(reply: unknown): ExtractionModel {
  return { name: 'fake', complete: async () => JSON.stringify(reply) };
}

const sheet = { filename: 'proc.xlsm › Procurement', raw_text: 'table', markdown: 'table' };

describe('extracting a table', () => {
  it('returns one value holding an array of supplier rows for ESD', async () => {
    const result = await extractSheetTable(model({
      supplier_rows: [
        { supplier_name: 'Dynamic Maintenance', claimed_spend_ex_vat: '4240', bee_level: '4' },
        { supplier_name: 'Beta Logistics', claimed_spend_ex_vat: '1200', bee_level: '1' },
      ],
    }), 'ESD', sheet);

    expect(result).not.toBeNull();
    expect(result!.element).toBe('ESD');
    expect(result!.values).toHaveLength(1);
    const rows = result!.values[0].value as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
    expect(rows[0].supplier_name).toBe('Dynamic Maintenance');
  });

  it('drops empty / zero rows the model returns for blank template lines', async () => {
    const result = await extractSheetTable(model({
      beneficiary_rows: [
        { beneficiary_name: 'Essentially Edenvale', contribution_value: '500' },
        { beneficiary_name: '', contribution_value: '0' },
      ],
    }), 'SED', { filename: 'sed.xlsm › Social Development', raw_text: 't', markdown: 't' });

    const rows = result!.values[0].value as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
  });

  it('recovers the array even when the model uses a different key', async () => {
    const result = await extractSheetTable(model({ rows: [{ employee_name: 'V Naidoo', race: 'Indian' }] }), 'MANAGEMENT_CONTROL', sheet);
    expect((result!.values[0].value as unknown[])).toHaveLength(1);
  });

  it('returns null when the sheet holds no rows', async () => {
    expect(await extractSheetTable(model({ supplier_rows: [] }), 'ESD', sheet)).toBeNull();
  });

  it('returns null on a model failure rather than throwing', async () => {
    const failing: ExtractionModel = { name: 'x', complete: async () => { throw new Error('500'); } };
    expect(await extractSheetTable(failing, 'ESD', sheet)).toBeNull();
  });

  it('returns null on unparseable output', async () => {
    expect(await extractSheetTable(model('not json'), 'ESD', sheet)).toBeNull();
  });
});
