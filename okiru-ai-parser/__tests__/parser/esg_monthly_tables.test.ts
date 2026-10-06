/**
 * Site × month tables, read by code.
 *
 * Shaped like a real client dashboard (blocks per measure, depots down the
 * side, months across, a broken total row, a hidden sheet, a summary sheet with
 * months down a column) but every figure here is synthetic.
 */
import { describe, expect, it } from 'vitest';
import {
  extractEsgMonthlyTables,
  findMonthTables,
  lineKey,
  readMonthLabel,
  statedYearRange,
  tableFacts,
  yearsOf,
  type TableReading,
} from '../../src/services/esgMonthlyTables.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';

const FUEL_SHEET: unknown[][] = [
  ['FUEL LITRES'],
  ['ACME FOODS', '', 'JUL ', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN'],
  ['ACME FOODS - NORTHGATE', 'LT', 100, 110, 120, 130, 140, 150, 160, 170, 180],
  ['ACME FOODS - SOUTHPORT', 'LT', 200, 210, 220, 230, 240, 250, 260, 270, 280],
  // The total row a careless reader trusts — July typed over with a 3.
  ['', 'LT', 3, 320, 340, 360, 380, 400, 420, 440, 460, 0, 0, 0],
  ['ACME FOODS', 'DIST KM', 9000, 9100, 9200, 9300, 9400, 9500, 9600, 9700, 9800, 0, 0, 0],
  [],
  ['GENERATOR FUEL'],
  ['ACME FOODS', '', 'JUL ', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN'],
  ['ACME FOODS - NORTHGATE', 'LT', 50, 0, 0, 0, 0, 0, 0, 0, 0],
  ['ACME FOODS - SOUTHPORT', 'LT', 0, 0, 0, 0, 0, 25, 0, 0, 0],
];

const ELECTRICITY_SHEET: unknown[][] = [
  ['ELECTRICITY CONSUMPTION'],
  ['', '', 'JUL', 'AMOUNT', 'AUG', 'AMOUNT', 'SEP', 'AMOUNT'],
  ['ACME FOODS - NORTHGATE', 'LANDLORD A', 1000, 3000, 1100, 3300, 1200, 3600],
  ['ACME FOODS - SOUTHPORT', 'LANDLORD B', 2000, 6000, 2100, 6300, 2200, 6600],
  ['', '', 3000, 9000, 3200, 9600, 3400, 10200],
];

const LPG_SHEET: unknown[][] = [
  ['FORKLIFT FUEL'],
  ['', 'JULY', '', 'AUGUST', '', 'SEPTEMBER', ''],
  ['', 'LPG - kg', 'AMOUNT', 'LPG - kg', 'AMOUNT', 'LPG - kg', 'AMOUNT'],
  ['NORTHGATE WAREHOUSE', 0, 0, 615, 15212.4, 205, 9954.18],
  ['SOUTHPORT WAREHOUSE'],
];

const SUMMARY_SHEET: unknown[][] = [
  ['DASHBOARD 2025/2026'],
  ['', 'ROAD FREIGHT', '', 'ELECTRICITY'],
  ['MONTH', 'FUEL CONSUMPTION (LT)', 'DISTANCE (KM)', 'CONSUMPTION'],
  [45839, 300, 9000, 3000],
  [45870, 320, 9100, 3200],
  [45901, 340, 9200, 3400],
];

describe('readMonthLabel', () => {
  it('reads month names, abbreviations, stated years and ISO months', () => {
    expect(readMonthLabel('JUL ', false)).toEqual({ month: 7, year: undefined });
    expect(readMonthLabel('September', false)).toEqual({ month: 9, year: undefined });
    expect(readMonthLabel('Mar-26', false)).toEqual({ month: 3, year: 2026 });
    expect(readMonthLabel('2025-07', false)).toEqual({ month: 7, year: 2025 });
  });

  it('refuses words that only start like a month, and serials unless asked', () => {
    expect(readMonthLabel('Marketing', false)).toBeNull();
    expect(readMonthLabel('Decision', false)).toBeNull();
    expect(readMonthLabel(45839, false)).toBeNull();
    expect(readMonthLabel(45839, true)).toEqual({ month: 7, year: 2025 });
  });
});

describe('findMonthTables', () => {
  it('finds every block on a dashboard sheet, with its title, and marks the total row', () => {
    const tables = findMonthTables(FUEL_SHEET);
    expect(tables).toHaveLength(2);
    expect(tables[0].title).toEqual(['FUEL LITRES']);
    expect(tables[0].months).toEqual([7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]);
    expect(tables[0].lines.map((l) => [l.label, l.qualifier, l.isTotal])).toEqual([
      ['ACME FOODS - NORTHGATE', 'LT', false],
      ['ACME FOODS - SOUTHPORT', 'LT', false],
      ['', 'LT', true],
      ['ACME FOODS', 'DIST KM', false],
    ]);
    expect(tables[1].title).toEqual(['GENERATOR FUEL']);
    expect(tables[1].lines).toHaveLength(2);
  });

  it('reads only the month columns when an AMOUNT column sits beside each month', () => {
    const [table] = findMonthTables(ELECTRICITY_SHEET);
    expect(table.months).toEqual([7, 8, 9]);
    expect(table.lines[0]).toMatchObject({ label: 'ACME FOODS - NORTHGATE', qualifier: 'LANDLORD A', values: [1000, 1100, 1200] });
  });

  it('takes a row of units under the months as part of the header, and keeps a line with no figures out', () => {
    const [table] = findMonthTables(LPG_SHEET);
    expect(table.monthUnits).toEqual(['LPG - kg', 'LPG - kg', 'LPG - kg']);
    expect(table.lines.map((l) => l.label)).toEqual(['NORTHGATE WAREHOUSE']);
    expect(table.lines[0].values).toEqual([0, 615, 205]);
  });

  it('reads a summary sheet whose months run down a column as Excel dates', () => {
    const [table] = findMonthTables(SUMMARY_SHEET);
    expect(table.orientation).toBe('months-down');
    expect(table.months).toEqual([7, 8, 9]);
    expect(table.years[0]).toBe(2025);
    expect(table.lines.map((l) => l.label)).toEqual([
      'ROAD FREIGHT › FUEL CONSUMPTION (LT)',
      'ROAD FREIGHT › DISTANCE (KM)',
      'ELECTRICITY › CONSUMPTION',
    ]);
  });
});

describe('statedYearRange', () => {
  it('finds a year range in a file name or title, and nothing else', () => {
    expect(statedYearRange('DASHBOARD 2025-2026 - ACME.xlsx › fuel')).toEqual([2025, 2026]);
    expect(statedYearRange('', 'DASHBOARD 2024/25')).toEqual([2024, 2025]);
    expect(statedYearRange('Report 2025.xlsx', '2025-2030 strategy')).toBeNull();
  });
});

describe('the year belongs to the document, not the template', () => {
  it('bounds a wrong first-month year by the range the file states', async () => {
    const wrongYear: ExtractionModel = {
      name: 'fake',
      async complete() {
        return JSON.stringify({
          lines_are: 'sites',
          site: null,
          first_month_year: 2019,
          lines: { 'NORTHGATE|': { measure: 'water.kl', unit: 'kL' } },
        });
      },
    };
    const extraction = await extractEsgMonthlyTables(wrongYear, {
      filename: `DASHBOARD 2025-2026 ${Date.now()}.xlsx › water`,
      matrix: [['WATER'], ['', 'JUL', 'AUG', 'SEP'], ['NORTHGATE', 1, 2, 3]],
    });
    const rows = extraction?.values[0].value as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.monthly_period_end)).toEqual(['2025-07-31', '2025-08-31', '2025-09-30']);
  });

  it('reads nothing when the lines are vehicles, not sites or measures', async () => {
    const vehicles: ExtractionModel = {
      name: 'fake',
      async complete() {
        return JSON.stringify({ lines_are: 'other', site: null, first_month_year: 2025, lines: {} });
      },
    };
    const extraction = await extractEsgMonthlyTables(vehicles, {
      filename: `Fleet ${Date.now()}.xlsx › km`,
      matrix: [['Registration', 'JUN', 'JUL', 'AUG'], ['AB12CDGP', 900, 950, 1000], ['AB34EFGP', 800, 850, 900]],
    });
    expect(extraction).toBeNull();
  });
});

