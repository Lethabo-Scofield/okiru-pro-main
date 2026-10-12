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
  monthlyReadStandsIn,
  readMonthLabel,
  readsMonthlyMeasures,
  statedKind,
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
  ['NORTHGATE WAREHOUSE', 0, 0, 570, 14869.57, 190, 9728.61],
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
    expect(table.lines[0].values).toEqual([0, 570, 190]);
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
    expect(diesel[0]).toEqual({ measure: 'fleet.diesel_litres', site: 'ACME FOODS - NORTHGATE', period_end: '2025-07-31', value: 100, unit: 'L', qualifier: 'LT' });
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
    expect(notes.find((n) => /gallons/.test(n))).toMatch(/gallons, which cannot be converted to kL/);
    // A conversion is never silent.
    expect(notes.find((n) => /NORTHGATE/.test(n))).toMatch(/stated in L and was stored in kL \(x 0\.001\)/);
  });

  it('uses nothing from a table whose year cannot be told', () => {
    const { facts, notes } = tableFacts(fuel, { ...reading, firstMonthYear: null });
    expect(facts).toHaveLength(0);
    expect(notes[0]).toMatch(/year of the months/);
  });
});

/** A system export: one line per site AND measure, descriptor columns, a Total and a Units column after the months. */
const LONG_SHEET: unknown[][] = [
  ['Consumption detail'],
  ['Node', 'Datasource', 'Activity', 'Jul 2025', 'Aug 2025', 'Sep 2025', 'Total', 'Units'],
  ['Acme - North', 'Electricity', 'Grid', 1000, 1100, 1200, 3300, 'kWh'],
  ['Acme - North', 'Trucks', 'Road Freight', 5000, 5100, 5200, 15300, 'km'],
  ['Acme - North', 'Trucks', 'Road Freight', 1500, 1510, 1520, 4530, 'litre'],
  ['Acme - North', 'Water', 'Withdrawal', 45500, 46500, 47500, 139500, 'litre'],
  ['Acme - South', 'Electricity', 'Grid', 2000, 2100, 2200, 6300, 'kWh'],
  ['Acme - South', 'Trucks', 'Road Freight', 7000, 7100, 7200, 21300, 'km'],
  ['Acme - South', 'Trucks', 'Road Freight', 2500, 2510, 2520, 7530, 'litre'],
  ['Acme - South', 'Water', 'Withdrawal', 0, 0, 0, 0, 'litre'],
];

/** Answers each line by the words of its qualifier, as a model reading the layout would. */
function longModel(asked: string[][]): ExtractionModel {
  return {
    name: 'fake',
    async complete(_system: string, user: string) {
      const lines = JSON.parse(/LINES: (.*)/.exec(user)![1]) as Array<{ key: string; qualifier?: string }>;
      asked.push(lines.map((l) => l.key));
      const reading: Record<string, { measure: string; unit: string }> = {};
      for (const line of lines) {
        const q = line.qualifier ?? '';
        reading[line.key] = /kWh/.test(q) ? { measure: 'energy.electricity_kwh', unit: 'kWh' }
          : /Trucks.*km/.test(q) ? { measure: 'fleet.distance_km', unit: 'km' }
            : /Trucks.*litre/.test(q) ? { measure: 'fleet.diesel_litres', unit: 'L' }
              : /Water/.test(q) ? { measure: 'water.kl', unit: 'L' }
                : { measure: 'none', unit: 'other' };
      }
      return JSON.stringify({ lines_are: 'sites', site: null, first_month_year: null, lines: reading });
    },
  };
}

