/**
 * An unfilled spreadsheet template prints its formulas' zeros: an empty stock
 * reconciliation shows opening 0, deliveries 0, issues 0, closing 0. Read as
 * figures, those zeros were filed as the depot's diesel stock and contradicted
 * the real reconciliation on the next tab. A workbook sheet whose every
 * quantity (three or more, each a field named for its unit) reads as zero is a
 * template: the zeros go to the reviewer as an exception, never as figures. A
 * single zero ("generator diesel 0 L this month") is a reading, and stays.
 * Every value here is invented.
 */
import { describe, expect, it } from 'vitest';
import type { DocumentExtraction } from '../../src/services/aiExtraction.js';
import { extractEsgCaseEntities, templateZerosAsExceptions } from '../../src/services/esgCaseExtraction.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';

function extraction(values: Array<[string, unknown]>): DocumentExtraction {
  return {
    documentId: 'ghg_energy__generator_diesel_bowser_reconciliation',
    documentName: 'Bowser reconciliation',
    element: 'GHG_ENERGY',
    sourceFile: 'Invented.xlsx › Lubricant recon',
    values: values.map(([field, value]) => ({ field, value, sourceFile: 'Invented.xlsx › Lubricant recon' })),
    exceptions: [],
  } as unknown as DocumentExtraction;
}

const fields = (e: DocumentExtraction) => e.values.map((v) => v.field);

describe('templateZerosAsExceptions', () => {
  it('an all-zero reconciliation keeps none of its zeros, and says why', () => {
    const out = templateZerosAsExceptions(extraction([
      ['reporting_period_start', 'Mar 2026'],
      ['opening_stock_litres', '0'],
      ['deliveries_litres', '0'],
      ['closing_stock_litres', '0.00'],
      ['issued_total_litres', 0],
      ['fuel_supplier_name', 'Example Fuels'],
    ]));
    expect(fields(out)).toEqual(['reporting_period_start', 'fuel_supplier_name']);
    expect(out.exceptions.join(' ')).toMatch(/every quantity.*zero/i);
    expect(out.exceptions.join(' ')).toMatch(/opening_stock_litres/);
  });

  it('a single zero is a reading, and stays', () => {
    const input = extraction([['reporting_period_start', 'Mar 2026'], ['generator_diesel_litres', '0']]);
    expect(templateZerosAsExceptions(input)).toBe(input);
  });

  it('one non-zero quantity means the sheet is filled in: every figure stays', () => {
    const input = extraction([
      ['opening_stock_litres', '0'],
      ['deliveries_litres', '12 001'],
      ['closing_stock_litres', '0'],
      ['issued_total_litres', '0'],
    ]);
    expect(templateZerosAsExceptions(input)).toBe(input);
  });

  it('rates and money are not quantities', () => {
    const input = extraction([
      ['water_rand_excl_vat', '0.00'],
      ['electricity_tariff_rand_per_kwh', '0'],
      ['water_kl', '0.000'],
      ['sanitation_kl', '0.000'],
    ]);
    expect(templateZerosAsExceptions(input)).toBe(input);
  });
});

describe('the case extraction applies it to workbook sheets only', () => {
  const reply = JSON.stringify({ opening_stock_litres: '0', deliveries_litres: '0', closing_stock_litres: '0', issued_total_litres: '0', exceptions: [] });
  const model: ExtractionModel = {
    name: 'stub',
    async complete(system) {
      if (/Classify ONE client document/.test(system)) return JSON.stringify({ element: 'GHG_ENERGY', document_type: 'Bowser reconciliation', confidence: 0.9 });
      return reply;
    },
  };
  const base = { mime_type: 'application/pdf', tables: [] as unknown[], metadata: {} };

  it('a sheet of template zeros files no figure', async () => {
    const sheet: RawExtractionInput = {
      ...base,
      file_id: 'recon',
      filename: 'Invented.xlsx › Lubricant recon',
      mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      raw_text: 'Lubricant recon\nOpening stock 0\nDeliveries 0\nIssues 0\nClosing stock 0',
      metadata: { sheet_name: 'Lubricant recon' },
    };
    const result = await extractEsgCaseEntities([sheet], model);
    const values = result!.extractions.flatMap((e: DocumentExtraction) => e.values.map((v) => v.field));
    expect(values.filter((f: string) => /_litres$/.test(f))).toEqual([]);
  });
});
