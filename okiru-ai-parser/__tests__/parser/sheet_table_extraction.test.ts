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

  // SCORING-SAFETY: an Enterprise/Supplier Development contribution is a grant TO
  // a beneficiary, not a supplier you buy from. Routed as a supplier it becomes
  // phantom procurement spend AND loses its ED points. It must use the
  // contribution shape, whose first field routes the table to the `esd` section.
  it('routes an Enterprise Development sheet to the CONTRIBUTION shape, not the supplier shape', async () => {
    const ed = { filename: 'gather.xlsx › Enterprise Development', raw_text: 't', markdown: 't' };
    const result = await extractSheetTable(model({
      esd_contribution_rows: [
        { beneficiary_name: 'Lerato Startup Cleaning Co-op', contribution_value: '40000', contribution_type: 'Grant', beneficiary_black_ownership: '100' },
      ],
    }), 'ESD', ed);
    expect(result).not.toBeNull();
    expect(result!.values[0].field).toBe('esd_contribution_rows');
    const rows = result!.values[0].value as Array<Record<string, unknown>>;
    expect(String(rows[0].beneficiary_name)).toContain('Lerato');
  });

  it('a Procurement sheet still uses the SUPPLIER shape (→ procurement)', async () => {
    const result = await extractSheetTable(model({
      supplier_rows: [{ supplier_name: 'Sizwe Cleaning', claimed_spend_ex_vat: '3200000', bee_level: '1' }],
    }), 'ESD', { filename: 'gather.xlsx › Procurement', raw_text: 't', markdown: 't' });
    expect(result!.values[0].field).toBe('supplier_rows');
  });

  // The MODEL decides procurement-vs-development by MEANING — and overrides a
  // misleading sheet TITLE. Here the tab is named "Procurement" but the rows are
  // grants to beneficiaries; the model says "development" and the contribution
  // shape (→ esd) is used, which a title regex alone would get wrong.
  it('the model overrides a misleading sheet name (rows decide the ESD destination, not the title)', async () => {
    const smart: ExtractionModel = {
      name: 'fake',
      complete: async (system: string) => {
        if (/"shape"/.test(system)) return JSON.stringify({ shape: 'development_contributions' });
        if (/map the columns/i.test(system)) return JSON.stringify({ mapping: { Beneficiary: 'beneficiary_name', Value: 'contribution_value' } });
        return '{}';
      },
    };
    const result = await extractSheetTable(smart, 'ESD', {
      filename: 'gather.xlsx › Procurement',
      raw_text: 't',
      rows: [{ Beneficiary: 'Lerato Startup Cleaning Co-op', Value: '40000' }],
    });
    expect(result).not.toBeNull();
    expect(result!.values[0].field).toBe('esd_contribution_rows');
    const rows = result!.values[0].value as Array<Record<string, unknown>>;
    expect(String(rows[0].beneficiary_name)).toContain('Lerato');
  });
});
