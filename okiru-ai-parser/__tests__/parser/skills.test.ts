/**
 * The per-document-type skills: they load, they point at real specs, their
 * field names are the ones the parser and calculator mapping already speak
 * (or are declared new), and they carry no client data.
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
  SkillLoadError,
  skillMenuLines,
  skillPromptSections,
  type Skill,
} from '../../src/services/skills.js';
import { VERIFICATION_DOCUMENT_MATRIX, findDocumentById } from '../../schemas/verification_document_matrix.js';
import { defaultDocumentKnowledge } from '../../graph/ontology_queries.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const parserRoot = path.resolve(here, '../..');
const repoRoot = path.resolve(parserRoot, '..');
const skillsDir = path.join(parserRoot, 'skills', 'bbbee');

/** The seven priority skills (eval impact order), by file id. */
const PRIORITY_SKILLS = [
  'payroll_report',
  'annual_financial_statements',
  'bbbee_verification_certificate',
  'share_register',
  'share_certificate',
  'beneficial_interest_register',
  'cipc_registration_documents',
];

/**
 * Every field name some existing code already speaks: the matrix's expected
 * fields, the ontology's field names, and the names the calculator mapping,
 * sheet readers and the web field bridge consume. Read from source where the
 * table is not exported, so the check never needs those modules to change.
 */