describe('yearsOf', () => {
  it('counts the year on when the months wrap from December to January', () => {
    expect(yearsOf({ months: [11, 12, 1, 2], years: [undefined, undefined, undefined, undefined] }, 2025)).toEqual([2025, 2025, 2026, 2026]);
    expect(yearsOf({ months: [11, 12, 1], years: [2024, undefined, undefined] }, 2030)).toEqual([2024, 2024, 2025]);
    expect(yearsOf({ months: [1, 2, 3], years: [undefined, undefined, undefined] }, null)).toEqual([null, null, null]);
  });
});

describe('tableFacts', () => {
  const [fuel] = findMonthTables(FUEL_SHEET);
  const reading: TableReading = {
    linesAre: 'sites',
    site: null,
    firstMonthYear: 2025,
    lines: {
      [lineKey({ label: 'ACME FOODS - NORTHGATE', qualifier: 'LT' })]: { measure: 'fleet.diesel_litres', unit: 'L' },
      [lineKey({ label: 'ACME FOODS - SOUTHPORT', qualifier: 'LT' })]: { measure: 'fleet.diesel_litres', unit: 'L' },
      [lineKey({ label: 'ACME FOODS', qualifier: 'DIST KM' })]: { measure: 'fleet.distance_km', unit: 'km' },
    },
  };

  it('emits one fact per site per month, from the depot rows and never the total row', () => {
    const { facts } = tableFacts(fuel, reading);
    const diesel = facts.filter((f) => f.measure === 'fleet.diesel_litres');
    expect(diesel).toHaveLength(18);
    expect(diesel[0]).toEqual({ measure: 'fleet.diesel_litres', site: 'ACME FOODS - NORTHGATE', period_end: '2025-07-31', value: 100, unit: 'L' });
    expect(diesel.find((f) => f.site === 'ACME FOODS - SOUTHPORT' && f.period_end === '2026-03-31')?.value).toBe(280);
    // The broken "3" lives only in the total row, which is never read.
    expect(facts.some((f) => f.value === 3)).toBe(false);
  });

  it('converts a stated unit into the stored one, and refuses one it cannot convert', () => {
    const [table] = findMonthTables([
      ['WATER'],
      ['', '', 'JUL', 'AUG', 'SEP'],
      ['NORTHGATE', '', 45570, 45570, 45570],
      ['SOUTHPORT', '', 12, 13, 14],
    ]);
    const { facts, notes } = tableFacts(table, {
      linesAre: 'sites', site: null, firstMonthYear: 2025,
      lines: {
        [lineKey({ label: 'NORTHGATE', qualifier: '' })]: { measure: 'water.kl', unit: 'L' },
        [lineKey({ label: 'SOUTHPORT', qualifier: '' })]: { measure: 'water.kl', unit: 'gallons' },
      },
    });
    expect(facts.map((f) => f.value)).toEqual([45.57, 45.57, 45.57]);
    expect(notes[0]).toMatch(/gallons, which cannot be converted to kL/);
  });

  it('uses nothing from a table whose year cannot be told', () => {
    const { facts, notes } = tableFacts(fuel, { ...reading, firstMonthYear: null });
    expect(facts).toHaveLength(0);
    expect(notes[0]).toMatch(/year of the months/);
  });
});

