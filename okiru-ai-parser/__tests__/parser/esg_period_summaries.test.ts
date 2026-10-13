/**
 * One-period summary sheets (a depot's monthly fuel report), registers that
 * add up across sheets, and the sheet facts the readers need. Synthetic data.
 */
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { extractEsgPeriodSummary, sumPeriodMatrix, sumPeriodRows, topOfSheetIsDated } from '../../src/services/esgPeriodSummaries.js';
import { resolveCaseEntities, ROW_PERIOD_KEY, ROW_SOURCE_KEY } from '../../src/services/entityResolution.js';
import { splitWorkbookIntoSheets } from '../../src/services/workbookSheetSplit.js';
import type { DocumentExtraction, ExtractionModel } from '../../src/services/aiExtraction.js';

const REPORT_MATRIX: unknown[][] = [
  ['Daily and monthly diesel control Northgate', '', '', ' ', '', '', '', 46082],
  ['diesel price'],
  [18.27, '', 'Fuel consumption'],
  ['', '', "Kilo's done", 'Internal', 'External'],
  ['Number', 'Make', 'this month', 'Fuel', 'Fuel', 'Total liters'],
  ['AB12CDGP', 'Hino 500', 6340, 1621, 0, 1621],
  ['AB34EFGP', 'Hino 500', 5290, 1418, 300, 1718],
  ['AB56GHGP', 'Hino 500', 0, 0, 0, 0],
  // The sheet's own total row: no registration (a ditto-filling reader gives it the one above).
  ['', '', 11630, 3039, 300, 3339],
  ['External Vehicles', '', '', 597],
  ['Bowser size'],
  ['Isuzu KB250', 'M.A.N. 15.223'],
  [3, 10, 10, 10, 10, 7.99],
];

const REPORT_ROWS: Array<Record<string, unknown>> = [
  { Number: 'AB12CDGP', Make: 'Hino 500', 'this month': 6340, 'Internal Fuel': 1621, 'External Fuel': 0, 'Total liters': 1621 },
  { Number: 'AB34EFGP', Make: 'Hino 500', 'this month': 5290, 'Internal Fuel': 1418, 'External Fuel': 300, 'Total liters': 1718 },
  { Number: 'AB56GHGP', Make: 'Hino 500', 'this month': 0, 'Internal Fuel': 0, 'External Fuel': 0, 'Total liters': 0 },
  // The sheet's own total row, then other business below it.
  { 'this month': 11630, 'Internal Fuel': 3039, 'External Fuel': 300, 'Total liters': 3339 },
  { Number: 'External Vehicles', 'Internal Fuel': 597 },
  { Number: 'Bowser size', Make: 'Isuzu', 'this month': 3, 'Total liters': 7.99 },
];

describe('topOfSheetIsDated', () => {
  it('sees a report dated in its title rows, and not a sheet per vehicle', () => {
    expect(topOfSheetIsDated(REPORT_MATRIX)).toBe(true);
    expect(topOfSheetIsDated([['Report for March 2026']])).toBe(true);
    expect(topOfSheetIsDated([['Fleet Number:-'], ['Registration Number:-'], ['Manufacturers Spec:-']])).toBe(false);
  });
});

describe('sumPeriodRows', () => {
  it("adds the rows up to the sheet's own total, and keeps that total to check against", () => {
    expect(sumPeriodRows(REPORT_ROWS, 'Number', 'Total liters')).toEqual({ sum: 3339, counted: 3, statedTotal: 3339 });
  });

  it('never counts what follows the total — the external line, a lookup table', () => {
    const { sum } = sumPeriodRows(REPORT_ROWS, 'Number', 'Total liters');
    expect(sum).not.toBe(3339 + 7.99);
  });

  it('reads the rows under a total stated above them ("TOTAL TO BE INVOICED")', () => {
    const rows = [
      { 'BUSINESS UNIT': 'TOTAL TO BE INVOICED:-', LITERS: 597 },
      { DATE: '04-03-2026', 'REG NR': 'XY75ZZGP', LITERS: 116 },
      { DATE: '05-03-2026', 'REG NR': 'XY75ZZGP', LITERS: 267 },
      { DATE: '31-03-2026', 'REG NR': 'XY75ZZGP', LITERS: 214 },
      { 'BUSINESS UNIT': 'NORTHGATE', 'R/LT': 18.27 },
    ];
    expect(sumPeriodRows(rows, 'REG NR', 'LITERS')).toEqual({ sum: 597, counted: 3, statedTotal: 597 });
  });
});

