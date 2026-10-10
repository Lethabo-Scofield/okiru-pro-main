/**
 * Reading ANY document: the open read (openFacts.ts, openRead.ts).
 *
 * A document that is none of the listed types is read for what it IS ("Other
 * document — <label>") instead of being forced into the nearest listed type;
 * its identity and facts are read and cited; facts that mean a calculator
 * input are PROPOSED, never applied; and listed types are read exactly as
 * before, plus their "other details".
 *
 * The model is a STUB answering by prompt kind, so every test is offline and
 * asserts the pipeline, not a model's judgement. Every document, company,
 * person, place and number here is invented.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { RawExtractionInput } from '../../schemas/document_types.js';
import type { DocumentExtraction, ExtractionModel } from '../../src/services/aiExtraction.js';
import { extractCaseEntities } from '../../src/services/caseExtraction.js';
import { extractEsgCaseEntities } from '../../src/services/esgCaseExtraction.js';
import { resetClassificationCacheForTest } from '../../src/services/documentClassification.js';
import { adjudicateDocumentType, resetAdjudicationCacheForTest } from '../../src/services/documentTypeAdjudication.js';
import { resetExtractionCache } from '../../src/services/extractionCache.js';
import { resetDecisionCacheForTest } from '../../src/services/semanticDecisionCache.js';
import { buildSkillRegistry, loadSkills, SkillLoadError } from '../../src/services/skills.js';
import {
  OPEN_READ_ID,
  absorbOpenAgentValues,
  openAgentTarget,
  openReadFromReplies,
  openReadMode,
  openReadTooLittle,
  otherDetailsFrom,
  otherExtraction,
  sensitiveFact,
  validateFacts,
  type OpenRead,
} from '../../src/services/openFacts.js';
import { addOtherDocumentRead, confidentlyRuleTyped } from '../../src/services/openRead.js';
import { agentCasePass } from '../../src/services/agentExtraction.js';
import type { AgentMessage, AgentToolCall, AgentTurn } from '../../src/services/agentModel.js';
import { aiValuesForUpload, asOtherDocumentOutput, uploadNameResolver } from '../../src/services/runAttestation.js';
import { ParserService } from '../../parser/parser_service.js';
import { InMemoryOntologyRepository } from '../../graph/ontology_queries.js';

const ATTENDANCE_SPEC = 'skills_development__attendance_registers_internal_training';

function doc(filename: string, markdown: string): RawExtractionInput {
  return { file_id: filename, filename, mime_type: 'application/pdf', raw_text: markdown, markdown, tables: [], metadata: {} };
}

// ── Invented unusual documents ──────────────────────────────────────────────

const LEASE = doc('premises-lease.pdf', [
  '## Page 1',
  '',
  'LEASE AGREEMENT',
  'between KESTRELVALE PROPERTY HOLDINGS (PTY) LTD ("the Lessor") and BAOBAB ENGINEERING (PTY) LTD ("the Lessee")',
  'Contract no: LA-2207',
  'Commencement date: 1 March 2025      Term: 36 months',
  'Monthly rental: R 18 500.00 excluding VAT, escalating at 7% per annum',
  '',
  '## Page 2',
  '',
  'Signed at Gqeberha on 14 February 2025',
  'For the Lessor: N. Dube (Director)        For the Lessee: T. Mokoena (Director)',
].join('\n'));

const BANK_LETTER = doc('bank-letter.pdf', [
  'MARULA COMMERCIAL BANK',
  'BANK CONFIRMATION LETTER',
  'Date: 3 March 2025',
  'We confirm that BAOBAB ENGINEERING (PTY) LTD holds a business current account with us.',
  'Account holder: BAOBAB ENGINEERING (PTY) LTD',
  'Closing balance as at 28 February 2025: R 1 204 330.15',
  'Our ref: MCB/CONF/88123',
  'Relationship manager: P. Khumalo',
].join('\n'));

const INSURANCE = doc('policy-schedule.pdf', [
  'POLICY SCHEDULE — ASSETS ALL RISKS',
  'Insurer: Thornveld Mutual Insurance Ltd        Policy no: PM-55120',
  'The Insured: Baobab Logistics (Pty) Ltd',
  'Period of insurance: 1 July 2025 to 30 June 2026',
  'Item 1  Warehouse, Erf 3301 Polokwane     Sum insured R 12 400 000',
  'Item 2  Rooftop solar installation capacity 150 kWp  Sum insured R 2 150 000',
  'Annual premium: R 96 420.00',
].join('\n'));

const RATES_LETTER = doc('rates-notice.pdf', [
  'MUNICIPALITY OF KAROO HEIGHTS',
  'NOTICE OF PROPERTY RATES — 2025/2026',
  'Owner: Baobab Logistics (Pty) Ltd',
  'Erf 3301, Polokwane      Account: 4410-22918',
  'Municipal valuation: R 9 800 000',
  'Rate in the rand: 0.011245',
  'Annual rates levied: R 110 201.00',
].join('\n'));

const ATTENDANCE = doc('forklift-training.pdf', [
  'INTERNAL TRAINING — ATTENDANCE REGISTER',
  'Training event: Forklift refresher      Dates: 3 March 2025',
  'Venue: Depot 4 training room',
  'Facilitator: S. Naidoo (signed)',
  '| Attendee | ID no | Signature |',
  '|---|---|---|',
  '| L. Mahlangu | 900101 5009 087 | signed |',
  '| R. Pillay | 880202 0234 081 | signed |',
  'Total attendees: 2',
].join('\n'));

// ── The stub model ──────────────────────────────────────────────────────────

type Reply = Record<string, unknown> | string;

interface StubOptions {
  classify?: Record<string, Reply>;
  extract?: (user: string, filename: string) => Reply;
  open?: Record<string, Reply>;
  proposals?: (user: string) => Reply;
}

/** The file a prompt is about: "DOCUMENT (<file>):" in reads, "DOCUMENT: <file>" in Pass A. */
function filenameOf(user: string): string {
  return /DOCUMENT \(([^)]*)\):/.exec(user)?.[1] ?? /^DOCUMENT: ([^\n]*)/m.exec(user)?.[1]?.trim() ?? '';
}

