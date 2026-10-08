/**
 * Pass A's JSON contract must name every key the prompt asks for. The base
 * prompt said 'Return ONLY JSON: {"element", "document_type", "confidence"}'
 * while the skills menu appended after it asked for a fourth key,
 * "document_type_id" — and the recorded replies followed the contract line:
 * the skill id landed in "document_type" (so the type pick was lost), or in
 * "element" (so the whole classification was rejected).
 *
 * The fake model below returns those recorded SHAPES; every value is invented.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';
import { resetSkillsCache } from '../../src/services/skills.js';
import { classifyDocument, resetClassificationCacheForTest } from '../../src/services/documentClassification.js';
import { ESG_DOCUMENT_MATRIX } from '../../schemas/esg_document_matrix.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const parserRoot = path.resolve(here, '../..');
const EMP201 = 'skills_development__sars_emp201_submissions_monthly_employer_declarations';
const OLD_CONTRACT = 'Return ONLY JSON: {"element": <KEY>, "document_type": "<short label>", "confidence": <0..1>}.';

const ENV_KEYS = ['PARSER_SKILLS', 'PARSER_SKILLS_DIR'] as const;
let savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  resetSkillsCache();
  resetClassificationCacheForTest();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  resetSkillsCache();
  resetClassificationCacheForTest();
});

function replying(reply: Record<string, unknown>) {
  const systems: string[] = [];
  const model: ExtractionModel = {
    name: 'fake',
    complete: async (system) => {
      systems.push(system);
      return JSON.stringify(reply);
    },
  };
  return { model, systems };
}

const doc = (text: string, filename = 'scan.pdf') => ({ filename, raw_text: text, markdown: text });
const contractLine = (system: string) => system.split('\n').find((line) => line.startsWith('Return ONLY JSON'))!;

describe('the B-BBEE contract line names the type id when a skills menu follows it', () => {
  it('asks for "document_type_id" in the one JSON shape it states', async () => {
    const { model, systems } = replying({ element: 'OWNERSHIP', document_type: 'Letter', document_type_id: null, confidence: 0.9 });
    await classifyDocument(model, doc('A representation letter about the shareholding, signed by a director.'));
    expect(contractLine(systems[0])).toContain('"document_type_id"');
    // One contract, not two: the line is stated once.
    expect(systems[0].split('Return ONLY JSON').length).toBe(2);
  });

  it('with skills off the prompt is the old one, byte for byte', async () => {
    process.env.PARSER_SKILLS = 'off';
    resetSkillsCache();
    const { model, systems } = replying({ element: 'OWNERSHIP', document_type: 'Letter', confidence: 0.9 });
    await classifyDocument(model, doc('A representation letter about the shareholding, signed by a director.'));
    expect(contractLine(systems[0])).toBe(OLD_CONTRACT);
    expect(systems[0]).not.toContain('document_type_id');
  });
});

describe('a skill id the model put in the wrong key still names the type', () => {
  it('document_type that is exactly a menu id is the type', async () => {
    const { model } = replying({ element: 'OWNERSHIP', document_type: 'ownership_representation_letter', confidence: 0.92 });
    const cls = await classifyDocument(model, doc('A representation letter about the shareholding, signed by a director.'));
    expect(cls?.skillId).toBe('ownership_representation_letter');
    expect(cls?.element).toBe('OWNERSHIP');
  });

  it('a menu id returned as the element keeps the classification, under the skill\'s own element', async () => {
    const { model } = replying({ element: EMP201, document_type: 'EMP201', confidence: 0.9 });
    const cls = await classifyDocument(model, doc('EMP201 Monthly Employer Declaration. PAYE SDL UIF. Tax period 202503.'));
    expect(cls).not.toBeNull();
    expect(cls?.element).toBe('SKILLS_DEVELOPMENT');
    expect(cls?.skillId).toBe(EMP201);
  });

  it('an explicit document_type_id still wins, and a label that only resembles an id is no type', async () => {
    const both = replying({ element: 'MANAGEMENT_CONTROL', document_type: 'share_register', document_type_id: 'payroll_report', confidence: 0.9 });
    expect((await classifyDocument(both.model, doc('PAYROLL REPORT November. Employee  Basic salary  PAYE')))?.skillId).toBe('payroll_report');
    resetClassificationCacheForTest();
    const similar = replying({ element: 'MANAGEMENT_CONTROL', document_type: 'Payroll report', confidence: 0.9 });
    expect((await classifyDocument(similar.model, doc('PAYROLL REPORT November. Employee  Basic salary  PAYE')))?.skillId).toBeUndefined();
  });
});

describe('a skill whose element no spec carries', () => {
  it('the AFS skill (FINANCIALS) is read under its first matrix spec, whatever element Pass A named', async () => {
    const { specForSkill } = await import('../../src/services/documentClassification.js');
    const spec = specForSkill({ element: 'FINANCIALS', documentType: 'AFS', confidence: 0.9, skillId: 'annual_financial_statements' });
    expect(spec?.id).toBe('esd__audited_financial_statements_or_signed_management_accounts_w');
  });
});

describe('ESG states the same contract once it has a skill', () => {
  it('names "document_type_id" in the ESG contract line, and accepts the id in document_type', async () => {
    const spec = ESG_DOCUMENT_MATRIX[0];
    const root = mkdtempSync(path.join(tmpdir(), 'okiru-skills-'));
    try {
      cpSync(path.join(parserRoot, 'skills', 'bbbee'), path.join(root, 'bbbee'), { recursive: true });
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
      resetSkillsCache();
      const { model, systems } = replying({ element: spec.element, document_type: 'invented_esg_skill', confidence: 0.9 });
      const cls = await classifyDocument(model, doc('Invented signal. Reporting period: Mar 2025 - Feb 2026.'), { domain: 'esg' });
      expect(contractLine(systems[0])).toContain('"document_type_id"');
      expect(cls?.skillId).toBe('invented_esg_skill');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('with no ESG skills the ESG contract line is the old one', async () => {
    // A skills root holding only the B-BBEE skills: ESG has none.
    const root = mkdtempSync(path.join(tmpdir(), 'okiru-skills-'));
    try {
      cpSync(path.join(parserRoot, 'skills', 'bbbee'), path.join(root, 'bbbee'), { recursive: true });
      process.env.PARSER_SKILLS_DIR = root;
      resetSkillsCache();
      const { model, systems } = replying({ element: 'WATER', document_type: 'Water account', confidence: 0.9 });
      await classifyDocument(model, doc('Municipal water account. Consumption 120 kL.'), { domain: 'esg' });
      expect(contractLine(systems[0])).toBe(OLD_CONTRACT);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('with the ESG skills the ESG contract line names "document_type_id"', async () => {
    const { model, systems } = replying({ element: 'WATER', document_type: 'Water account', confidence: 0.9 });
    await classifyDocument(model, doc('Municipal water account. Consumption 120 kL.'), { domain: 'esg' });
    expect(contractLine(systems[0])).toContain('"document_type_id"');
  });
});
