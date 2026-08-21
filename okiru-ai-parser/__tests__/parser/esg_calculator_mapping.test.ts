/**
 * ESG field → calculator mapping, and the allowlist that is the last word.
 *
 * These are the four rules under test, each one a way an ESG number could be
 * quietly corrupted:
 *   1. nothing is inferred — an undeclared field reaches nothing;
 *   2. a conflicted field never maps;
 *   3. context decides — `site_name` on an electricity bill and on a water
 *      account are different cells, which is what makes a combined municipal
 *      account safe;
 *   4. the allowlist is final — a mapping error cannot invent a calculator path.
 *
 * Plus the two things the B-BBEE mapper has no equivalent of: genuine booleans,
 * and Yes/No/Partial tri-states that must NOT be collapsed to booleans.
 */
import { describe, expect, it } from 'vitest';
import {
  esgFieldElementIndex,
  mapEsgEntitiesToCalculator,
  ESG_FIELD_MAPPINGS,
} from '../../src/services/esgEntityCalculatorMapping.js';
import {
  admitEsgCalculatorEntry,
  esgCalculatorKeySpec,
} from '../../schemas/esg_calculator_allowlist.js';
import type { CaseEntities } from '../../src/services/entityResolution.js';
import type { EsgElement } from '../../schemas/esg_document_matrix.js';

/** Build a resolved case from plain field → value pairs. */
function caseOf(
  fields: Record<string, unknown>,
  options: { conflicted?: string[]; sources?: string[] } = {},
): CaseEntities {
  const conflicted = new Set(options.conflicted ?? []);
  const sources = options.sources ?? ['evidence.pdf'];
  return {
    fields: Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, {
      field,
      value,
      sources,
      agreementCount: 1,
      conflicted: conflicted.has(field),
      alternatives: conflicted.has(field) ? [{ value: 'rival', sources: ['other.pdf'] }] : [],
    }])),
    conflicts: [],
    missingFields: [],
    exceptions: [],
    documentsExtracted: 1,
    filesWithNoExtraction: [],
  };
}

function elementsOf(map: Record<string, EsgElement[]>): Map<string, Set<EsgElement>> {
  return new Map(Object.entries(map).map(([field, els]) => [field, new Set(els)]));
}

describe('rule 1 — nothing is inferred', () => {
  it('reports an undeclared field as unmapped instead of guessing a key', () => {
    const result = mapEsgEntitiesToCalculator(
      caseOf({ inverter_serial_number: 'SUN-2200-441' }),
      elementsOf({ inverter_serial_number: ['GHG_ENERGY'] }),
    );
    expect(result.payload).toEqual({});
    expect(result.unmapped).toContainEqual({ field: 'inverter_serial_number', reason: 'no_mapping' });
  });
});

describe('rule 2 — conflicted fields never map', () => {
  it('holds a contested figure for review rather than scoring one of the two', () => {
    const result = mapEsgEntitiesToCalculator(
      caseOf({ electricity_kwh: 35332 }, { conflicted: ['electricity_kwh'] }),
      elementsOf({ electricity_kwh: ['GHG_ENERGY'] }),
    );
    expect(result.payload['energy.electricity_kwh']).toBeUndefined();
    expect(result.needsReview.map((r) => r.field)).toContain('electricity_kwh');
    expect(result.unmapped).toContainEqual({ field: 'electricity_kwh', reason: 'conflicted' });
  });
});

