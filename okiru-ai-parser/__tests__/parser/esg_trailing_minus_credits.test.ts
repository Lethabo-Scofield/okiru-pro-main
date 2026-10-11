/**
 * A municipal account prints a credit with its minus AFTER the figure: a
 * generation-offset credit reads "20.25-". Stored as printed, no number parser
 * downstream reads it, and the credit silently left the bill's charges. Money
 * fields hold it as "-20.25"; quantities keep what was printed.
 * Every value here is invented.
 */
import { describe, expect, it } from 'vitest';
import type { DocumentExtraction, ExtractionModel } from '../../src/services/aiExtraction.js';
import { extractEsgCaseEntities, trailingMinusCreditsAsNegative } from '../../src/services/esgCaseExtraction.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';

function extraction(values: Array<[string, unknown]>): DocumentExtraction {
  return {
    documentId: 'ghg_energy__municipal_electricity_bill',
    documentName: 'Municipal electricity bill',
    element: 'GHG_ENERGY',
    sourceFile: 'Invented account.pdf',
    values: values.map(([field, value]) => ({ field, value, sourceFile: 'Invented account.pdf' })),
    exceptions: [],
  } as unknown as DocumentExtraction;
}

const valueOf = (e: DocumentExtraction, field: string) => e.values.find((v) => v.field === field)?.value;

describe('trailingMinusCreditsAsNegative', () => {
  it('a credit on a money field becomes a leading minus', () => {
    const out = trailingMinusCreditsAsNegative(extraction([
      ['electricity_rand_excl_vat', '12.34-'],
      ['water_rand_excl_vat', 'R 1 250.00 -'],
    ]));
    expect(valueOf(out, 'electricity_rand_excl_vat')).toBe('-12.34');
    expect(valueOf(out, 'water_rand_excl_vat')).toBe('-R 1 250.00');
  });

  it('a credit in a row of the bill becomes a leading minus too', () => {
    const out = trailingMinusCreditsAsNegative(extraction([
      ['electricity_period_rows', [
        { line_site: 'Depot North', line_electricity_kwh: '100.000', line_electricity_rand: '45.67' },
        { line_site: 'Depot North', line_electricity_kwh: '12.500', line_electricity_rand: '8.90-' },
      ]],
    ]));
    const rows = valueOf(out, 'electricity_period_rows') as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.line_electricity_rand)).toEqual(['45.67', '-8.90']);
    expect(rows[1].line_electricity_kwh).toBe('12.500');
  });

  it('quantities, rates and ordinary figures are left exactly as read', () => {
    const input = extraction([
      ['electricity_kwh', '13.570-'],
      ['electricity_tariff_rand_per_kwh', '1.23-'],
      ['electricity_rand_excl_vat', '-5.00'],
      ['account_number', '1234-'],
      ['billing_period_end', '2025-06-30'],
    ]);
    expect(trailingMinusCreditsAsNegative(input)).toBe(input);
  });
});

describe('the case extraction normalises credits on every document it returns', () => {
  const model: ExtractionModel = {
    name: 'stub',
    async complete(system) {
      if (/Classify ONE client document/.test(system)) {
        return JSON.stringify({ element: 'GHG_ENERGY', document_type: 'Municipal electricity bill', confidence: 0.9 });
      }
      return JSON.stringify({ electricity_rand_excl_vat: '33.21-', exceptions: [] });
    },
  };

  it('a trailing-minus credit reaches the case as a negative amount', async () => {
    const bill: RawExtractionInput = {
      file_id: 'bill',
      filename: 'Invented account.pdf',
      mime_type: 'application/pdf',
      raw_text: 'Municipal account\nElectricity charges\nGeneration offset credit 33.21-',
      tables: [],
      metadata: {},
    };
    const result = await extractEsgCaseEntities([bill], model);
    const amounts = result!.extractions.flatMap((e: DocumentExtraction) =>
      e.values.filter((v) => v.field === 'electricity_rand_excl_vat').map((v) => v.value));
    expect(amounts.length).toBeGreaterThan(0);
    expect(amounts).toEqual(amounts.map(() => '-33.21'));
  });
});