describe('extractEsgMonthlyTables', () => {
  /** A model that answers the one structural question for the fuel sheet. */
  const model: ExtractionModel = {
    name: 'fake',
    async complete() {
      return JSON.stringify({
        lines_are: 'sites',
        site: null,
        first_month_year: 2025,
        lines: {
          'ACME FOODS - NORTHGATE|LT': { measure: 'fleet.diesel_litres', unit: 'L' },
          'ACME FOODS - SOUTHPORT|LT': { measure: 'energy.generator_diesel_litres', unit: 'L' },
          'ACME FOODS|DIST KM': { measure: 'none', unit: 'km' },
        },
      });
    },
  };

  it('emits the rows the workbook places, and says so when the sheet was hidden', async () => {
    const extraction = await extractEsgMonthlyTables(model, {
      filename: 'Dashboard.xlsx › fuel',
      sheetName: `fuel-${Date.now()}`,
      matrix: FUEL_SHEET.slice(0, 6),
      hidden: true,
    });
    expect(extraction?.values[0].field).toBe('esg_monthly_rows');
    const rows = extraction?.values[0].value as Array<Record<string, unknown>>;
    expect(rows[0]).toEqual({
      monthly_measure: 'fleet.diesel_litres',
      monthly_site: 'ACME FOODS - NORTHGATE',
      monthly_period_end: '2025-07-31',
      monthly_value: 100,
      monthly_unit: 'L',
    });
    expect(extraction?.exceptions.some((e) => /HIDDEN sheet/.test(e))).toBe(true);
  });

  it('reads a year laid out as two halves as one table: one question, and January is the next year', async () => {
    let asked = 0;
    const halves: ExtractionModel = {
      name: 'fake',
      async complete() {
        asked += 1;
        return JSON.stringify({
          lines_are: 'sites',
          site: null,
          first_month_year: 2025,
          lines: {
            'NORTHGATE|LANDLORD A': { measure: 'energy.electricity_kwh', unit: 'kWh' },
            'SOUTHPORT|LANDLORD B': { measure: 'energy.electricity_kwh', unit: 'kWh' },
          },
        });
      },
    };
    const extraction = await extractEsgMonthlyTables(halves, {
      filename: 'Dashboard.xlsx › electricity',
      sheetName: `electricity-${Date.now()}`,
      matrix: [
        ['ELECTRICITY CONSUMPTION'],
        ['', '', 'JUL', 'AMOUNT', 'AUG', 'AMOUNT', 'SEP', 'AMOUNT', 'OCT', 'AMOUNT', 'NOV', 'AMOUNT', 'DEC', 'AMOUNT'],
        ['NORTHGATE', 'LANDLORD A', 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0],
        ['SOUTHPORT', 'LANDLORD B', 1, 0, 2, 0, 3, 0, 4, 0, 5, 0, 6, 0],
        ['', '', 3, 0, 4, 0, 6, 0, 8, 0, 10, 0, 12, 0],
        ['', '', 'JAN', 'AMOUNT', 'FEB', 'AMOUNT', 'MAR', 'AMOUNT'],
        ['NORTHGATE', 'LANDLORD A', 7, 0, 8, 0, 9, 0],
        ['SOUTHPORT', 'LANDLORD B', 7, 0, 8, 0, 9, 0],
      ],
    });
    expect(asked).toBe(1);
    const rows = extraction?.values[0].value as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(18);
    expect(rows.find((r) => r.monthly_site === 'NORTHGATE' && r.monthly_value === 7)?.monthly_period_end).toBe('2026-01-31');
    expect(rows.find((r) => r.monthly_site === 'NORTHGATE' && r.monthly_value === 6)?.monthly_period_end).toBe('2025-12-31');
  });

  it('returns null for a sheet with no month run', async () => {
    expect(await extractEsgMonthlyTables(model, { filename: 'x.xlsx', matrix: [['Name', 'Value'], ['a', 1]] })).toBeNull();
  });
});
