/**
 * Wave 3: the per-document-type skills wired into the one-pass extraction,
 * the classification menus, the ontology, the code-side derivations and the
 * agent's targets — and NOT into anything a skill does not cover.
 *
 * Every value below is invented. The model is faked; prompts are asserted as
 * text, because a prompt that silently stops carrying a skill (or starts
 * carrying one where there is none, which changes every recorded answer) is
 * exactly the failure to catch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractDocument, extractWithSpec, isSheetName, type ExtractionModel } from '../../src/services/aiExtraction.js';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
import { extractionDomain, skillTypeDocument } from '../../src/services/extractionDomain.js';
import { loadSkillsAtBoot, resetSkillsCache, skillsEnabled } from '../../src/services/skills.js';
import {
  classifyDocument,
  resetClassificationCacheForTest,
  skillsMenu,
  specForSkill,
} from '../../src/services/documentClassification.js';
import { adjudicateDocumentType, resetAdjudicationCacheForTest } from '../../src/services/documentTypeAdjudication.js';
import { addSkillDerivations, casePeriod } from '../../src/services/caseExtraction.js';
import { periodEndingOn } from '../../src/services/skillDerivations.js';
import { isReportedNotScored } from '../../src/services/entityCalculatorMapping.js';
import { agentTargetFor } from '../../src/services/agentExtraction.js';
import { baseDocumentKnowledge, defaultDocumentKnowledge } from '../../graph/ontology_queries.js';
import { extractFields } from '../../parser/extract_fields.js';
import { VERIFICATION_DOCUMENT_MATRIX } from '../../schemas/verification_document_matrix.js';
import { ESG_DOCUMENT_MATRIX } from '../../schemas/esg_document_matrix.js';
import type { DocumentExtraction } from '../../src/services/aiExtraction.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const parserRoot = path.resolve(here, '../..');

const PAYROLL_SPEC = VERIFICATION_DOCUMENT_MATRIX.find((d) => d.id === 'management_control__payroll_as_at_measurement_date')!;
const MOI_SPEC = VERIFICATION_DOCUMENT_MATRIX.find((d) => d.id === 'ownership__memorandum_of_incorporation_moi')!;
const EMP201 = 'skills_development__sars_emp201_submissions_monthly_employer_declarations';

const ENV_KEYS = ['PARSER_SKILLS', 'PARSER_SKILLS_DIR', 'AI_EXTRACTION_SWEEP', 'AI_EXTRACTION_CACHE'] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  resetSkillsCache();
  resetExtractionCache();
  resetClassificationCacheForTest();
  resetAdjudicationCacheForTest();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  resetSkillsCache();
});

function recordingModel(reply: (system: string, user: string) => unknown) {
  const calls: Array<{ system: string; user: string }> = [];
  const model: ExtractionModel = {
    name: 'fake',
    complete: vi.fn(async (system: string, user: string) => {
      calls.push({ system, user });
      return JSON.stringify(reply(system, user));
    }),
  };
  return { model, calls };
}

const doc = (text: string, filename = 'evidence.pdf') => ({ filename, raw_text: text, markdown: text });

/** A skills root with the shipped B-BBEE skills copied in, to edit or extend. */
function copiedSkillsRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'okiru-skills-'));
  cpSync(path.join(parserRoot, 'skills', 'bbbee'), path.join(root, 'bbbee'), { recursive: true });
  return root;
}

// ─── The domain seam ────────────────────────────────────────────────────────