describe('rule 3 — context decides (the combined municipal account)', () => {
  it('sends the same field name to energy.* or water.* depending on the document', () => {
    const asEnergy = mapEsgEntitiesToCalculator(
      caseOf({ site_name: 'ISANDO', utility_account_number: '5104238771' }),
      elementsOf({ site_name: ['GHG_ENERGY'], utility_account_number: ['GHG_ENERGY'] }),
    );
    expect(asEnergy.payload['energy.site_name']).toBe('ISANDO');
    expect(asEnergy.payload['water.site_name']).toBeUndefined();

    const asWater = mapEsgEntitiesToCalculator(
      caseOf({ site_name: 'CPT depot', utility_account_number: '3009884120' }),
      elementsOf({ site_name: ['WATER'], utility_account_number: ['WATER'] }),
    );
    expect(asWater.payload['water.site_name']).toBe('CPT depot');
    expect(asWater.payload['energy.site_name']).toBeUndefined();
  });

  it('lands the kWh AND the kL from one combined bill in their own blocks', () => {
    // One document, both elements — the case the pins in specRetrieval exist to
    // create. Each figure must reach its own destination and neither may cross.
    const result = mapEsgEntitiesToCalculator(
      caseOf({ electricity_kwh: 35332, water_kl: 77, sanitation_kl: 61.6 }),
      elementsOf({
        electricity_kwh: ['GHG_ENERGY'],
        water_kl: ['WATER'],
        sanitation_kl: ['WATER'],
      }),
    );
    expect(result.payload['energy.electricity_kwh']).toBe(35332);
    expect(result.payload['water.kl']).toBe(77);
    expect(result.payload['water.sanitation_kl']).toBe(61.6);
  });

  it('does not map a field whose element does not match its declared scope', () => {
    // `water_kl` claimed by a GHG_ENERGY document is not water evidence.
    const result = mapEsgEntitiesToCalculator(
      caseOf({ water_kl: 77 }),
      elementsOf({ water_kl: ['GHG_ENERGY'] }),
    );
    expect(result.payload['water.kl']).toBeUndefined();
    expect(result.unmapped).toContainEqual({ field: 'water_kl', reason: 'no_mapping' });
  });
});

describe('rule 4 — the allowlist is final', () => {
  it('every declared mapping targets a key that exists in the allowlist', () => {
    const unknown = ESG_FIELD_MAPPINGS
      .filter((m) => esgCalculatorKeySpec(m.calculatorKey) === undefined)
      .map((m) => `${m.field} → ${m.calculatorKey}`);
    expect(unknown).toEqual([]);
  });

  it('every declared mapping coerces to the runtime type its key demands', () => {
    // A `boolean` key fed by a `text` coercion would be rejected on every real
    // document and silently score nothing; catch it here instead.
    const wrong = ESG_FIELD_MAPPINGS.filter((m) => {
      const spec = esgCalculatorKeySpec(m.calculatorKey)!;
      switch (m.coerce) {
        case 'boolean': return spec.type !== 'boolean';
        case 'text': case 'tri_state': return spec.type !== 'string';
        case 'iso_date': return spec.type !== 'iso_date';
        case 'number': case 'money': case 'percentage': case 'year': return spec.type !== 'number';
        default: return true;
      }
    }).map((m) => `${m.field} → ${m.calculatorKey} (${m.coerce} vs ${esgCalculatorKeySpec(m.calculatorKey)!.type})`);
    expect(wrong).toEqual([]);
  });

  it('refuses an unknown key and a wrong runtime type', () => {
    expect(admitEsgCalculatorEntry('energy.made_up_key', 1)).toEqual({ accepted: false, reason: 'unknown_key' });
    expect(admitEsgCalculatorEntry('energy.electricity_kwh', '35332')).toEqual({ accepted: false, reason: 'type_mismatch' });
    expect(admitEsgCalculatorEntry('energy.is_landlord_recovery', 'Yes')).toEqual({ accepted: false, reason: 'type_mismatch' });
    expect(admitEsgCalculatorEntry('energy.electricity_kwh', null)).toEqual({ accepted: false, reason: 'empty_value' });
  });

  it('drops a value that will not coerce rather than passing prose to a number cell', () => {
    const result = mapEsgEntitiesToCalculator(
      caseOf({ electricity_kwh: 'see annexure B' }),
      elementsOf({ electricity_kwh: ['GHG_ENERGY'] }),
    );
    expect(result.payload['energy.electricity_kwh']).toBeUndefined();
    expect(result.unmapped).toContainEqual({ field: 'electricity_kwh', reason: 'uncoercible' });
  });
});

