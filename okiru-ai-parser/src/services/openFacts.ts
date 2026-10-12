/**
 * OPEN FACTS — reading a document for what it IS, not only for what a listed
 * type asks of it.
 *
 * The parser reads 109 B-BBEE and ~40 ESG document types, each with a field
 * list. A document that is none of them (a lease, a bank confirmation letter,
 * an insurance schedule, a municipal rates letter) used to be either forced
 * into the nearest listed type — and read under that type's field names — or
 * read for nothing at all. And on a listed document, anything its field list
 * did not ask for was dropped.
 *
 * This module is the pure half of the open read (openRead.ts makes the model
 * calls):
 *
 *  - An OTHER document is one no listed type fits. It gets its own extraction
 *    (`documentId` OPEN_READ_ID, `documentName` "Other document — <label>"),
 *    whose `open` block carries the document's identity (title, issuer, the
 *    entity it is about, date, period, references), the elements it could
 *    evidence, and its facts.
 *  - On a LISTED document, facts its field list does not ask for ride on the
 *    same extraction as `open` with `other: false` ("other details").
 *
 * WHAT KEEPS THIS FROM HURTING PRECISION
 *
 *  - Open facts are NEVER `values`. Resolution, the calculator mapping, the
 *    semantic placement, the derivations and the answer-key scorer read
 *    `values` only, so no open fact can reach a score by any of those paths.
 *    A fact that matches a calculator input is PROPOSED (openRead.ts
 *    proposeOpenMappings) with its evidence and a confidence, as a suggestion
 *    a person confirms; nothing applies it.
 *  - Every fact is cited and checked: its quote must occur in the document
 *    and its value must be inside its quote (the agent loop's own citation
 *    checks). A fact that fails is dropped and counted, never kept unverified.
 *    Identity values must be found in the document's text.
 *  - Values are copied as printed; the open skill forbids computing anything.
 *
 * MODE (PARSER_OPEN_READ): `other` (default) reads Other documents only (every
 * listed type's prompt is byte-identical to before); `on` also captures other
 * details on listed ones (it changes every listed prompt, so it waits on a
 * paid answer-key gate run); `off` turns both off
 * (every prompt and every result is exactly as before). The open read also
 * needs the skills (PARSER_SKILLS=off turns it off with them).
 */
import type { RawExtractionInput } from '../../schemas/document_types.js';
import type { DocumentExtraction } from './aiExtraction.js';
import {
  documentPages,
  quoteOccursIn,
  valueInQuote,
  type AgentTarget,
  type AgentTargetField,
} from './agentExtraction.js';
import { extractionDomain, type ExtractionDomain } from './extractionDomain.js';
import type { OpenSkill } from './skills.js';
import { OTHER_DOCUMENT_TYPE } from '../../parser/type_adjudicator.js';

/** The extraction id an Other document's open read is filed under. */
export const OPEN_READ_ID = 'open_read';

/** What a document no listed type fits is called, before its own label. */
export const OTHER_DOCUMENT = OTHER_DOCUMENT_TYPE;

export type OpenReadMode = 'on' | 'other' | 'off';

/**
 * `other` by default: listed reads keep byte-identical prompts (their free
 * cassette replays stay valid) until a paid answer-key gate run measures `on`.
 */
export function openReadMode(env: NodeJS.ProcessEnv = process.env): OpenReadMode {
  const flag = String(env.PARSER_OPEN_READ ?? '').trim().toLowerCase();
  if (flag === 'off' || flag === 'false' || flag === '0') return 'off';
  if (flag === 'on' || flag === 'true' || flag === '1') return 'on';
  return 'other';
}

/** The open skill for a domain, or null when the open read is off (or the skills are). */
export function activeOpenSkill(domain: ExtractionDomain, env: NodeJS.ProcessEnv = process.env): OpenSkill | null {
  if (openReadMode(env) === 'off') return null;
  try {
    return extractionDomain(domain).skills()?.open ?? null;
  } catch {
    return null;
  }
}

/** Whether a listed document's read also asks for facts its field list does not name. */
export function otherDetailsEnabled(domain: ExtractionDomain, env: NodeJS.ProcessEnv = process.env): boolean {
  return openReadMode(env) === 'on' && activeOpenSkill(domain, env) !== null;
}