describe('extractEsgPeriodSummary', () => {
  const answer = (over: Record<string, unknown> = {}): ExtractionModel => ({
    name: 'fake',
    async complete() {
      return JSON.stringify({
        single_period: true,
        covers: 'site',
        site: 'Northgate',
        period_month: '2026-03',
        label_column: 'Number',
        quantity_column: 'Total liters',
        measure: 'fleet.diesel_litres',
        unit: 'L',
        ...over,
      });
    },
  });

  it("states the depot's diesel for the month, added up by the code", async () => {
    const extraction = await extractEsgPeriodSummary(answer(), {
      filename: 'DIESEL REPORT.xlsx › Daily Summary',
      sheetName: `Daily Summary ${Date.now()}`,
      matrix: REPORT_MATRIX,
      rows: REPORT_ROWS,
    });
    expect(extraction?.values[0]).toMatchObject({
      field: 'esg_monthly_rows',
      value: [{
        monthly_measure: 'fleet.diesel_litres',
        monthly_site: 'Northgate',
        monthly_period_end: '2026-03-31',
        monthly_value: 3339,
        monthly_unit: 'L',
      }],
    });
  });

  it('reports a total row that does not match the rows, and uses the rows', async () => {
    const matrix = REPORT_MATRIX.map((row) => (row[0] === '' && row[5] === 3339 ? ['', '', 11630, 3039, 300, 3] : row));
    const extraction = await extractEsgPeriodSummary(answer(), {
      filename: 'DIESEL REPORT.xlsx › Daily Summary',
      sheetName: `Daily Summary bad total ${Date.now()}`,
      matrix,
      rows: REPORT_ROWS,
    });
    expect((extraction?.values[0].value as Array<Record<string, unknown>>)[0].monthly_value).toBe(3339);
    expect(extraction?.exceptions.some((e) => /total says 3, but its rows add to 3339/.test(e))).toBe(true);
  });

  it("sums the raw cells, so a ditto-filled total row cannot carry on into what follows", () => {
    expect(sumPeriodMatrix(REPORT_MATRIX, 'Number', 'Total liters')).toEqual({ sum: 3339, counted: 3, statedTotal: 3339 });
  });

  it('keeps the vehicles too: each one\'s litres beside the kilometres it drove, stamped with the month', async () => {
    const extraction = await extractEsgPeriodSummary(answer({ distance_column: 'this month', model_column: 'Make' }), {
      filename: 'DIESEL REPORT.xlsx › Daily Summary',
      sheetName: `Daily Summary vehicles ${Date.now()}`,
      matrix: REPORT_MATRIX,
      rows: REPORT_ROWS,
    });
    const fleet = extraction?.values.find((v) => v.field === 'fleet_vehicle_rows');
    // Exactly the rows the depot's 3,339 L is made of: not the total row, not what follows it.
    expect(fleet?.value).toEqual([
      { vehicle_registration: 'AB12CDGP', monthly_litres: 1621, monthly_km: 6340, vehicle_make_model: 'Hino 500', depot_name: 'Northgate', [ROW_PERIOD_KEY]: '2026-03' },
      { vehicle_registration: 'AB34EFGP', monthly_litres: 1718, monthly_km: 5290, vehicle_make_model: 'Hino 500', depot_name: 'Northgate', [ROW_PERIOD_KEY]: '2026-03' },
      { vehicle_registration: 'AB56GHGP', monthly_litres: 0, monthly_km: 0, vehicle_make_model: 'Hino 500', depot_name: 'Northgate', [ROW_PERIOD_KEY]: '2026-03' },
    ]);
    // The depot's figure is unchanged by it.
    expect(extraction?.values[0]).toMatchObject({ field: 'esg_monthly_rows', value: [{ monthly_value: 3339 }] });
    expect(extraction?.exceptions.some((e) => /3 vehicle\(s\) read with their own 2026-03 figures, 3 with both/.test(e))).toBe(true);
  });

  it("reads a vehicle's norm as its norm, and never its measured rate as one", async () => {
    const matrix: unknown[][] = [
      ['Daily and monthly diesel control Northgate', '', '', '', '', 46082],
      ['Number', 'this month', 'Total liters', 'L/100km', '100km'],
      ['AB12CDGP', 6340, 1621, 25.567823, 26.5],
      ['AB34EFGP', 5290, 1718, 32.476371, 26.5],
      ['', 11630, 3339],
    ];
    const rows = [
      { Number: 'AB12CDGP', 'this month': 6340, 'Total liters': 1621, 'L/100km': 25.567823, '100km': 26.5 },
      { Number: 'AB34EFGP', 'this month': 5290, 'Total liters': 1718, 'L/100km': 32.476371, '100km': 26.5 },
    ];
    const read = (over: Record<string, unknown>) => extractEsgPeriodSummary(answer({ distance_column: 'this month', ...over }), {
      filename: 'DIESEL REPORT.xlsx › Daily Summary', sheetName: `norms ${JSON.stringify(over)} ${Date.now()}`, matrix, rows,
    });
    const norms = (e: Awaited<ReturnType<typeof read>>) =>
      (e?.values.find((v) => v.field === 'fleet_vehicle_rows')?.value as Array<Record<string, unknown>>).map((r) => r.l_per_100km_norm);

    expect(norms(await read({ norm_column: '100km', rate_column: 'L/100km' }))).toEqual([26.5, 26.5]);
    // The model named the measured column the norm: the code sees it is litres over kilometres.
    const wrong = await read({ norm_column: 'L/100km' });
    expect(norms(wrong)).toEqual([undefined, undefined]);
    expect(wrong?.exceptions.some((e) => /"L\/100km" is each vehicle's measured rate/.test(e))).toBe(true);
    // Named as both, it is the rate.
    expect(norms(await read({ norm_column: 'L/100km', rate_column: 'L/100km' }))).toEqual([undefined, undefined]);
  });

  it('never reads an odometer column as the kilometres driven in the month', async () => {
    const odometer = REPORT_MATRIX.map((row) => (typeof row[2] === 'number' && row[0] ? [...row.slice(0, 2), 217_515 + Number(row[2]), ...row.slice(3)] : row));
    const extraction = await extractEsgPeriodSummary(answer({ distance_column: 'this month' }), {
      filename: 'DIESEL REPORT.xlsx › Daily Summary',
      sheetName: `Daily Summary odometer ${Date.now()}`,
      matrix: odometer,
      rows: REPORT_ROWS,
    });
    const rows = extraction?.values.find((v) => v.field === 'fleet_vehicle_rows')?.value as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.monthly_km)).toEqual([undefined, undefined, undefined]);
    expect(rows.map((r) => r.monthly_litres)).toEqual([1621, 1718, 0]);
    expect(extraction?.exceptions.some((e) => /holds odometer readings/.test(e))).toBe(true);
  });

  it('reads no vehicles from a site summary that is not the fleet\'s (meters on an electricity report)', async () => {
    const extraction = await extractEsgPeriodSummary(answer({ measure: 'energy.electricity_kwh', unit: 'kWh', quantity_column: 'Total liters' }), {
      filename: 'meters.xlsx › March', sheetName: `meters ${Date.now()}`, matrix: REPORT_MATRIX, rows: REPORT_ROWS,
    });
    expect(extraction?.values.map((v) => v.field)).toEqual(['esg_monthly_rows']);
  });

  it("reads nothing from one vehicle's own log — that is the vehicle's month, not the depot's", async () => {
    const extraction = await extractEsgPeriodSummary(answer({ covers: 'one' }), {
      filename: 'DIESEL REPORT.xlsx › AB12CDGP', sheetName: `vehicle ${Date.now()}`, matrix: REPORT_MATRIX, rows: REPORT_ROWS,
    });
    expect(extraction).toBeNull();
  });

  it('reads nothing from a sheet the model says is not one period, or a column it did not offer', async () => {
    const notOne = await extractEsgPeriodSummary(answer({ single_period: false }), {
      filename: 'x.xlsx › s', sheetName: `not-one ${Date.now()}`, matrix: REPORT_MATRIX, rows: REPORT_ROWS,
    });
    expect(notOne).toBeNull();
    const invented = await extractEsgPeriodSummary(answer({ quantity_column: 'Litres (invented)' }), {
      filename: 'x.xlsx › s', sheetName: `invented ${Date.now()}`, matrix: REPORT_MATRIX, rows: REPORT_ROWS,
    });
    expect(invented).toBeNull();
  });
});

