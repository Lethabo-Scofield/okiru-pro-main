/**
 * The agent loop on ESG documents ("replicate the B-BBEE solution for ESG").
 *
 *  1. Targets come from the ESG matrix and the ESG skills (skills/esg), tagged
 *     esg; B-BBEE targets stay untagged and their prompts unchanged.
 *  2. ESG has no rule-based reader: the type is the skill Pass A named, and
 *     the gate's low-confidence signal is Pass A's.
 *  3. ESG value checks: a quantity and its unit, a unit field, an account or
 *     meter number, a period. A column sum is a check, never a submitted value.
 *  4. The ESG case extraction reads a typed document with its skill's spec
 *     (both bills on a combined account) and runs the agent on a hard one.
 *
 * Stub models only; every name, number and amount here is invented.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  agentGateDecision,
  agentSystemPrompt,
  agentTargetFor,
  agentTools,
  checkValue,
  chooseAgentTarget,
  inferType,
  mergeAgentValues,
  unitFamilyOfField,
  validateRow,
  validateSubmission,
  valueInQuote,
  agentDocumentFrom,
  DEFAULT_AGENT_LIMITS,
  type AgentTarget,
} from '../../src/services/agentExtraction.js';
import type { AgentTurn, AgentToolCall } from '../../src/services/agentModel.js';
import type { DocumentExtraction, ExtractionModel } from '../../src/services/aiExtraction.js';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
import { resetClassificationCacheForTest } from '../../src/services/documentClassification.js';
import { esgAgentTyping, esgSkillSpecIds, extractEsgCaseEntities } from '../../src/services/esgCaseExtraction.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';

beforeEach(() => {
  resetExtractionCache();
  resetClassificationCacheForTest();
});

const ELECTRICITY = 'ghg_energy__municipal_electricity_bill';
const WATER = 'water__municipal_water_bill';
const CIPC = 'ownership__cipc_registration_documents_cor14_1_cor14_3';

function esgTarget(id: string): AgentTarget {
  const t = agentTargetFor(id, 'esg');
  if (!t) throw new Error(`no ESG target for ${id}`);
  return t;
}

function input(over: Partial<RawExtractionInput> & { filename: string }): RawExtractionInput {
  return { file_id: over.filename, mime_type: 'application/pdf', raw_text: '', tables: [], metadata: {}, ...over };
}

// ─── 1. Targets ─────────────────────────────────────────────────────────────

describe('ESG targets', () => {
  it('reads an ESG spec through its ESG skill, tagged esg, with the skill rows', () => {
    const t = esgTarget(ELECTRICITY);
    expect(t.skillId).toBe('municipal_electricity_bill');
    expect(t.domain).toBe('esg');
    expect(t.hard).toBe(true);
    expect(t.rows?.field).toBe('electricity_period_rows');
    expect(t.fields.find((f) => f.name === 'electricity_kwh')?.type).toBe('number');
  });

  it('reads a type only an ESG skill declares (a group policy) by the skill id', () => {
    const t = esgTarget('policy_document');
    expect(t.specId).toBe('policy_document');
    expect(t.domain).toBe('esg');
  });

  it('keeps the two domains apart; B-BBEE targets carry no domain at all', () => {
    expect(agentTargetFor(ELECTRICITY)).toBeNull();
    expect(agentTargetFor(CIPC, 'esg')).toBeNull();
    expect(agentTargetFor(CIPC)?.domain).toBeUndefined();
  });

  it('infers ESG quantities from field names, only for ESG', () => {
    expect(inferType('line_electricity_kwh', 'esg')).toBe('number');
    expect(inferType('fuel_litres', 'esg')).toBe('number');
    expect(inferType('water_kl', 'esg')).toBe('number');
    expect(inferType('electricity_rand_excl_vat', 'esg')).toBe('money');
    // B-BBEE inference is unchanged.
    expect(inferType('line_electricity_kwh')).toBe('text');
    expect(inferType('total_litres')).toBe('money');
  });
});

// ─── 2. The type comes from Pass A ──────────────────────────────────────────

describe('the ESG type is the skill Pass A named', () => {
  const scan = input({ filename: 'Depot A March.pdf', raw_text: 'TENANT RECOVERY Units 18 420.5' });

  it('targets the named skill even when the first read found nothing', () => {
    const typing = esgAgentTyping(scan.filename, { element: 'GHG_ENERGY', documentType: 'Recovery', confidence: 0.8, skillId: 'municipal_electricity_bill' });
    const choice = chooseAgentTarget([], typing, scan, 'esg');
    expect(choice?.source).toBe('classifier');
    expect(choice?.target.specId).toBe(ELECTRICITY);
    expect(choice?.target.domain).toBe('esg');
  });

  it('a type Pass A was not confident about is not used; its confidence still opens the gate', () => {
    const typing = esgAgentTyping(scan.filename, { element: 'GHG_ENERGY', documentType: 'Account', confidence: 0.4, skillId: 'municipal_electricity_bill' });
    expect(typing.document_type).toBeUndefined();
    const t = esgTarget(ELECTRICITY);
    const decision = agentGateDecision('hard', {
      scanned: false, deterministic: typing, requiredMissingRatio: 0, checksumFailed: false, skillHard: false,
    });
    expect(decision.reasons).toEqual(['classifier low confidence']);
    expect(t.hard).toBe(true);
  });

  it('B-BBEE keeps its own reason text for its rule-based reader', () => {
    const decision = agentGateDecision('hard', {
      scanned: false, deterministic: { filename: 'x', overall_confidence: 0.4 }, requiredMissingRatio: 0, checksumFailed: false, skillHard: false,
    });
    expect(decision.reasons).toEqual(['deterministic low confidence']);
  });
});

// ─── 3. ESG value checks ────────────────────────────────────────────────────

describe('ESG value checks', () => {
  const t = esgTarget(ELECTRICITY);
  const failed = (field: string, value: unknown, parts?: unknown[]) => checkValue(t, field, value, parts).ok === false;

  it('a quantity is a number, alone or with a unit that measures what the field measures', () => {
    expect(failed('electricity_kwh', '18 420.5')).toBe(false);
    expect(failed('electricity_kwh', '18 420.5 kWh')).toBe(false);
    expect(failed('electricity_kwh', '18 420.5 kL')).toBe(true);
    expect(failed('electricity_kwh', 'Consumption: 18 420.5')).toBe(true);
    expect(failed('electricity_kwh', 'about eighteen thousand')).toBe(true);
    expect(unitFamilyOfField('water_kl')).toBe('volume');
  });

  it('a unit field holds a unit, of the right kind', () => {
    expect(failed('electricity_unit', 'kWh')).toBe(false);
    expect(failed('electricity_unit', 'MWh')).toBe(false);
    expect(failed('electricity_unit', 'kL')).toBe(true);
    expect(failed('electricity_unit', 'Consumption')).toBe(true);
  });

  it('an account or meter number is the number, not its label line', () => {
    expect(failed('utility_account_number', '00412')).toBe(false);
    expect(failed('meter_number', 'AB-1234 567')).toBe(false);
    expect(failed('utility_account_number', 'Account No: 00412')).toBe(true);
    expect(failed('meter_number', 'Main')).toBe(true);
  });

  it('a column sum is a check of printed parts, and never a submitted value', () => {
    expect(failed('electricity_kwh', '300', ['100', '200'])).toBe(false);
    expect(failed('electricity_kwh', '301', ['100', '200'])).toBe(true);
    const doc = agentDocumentFrom(input({ filename: 'b.pdf', raw_text: 'Meter A 100 kWh\nMeter B 200 kWh' }));
    const summed = validateSubmission({ field: 'electricity_kwh', value: '300', page: 1, quote: 'Meter A 100 kWh Meter B 200 kWh' }, t, doc);
    expect(summed.ok).toBe(false);
    const printed = validateSubmission({ field: 'electricity_kwh', value: '200 kWh', page: 1, quote: 'Meter B 200 kWh' }, t, doc);
    expect(printed.ok).toBe(true);
  });

  it('a quantity with a unit needs the unit in its quote', () => {
    expect(valueInQuote('18 420.5 kWh', 'Units 18 420.5 kWh', 'number')).toBe(true);
    expect(valueInQuote('18 420.5 kWh', 'Units 18 420.5', 'number')).toBe(false);
  });
});

// ─── 3b. A unit the field's name excludes ───────────────────────────────────
//
// Nothing downstream reads electricity_unit or waste_mass_unit: a figure in
// electricity_kwh IS kWh and one in waste_total_kg IS kg. A MWh or tonne
// figure there would be read 1 000 times too small, so a field whose name
// carries a unit takes that unit or a bare figure, never another.

describe('a field whose name carries a unit', () => {
  const power = esgTarget(ELECTRICITY);
  const water = esgTarget(WATER);
  const waste = esgTarget('waste__contractor_report_safe_disposal_certificate');
  const bowser = esgTarget('ghg_energy__generator_diesel_bowser_reconciliation');
  const debrief = esgTarget('fleet__telematics_driver_debrief_report');
  const assurance = esgTarget('risk_assurance__external_assurance_statement');
  const failed = (t: AgentTarget, field: string, value: unknown) => checkValue(t, field, value).ok === false;

  it('refuses another unit of the same kind (the 1 000x trap)', () => {
    expect(failed(power, 'electricity_kwh', '35.75 MWh')).toBe(true);
    expect(failed(power, 'solar_kwh_exported_to_grid', '1.2 MWh')).toBe(true);
    expect(failed(waste, 'waste_total_kg', '0.2 t')).toBe(true);
    expect(failed(waste, 'waste_total_kg', '0.2 tonnes')).toBe(true);
    expect(failed(bowser, 'deliveries_litres', '12 kL')).toBe(true);
    expect(failed(water, 'water_kl', '85 000 litres')).toBe(true);
    expect(failed(assurance, 'ghg_verified_scope1_tco2e', '1 234 kgCO2e')).toBe(true);
  });

  it('takes its own unit, or a bare figure', () => {
    expect(failed(power, 'electricity_kwh', '18 420.5 kWh')).toBe(false);
    expect(failed(power, 'electricity_kwh', '18 420.5')).toBe(false);
    expect(failed(waste, 'waste_total_kg', '1 250 kg')).toBe(false);
    expect(failed(bowser, 'deliveries_litres', '12 000 L')).toBe(false);
    expect(failed(debrief, 'total_distance_km', '4 512 km')).toBe(false);
    // A cubic metre is a kilolitre: the same figure, nothing converted.
    expect(failed(water, 'water_kl', '85 kl')).toBe(false);
    expect(failed(water, 'water_kl', '85 m3')).toBe(false);
    expect(failed(assurance, 'ghg_verified_scope1_tco2e', '1 234.5 tCO2e')).toBe(false);
    expect(failed(assurance, 'ghg_verified_scope1_tco2e', '1 234.5 t CO2e')).toBe(false);
  });

  it('a rate field is not the unit it is per: R/kWh names no kWh quantity', () => {
    expect(failed(power, 'electricity_tariff_rand_per_kwh', '2.1543')).toBe(false);
  });

  it('a refusal names the unit and says not to convert', () => {
    const verdict = checkValue(power, 'electricity_kwh', '35.75 MWh');
    expect(verdict.checks.join(' ')).toMatch(/mwh/i);
    expect(verdict.checks.join(' ')).toMatch(/never convert/i);
  });

  it('the agent cannot submit it: with its unit, or bare beside the unit in its quote', () => {
    const doc = agentDocumentFrom(input({ filename: 'bill.pdf', raw_text: 'Bulk supply\nActive energy 35.75 MWh\nUnits 18 420.5 kWh\nConsumption 990' }));
    const submit = (value: string, quote: string) => validateSubmission({ field: 'electricity_kwh', value, page: 1, quote }, power, doc);
    expect(submit('35.75 MWh', 'Active energy 35.75 MWh').ok).toBe(false);
    expect(submit('35.75', 'Active energy 35.75 MWh').ok).toBe(false);
    // Its own unit beside it, or none printed at all: kept.
    expect(submit('18 420.5', 'Units 18 420.5 kWh').ok).toBe(true);
    expect(submit('990', 'Consumption 990').ok).toBe(true);
  });

  it('a row cell is held to its column name the same way', () => {
    const doc = agentDocumentFrom(input({ filename: 'bill.pdf', raw_text: 'Depot A 01/02/2026 28/02/2026 35.75 MWh R 66 912.40' }));
    const row = (kwh: string) => validateRow({
      cells: { line_site: 'Depot A', line_period_end: '28/02/2026', line_electricity_kwh: kwh },
      page: 1,
      quote: 'Depot A 01/02/2026 28/02/2026 35.75 MWh R 66 912.40',
    }, power, doc);
    expect(row('35.75 MWh').ok).toBe(false);
    expect(row('35.75').ok).toBe(false);
  });

  it('a figure refused only for its unit reaches the reviewer as an exception, never as a value', () => {
    const quote = 'Active energy 35.75 MWh';
    const merged = mergeAgentValues([], power, 'bill.pdf', {
      values: [],
      rejected: [{
        field: 'electricity_kwh',
        reason: 'unit',
        unitConflict: { value: '35.75', unit: 'mwh', quote, page: 1 },
      }],
      turns: 1, tokens: 0, toolCalls: 1, stopReason: 'submitted',
    });
    const bill = merged.extractions.find((e) => e.documentId === ELECTRICITY)!;
    expect(bill.values.some((v) => v.field === 'electricity_kwh')).toBe(false);
    expect(bill.exceptions.some((e) => e.includes('electricity_kwh') && e.includes('35.75') && /mwh/i.test(e))).toBe(true);
  });

  it('a kept figure is stored without its unit: the field name already says it', () => {
    const doc = agentDocumentFrom(input({ filename: 'bill.pdf', raw_text: 'Water consumption 85 m3' }));
    const kept = validateSubmission({ field: 'water_kl', value: '85 m3', page: 1, quote: 'Water consumption 85 m3' }, water, doc);
    expect(kept.ok).toBe(true);
    expect(kept.ok && kept.value.value).toBe('85');
  });
});

// ─── 3c. A unit with a digit in it ──────────────────────────────────────────

describe('m3 and tCO2e are units, not digits of the figure', () => {
  const water = esgTarget(WATER);
  const assurance = esgTarget('risk_assurance__external_assurance_statement');

  it('reads the figure without the unit\'s digit', () => {
    const m3 = checkValue(water, 'water_kl', '258 m3');
    expect(m3.ok).toBe(true);
    expect(m3.checks).toContain('PASS: reads as 258');
    const co2 = checkValue(assurance, 'ghg_verified_scope2_tco2e', '12.3 tCO2e');
    expect(co2.ok).toBe(true);
    expect(co2.checks).toContain('PASS: reads as 12.3');
  });

  it('finds the unit in the quote', () => {
    expect(valueInQuote('12.3 tCO2e', 'Scope 2: 12.3 tCO2e', 'number')).toBe(true);
    expect(valueInQuote('258 m3', 'Consumption 258 m3', 'number')).toBe(true);
    expect(valueInQuote('12.3 tCO2e', 'Scope 2: 12.3', 'number')).toBe(false);
  });
});

// ─── 3d. Periods and identifiers ────────────────────────────────────────────

describe('ESG period and identifier checks', () => {
  const solar = esgTarget('ghg_energy__solar_generation_report');
  const power = esgTarget(ELECTRICITY);
  const failed = (t: AgentTarget, field: string, value: unknown) => checkValue(t, field, value).ok === false;

  it('a period names a year or a month and year, not any word and two digits', () => {
    expect(failed(solar, 'reporting_period_start', 'Depot 12')).toBe(true);
    expect(failed(solar, 'reporting_period_start', 'Mar-25')).toBe(false);
    expect(failed(solar, 'reporting_period_start', "Jul '25")).toBe(false);
    expect(failed(solar, 'reporting_period_start', 'FY2025')).toBe(false);
  });

  it('an account number with its label printed after it is still the label line', () => {
    expect(failed(power, 'utility_account_number', '00412 Account')).toBe(true);
    expect(failed(power, 'meter_number', '7731 Meter No')).toBe(true);
    expect(failed(power, 'utility_account_number', '4100 2233 9')).toBe(false);
  });
});

// ─── The prompt ─────────────────────────────────────────────────────────────

describe('the ESG agent prompt', () => {
  it('speaks as an ESG analyst about units, periods and sums; B-BBEE is word for word as before', () => {
    const esg = agentSystemPrompt(esgTarget(ELECTRICITY), DEFAULT_AGENT_LIMITS, false);
    expect(esg.startsWith('You are an ESG assurance analyst')).toBe(true);
    expect(esg).toContain('never convert one unit into another');
    expect(esg).toContain('Never submit a total you added up yourself');
    expect(esg).not.toContain('B-BBEE Status Level');
    const bbbee = agentSystemPrompt(agentTargetFor(CIPC)!, DEFAULT_AGENT_LIMITS, false);
    expect(bbbee.startsWith('You are a B-BBEE verification analyst')).toBe(true);
    expect(bbbee).toContain('quote "B-BBEE Status Level: Level 1", not "1"');
    expect(bbbee).not.toContain('Never submit a total you added up yourself');
    const check = (domain?: 'esg') => agentTools({ images: false, ...(domain ? { domain } : {}) }).find((tool) => tool.function.name === 'check_value')!.function.description;
    expect(check()).toContain('identifier check digits (SA ID, CIPC, VAT)');
    expect(check('esg')).toContain('A sum is only a check');
  });
});

// ─── 4. The ESG case extraction ─────────────────────────────────────────────

describe('ESG case extraction: skill routing and the agent pass', () => {
  const both = { filename: 'Depot A account.pdf', raw_text: 'Electricity 1 200 kWh\nWater consumption 35 kL' };
  const cls = (skillId: string, confidence = 0.9) => ({ element: 'GHG_ENERGY' as const, documentType: 'Bill', confidence, skillId });

  it('reads a typed document with its skill\'s one spec, and both bills on a combined account', () => {
    expect(esgSkillSpecIds(cls('municipal_electricity_bill'), { filename: 'a.pdf', raw_text: 'Electricity 1 200 kWh' })).toEqual([ELECTRICITY]);
    expect(esgSkillSpecIds(cls('municipal_electricity_bill'), both)).toEqual([ELECTRICITY, WATER]);
    expect(esgSkillSpecIds(cls('municipal_water_bill'), both)).toEqual([WATER, ELECTRICITY]);
    expect(esgSkillSpecIds(cls('policy_document'), both)).toEqual(['policy_document']);
    expect(esgSkillSpecIds(cls('municipal_electricity_bill', 0.3), both)).toBeNull();
    expect(esgSkillSpecIds(null, both)).toBeNull();
  });

  it('reads both EE specs when one file prints the workforce analysis AND the EE plan forms', () => {
    const report = 'employment_equity__eea2_eea4_report';
    const plan = 'employment_equity__ee_plan_and_forum_minutes';
    const ee = (skillId: string) => ({ element: 'EMPLOYMENT_EQUITY' as const, documentType: 'EE', confidence: 0.9, skillId });
    const combined = { filename: 'Acme EE.pdf', raw_text: 'FORM EEA 12 Section 19 analysis\nWorkforce profile\n...\nFORM EEA13 Employment Equity Plan\nNumerical goals' };
    expect(esgSkillSpecIds(ee('ee_plan'), combined)).toEqual([plan, report]);
    expect(esgSkillSpecIds(ee('employment_equity_report'), combined)).toEqual([report, plan]);
    // One form alone is one document.
    expect(esgSkillSpecIds(ee('ee_plan'), { filename: 'plan.pdf', raw_text: 'FORM EEA13 Employment Equity Plan' })).toEqual([plan]);
    expect(esgSkillSpecIds(ee('employment_equity_report'), { filename: 'eea2.pdf', raw_text: 'EEA2 Workforce profile' })).toEqual([report]);
  });

  it('runs the agent on a scanned bill the first read got nothing from, and files its cited values', async () => {
    const scan = input({
      filename: 'Depot A recovery.pdf',
      raw_text: 'Example Estates Services\nTENANT UTILITY RECOVERY\nPremises: Unit 4, Depot A\nPeriod 01/02/2026 - 28/02/2026\nElectricity Units 18 420.5',
      metadata: { scanned: true },
    });
    let n = 0;
    const call = (name: string, args: Record<string, unknown>): AgentToolCall => ({ id: `c${++n}`, type: 'function', function: { name, arguments: JSON.stringify(args) } });
    const asked: string[] = [];
    let agentSystem = '';
    const model: ExtractionModel = {
      name: 'stub',
      async complete(system, user) {
        asked.push(user);
        if (/Classify ONE client document/.test(system)) {
          return JSON.stringify({ element: 'GHG_ENERGY', document_type: 'Tenant recovery', confidence: 0.9, document_type_id: 'municipal_electricity_bill' });
        }
        return '{}';
      },
      async completeWithTools(messages): Promise<AgentTurn> {
        agentSystem = String(messages[0].content);
        return {
          message: {
            role: 'assistant',
            content: null,
            tool_calls: [call('submit_values', {
              values: [
                { field: 'electricity_kwh', value: '18 420.5', page: 1, quote: 'Electricity Units 18 420.5' },
                { field: 'site_name', value: 'Unit 4, Depot A', page: 1, quote: 'Premises: Unit 4, Depot A' },
                // Added up, not printed: refused.
                { field: 'max_demand_kva', value: '99', page: 1, quote: 'Electricity Units 18 420.5' },
              ],
            })],
          },
        };
      },
    };
    const result = await extractEsgCaseEntities([scan], model, undefined, { agent: { mode: 'hard' } });
    // Read with the skill's spec only: no solar generation, no water read.
    const extractionPrompts = asked.filter((user) => user.startsWith('ANALYST INSTRUCTION'));
    expect(extractionPrompts).toHaveLength(1);
    expect(extractionPrompts[0]).toContain('SKILL: municipal_electricity_bill');
    expect(agentSystem.startsWith('You are an ESG assurance analyst')).toBe(true);
    const bill = result!.extractions.find((e: DocumentExtraction) => e.documentId === ELECTRICITY)!;
    expect(bill.agent?.reasons).toContain('scanned');
    expect(bill.agent?.target?.source).toBe('classifier');
    const kwh = bill.values.find((v) => v.field === 'electricity_kwh');
    expect(kwh?.source?.method).toBe('agent');
    expect(bill.values.some((v) => v.field === 'max_demand_kva')).toBe(false);
  });

  it('a first-pass figure in a unit the field name excludes reaches the reviewer, never the values', async () => {
    const bill = input({
      filename: 'Depot A account.pdf',
      raw_text: 'Example Estates Services\nMunicipal electricity account\nActive energy 35.75 MWh\nPeriod 01/02/2026 - 28/02/2026',
    });
    const model: ExtractionModel = {
      name: 'stub',
      async complete(system) {
        if (/Classify ONE client document/.test(system)) {
          return JSON.stringify({ element: 'GHG_ENERGY', document_type: 'Bill', confidence: 0.9, document_type_id: 'municipal_electricity_bill' });
        }
        return JSON.stringify({ electricity_kwh: '35.75 MWh', billing_period_end: '28/02/2026', exceptions: [] });
      },
    };
    const result = await extractEsgCaseEntities([bill], model);
    const read = result!.extractions.find((e: DocumentExtraction) => e.documentId === ELECTRICITY)!;
    expect(read.values.some((v) => v.field === 'electricity_kwh')).toBe(false);
    expect(read.exceptions.some((x) => /electricity_kwh: "35\.75 MWh" is printed in mwh/.test(x))).toBe(true);
  });

  it('never sends a workbook sheet to the agent in hard mode, and is off without the context', async () => {
    let toolCalls = 0;
    const model: ExtractionModel = {
      name: 'stub',
      async complete() { return '{}'; },
      async completeWithTools(): Promise<AgentTurn> {
        toolCalls += 1;
        return { message: { role: 'assistant', content: null, tool_calls: [] } };
      },
    };
    const sheet = input({
      filename: 'Readings.xlsx › Sheet1',
      mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      raw_text: 'Site | kWh\nDepot A | 100',
      metadata: { sheet_name: 'Sheet1' },
    });
    await extractEsgCaseEntities([sheet], model, undefined, { agent: { mode: 'hard' } });
    const scan = input({ filename: 'scan.pdf', raw_text: 'Electricity Units 100', metadata: { scanned: true } });
    await extractEsgCaseEntities([scan], model);
    expect(toolCalls).toBe(0);
  });
});
