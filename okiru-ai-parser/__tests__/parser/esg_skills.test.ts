/**
 * The ESG per-document-type skills (skills/esg): they load, they point at real
 * ESG matrix specs (or declare a new type), their field names are the ones the
 * ESG pipeline already speaks (or are declared new), they teach the same
 * copy-don't-compute contract as the B-BBEE skills, and they carry no client
 * data — checked against the ESG document-level answer key when it is present
 * outside the repository.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  buildSkillRegistry,
  expectedKeysWithSkill,
  knownSkillTargets,
  loadSkills,
  resetSkillsCache,
  skillPromptSections,
  type Skill,
} from '../../src/services/skills.js';
import { ESG_DOCUMENT_MATRIX, findEsgDocumentById } from '../../schemas/esg_document_matrix.js';
import { VERIFICATION_DOCUMENT_MATRIX } from '../../schemas/verification_document_matrix.js';
import { esgGridDocuments } from '../../src/services/extractionDomain.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const parserRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(parserRoot, '..');
const skillsRoot = path.join(parserRoot, 'skills');
const skillsDir = path.join(skillsRoot, 'esg');

/** The ESG skills this set ships, by file id (ranked by the ESG baseline's gaps). */
const ESG_SKILLS = [
  'municipal_electricity_bill',
  'municipal_water_bill',
  'employment_equity_report',
  'ee_plan',
  'generator_diesel_bowser_reconciliation',
  'fleet_fuel_statement',
  'waste_contractor_report',
  'fleet_vehicle_register',
  'injury_statistics_report',
  'training_intervention_register',
  'driver_debrief_report',
  'policy_document',
  'environmental_policy',
  'ethics_code',
  'supplier_code_of_conduct',
  'supplier_questionnaire',
  'iso14001_audit_or_certificate',
  'risk_register',
  'hs_training_register',
  'environmental_data_dashboard',
  'emissions_system_export',
];

/**
 * Every field name some existing ESG code already speaks: the ESG matrix's
 * expected fields, the grid row fields and rows fields, the ESG calculator
 * mapping, and the code readers' monthly register.
 */
function knownEsgFieldNames(): Set<string> {
  const known = new Set<string>();
  for (const doc of ESG_DOCUMENT_MATRIX) for (const field of doc.expectedFields) known.add(field);
  for (const { grid } of esgGridDocuments()) {
    known.add(grid.rowsField);
    for (const field of grid.rowFields) known.add(field);
  }
  const scrape = (file: string, pattern: RegExp) => {
    if (!existsSync(file)) return;
    for (const match of readFileSync(file, 'utf8').matchAll(pattern)) known.add(match[1]);
  };
  scrape(path.join(parserRoot, 'src/services/esgEntityCalculatorMapping.ts'), /field: '([a-z0-9_]+)'/g);
  for (const reader of ['esgMonthlyTables.ts', 'esgPeriodSummaries.ts', 'esgBillFacts.ts']) {
    scrape(path.join(parserRoot, 'src/services', reader), /\b(esg_monthly_rows|monthly_[a-z_]+)\b/g);
  }
  return known;
}

const registry = () => {
  resetSkillsCache();
  return loadSkills('esg', { root: skillsRoot });
};

