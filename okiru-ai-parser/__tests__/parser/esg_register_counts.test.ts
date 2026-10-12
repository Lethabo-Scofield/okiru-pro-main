/**
 * The counts a register implies but does not print, worked out by the code
 * from the rows' own columns and labelled derived (esgRegisterDerivations.ts).
 * Every row here is invented.
 */
import { describe, expect, it } from 'vitest';
import type { DocumentExtraction } from '../../src/services/aiExtraction.js';
import {
  deriveFleetCounts,
  deriveFuelCounts,
  deriveIncidentCounts,
  deriveRiskCounts,
  deriveTrainingCounts,
  ratingOf,
  registerCountsFor,
  statedFlag,
} from '../../src/services/esgRegisterDerivations.js';
import { ROW_HIDDEN_KEY } from '../../src/services/entityResolution.js';

const byField = (counts: Array<{ field: string; value: unknown }>) => Object.fromEntries(counts.map((c) => [c.field, c.value]));

/** An incident register as the code reads it: every yes/no column as printed. */
const INCIDENTS = [
  { incident_date: '03-08-2025', incident_site: 'Depot North', incident_classification: 'Accident', incident_person_injured: 'Yes', incident_lost_time: 'Yes', incident_fatality: 'No', incident_property_damage: 'No', incident_coid_claim_lodged: 'Yes (in progress)' },
  { incident_date: '11-09-2025', incident_site: 'Depot North', incident_classification: 'Incident', incident_person_injured: 'No', incident_lost_time: 'No', incident_fatality: 'No', incident_property_damage: 'Yes (shelving)', incident_coid_claim_lodged: 'No' },
  { incident_date: '02-10-2025', incident_site: 'Depot South', incident_classification: 'Incident', incident_person_injured: 'YES', incident_lost_time: 'No', incident_fatality: 'No', incident_property_damage: 'No', incident_coid_claim_lodged: 'yes' },
  { incident_date: '19-11-2025', incident_site: 'Depot South', incident_classification: 'Incident', incident_person_injured: 'Yes', incident_lost_time: 'No', incident_fatality: 'No', incident_property_damage: 'Yes', incident_coid_claim_lodged: 'Delayed', injured_party_category: 'Third party transporter' },
  { incident_date: '05-01-2026', incident_site: 'Depot East', incident_classification: 'Incident', incident_person_injured: 'Yes', incident_lost_time: 'Yes', incident_fatality: 'No', incident_property_damage: 'Yes', incident_coid_claim_lodged: 'No' },
];

describe('an incident register\'s counts', () => {
  it('counts lost time, fatalities, injuries without lost time, damage, claims and sites from the columns', () => {
    const counts = byField(deriveIncidentCounts(INCIDENTS));
    expect(counts.derived_incident_rows_count).toBe(5);
    expect(counts.lost_time_injuries_count).toBe(2);
    // The register keeps a fatality column: zero is a statement it makes.
    expect(counts.fatalities_count).toBe(0);
    expect(counts.medical_treatment_injuries_count).toBe(2);
    expect(counts.derived_property_damage_incidents_count).toBe(3);
    // "Yes (in progress)" and "yes" are claims lodged; "Delayed" is not a yes.
    expect(counts.derived_coid_claims_lodged_count).toBe(2);
    expect(counts.derived_incidents_by_site).toEqual([
      { incident_site: 'Depot North', rows: 2 },
      { incident_site: 'Depot South', rows: 2 },
      { incident_site: 'Depot East', rows: 1 },
    ]);
    expect(counts.derived_third_party_incidents_count).toBe(1);
  });

  it('states no count for a column the register does not keep, and never a first-aid count it does not classify', () => {
    const rows = INCIDENTS.map(({ incident_fatality: _f, incident_property_damage: _p, ...rest }) => rest);
    const counts = byField(deriveIncidentCounts(rows));
    expect(counts).not.toHaveProperty('fatalities_count');
    expect(counts).not.toHaveProperty('derived_property_damage_incidents_count');
    expect(counts).not.toHaveProperty('first_aid_cases_count');
    expect(counts).not.toHaveProperty('near_miss_count');
  });

  it('counts by the register\'s own classification when it names medical treatment and first aid', () => {
    const counts = byField(deriveIncidentCounts([
      { incident_date: '01-02-2026', incident_classification: 'First aid case', incident_lost_time: 'No' },
      { incident_date: '02-02-2026', incident_classification: 'Medical treatment case', incident_lost_time: 'No' },
      { incident_date: '03-02-2026', incident_classification: 'LTI' },
    ]));
    expect(counts.first_aid_cases_count).toBe(1);
    expect(counts.medical_treatment_injuries_count).toBe(1);
    expect(counts.lost_time_injuries_count).toBe(1);
  });

  it('never counts a hidden sheet\'s rows', () => {
    expect(deriveIncidentCounts(INCIDENTS.map((row) => ({ ...row, [ROW_HIDDEN_KEY]: true })))).toEqual([]);
  });

  it('reads a yes/no cell as printed, and nothing else as either', () => {
    expect([statedFlag('Yes (racks)'), statedFlag('NO'), statedFlag(true), statedFlag('Delayed'), statedFlag('')]).toEqual([true, false, true, null, null]);
  });
});