export type OpenFactKind = 'identity' | 'figure' | 'date' | 'reference' | 'party' | 'person' | 'condition' | 'other';
const FACT_KINDS = new Set<OpenFactKind>(['identity', 'figure', 'date', 'reference', 'party', 'person', 'condition', 'other']);

/** One labelled fact, as printed, with where it is printed. */
export interface OpenFact {
  /** The document's own wording for the fact, where it names it. */
  label: string;
  /** As printed. */
  value: string;
  unit: string | null;
  kind: OpenFactKind;
  page: number | null;
  /** A table cell reference (agent reads of a table), when the reader gave one. */
  cell: string | null;
  /** The printed line or cell the value is in; checked to occur in the document. */
  quote: string;
  /** Who read it: the open read / the listed read's other details ('ai'), the agent's cited read, or the code reading a sheet's labelled cell ('code'). */
  method: 'ai' | 'agent' | 'code';
}

export interface OpenIdentity {
  title: string | null;
  issuedBy: string | null;
  aboutEntity: string | null;
  documentDate: string | null;
  period: string | null;
  referenceNumbers: string[];
}

/**
 * A fact that corresponds to a known calculator input — proposed, never
 * applied. `field` is the parser field name the calculator mapping already
 * speaks for that key (the "field bridge" vocabulary), when there is one.
 */
export interface OpenMappingProposal {
  /** Index of the fact in `facts`. */
  fact: number;
  label: string;
  value: string;
  calculatorKey: string;
  field: string | null;
  /** The value as the calculator would take it, after the same coercion and allowlist check as any mapping. */
  coerced: unknown;
  /** The model's confidence that the fact means this input, 0..1. */
  confidence: number;
  evidence: { sourceFile: string; page: number | null; cell: string | null; quote: string };
  /** Never applied by the parser: a person confirms it in the review. */
  status: 'suggested';
}

export interface OpenRead {
  /** True: no listed type fits (an Other document). False: other details on a listed document. */
  other: boolean;
  /** The reader's own short type label ("Lease agreement"); null on a listed document. */
  label: string | null;
  /** Elements the document could evidence (domain element keys); empty when none. */
  couldEvidence: string[];
  identity: OpenIdentity;
  facts: OpenFact[];
  /** Facts or identity values refused by the citation check. */
  dropped: number;
  /** Facts or references never kept because they are a bank or card account or an ID number. */
  withheld?: number;
  proposals?: OpenMappingProposal[];
}

/** Facts kept per document: the ones a reader would note, not every line. */
export const MAX_OPEN_FACTS = 40;
/** Other details kept on a listed document. */
export const MAX_OTHER_DETAILS = 15;
/** A quote is the printed line or cell, not the page. */
const MAX_QUOTE = 400;

const B_BBEE_ELEMENTS = ['OWNERSHIP', 'MANAGEMENT_CONTROL', 'SKILLS_DEVELOPMENT', 'ESD', 'SED', 'FINANCIALS'];
const ESG_ELEMENTS = [
  'GHG_ENERGY', 'FLEET', 'WASTE', 'WATER', 'ISO_ENVIRONMENTAL', 'EMPLOYMENT_EQUITY', 'HEALTH_SAFETY', 'TRAINING',
  'COMMUNITY_CSI', 'SUPPLIER_ESG', 'BOARD_GOVERNANCE', 'ETHICS_COMPLIANCE', 'RISK_ASSURANCE', 'FINANCIAL',
];

export function domainElements(domain: ExtractionDomain): string[] {
  return domain === 'esg' ? ESG_ELEMENTS : B_BBEE_ELEMENTS;
}

export function emptyIdentity(): OpenIdentity {
  return { title: null, issuedBy: null, aboutEntity: null, documentDate: null, period: null, referenceNumbers: [] };
}

const EMPTY_WORDS = new Set(['', 'null', 'n/a', 'na', 'none', 'not stated', 'not found', 'unknown', '-', '—']);

function text(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return EMPTY_WORDS.has(s.toLowerCase()) ? null : s;
}

/** The page a quote is printed on: the cited one when the quote is there, else the first that holds it. */
function pageOf(quote: string, pages: string[], cited: unknown): number | null | undefined {
  const n = typeof cited === 'number' ? cited : typeof cited === 'string' && /^\d+$/.test(cited.trim()) ? Number(cited) : NaN;
  if (Number.isInteger(n) && n >= 1 && n <= pages.length && quoteOccursIn(quote, pages[n - 1])) return pages.length > 1 ? n : null;
  const found = pages.findIndex((page) => quoteOccursIn(quote, page));
  if (found < 0) return undefined;
  return pages.length > 1 ? found + 1 : null;
}

