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
  isLabelLine,
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

  it('reads a training register that prints no OFO code, keyed by its learners', async () => {
    // The register's first row field is ofo_code, and most training registers
    // never print one. Requiring it handed a whole learner register back unread.
    const rows = Array.from({ length: 12 }, (_, i) => ({
      'Course': i < 6 ? 'SAFETY INDUCTION' : 'LADDER WORK',
      'Provider': i < 6 ? 'Acme Safety' : 'Lift Co',
      'Learner': `LEARNER ${i + 1}`,
      'Cost (R)': i % 3 === 0 ? undefined : 1000 + i,
    }));
    const model = mappingModel({
      'Course': 'programme_name',
      'Provider': 'training_provider_name',
      'Learner': 'learner_name',
      'Cost (R)': 'training_cost_rand',
    });
    const result = await extractEsgSheetTable(model, {
      filename: 'Training register.xlsx › Learners', rows, sheetName: 'Learners',
      // The model chooses the register; here the test pins it.
      template: 'OFO codes',
    });
    expect(result?.documentId).toBe('training__ofo_intervention_register');
    const out = result!.values[0].value as Array<Record<string, unknown>>;
    expect(out).toHaveLength(12);
    expect(out[11]).toMatchObject({ learner_name: 'LEARNER 12', programme_name: 'LADDER WORK', training_cost_rand: 1011 });
    // Twelve learners, not two rows inheriting the first learner's name.
    expect(new Set(out.map((row) => row.learner_name)).size).toBe(12);
  });

  it('keeps a sheet\'s records and leaves its label lines to the labelled-cell reader', async () => {
    // A report with its records and then caption lines with their figures.
    // Mapped onto a register keyed by date, each caption became a "record"
    // dated "Opening stock".
    const rows: Array<Record<string, unknown>> = [
      { Date: 46100, Route: 'R-001', Km: 410 },
      { Date: '46101', Route: 'R-002', Km: 380 },
      ...['Reconciliation', 'Meter open', 'Difference', 'Opening stock', 'Purchased', 'Closing stock']
        .map((caption, i) => ({ Date: caption, Km: i * 10 })),
      { Date: 46102, Route: 'R-003' },
    ];
    const model = mappingModel({ Date: 'report_date', Route: 'route_name', Km: 'distance_km' });
    const result = await extractEsgSheetTable(model, {
      filename: 'Routes.xlsx › Summary', rows, sheetName: 'Summary', template: 'Debrief summary',
    });
    const out = result!.values[0].value as Array<Record<string, unknown>>;
    expect(out.map((row) => row.route_name)).toEqual(['R-001', 'R-002', 'R-003']);
    expect(result!.exceptions.some((e) => /6 line\(s\) whose report_date is a caption/.test(e))).toBe(true);
  });

  it('reads a sheet of nothing but label lines as the register with no record, not as unread', async () => {
    const model = mappingModel({ Date: 'report_date', Route: 'route_name', Km: 'distance_km' });
    const result = await extractEsgSheetTable(model, {
      filename: 'Routes.xlsx › Unused', sheetName: 'Unused', template: 'Debrief summary',
      rows: [{ Date: 'Totals', Km: 0 }, { Date: 'Checked by', Route: 'R-001' }],
    });
    expect(result?.documentId).toBe('fleet__telematics_driver_debrief_report');
    expect(result!.values[0].value).toEqual([]);
  });

  it('takes only a caption in a date column for a label line', () => {
    expect(isLabelLine({ transaction_date: 'Opening stock', fuel_litres: 2000 }, 'transaction_date')).toBe(true);
    // A date, written any way, or a template's empty day, is a record.
    expect(isLabelLine({ transaction_date: '05-03-2026' }, 'transaction_date')).toBe(false);
    expect(isLabelLine({ transaction_date: 46100 }, 'transaction_date')).toBe(false);
    // A name or a registration may be any words.
    expect(isLabelLine({ learner_name: 'Opening Stock' }, 'learner_name')).toBe(false);
    expect(isLabelLine({ vehicle_registration: 'UNREGISTERED', depot_name: 'North' }, 'vehicle_registration')).toBe(false);
  });

  it('takes a caption that carries a figure for a label line, never a date that opens with its month', () => {
    expect(isLabelLine({ transaction_date: 'Allowed variance -150 litres' }, 'transaction_date')).toBe(true);
    expect(isLabelLine({ transaction_date: 'March 3, 2026' }, 'transaction_date')).toBe(false);
    expect(isLabelLine({ transaction_date: 'Mar-26' }, 'transaction_date')).toBe(false);
    expect(isLabelLine({ training_start_date: '1 - 31 JULY 2025' }, 'training_start_date')).toBe(false);
  });

  it('still requires an identity column: a training sheet mapped to costs alone is not read', async () => {
    const model = mappingModel({ 'Cost (R)': 'training_cost_rand' });
    const result = await extractEsgSheetTable(model, {
      filename: 'Training register.xlsx › Costs',
      rows: [{ 'Cost (R)': 100 }, { 'Cost (R)': 200 }],
      sheetName: 'Costs',
      template: 'OFO codes',
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