describe('a training register\'s lines by race and gender', () => {
  it('counts lines per race and gender as printed, and the lines with no expenditure', () => {
    const rows = [
      { learner_name: 'A', learner_race: 'AFRICAN', learner_gender: 'MALE', training_cost_rand: 500 },
      { learner_name: 'B', learner_race: 'African', learner_gender: 'FEMALE' },
      { learner_name: 'C', learner_race: 'WHITE', learner_gender: 'FEMALE', training_cost_rand: 1200 },
    ];
    const counts = byField(deriveTrainingCounts(rows));
    expect(counts.derived_training_rows_by_race).toEqual([
      { learner_race: 'AFRICAN', rows: 2 },
      { learner_race: 'WHITE', rows: 1 },
    ]);
    expect(counts.derived_training_rows_by_gender).toEqual([
      { learner_gender: 'MALE', rows: 1 },
      { learner_gender: 'FEMALE', rows: 2 },
    ]);
    expect(counts.derived_training_rows_without_cost).toBe(1);
  });
});

describe('a fleet register\'s trailers and electric vehicles', () => {
  it('counts trailers and reefers (however spelt) and electric units by category, model and fuel', () => {
    const rows = [
      { vehicle_registration: 'AA01', vehicle_make_model: 'TRAILER ', vehicle_category: '12M' },
      { vehicle_registration: 'AA02', vehicle_make_model: 'Refeers 24 TON', vehicle_category: '15M' },
      { vehicle_registration: 'AA03', vehicle_make_model: 'Example 1627', vehicle_category: '16 TON' },
      { vehicle_registration: 'AA04', vehicle_make_model: 'Example Van', vehicle_category: 'e DELIVERY' },
      { vehicle_registration: 'AA05', vehicle_make_model: 'Example Car', fuel_type: 'Electric' },
    ];
    expect(byField(deriveFleetCounts(rows))).toEqual({ fleet_trailer_count: 2, fleet_ev_count: 2 });
  });

  it('states nothing when no unit is one', () => {
    expect(deriveFleetCounts([{ vehicle_registration: 'AA03', vehicle_make_model: 'Example 1627', vehicle_category: '16 TON' }])).toEqual([]);
  });
});

describe('a risk register\'s factors by rating, and a fuel register\'s delivery notes', () => {
  it('reads "Risk M", "M" and "Medium" as one rating', () => {
    expect([ratingOf('Risk M'), ratingOf('High'), ratingOf(' l '), ratingOf('Risk Q')]).toEqual(['M', 'H', 'L', 'Q']);
    const counts = byField(deriveRiskCounts([
      { risk_description: 'a', risk_rating_as_printed: 'Risk M' },
      { risk_description: 'b', risk_rating_as_printed: 'M' },
      { risk_description: 'c', risk_rating_as_printed: 'H' },
    ]));
    expect(counts.derived_risks_by_rating).toEqual([
      { risk_rating_as_printed: 'M', rows: 2 },
      { risk_rating_as_printed: 'H', rows: 1 },
    ]);
  });

  it('lists each delivery note the lines print once', () => {
    expect(byField(deriveFuelCounts([
      { transaction_date: '2026-04-09', delivery_note_number: 12345678 },
      { transaction_date: '2026-04-09', delivery_note_number: 12345678 },
      { transaction_date: '2026-03-20', delivery_note_number: 'DN-9' },
    ]))).toEqual({ delivery_note_numbers: ['12345678', 'DN-9'] });
  });
});