describe('booleans and tri-states', () => {
  it('maps a genuine boolean as a boolean', () => {
    const result = mapEsgEntitiesToCalculator(
      caseOf({ is_landlord_recovery: true, hira_register_present: 'Yes' }),
      elementsOf({ is_landlord_recovery: ['GHG_ENERGY'], hira_register_present: ['HEALTH_SAFETY'] }),
    );
    expect(result.payload['energy.is_landlord_recovery']).toBe(true);
    expect(result.payload['hs.hira_register_present']).toBe(true);
  });

  it('KEEPS "Partial" as a string — it is a value, not a rounded boolean', () => {
    const result = mapEsgEntitiesToCalculator(
      caseOf({
        board_charter_present: 'Partial',
        risk_committee_active: 'Partially in place',
        wsp_submitted: 'Yes',
        atr_submitted: 'No',
      }),
      elementsOf({
        board_charter_present: ['BOARD_GOVERNANCE'],
        risk_committee_active: ['BOARD_GOVERNANCE'],
        wsp_submitted: ['TRAINING'],
        atr_submitted: ['TRAINING'],
      }),
    );
    expect(result.payload['board.charter_present']).toBe('Partial');
    expect(result.payload['board.risk_committee_active']).toBe('Partial');
    expect(result.payload['training.wsp_submitted']).toBe('Yes');
    expect(result.payload['training.atr_submitted']).toBe('No');
    // Never a boolean: that would erase the third state on its way to the sheet.
    expect(typeof result.payload['board.charter_present']).toBe('string');
  });

  it('refuses to round "Partial" into a real boolean key', () => {
    // `iso.net_zero_commitment_present` is typed boolean. A partial commitment is
    // not a commitment, and must be reviewed rather than upgraded.
    const result = mapEsgEntitiesToCalculator(
      caseOf({ net_zero_commitment_present: 'Partial' }),
      elementsOf({ net_zero_commitment_present: ['ISO_ENVIRONMENTAL'] }),
    );
    expect(result.payload['iso.net_zero_commitment_present']).toBeUndefined();
    expect(result.unmapped).toContainEqual({ field: 'net_zero_commitment_present', reason: 'uncoercible' });
  });
});

describe('numbers, units and dates', () => {
  it('strips the printed unit without converting it', () => {
    const result = mapEsgEntitiesToCalculator(
      caseOf({ electricity_kwh: '35,332 kWh', water_kl: '77 kl', gvm_kg: '16 000 kg' }),
      elementsOf({ electricity_kwh: ['GHG_ENERGY'], water_kl: ['WATER'], gvm_kg: ['FLEET'] }),
    );
    expect(result.payload['energy.electricity_kwh']).toBe(35332);
    expect(result.payload['water.kl']).toBe(77);
    expect(result.payload['fleet.gvm_kg']).toBe(16000);
  });

  it('does NOT rescale a sub-1 percentage the way the B-BBEE mapper does', () => {
    // 0.4% diversion is a real (dreadful) ESG figure. Treating it as 40% would
    // turn a failing waste programme into a passing one.
    const result = mapEsgEntitiesToCalculator(
      caseOf({ waste_diversion_percent: 0.4 }),
      elementsOf({ waste_diversion_percent: ['WASTE'] }),
    );
    expect(result.payload['waste.diversion_percent']).toBe(0.4);
  });

  it('reads South African day-first dates', () => {
    const result = mapEsgEntitiesToCalculator(
      caseOf({ billing_period_start: '01/10/2025', iso14001_expiry_date: '14 March 2027' }),
      elementsOf({ billing_period_start: ['GHG_ENERGY'], iso14001_expiry_date: ['ISO_ENVIRONMENTAL'] }),
    );
    expect(result.payload['energy.billing_period_start']).toBe('2025-10-01');
    expect(result.payload['iso.iso14001_expiry_date']).toBe('2027-03-14');
  });
});

