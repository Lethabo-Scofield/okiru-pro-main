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
import { baseDocumentKnowledge, defaultDocumentKnowledge } from '../../graph/ontology_queries.js';

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
  // The catalogue BEFORE the skills supplement: it adds the skills' own fields.
  for (const knowledge of baseDocumentKnowledge()) for (const f of knowledge.fields) known.add(f.field.name);

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
    expect(registry.skillFor('Company profile')?.id).toBe('company_profile');
  });

  it('resolves an existing type\'s alias, but only when it is unambiguous', () => {
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    // Canonical aliases (an adjudicator may answer with any of them).
    expect(registry.skillFor('BEE Certificate')?.id).toBe('bbbee_verification_certificate');
    expect(registry.skillFor('Verification Certificate')?.id).toBe('bbbee_verification_certificate');
    expect(registry.skillFor('Ownership Confirmation')?.id).toBe('ownership_representation_letter');
    expect(registry.skillFor('Ownership Statement')?.id).toBe('ownership_representation_letter');
    // "Share Register" / "Share Certificate" are also "Ownership Confirmation"
    // aliases; the matrix's specific types decide first.
    expect(registry.skillFor('Share Register')?.id).toBe('share_register');
    expect(registry.skillFor('Share Certificate')?.id).toBe('share_certificate');
    // A new type narrowing the umbrella takes its own aliases (plural or not).
    expect(registry.skillFor('Register of Beneficial Interests')?.id).toBe('beneficial_interest_register');
    // Matrix aliases: one owner reads it, or nobody does.
    expect(registry.skillFor('EMP201')?.id).toBe('skills_development__sars_emp201_submissions_monthly_employer_declarations');
    expect(registry.skillFor('Proof of payment')).toBeNull(); // ESD and SED both carry it
    expect(registry.skillFor('AFS')).toBeNull(); // AFS types the AFS skill does not read carry it too
    expect(registry.skillFor('Proof of payment — grants, cash contributions')).toBeNull();
  });

  it('registers every declared new type, with what it narrows', () => {
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    const byName = new Map(registry.newTypes.map((t) => [t.name, t]));
    expect([...byName.keys()].sort()).toEqual(['Beneficial interest register', 'Company profile']);
    expect(byName.get('Beneficial interest register')).toMatchObject({ skillId: 'beneficial_interest_register', element: 'OWNERSHIP', narrows: 'Ownership Confirmation' });
    expect(byName.get('Company profile')).toMatchObject({ skillId: 'company_profile', element: 'OWNERSHIP', narrows: null });
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
    expect(first.title).toBe('SKILL: share_register v2');
    expect(first.keys.rowsField).toBe('holdings_table');
    expect(first.keys.row).toContain('shareholder_name');
    expect(first.keys.document).toContain('entity_name');
    expect(first.text).toContain('WHERE THE VALUES SIT');
    expect(first.text).toContain('TRAPS');
    expect(first.text).toContain('AND SURNAME');
    expect(first.text).toContain('Always:'); // global traps appended
    // The global "Where values sit" reaches the prompt too (it holds the
    // table-reading, handwriting, amount and date rules).
    expect(registry.global?.where).toMatch(/Handwriting beats print/);
    expect(first.where).toContain('In every document:');
    expect(first.text).toContain('Handwriting beats print');
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
    // B's first draft: an invented id in appliesTo, and keys the contract does not have.
    ['an invented id for a new type in appliesTo', `appliesTo: [ownership__company_profile]\nnewType: { name: "Company profile" }\n${BASE}`, /neither a bbbee matrix id/],
    ['an element key inside newType', `newType: { name: "Company profile", element: OWNERSHIP }\n${BASE}`, /unknown newType key "element"/],
    ['a newType that repeats an existing type\'s alias', `newType: { name: "Ownership confirmation letter", aliases: ["Ownership Statement"] }\n${BASE}`, /already an alias of Ownership Confirmation/],
    ['a newType narrowing the wrong type', `newType: { name: "Beneficial interest register", narrows: "B-BBEE Certificate" }\n${BASE}`, /already an alias of Ownership Confirmation/],
    ['a newType narrowing an unknown type', `newType: { name: "Company profile", narrows: "No Such Type" }\n${BASE}`, /not an existing bbbee type/],
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

// ─── One consistent set: content checks over every skill ───────────────────

const shipped = (): Skill[] => {
  resetSkillsCache();
  return loadSkills('bbbee', { root: path.join(parserRoot, 'skills') }).skills;
};

/** The worked example's JSON block, parsed. */
function exampleJson(skill: Skill): unknown {
  const block = skill.sections.example.match(/```json\s*\n([\s\S]*?)\n```/);
  if (!block) throw new Error(`${skill.id}: the worked example has no \`\`\`json block`);
  return JSON.parse(block[1]);
}

/** Labels too generic to tell one field from another once they become patterns. */
const GENERIC_LABELS = new Set(['total', 'date', 'name', 'status', 'level', 'type', 'salary', 'sdl', 'ref', 'no.', '%', 'basic']);

/**
 * The one deliberate exception: a certificate prints its level as "LEVEL ONE
 * CONTRIBUTOR" / "Level 2 Contributor", so "Level" is the label right before
 * the value, and the agent's citation check needs it to accept a level in words.
 */
const GENERIC_LABEL_EXCEPTIONS = new Set(['bbbee_verification_certificate.bee_level:level']);

/** Filename hints that also match many other document types in a pack. */
const STEALING_HINTS = new Set([
  'certificate', 'bbbee', 'b-bbee', 'profile', 'sed', 'pop', 'donation', 'transaction history', 'earnings', 'wages',
  'management letter', 'confirmation letter', 'letter of confirmation', 'registration certificate', 'account history',
]);

describe('every skill speaks one contract', () => {
  it.each(shipped().map((skill) => [skill.id, skill] as const))('%s: the worked example is ONE flat object keyed by the fields', (_id, skill) => {
    const example = exampleJson(skill) as Record<string, unknown>;
    expect(Array.isArray(example), 'an array of {field, value} records is not the contract').toBe(false);
    expect(typeof example).toBe('object');
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
    // Counts are bare numbers, never words or strings.
    for (const field of skill.fields.filter((f) => f.type === 'count')) {
      const values = field.rowLevel
        ? ((example[skill.rowsField as string] as Array<Record<string, unknown>>) ?? []).map((row) => row[field.name])
        : [example[field.name]];
      for (const value of values) expect(value === null || typeof value === 'number', `${skill.id}.${field.name} = ${JSON.stringify(value)}`).toBe(true);
    }
  });

  it.each(shipped().map((skill) => [skill.id, skill] as const))('%s: says what it is and is not, and every field is described', (_id, skill) => {
    expect(skill.classify.is.length).toBeGreaterThan(20);
    expect(skill.classify.isNot.length).toBeGreaterThanOrEqual(2);
    expect(skill.classify.filenameHints.length).toBeGreaterThanOrEqual(1);
    expect(skill.classify.contentSignals.length).toBeGreaterThanOrEqual(3);
    expect(skill.fields.some((f) => f.required), 'at least one required field').toBe(true);
    for (const field of skill.fields) expect(field.description.length, `${skill.id}.${field.name}`).toBeGreaterThan(10);
    expect(skill.sections.example).toMatch(/invented/i);
  });

  it.each(shipped().map((skill) => [skill.id, skill] as const))('%s: the four sections come in order', (_id, skill) => {
    const body = readFileSync(skill.file, 'utf8').replace(/\r\n/g, '\n');
    let at = -1;
    for (const heading of ['## What it is / is not', '## Where values sit', '## Traps', '## Worked example']) {
      const next = body.indexOf(`${heading}\n`);
      expect(next, heading).toBeGreaterThan(at);
      at = next;
    }
  });

  it('no label belongs to two fields at the same level of one skill, and no label is a bare generic word', () => {
    for (const skill of shipped()) {
      for (const level of [false, true]) {
        const owner = new Map<string, string>();
        for (const field of skill.fields.filter((f) => f.rowLevel === level)) {
          for (const label of field.labels) {
            const key = label.trim().toLowerCase();
            const generic = GENERIC_LABELS.has(key) && !GENERIC_LABEL_EXCEPTIONS.has(`${skill.id}.${field.name}:${key}`);
            expect(generic, `${skill.id}.${field.name} has the generic label "${label}"`).toBe(false);
            expect(owner.get(key) ?? field.name, `${skill.id}: label "${label}"`).toBe(field.name);
            owner.set(key, field.name);
          }
        }
      }
    }
  });

  it('filename hints never take other document types, and no two skills share one', () => {
    const owner = new Map<string, string>();
    for (const skill of shipped()) {
      for (const hint of skill.classify.filenameHints) {
        const key = hint.trim().toLowerCase();
        expect(STEALING_HINTS.has(key), `${skill.id} hint "${hint}"`).toBe(false);
        expect(owner.get(key) ?? skill.id, `hint "${hint}"`).toBe(skill.id);
        owner.set(key, skill.id);
      }
    }
    const payroll = shipped().find((s) => s.id === 'payroll_report')!;
    for (const signal of ['Transaction History Report', 'PAYE', 'UIF', 'SDL', 'TOTAL']) {
      expect(payroll.classify.contentSignals, `payroll signal "${signal}" belongs to bank statements or EMP201s`).not.toContain(signal);
    }
  });

  it('tax and VAT references are text: the regno type means a CIPC number', () => {
    for (const skill of shipped()) {
      for (const field of skill.fields) {
        if (/reference_number$|^vat_number$|^tax_number$/.test(field.name)) expect(field.type, `${skill.id}.${field.name}`).toBe('text');
      }
    }
  });

  it('dropFields name a field some target actually asks for (never a typo)', () => {
    const canonicalFields = new Map(defaultDocumentKnowledge().map((k) => [k.document.name, k.fields.map((f) => f.field.name)]));
    for (const skill of shipped()) {
      const asked = new Set(skill.appliesTo.flatMap((t) => findDocumentById(t)?.expectedFields ?? canonicalFields.get(t) ?? []));
      for (const name of skill.dropFields) expect(asked.has(name), `${skill.id} drops "${name}", which no target asks for`).toBe(true);
    }
  });

  it('the global traps carry the shared rules, and none of the contracts the pipeline cannot parse', () => {
    resetSkillsCache();
    const global = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') }).global!;
    const text = `${global.where}\n${global.traps}`;
    for (const rule of ['#REF!', 'TMPS', 'ID no', 'Expenditure', 'LEVEL ONE', 'Imports', 'measurement period', 'SPACES', 'Handwriting']) {
      expect(text, rule).toContain(rule);
    }
    expect(text).not.toMatch(/not_this_document/);
    expect(text).not.toMatch(/"field":/);
    expect(text).not.toMatch(/Return the level as a number/i);
  });
});

describe('the model copies; the code computes', () => {
  it('the EMP201 skill returns one row per return and asks for no total, count or x100', () => {
    resetSkillsCache();
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    const emp201 = registry.skillFor('skills_development__sars_emp201_submissions_monthly_employer_declarations')!;
    expect(emp201.rowsField).toBe('emp201_rows');
    expect(emp201.fields.filter((f) => f.rowLevel).map((f) => f.name)).toEqual(expect.arrayContaining(['tax_period', 'paye_amount', 'sdl_amount', 'uif_amount', 'total_liability']));
    const names = emp201.fields.map((f) => f.name);
    for (const computed of ['total_sdl_paid', 'total_paye', 'total_uif', 'total_payroll_taxes', 'months_submitted']) expect(names).not.toContain(computed);
    expect(emp201.dropFields).toEqual(expect.arrayContaining(['months_submitted', 'reconciliation_to_afs_staff_costs']));
    expect(emp201.fields.find((f) => f.name === 'sum_of_leviable_amount')?.description).toMatch(/ONLY a leviable amount .* prints/);
  });

  it('SED totals and period checks, and ledger counts, are not asked of the model', () => {
    resetSkillsCache();
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    const sed = registry.skillFor('sed__proof_of_payment_cash_grants_donations_or_monetary_contribut')!;
    const sedNames = sed.fields.map((f) => f.name);
    for (const computed of ['total_evidenced', 'payment_within_measurement_period', 'obligation_vested_in_period', 'matches_agreement_value']) expect(sedNames).not.toContain(computed);
    expect(sed.rowsField).toBe('beneficiary_rows');
    const ledger = registry.skillFor('esd__detailed_ledger_accounts_payable_entries_per_sampled_supplie')!;
    expect(ledger.fields.map((f) => f.name)).not.toContain('supporting_invoices_reviewed');
    const total = ledger.fields.find((f) => f.name === 'ap_subledger_total')!;
    for (const label of total.labels) expect(label, 'a balance is never the spend total').not.toMatch(/balance/i);
    const payroll = registry.skillFor('payroll_report')!;
    expect(payroll.fields.find((f) => f.name === 'employee_count')?.description).toMatch(/Never count the rows yourself/);
    expect(payroll.dropFields).toEqual(expect.arrayContaining(['payroll_management_population', 'scorecard_claim_population', 'individuals_claimed_not_on_payroll', 'reconciliation_status']));
  });
});

describe('whose document it is', () => {
  /** Names the web bridge sends to one workbook section, read from its source. */
  function bridgeTargets(section: 'ownership' | 'procurement'): Set<string> {
    const names = new Set<string>();
    const file = path.join(repoRoot, 'apps/web/src/lib/parserFieldBridge.ts');
    if (!existsSync(file)) return names;
    const pattern = new RegExp(`^\\s+([a-z][a-z0-9_]*): \\{ section: "${section}"`, 'gm');
    for (const m of readFileSync(file, 'utf8').matchAll(pattern)) names.add(m[1]);
    return names;
  }

  it('the certified company on a certificate is supplier_name, never entity_name', () => {
    resetSkillsCache();
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    const cert = registry.skillFor('esd__valid_b_bbee_verification_certificate_per_sampled_supplier')!;
    const names = cert.fields.map((f) => f.name);
    expect(names).toContain('supplier_name');
    expect(names).not.toContain('entity_name');
  });

  it('an unsworn ownership letter and a company profile can never set the measured entity\'s ownership', () => {
    resetSkillsCache();
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    const ownershipGrid = bridgeTargets('ownership');
    // The scrape works wherever the web bridge sits beside the parser; the
    // parser checked out alone still runs the rest of this test.
    if (existsSync(path.join(repoRoot, 'apps/web/src/lib/parserFieldBridge.ts'))) {
      expect(ownershipGrid.has('shareholding')).toBe(true);
    }
    for (const id of ['ownership_representation_letter', 'company_profile']) {
      const skill = registry.skillFor(id)!;
      const names = [...skill.fields.map((f) => f.name), ...(skill.rowsField ? [skill.rowsField] : [])];
      for (const name of names) {
        expect(ownershipGrid.has(name), `${id} asks for "${name}", which fills the ownership grid`).toBe(false);
        expect(/black_ownership|black_women_ownership/.test(name), `${id}.${name}`).toBe(false);
      }
      // The entity's own level is not a supplier's.
      expect(names).not.toContain('bee_level');
    }
    expect(registry.skillFor('ownership_representation_letter')!.dropFields).toEqual(expect.arrayContaining(['black_ownership', 'black_women_ownership']));
  });

  it('an EEA1 makes someone foreign only on a clearly marked Yes, never on a doubtful mark or a racial group', () => {
    // A Yes read from an ambiguous scanned tick reaches the workbook as
    // isForeign and drops the person from every EE count.
    resetSkillsCache();
    const registry = loadSkills('bbbee', { root: path.join(parserRoot, 'skills') });
    const eea1 = registry.skillFor('management_control__eea1_declaration_by_employee_disabled_employees')!;
    const isForeign = eea1.fields.find((f) => f.name === 'is_foreign')!;
    expect(isForeign.description).toMatch(/clearly marked/);
    expect(isForeign.description).toMatch(/Null when neither box is clearly marked/);
    const traps = skillPromptSections(eea1).traps;
    expect(traps).not.toMatch(/ticks a racial group is still foreign/);
    expect(traps).toMatch(/Only the foreign-national question decides `is_foreign`/);
  });
});

describe('skills carry no client data (generic patterns)', () => {
  it('name no evidence files and hold no unspaced 13-digit ID numbers', () => {
    for (const name of readdirSync(skillsDir).filter((f) => f.endsWith('.md'))) {
      const text = readFileSync(path.join(skillsDir, name), 'utf8');
      expect(text.match(/\b[\w-]+\.(pdf|xlsx|xlsm|xls|docx|doc|csv)\b/gi) ?? [], name).toEqual([]);
      expect(text.match(/(?<!\d)\d{13}(?!\d)/g) ?? [], name).toEqual([]);
    }
  });
});

/**
 * The evidence pack's answer key (outside the repo, PACK_EVAL_KEY) is the
 * stronger check: phrases, every capitalised word and every identifier and
 * amount it records. Skipped without the key; nothing from it is written here.
 */
const KEY_PATH = process.env.PACK_EVAL_KEY;

/** Words that can appear in an answer key without identifying anyone. */
const KEY_GENERIC_WORDS = new Set([
  'accountants', 'african', 'august', 'basic', 'business', 'certificate', 'close', 'coloured', 'community',
  'company', 'corporation', 'detailed', 'development', 'donation', 'driver', 'employed', 'evidence', 'executive',
  'february', 'financial', 'first', 'gathering', 'group', 'indian', 'information', 'ledger', 'level', 'limited',
  'management', 'march', 'middle', 'november', 'office', 'operator', 'ordinary', 'other', 'preferential',
  'procurement', 'profile', 'register', 'report', 'representation', 'salary', 'sector', 'senior', 'share',
  'shares', 'skills', 'smart', 'solutions', 'those', 'training', 'transport', 'unskilled', 'updated', 'white',
  'working', 'reliable', 'female', 'january', 'april', 'june', 'july', 'september', 'october', 'december',
]);
const KEY_GENERIC_PHRASES = new Set([
  'close corporation', 'in business', 'ordinary shares', 'executive management', 'other executive management',
  'company profile', 'management representation letter',
]);

describe.skipIf(!KEY_PATH || !existsSync(KEY_PATH))('skills carry no client data (answer key)', () => {
  const key = KEY_PATH && existsSync(KEY_PATH)
    ? JSON.parse(readFileSync(KEY_PATH, 'utf8')) as { documents: Array<{ file: string; fields: Array<{ value: unknown }> }> }
    : { documents: [] };
  const strings: string[] = [];
  const numbers: number[] = [];
  const collect = (v: unknown): void => {
    if (typeof v === 'string') strings.push(v);
    else if (typeof v === 'number') numbers.push(v);
    else if (Array.isArray(v)) v.forEach(collect);
  };
  for (const doc of key.documents) {
    strings.push(doc.file.replace(/\.[a-z]+$/i, ''));
    for (const field of doc.fields) collect(field.value);
  }
  const texts = readdirSync(skillsDir).filter((f) => f.endsWith('.md')).map((f) => ({ file: f, text: readFileSync(path.join(skillsDir, f), 'utf8') }));

  // Failures report counts and the skill file only: no client value reaches the logs.
  it('repeat no distinctive phrase from the key', () => {
    const phrases = strings.map((s) => s.trim().toLowerCase()).filter((s) => s.length >= 8 && /\s/.test(s) && !KEY_GENERIC_PHRASES.has(s));
    for (const { file, text } of texts) {
      const lower = text.toLowerCase();
      expect(phrases.filter((p) => lower.includes(p)).length, `${file} repeats phrase(s) from the answer key`).toBe(0);
    }
  });

  it('name no person, place or business from the key', () => {
    const words = new Set<string>();
    for (const s of strings) {
      for (const w of s.split(/[^A-Za-z]+/)) if (w.length >= 5 && /^[A-Z]/.test(w) && !KEY_GENERIC_WORDS.has(w.toLowerCase())) words.add(w.toLowerCase());
    }
    for (const { file, text } of texts) {
      const lower = text.toLowerCase();
      expect([...words].filter((w) => new RegExp(`\\b${w}\\b`).test(lower)).length, `${file} names word(s) from the answer key`).toBe(0);
    }
  });

  it('repeat no identifier or amount from the key', () => {
    const ids = strings.filter((s) => /\d{5,}/.test(s.replace(/[\s/]/g, ''))).map((s) => s.replace(/[\s/]/g, ''));
    const forms = new Set<string>();
    for (const n of numbers) {
      if (Math.abs(n) < 1000 || (Number.isInteger(n) && n >= 1900 && n <= 2100)) continue;
      const abs = Math.abs(n);
      const fixed = Number.isInteger(abs) ? String(abs) : abs.toFixed(2);
      const [int, dec] = fixed.split('.');
      const grouped = (sep: string) => int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
      for (const sep of ['', ',', ' ']) forms.add(dec ? `${grouped(sep)}.${dec}` : grouped(sep));
      if (dec) for (const sep of [' ', '.']) forms.add(`${grouped(sep)},${dec}`);
    }
    for (const { file, text } of texts) {
      const compact = text.replace(/[\s/]/g, '');
      expect(ids.filter((id) => compact.includes(id)).length, `${file} repeats identifier(s) from the answer key`).toBe(0);
      const hits = [...forms].filter((form) => new RegExp(`(?<![\\d.,])${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\d]|[.,]\\d)`).test(text));
      expect(hits.length, `${file} repeats amount(s) from the answer key`).toBe(0);
    }
  });
});