function stubModel(options: StubOptions): ExtractionModel & { calls: Array<{ kind: string; system: string; user: string }> } {
  const calls: Array<{ kind: string; system: string; user: string }> = [];
  const json = (reply: Reply | undefined) => (reply === undefined ? '{}' : typeof reply === 'string' ? reply : JSON.stringify(reply));
  const complete = async (system: string, user: string): Promise<string> => {
    const file = filenameOf(user);
    if (system.includes('Classify ONE client document')) {
      calls.push({ kind: 'classify', system, user });
      return json(options.classify?.[file]);
    }
    if (system.includes('OPEN READ:')) {
      calls.push({ kind: 'open', system, user });
      return json(options.open?.[file]);
    }
    if (system.startsWith('You match facts read from client documents')) {
      calls.push({ kind: 'proposals', system, user });
      return json(options.proposals?.(user) ?? { proposals: [] });
    }
    if (system.includes('Follow the analyst instruction')) {
      calls.push({ kind: 'extract', system, user });
      return json(options.extract?.(user, file) ?? { not_this_document: true });
    }
    calls.push({ kind: 'other', system, user });
    return '{}';
  };
  return { name: 'stub', calls, complete, completeHard: complete, completeReview: complete };
}

const savedEnv: Record<string, string | undefined> = {};
const ENV_KEYS = ['AI_EXTRACTION_SWEEP', 'AI_EXTRACTION_CACHE', 'PARSER_DECISION_CACHE', 'PARSER_OPEN_READ', 'PARSER_AGENT_EXTRACTION', 'PARSER_SEMANTIC_MAPPING'];