describe('a long table: one line per site and measure', () => {
  it('names every line by its site, descriptors and unit, so no two lines share an answer', () => {
    const [table] = findMonthTables(LONG_SHEET);
    expect(table.long).toBe(true);
    const keys = table.lines.map(lineKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(table.lines[1]).toMatchObject({ label: 'Acme - North', qualifier: 'Trucks · Road Freight · km', unit: 'km', statedTotal: 15300 });
    expect(table.lines[2].qualifier).toBe('Trucks · Road Freight · litre');
  });

  it('reads each line as its own measure, at its own site — never every line as one measure', async () => {
    const asked: string[][] = [];
    const extraction = await extractEsgMonthlyTables(longModel(asked), {
      filename: `Export ${Date.now()}.xls › Detail`,
      sheetName: 'Detail',
      matrix: LONG_SHEET,
    });
    const rows = extraction?.values.find((v) => v.field === 'esg_monthly_rows')?.value as Array<Record<string, unknown>>;
    const of = (site: string, measure: string) => rows.filter((r) => r.monthly_site === site && r.monthly_measure === measure).map((r) => r.monthly_value);
    expect(of('Acme - South', 'energy.electricity_kwh')).toEqual([2000, 2100, 2200]);
    expect(of('Acme - South', 'fleet.diesel_litres')).toEqual([2500, 2510, 2520]);
    expect(of('Acme - North', 'fleet.distance_km')).toEqual([5000, 5100, 5200]);
    // Litres of water are stored as kilolitres, and the conversion is said.
    expect(of('Acme - North', 'water.kl')).toEqual([45.5, 46.5, 47.5]);
    expect(extraction?.exceptions.some((e) => /stated in L and was stored in kL/.test(e))).toBe(true);
    // The Total column is reported and checked, never read as a month.
    const reported = extraction?.values.find((v) => v.field === 'esg_reported_monthly_rows')?.value as Array<Record<string, unknown>>;
    expect(reported.find((r) => r.reported_kind === 'stated_total' && r.reported_site === 'Acme - South' && r.reported_of_measure === 'fleet.diesel_litres'))
      .toMatchObject({ reported_value: 7530, reported_period_end: '2025-09-30' });
  });

  it('a long table that states no unit for its lines is reported, never read as activity', async () => {
    // An emissions system's monthly page: the same layout as its consumption
    // page, but its figures are emissions and no line states a unit. Asked what
    // each line measures, a model names the activity ("Road Freight" is fleet
    // diesel) and a unit it assumed. 3.1 tonnes of CO2e as 3.1 litres of
    // diesel collided with every depot's real litres.
    const EMISSIONS_SHEET: unknown[][] = [
      ['Emissions detail'],
      ['Node', 'Node Type', 'Datasource', 'Activity', 'Jul 2025', 'Aug 2025', 'Sep 2025', 'Total'],
      ['Acme - North', 'Node', 'Electricity', 'Grid', 1.2, 1.3, 1.4, 3.9],
      ['Acme - North', 'Node', 'Trucks', 'Road Freight', 3.1, 3.2, 3.3, 9.6],
      ['Acme - South', 'Node', 'Electricity', 'Grid', 2.2, 2.3, 2.4, 6.9],
      ['Acme - South', 'Node', 'Trucks', 'Road Freight', 4.1, 4.2, 4.3, 12.6],
    ];
    const model: ExtractionModel = {
      name: 'fake',
      async complete(_system: string, user: string) {
        const lines = JSON.parse(/LINES: (.*)/.exec(user)![1]) as Array<{ key: string; qualifier?: string }>;
        return JSON.stringify({
          lines_are: 'sites', site: null, first_month_year: null,
          lines: Object.fromEntries(lines.map((l) => [l.key, /Trucks/.test(l.qualifier ?? '')
            ? { measure: 'fleet.diesel_litres', unit: 'L' }
            : { measure: 'energy.electricity_kwh', unit: 'kWh' }])),
        });
      },
    };
    const [table] = findMonthTables(EMISSIONS_SHEET);
    expect(table.long).toBe(true);
    const extraction = await extractEsgMonthlyTables(model, {
      filename: `System export ${Date.now()}.xls › Emissions`,
      sheetName: 'Emissions',
      matrix: EMISSIONS_SHEET,
    });
    const rows = (extraction?.values.find((v) => v.field === 'esg_monthly_rows')?.value ?? []) as Array<Record<string, unknown>>;
    expect(rows).toEqual([]);
    const reported = extraction?.values.find((v) => v.field === 'esg_reported_monthly_rows')?.value as Array<Record<string, unknown>>;
    expect(reported.filter((r) => r.reported_site === 'Acme - South' && r.reported_period_end === '2025-07-31').map((r) => r.reported_value).sort())
      .toEqual([2.2, 4.1]);
    expect(extraction?.exceptions.some((e) => /states no unit/.test(e))).toBe(true);
    // The sheet was read: its lines are measures held for want of a unit, so no
    // flat read is sent to guess at the same figures without one.
    expect(readsMonthlyMeasures(extraction)).toBe(false);
    expect(monthlyReadStandsIn(extraction)).toBe(true);
  });

  it('a long table whose unit column states each line\'s unit is still read as activity', async () => {
    const asked: string[][] = [];
    const extraction = await extractEsgMonthlyTables(longModel(asked), {
      filename: `Export units ${Date.now()}.xls › Detail`,
      sheetName: 'Detail',
      matrix: LONG_SHEET,
    });
    expect(extraction?.exceptions.some((e) => /states no unit/.test(e))).toBe(false);
  });

  it('asks about EVERY line of a long table, not the first sixteen', async () => {
    const depots = Array.from({ length: 24 }, (_, i) => [`Depot ${i + 1}`, '', 10 + i, 20 + i, 30 + i]);
    const asked: string[][] = [];
    const model: ExtractionModel = {
      name: 'fake',
      async complete(_system: string, user: string) {
        const lines = JSON.parse(/LINES: (.*)/.exec(user)![1]) as Array<{ key: string }>;
        asked.push(lines.map((l) => l.key));
        return JSON.stringify({
          lines_are: 'sites', site: null, first_month_year: 2025,
          lines: Object.fromEntries(lines.map((l) => [l.key, { measure: 'energy.electricity_kwh', unit: 'kWh' }])),
        });
      },
    };
    const extraction = await extractEsgMonthlyTables(model, {
      filename: `Depots ${Date.now()}.xlsx › kWh`,
      matrix: [['ELECTRICITY'], ['', '', 'JUL', 'AUG', 'SEP'], ...depots],
    });
    expect(asked.flat()).toHaveLength(24);
    const rows = extraction?.values[0].value as Array<Record<string, unknown>>;
    expect(rows.filter((r) => r.monthly_site === 'Depot 24').map((r) => r.monthly_value)).toEqual([33, 43, 53]);
  });
});

describe('what a monthly table prints beside its measures', () => {
  const answer = (lines: Record<string, { measure: string; unit: string }>, site: string | null = null): ExtractionModel => ({
    name: 'fake',
    async complete() {
      return JSON.stringify({ lines_are: site ? 'measures' : 'sites', site, first_month_year: 2025, lines });
    },
  });

  it('reports the AMOUNT beside each month as money, and keeps the landlord beside each figure', async () => {
    const extraction = await extractEsgMonthlyTables(answer({
      'ACME FOODS - NORTHGATE|LANDLORD A': { measure: 'energy.electricity_kwh', unit: 'kWh' },
      'ACME FOODS - SOUTHPORT|LANDLORD B': { measure: 'energy.electricity_kwh', unit: 'kWh' },
    }), { filename: `Dash ${Date.now()}.xlsx › electricity`, matrix: ELECTRICITY_SHEET });
    const rows = extraction?.values.find((v) => v.field === 'esg_monthly_rows')?.value as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ monthly_site: 'ACME FOODS - NORTHGATE', monthly_value: 1000, monthly_qualifier: 'LANDLORD A' });
    const reported = extraction?.values.find((v) => v.field === 'esg_reported_monthly_rows')?.value as Array<Record<string, unknown>>;
    const money = reported.filter((r) => r.reported_kind === 'money' && r.reported_site === 'ACME FOODS - SOUTHPORT');
    expect(money.map((r) => r.reported_value)).toEqual([6000, 6300, 6600]);
    expect(money[0].reported_unit).toBe('AMOUNT');
    // The printed total row: reported, checked against the lines (it agrees).
    expect(reported.filter((r) => r.reported_kind === 'stated_total' && r.reported_of_measure === 'energy.electricity_kwh').map((r) => r.reported_value))
      .toEqual([3000, 3200, 3400]);
    expect(extraction?.exceptions.some((e) => /does not equal its lines/.test(e))).toBe(false);
  });

  it('reports a cost line and a tonnage line as printed, in the unit printed, and drops nothing', async () => {
    const extraction = await extractEsgMonthlyTables(answer({
      'KM\'S|': { measure: 'fleet.distance_km', unit: 'km' },
      'COST|': { measure: 'none', unit: 'other' },
      'WEIGHT|TONNE': { measure: 'none', unit: 't' },
    }, 'ACME FOODS - NORTHGATE'), {
      filename: `Dash ${Date.now()}.xlsx › car`,
      matrix: [
        ['POOL CAR'],
        ['ACME FOODS - NORTHGATE', '', 'JUL', 'AUG', 'SEP'],
        ['KM\'S', '', 1700, 1500, 1300],
        ['COST', '', 1234.5, 2345.75, 0],
        ['WEIGHT', 'TONNE', 12.5, 13.25, 14],
      ],
    });
    const reported = extraction?.values.find((v) => v.field === 'esg_reported_monthly_rows')?.value as Array<Record<string, unknown>>;
    expect(reported.filter((r) => r.reported_kind === 'money').map((r) => r.reported_value)).toEqual([1234.5, 2345.75, 0]);
    expect(reported.filter((r) => r.reported_kind === 'mass')).toHaveLength(3);
    expect(reported.find((r) => r.reported_kind === 'mass')).toMatchObject({ reported_unit: 'TONNE', reported_value: 12.5, reported_site: 'ACME FOODS - NORTHGATE' });
    expect(reported.find((r) => r.reported_kind === 'title')?.reported_value).toBe('POOL CAR');
  });

  it('says when a printed total row does not add up, and never reads it', async () => {
    const extraction = await extractEsgMonthlyTables(answer({
      'ACME FOODS - NORTHGATE|LT': { measure: 'fleet.diesel_litres', unit: 'L' },
      'ACME FOODS - SOUTHPORT|LT': { measure: 'fleet.diesel_litres', unit: 'L' },
      'ACME FOODS|DIST KM': { measure: 'fleet.distance_km', unit: 'km' },
    }), { filename: `Dash ${Date.now()}.xlsx › fuel`, matrix: FUEL_SHEET.slice(0, 6) });
    // The lines read are two measures, so the total is reported without one and not checked.
    const reported = extraction?.values.find((v) => v.field === 'esg_reported_monthly_rows')?.value as Array<Record<string, unknown>>;
    expect(reported.some((r) => r.reported_kind === 'stated_total' && r.reported_value === 3)).toBe(true);
    const rows = extraction?.values.find((v) => v.field === 'esg_monthly_rows')?.value as Array<Record<string, unknown>>;
    expect(rows.some((r) => r.monthly_value === 3)).toBe(false);

    const checked = await extractEsgMonthlyTables(answer({
      'ACME FOODS - NORTHGATE|LT': { measure: 'fleet.diesel_litres', unit: 'L' },
      'ACME FOODS - SOUTHPORT|LT': { measure: 'fleet.diesel_litres', unit: 'L' },
    }), { filename: `Dash ${Date.now()}.xlsx › fuel`, matrix: FUEL_SHEET.slice(0, 5) });
    expect(checked?.exceptions.find((e) => /does not equal its lines/.test(e))).toMatch(/jul \(total 3, lines 300\)/);
  });

  it('a table of nothing but money is reported, and does not stand in for the sheet\'s other readers', async () => {
    const extraction = await extractEsgMonthlyTables(answer({ 'NORTHGATE|R': { measure: 'none', unit: 'other' } }), {
      filename: `Dash ${Date.now()}.xlsx › rands`,
      matrix: [['FUEL RANDS'], ['', '', 'JUL', 'AUG', 'SEP'], ['NORTHGATE', 'R', 100.5, 200.25, 300]],
    });
    expect(extraction?.values.map((v) => v.field)).toEqual(['esg_reported_monthly_rows']);
    expect(readsMonthlyMeasures(extraction)).toBe(false);
    expect(monthlyReadStandsIn(extraction)).toBe(false);
  });
});

