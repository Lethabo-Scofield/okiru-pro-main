/**
 * Grid-shaped ESG documents — a register must not collapse to nothing.
 *
 * Several ESG specs describe a REGISTER rather than a record: the fleet list,
 * the EEA2 occupational-level matrix, the King application register, the risk
 * register. Their prompt asks for an array of rows AND the register's own totals
 * in one reply, so the row columns are never top-level keys.
 *
 * Without the grid pass the pipeline reported all eighteen fleet columns
 * "missing", swept the model twice looking for them, then discarded the 134
 * vehicles as an unexpected key — a full register scoring zero while the client
 * had supplied perfect evidence. These tests pin that shut.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
beforeEach(() => resetExtractionCache());
import { extractWithSpec, type ExtractionModel } from '../../src/services/aiExtraction.js';
import { extractionDomain, hoistGridRows } from '../../src/services/extractionDomain.js';
import { ESG_DOCUMENT_MATRIX } from '../../schemas/esg_document_matrix.js';
import { VERIFICATION_DOCUMENT_MATRIX } from '../../schemas/verification_document_matrix.js';

function modelReturning(payload: unknown): ExtractionModel & { calls: number } {
  const state = { calls: 0 };
  return {
    name: 'scripted',
    get calls() { return state.calls; },
    async complete() {
      state.calls += 1;
      return JSON.stringify(payload);
    },
  } as ExtractionModel & { calls: number };
}

const FLEET_REGISTER = ESG_DOCUMENT_MATRIX.find((d) => d.id === 'fleet__vehicle_register')!;
const EEA2 = ESG_DOCUMENT_MATRIX.find((d) => d.id === 'employment_equity__eea2_eea4_report')!;
const KING = ESG_DOCUMENT_MATRIX.find((d) => d.id === 'board_governance__king_application_register')!;
const WASTE = ESG_DOCUMENT_MATRIX.find((d) => d.id === 'waste__contractor_report_safe_disposal_certificate')!;

describe('hoisting rows out of a model reply', () => {
  const grid = extractionDomain('esg').gridForDocument('fleet__vehicle_register')!;

  it('finds the array under the container key the expert prompt named', () => {
    const rows = hoistGridRows({
      vehicles: [{ vehicle_registration: 'KY75THGP' }, { vehicle_registration: 'JH19XTGP' }],
      fleet_total_vehicles: 2,
    }, grid);
    expect(rows).toHaveLength(2);
  });

  it('still finds the rows when the model renames the array', () => {
    // A 134-vehicle register must not be lost to a key name the model chose.
    const rows = hoistGridRows({
      rows: [{ vehicle_registration: 'KY75THGP', monthly_km: 8940 }],
    }, grid);
    expect(rows).toHaveLength(1);
  });

  it('ignores an array that is not this grid (no row field in common)', () => {
    expect(hoistGridRows({ notes: [{ comment: 'see annexure' }] }, grid)).toEqual([]);
  });

  it('drops blank trailing rows', () => {
    const rows = hoistGridRows({
      vehicles: [
        { vehicle_registration: 'KY75THGP' },
        { vehicle_registration: '', depot_name: null },
      ],
    }, grid);
    expect(rows).toHaveLength(1);
  });
});

describe('extracting a register document', () => {
  it('emits the fleet rows as ONE array-valued field, plus the register totals', async () => {
    const model = modelReturning({
      vehicles: [
        { vehicle_registration: 'KY75THGP', depot_name: 'SGTSPFMCG', monthly_km: 8940, monthly_litres: 3112 },
        { vehicle_registration: 'JH19XTGP', depot_name: 'SGTSPFMCG', monthly_km: 6210, monthly_litres: 2010 },
        { vehicle_registration: 'CA482911', depot_name: 'CPT', monthly_km: 4110, monthly_litres: 1330 },
      ],
      fleet_total_vehicles: 134,
      fleet_ev_count: 0,
      register_as_at_date: '2026-02-28',
      exceptions: [],
    });

    const result = await extractWithSpec(model, FLEET_REGISTER, {
      filename: 'Fleet register Feb 2026.xlsx',
      raw_text: 'fleet register',
    }, { domain: 'esg' });

    const rowsValue = result.values.find((v) => v.field === 'fleet_vehicle_rows');
    expect(rowsValue).toBeDefined();
    expect(Array.isArray(rowsValue!.value)).toBe(true);
    expect((rowsValue!.value as unknown[])).toHaveLength(3);

    // The register's OWN totals are still ordinary scalar fields.
    expect(result.values.find((v) => v.field === 'fleet_total_vehicles')?.value).toBe(134);
    expect(result.values.find((v) => v.field === 'register_as_at_date')?.value).toBe('2026-02-28');
  });

  it('does not report the row columns missing once the rows are in hand', async () => {
    const model = modelReturning({
      vehicles: [{ vehicle_registration: 'KY75THGP', gvm_kg: 16000 }],
      fleet_total_vehicles: 134,
    });

    const result = await extractWithSpec(model, FLEET_REGISTER, {
      filename: 'fleet.xlsx',
      raw_text: 'fleet register',
    }, { domain: 'esg' });

    // `vehicle_registration` lives inside a row, not at the top level: reporting
    // it missing would send the client hunting for data they already gave us.
    expect(result.missingFields).not.toContain('vehicle_registration');
    expect(result.missingFields).not.toContain('gvm_kg');
  });

  it('does not report the rows array as an unexpected key', async () => {
    const model = modelReturning({
      vehicles: [{ vehicle_registration: 'KY75THGP' }],
      fleet_total_vehicles: 134,
    });
    const result = await extractWithSpec(model, FLEET_REGISTER, {
      filename: 'fleet.xlsx',
      raw_text: 'fleet register',
    }, { domain: 'esg' });
    expect(result.unexpectedFields).not.toContain('vehicles');
  });

  it('says the register yielded no rows rather than blaming the client for every column', async () => {
    const model = modelReturning({ fleet_total_vehicles: 134, vehicles: [] });
    const result = await extractWithSpec(model, FLEET_REGISTER, {
      filename: 'fleet.xlsx',
      raw_text: 'fleet register',
    }, { domain: 'esg' });
    expect(result.missingFields).toContain('fleet_vehicle_rows');
  });

  it('reads the EEA2 occupational-level matrix as one row per level', async () => {
    const model = modelReturning({
      entity_name: 'SG Consumer (Pty) Ltd',
      headcount_total_all_levels: 412,
      levels: [
        { occupational_level: 'Top Management', headcount_african_male: 1, headcount_white_male: 3, headcount_level_total: 4 },
        { occupational_level: 'Senior Management', headcount_african_male: 6, headcount_white_male: 5, headcount_level_total: 11 },
        { occupational_level: 'Skilled', headcount_african_male: 120, headcount_african_female: 40, headcount_level_total: 160 },
      ],
    });

    const result = await extractWithSpec(model, EEA2, {
      filename: 'EEA2 2025.pdf',
      raw_text: 'employment equity report',
    }, { domain: 'esg' });

    const rows = result.values.find((v) => v.field === 'ee_level_rows')?.value as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    expect(rows[0].occupational_level).toBe('Top Management');
    expect(result.values.find((v) => v.field === 'headcount_total_all_levels')?.value).toBe(412);
  });

  it('reads the King application register as one row per principle', async () => {
    const model = modelReturning({
      king_code_version: 'King V',
      king_principles_total: 17,
      king_principles_applied_count: 10,
      principles: [
        { king_principle_number: 1, king_principle_name: 'Ethical leadership', king_principle_status: 'Applied' },
        { king_principle_number: 3, king_principle_name: 'Board composition', king_principle_status: 'Explained' },
        { king_principle_number: 10, king_principle_name: 'Risk governance', king_principle_status: 'Partially Applied' },
      ],
    });

    const result = await extractWithSpec(model, KING, {
      filename: 'King V register.xlsx',
      raw_text: 'king application register',
    }, { domain: 'esg' });

    const rows = result.values.find((v) => v.field === 'board_king_principle_rows')?.value as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    // "Partially Applied" survives as printed — never rounded to Applied.
    expect(rows[2].king_principle_status).toBe('Partially Applied');
  });

  it('keeps BOTH the per-stream rows and the site totals on a waste report', async () => {
    // waste_total_kg is legitimately a row column AND a document total, so the
    // scalars are not suppressed for this grid.
    const model = modelReturning({
      waste_contractor_name: 'Oricol Environmental Services',
      waste_total_kg: 41200,
      waste_recycled_kg: 18400,
      streams: [
        { waste_stream_type: 'General', waste_total_kg: 30000, waste_landfill_kg: 22800 },
        { waste_stream_type: 'Cardboard', waste_total_kg: 11200, waste_recycled_kg: 11200 },
      ],
    });

    const result = await extractWithSpec(model, WASTE, {
      filename: 'waste report Q3.pdf',
      raw_text: 'waste contractor report',
    }, { domain: 'esg' });

    const rows = result.values.find((v) => v.field === 'waste_stream_rows')?.value as unknown[];
    expect(rows).toHaveLength(2);
    expect(result.values.find((v) => v.field === 'waste_total_kg')?.value).toBe(41200);
  });
});

describe('the B-BBEE domain has no grids', () => {
  it('reports null for every B-BBEE spec, so nothing on that path changed', () => {
    const bbbee = extractionDomain('bbbee');
    for (const spec of VERIFICATION_DOCUMENT_MATRIX) {
      expect(bbbee.gridForDocument(spec.id)).toBeNull();
    }
  });

  it('still extracts a plain B-BBEE spec into flat fields', async () => {
    const seta = VERIFICATION_DOCUMENT_MATRIX.find((d) => d.name === 'SETA registration certificate')!;
    const model = modelReturning({ entity_name: 'Thandanani Packers & Haulers cc', seta_name: 'TETA' });
    const result = await extractWithSpec(model, seta, {
      filename: 'seta.pdf',
      raw_text: 'SETA registration certificate for Thandanani Packers & Haulers cc, TETA',
    });
    expect(result.values.find((v) => v.field === 'entity_name')?.value)
      .toBe('Thandanani Packers & Haulers cc');
    // No rows field is invented for a domain that has no grids.
    expect(result.values.every((v) => !v.field.endsWith('_rows'))).toBe(true);
  });
});