describe('resolveCaseEntities — registers add up across documents', () => {
  const sheet = (file: string, rows: Array<Record<string, unknown>>): DocumentExtraction => ({
    documentId: 'register',
    documentName: 'register',
    sourceFile: file,
    values: [{ field: 'fleet_vehicle_rows', value: rows, sourceFile: file, sourceDocumentId: 'register' }],
    missingFields: [],
    unexpectedFields: [],
    exceptions: [],
  });

  it("concatenates two sheets' rows, each naming its file, instead of holding the register as a conflict", () => {
    const resolved = resolveCaseEntities(
      [sheet('Fleet.xlsx › North', [{ reg: 'A1' }, { reg: 'A2' }]), sheet('Fleet.xlsx › South', [{ reg: 'B1' }])],
      { additiveFields: new Set(['fleet_vehicle_rows']) },
    );
    const field = resolved.fields.fleet_vehicle_rows;
    expect(field.conflicted).toBe(false);
    expect(field.value).toEqual([
      { reg: 'A1', [ROW_SOURCE_KEY]: 'Fleet.xlsx › North' },
      { reg: 'A2', [ROW_SOURCE_KEY]: 'Fleet.xlsx › North' },
      { reg: 'B1', [ROW_SOURCE_KEY]: 'Fleet.xlsx › South' },
    ]);
  });

  it('keeps one copy of a row two files state identically, and both copies of a row one file repeats', () => {
    const resolved = resolveCaseEntities(
      [sheet('a.xlsx', [{ reg: 'A1' }, { reg: 'A1' }]), sheet('b.xlsx', [{ reg: 'A1' }])],
      { additiveFields: new Set(['fleet_vehicle_rows']) },
    );
    expect((resolved.fields.fleet_vehicle_rows.value as unknown[]).length).toBe(2);
  });

  it('leaves every other field — and the B-BBEE path, which passes no option — exactly as before', () => {
    const resolved = resolveCaseEntities([sheet('a.xlsx', [{ reg: 'A1' }]), sheet('b.xlsx', [{ reg: 'B1' }])]);
    expect(resolved.fields.fleet_vehicle_rows.conflicted).toBe(true);
  });
});

describe('splitWorkbookIntoSheets — what the readers need from a sheet', () => {
  function workbook(): Buffer {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ['', '', 'Internal', 'External'],
      ['Number', 'Make', 'Fuel', 'Fuel'],
      ['AB12', 'Hino', 100, 20],
      ['AB34', 'Hino', 200, 0],
    ]), 'Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name', 'Value'], ['a', 1], ['b', 2]]), 'Scratch');
    wb.Workbook = { Sheets: [{ name: 'Summary', Hidden: 0 }, { name: 'Scratch', Hidden: 1 }] };
    return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  }

  it('names two columns that share a label by the label above them, instead of losing one', () => {
    const [summary] = splitWorkbookIntoSheets(workbook());
    expect(summary.rows[0]).toMatchObject({ Number: 'AB12', 'Internal Fuel': 100, 'External Fuel': 20 });
  });

  it('carries the layout and whether the sheet is hidden', () => {
    const [summary, scratch] = splitWorkbookIntoSheets(workbook());
    expect(summary.hidden).toBe(false);
    expect(scratch.hidden).toBe(true);
    expect(summary.matrix?.[1]).toEqual(['Number', 'Make', 'Fuel', 'Fuel']);
  });
});