describe('register grids expand to N rows', () => {
  it('turns a fleet rows array into one mapped row per vehicle', () => {
    const result = mapEsgEntitiesToCalculator(
      caseOf({
        fleet_vehicle_rows: [
          { vehicle_registration: 'KY75THGP', depot_name: 'SGTSPFMCG', monthly_km: 8940, is_electric_vehicle: false },
          { vehicle_registration: 'JH19XTGP', depot_name: 'SGTSPFMCG', monthly_km: 6210, is_electric_vehicle: false },
          { vehicle_registration: 'EV01GP', depot_name: 'CPT', monthly_km: 1200, is_electric_vehicle: true },
        ],
        fleet_total_vehicles: 134,
      }, { sources: ['Fleet register.xlsx'] }),
      elementsOf({ fleet_total_vehicles: ['FLEET'] }),
    );

    expect(result.rows).toHaveLength(3);
    expect(result.rows[0].grid).toBe('fleet_vehicle_rows');
    expect(result.rows[0].cells['fleet.vehicle_registration']).toBe('KY75THGP');
    expect(result.rows[0].cells['fleet.monthly_km']).toBe(8940);
    expect(result.rows[2].cells['fleet.is_electric_vehicle']).toBe(true);
    // Row order is preserved, so a register stays traceable to its source.
    expect(result.rows.map((r) => r.index)).toEqual([0, 1, 2]);
    // Provenance travels with the rows.
    expect(result.rows[0].sourceFiles).toEqual(['Fleet register.xlsx']);
    // The register's own totals are still scalars.
    expect(result.payload['fleet.total_vehicles']).toBe(134);
  });

  it('routes each grid by its OWN element, so a row site_name is unambiguous', () => {
    const result = mapEsgEntitiesToCalculator(
      caseOf({
        waste_stream_rows: [
          { waste_stream_type: 'General', waste_total_kg: 30000, waste_landfill_kg: 22800 },
          { waste_stream_type: 'Cardboard', waste_total_kg: 11200, waste_recycled_kg: 11200 },
        ],
      }),
      elementsOf({}),
    );
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].cells['waste.stream_type']).toBe('General');
    expect(result.rows[1].cells['waste.recycled_kg']).toBe(11200);
  });

  it('holds "Partially Applied" intact through row expansion', () => {
    const result = mapEsgEntitiesToCalculator(
      caseOf({
        board_king_principle_rows: [
          { king_principle_number: 1, king_principle_name: 'Ethical leadership', king_principle_status: 'Applied' },
          { king_principle_number: 10, king_principle_name: 'Risk governance', king_principle_status: 'Partially Applied' },
        ],
      }),
      elementsOf({}),
    );
    expect(result.rows[1].cells['board.king_principle_status']).toBe('Partially Applied');
  });

  it('records unmappable row columns instead of passing them through', () => {
    const result = mapEsgEntitiesToCalculator(
      caseOf({
        fleet_vehicle_rows: [{ vehicle_registration: 'KY75THGP', chassis_number: 'ABC123' }],
      }),
      elementsOf({}),
    );
    expect(result.rows[0].cells['fleet.vehicle_registration']).toBe('KY75THGP');
    expect(Object.values(result.rows[0].cells)).not.toContain('ABC123');
    expect(result.rows[0].droppedFields).toContain('chassis_number');
  });

  it('drops a row that maps to nothing rather than emitting an empty line', () => {
    const result = mapEsgEntitiesToCalculator(
      caseOf({
        fleet_vehicle_rows: [
          { vehicle_registration: 'KY75THGP' },
          { chassis_number: 'ABC123' },
        ],
      }),
      elementsOf({}),
    );
    expect(result.rows).toHaveLength(1);
  });
});

describe('the ESG payload cannot contain a B-BBEE key', () => {
  it('every emitted key is dot-namespaced and allowlisted', () => {
    const result = mapEsgEntitiesToCalculator(
      caseOf({ electricity_kwh: 35332, npat_rand: 4200000 }),
      elementsOf({ electricity_kwh: ['GHG_ENERGY'], npat_rand: ['FINANCIAL'] }),
    );
    for (const key of Object.keys(result.payload)) {
      expect(esgCalculatorKeySpec(key)).toBeDefined();
    }
    expect(result.payload['entity.npat']).toBe(4200000);
    // `ownership.*` / `skills.*` are B-BBEE namespaces and have no ESG spec.
    expect(esgCalculatorKeySpec('ownership.black_ownership')).toBeUndefined();
  });
});

describe('the field → element index', () => {
  it('records which ESG element produced each field', () => {
    const index = esgFieldElementIndex([
      { documentId: 'ghg_energy__municipal_electricity_bill', values: [{ field: 'site_name' }] },
      { documentId: 'water__municipal_water_bill', values: [{ field: 'site_name' }] },
    ]);
    expect(index.get('site_name')).toEqual(new Set(['GHG_ENERGY', 'WATER']));
  });

  it('ignores extractions from ids that are not in the ESG matrix', () => {
    const index = esgFieldElementIndex([
      { documentId: 'ownership__share_register', values: [{ field: 'holder_name' }] },
    ]);
    expect(index.size).toBe(0);
  });
});