describe('registerCountsFor', () => {
  const read = (values: DocumentExtraction['values']): DocumentExtraction => ({
    documentId: 'health_safety__injury_statistics_report',
    documentName: 'Sheet1 register',
    sourceFile: 'invented incidents.xlsx',
    values,
    missingFields: [],
    unexpectedFields: [],
    exceptions: [],
  });

  it('adds the counts as a read of their own, each labelled derived, never over a printed count', () => {
    const register = read([{ field: 'incident_rows', value: INCIDENTS, sourceFile: 'invented incidents.xlsx', sourceDocumentId: 'x' }]);
    const printed = read([{ field: 'lost_time_injuries_count', value: 7, sourceFile: 'invented incidents.xlsx', sourceDocumentId: 'x' }]);
    const [counts] = registerCountsFor([register, printed]);
    expect(counts.documentName).toBe('Sheet1 register counts');
    expect(counts.values.every((value) => value.source?.method === 'derived' && /^derived:/.test(value.source.quote))).toBe(true);
    // The register's own read is untouched: still exactly its rows.
    expect(register.values).toHaveLength(1);
    // The document printed a lost-time count: it is never derived over.
    expect(counts.values.some((value) => value.field === 'lost_time_injuries_count')).toBe(false);
    expect(counts.values.find((value) => value.field === 'fatalities_count')?.value).toBe(0);
  });

  it('adds nothing for a read with no register', () => {
    expect(registerCountsFor([read([{ field: 'site_name', value: 'Depot North', sourceFile: 'f', sourceDocumentId: 'x' }])])).toEqual([]);
  });
});

describe('the registers the code reads, and the types Pass A may name', async () => {
  const { extractionDomain } = await import('../../src/services/extractionDomain.js');
  const { passASystemPrompt } = await import('../../src/services/documentClassification.js');

  it('an incident register keeps every yes/no column, and a training register its learners\' race and gender', () => {
    const esg = extractionDomain('esg');
    expect(esg.gridForDocument('health_safety__injury_statistics_report')?.rowFields).toEqual(expect.arrayContaining([
      'incident_person_injured', 'incident_lost_time', 'incident_fatality', 'incident_property_damage', 'incident_coid_claim_lodged',
    ]));
    expect(esg.gridForDocument('training__ofo_intervention_register')?.rowFields).toEqual(expect.arrayContaining(['learner_race', 'learner_gender']));
    expect(esg.gridForDocument('fleet__fuel_card_statement')?.rowFields).toEqual(expect.arrayContaining(['order_number', 'delivery_note_number', 'fuel_price_per_litre']));
  });

  it('Pass A names a listed type even when no element fits it', () => {
    expect(passASystemPrompt('esg')).toMatch(/is that type even when no ELEMENT above fits it/);
    // The B-BBEE prompt is not touched.
    expect(passASystemPrompt('bbbee')).not.toMatch(/even when no ELEMENT above fits it/);
  });
});

describe('a register\'s category typed with a slip', () => {
  it('joins a one-letter slip to the group it misspells, and keeps a real small group apart', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_v, i) => ({ learner_name: `A${i}`, learner_race: 'AFRICAN', learner_gender: 'MALE' })),
      { learner_name: 'B', learner_race: 'AFICAN', learner_gender: 'FEMALE' },
      { learner_name: 'C', learner_race: 'INDIAN', learner_gender: 'FEMALE' },
    ];
    const counts = byField(deriveTrainingCounts(rows));
    expect(counts.derived_training_rows_by_race).toEqual([
      { learner_race: 'AFRICAN', rows: 11 },
      { learner_race: 'INDIAN', rows: 1 },
    ]);
    // "MALE" and "FEMALE" are two letters apart, and both are real groups.
    expect(counts.derived_training_rows_by_gender).toEqual([
      { learner_gender: 'MALE', rows: 10 },
      { learner_gender: 'FEMALE', rows: 2 },
    ]);
  });
});
