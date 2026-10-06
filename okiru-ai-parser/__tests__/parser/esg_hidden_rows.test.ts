/**
 * A register row read from a hidden sheet says so all the way to the
 * calculator, so the workbook can let it enrich a record but not add one.
 */
import { describe, expect, it } from 'vitest';
import { ROW_HIDDEN_KEY, ROW_PERIOD_KEY, resolveCaseEntities } from '../../src/services/entityResolution.js';
import {
  ESG_REGISTER_FIELDS,
  esgFieldElementIndex,
  mapEsgEntitiesToCalculator,
} from '../../src/services/esgEntityCalculatorMapping.js';
import type { DocumentExtraction } from '../../src/services/aiExtraction.js';

const register = (file: string, rows: Array<Record<string, unknown>>): DocumentExtraction => ({
  documentId: 'fleet__vehicle_register',
  documentName: 'Fleet register',
  element: 'FLEET',
  sourceFile: file,
  values: [{ field: 'fleet_vehicle_rows', value: rows, sourceFile: file, sourceDocumentId: 'fleet__vehicle_register' }],
  missingFields: [],
  unexpectedFields: [],
  exceptions: [],
});

describe('hidden register rows', () => {
  it('carry their flag to the calculator row, and only theirs', () => {
    const extractions = [
      register('Fleet.xlsx › DATA', [{ vehicle_registration: 'LB45BXGP', gvm_kg: 26000 }]),
      register('Fleet.xlsx › Sheet2', [{ vehicle_registration: 'OLD001GP', gvm_kg: 9000, [ROW_HIDDEN_KEY]: true }]),
    ];
    const resolved = resolveCaseEntities(extractions, { allFiles: ['Fleet.xlsx'], additiveFields: ESG_REGISTER_FIELDS });
    const calculator = mapEsgEntitiesToCalculator(resolved, esgFieldElementIndex(extractions));
    const rows = calculator.rows.filter((r) => r.grid === 'fleet_vehicle_rows');
    expect(rows.map((r) => [r.cells['fleet.vehicle_registration'], r.hidden === true])).toEqual([
      ['LB45BXGP', false],
      ['OLD001GP', true],
    ]);
    expect(rows.every((r) => !r.droppedFields.includes(ROW_HIDDEN_KEY))).toBe(true);
  });
});

describe("a month's register rows", () => {
  it('carry the month they cover to the calculator row, and never as a field of their own', () => {
    const extractions = [
      register('Fleet.xlsx › DATA', [{ vehicle_registration: 'LB45BXGP', gvm_kg: 26000 }]),
      register('DIESEL REPORT.xlsx › Daily Summary', [
        { vehicle_registration: 'LB45BXGP', monthly_km: 5290, monthly_litres: 1718, [ROW_PERIOD_KEY]: '2026-03' },
        { vehicle_registration: 'LB45BMGP', monthly_km: 4246, monthly_litres: 1462, [ROW_PERIOD_KEY]: 'March' },
      ]),
    ];
    const resolved = resolveCaseEntities(extractions, { allFiles: ['Fleet.xlsx', 'DIESEL REPORT.xlsx'], additiveFields: ESG_REGISTER_FIELDS });
    const calculator = mapEsgEntitiesToCalculator(resolved, esgFieldElementIndex(extractions));
    const rows = calculator.rows.filter((r) => r.grid === 'fleet_vehicle_rows');
    // A month that is not "YYYY-MM" is not a month the workbook can pair on.
    expect(rows.map((r) => [r.cells['fleet.vehicle_registration'], r.period ?? null])).toEqual([
      ['LB45BXGP', null],
      ['LB45BXGP', '2026-03'],
      ['LB45BMGP', null],
    ]);
    expect(rows.every((r) => !r.droppedFields.includes(ROW_PERIOD_KEY))).toBe(true);
    expect(rows[1].cells).toMatchObject({ 'fleet.monthly_km': 5290, 'fleet.monthly_litres': 1718 });
  });
});