describe('the domain names its skills', () => {
  it('B-BBEE reads a spec through its skill; a spec without one gets none', () => {
    expect(extractionDomain('bbbee').skillFor(PAYROLL_SPEC.id)?.id).toBe('payroll_report');
    expect(extractionDomain('bbbee').skillFor(MOI_SPEC.id)).toBeNull();
  });

  it('ESG reads its own skills (skills/esg), and neither registry answers for the other', () => {
    const registry = extractionDomain('esg').skills();
    expect(registry).not.toBeNull();
    expect(registry!.skills.length).toBeGreaterThan(0);
    expect(extractionDomain('esg').skillFor('ghg_energy__municipal_electricity_bill')?.id).toBe('municipal_electricity_bill');
    expect(extractionDomain('bbbee').skillFor('ghg_energy__municipal_electricity_bill')).toBeNull();
    expect(extractionDomain('esg').skillFor(PAYROLL_SPEC.id)).toBeNull();
  });

  it('PARSER_SKILLS=off switches every skill off', () => {
    process.env.PARSER_SKILLS = 'off';
    expect(skillsEnabled()).toBe(false);
    expect(extractionDomain('bbbee').skills()).toBeNull();
    expect(extractionDomain('bbbee').skillFor(PAYROLL_SPEC.id)).toBeNull();
    expect(loadSkillsAtBoot()).toEqual([]);
  });

  it('the boot check loads both domains and fails loudly on a broken skill', () => {
    expect(loadSkillsAtBoot().map((l) => l.domain)).toEqual(['bbbee', 'esg']);
    const root = copiedSkillsRoot();
    try {
      writeFileSync(path.join(root, 'bbbee', 'broken_skill.md'), '---\nid: broken_skill\n---\n');
      process.env.PARSER_SKILLS_DIR = root;
      resetSkillsCache();
      expect(() => loadSkillsAtBoot()).toThrow(/broken_skill/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('a type only a skill reads is addressable as a spec (the skill id)', () => {
    const bi = extractionDomain('bbbee').findDocumentById('beneficial_interest_register');
    expect(bi).toMatchObject({ id: 'beneficial_interest_register', name: 'Beneficial interest register', element: 'OWNERSHIP' });
    const letter = extractionDomain('bbbee').findDocumentById('ownership_representation_letter');
    expect(letter?.name).toBe('Ownership Confirmation');
    // A skill that reads a matrix spec is addressed by that spec, not a second handle.
    const payroll = extractionDomain('bbbee').skillFor(PAYROLL_SPEC.id)!;
    expect(skillTypeDocument(payroll)).toBeNull();
  });
});

// ─── The one-pass extraction prompt ─────────────────────────────────────────

describe('a spec with a skill is extracted with it', () => {
  it('the prompt carries the skill, its typed fields and its rows; the keys are the union', async () => {
    process.env.AI_EXTRACTION_SWEEP = 'false';
    const { model, calls } = recordingModel(() => ({ entity_name: 'Acme Trading (Pty) Ltd' }));
    await extractWithSpec(model, PAYROLL_SPEC, doc('PAYROLL REPORT\nAcme Trading (Pty) Ltd'));
    const { system, user } = calls[0];
    expect(user).toContain('SKILL: payroll_report v');
    expect(user).toContain('WHERE THE VALUES SIT:');
    expect(user).toContain('TRAPS:');
    expect(user).toContain('FIELDS TO RETURN');
    expect(user).toContain("follow the skill's FIELDS TO RETURN");
    expect(user).not.toContain('WHAT CORRECT DATA LOOKS LIKE');
    const keys = user.match(/EXPECTED JSON KEYS: ([^\n]*)/)![1].split(', ');
    expect(keys).toContain('employee_rows');
    expect(keys).toContain('period_start');
    // The skill's dropped matrix keys are not asked for.
    expect(keys).not.toContain('reconciliation_status');
    // A wrong document answers with nulls and a reason under a skill.
    expect(system).toContain('return null for every key');
    expect(system).not.toContain('not_this_document');
  });

  it('a spec without a skill sends the old prompt, byte for byte', async () => {
    process.env.AI_EXTRACTION_SWEEP = 'false';
    const { model, calls } = recordingModel(() => ({}));
    const text = 'MEMORANDUM OF INCORPORATION\nAcme Trading (Pty) Ltd';
    await extractWithSpec(model, MOI_SPEC, doc(text));
    const expected = [
      `ANALYST INSTRUCTION:\n${MOI_SPEC.extractionPrompt}`,
      `\nEXPECTED JSON KEYS: ${MOI_SPEC.expectedFields.join(', ')}`,
      `\nWHAT CORRECT DATA LOOKS LIKE (for reference only, do not copy):\n${MOI_SPEC.exampleData}`,
      '',
      `\nDOCUMENT (evidence.pdf):\n${text}`,
    ].join('\n');
    expect(calls[0].user).toBe(expected);
    expect(calls[0].system).toContain('{"not_this_document": true}');
  });

  it('keeps a skill row table whole and never sweeps for it', async () => {
    const rows = [{ employee_name: 'J Doe', basic_salary: '12 500.00' }];
    const { model, calls } = recordingModel((system) => (system.includes('re-reading') ? {} : { entity_name: 'Acme Trading (Pty) Ltd', employee_rows: rows }));
    const out = await extractWithSpec(model, PAYROLL_SPEC, doc('PAYROLL REPORT\nAcme Trading (Pty) Ltd\nJ Doe 12 500.00'));
    expect(out.values.find((v) => v.field === 'employee_rows')?.value).toEqual(rows);
    const sweep = calls.find((c) => c.system.includes('re-reading'))!;
    const needed = sweep.user.match(/FIELDS STILL NEEDED \(return exactly these keys\): ([^\n]*)/)![1].split(', ');
    expect(needed).not.toContain('employee_rows');
    // Required skill fields lead, and each comes with what it is.
    const skill = extractionDomain('bbbee').skillFor(PAYROLL_SPEC.id)!;
    const required = skill.fields.filter((f) => f.required && !f.rowLevel && needed.includes(f.name)).map((f) => f.name);
    expect(needed.slice(0, required.length)).toEqual(required);
    expect(sweep.user).toContain('WHAT EACH FIELD IS:');
  });

  it('a workbook sheet is read with the old prompt: B-BBEE skills describe standalone documents', async () => {
    process.env.AI_EXTRACTION_SWEEP = 'false';
    const { model, calls } = recordingModel(() => ({}));
    await extractDocument(model, { filename: 'Workbook.xlsx › Payroll', raw_text: 'Employee | Salary', markdown: '| Employee | Salary |', elementHint: 'Payroll' }, { specIds: [PAYROLL_SPEC.id] });
    expect(calls[0].user).not.toContain('SKILL:');
    expect(calls[0].user).toContain(`EXPECTED JSON KEYS: ${PAYROLL_SPEC.expectedFields.join(', ')}`);
    expect(isSheetName('Workbook.xlsx › Payroll')).toBe(true);
    expect(isSheetName('Monthly payroll.pdf')).toBe(false);
  });

  it('the adjudicator menu for a sheet carries no skill lines', async () => {
    let user = '';
    const model: ExtractionModel = { name: 'fake', complete: async (_s, u) => { user = u; return JSON.stringify({ document_type: 'NONE', confidence: 0 }); } };
    await adjudicateDocumentType(model, { filename: 'Workbook.xlsx › Payroll', raw_text: 'Employee | Salary | Department and more columns' }, [
      { name: PAYROLL_SPEC.name, pillar: 'MAC', lexicalConfidence: 0.5, description: PAYROLL_SPEC.name, expectedFields: [] },
    ]);
    expect(user).not.toContain('Is NOT:');
  });
  it('salts the cache with the skill set: editing a skill re-reads, an unchanged one does not', async () => {
    process.env.AI_EXTRACTION_SWEEP = 'false';
    const { model, calls } = recordingModel(() => ({ entity_name: 'Acme Trading (Pty) Ltd' }));
    const input = doc('PAYROLL REPORT\nAcme Trading (Pty) Ltd');
    await extractWithSpec(model, PAYROLL_SPEC, input);
    await extractWithSpec(model, PAYROLL_SPEC, input);
    expect(calls).toHaveLength(1);

    const root = copiedSkillsRoot();
    try {
      const file = path.join(root, 'bbbee', 'payroll_report.md');
      writeFileSync(file, readFileSync(file, 'utf8').replace('## Traps\n', '## Traps\n- An invented extra trap.\n').replace('## Traps\r\n', '## Traps\r\n- An invented extra trap.\r\n'));
      process.env.PARSER_SKILLS_DIR = root;
      resetSkillsCache();
      await extractWithSpec(model, PAYROLL_SPEC, input);
      expect(calls).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('with skills off, a skill-backed spec is read exactly as before', async () => {
    process.env.PARSER_SKILLS = 'off';
    process.env.AI_EXTRACTION_SWEEP = 'false';
    const { model, calls } = recordingModel(() => ({}));
    await extractWithSpec(model, PAYROLL_SPEC, doc('PAYROLL REPORT'));
    expect(calls[0].user).not.toContain('SKILL:');
    expect(calls[0].user).toContain(`EXPECTED JSON KEYS: ${PAYROLL_SPEC.expectedFields.join(', ')}`);
  });
});

// ─── ESG plugs in with no code change ───────────────────────────────────────

describe('an ESG skill dropped into skills/esg is picked up everywhere', () => {
  it('reaches the extraction prompt, the Pass A menu and the domain lookup', async () => {
    const spec = ESG_DOCUMENT_MATRIX[0];
    const root = copiedSkillsRoot();
    try {
      mkdirSync(path.join(root, 'esg'));
      writeFileSync(path.join(root, 'esg', 'invented_esg_skill.md'), [
        '---',
        'id: invented_esg_skill',
        `appliesTo: [${spec.id}]`,
        `element: ${spec.element}`,
        'version: 1',
        'classify: { is: "An invented ESG evidence type for this test.", isNot: ["anything else"], filenameHints: ["invented"], contentSignals: ["Invented signal"] }',
        'fields:',
        '  - { name: reporting_period, type: text, required: true, labels: ["Reporting period"], description: "The period the evidence covers, as printed." }',
        '---',
        '## What it is / is not',
        'An invented type.',
        '## Where values sit',
        'In the header.',
        '## Traps',
        '- None worth naming.',
        '## Worked example',
        '{"reporting_period": "Mar 2025 - Feb 2026", "exceptions": []}',
        '',
      ].join('\n'));
      process.env.PARSER_SKILLS_DIR = root;
      process.env.AI_EXTRACTION_SWEEP = 'false';
      resetSkillsCache();

      expect(extractionDomain('esg').skillFor(spec.id)?.id).toBe('invented_esg_skill');
      expect(skillsMenu('esg')).toContain('invented_esg_skill');

      const { model, calls } = recordingModel(() => ({}));
      await extractWithSpec(model, spec, doc('Invented signal\nReporting period: Mar 2025 - Feb 2026'), { domain: 'esg' });
      expect(calls[0].user).toContain('SKILL: invented_esg_skill v1');
      // ESG evidence is mostly spreadsheets: its skills read sheets too.
      await extractWithSpec(model, spec, doc('Invented signal', 'Register.xlsx › Sheet1'), { domain: 'esg', sheet: true });
      expect(calls[1].user).toContain('SKILL: invented_esg_skill v1');
      expect(calls[0].system).toContain('ESG assurance analyst');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('the ESG Pass A prompt carries the ESG skills, never the B-BBEE ones', () => {
    const menu = skillsMenu('esg');
    expect(menu).toContain('- municipal_electricity_bill:');
    expect(menu).not.toContain('- payroll_report:');
  });
});

// ─── Pass A and the adjudicator ─────────────────────────────────────────────

describe('Pass A names the type from the skills menu (2.9c)', () => {
  it('the B-BBEE prompt carries every skill with what it is and is not', async () => {
    const menu = skillsMenu('bbbee');
    expect(menu).toContain('- payroll_report:');
    expect(menu).toContain('Is NOT:');
    let system = '';
    const model: ExtractionModel = {
      name: 'fake',
      complete: async (s) => {
        system = s;
        return JSON.stringify({ element: 'MANAGEMENT_CONTROL', document_type: 'Payroll', document_type_id: 'payroll_report', confidence: 0.9 });
      },
    };
    const cls = await classifyDocument(model, doc('PAYROLL REPORT for November\nEmployee  Basic salary'));
    expect(system).toContain('"document_type_id"');
    expect(cls?.skillId).toBe('payroll_report');
  });

  it('an id that is not on the menu is no type', async () => {
    const model: ExtractionModel = {
      name: 'fake',
      complete: async () => JSON.stringify({ element: 'OWNERSHIP', document_type: 'x', document_type_id: 'invented_type', confidence: 0.9 }),
    };
    const cls = await classifyDocument(model, doc('Some ownership document, long enough to classify.'));
    expect(cls?.skillId).toBeUndefined();
  });

  it('turns the type into ONE spec: the one in the routed element, else the first, else the skill\'s own', () => {
    expect(specForSkill({ element: 'MANAGEMENT_CONTROL', documentType: 'Payroll', confidence: 0.9, skillId: 'payroll_report' })?.id)
      .toBe(PAYROLL_SPEC.id);
    expect(specForSkill({ element: 'OWNERSHIP', documentType: 'Payroll', confidence: 0.9, skillId: 'payroll_report' })?.element)
      .toBe('OWNERSHIP');
    expect(specForSkill({ element: 'OWNERSHIP', documentType: 'BI register', confidence: 0.9, skillId: 'beneficial_interest_register' })?.id)
      .toBe('beneficial_interest_register');
    expect(specForSkill({ element: 'OWNERSHIP', documentType: 'Letter', confidence: 0.9, skillId: 'ownership_representation_letter' })?.id)
      .toBe('ownership_representation_letter');
    // Not confident enough, or no type: retrieval decides, as before.
    expect(specForSkill({ element: 'MANAGEMENT_CONTROL', documentType: 'Payroll', confidence: 0.3, skillId: 'payroll_report' })).toBeNull();
    expect(specForSkill({ element: 'MANAGEMENT_CONTROL', documentType: 'Payroll', confidence: 0.9 })).toBeNull();
  });

  it('the adjudicator menu carries a candidate\'s is / is-not lines and its typed fields', async () => {
    let user = '';
    const model: ExtractionModel = {
      name: 'fake',
      complete: async (_s, u) => {
        user = u;
        return JSON.stringify({ document_type: 'NONE', confidence: 0 });
      },
    };
    await adjudicateDocumentType(model, { filename: 'scan.pdf', raw_text: 'A payroll report for November listing employees and salaries.' }, [
      { name: PAYROLL_SPEC.name, pillar: 'MAC', lexicalConfidence: 0.5, description: PAYROLL_SPEC.name, expectedFields: [] },
      { name: MOI_SPEC.name, pillar: 'OWN', lexicalConfidence: 0.4, description: MOI_SPEC.name, expectedFields: [] },
    ]);
    const [payrollEntry, moiEntry] = user.split(/\n2\. /);
    expect(payrollEntry).toContain('Is NOT:');
    expect(payrollEntry).toContain('period_start');
    expect(moiEntry).not.toContain('Is NOT:');
  });
});

// ─── Derived in code, labelled derived ──────────────────────────────────────

function extraction(documentId: string, values: Record<string, unknown>, sourceFile = 'evidence.pdf'): DocumentExtraction {
  return {
    documentId,
    documentName: documentId,
    sourceFile,
    values: Object.entries(values).map(([field, value]) => ({ field, value, sourceFile, sourceDocumentId: documentId })),
    missingFields: [],
    unexpectedFields: [],
    exceptions: [],
  };
}

describe('the figures the skills forbid the model to compute', () => {
  it('a year end implies its twelve months', () => {
    expect(periodEndingOn('2025-02-28')).toEqual({ start: '2024-03-01', end: '2025-02-28' });
    expect(periodEndingOn('31 December 2025')).toEqual({ start: '2025-01-01', end: '2025-12-31' });
    expect(periodEndingOn('2025-06-15')).toEqual({ start: '2024-06-16', end: '2025-06-15' });
    expect(periodEndingOn('Feb')).toBeNull();
  });

  it('are added beside the printed values, marked derived, never over them', () => {
    const profile = extraction('sheet_instructions', { financial_year_end: '2025-02-28' }, 'Workbook.xlsx › Instructions');
    const months = ['202403', '202404', '202405'].map((tax_period) => ({ tax_period, paye_amount: '1 000.00', sdl_amount: '100.00', uif_amount: '50.00', total_liability: '1 150.00' }));
    const emp201 = extraction(EMP201, { emp201_rows: months, sum_of_leviable_amount: '99 999.00' });
    const all = [profile, emp201];
    expect(casePeriod(all)).toEqual({ start: '2024-03-01', end: '2025-02-28' });

    addSkillDerivations(all);
    const value = (field: string) => emp201.values.find((v) => v.field === field);
    expect(value('derived_sdl_total')).toMatchObject({ value: 300, source: { method: 'derived' } });
    expect(value('derived_leviable_amount')?.value).toBe(30000);
    expect(String(value('derived_leviable_amount')?.source?.quote)).toMatch(/SDL total x 100/);
    // The printed leviable amount stays the document's own.
    expect(emp201.values.filter((v) => v.field === 'sum_of_leviable_amount')).toHaveLength(1);
    expect(value('sum_of_leviable_amount')?.value).toBe('99 999.00');
    expect(emp201.exceptions.some((e) => /Only 3 of the period's months/.test(e))).toBe(true);
  });

  it('without a period nothing period-dependent is derived', () => {
    const emp201 = extraction(EMP201, { emp201_rows: [{ tax_period: '202403', sdl_amount: '100.00' }] });
    addSkillDerivations([emp201]);
    expect(emp201.values.some((v) => v.field === 'derived_sdl_total')).toBe(false);
  });

  it('none of them is ever offered to the calculator\'s semantic placement', () => {
    for (const field of ['derived_leviable_amount', 'derived_sdl_total', 'stated_percentage', 'ownership_statement', 'period_leviable_amount', 'months_submitted']) {
      expect(isReportedNotScored(field), field).toBe(true);
    }
    expect(isReportedNotScored('sum_of_leviable_amount')).toBe(false);
  });
});

// ─── The skills as ontology (2.8) ───────────────────────────────────────────

describe('the skills supplement the ontology', () => {
  const byName = (list: ReturnType<typeof defaultDocumentKnowledge>, name: string) => list.find((k) => k.document.name === name);

  it('a matrix type gains its skill\'s fields, labelled-only and not identifying', () => {
    const payroll = byName(defaultDocumentKnowledge(), PAYROLL_SPEC.name)!;
    const added = payroll.fields.find((f) => f.field.name === 'period_start');
    expect(added?.field).toMatchObject({ required: false, identifying: false, labelled_only: true });
    expect(added?.field.calculator_key).toBeUndefined();
    expect(byName(baseDocumentKnowledge(), PAYROLL_SPEC.name)!.fields.some((f) => f.field.name === 'period_start')).toBe(false);
  });

  it('a canonical type keeps exactly its own fields', () => {
    const base = byName(baseDocumentKnowledge(), 'B-BBEE Certificate')!;
    const supplemented = byName(defaultDocumentKnowledge(), 'B-BBEE Certificate')!;
    expect(supplemented.fields.map((f) => f.field.name)).toEqual(base.fields.map((f) => f.field.name));
  });

  it('registers the new types, and the umbrella type gives up the aliases a narrower one owns', () => {
    const knowledge = defaultDocumentKnowledge();
    expect(byName(knowledge, 'Beneficial interest register')?.document.pillar_code).toBe('OWN');
    expect(byName(knowledge, 'Company profile')).toBeDefined();
    const umbrella = byName(knowledge, 'Ownership Confirmation')!;
    expect(umbrella.document.aliases.some((a) => /beneficial/i.test(a))).toBe(false);
    expect(umbrella.document.aliases).toContain('Ownership Statement');
  });

  it('with skills off the ontology is exactly the base one', () => {
    process.env.PARSER_SKILLS = 'off';
    expect(JSON.stringify(defaultDocumentKnowledge())).toBe(JSON.stringify(baseDocumentKnowledge()));
  });

  it('a supplement field is read only under its own name, never under the skill\'s looser wordings', () => {
    const payroll = byName(defaultDocumentKnowledge(), PAYROLL_SPEC.name)!;
    const added = payroll.fields.filter((f) => f.field.identifying === false && f.field.description.includes('(skill payroll_report)'));
    expect(added.length).toBeGreaterThan(0);
    for (const field of added) expect(field.patterns, field.field.name).toEqual([]);
  });

  it('reads a supplement field only where the document separates label and value, never a header row', () => {
    const cipc = byName(defaultDocumentKnowledge(), VERIFICATION_DOCUMENT_MATRIX.find((d) => d.id === 'ownership__cipc_registration_documents_cor14_1_cor14_3')!.name)!;
    const auditor = cipc.fields.filter((f) => f.field.name === 'auditor_name');
    expect(auditor[0]?.field.separator_required).toBe(true);
    const asHeader = extractFields({
      file_id: 'x', filename: 'cipc.pdf', mime_type: 'application/pdf', tables: [], metadata: {},
      raw_text: 'AUDITOR DETAILS\nAuditor Name Type Status Appointment Date\nJ DOE ACC Current ACTIVE',
    }, auditor);
    expect(asHeader.auditor_name?.raw_value ?? null).toBeNull();
    const stated = extractFields({
      file_id: 'x', filename: 'cipc.pdf', mime_type: 'application/pdf', tables: [], metadata: {},
      raw_text: 'Auditor name: J Doe Accountants',
    }, auditor);
    expect(stated.auditor_name?.raw_value).toBe('J Doe Accountants');
  });

  it('an absent count is no count, not a stated zero', () => {
    const payroll = byName(defaultDocumentKnowledge(), PAYROLL_SPEC.name)!;
    const read = extractFields({ file_id: 'x', filename: 'p.pdf', mime_type: 'application/pdf', tables: [], metadata: {}, raw_text: 'PAYROLL REPORT' },
      payroll.fields.filter((f) => f.field.name === 'employee_count'));
    expect(read.employee_count?.normalized_value ?? null).toBeNull();
  });
  it('reads a labelled skill field, and not a column header after a looser wording', () => {
    const knowledge = byName(defaultDocumentKnowledge(), PAYROLL_SPEC.name)!;
    const fields = knowledge.fields.filter((f) => ['period_start', 'signatory_name'].includes(f.field.name));
    const read = extractFields({
      file_id: 'x', filename: 'payroll.pdf', mime_type: 'application/pdf', tables: [], metadata: {},
      raw_text: 'PAYROLL REPORT\nPeriod start: 1 November 2025\nSigned by: Name Surname Signature Date',
    }, fields);
    expect(read.period_start?.normalized_value).toBe('2025-11-01');
    expect(read.signatory_name?.raw_value ?? null).toBeNull();
  });
});

// ─── The agent targets what the first pass asked for ───────────────────────

describe('the agent reads its targets from the same skills', () => {
  it('a type only a skill reads is targeted under the skill\'s own spec handle', () => {
    expect(agentTargetFor('Ownership Confirmation')).toMatchObject({ specId: 'ownership_representation_letter', skillId: 'ownership_representation_letter' });
  });

  it('with skills off the agent falls back to the spec prompt', () => {
    process.env.PARSER_SKILLS = 'off';
    const target = agentTargetFor(PAYROLL_SPEC.id)!;
    expect(target.skillId).toBeUndefined();
    expect(target.instructions).toContain('ANALYST INSTRUCTION');
  });
});
