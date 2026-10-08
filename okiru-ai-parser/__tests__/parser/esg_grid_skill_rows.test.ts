/**
 * A register read through its ESG skill must come back with its rows ONCE.
 *
 * A skill adds its own rows field to the keys asked for. For seven ESG registers
 * that name is the grid's rows field too (risk_register_rows,
 * training_intervention_rows, waste_stream_rows, ee_level_rows,
 * fleet_debrief_rows, fleet_vehicle_rows, fleet_fuel_transaction_rows). A model
 * that answers under the skill's name used to have its array stored twice: once
 * as an ordinary field, then again by the grid pass, which finds the same array.
 * The workbook then held every register row twice, and a fuel card statement
 * doubled each vehicle's monthly litres (the bridge adds up every fill in a
 * month). The real ESG skills are loaded; every value is invented.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
import { extractWithSpec, type ExtractionModel } from '../../src/services/aiExtraction.js';
import { extractionDomain } from '../../src/services/extractionDomain.js';
import { resetSkillsCache } from '../../src/services/skills.js';
import { ESG_DOCUMENT_MATRIX } from '../../schemas/esg_document_matrix.js';

function modelReturning(payload: unknown): ExtractionModel {
  return { name: 'scripted', async complete() { return JSON.stringify(payload); } } as ExtractionModel;
}

const spec = (id: string) => ESG_DOCUMENT_MATRIX.find((d) => d.id === id)!;
const arrays = (values: Array<{ field: string; value: unknown }>) => values.filter((v) => Array.isArray(v.value));

let saved: { dir?: string; flag?: string } = {};
beforeEach(() => {
  saved = { dir: process.env.PARSER_SKILLS_DIR, flag: process.env.PARSER_SKILLS };
  delete process.env.PARSER_SKILLS_DIR;
  delete process.env.PARSER_SKILLS;
  resetSkillsCache();
  resetExtractionCache();
});
afterEach(() => {
  if (saved.dir === undefined) delete process.env.PARSER_SKILLS_DIR; else process.env.PARSER_SKILLS_DIR = saved.dir;
  if (saved.flag === undefined) delete process.env.PARSER_SKILLS; else process.env.PARSER_SKILLS = saved.flag;
  resetSkillsCache();
});

describe('an ESG register read through its skill', () => {
  it('the real ESG skills are loaded and name the grid rows field', () => {
    expect(extractionDomain('esg').skillFor('risk_assurance__risk_register_including_climate')?.rowsField)
      .toBe('risk_register_rows');
  });

  it('returns the risk register rows once when the model answers under the skill rows field', async () => {
    const model = modelReturning({
      register_last_review_date: '2025-11-03',
      climate_risk_in_register: 'Yes',
      risk_register_rows: [
        { risk_id: '1', risk_description: 'Invented supply interruption', risk_category: 'External', mitigation_action: 'Invented standby plan' },
        { risk_id: '2', risk_description: 'Invented flood exposure', risk_category: 'External', mitigation_action: 'Invented continuity plan' },
        { risk_id: '3', risk_description: 'Invented skills shortage', risk_category: 'Internal', mitigation_action: 'Invented training plan' },
      ],
      exceptions: [],
    });
    const result = await extractWithSpec(model, spec('risk_assurance__risk_register_including_climate'), {
      filename: 'Invented risk register.xlsx',
      raw_text: 'Risk register. Revised 2025-11-03.',
    }, { domain: 'esg' });

    const rows = arrays(result.values);
    expect(rows).toHaveLength(1);
    expect(rows[0].field).toBe('risk_register_rows');
    expect(rows[0].value as unknown[]).toHaveLength(3);
    expect(result.values.filter((v) => v.field === 'risk_register_rows')).toHaveLength(1);
    // The register's own facts are still read.
    expect(result.values.find((v) => v.field === 'register_last_review_date')?.value).toBe('2025-11-03');
    expect(result.missingFields).not.toContain('risk_register_rows');
  });

  it('returns a fuel card statement\'s fills once, so no month counts its litres twice', async () => {
    const model = modelReturning({
      fuel_card_provider: 'Invented Fuel Cards',
      total_litres_period: 300,
      fleet_fuel_transaction_rows: [
        { transaction_date: '2025-04-02', vehicle_registration: 'INV001GP', fuel_litres: 120 },
        { transaction_date: '2025-04-19', vehicle_registration: 'INV001GP', fuel_litres: 180 },
      ],
      exceptions: [],
    });
    const result = await extractWithSpec(model, spec('fleet__fuel_card_statement'), {
      filename: 'Invented fuel card statement.pdf',
      raw_text: 'Fuel card statement April 2025',
    }, { domain: 'esg' });

    const rows = arrays(result.values);
    expect(rows).toHaveLength(1);
    expect(rows[0].field).toBe('fleet_fuel_transaction_rows');
    const litres = (rows[0].value as Array<{ fuel_litres: number }>).reduce((sum, row) => sum + row.fuel_litres, 0);
    expect(litres).toBe(300);
  });

  it('still keeps the rows once when the model answers under the expert prompt\'s container key', async () => {
    const model = modelReturning({
      register_last_review_date: '2025-11-03',
      risks: [{ risk_id: '1', risk_description: 'Invented supply interruption' }],
    });
    const result = await extractWithSpec(model, spec('risk_assurance__risk_register_including_climate'), {
      filename: 'Invented risk register.xlsx',
      raw_text: 'Risk register',
    }, { domain: 'esg' });
    const rows = arrays(result.values);
    expect(rows).toHaveLength(1);
    expect(rows[0].field).toBe('risk_register_rows');
  });

  it('reports a register with no rows missing once, not twice', async () => {
    const model = modelReturning({ register_last_review_date: '2025-11-03', risk_register_rows: [] });
    const result = await extractWithSpec(model, spec('risk_assurance__risk_register_including_climate'), {
      filename: 'Invented risk register.xlsx',
      raw_text: 'Risk register',
    }, { domain: 'esg' });
    expect(arrays(result.values)).toHaveLength(0);
    expect(result.missingFields.filter((f) => f === 'risk_register_rows')).toHaveLength(1);
  });
});
