/**
 * The first pass (not only the agent) must never store a figure in a field
 * whose NAME fixes another unit. Nothing downstream reads electricity_unit or
 * waste_mass_unit: "35.75 MWh" under electricity_kwh would count as 35.75 kWh,
 * a thousand times too small. Such a figure becomes an exception for the
 * reviewer, never a value; the field's own unit, or a bare figure, stays.
 * Every value here is invented.
 */
import { describe, expect, it } from 'vitest';
import type { DocumentExtraction } from '../../src/services/aiExtraction.js';
import { namedUnitFiguresAsExceptions } from '../../src/services/esgCaseExtraction.js';

function extraction(values: Array<[string, unknown]>): DocumentExtraction {
  return {
    documentId: 'ghg_energy__municipal_electricity_bill',
    documentName: 'Municipal electricity account',
    element: 'GHG_ENERGY',
    sourceFile: 'invented-account.pdf',
    values: values.map(([field, value]) => ({ field, value, sourceFile: 'invented-account.pdf' })),
    exceptions: [],
  } as unknown as DocumentExtraction;
}

const fields = (e: DocumentExtraction) => Object.fromEntries(e.values.map((v) => [v.field, v.value]));

describe('a first-pass figure in a unit the field name excludes', () => {
  it('MWh under electricity_kwh and tonnes under waste_total_kg become exceptions, never values', () => {
    const out = namedUnitFiguresAsExceptions(extraction([
      ['electricity_kwh', '35.75 MWh'],
      ['waste_total_kg', '0.2 t'],
      ['water_kl', '1 200 litres'],
    ]));
    expect(fields(out)).toEqual({});
    expect(out.exceptions).toHaveLength(3);
    expect(out.exceptions[0]).toMatch(/electricity_kwh/);
    expect(out.exceptions[0]).toMatch(/35\.75 MWh/);
    expect(out.exceptions[0]).toMatch(/never convert/i);
  });

  it("the field's own unit, a same-size spelling and a bare figure are kept as read", () => {
    const out = namedUnitFiguresAsExceptions(extraction([
      ['electricity_kwh', '18 420.5 kWh'],
      ['water_kl', '85 m3'],
      ['fuel_litres', 1234],
      ['waste_total_kg', '640'],
      ['electricity_rand_per_kwh', 'R2.31 per kWh'],
      ['site_name', 'Depot A'],
    ]));
    expect(fields(out)).toEqual({
      electricity_kwh: '18 420.5 kWh',
      water_kl: '85 m3',
      fuel_litres: 1234,
      waste_total_kg: '640',
      electricity_rand_per_kwh: 'R2.31 per kWh',
      site_name: 'Depot A',
    });
    expect(out.exceptions).toEqual([]);
  });

  it('rows and other non-text values are left alone', () => {
    const rows = [{ monthly_value: '3 MWh' }];
    const input = extraction([['esg_monthly_rows', rows]]);
    expect(namedUnitFiguresAsExceptions(input)).toBe(input);
  });
});