beforeEach(() => {
  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
  process.env.AI_EXTRACTION_SWEEP = 'false';
  process.env.AI_EXTRACTION_CACHE = 'false';
  process.env.PARSER_DECISION_CACHE = 'false';
  delete process.env.PARSER_OPEN_READ;
  delete process.env.PARSER_AGENT_EXTRACTION;
  resetClassificationCacheForTest();
  resetAdjudicationCacheForTest();
  resetExtractionCache();
  resetDecisionCacheForTest();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

const otherOf = (extractions: DocumentExtraction[], file: string) =>
  extractions.find((e) => e.documentId === OPEN_READ_ID && e.sourceFile === file);

// ── The open skill ──────────────────────────────────────────────────────────

describe('the open skill (_open.md) loads in the loader\'s format', () => {
  const root = path.resolve(__dirname, '../../skills');

  it('both domains ship one, with identity fields and cited facts as rows', () => {
    for (const domain of ['bbbee', 'esg'] as const) {
      const open = loadSkills(domain, { root }).open!;
      expect(open.id).toBe('_open');
      expect(open.fields.map((f) => f.name)).toEqual(expect.arrayContaining(['document_label', 'document_title', 'issued_by', 'about_entity', 'document_date', 'reference_numbers']));
      expect(open.rowsField).toBe('facts');
      expect(open.rowFields.map((f) => f.name)).toEqual(expect.arrayContaining(['label', 'value', 'unit', 'page', 'quote']));
    }
  });

  it('is not part of the listed skills\' hash, so the listed reads\' caches and prompts do not move', () => {
    const dir = path.join(root, 'bbbee');
    const files = ['_global.md', 'share_certificate.md'].map((name) => ({ file: path.join(dir, name), content: readFileSync(path.join(dir, name), 'utf8') }));
    const open = { file: path.join(dir, '_open.md'), content: readFileSync(path.join(dir, '_open.md'), 'utf8') };
    const without = buildSkillRegistry('bbbee', files, dir);
    const withOpen = buildSkillRegistry('bbbee', [...files, open], dir);
    expect(withOpen.open).not.toBeNull();
    expect(without.open).toBeNull();
    expect(withOpen.hash).toBe(without.hash);
    expect(withOpen.skills.map((s) => s.id)).toEqual(without.skills.map((s) => s.id));
  });

  it('refuses an open skill without a quote column, loudly', () => {
    const bad = '---\nid: _open\nversion: 1\nrowsField: facts\nfields:\n  - { name: document_label, type: text, description: "x" }\n  - { name: label, type: text, rowLevel: true, description: "x" }\n  - { name: value, type: text, rowLevel: true, description: "x" }\n---\n## What it is / is not\nx\n## Where values sit\nx\n## Traps\nx\n## Worked example\nx\n';
    expect(() => buildSkillRegistry('bbbee', [{ file: '_open.md', content: bad }])).toThrow(SkillLoadError);
  });

  it('PARSER_OPEN_READ: other (Other documents only) by default; on adds other details; off = nothing', () => {
    // Listed reads keep byte-identical prompts by default, so their free
    // cassette replays stay valid until a paid gate run measures `on`.
    expect(openReadMode({})).toBe('other');
    expect(openReadMode({ PARSER_OPEN_READ: 'other' })).toBe('other');
    expect(openReadMode({ PARSER_OPEN_READ: 'on' })).toBe('on');
    expect(openReadMode({ PARSER_OPEN_READ: 'off' })).toBe('off');
  });

  it('neither open skill asks for an account number as a reference', () => {
    for (const domain of ['bbbee', 'esg'] as const) {
      const refs = loadSkills(domain, { root }).open!.fields.find((f) => f.name === 'reference_numbers')!;
      expect(refs.labels.map((l) => l.toLowerCase())).not.toContain('account number');
      expect(refs.description).not.toMatch(/\baccount or\b|, account\b/i);
    }
  });
});

// ── Citations ───────────────────────────────────────────────────────────────

describe('every open fact is cited and checked against the document', () => {
  it('keeps a fact whose quote is in the document and whose value is in its quote, and finds its page', () => {
    const { facts, dropped } = validateFacts([
      { label: 'Monthly rental', value: 'R 18 500.00', unit: 'R per month', kind: 'figure', page: 2, quote: 'Monthly rental: R 18 500.00 excluding VAT' },
      { label: 'Deposit', value: 'R 50 000.00', quote: 'Deposit: R 50 000.00' },
      { label: 'Term', value: '48 months', quote: 'Term: 36 months' },
      { label: 'Signed at', value: 'Gqeberha', page: 2, quote: 'Signed at Gqeberha on 14 February 2025' },
      { label: 'Contract', value: 'LA-2207' },
    ], LEASE);
    expect(facts.map((f) => [f.label, f.value, f.page])).toEqual([
      ['Monthly rental', 'R 18 500.00', 1], // cited page 2, printed on page 1
      ['Signed at', 'Gqeberha', 2],
    ]);
    expect(dropped).toBe(3); // not in the document; value not in its quote; no quote
  });

  it('a listed read\'s other details never repeat a value it already returned', () => {
    const read = otherDetailsFrom([
      { label: 'Venue', value: 'Depot 4 training room', quote: 'Venue: Depot 4 training room' },
      { label: 'Event', value: 'Forklift refresher', quote: 'Training event: Forklift refresher' },
    ], ATTENDANCE, ['Forklift refresher', '3 March 2025']);
    expect(read?.other).toBe(false);
    expect(read?.facts.map((f) => f.label)).toEqual(['Venue']);
  });
});

// ── B-BBEE: no forced type ──────────────────────────────────────────────────

const LEASE_OPEN = {
  document_label: 'Lease agreement',
  document_title: 'LEASE AGREEMENT',
  issued_by: 'KESTRELVALE PROPERTY HOLDINGS (PTY) LTD',
  about_entity: 'BAOBAB ENGINEERING (PTY) LTD',
  document_date: '14 February 2025',
  period: 'Commencement date: 1 March 2025      Term: 36 months',
  reference_numbers: 'LA-2207',
  could_evidence: [],
  facts: [
    { label: 'Monthly rental', value: 'R 18 500.00', unit: 'R per month excluding VAT', kind: 'figure', page: 1, quote: 'Monthly rental: R 18 500.00 excluding VAT, escalating at 7% per annum' },
    { label: 'Term', value: '36 months', unit: 'months', kind: 'condition', page: 1, quote: 'Term: 36 months' },
    { label: 'For the Lessor (Director)', value: 'N. Dube', kind: 'person', page: 2, quote: 'For the Lessor: N. Dube (Director)' },
    { label: 'Deposit', value: 'R 50 000.00', kind: 'figure', page: 1, quote: 'Deposit: R 50 000.00' },
  ],
  exceptions: [],
};

describe('B-BBEE: a document no listed type fits is read as an Other document', () => {
  it('a lease Pass A calls OTHER is not read under any listed spec; its identity and facts are read and cited', async () => {
    const model = stubModel({
      classify: { 'premises-lease.pdf': { element: 'OTHER', document_type: 'Lease agreement', confidence: 0.92 } },
      open: { 'premises-lease.pdf': LEASE_OPEN },
    });
    const result = await extractCaseEntities([LEASE], model);
    // No forced type: not one listed spec read the lease.
    expect(model.calls.filter((c) => c.kind === 'extract')).toHaveLength(0);
    const other = otherOf(result!.extractions, LEASE.filename)!;
    expect(other.documentName).toBe('Other document — Lease agreement');
    expect(other.values).toEqual([]);
    expect(other.open?.identity).toMatchObject({
      title: 'LEASE AGREEMENT',
      issuedBy: 'KESTRELVALE PROPERTY HOLDINGS (PTY) LTD',
      aboutEntity: 'BAOBAB ENGINEERING (PTY) LTD',
      documentDate: '14 February 2025',
      referenceNumbers: ['LA-2207'],
    });
    expect(other.open?.facts.map((f) => [f.label, f.value, f.page])).toEqual([
      ['Monthly rental', 'R 18 500.00', 1],
      ['Term', '36 months', 1],
      ['For the Lessor (Director)', 'N. Dube', 2],
    ]);
    // The invented deposit is not in the document: left out, and said so.
    expect(other.open?.dropped).toBe(1);
    expect(other.exceptions.join(' ')).toMatch(/left out/);
    // Nothing from it reached resolution or the calculator.
    expect(Object.keys(result!.fields)).toEqual([]);
    expect(result!.calculator.payload).toEqual({});
  });

  it('a bank letter no listed spec read anything from becomes an Other document; a fact that means a calculator input is PROPOSED, never applied', async () => {
    const model = stubModel({
      // Pass A is unsure: the listed specs retrieval offers are read first.
      classify: { 'bank-letter.pdf': { element: 'ESD', document_type: 'Bank letter', confidence: 0.3 } },
      open: {
        'bank-letter.pdf': {
          document_label: 'Bank confirmation letter',
          document_title: 'BANK CONFIRMATION LETTER',
          issued_by: 'MARULA COMMERCIAL BANK',
          about_entity: 'BAOBAB ENGINEERING (PTY) LTD',
          document_date: '3 March 2025',
          reference_numbers: ['MCB/CONF/88123'],
          could_evidence: ['ESD', 'not-an-element'],
          facts: [
            { label: 'Account holder', value: 'BAOBAB ENGINEERING (PTY) LTD', kind: 'party', quote: 'Account holder: BAOBAB ENGINEERING (PTY) LTD' },
            { label: 'Closing balance as at 28 February 2025', value: 'R 1 204 330.15', unit: 'R', kind: 'figure', quote: 'Closing balance as at 28 February 2025: R 1 204 330.15' },
            { label: 'Relationship manager', value: 'P. Khumalo', kind: 'person', quote: 'Relationship manager: P. Khumalo' },
          ],
        },
      },
      proposals: () => ({
        proposals: [
          { fact: 1, key: 'ownership.entity_name', confidence: 0.8 },
          { fact: 2, key: 'entity.revenue', confidence: 0.3 }, // unsure: not proposed
          { fact: 3, key: 'not.a.key', confidence: 0.9 }, // not a slot: ignored
        ],
      }),
    });
    const result = await extractCaseEntities([BANK_LETTER], model);
    // The listed specs were tried, read nothing, and did not type it.
    expect(model.calls.filter((c) => c.kind === 'extract').length).toBeGreaterThan(0);
    expect(result!.extractions.filter((e) => e.documentId !== OPEN_READ_ID && e.values.length > 0)).toEqual([]);
    const other = otherOf(result!.extractions, BANK_LETTER.filename)!;
    expect(other.documentName).toBe('Other document — Bank confirmation letter');
    expect(other.open?.couldEvidence).toEqual(['ESD']);
    expect(other.open?.proposals).toEqual([expect.objectContaining({
      label: 'Account holder',
      calculatorKey: 'ownership.entity_name',
      field: 'entity_name',
      coerced: 'BAOBAB ENGINEERING (PTY) LTD',
      status: 'suggested',
      evidence: expect.objectContaining({ sourceFile: 'bank-letter.pdf', quote: 'Account holder: BAOBAB ENGINEERING (PTY) LTD' }),
    })]);
    // Proposed, not applied: neither the case's fields nor the payload carry it.
    expect(result!.fields.entity_name).toBeUndefined();
    expect(result!.calculator.payload['ownership.entity_name']).toBeUndefined();
  });

  it('a training attendance register in an unexpected layout is still its listed type, with its other details beside it', async () => {
    const extract = (user: string) => (user.includes('Inspect the attendance register for each internal training event')
      ? {
          event_name: 'Forklift refresher',
          dates: '3 March 2025',
          total_attendees: '2',
          other_facts: [
            { label: 'Venue', value: 'Depot 4 training room', quote: 'Venue: Depot 4 training room' },
            { label: 'Facilitator', value: 'S. Naidoo', kind: 'person', quote: 'Facilitator: S. Naidoo (signed)' },
            { label: 'Training event', value: 'Forklift refresher', quote: 'Training event: Forklift refresher' },
            { label: 'Catering', value: 'R 900.00', quote: 'Catering: R 900.00' },
          ],
        }
      : { not_this_document: true });
    const classify = { 'forklift-training.pdf': { element: 'SKILLS_DEVELOPMENT', document_type: 'Training attendance register', confidence: 0.82 } };

    process.env.PARSER_OPEN_READ = 'on';
    const on = stubModel({ classify, extract });
    const withDetails = await extractCaseEntities([ATTENDANCE], on);
    const listed = withDetails!.extractions.find((e) => e.documentId === ATTENDANCE_SPEC)!;
    expect(listed).toBeDefined();
    expect(otherOf(withDetails!.extractions, ATTENDANCE.filename)).toBeUndefined();
    expect(listed.open?.other).toBe(false);
    // Kept: cited and new. Left out: a repeat of event_name, and one not in the document.
    expect(listed.open?.facts.map((f) => f.label)).toEqual(['Venue', 'Facilitator']);
    expect(listed.values.map((v) => v.field)).not.toContain('other_facts');
    expect(listed.unexpectedFields).not.toContain('other_facts');
    expect(on.calls.filter((c) => c.kind === 'open')).toHaveLength(0);

    // The listed read is unchanged by the open read: the same values with it off.
    process.env.PARSER_OPEN_READ = 'off';
    resetClassificationCacheForTest();
    const off = stubModel({ classify, extract });
    const without = await extractCaseEntities([ATTENDANCE], off);
    const before = without!.extractions.find((e) => e.documentId === ATTENDANCE_SPEC)!;
    expect(before.open).toBeUndefined();
    expect(listed.values).toEqual(before.values);
    expect(Object.keys(withDetails!.calculator.payload)).toEqual(Object.keys(without!.calculator.payload));
    // Off, the prompts are the old prompts; on, the only addition is the OTHER DETAILS block.
    const offPrompt = off.calls.find((c) => c.kind === 'extract' && c.user.includes('Inspect the attendance register'))!.user;
    const onPrompt = on.calls.find((c) => c.kind === 'extract' && c.user.includes('Inspect the attendance register'))!.user;
    expect(offPrompt).not.toContain('OTHER DETAILS');
    expect(onPrompt.replace(/\nOTHER DETAILS:[\s\S]*?return \[\] when there is nothing more\.\n/, '')).toBe(offPrompt);
  });

  it('with the open read off, a document Pass A calls OTHER is read as before (no Other document)', async () => {
    process.env.PARSER_OPEN_READ = 'off';
    const model = stubModel({
      classify: { 'premises-lease.pdf': { element: 'OTHER', document_type: 'Lease agreement', confidence: 0.92 } },
      open: { 'premises-lease.pdf': LEASE_OPEN },
    });
    const result = await extractCaseEntities([LEASE], model);
    expect(model.calls.filter((c) => c.kind === 'open')).toHaveLength(0);
    expect(model.calls.filter((c) => c.kind === 'extract').length).toBeGreaterThan(0);
    expect(otherOf(result?.extractions ?? [], LEASE.filename)).toBeUndefined();
  });

  it('a document a classifier typed is that type even when its first read found nothing (the agent reads it, not the open read)', async () => {
    const model = stubModel({
      classify: { 'premises-lease.pdf': { element: 'ESD', document_type: 'x', confidence: 0.3 } },
      open: { 'premises-lease.pdf': LEASE_OPEN },
    });
    await extractCaseEntities([LEASE], model, undefined, {
      agent: { mode: 'off', deterministic: [{ filename: LEASE.filename, document_type: 'Financing / loan agreement for third-party-funded BEE acquisition', status: 'failed' }] },
    });
    expect(model.calls.filter((c) => c.kind === 'open')).toHaveLength(0);
  });

  it('by default (mode other) a listed read\'s prompt carries no OTHER DETAILS block', async () => {
    const model = stubModel({
      classify: { 'forklift-training.pdf': { element: 'SKILLS_DEVELOPMENT', document_type: 'Training attendance register', confidence: 0.82 } },
      extract: () => ({ event_name: 'Forklift refresher' }),
    });
    await extractCaseEntities([ATTENDANCE], model);
    const prompts = model.calls.filter((c) => c.kind === 'extract');
    expect(prompts.length).toBeGreaterThan(0);
    expect(prompts.every((c) => !c.user.includes('OTHER DETAILS'))).toBe(true);
  });

  const ruleTyped = (status: string) => ({
    filename: LEASE.filename,
    document_type: 'Financing / loan agreement for third-party-funded BEE acquisition',
    status: 'review_required',
    parser_output: { audit_trail: { classification_status: status } },
  });

  it('a confident rule-based typing beats Pass A\'s OTHER: the document is read under its listed type, never as an Other document', async () => {
    const model = stubModel({
      classify: { 'premises-lease.pdf': { element: 'OTHER', document_type: 'Covering letter', confidence: 0.7 } },
      open: { 'premises-lease.pdf': LEASE_OPEN },
    });
    const result = await extractCaseEntities([LEASE], model, undefined, {
      agent: { mode: 'off', deterministic: [ruleTyped('classified')] },
    });
    expect(model.calls.filter((c) => c.kind === 'extract').length).toBeGreaterThan(0);
    expect(model.calls.filter((c) => c.kind === 'open')).toHaveLength(0);
    expect(otherOf(result?.extractions ?? [], LEASE.filename)).toBeUndefined();
  });

  it('a DOUBTED rule-based guess does not beat Pass A\'s OTHER: the document is read as an Other document', async () => {
    const model = stubModel({
      classify: { 'premises-lease.pdf': { element: 'OTHER', document_type: 'Lease agreement', confidence: 0.92 } },
      open: { 'premises-lease.pdf': LEASE_OPEN },
    });
    const result = await extractCaseEntities([LEASE], model, undefined, {
      agent: { mode: 'off', deterministic: [ruleTyped('ambiguous')] },
    });
    expect(model.calls.filter((c) => c.kind === 'extract')).toHaveLength(0);
    expect(otherOf(result!.extractions, LEASE.filename)?.documentName).toBe('Other document — Lease agreement');
  });

  it('a listed read that ERRORED is not hidden as an Other document', async () => {
    const model = stubModel({ open: { 'premises-lease.pdf': LEASE_OPEN } });
    const failed: DocumentExtraction = { documentId: 'x', documentName: 'X', sourceFile: LEASE.filename, values: [], missingFields: [], unexpectedFields: [], exceptions: [], error: '429 Too Many Requests' };
    const out = await addOtherDocumentRead(model, LEASE, [failed], { domain: 'bbbee', byClassifier: false, typed: false });
    expect(out.other).toBe(false);
    expect(out.results).toEqual([failed]);
    expect(model.calls.filter((c) => c.kind === 'open')).toHaveLength(0);
  });

  it('confidentlyRuleTyped: a classified, listed rule type only', () => {
    expect(confidentlyRuleTyped(ruleTyped('classified'))).toBe(true);
    expect(confidentlyRuleTyped(ruleTyped('ambiguous'))).toBe(false);
    expect(confidentlyRuleTyped({ ...ruleTyped('classified'), document_type: 'Other document' })).toBe(false);
    expect(confidentlyRuleTyped({ filename: 'x.pdf', document_type: 'Share Certificate' })).toBe(false);
    expect(confidentlyRuleTyped(undefined)).toBe(false);
  });
});

// ── ESG: no forced type ─────────────────────────────────────────────────────

describe('ESG: a document no listed type fits is read as an Other document', () => {
  it('an insurance schedule Pass A calls OTHER: identity and facts read; a capacity fact is proposed for the solar input, not applied', async () => {
    const model = stubModel({
      classify: { 'policy-schedule.pdf': { element: 'OTHER', document_type: 'Insurance schedule', confidence: 0.9 } },
      open: {
        'policy-schedule.pdf': {
          document_label: 'Insurance schedule',
          document_title: 'POLICY SCHEDULE — ASSETS ALL RISKS',
          issued_by: 'Thornveld Mutual Insurance Ltd',
          about_entity: 'Baobab Logistics (Pty) Ltd',
          period: '1 July 2025 to 30 June 2026',
          reference_numbers: 'PM-55120',
          could_evidence: ['GHG_ENERGY'],
          facts: [
            { label: 'Rooftop solar installation capacity', value: '150', unit: 'kWp', kind: 'figure', quote: 'Item 2  Rooftop solar installation capacity 150 kWp  Sum insured R 2 150 000' },
            { label: 'Annual premium', value: 'R 96 420.00', unit: 'R', kind: 'figure', quote: 'Annual premium: R 96 420.00' },
          ],
        },
      },
      proposals: (user) => {
        const line = user.split('\n').find((l) => l.includes('Rooftop solar installation capacity'))!;
        return { proposals: [{ fact: Number(line.split('.')[0]), key: 'energy.solar_capacity_kwp', confidence: 0.75 }] };
      },
    });
    const result = await extractEsgCaseEntities([INSURANCE], model);
    expect(model.calls.filter((c) => c.kind === 'extract')).toHaveLength(0);
    const other = otherOf(result!.extractions, INSURANCE.filename)!;
    expect(other.documentName).toBe('Other document — Insurance schedule');
    expect(other.open?.identity.issuedBy).toBe('Thornveld Mutual Insurance Ltd');
    expect(other.open?.couldEvidence).toEqual(['GHG_ENERGY']);
    expect(other.open?.facts).toHaveLength(2);
    expect(other.open?.proposals).toEqual([expect.objectContaining({ calculatorKey: 'energy.solar_capacity_kwp', coerced: 150, status: 'suggested' })]);
    expect(result!.calculator.payload['energy.solar_capacity_kwp']).toBeUndefined();
    expect(result!.calculator.rows).toEqual([]);
  });

  it('a municipal rates letter routed to an energy element is not forced into a utility bill: the bill reads refuse it, and it is read as itself', async () => {
    const model = stubModel({
      classify: { 'rates-notice.pdf': { element: 'GHG_ENERGY', document_type: 'Municipal rates notice', confidence: 0.7 } },
      extract: () => ({ exceptions: ['Document is a property rates notice, not a municipal electricity bill'] }),
      open: {
        'rates-notice.pdf': {
          document_label: 'Municipal rates letter',
          document_title: 'NOTICE OF PROPERTY RATES — 2025/2026',
          issued_by: 'MUNICIPALITY OF KAROO HEIGHTS',
          about_entity: 'Baobab Logistics (Pty) Ltd',
          reference_numbers: '4410-22918',
          facts: [
            { label: 'Municipal valuation', value: 'R 9 800 000', unit: 'R', kind: 'figure', quote: 'Municipal valuation: R 9 800 000' },
            { label: 'Annual rates levied', value: 'R 110 201.00', unit: 'R per year', kind: 'figure', quote: 'Annual rates levied: R 110 201.00' },
            { label: 'Rate in the rand', value: '0.011245', kind: 'figure', quote: 'Rate in the rand: 0.011245' },
          ],
        },
      },
    });
    const result = await extractEsgCaseEntities([RATES_LETTER], model);
    expect(model.calls.filter((c) => c.kind === 'extract').length).toBeGreaterThan(0);
    expect(result!.extractions.filter((e) => e.documentId !== OPEN_READ_ID && e.values.length > 0)).toEqual([]);
    const other = otherOf(result!.extractions, RATES_LETTER.filename)!;
    expect(other.documentName).toBe('Other document — Municipal rates letter');
    expect(other.open?.facts.map((f) => f.label)).toEqual(['Municipal valuation', 'Annual rates levied', 'Rate in the rand']);
    expect(Object.keys(result!.calculator.payload)).toEqual([]);
  });

  it('the element the person filed a document under beats Pass A\'s OTHER (C1): it is read under that element', async () => {
    const model = stubModel({
      classify: { 'policy-schedule.pdf': { element: 'OTHER', document_type: 'Insurance schedule', confidence: 0.9 } },
      extract: () => ({ not_this_document: true }),
      open: { 'policy-schedule.pdf': { document_label: 'Insurance schedule', facts: [] } },
    });
    await extractEsgCaseEntities([INSURANCE], model, undefined, { focusByFile: { 'policy-schedule.pdf': 'GHG_ENERGY' } });
    // The listed read ran under the filed element (it was skipped before this fix).
    expect(model.calls.filter((c) => c.kind === 'extract').length).toBeGreaterThan(0);
  });
});

// ── The agent loop on an Other document ─────────────────────────────────────

let callCounter = 0;
function toolCall(name: string, args: Record<string, unknown>): AgentToolCall {
  callCounter += 1;
  return { id: `open_call_${callCounter}`, type: 'function', function: { name, arguments: JSON.stringify(args) } };
}

describe('an Other document with too little read is a hard document for the agent', () => {
  it('the agent targets the open skill\'s identity and facts, every value cited, and its values never become values', async () => {
    const steps: AgentToolCall[][] = [
      [toolCall('submit_values', {
        values: [{ field: 'document_title', value: 'LEASE AGREEMENT', page: 1, quote: 'LEASE AGREEMENT' }],
        rows: [
          { cells: { label: 'Monthly rental', value: 'R 18 500.00' }, page: 1, quote: 'Monthly rental: R 18 500.00 excluding VAT, escalating at 7% per annum' },
          { cells: { label: 'Commencement date', value: '1 March 2025' }, page: 1, quote: 'Commencement date: 1 March 2025' },
          { cells: { label: 'Deposit', value: 'R 50 000.00' }, page: 1, quote: 'Deposit: R 50 000.00' },
        ],
      })],
      [toolCall('submit_values', { values: [] })],
    ];
    let turn = 0;
    const seenSystem: string[] = [];
    const base = stubModel({
      classify: { 'premises-lease.pdf': { element: 'OTHER', document_type: 'Lease agreement', confidence: 0.92 } },
      // The open read found one fact and no identity: too little.
      open: { 'premises-lease.pdf': { document_label: 'Lease agreement', facts: [LEASE_OPEN.facts[1]] } },
    });
    const model: ExtractionModel = {
      ...base,
      async completeWithTools(messages: AgentMessage[]): Promise<AgentTurn> {
        const system = messages.find((m) => m.role === 'system');
        if (system && typeof system.content === 'string') seenSystem.push(system.content);
        const calls = steps[Math.min(turn, steps.length - 1)];
        turn += 1;
        return { message: { role: 'assistant', content: null, tool_calls: calls.map((c) => ({ ...c, id: `${c.id}_t${turn}` })) } };
      },
    };
    const result = await extractCaseEntities([LEASE], model, undefined, { agent: { mode: 'hard' } });
    expect(turn).toBeGreaterThan(0);
    expect(seenSystem[0]).toContain('Document type: Other document');
    const other = otherOf(result!.extractions, LEASE.filename)!;
    expect(other.values).toEqual([]);
    expect(other.agent?.reasons).toContain('other document with too little read');
    expect(other.agent?.target?.source).toBe('open');
    expect(other.open?.identity.title).toBe('LEASE AGREEMENT');
    const byAgent = other.open!.facts.filter((f) => f.method === 'agent');
    expect(byAgent.map((f) => [f.label, f.value, f.page])).toEqual([
      ['Monthly rental', 'R 18 500.00', 1],
      ['Commencement date', '1 March 2025', 1],
    ]);
    // The uncited deposit was refused by the agent's own citation check.
    expect(other.open!.facts.some((f) => f.label === 'Deposit')).toBe(false);
    expect(Object.keys(result!.fields)).toEqual([]);
  });

  it('an Other document with enough read is not sent to the agent in hard mode', async () => {
    let agentTurns = 0;
    const base = stubModel({
      classify: { 'premises-lease.pdf': { element: 'OTHER', document_type: 'Lease agreement', confidence: 0.92 } },
      open: { 'premises-lease.pdf': LEASE_OPEN },
    });
    const model: ExtractionModel = {
      ...base,
      async completeWithTools(): Promise<AgentTurn> {
        agentTurns += 1;
        return { message: { role: 'assistant', content: null, tool_calls: [toolCall('submit_values', { values: [] })] } };
      },
    };
    const result = await extractCaseEntities([LEASE], model, undefined, { agent: { mode: 'hard' } });
    expect(agentTurns).toBe(0);
    expect(openReadTooLittle(otherOf(result!.extractions, LEASE.filename)?.open)).toBe(false);
  });

  it('the open target is the identity fields and label / value / unit rows; agent values fold into the open read', () => {
    const target = openAgentTarget('bbbee')!;
    expect(target.specId).toBe(OPEN_READ_ID);
    expect(target.fields.map((f) => f.name)).toEqual(expect.arrayContaining(['document_title', 'issued_by', 'about_entity', 'document_date', 'reference_numbers']));
    expect(target.fields.map((f) => f.name)).not.toContain('document_label');
    expect(target.rows?.columns.map((c) => c.name)).toEqual(['label', 'value', 'unit']);
    expect(agentCasePass(stubModel({}), { mode: 'hard' })).toBeNull(); // no tools, no pass

    const open: OpenRead = { other: true, label: 'Lease agreement', couldEvidence: [], identity: { title: null, issuedBy: 'KESTRELVALE PROPERTY HOLDINGS (PTY) LTD', aboutEntity: null, documentDate: null, period: null, referenceNumbers: [] }, facts: [], dropped: 0 };
    const [folded] = absorbOpenAgentValues([{
      documentId: OPEN_READ_ID, documentName: 'Other document — Lease agreement', sourceFile: LEASE.filename,
      values: [
        { field: 'issued_by', value: 'someone else', sourceFile: LEASE.filename, sourceDocumentId: OPEN_READ_ID, source: { method: 'agent', page: 1, quote: 'x' } },
        { field: 'reference_numbers', value: 'LA-2207', sourceFile: LEASE.filename, sourceDocumentId: OPEN_READ_ID, source: { method: 'agent', page: 1, quote: 'Contract no: LA-2207' } },
        { field: 'facts', value: [{ label: 'Term', value: '36 months' }], sourceFile: LEASE.filename, sourceDocumentId: OPEN_READ_ID, source: { method: 'agent', quote: 'Term: 36 months', rows: [{ page: 1, quote: 'Term: 36 months' }] } },
      ],
      missingFields: [], unexpectedFields: [], exceptions: [], open,
    }]);
    expect(folded.values).toEqual([]);
    // Identity fills gaps only: the first read's issuer stands.
    expect(folded.open?.identity.issuedBy).toBe('KESTRELVALE PROPERTY HOLDINGS (PTY) LTD');
    expect(folded.open?.identity.referenceNumbers).toEqual(['LA-2207']);
    expect(folded.open?.facts).toEqual([expect.objectContaining({ label: 'Term', value: '36 months', page: 1, method: 'agent' })]);
  });
});

// ── The rule-based classifier ───────────────────────────────────────────────

describe('the rule-based classifier stops forcing a type the reader says does not fit', () => {
  it('a confident NONE is an answer: { none: true }', async () => {
    const model: ExtractionModel = { name: 'stub', complete: async () => '{"document_type":"NONE","confidence":0.9,"reason":"a lease"}' };
    const verdict = await adjudicateDocumentType(model, { filename: 'premises-lease.pdf', raw_text: LEASE.raw_text }, [
      { name: 'SARS VAT declaration for imported goods', pillar: 'ESD', lexicalConfidence: 0.4, description: 'x', expectedFields: [] },
    ]);
    expect(verdict).toMatchObject({ none: true, documentType: '', confidence: 0.9 });
  });

  it('a NONE below the stricter floor is no answer: the keyword guess is not discarded on a hunch', async () => {
    resetAdjudicationCacheForTest();
    const model: ExtractionModel = { name: 'stub', complete: async () => '{"document_type":"NONE","confidence":0.7,"reason":"not sure"}' };
    const verdict = await adjudicateDocumentType(model, { filename: 'seta-cert.pdf', raw_text: LEASE.raw_text }, [
      { name: 'SARS VAT declaration for imported goods', pillar: 'ESD', lexicalConfidence: 0.4, description: 'x', expectedFields: [] },
    ]);
    expect(verdict).toBeNull();
  });

  it('a lease the keyword scorer guessed as a listed type is reported as an Other document, with nothing read under the guess', async () => {
    const repo = new InMemoryOntologyRepository();
    let asked = 0;
    const service = new ParserService(repo, {
      adjudicator: async () => { asked += 1; return { documentType: '', none: true, confidence: 0.9, reason: 'a lease of premises' }; },
    });
    const output = await service.resolve(LEASE);
    expect(asked).toBe(1);
    expect(output.document_type).toBe('Other document');
    expect(output.status).toBe('failed');
    expect(output.extracted_fields).toEqual({});
    expect(output.calculator_payload).toEqual({});
    expect(output.audit_trail.classification_reason).toMatch(/none of the listed document types/);
  });

  it('without a reader (or with an unsure one) the keyword decision stands, exactly as before', async () => {
    const repo = new InMemoryOntologyRepository();
    const plain = await new ParserService(repo).resolve(LEASE);
    const unsure = await new ParserService(repo, { adjudicator: async () => null }).resolve(LEASE);
    expect(unsure.document_type).toBe(plain.document_type);
    expect(plain.document_type).not.toBe('Other document');
  });
});

// ── The library record ──────────────────────────────────────────────────────

describe('the library shows Other documents and their facts', () => {
  const other: DocumentExtraction = {
    documentId: OPEN_READ_ID,
    documentName: 'Other document — Lease agreement',
    sourceFile: LEASE.filename,
    values: [],
    missingFields: [],
    unexpectedFields: [],
    exceptions: [],
    open: {
      other: true,
      label: 'Lease agreement',
      couldEvidence: [],
      identity: { title: 'LEASE AGREEMENT', issuedBy: 'KESTRELVALE PROPERTY HOLDINGS (PTY) LTD', aboutEntity: null, documentDate: null, period: null, referenceNumbers: ['LA-2207'] },
      facts: [
        { label: 'Monthly rental', value: 'R 18 500.00', unit: 'R per month', kind: 'figure', page: 1, cell: null, quote: 'Monthly rental: R 18 500.00 excluding VAT', method: 'ai' },
        { label: 'Term', value: '36 months', unit: 'months', kind: 'condition', page: 1, cell: null, quote: 'Term: 36 months', method: 'agent' },
      ],
      dropped: 0,
    },
  };

  it('carries the identity and facts in the signed run, under the layers the library already accepts', () => {
    const values = aiValuesForUpload([other], LEASE.filename, uploadNameResolver(new Set([LEASE.filename])));
    expect(values.map((v) => [v.field, v.value, v.layer])).toEqual([
      ['Document title', 'LEASE AGREEMENT', 'ai'],
      ['Issued by', 'KESTRELVALE PROPERTY HOLDINGS (PTY) LTD', 'ai'],
      ['Reference', 'LA-2207', 'ai'],
      ['Monthly rental (R per month)', 'R 18 500.00', 'ai'],
      ['Term', '36 months', 'agent'],
    ]);
    expect(new Set(values.map((v) => v.documentName))).toEqual(new Set(['Other document — Lease agreement']));
    expect(values.every((v) => /^[A-Za-z0-9_. -]+$/.test(v.key) && v.key.length <= 120)).toBe(true);
    expect(values[3]).toMatchObject({ page: 1, quote: 'Monthly rental: R 18 500.00 excluding VAT', grounded: true });
  });

  it('names the run "Other document — <label>" when the rule layer left the type open, and needs review rather than failed', () => {
    const failed = { document_type: 'Other document', status: 'failed', validation: { passed: false, warnings: [], errors: ['none fits'], missing_fields: [] } };
    expect(asOtherDocumentOutput(failed, other)).toMatchObject({
      document_type: 'Other document — Lease agreement',
      rule_document_type: 'Other document',
      status: 'review_required',
      validation: { warnings: ['none fits'], errors: [] },
    });
    // A type the rule layer read confidently stands.
    const typed = { document_type: 'Share Certificate', status: 'passed' };
    expect(asOtherDocumentOutput(typed, other)).toBe(typed);
  });
});

// ── What is never kept ──────────────────────────────────────────────────────

/** An invented digit string completed with a Luhn check digit (no real number appears in this file). */
function withCheckDigit(body: string): string {
  for (let d = 0; d <= 9; d += 1) {
    const digits = `${body}${d}`;
    let sum = 0;
    for (let i = 0; i < digits.length; i += 1) {
      let n = Number(digits[digits.length - 1 - i]);
      if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
      sum += n;
    }
    if (sum % 10 === 0) return digits;
  }
  throw new Error('unreachable');
}

describe('bank or card accounts and ID numbers are never kept, whatever the reader returns', () => {
  const idShaped = withCheckDigit('123456789012');
  const cardShaped = withCheckDigit('400000000000000');
  const LETTER = doc('bank-letter-2.pdf', [
    'MARULA COMMERCIAL BANK',
    'BANK CONFIRMATION LETTER',
    'Account holder: BAOBAB ENGINEERING (PTY) LTD',
    'Account no: 6200 1122 33',
    'Closing balance: R 1 204 330.15',
    'Our ref: MCB/CONF/88123',
    `Learner reference ${idShaped}`,
    `Card ${cardShaped}`,
  ].join('\n'));

  it('drops facts labelled or quoted as an account or ID number, and ID- or card-shaped values', () => {
    const { facts, withheld } = validateFacts([
      { label: 'Account number', value: '6200 1122 33', quote: 'Account no: 6200 1122 33' },
      { label: 'Account', value: '6200 1122 33', quote: 'Account no: 6200 1122 33' },
      { label: 'Learner reference', value: idShaped, quote: `Learner reference ${idShaped}` },
      { label: 'Card', value: cardShaped, quote: `Card ${cardShaped}` },
      { label: 'ID no', value: 'L. Mahlangu', quote: '| L. Mahlangu | 900101 5009 087 | signed |' },
      { label: 'Account holder', value: 'BAOBAB ENGINEERING (PTY) LTD', quote: 'Account holder: BAOBAB ENGINEERING (PTY) LTD' },
      { label: 'Closing balance', value: 'R 1 204 330.15', quote: 'Closing balance: R 1 204 330.15' },
    ], LETTER);
    expect(facts.map((f) => f.label)).toEqual(['Account holder', 'Closing balance']);
    expect(withheld).toBe(5);
    expect(sensitiveFact({ label: 'Passport', value: 'A1', quote: 'Passport A1' })).toBe(true);
    expect(sensitiveFact({ label: 'Policy no', value: 'PM-55120', quote: 'Policy no: PM-55120' })).toBe(false);
  });

  it('drops a reference printed on an account line, keeps the document\'s own reference, and says what it withheld', () => {
    const open = openReadFromReplies([{
      document_label: 'Bank confirmation letter',
      reference_numbers: ['6200 1122 33', 'MCB/CONF/88123', idShaped],
      facts: [{ label: 'Account no', value: '6200 1122 33', quote: 'Account no: 6200 1122 33' }],
    }], LETTER, 'bbbee');
    expect(open.identity.referenceNumbers).toEqual(['MCB/CONF/88123']);
    expect(open.facts).toEqual([]);
    expect(open.withheld).toBe(3);
    expect(otherExtraction(LETTER.filename, open).exceptions.join(' ')).toMatch(/never stored/);
  });

  it('a listed read\'s other details drop an ID-number column too', () => {
    const read = otherDetailsFrom([
      { label: 'ID no', value: '900101 5009 087', quote: '| L. Mahlangu | 900101 5009 087 | signed |' },
      { label: 'Venue', value: 'Depot 4 training room', quote: 'Venue: Depot 4 training room' },
    ], ATTENDANCE, []);
    expect(read?.facts.map((f) => f.label)).toEqual(['Venue']);
    expect(read?.withheld).toBe(1);
  });

  it('the agent\'s cited reads are filtered the same way', () => {
    const open: OpenRead = { other: true, label: null, couldEvidence: [], identity: { title: null, issuedBy: null, aboutEntity: null, documentDate: null, period: null, referenceNumbers: [] }, facts: [], dropped: 0 };
    const [folded] = absorbOpenAgentValues([{
      documentId: OPEN_READ_ID, documentName: 'Other document', sourceFile: LETTER.filename,
      values: [
        { field: 'reference_numbers', value: '6200 1122 33; MCB/CONF/88123', sourceFile: LETTER.filename, sourceDocumentId: OPEN_READ_ID, source: { method: 'agent', quote: 'Account no: 6200 1122 33' } },
        { field: 'facts', value: [{ label: 'Account no', value: '6200 1122 33' }, { label: 'Closing balance', value: 'R 1 204 330.15' }], sourceFile: LETTER.filename, sourceDocumentId: OPEN_READ_ID, source: { method: 'agent', quote: 'x', rows: [{ quote: 'Account no: 6200 1122 33' }, { quote: 'Closing balance: R 1 204 330.15' }] } },
      ],
      missingFields: [], unexpectedFields: [], exceptions: [], open,
    }]);
    expect(folded.open?.identity.referenceNumbers).toEqual(['MCB/CONF/88123']);
    expect(folded.open?.facts.map((f) => f.label)).toEqual(['Closing balance']);
    expect(folded.open?.withheld).toBe(2);
  });
});

describe('the rule-based output says how confident its type decision was', () => {
  it('audit_trail.classification_status carries the decision\'s status', async () => {
    const repo = new InMemoryOntologyRepository();
    const none = await new ParserService(repo, {
      adjudicator: async () => ({ documentType: '', none: true, confidence: 0.9, reason: 'a lease' }),
    }).resolve(LEASE);
    expect(none.audit_trail.classification_status).toBe('unsupported');
    const plain = await new ParserService(repo).resolve(LEASE);
    expect(plain.audit_trail.classification_status).toEqual(expect.any(String));
  });
});
