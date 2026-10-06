/**
 * A register row read from a hidden sheet says so all the way to the
 * calculator, so the workbook can let it enrich a record but not add one.
 */
import { describe, expect, it } from 'vitest';
import { ROW_HIDDEN_KEY, resolveCaseEntities } from '../../src/services/entityResolution.js';
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
      register('Fleet.xlsx › DATA', [{ vehicle_registration: 'AB34EFGP', gvm_kg: 26000 }]),
      register('Fleet.xlsx › Sheet2', [{ vehicle_registration: 'OLD001GP', gvm_kg: 9000, [ROW_HIDDEN_KEY]: true }]),
    ];
    const resolved = resolveCaseEntities(extractions, { allFiles: ['Fleet.xlsx'], additiveFields: ESG_REGISTER_FIELDS });
    const calculator = mapEsgEntitiesToCalculator(resolved, esgFieldElementIndex(extractions));
    const rows = calculator.rows.filter((r) => r.grid === 'fleet_vehicle_rows');
    expect(rows.map((r) => [r.cells['fleet.vehicle_registration'], r.hidden === true])).toEqual([
      ['AB34EFGP', false],
      ['OLD001GP', true],
    ]);
    expect(rows.every((r) => !r.droppedFields.includes(ROW_HIDDEN_KEY))).toBe(true);
  });
});