describe('statedKind', () => {
  it('reads what a figure is from the words printed beside it, first word first', () => {
    expect(statedKind('R')).toEqual({ kind: 'money', unit: 'R' });
    expect(statedKind('', 'COST/AMOUNT')).toEqual({ kind: 'money', unit: 'COST/AMOUNT' });
    expect(statedKind('WEIGHT', 'TONNE')).toEqual({ kind: 'mass', unit: 'WEIGHT' });
    expect(statedKind('CASES')).toEqual({ kind: 'count', unit: 'CASES' });
    expect(statedKind('SUBMITTED DATE')).toEqual({ kind: 'date', unit: 'SUBMITTED DATE' });
    expect(statedKind('NORTHGATE', '')).toEqual({ kind: 'other', unit: '' });
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
      monthly_qualifier: 'LT',
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

describe('the case read of a sheet whose long table states no unit', () => {
  const EMISSIONS_PAGE: unknown[][] = [
    ['Emissions detail'],
    ['Node', 'Node Type', 'Datasource', 'Activity', 'Jul 2025', 'Aug 2025', 'Sep 2025', 'Total'],
    ['Acme - North', 'Node', 'Electricity', 'Grid', 1.2, 1.3, 1.4, 3.9],
    ['Acme - North', 'Node', 'Trucks', 'Road Freight', 3.1, 3.2, 3.3, 9.6],
    ['Acme - South', 'Node', 'Electricity', 'Grid', 2.2, 2.3, 2.4, 6.9],
    ['Acme - South', 'Node', 'Trucks', 'Road Freight', 4.1, 4.2, 4.3, 12.6],
  ];
  const sheet = (name: string, matrix: unknown[][]) => ({
    file_id: name,
    filename: `System export.xls › ${name}`,
    mime_type: 'application/vnd.ms-excel',
    raw_text: '',
    markdown: matrix.map((row) => `| ${row.join(' | ')} |`).join('\n'),
    tables: [{ sheetName: name, rows: [], matrix }],
    metadata: { sheet_name: name, parent_file: 'System export.xls' },
  });

  it('sends no flat read to guess the unit again: the monthly reader has read the sheet', async () => {
    const { extractEsgCaseEntities } = await import('../../src/services/esgCaseExtraction.js');
    const prompts: string[] = [];
    const fake: ExtractionModel = {
      name: 'fake',
      async complete(system: string, user: string) {
        prompts.push(`${system}\n${user}`);
        if (/LINES: /.test(user)) {
          const lines = JSON.parse(/LINES: (.*)/.exec(user)![1]) as Array<{ key: string; qualifier?: string }>;
          return JSON.stringify({
            lines_are: 'sites', site: null, first_month_year: null,
            lines: Object.fromEntries(lines.map((l) => [l.key, /Trucks/.test(l.qualifier ?? '')
              ? { measure: 'fleet.diesel_litres', unit: 'L' }
              : { measure: 'energy.electricity_kwh', unit: 'kWh' }])),
          });
        }
        return '{}';
      },
    };
    const result = await extractEsgCaseEntities([sheet(`Emissions ${Date.now()}`, EMISSIONS_PAGE)] as never, fake);
    expect(prompts.filter((p) => /ANALYST INSTRUCTION/.test(p))).toEqual([]);
    const rows = result!.extractions.flatMap((e) => e.values).filter((v) => v.field === 'esg_monthly_rows');
    expect(rows).toEqual([]);
  });
});