describe('ESG skills loader — the shipped skills', () => {
  beforeEach(() => resetSkillsCache());

  it('loads every skill file in skills/esg, plus the ESG global rules', () => {
    const reg = registry();
    const files = readdirSync(skillsDir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
    expect(reg.skills.map((s) => s.id).sort()).toEqual(files.map((f) => f.replace(/\.md$/, '')).sort());
    expect(reg.skills.map((s) => s.id).sort()).toEqual([...ESG_SKILLS].sort());
    expect(reg.domain).toBe('esg');
    expect(reg.global?.traps).toMatch(/NEVER convert a unit/);
    expect(reg.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('every appliesTo names a real ESG matrix spec and resolves back to its skill, by id and by name', () => {
    const reg = registry();
    const targets = new Set(knownSkillTargets('esg'));
    for (const skill of reg.skills) {
      for (const target of skill.appliesTo) {
        expect(targets.has(target), `${skill.id} → ${target}`).toBe(true);
        expect(findEsgDocumentById(target), `${skill.id} → ${target}`).toBeTruthy();
        expect(reg.skillFor(target)?.id).toBe(skill.id);
        expect(reg.skillFor(findEsgDocumentById(target)!.name)?.id).toBe(skill.id);
      }
    }
  });

  it('a B-BBEE spec id is not an ESG target: the domains never cross', () => {
    const header = 'appliesTo: [ownership__securities_share_register]\nelement: FLEET\nversion: 1\nclassify: { is: "x" }\nfields:\n  - { name: depot_name, type: text, description: "x" }';
    const sections = '## What it is / is not\nx\n## Where values sit\nx\n## Traps\nx\n## Worked example\nx\n';
    expect(() => buildSkillRegistry('esg', [{ file: '/skills/esg/a.md', content: `---\nid: a\n${header}\n---\n${sections}` }]))
      .toThrow(/neither a esg matrix id/);
    // ...and an ESG element is not a B-BBEE one.
    expect(() => buildSkillRegistry('bbbee', [{ file: '/skills/bbbee/a.md', content: `---\nid: a\n${header}\n---\n${sections}` }]))
      .toThrow(/element "FLEET"/);
  });

  it('registers the types the ESG matrix has no spec for, narrowing nothing', () => {
    const reg = registry();
    const byName = new Map(reg.newTypes.map((t) => [t.name, t]));
    expect([...byName.keys()].sort()).toEqual(['Client environmental data dashboard', 'Emissions inventory system export', 'Group policy document']);
    for (const t of reg.newTypes) expect(t.narrows).toBeNull();
    expect(reg.skillFor('Client environmental data dashboard')?.id).toBe('environmental_data_dashboard');
    expect(reg.skillFor('Group policy document')?.id).toBe('policy_document');
  });

  it('resolves matrix aliases only when one skill reads every carrier', () => {
    const reg = registry();
    expect(reg.skillFor('fleet list')?.id).toBe('fleet_vehicle_register');
    expect(reg.skillFor('waste manifest')?.id).toBe('waste_contractor_report');
    expect(reg.skillFor('SHE incidents register')?.id).toBe('injury_statistics_report');
    expect(reg.skillFor('EEA2 report')?.id).toBe('employment_equity_report');
    // A type no ESG skill reads yet.
    expect(reg.skillFor('ghg_energy__carbon_tax_return')).toBeNull();
  });

  it('field names are ones the ESG pipeline already speaks, or are declared new — and declared-new names really are new', () => {
    const reg = registry();
    const known = knownEsgFieldNames();
    expect(known.has('energy_site_rows') && known.has('esg_monthly_rows') && known.has('monthly_value')).toBe(true);
    for (const skill of reg.skills) {
      const declaredNew = new Set(skill.newFields);
      const names = [...skill.fields.map((f) => f.name), ...(skill.rowsField ? [skill.rowsField] : [])];
      for (const name of names) {
        expect(known.has(name) || declaredNew.has(name), `${skill.id}: "${name}" is neither known nor in newFields`).toBe(true);
      }
      for (const name of declaredNew) {
        expect(known.has(name), `${skill.id}: "${name}" is listed as new but existing code already speaks it`).toBe(false);
      }
    }
  });

  it('a field name shared by two skills means the same type in both', () => {
    const typeOf = new Map<string, string>();
    for (const skill of registry().skills) {
      for (const field of skill.fields) {
        const seen = typeOf.get(field.name);
        if (seen) expect(field.type, `${skill.id}.${field.name}`).toBe(seen);
        else typeOf.set(field.name, field.type);
      }
    }
  });

  it('a skill whose spec is a grid returns its rows under that grid\'s own rows field', () => {
    const grids = new Map(esgGridDocuments().map(({ documentId, grid }) => [documentId, grid]));
    for (const skill of registry().skills) {
      for (const target of skill.appliesTo) {
        const grid = grids.get(target);
        if (!grid || !skill.rowsField) continue;
        // The bill grids also read a single site at the top level; their skills
        // keep the bill's lines in a rows field of their own.
        if (grid.rowsField === 'energy_site_rows') continue;
        expect(skill.rowsField, `${skill.id} (${target})`).toBe(grid.rowsField);
        // The grid's identity column (its first) is one of the skill's row fields.
        expect(skill.fields.some((f) => f.rowLevel && f.name === grid.rowFields[0]), `${skill.id}: ${grid.rowFields[0]}`).toBe(true);
      }
    }
  });

  it('one name at both levels is one quantity: same type, never twice at one level', () => {
    const sections = '## What it is / is not\nx\n## Where values sit\nx\n## Traps\nx\n## Worked example\nx\n';
    const file = (fields: string) => [{
      file: '/skills/esg/a.md',
      content: `---\nid: a\nappliesTo: [waste__contractor_report_safe_disposal_certificate]\nelement: WASTE\nversion: 1\nclassify: { is: "x" }\nrowsField: waste_stream_rows\nfields:\n${fields}\n---\n${sections}`,
    }];
    const both = buildSkillRegistry('esg', file([
      '  - { name: waste_total_kg, type: number, description: "site total" }',
      '  - { name: waste_total_kg, type: number, rowLevel: true, description: "stream total" }',
    ].join('\n')));
    const keys = expectedKeysWithSkill(both.skills[0], ['waste_total_kg', 'site_name']);
    expect(keys).toEqual(['waste_total_kg', 'waste_stream_rows', 'site_name']);
    expect(() => buildSkillRegistry('esg', file([
      '  - { name: waste_total_kg, type: number, description: "x" }',
      '  - { name: waste_total_kg, type: number, description: "y" }',
    ].join('\n')))).toThrow(/declared twice/);
    expect(() => buildSkillRegistry('esg', file([
      '  - { name: waste_total_kg, type: number, description: "x" }',
      '  - { name: waste_total_kg, type: text, rowLevel: true, description: "y" }',
    ].join('\n')))).toThrow(/a number at one level and a text at the other/);
  });

  it('expected keys keep the spec\'s own keys the skill does not cover', () => {
    const reg = registry();
    const bill = reg.skillFor('ghg_energy__municipal_electricity_bill')!;
    const keys = expectedKeysWithSkill(bill, findEsgDocumentById('ghg_energy__municipal_electricity_bill')!.expectedFields);
    expect(keys).toContain('electricity_kwh');
    expect(keys).toContain('electricity_period_rows');
    expect(new Set(keys).size).toBe(keys.length);
    const sections = skillPromptSections(bill, reg.global);
    expect(sections.title).toBe('SKILL: municipal_electricity_bill v1');
    expect(sections.text).toContain('Always:');
    expect(sections.where).toContain('In every document:');
  });
});

// ─── One consistent contract (the same checks the B-BBEE skills pass) ───────

/** The worked example's JSON block, parsed. */
function exampleJson(skill: Skill): Record<string, unknown> {
  const block = skill.sections.example.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!block) throw new Error(`${skill.id}: the worked example has no \`\`\`json block`);
  return JSON.parse(block[1]) as Record<string, unknown>;
}

/** Labels too generic to tell one field from another once they become patterns. */
const GENERIC_LABELS = new Set([
  'total', 'date', 'name', 'status', 'level', 'type', 'ref', 'no.', '%', 'site', 'rate', 'amount', 'value', 'period', 'number',
]);

/** Filename hints that also match many other document types in an ESG pack. */
const STEALING_HINTS = new Set([
  'report', 'register', 'policy', 'statement', 'certificate', 'invoice', 'summary', 'list', 'esg', 'sustainability',
  'data', 'monthly', 'esg report', 'sustainability report', 'evaluation', 'audit',
]);

describe('every ESG skill speaks one contract', () => {
  const skills = registry().skills;

  it.each(skills.map((skill) => [skill.id, skill] as const))('%s: the worked example is ONE flat object keyed by the fields', (_id, skill) => {
    const example = exampleJson(skill);
    expect(Array.isArray(example)).toBe(false);
    expect(example).not.toHaveProperty('not_this_document');
    const documentFields = skill.fields.filter((f) => !f.rowLevel).map((f) => f.name);
    const rowFields = new Set(skill.fields.filter((f) => f.rowLevel).map((f) => f.name));
    const allowed = new Set([...documentFields, ...(skill.rowsField ? [skill.rowsField] : []), 'exceptions']);
    for (const key of Object.keys(example)) expect(allowed.has(key), `${skill.id}: example key "${key}" is not a field`).toBe(true);
    for (const name of documentFields) expect(example, `${skill.id}: example leaves out "${name}"`).toHaveProperty(name);
    if (skill.rowsField) {
      const rows = example[skill.rowsField];
      expect(Array.isArray(rows) && rows.length > 0, `${skill.id}: ${skill.rowsField} is an array of rows`).toBe(true);
      for (const row of rows as Array<Record<string, unknown>>) {
        for (const key of Object.keys(row)) expect(rowFields.has(key), `${skill.id}: row key "${key}" is not a row field`).toBe(true);
      }
    }
    expect(Array.isArray(example.exceptions), `${skill.id}: exceptions is a list`).toBe(true);
    // Counts are bare numbers, never words or strings.
    for (const field of skill.fields.filter((f) => f.type === 'count')) {
      const values = field.rowLevel
        ? ((example[skill.rowsField as string] as Array<Record<string, unknown>>) ?? []).map((row) => row[field.name])
        : [example[field.name]];
      for (const value of values) expect(value === null || value === undefined || typeof value === 'number', `${skill.id}.${field.name} = ${JSON.stringify(value)}`).toBe(true);
    }
  });

  it.each(skills.map((skill) => [skill.id, skill] as const))('%s: says what it is and is not, and every field is described', (_id, skill) => {
    expect(skill.classify.is.length).toBeGreaterThan(20);
    expect(skill.classify.isNot.length).toBeGreaterThanOrEqual(2);
    expect(skill.classify.filenameHints.length).toBeGreaterThanOrEqual(1);
    expect(skill.classify.contentSignals.length).toBeGreaterThanOrEqual(3);
    expect(skill.fields.some((f) => f.required), 'at least one required field').toBe(true);
    for (const field of skill.fields) expect(field.description.length, `${skill.id}.${field.name}`).toBeGreaterThan(10);
    expect(skill.sections.example).toMatch(/invented/i);
  });

  it.each(skills.map((skill) => [skill.id, skill] as const))('%s: the four sections come in order', (_id, skill) => {
    const body = readFileSync(skill.file, 'utf8').replace(/\r\n/g, '\n');
    let at = -1;
    for (const heading of ['## What it is / is not', '## Where values sit', '## Traps', '## Worked example']) {
      const next = body.indexOf(`${heading}\n`);
      expect(next, heading).toBeGreaterThan(at);
      at = next;
    }
  });

  it('no label belongs to two fields at the same level of one skill, and no label is a bare generic word', () => {
    for (const skill of skills) {
      for (const level of [false, true]) {
        const owner = new Map<string, string>();
        for (const field of skill.fields.filter((f) => f.rowLevel === level)) {
          for (const label of field.labels) {
            const key = label.trim().toLowerCase();
            expect(GENERIC_LABELS.has(key), `${skill.id}.${field.name} has the generic label "${label}"`).toBe(false);
            expect(owner.get(key) ?? field.name, `${skill.id}: label "${label}"`).toBe(field.name);
            owner.set(key, field.name);
          }
        }
      }
    }
  });

  it('filename hints never take other document types, and no two skills share one', () => {
    const owner = new Map<string, string>();
    for (const skill of skills) {
      for (const hint of skill.classify.filenameHints) {
        const key = hint.trim().toLowerCase();
        expect(STEALING_HINTS.has(key), `${skill.id} hint "${hint}"`).toBe(false);
        expect(owner.get(key) ?? skill.id, `hint "${hint}"`).toBe(skill.id);
        owner.set(key, skill.id);
      }
    }
  });

  it('dropFields name a field some target spec actually asks for (never a typo)', () => {
    for (const skill of skills) {
      const asked = new Set(skill.appliesTo.flatMap((t) => findEsgDocumentById(t)?.expectedFields ?? []));
      for (const name of skill.dropFields) expect(asked.has(name), `${skill.id} drops "${name}", which no target asks for`).toBe(true);
    }
  });

  it('account, meter, permit, certificate and reference numbers are text, never a CIPC regno', () => {
    for (const skill of skills) {
      for (const field of skill.fields) {
        if (/(account|meter|reference|permit|certificate|licence|note|order|invoice|vat)_numbers?$|_reference$|^vehicle_registration$/.test(field.name)) {
          expect(field.type, `${skill.id}.${field.name}`).toBe('text');
        }
      }
    }
  });

  it('a measured quantity is a number in its printed unit; Rand is money', () => {
    for (const skill of skills) {
      for (const field of skill.fields) {
        if (/(_kwh|_kl|_litres|_kg|_km|_hours|_kva)$/.test(field.name)) expect(field.type, `${skill.id}.${field.name}`).toBe('number');
        if (/_rand(_excl_vat)?$/.test(field.name)) expect(field.type, `${skill.id}.${field.name}`).toBe('money');
      }
    }
  });
});

// ─── The model copies; the code computes (and the expert rulings hold) ─────

describe('ESG: the model copies, the code computes', () => {
  const reg = registry();
  const names = (id: string) => reg.skillFor(id)!.fields.map((f) => f.name);
  const field = (id: string, name: string) => reg.skillFor(id)!.fields.find((f) => f.name === name)!;

  it('the global rules carry the unit, totals, N/A, boundary and no-target rulings', () => {
    const text = `${reg.global!.where}\n${reg.global!.traps}`;
    for (const rule of ['NEVER compute', 'NEVER convert a unit', 'totals cell can hold the wrong thing', 'N/A', 'not zero',
      'billing period is not a calendar month', 'No universal targets', 'boundary', '#DIV/0!', 'A blank form holds no data', 'File names lie']) {
      expect(text, rule).toContain(rule);
    }
    expect(text).not.toMatch(/not_this_document/);
  });

  it('LTIFR is per 1 000 000 hours and only ever copied: the code computes it from incidents and hours', () => {
    const she = reg.skillFor('health_safety__injury_statistics_report')!;
    expect(she.rowsField).toBe('incident_rows');
    expect(field('injury_statistics_report', 'ltifr').description).toMatch(/only .*prints/i);
    expect(field('injury_statistics_report', 'ltifr_rate_basis').description).toMatch(/1 000 000/);
    expect(field('injury_statistics_report', 'lost_time_injuries_count').description).toMatch(/Never count the rows yourself/);
    expect(field('injury_statistics_report', 'hours_worked').description).toMatch(/never estimate/i);
  });

  it('waste figures keep their printed unit, and a missing unit stays null', () => {
    expect(names('waste_contractor_report')).toContain('waste_mass_unit');
    expect(field('waste_contractor_report', 'waste_mass_unit').description).toMatch(/never assume/i);
    expect(field('waste_contractor_report', 'waste_diversion_percent').description).toMatch(/only .*prints/i);
    expect(reg.skillFor('waste_contractor_report')!.sections.traps).toMatch(/never convert/i);
  });

  it('water keeps kL and litres apart', () => {
    expect(names('municipal_water_bill')).toContain('water_unit');
    expect(reg.skillFor('municipal_water_bill')!.sections.traps).toMatch(/litres/);
  });

  it('a bill never turns an export credit into generation, nor a missing letterhead into a supplier', () => {
    expect(names('municipal_electricity_bill')).not.toContain('solar_kwh_generated');
    expect(field('municipal_electricity_bill', 'solar_kwh_exported_to_grid').description).toMatch(/never put it in a generated/i);
    expect(field('municipal_electricity_bill', 'municipality_or_supplier_name').description).toMatch(/Never inferred/);
  });

  it('a policy\'s budget rules and definitions are never results or targets', () => {
    for (const id of ['policy_document', 'environmental_policy', 'ethics_code', 'supplier_code_of_conduct']) {
      for (const name of names(id)) {
        expect(/^target_|_spend|_percent_of_npat|black_beneficiary|_rand$|_count$/.test(name) && !/^ethics_incidents_|^suppliers_/.test(name), `${id}.${name}`).toBe(false);
      }
    }
    // A group policy is routed to no ESG element: its dates must never land in
    // the environmental-policy cells the ISO_ENVIRONMENTAL mapping fills.
    expect(reg.skillFor('policy_document')!.element).toBe('OTHER');
    expect(reg.skillFor('policy_document')!.sections.traps).toMatch(/A rule is not a result/);
  });

  it('blank templates: the questionnaire skill fills no answer from the questions', () => {
    expect(reg.skillFor('supplier_questionnaire')!.sections.traps).toMatch(/blank/i);
    expect(reg.skillFor('iso14001_audit_or_certificate')!.sections.traps).toMatch(/not a certificate/i);
  });

  it('the dashboard and the system export copy totals as printed and flag them, never fix them', () => {
    for (const id of ['environmental_data_dashboard', 'emissions_system_export']) {
      expect(reg.skillFor(id)!.sections.traps.replace(/\s+/g, ' '), id).toMatch(/copy [^.]*as printed/i);
      expect(reg.skillFor(id)!.rowsField, id).toBe('esg_monthly_rows');
    }
  });

  it('no ESG skill asks for a derived or emissions figure the document does not print', () => {
    for (const skill of reg.skills) {
      for (const f of skill.fields) {
        expect(f.name.startsWith('derived_'), `${skill.id}.${f.name}`).toBe(false);
        if (/tco2e/.test(f.name)) expect(f.description, `${skill.id}.${f.name}`).toMatch(/as printed/i);
      }
    }
  });
});

// ─── No client data ─────────────────────────────────────────────────────────

describe('ESG skills carry no client data (generic patterns)', () => {
  it('name no evidence files and hold no unspaced 13-digit ID numbers', () => {
    for (const name of readdirSync(skillsDir).filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(path.join(skillsDir, name), 'utf8');
      expect(text.match(/\b[\w-]+\.(pdf|xlsx|xlsm|xls|docx|doc|csv|eml)\b/gi) ?? [], name).toEqual([]);
      expect(text.match(/(?<!\d)\d{13}(?!\d)/g) ?? [], name).toEqual([]);
    }
  });
});

/**
 * The ESG pack's document-level answer key lives outside the repository
 * (<pack>/.eval/doc-answer-key.json, gitignored). When it is present —
 * ESG_DOC_KEY, or the pack under docs/ of this checkout or of the main
 * checkout a worktree hangs off — every identifier, amount, distinctive
 * phrase, file-name word and capitalised name it records is derived at test
 * time and must not appear in any ESG skill. Nothing from it is written here,
 * and failures report counts and the skill file only.
 */
function esgDocKeyPath(): string | null {
  if (process.env.ESG_DOC_KEY) return existsSync(process.env.ESG_DOC_KEY) ? process.env.ESG_DOC_KEY : null;
  // Any evidence pack under docs/ (its folder name is never written here).
  for (const docs of [path.join(repoRoot, 'docs'), path.resolve(repoRoot, '..', '..', '..', 'docs')]) {
    if (!existsSync(docs)) continue;
    for (const pack of readdirSync(docs)) {
      const candidate = path.join(docs, pack, '.eval', 'doc-answer-key.json');
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Words the matrices use to NAME documents and fields: generic by
 * construction. Their aliases, prompts and worked examples are left out on
 * purpose — they quote real vendors and sites.
 */
function matrixVocabulary(): Set<string> {
  const text = [...ESG_DOCUMENT_MATRIX, ...VERIFICATION_DOCUMENT_MATRIX]
    .map((doc) => `${doc.name} ${doc.element} ${doc.expectedFields.join(' ').replace(/_/g, ' ')}`)
    .join(' ')
    .toLowerCase();
  return new Set(text.match(/[a-z]{5,}/g) ?? []);
}

/**
 * Domain words that a key records and that identify no one: units, measures,
 * months, document kinds. Everything the ESG or B-BBEE matrix itself says is
 * already treated as vocabulary; these are the rest.
 */
const ESG_GENERIC_WORDS = new Set([
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'actual', 'actuals', 'admin', 'african', 'agent', 'annual', 'answer', 'approved', 'audit', 'average', 'business', 'calendar',
  'cases', 'category', 'certificate', 'certification', 'change', 'charge', 'client', 'climate', 'closing', 'coloured', 'commercial',
  'company', 'conduct', 'consent', 'consumption', 'contractor', 'control', 'corporate', 'customer', 'daily', 'dashboard',
  'debrief', 'delivery', 'department', 'depot', 'detail', 'diesel', 'disposal', 'document', 'driver', 'electricity', 'employee',
  'employees', 'employment', 'environmental', 'equity', 'estimated', 'ethics', 'evaluation', 'evaluations', 'executive', 'export',
  'external', 'factors', 'female', 'finance', 'fleet', 'forklift', 'forklifts', 'fridge', 'fuel', 'general', 'generator', 'grand',
  'group', 'hazardous', 'health', 'hidden', 'history', 'incident', 'incidents', 'indian', 'induction', 'industrial', 'information',
  'internal', 'issued', 'landfill', 'landlord', 'latest', 'legal', 'litres', 'management', 'master', 'matrix', 'medical', 'meter',
  'month', 'months', 'national', 'opening', 'order', 'other', 'permanent', 'petrol', 'planned', 'policy', 'printed', 'private',
  'provider', 'public', 'questionnaire', 'questions', 'rates', 'receiving', 'recovery', 'recycled', 'recycling', 'register',
  'report', 'reports', 'review', 'reviewed', 'revision', 'route', 'routes', 'safety', 'semester', 'senior', 'services', 'sheet',
  'skilled', 'social', 'solar', 'standards', 'stage', 'statement', 'stock', 'stops', 'summary', 'supplier', 'survey',
  'sustainability', 'tariff', 'temporary', 'template', 'thread', 'total', 'totals', 'trailer', 'trailers', 'training', 'transport',
  'truck', 'unknown', 'updated', 'vehicle', 'vehicles', 'warehouse', 'waste', 'water', 'white', 'workforce', 'yearly',
  'advice', 'answers', 'boundary', 'handwritten', 'issuer', 'property', 'three', 'unskilled',
  'adverse', 'bakkie', 'certifications', 'contractors', 'division', 'freight', 'harassment', 'maintenance', 'mixed',
  'plastic', 'political', 'pressure', 'ranking', 'theoretical', 'tracking',
  'bills', 'blank', 'cardboard', 'closed', 'correct', 'depots', 'distribution', 'diversity', 'emission', 'estimate',
  'holding', 'human', 'input', 'legend', 'location', 'pollution', 'power', 'prepared', 'professionally', 'purposes',
  'question', 'revised', 'sewerage', 'socio', 'south', 'stale', 'stationary', 'taken', 'units', 'values', 'weight',
]);

describe.skipIf(!esgDocKeyPath())('ESG skills carry no client data (ESG document-level answer key)', () => {
  const key = JSON.parse(readFileSync(esgDocKeyPath()!, 'utf8')) as {
    entity?: string;
    documents: Array<{ file: string; type?: string; fields: Array<{ label?: string; value: unknown; alternatives?: unknown[] }> }>;
  };
  const vocabulary = matrixVocabulary();
  const strings: string[] = [];
  const numbers: number[] = [];
  const collect = (v: unknown): void => {
    if (typeof v === 'string') strings.push(v);
    else if (typeof v === 'number') numbers.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
  };
  /** Names hide in file names, the entity, the document descriptions and the labels too. */
  const named: string[] = [key.entity ?? ''];
  for (const doc of key.documents) {
    named.push(doc.file.replace(/\.[a-z]+$/i, ''), doc.type ?? '');
    for (const f of doc.fields) {
      collect(f.value);
      collect(f.alternatives ?? []);
      named.push(f.label ?? '');
    }
  }
  const texts = readdirSync(skillsDir).filter((f) => f.endsWith('.md')).map((f) => ({ file: f, text: readFileSync(path.join(skillsDir, f), 'utf8') }));

  it('the key was read', () => {
    expect(key.documents.length).toBeGreaterThan(0);
  });

  it('repeat no distinctive phrase the key records as a value', () => {
    const phrases = strings.map((s) => s.trim().toLowerCase())
      .filter((s) => s.length >= 8 && /\s/.test(s) && s.split(/[^a-z]+/).filter((w) => w.length >= 5).some((w) => !vocabulary.has(w) && !ESG_GENERIC_WORDS.has(w)));
    for (const { file, text } of texts) {
      const lower = text.toLowerCase();
      expect(phrases.filter((p) => lower.includes(p)).length, `${file} repeats phrase(s) from the ESG answer key`).toBe(0);
    }
  });

  it('name no person, place, site or business from the key', () => {
    const words = new Set<string>();
    for (const s of [...strings, ...named]) {
      for (const w of s.split(/[^A-Za-z]+/)) {
        const lower = w.toLowerCase();
        if (w.length >= 5 && /^[A-Z]/.test(w) && !vocabulary.has(lower) && !ESG_GENERIC_WORDS.has(lower)) words.add(lower);
      }
    }
    expect(words.size).toBeGreaterThan(0);
    for (const { file, text } of texts) {
      const lower = text.toLowerCase();
      expect([...words].filter((w) => new RegExp(`\\b${w}\\b`).test(lower)).length, `${file} names word(s) from the ESG answer key`).toBe(0);
    }
  });

  it('repeat no identifier or amount from the key', () => {
    // A standard's own name ("ISO 14001:2015") is the matrix's vocabulary, not a client identifier.
    const matrixCompact = ESG_DOCUMENT_MATRIX.map((doc) => `${doc.name}${(doc.aliases ?? []).join('')}`).join('').replace(/[\s/]/g, '');
    const ids = strings.filter((s) => /\d{5,}/.test(s.replace(/[\s/]/g, ''))).map((s) => s.replace(/[\s/]/g, ''))
      .filter((id) => !matrixCompact.includes(id));
    const forms = new Set<string>();
    for (const n of numbers) {
      if (Math.abs(n) < 1000 || (Number.isInteger(n) && n >= 1900 && n <= 2100)) continue;
      const abs = Math.abs(n);
      const fixed = Number.isInteger(abs) ? String(abs) : String(Math.round(abs * 100) / 100);
      const [int, dec] = fixed.split('.');
      const grouped = (sep: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
      for (const sep of ['', ',', ' ']) forms.add(dec ? `${grouped(sep)}.${dec}` : grouped(sep));
      if (dec) for (const sep of [' ', '.']) forms.add(`${grouped(sep)},${dec}`);
    }
    for (const { file, text } of texts) {
      const compact = text.replace(/[\s/]/g, '');
      expect(ids.filter((id) => compact.includes(id)).length, `${file} repeats identifier(s) from the ESG answer key`).toBe(0);
      // A whole printed number only: "1 000" inside "1 000 000" is not 1 000.
      const hits = [...forms].filter((form) => new RegExp(`(?<![\\d.,]|\\d )${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d]|[.,]\\d| \\d{3}(?!\\d))`).test(text));
      expect(hits.length, `${file} repeats amount(s) from the ESG answer key`).toBe(0);
    }
  });
});
