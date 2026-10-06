/**
 * A utility bill is one site's figure for one month — a row of the monthly
 * register, never a rival answer to every other bill.
 */
import { describe, expect, it } from 'vitest';
import { billAsMonthlyRows } from '../../src/services/esgBillFacts.js';
import { resolveCaseEntities } from '../../src/services/entityResolution.js';
import {
  ESG_REGISTER_FIELDS,
  esgFieldElementIndex,
  mapEsgEntitiesToCalculator,
} from '../../src/services/esgEntityCalculatorMapping.js';
import type { DocumentExtraction } from '../../src/services/aiExtraction.js';

const bill = (file: string, element: string, values: Record<string, unknown>): DocumentExtraction => ({
  documentId: `doc:${file}`,
  documentName: 'Municipal bill',
  element,
  sourceFile: file,
  values: Object.entries(values).map(([field, value]) => ({ field, value, sourceFile: file, sourceDocumentId: `doc:${file}` })),
  missingFields: [],
  unexpectedFields: [],
  exceptions: [],
});

describe('billAsMonthlyRows', () => {
  it('moves the figure, its site and its period into one row, and keeps the evidence', () => {
    const out = billAsMonthlyRows(bill('bkt-jul.pdf', 'GHG_ENERGY', {
      site_name: 'ACME CONSUMER - BROOK TOWN',
      billing_period_end: '2025-07-26',
      electricity_kwh: '35,332 kWh',
      utility_account_number: '5550123',
    }));
    expect(out.values.map((v) => v.field)).toEqual(['utility_account_number', 'esg_monthly_rows']);
    expect(out.values[1].value).toEqual([{
      monthly_measure: 'energy.electricity_kwh',
      monthly_site: 'ACME CONSUMER - BROOK TOWN',
      monthly_period_end: '2025-07-26',
      monthly_value: '35,332 kWh',
      monthly_field: 'electricity_kwh',
      monthly_context: 'site_name,billing_period_end',
      __source: 'bkt-jul.pdf',
    }]);
  });

  it('reads a water bill as water, and a bill with solar as two rows', () => {
    const water = billAsMonthlyRows(bill('w.pdf', 'WATER', { billing_period_end: '2025-08-31', water_kl: 318 }));
    expect((water.values.at(-1)!.value as Array<{ monthly_measure: string }>)[0].monthly_measure).toBe('water.kl');
    const both = billAsMonthlyRows(bill('e.pdf', 'GHG_ENERGY', {
      billing_period_end: '2025-08-31',
      electricity_kwh: 1000,
      solar_kwh_generated: 200,
    }));
    expect((both.values.at(-1)!.value as unknown[]).length).toBe(2);
  });

  it('leaves a bill without a period, or without a figure, as it was', () => {
    const noPeriod = bill('a.pdf', 'GHG_ENERGY', { site_name: 'BKT', electricity_kwh: 10 });
    expect(billAsMonthlyRows(noPeriod)).toBe(noPeriod);
    const noFigure = bill('b.pdf', 'GHG_ENERGY', { billing_period_end: '2025-07-31', electricity_kwh: 'see attached' });
    expect(billAsMonthlyRows(noFigure)).toBe(noFigure);
    const notABill = bill('c.pdf', 'WASTE', { billing_period_end: '2025-07-31', total_kg: 10 });
    expect(billAsMonthlyRows(notABill)).toBe(notABill);
  });
});

describe('twelve bills resolve to twelve figures, not three conflicts', () => {
  it('turns every bill into its own calculator row with its own file', () => {
    const sites = ['ALDER', 'BKT', 'DRN'];
    const bills = sites.flatMap((site, i) =>
      ['2025-07-31', '2025-08-31'].map((end) =>
        bill(`${site}-${end}.pdf`, 'GHG_ENERGY', { site_name: site, billing_period_end: end, electricity_kwh: 1000 + i }),
      ),
    ).map(billAsMonthlyRows);

    const resolved = resolveCaseEntities(bills, { allFiles: bills.map((b) => b.sourceFile), additiveFields: ESG_REGISTER_FIELDS });
    const calculator = mapEsgEntitiesToCalculator(resolved, esgFieldElementIndex(bills));

    expect(calculator.needsReview.map((r) => r.field)).toEqual([]);
    const rows = calculator.rows.filter((r) => r.grid === 'esg_monthly_rows');
    expect(rows).toHaveLength(6);
    expect(rows.map((r) => r.sourceFiles[0]).sort()).toEqual(bills.map((b) => b.sourceFile).sort());
    expect(rows[0].cells).toMatchObject({
      'monthly.measure': 'energy.electricity_kwh',
      'monthly.field': 'electricity_kwh',
      'monthly.context': 'site_name,billing_period_end',
    });
  });
});
