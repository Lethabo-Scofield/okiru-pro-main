/**
 * A depot's fuel report keeps a tab per vehicle: its fills by date, the
 * vehicle named once in the tab's name and title. Each fill must reach the
 * calculator as that vehicle's, on its date. Synthetic data.
 */
import { describe, expect, it } from 'vitest';
import { fillsOfVehicle, vehicleOfSheet } from '../../src/services/esgPeriodSummaries.js';
import { resolveCaseEntities } from '../../src/services/entityResolution.js';
import {
  ESG_REGISTER_FIELDS,
  esgFieldElementIndex,
  mapEsgEntitiesToCalculator,
} from '../../src/services/esgEntityCalculatorMapping.js';
import { extractEsgSheetTable } from '../../src/services/esgSheetTableExtraction.js';
import type { DocumentExtraction, ExtractionModel } from '../../src/services/aiExtraction.js';

/** Decisions are remembered per process: a fresh template name per run keeps this test's own. */
const TEMPLATE_RUN = Date.now();

const TAB_TITLE: unknown[][] = [
  ['Summary'],
  ['', 'AcmeGroup', 'Northgate'],
  ['', 'Daily Diesel Control', '', 'LONG HAUL', 'AB45CDGP', 'Hino 500 1626 16T', 46081],
  ['Date', 'Depot', 'O.No', 'Opening Ode Reading', 'Ode Reading', 'Km.', 'Internal fuel'],
];

describe('vehicleOfSheet', () => {
  it("reads the vehicle from a tab whose name is a registration its title repeats", () => {
    expect(vehicleOfSheet('AB45CDGP', TAB_TITLE)).toBe('AB45CDGP');
    // Spaced on the tab, run together in the title: the same plate.
    expect(vehicleOfSheet('AB 45 CD GP', TAB_TITLE)).toBe('AB 45 CD GP');
  });

  it('never takes a sheet that only looks like one — no title names it', () => {
    expect(vehicleOfSheet('Sheet2', TAB_TITLE)).toBeNull();
    expect(vehicleOfSheet('Detail3', [['Detail3 summary'], ['Name', 'Value']])).toBeNull();
    expect(vehicleOfSheet('XY12ZZGP', TAB_TITLE)).toBeNull();
    expect(vehicleOfSheet('Daily Summary', TAB_TITLE)).toBeNull();
  });

  it('never takes a period or a page for a vehicle, even when its title repeats it', () => {
    for (const name of ['FY2025', 'Q1-2026', 'Mar26', 'Sheet2', 'Week14', 'Rev2']) {
      expect(vehicleOfSheet(name, [[name], ['Date', 'Litres']]), name).toBeNull();
    }
  });
});

describe('a tab per vehicle', () => {
  it('is one question, asked once: twenty tabs of a template share its answers', async () => {
    const calls: string[] = [];
    const model: ExtractionModel = {
      name: 'fake',
      async complete(system: string) {
        calls.push(system.includes('"register"') ? 'register' : 'columns');
        return system.includes('"register"')
          ? '{"register": "fleet__fuel_card_statement"}'
          : '{"Date": "transaction_date", "Ode Reading": "odometer_reading", "Total liters": "fuel_litres"}';
      },
    };
    const tab = (plate: string) => ({
      filename: `DIESEL LOG.xlsx › ${plate}`,
      sheetName: plate,
      template: `Vehicle fuel log ${TEMPLATE_RUN}`,
      rows: [
        { Date: '02-03-2026', 'Ode Reading': 301240, 'Total liters': 152 },
        { Date: '05-03-2026', 'Ode Reading': 301795, 'Total liters': 171 },
      ],
    });
    const first = await extractEsgSheetTable(model, tab('AB45CDGP'));
    const second = await extractEsgSheetTable(model, tab('AB46CDGP'));
    expect(calls).toEqual(['register', 'columns']);
    // Each tab is still its own document, its rows its own.
    expect(first?.sourceFile).toBe('DIESEL LOG.xlsx › AB45CDGP');
    expect(second?.sourceFile).toBe('DIESEL LOG.xlsx › AB46CDGP');
    expect((second?.values[0].value as unknown[]).length).toBe(2);
  });
});

describe('fillsOfVehicle', () => {
  it("makes each fill the log's vehicle, and leaves its Totals line alone", () => {
    const rows = fillsOfVehicle([
      { transaction_date: '02-03-2026', fuel_litres: 152 },
      { transaction_date: 46091, fuel_litres: 139 },
      // A fill that already names its vehicle keeps it.
      { transaction_date: '05-03-2026', fuel_litres: 171, vehicle_registration: 'XY99ZZGP' },
      // The log's own total: the sum of the fills, not one more of them.
      { transaction_date: 'Totals', fuel_litres: 462 },
    ], 'AB45CDGP') as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.vehicle_registration)).toEqual(['AB45CDGP', 'AB45CDGP', 'XY99ZZGP', undefined]);
  });
});

describe('fill dates', () => {
  it("reads a date-formatted cell's day number as the date it shows", () => {
    const extraction: DocumentExtraction = {
      documentId: 'fleet__fuel_card_statement',
      documentName: 'AB45CDGP register',
      element: 'FLEET',
      sourceFile: 'DIESEL LOG.xlsx › AB45CDGP',
      values: [{
        field: 'fleet_fuel_transaction_rows',
        value: [
          { vehicle_registration: 'AB45CDGP', transaction_date: '02-03-2026', odometer_reading: 301240, fuel_litres: 152 },
          // 46090 is how Excel stores 9 March 2026.
          { vehicle_registration: 'AB45CDGP', transaction_date: 46090, odometer_reading: 302257, fuel_litres: 139 },
          // A number that cannot be a day this century is not taken for one.
          { vehicle_registration: 'AB45CDGP', transaction_date: 2026, odometer_reading: 302955, fuel_litres: 156 },
        ],
        sourceFile: 'DIESEL LOG.xlsx › AB45CDGP',
        sourceDocumentId: 'fleet__fuel_card_statement',
      }],
      missingFields: [],
      unexpectedFields: [],
      exceptions: [],
    };
    const resolved = resolveCaseEntities([extraction], { allFiles: ['DIESEL LOG.xlsx'], additiveFields: ESG_REGISTER_FIELDS });
    const rows = mapEsgEntitiesToCalculator(resolved, esgFieldElementIndex([extraction])).rows
      .filter((r) => r.grid === 'fleet_fuel_transaction_rows');
    expect(rows.map((r) => r.cells['fleet.transaction_date'] ?? null)).toEqual(['2026-03-02', '2026-03-09', null]);
    expect(rows[2].droppedFields).toContain('transaction_date');
  });
});