// ─── What is never kept ─────────────────────────────────────────────────────

/**
 * Labels that name a bank or card account, or a person's ID or passport
 * number. A bare "account number" is included: from the label alone a bank
 * account cannot be told from any other, and an open fact is only ever a
 * reviewer's note, so withholding it costs nothing that scores.
 */
const SENSITIVE_LABEL = new RegExp([
  String.raw`\bbank\s*acc(?:ount|t)?\b`,
  String.raw`\bacc(?:ount|t)?\.?\s*(?:no|nr|num|number|#)(?![a-z])`,
  String.raw`\b(?:iban|bic)\b`,
  String.raw`\bswift\s*code\b`,
  String.raw`\b(?:credit|debit|cheque)\s*card\b`,
  String.raw`\bcard\s*(?:no|nr|num|number|#)(?![a-z])`,
  String.raw`\bcvv\b`,
  String.raw`\bid\.?\s*(?:no|nr|num|number|#)(?![a-z])`,
  String.raw`\bidentity\s*(?:no|nr|num|number|document)\b`,
  String.raw`\bpassport\b`,
].join('|'), 'i');

/** Passes the Luhn check (SA ID numbers and card numbers do). */
function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/** A value that is only an identifier: digits with spaces, dashes or slashes, at least six digits. */
function identifierShaped(value: string): boolean {
  return /^[\d\s\-/]+$/.test(value) && value.replace(/\D/g, '').length >= 6;
}

