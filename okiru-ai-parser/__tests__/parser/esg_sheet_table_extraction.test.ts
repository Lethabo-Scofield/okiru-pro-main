/**
 * ESG registers that arrive as a SPREADSHEET.
 *
 * The failure this prevents: a 134-vehicle fleet register handed to the model
 * as markdown comes back with some of its rows. Transcription is the one job a
 * language model does unreliably, and it is the one job the code has already
 * done — the workbook split parses every sheet into header-keyed rows before
 * the model is called.
 *
 * So the model here answers ONE question (which column means which field) and
 * the code applies that answer to every row. These tests pin the property that
 * matters: N rows in, N rows out, values verbatim, no model transcription
 * anywhere in the path.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';
import {
  chooseEsgSheetGrid,
  esgSheetNameOf,
  extractEsgSheetTable,
} from '../../src/services/esgSheetTableExtraction.js';
import { resetDecisionCacheForTest } from '../../src/services/semanticDecisionCache.js';

/** A model that answers the column-mapping question and nothing else. */
function mappingModel(mapping: Record<string, string>, onCall?: () => void): ExtractionModel {
  const complete = vi.fn(async () => {
    onCall?.();
    return JSON.stringify(mapping);
  });
  return { complete, completeHard: complete } as unknown as ExtractionModel;
}

/** A 134-vehicle fleet register, exactly the size where transcription fails. */
function fleetRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    Reg: `AB${String(i).padStart(3, '0')}GP`,
    Depot: i % 2 === 0 ? 'ISANDO' : 'DBN',
    'Model/Category': 'HINO 500 1627',
    'Monthly km': 1000 + i,
    'Monthly Litres': 300 + i,
  }));
}

const FLEET_MAPPING = {
  Reg: 'vehicle_registration',
  Depot: 'depot_name',
  'Model/Category': 'vehicle_make_model',
  'Monthly km': 'monthly_km',
  'Monthly Litres': 'monthly_litres',
};

beforeEach(() => resetDecisionCacheForTest());

describe('esgSheetNameOf', () => {
  it('reads the sheet out of a split-workbook filename', () => {
    expect(esgSheetNameOf('SG_Toolkit.xlsx › Fleet_Register')).toBe('Fleet_Register');
    expect(esgSheetNameOf('plain.xlsx')).toBe('plain.xlsx');
  });
});

describe('chooseEsgSheetGrid', () => {
  it('resolves a named toolkit tab without asking the model', async () => {
    const asked = vi.fn();
    const model = mappingModel({}, asked);
    const chosen = await chooseEsgSheetGrid(model, 'Fleet_Register', fleetRows(3));
    expect(chosen?.documentId).toBe('fleet__vehicle_register');
    expect(asked).not.toHaveBeenCalled(); // free answer, no paid call
  });

  it('normalises tab spelling', async () => {
    const model = mappingModel({});
    for (const name of ['fleet register', 'FLEET_REGISTER', 'Fleet-Register']) {
      expect((await chooseEsgSheetGrid(model, name, fleetRows(2)))?.documentId)
        .toBe('fleet__vehicle_register');
    }
  });
});

describe('extractEsgSheetTable', () => {
  it('returns EVERY row of a 134-vehicle register — the case transcription loses', async () => {
    const rows = fleetRows(134);
    const model = mappingModel(FLEET_MAPPING);

    const result = await extractEsgSheetTable(model, {
      filename: 'SG_Toolkit.xlsx › Fleet_Register',
      rows,
      sheetName: 'Fleet_Register',
    });

    expect(result).not.toBeNull();
    expect(result!.values).toHaveLength(1);
    expect(result!.values[0].field).toBe('fleet_vehicle_rows');

    const out = result!.values[0].value as Array<Record<string, unknown>>;
    expect(out).toHaveLength(134);
    // Verbatim, not re-typed: first and last survive intact.
    expect(out[0].vehicle_registration).toBe('AB000GP');
    expect(out[133].vehicle_registration).toBe('AB133GP');
    expect(out[133].monthly_litres).toBe(433);
  });

  it('asks the model exactly ONCE regardless of row count', async () => {
    // The economic claim of this design: mapping cost is per TEMPLATE, not per
    // row. If this ever becomes per-row, a large register gets expensive and
    // slow again.
    let calls = 0;
    const model = mappingModel(FLEET_MAPPING, () => { calls += 1; });
    await extractEsgSheetTable(model, {
      filename: 'SG.xlsx › Fleet_Register', rows: fleetRows(500), sheetName: 'Fleet_Register',
    });
    expect(calls).toBe(1);
  });

  it('hands back to the spec pass when the identity column cannot be mapped', async () => {
    // Without vehicle_registration every row is anonymous. Reporting an empty
    // table would read as "the client supplied nothing"; null lets the existing
    // reader try instead.
    const model = mappingModel({ Depot: 'depot_name' });
    const result = await extractEsgSheetTable(model, {
      filename: 'SG.xlsx › Fleet_Register', rows: fleetRows(10), sheetName: 'Fleet_Register',
    });
    expect(result).toBeNull();
  });

  it('returns null for a sheet with no parsed rows', async () => {
    const model = mappingModel(FLEET_MAPPING);
    expect(await extractEsgSheetTable(model, {
      filename: 'SG.xlsx › Fleet_Register', rows: [], sheetName: 'Fleet_Register',
    })).toBeNull();
    expect(await extractEsgSheetTable(model, {
      filename: 'SG.xlsx › Fleet_Register', sheetName: 'Fleet_Register',
    })).toBeNull();
  });

  it('skips a labelled TOTAL row rather than scoring it as a vehicle', async () => {
    const rows = [
      ...fleetRows(3),
      { Reg: 'TOTAL', Depot: '', 'Model/Category': '', 'Monthly km': 3003, 'Monthly Litres': 903 },
    ];
    const model = mappingModel(FLEET_MAPPING);
    const result = await extractEsgSheetTable(model, {
      filename: 'SG.xlsx › Fleet_Register', rows, sheetName: 'Fleet_Register',
    });
    const out = result!.values[0].value as Array<Record<string, unknown>>;
    expect(out).toHaveLength(3);
    expect(out.some((r) => r.vehicle_registration === 'TOTAL')).toBe(false);
  });
});