function knownFieldNames(): Set<string> {
  const known = new Set<string>();
  for (const doc of VERIFICATION_DOCUMENT_MATRIX) for (const field of doc.expectedFields) known.add(field);
  for (const knowledge of defaultDocumentKnowledge()) for (const f of knowledge.fields) known.add(f.field.name);

  const scrape = (file: string, pattern: RegExp) => {
    if (!existsSync(file)) return;
    for (const match of readFileSync(file, 'utf8').matchAll(pattern)) known.add(match[1]);
  };
  // entityCalculatorMapping: { field: 'x', ... }; sheet readers: field: 'x' and column lists.
  scrape(path.join(parserRoot, 'src/services/entityCalculatorMapping.ts'), /field: '([a-z0-9_]+)'/g);
  scrape(path.join(parserRoot, 'src/services/sheetFinancialsExtraction.ts'), /field: '([a-z0-9_]+)'/g);
  scrape(path.join(parserRoot, 'src/services/sheetTableExtraction.ts'), /'([a-z][a-z0-9_]+)'/g);
  // The web bridge: `  holder_name: { section: ...` keys.
  scrape(path.join(repoRoot, 'apps/web/src/lib/parserFieldBridge.ts'), /^\s+([a-z][a-z0-9_]*): \{/gm);
  return known;
}

describe('skills loader — the shipped B-BBEE skills', () => {
  beforeEach(() => resetSkillsCache());

  it('loads every skill file in skills/bbbee, plus the global traps', () => {
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    const files = readdirSync(skillsDir).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
    expect(registry.skills.map((s) => s.id).sort()).toEqual(files.map((f) => f.replace(/\.md$/, '')).sort());
    expect(registry.global?.traps).toMatch(/SPACES/);
    expect(registry.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('carries all seven priority skills', () => {
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    for (const id of PRIORITY_SKILLS) expect(registry.skillFor(id)?.id).toBe(id);
  });

  it('every appliesTo names a real matrix spec or canonical type, and resolves back to its skill', () => {
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    const targets = new Set(knownSkillTargets('bbbee'));
    for (const skill of registry.skills) {
      for (const target of skill.appliesTo) {
        expect(targets.has(target), `${skill.id} → ${target}`).toBe(true);
        expect(registry.skillFor(target)?.id).toBe(skill.id);
        const spec = findDocumentById(target);
        if (spec) expect(registry.skillFor(spec.name)?.id).toBe(skill.id);
      }
    }
  });

  it('resolves a not-yet-in-the-matrix type by its declared name', () => {
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    expect(registry.skillFor('Beneficial interest register')?.id).toBe('beneficial_interest_register');
    expect(registry.skillFor('beneficial ownership register')?.id).toBe('beneficial_interest_register');
    expect(registry.skillFor('B-BBEE Certificate')?.id).toBe('bbbee_verification_certificate');
    expect(registry.skillFor('ownership__memorandum_of_incorporation_moi')).toBeNull();
    expect(registry.skillFor('')).toBeNull();
  });

  it('field names are ones the parser already speaks, or are declared new — and declared-new names really are new', () => {
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    const known = knownFieldNames();
    for (const skill of registry.skills) {
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

  it('a shared new field name means the same type everywhere it is declared', () => {
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    const typeOf = new Map<string, string>();
    for (const skill of registry.skills) {
      for (const field of skill.fields) {
        const seen = typeOf.get(field.name);
        if (seen) {
          expect(field.type, `${skill.id}.${field.name}`).toBe(seen);
        }
        if (!seen) typeOf.set(field.name, field.type);
      }
    }
  });

  it('renders prompt sections deterministically, with rows under the rows field', () => {
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    const skill = registry.skillFor('ownership__securities_share_register') as Skill;
    const first = skillPromptSections(skill, registry.global);
    const second = skillPromptSections(skill, registry.global);
    expect(first.text).toBe(second.text);
    expect(first.title).toBe('SKILL: share_register v1');
    expect(first.keys.rowsField).toBe('holdings_table');
    expect(first.keys.row).toContain('shareholder_name');
    expect(first.keys.document).toContain('entity_name');
    expect(first.text).toContain('WHERE THE VALUES SIT');
    expect(first.text).toContain('TRAPS');
    expect(first.text).toContain('AND SURNAME');
    expect(first.text).toContain('Always:'); // global traps appended
    expect(first.fieldLines).toMatch(/- holdings_table: an array with ONE object per row/);
    expect(skillMenuLines(skill)).toMatch(/Is NOT: a share certificate/);
  });

  it('expected keys: skill fields first, the spec keys it does not cover kept, dropped keys gone', () => {
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    const afs = registry.skillFor('esd__audited_financial_statements_or_signed_management_accounts_w') as Skill;
    const spec = findDocumentById('esd__audited_financial_statements_or_signed_management_accounts_w')!;
    const keys = expectedKeysWithSkill(afs, spec.expectedFields);
    expect(keys.slice(0, 2)).toEqual(['entity_name', 'trading_name']);
    expect(keys).toContain('current_year_revenue');
    expect(keys).toContain('line_items_classified_as_procurement'); // spec key the skill does not cover
    expect(keys).not.toContain('total_pre_exclusions_tmps');
    expect(keys).not.toContain('vice');
    expect(new Set(keys).size).toBe(keys.length);

    const register = registry.skillFor('ownership__securities_share_register') as Skill;
    const registerKeys = expectedKeysWithSkill(register, findDocumentById('ownership__securities_share_register')!.expectedFields);
    // Row columns live inside holdings_table, not at the top level.
    expect(registerKeys).toContain('holdings_table');
    expect(registerKeys).not.toContain('number_of_shares');
  });

  it('the payroll skill never names the annual leviable amount', () => {
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    const payroll = registry.skillFor('Payroll as at Measurement Date') as Skill;
    expect(payroll.id).toBe('payroll_report');
    expect(payroll.fields.map((f) => f.name)).not.toContain('sum_of_leviable_amount');
    expect(payroll.fields.map((f) => f.name)).toContain('period_leviable_amount');
  });

  it('the AFS skill never asks for a TMPS figure', () => {
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    const afs = registry.skillFor('annual_financial_statements') as Skill;
    expect(afs.fields.some((f) => /tmps|procurement/.test(f.name))).toBe(false);
  });

  it('the share certificate and registers never ask for race or black ownership', () => {
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    for (const id of ['share_certificate', 'share_register', 'beneficial_interest_register']) {
      const names = (registry.skillFor(id) as Skill).fields.map((f) => f.name);
      expect(names.some((n) => /race|gender|black/.test(n)), id).toBe(false);
    }
  });
});

// ─── Loud failures ──────────────────────────────────────────────────────────

const SECTIONS = '## What it is / is not\nx\n## Where values sit\nx\n## Traps\nx\n## Worked example\nx\n';

function skillFile(id: string, header: string, body = SECTIONS) {
  return { file: `/skills/bbbee/${id}.md`, content: `---\nid: ${id}\n${header}\n---\n${body}` };
}

const BASE = [
  'element: OWNERSHIP',
  'version: 1',
  'classify: { is: "x" }',
  'fields:',
  '  - { name: entity_name, type: text, description: "x" }',
].join('\n');

describe('skills loader — fails loudly', () => {
  it('accepts a minimal valid skill', () => {
    const registry = buildSkillRegistry('bbbee', [skillFile('a', `appliesTo: [ownership__securities_share_register]\n${BASE}`)]);
    expect(registry.skillFor('ownership__securities_share_register')?.id).toBe('a');
    expect(registry.skills[0].hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each([
    ['an unknown spec id', `appliesTo: [ownership__no_such_document]\n${BASE}`, /neither a bbbee matrix id/],
    ['a mis-cased spec id', `appliesTo: [Ownership__securities_share_register]\n${BASE}`, /must be spelled/],
    ['no appliesTo and no newType', BASE, /at least one spec/],
    ['a newType that already exists', `newType: { name: "Securities / share register" }\n${BASE}`, /already exists/],
    ['an unknown element', `appliesTo: [ownership__securities_share_register]\n${BASE.replace('OWNERSHIP', 'PROCUREMENT')}`, /element/],
    ['a bad field type', `appliesTo: [ownership__securities_share_register]\n${BASE.replace('type: text', 'type: string')}`, /allowed:/],
    ['an unknown front-matter key', `appliesTo: [ownership__securities_share_register]\nhrad: true\n${BASE}`, /unknown front-matter key "hrad"/],
    ['row fields without a rowsField', `appliesTo: [ownership__securities_share_register]\n${BASE.replace('description: "x" }', 'rowLevel: true, description: "x" }')}`, /rowsField/],
    ['newFields naming a non-field', `appliesTo: [ownership__securities_share_register]\nnewFields: [ghost]\n${BASE}`, /not a field/],
    ['a field that is also dropped', `appliesTo: [ownership__securities_share_register]\ndropFields: [entity_name]\n${BASE}`, /both a field and in dropFields/],
  ])('rejects %s', (_label, header, message) => {
    expect(() => buildSkillRegistry('bbbee', [skillFile('a', header)])).toThrow(message);
  });

  it('rejects a missing section', () => {
    const body = SECTIONS.replace('## Traps\nx\n', '');
    expect(() => buildSkillRegistry('bbbee', [skillFile('a', `appliesTo: [ownership__securities_share_register]\n${BASE}`, body)]))
      .toThrow(/Traps/);
  });

  it('rejects an id that does not match its file name', () => {
    const file = skillFile('a', `appliesTo: [ownership__securities_share_register]\n${BASE}`);
    expect(() => buildSkillRegistry('bbbee', [{ ...file, file: '/skills/bbbee/b.md' }])).toThrow(/match the file name/);
  });

  it('rejects two skills claiming the same spec', () => {
    const header = `appliesTo: [ownership__securities_share_register]\n${BASE}`;
    expect(() => buildSkillRegistry('bbbee', [skillFile('a', header), skillFile('b', header)])).toThrow(/claimed by both/);
  });

  it('throws when the skills directory is missing, unless optional', () => {
    resetSkillsCache();
    expect(() => loadSkills('bbbee', { root: path.join(parserRoot, 'no-such-skills-dir') })).toThrow(SkillLoadError);
    expect(loadSkills('esg', { root: path.join(parserRoot, 'no-such-skills-dir'), optional: true }).skills).toEqual([]);
  });

  it('the registry hash changes when any skill changes', () => {
    const header = `appliesTo: [ownership__securities_share_register]\n${BASE}`;
    const one = buildSkillRegistry('bbbee', [skillFile('a', header)]);
    const two = buildSkillRegistry('bbbee', [skillFile('a', header, SECTIONS.replace('## Traps\nx', '## Traps\ny'))]);
    expect(one.hash).not.toBe(two.hash);
  });
});

// ─── No client data ─────────────────────────────────────────────────────────

/**
 * The evaluation report for the real evidence pack lives outside git
 * (docs/eval is ignored). When it is present, every client value it records —
 * names, ID and registration numbers, amounts, file names — is derived at test
 * time and must not appear in any skill. The deny-list is never written down.
 */
function evalReportPaths(): string[] {
  const dirs = [
    process.env.SKILLS_DENYLIST_DIR,
    path.join(repoRoot, 'docs', 'eval'),
    // A git worktree under <main>/.claude/worktrees/<name> reads the main checkout's copy.
    path.resolve(repoRoot, '..', '..', '..', 'docs', 'eval'),
  ].filter((dir): dir is string => Boolean(dir) && existsSync(dir as string));
  const files = new Set<string>();
  for (const dir of dirs) {
    for (const name of readdirSync(dir)) if (name.endsWith('.json')) files.add(path.join(dir, name));
  }
  return [...files];
}

/**
 * Ordinary English words that also occur, capitalised, inside client names
 * ("... Close Corporation", "... Accountants"). Generic by construction: none
 * of them identifies anyone.
 */
const GENERIC_WORDS = new Set([
  'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'close', 'corporation', 'accountant', 'accountants', 'gathering', 'those', 'preferential', 'owner', 'blank', 'basic',
  // B-BBEE sector code names identify a Code, not a client.
  'transport', 'construction', 'tourism', 'property', 'forestry', 'agriculture', 'marketing', 'chartered', 'financial',
]);

/** Field labels in the report whose values are names (people, companies, places, courses). */
const NAME_LIKE_LABEL = /name|owner|holder|member|beneficiar|supplier|officer|agency|signator|employee|accountant|entity|trading|enterprise|office|course|learner|payment|invoice|director|auditor|company/i;

interface DenyList { digits: Set<string>; words: Set<string> }

function digitRuns(text: string): string[] {
  return [...text.matchAll(/\d[\d ,./]*\d/g)].map((m) => m[0].replace(/\D/g, '')).filter((d) => d.length >= 5);
}

interface EvalReport {
  title?: string;
  certified_reference?: unknown;
  documents?: Array<{ file?: string; fields?: Array<{ field?: string; claude?: unknown }> }>;
}

/**
 * Numbers (5+ digits: IDs, registration numbers, amounts, dates) from every
 * value the report records; capitalised words from file names and name-like
 * values, minus the matrix's own vocabulary and plain English.
 */
function deriveDenyList(files: string[], vocabulary: Set<string>): DenyList {
  const digits = new Set<string>();
  const words = new Set<string>();
  const named: string[] = [];
  const all: string[] = [];
  const collect = (value: unknown): void => {
    if (typeof value === 'string') all.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') Object.values(value as Record<string, unknown>).forEach(collect);
  };
  for (const file of files) {
    const report = JSON.parse(readFileSync(file, 'utf8')) as EvalReport;
    if (report.title) named.push(report.title);
    collect(report.certified_reference);
    for (const doc of report.documents ?? []) {
      if (doc.file) named.push(doc.file);
      for (const field of doc.fields ?? []) {
        if (typeof field.claude !== 'string') continue;
        all.push(field.claude);
        if (NAME_LIKE_LABEL.test(field.field ?? '')) named.push(field.claude);
      }
    }
  }
  for (const text of [...all, ...named]) for (const run of digitRuns(text)) digits.add(run);
  for (const text of named) {
    for (const word of text.match(/\b[A-Z][A-Za-z]{4,}\b/g) ?? []) {
      const lower = word.toLowerCase();
      if (!vocabulary.has(lower) && !GENERIC_WORDS.has(lower)) words.add(lower);
    }
  }
  return { digits, words };
}

describe('skills carry no client data', () => {
  const reports = evalReportPaths();

  it.skipIf(reports.length === 0)('no client name, number, amount or file name from the evaluation report appears in any skill', () => {
    // Domain vocabulary is not client data: anything the matrix itself says is generic.
    const vocabulary = new Set(
      JSON.stringify(VERIFICATION_DOCUMENT_MATRIX).toLowerCase().match(/[a-z]{5,}/g) ?? [],
    );
    const deny = deriveDenyList(reports, vocabulary);
    expect(deny.digits.size + deny.words.size).toBeGreaterThan(0);

    const offences: string[] = [];
    for (const name of readdirSync(skillsDir).filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(path.join(skillsDir, name), 'utf8');
      const skillDigits = digitRuns(text);
      deny.digits.forEach((d) => {
        if (skillDigits.some((run) => run === d || (d.length >= 7 && run.includes(d)))) offences.push(`${name}: a number from the client pack`);
      });
      const skillWords = new Set(text.toLowerCase().match(/[a-z]{5,}/g) ?? []);
      deny.words.forEach((w) => {
        if (skillWords.has(w)) offences.push(`${name}: a word from the client pack`);
      });
    }
    // The offending values are deliberately not printed: the count and file are enough to find them locally.
    expect(offences, `${offences.length} client-data hit(s); run locally and compare against the evaluation report`).toEqual([]);
  });
});