/** A 13-digit ID number or a 15–16 digit card number, by shape and check digit. */
function looksLikeIdOrCard(value: string): boolean {
  if (!/^[\d\s-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  return (digits.length === 13 || digits.length === 15 || digits.length === 16) && luhn(digits);
}

/**
 * A fact the parser never keeps: a bank or card account, or an ID or passport
 * number. By its label; by its quote when the value is a bare identifier on a
 * line that names one ("Account no: 1234567890"); or by its shape (a 13-digit
 * ID number or a card number that passes the check digit).
 */
export function sensitiveFact(fact: { label: string; value: string; quote: string }): boolean {
  if (SENSITIVE_LABEL.test(fact.label)) return true;
  if (looksLikeIdOrCard(fact.value)) return true;
  return identifierShaped(fact.value) && SENSITIVE_LABEL.test(fact.quote);
}

/**
 * A printed reference the parser never keeps: one shaped like an ID or card
 * number, or one printed on a line that names a bank or card account or an ID
 * number.
 */
export function sensitiveReference(reference: string, lines: string[]): boolean {
  if (looksLikeIdOrCard(reference)) return true;
  return lines.some((line) => quoteOccursIn(reference, line) && SENSITIVE_LABEL.test(line));
}

/** The document's lines, for finding the line a reference is printed on. */
function documentLines(whole: string): string[] {
  return whole.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

/**
 * Check and keep the facts a reply returned. A fact is kept only when its
 * label, value and quote are there, its quote occurs in the document (on its
 * cited page, or the page that holds it), and its value is inside its quote.
 * Duplicates (same label and value) are kept once.
 */
export function validateFacts(
  raw: unknown,
  source: Pick<RawExtractionInput, 'markdown' | 'raw_text'>,
  options: { limit?: number; method?: OpenFact['method']; exclude?: (fact: OpenFact) => boolean } = {},
): { facts: OpenFact[]; dropped: number; withheld: number } {
  const list = Array.isArray(raw) ? raw : [];
  const pages = documentPages(source);
  const whole = pages.join('\n');
  const facts: OpenFact[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  let withheld = 0;
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { dropped += 1; continue; }
    const record = item as Record<string, unknown>;
    const label = text(record.label);
    const value = text(record.value);
    const quote = text(record.quote);
    if (!label || !value || !quote || quote.length > MAX_QUOTE) { dropped += 1; continue; }
    // Never kept, whatever the reader returned: a bank or card account, an ID number.
    if (sensitiveFact({ label, value, quote })) { withheld += 1; continue; }
    if (!quoteOccursIn(quote, whole) || !valueInQuote(value, quote)) { dropped += 1; continue; }
    const page = pageOf(quote, pages, record.page);
    if (page === undefined) { dropped += 1; continue; }
    const kindRaw = String(record.kind ?? '').trim().toLowerCase() as OpenFactKind;
    const fact: OpenFact = {
      label: label.slice(0, 200),
      value: value.slice(0, 1000),
      unit: text(record.unit)?.slice(0, 60) ?? null,
      kind: FACT_KINDS.has(kindRaw) ? kindRaw : 'other',
      page,
      cell: text(record.cell ?? record.cellRef)?.slice(0, 40) ?? null,
      quote,
      method: options.method ?? 'ai',
    };
    if (options.exclude?.(fact)) continue;
    const key = `${fact.label.toLowerCase()}\u0000${fact.value.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(fact);
  }
  const limit = options.limit ?? MAX_OPEN_FACTS;
  return { facts: facts.slice(0, limit), dropped: dropped + Math.max(0, facts.length - limit), withheld };
}

/** An identity value is kept only when the document's text holds it. */
function groundedText(value: unknown, whole: string, type?: 'date'): string | null {
  const s = text(value);
  if (!s) return null;
  return quoteOccursIn(s, whole) || valueInQuote(s, whole, type) ? s.slice(0, 300) : null;
}

/** "a; b", ["a", "b"] → ["a", "b"], each kept only when printed in the document. */
function groundedList(value: unknown, whole: string): { kept: string[]; dropped: number; withheld: number } {
  const items = Array.isArray(value)
    ? value.map(text)
    : (text(value) ?? '').split(/\s*;\s*/).map(text);
  const kept: string[] = [];
  const lines = documentLines(whole);
  let dropped = 0;
  let withheld = 0;
  for (const item of items) {
    if (!item) continue;
    if (!quoteOccursIn(item, whole)) { dropped += 1; continue; }
    if (sensitiveReference(item, lines)) { withheld += 1; continue; }
    if (!kept.includes(item)) kept.push(item.slice(0, 120));
  }
  return { kept: kept.slice(0, 10), dropped, withheld };
}

/** Element keys of this domain, in the reply's list or comma-separated text. */
export function evidencedElements(value: unknown, domain: ExtractionDomain): string[] {
  const allowed = new Set(domainElements(domain));
  const items = Array.isArray(value) ? value : String(value ?? '').split(/[,;]/);
  const out: string[] = [];
  for (const item of items) {
    const key = String(item ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
    if (allowed.has(key) && !out.includes(key)) out.push(key);
  }
  return out;
}

/** A short type label: a few words, never a sentence or a skill id. */
export function cleanLabel(value: unknown): string | null {
  const s = text(value);
  if (!s) return null;
  const words = s.replace(/_/g, ' ').replace(/[.:;]+$/, '').trim();
  if (!words || words.length > 80) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The open read of an Other document from the model's parsed reply(ies) —
 * one per chunk, the first chunk's identity first, facts from all of them.
 */
export function openReadFromReplies(
  replies: Array<Record<string, unknown>>,
  source: Pick<RawExtractionInput, 'markdown' | 'raw_text'>,
  domain: ExtractionDomain,
  fallbackLabel: string | null = null,
): OpenRead {
  const whole = documentPages(source).join('\n');
  const first = (key: string): unknown => replies.map((reply) => reply[key]).find((value) => text(value) !== null || (Array.isArray(value) && value.length > 0));
  let dropped = 0;
  const keep = (key: string, type?: 'date'): string | null => {
    const raw = first(key);
    if (text(raw) === null) return null;
    const kept = groundedText(raw, whole, type);
    if (!kept) dropped += 1;
    return kept;
  };
  const references = groundedList(first('reference_numbers'), whole);
  dropped += references.dropped;
  const identity: OpenIdentity = {
    title: keep('document_title'),
    issuedBy: keep('issued_by'),
    aboutEntity: keep('about_entity'),
    documentDate: keep('document_date', 'date'),
    period: keep('period'),
    referenceNumbers: references.kept,
  };
  const facts = validateFacts(replies.flatMap((reply) => (Array.isArray(reply.facts) ? reply.facts : [])), source);
  const withheld = references.withheld + facts.withheld;
  return {
    other: true,
    label: cleanLabel(first('document_label')) ?? cleanLabel(fallbackLabel),
    couldEvidence: evidencedElements(replies.flatMap((reply) => (Array.isArray(reply.could_evidence) ? reply.could_evidence : [reply.could_evidence])), domain),
    identity,
    facts: facts.facts,
    dropped: dropped + facts.dropped,
    ...(withheld > 0 ? { withheld } : {}),
  };
}

/** "Other document — Lease agreement". */
export function otherDocumentName(label: string | null): string {
  return label ? `${OTHER_DOCUMENT} — ${label}` : OTHER_DOCUMENT;
}

/** The extraction an Other document's open read is filed as. It carries no `values`. */
export function otherExtraction(sourceFile: string, open: OpenRead, exceptions: string[] = []): DocumentExtraction {
  return {
    documentId: OPEN_READ_ID,
    documentName: otherDocumentName(open.label),
    sourceFile,
    values: [],
    missingFields: [],
    unexpectedFields: [],
    exceptions: [
      ...exceptions,
      ...(open.dropped > 0
        ? [`${open.dropped} detail(s) the open read returned were left out: their quote or value was not found in the document.`]
        : []),
      ...(open.withheld
        ? [`${open.withheld} detail(s) were not kept: a bank or card account or an ID number is never stored.`]
        : []),
    ],
    open,
  };
}

/** Whether an extraction is an Other document's open read. */
export function isOtherDocument(extraction: Pick<DocumentExtraction, 'documentId'>): boolean {
  return extraction.documentId === OPEN_READ_ID;
}

/**
 * Too little read for an Other document: fewer than three facts, or nothing
 * that says what it is (no title, issuer or entity). The agent gate treats it
 * as a hard document.
 */
export function openReadTooLittle(open: OpenRead | undefined): boolean {
  if (!open) return true;
  const named = Boolean(open.identity.title || open.identity.issuedBy || open.identity.aboutEntity);
  return open.facts.length < 3 || !named;
}

// ─── The agent's target for an Other document ───────────────────────────────

/** Open-skill identity field → OpenIdentity key. */
const IDENTITY_FIELDS: Record<string, keyof OpenIdentity> = {
  document_title: 'title',
  issued_by: 'issuedBy',
  about_entity: 'aboutEntity',
  document_date: 'documentDate',
  period: 'period',
  reference_numbers: 'referenceNumbers',
};

/**
 * The agent loop's target for an Other document: the open skill's identity
 * fields and its facts as rows (label, value, unit), every one cited under the
 * agent's own citation checks. The document's label and the elements it could
 * evidence are the open read's judgement, not something a quote can carry, so
 * they are not asked for.
 */
export function openAgentTarget(domain: ExtractionDomain, skill: OpenSkill | null = activeOpenSkill(domain)): AgentTarget | null {
  if (!skill) return null;
  const fields: AgentTargetField[] = skill.fields
    .filter((field) => field.name in IDENTITY_FIELDS)
    .map((field) => ({
      name: field.name,
      type: field.type,
      required: false,
      description: field.description,
      labels: field.labels,
    }));
  const columns: AgentTargetField[] = skill.rowFields
    .filter((field) => field.name === 'label' || field.name === 'value' || field.name === 'unit')
    .map((field) => ({
      name: field.name,
      type: 'text',
      required: field.name !== 'unit',
      description: field.description,
      labels: [],
    }));
  return {
    specId: OPEN_READ_ID,
    specName: OTHER_DOCUMENT,
    fields,
    rows: { field: skill.rowsField, columns },
    instructions: [
      `WHAT THIS DOCUMENT IS:\n${skill.sections.whatItIs}`,
      `WHERE THE VALUES SIT:\n${skill.sections.where}`,
      `TRAPS:\n${skill.sections.traps}`,
      'Each row is ONE fact: its label as printed beside it, its value as printed, and its unit when printed. The label and the value must both be in the row\'s quote.',
    ].join('\n\n'),
    hard: true,
    ...(domain === 'bbbee' ? {} : { domain }),
  };
}

/**
 * Fold what the agent read for an Other document into its open read, and keep
 * the extraction's `values` empty: the agent files its cited values as values
 * of the target's extraction, and an Other document's must never reach
 * resolution or scoring. Identity fields fill gaps only; rows become facts
 * (method 'agent', with the row's own citation), after the facts already read.
 */
export function absorbOpenAgentValues(extractions: DocumentExtraction[], rowsField = 'facts'): DocumentExtraction[] {
  return extractions.map((extraction) => {
    if (!isOtherDocument(extraction) || extraction.values.length === 0) return extraction;
    const open: OpenRead = extraction.open
      ? { ...extraction.open, identity: { ...extraction.open.identity }, facts: [...extraction.open.facts] }
      : { other: true, label: null, couldEvidence: [], identity: emptyIdentity(), facts: [], dropped: 0 };
    for (const value of extraction.values) {
      const key = IDENTITY_FIELDS[value.field];
      if (key === 'referenceNumbers') {
        const line = text(value.source?.quote) ?? '';
        for (const ref of (text(value.value) ?? '').split(/\s*;\s*/).map(text)) {
          if (!ref) continue;
          if (sensitiveReference(ref, line ? [line] : [])) { open.withheld = (open.withheld ?? 0) + 1; continue; }
          if (!open.identity.referenceNumbers.includes(ref)) open.identity.referenceNumbers.push(ref);
        }
        continue;
      }
      if (key) {
        if (!open.identity[key]) (open.identity[key] as string | null) = text(value.value);
        continue;
      }
      if (value.field !== rowsField || !Array.isArray(value.value)) continue;
      const citations = value.source?.rows ?? [];
      value.value.forEach((row, index) => {
        if (!row || typeof row !== 'object') return;
        const cells = row as Record<string, unknown>;
        const label = text(cells.label);
        const printed = text(cells.value);
        const cite = citations[index];
        if (!label || !printed || !cite?.quote) return;
        if (sensitiveFact({ label, value: printed, quote: cite.quote })) { open.withheld = (open.withheld ?? 0) + 1; return; }
        if (open.facts.some((fact) => fact.label.toLowerCase() === label.toLowerCase() && fact.value.toLowerCase() === printed.toLowerCase())) return;
        if (open.facts.length >= MAX_OPEN_FACTS) return;
        open.facts.push({
          label,
          value: printed,
          unit: text(cells.unit),
          kind: 'other',
          page: cite.page ?? null,
          cell: cite.cellRef ?? null,
          quote: cite.quote,
          method: 'agent',
        });
      });
    }
    return { ...extraction, values: [], missingFields: [], open };
  });
}

// ─── Other details on a listed document ─────────────────────────────────────

/** The reply key a listed read returns its other details under. */
export const OTHER_DETAILS_KEY = 'other_facts';

/**
 * The prompt lines that ask a listed read for its other details. Appended
 * before the document; absent (byte-identical prompts) unless the mode is on.
 */
export function otherDetailsPromptLines(): string {
  return [
    `\nOTHER DETAILS: also return "${OTHER_DETAILS_KEY}": an array (at most ${MAX_OTHER_DETAILS}) of anything clearly important this document states`,
    'that the keys above do not ask for: a figure, date, reference number, party, person or condition a reviewer would note.',
    'Never a bank account, card, ID or passport number.',
    'Each item is {"label": the document\'s own wording, "value": as printed, "unit": as printed or null, "page": or null,',
    '"quote": the printed line it is in, word for word}. Never repeat a value already returned under a key above, never',
    'compute, and return [] when there is nothing more.',
  ].join('\n');
}

/**
 * The other details of a listed read: checked like any open fact, and never a
 * value the read already returned under one of its own keys.
 */
export function otherDetailsFrom(
  raw: unknown[],
  source: Pick<RawExtractionInput, 'markdown' | 'raw_text'>,
  returned: unknown[],
): OpenRead | null {
  if (raw.length === 0) return null;
  const already = new Set(returned.flatMap(leafTexts).map((v) => v.toLowerCase()));
  const { facts, dropped, withheld } = validateFacts(raw, source, {
    limit: MAX_OTHER_DETAILS,
    exclude: (fact) => already.has(fact.value.toLowerCase()),
  });
  if (facts.length === 0 && dropped === 0 && withheld === 0) return null;
  return { other: false, label: null, couldEvidence: [], identity: emptyIdentity(), facts, dropped, ...(withheld > 0 ? { withheld } : {}) };
}

function leafTexts(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap(leafTexts);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(leafTexts);
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s ? [s] : [];
}
