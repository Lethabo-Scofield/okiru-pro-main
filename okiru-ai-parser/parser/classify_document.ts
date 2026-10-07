import type { DocumentClassification, DocumentClassificationCandidate } from '../schemas/document_types.js';
import type { RawExtractionInput } from '../schemas/parser_output.js';
import type { DocumentKnowledge, DocumentTypeNode, FieldKnowledge, OntologyRepository } from '../graph/ontology_models.js';
import { defaultDocumentKnowledge } from '../graph/ontology_queries.js';
import { elementFromHint } from '../src/services/specRetrieval.js';
import { MIN_READABLE_CHARS } from './type_adjudicator.js';

/**
 * A workbook sheet states its own element in its NAME. A sheet titled
 * "Procurement" IS preferential-procurement evidence, "Ownership" IS ownership
 * — that is not a guess, it is what the tab says it is. The content-matching
 * classifier below is blind to this: fed the sheet's data (supplier rows, ID
 * numbers) it matched the generic B-BBEE vocabulary to affidavit specs and
 * scored a "Procurement" sheet as a "Sworn Affidavit" — 0 of 53 sheets passed
 * on the real Thandanani pack. So when a document is a named workbook sheet, its
 * element is authoritative and the specs of that element's pillar are lifted to
 * a passing confidence. elementFromHint owns the sheet-name → element mapping
 * (shared with extraction retrieval, so the two never diverge).
 */
const ELEMENT_TO_PILLAR: Record<string, string> = {
  OWNERSHIP: 'OWN',
  MANAGEMENT_CONTROL: 'MAC',
  SKILLS_DEVELOPMENT: 'SKL',
  ESD: 'ESD',
  SED: 'SED',
};

/** The sheet name from a split-workbook filename ("File.xlsx › Procurement"). */
function sheetNameOf(input: RawExtractionInput): string {
  const meta = (input.metadata ?? {}) as { sheet_name?: unknown };
  if (typeof meta.sheet_name === 'string' && meta.sheet_name.trim()) return meta.sheet_name.trim();
  const f = input.filename ?? '';
  const marker = f.indexOf('›');
  return marker >= 0 ? f.slice(marker + 1).trim() : '';
}

const PASS_CONFIDENCE = 0.85;
const REVIEW_CONFIDENCE = 0.6;
const AMBIGUITY_MARGIN = 0.15;

/**
 * WORDS, NOT SUBSTRINGS.
 *
 * Matching used to be `string.includes` over the normalised text, so the shared
 * alias "SED" matched inside "based" and a company profile ranked as a Skills
 * Development schedule. Every comparison below is now between whole words:
 * both sides go through the same normaliser, and a term matches only when it
 * sits between word boundaries.
 *
 * The normaliser makes three deliberate choices:
 *
 * 1. Plurals fold to one word, on BOTH sides. "employee" and "employees" are
 *    the same evidence, so the EEA1 name ("Declaration by Employee (disabled
 *    employees)") no longer counts that one idea twice against a payroll that
 *    says "Employee" and "Number of employees". The fold strips a final "s"
 *    from words over four letters (not "ss", "us", "is": "class", "status",
 *    "analysis" stay whole). It is not a stemmer — it only has to be
 *    consistent, because text and terms are folded the same way. "salaries"
 *    folds to "salarie", not "salary", on purpose: see CONCEPTS.
 * 2. Compounds are written one way: "pay roll" is "payroll", "pay slip" is
 *    "payslip", "B-BBEE" is "bbbee", "EMP 201" is "emp201".
 * 3. Nothing else. Synonyms are not rewritten into the text; they ADD a concept
 *    word beside it (see CONCEPTS), so the document's own words still match.
 */
const FOLD_KEEP = /(ss|us|is)$/;

function foldWord(word: string): string {
  return word.length > 4 && word.endsWith('s') && !FOLD_KEEP.test(word) ? word.slice(0, -1) : word;
}

const COMPOUNDS: Array<[RegExp, string]> = [
  [/\bpay roll\b/g, 'payroll'],
  [/\bpay slip\b/g, 'payslip'],
  [/\bshare holder\b/g, 'shareholder'],
  [/\bwork place\b/g, 'workplace'],
  [/\bb bbee\b/g, 'bbbee'],
  // Statutory form codes are written with and without the space.
  [/\b(emp|eea|cor|irp|uif) (\d+)\b/g, '$1$2'],
];

function normalizeForMatch(value: string): string {
  let out = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(foldWord)
    .join(' ');
  for (const [pattern, replacement] of COMPOUNDS) out = out.replace(pattern, replacement);
  return out;
}

/**
 * CONCEPTS — what a document is about, in the words a person uses for it.
 *
 * A payroll export is titled "Transaction History Report" and its columns say
 * "Employee" and "Basic Salary"; nothing on it says "payroll", which is the only
 * word the payroll types are named with. So it scored 0 as a payroll and lost to
 * EEA1 on the word "employee". A concept rule adds the type's own word
 * ("payroll") beside the phrases that mean it.
 *
 * Kept deliberately narrow:
 * - "basic salary", "salary report" and "payslip" mean payroll on their own.
 * - "salary" (singular) alone does NOT: it is a word in every employment
 *   contract, EEA2/EEA4 income-differential statement and job description. It
 *   only means payroll when the document is payroll-SHAPED (see
 *   payrollShaped): several amount rows, a total, payroll-run columns, and no
 *   title naming it as one of those other documents. "salaries" is an expense
 *   line in every set of financial statements, so it never counts.
 * - "transaction history" is also what a BANK calls a statement, so it only
 *   means payroll when the same region talks about employees or pay.
 * - A concept word is evidence for name and description tokens only, never for
 *   an alias: an alias is what a document calls ITSELF.
 */
interface ConceptRule {
  concept: string;
  pattern: RegExp;
  /** The phrase only means the concept when the same region also says this. */
  requires?: RegExp;
  /** …and only when the region's raw text has this shape. */
  shape?: (raw: string, normalized: string) => boolean;
}

/** A line carrying a money amount: "R 18 000,00", "18000.00", "1 204 000,50". */
const AMOUNT_LINE = /(?:\bR\s?\d|\d[\d\s]*[.,]\d{2}\b)/;
/** Columns a payroll RUN has and a contract, EE statement or job description does not tabulate. */
const PAYROLL_RUN_TERMS = /\b(paye|uif|net pay|nett pay|net salary|nett salary|gross pay|deduction)\b/;
/** Documents that say "salary" and name themselves as something other than payroll. */
const OTHER_EMPLOYMENT_DOCUMENTS = /\b(contract of employment|employment contract|letter of appointment|job description|income differential|eea2|eea4)\b/;
/** Several employee rows: a payroll lists people, a contract describes one. */
const MIN_PAYROLL_ROWS = 3;

/**
 * Is a region shaped like a payroll run? Several lines carrying amounts (one per
 * employee), a total, a payroll-run column, and no title naming it as a
 * contract, an income-differential statement or a job description.
 */
function payrollShaped(raw: string, normalized: string): boolean {
  if (OTHER_EMPLOYMENT_DOCUMENTS.test(normalized)) return false;
  if (!/\btotal\b/.test(normalized) || !PAYROLL_RUN_TERMS.test(normalized)) return false;
  return raw.split(/\r?\n/).filter((line) => AMOUNT_LINE.test(line)).length >= MIN_PAYROLL_ROWS;
}

const CONCEPTS: ConceptRule[] = [
  { concept: 'payroll', pattern: /\b(basic salary|salary report|payslip)\b/ },
  { concept: 'payroll', pattern: /\bsalary\b/, shape: payrollShaped },
  { concept: 'payroll', pattern: /\btransaction history\b/, requires: /\b(employee|salary|basic pay|hourly pay|paye)\b/ },
];

/** The concept words a (normalised) region evidences, beyond its own words. */
function conceptsIn(normalized: string, raw: string): string[] {
  const found = new Set<string>();
  for (const rule of CONCEPTS) {
    if (found.has(rule.concept)) continue;
    if (!rule.pattern.test(normalized)) continue;
    if (rule.requires && !rule.requires.test(normalized)) continue;
    if (rule.shape && !rule.shape(raw, normalized)) continue;
    if (!new RegExp(`\\b${rule.concept}\\b`).test(normalized)) found.add(rule.concept);
  }
  return Array.from(found);
}

/**
 * The concept words a raw text evidences — exported so the adjudication
 * shortlist's spec retrieval can be told what the classifier was told.
 */
export function contentConcepts(text: string): string[] {
  return conceptsIn(normalizeForMatch(text), text);
}

/** A normalised region, padded so whole-word containment is one `includes`. */
interface Region {
  /** The region's own words, padded: " word word ". */
  words: string;
  /** The region's words plus its concept words, padded. */
  withConcepts: string;
}

function region(value: string): Region {
  const normalized = normalizeForMatch(value);
  const concepts = conceptsIn(normalized, value);
  return {
    words: ` ${normalized} `,
    withConcepts: ` ${[normalized, ...concepts].filter(Boolean).join(' ')} `,
  };
}

/** Whole-word containment of an already-normalised term. */
function hasTerm(haystack: string, normalizedTerm: string): boolean {
  return normalizedTerm.length > 0 && haystack.includes(` ${normalizedTerm} `);
}

/**
 * IDENTIFIER LABELS ARE NOT SUBJECTS.
 *
 * "VAT Reg. No. 4000000000" on a letterhead or footer is the sender's tax
 * number; it says nothing about what the letter is. Matched as a word, the
 * shared alias "VAT" made every letter on company letterhead rank as a VAT
 * declaration. A short abbreviation (VAT, SDL, UIF, PAYE…) counts as the
 * document's subject only where at least one occurrence is NOT followed by a
 * registration-number label ("reg", "no", "number", "ref") or the number
 * itself. Longer terms and phrases are never identifier labels.
 */
const MAX_ABBREVIATION = 4;
const IDENTIFIER_LABEL_FOLLOWER = '(?:reg|registration|no|nr|number|num|ref|reference|\\d{6,})';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasSubjectTerm(haystack: string, normalizedTerm: string): boolean {
  if (!hasTerm(haystack, normalizedTerm)) return false;
  if (normalizedTerm.includes(' ') || normalizedTerm.length > MAX_ABBREVIATION) return true;
  return new RegExp(` ${escapeRegExp(normalizedTerm)} (?!${IDENTIFIER_LABEL_FOLLOWER} )`).test(haystack);
}

/**
 * Words that say nothing about WHICH document this is. Short function words
 * ("are", "our") used to count as name tokens, and pure numbers ("100" from
 * "51%/100% black-owned") matched every page with a percentage on it.
 */
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'each', 'all', 'per', 'copy', 'document', 'documents',
  'certificate', 'certificates', 'signed', 'valid', 'current', 'where', 'applicable',
  'inspection', 'inspect', 'attached', 'return', 'json', 'fields', 'list', 'bool',
  'date', 'value', 'values', 'entity', 'name',
  'are', 'our', 'this', 'that', 'from', 'has', 'have', 'was', 'were', 'not', 'any',
  'its', 'one', 'who', 'which', 'will', 'may', 'been', 'into', 'than', 'only', 'also',
  'such', 'other', 'their', 'there', 'these', 'those', 'within', 'upon', 'including',
  'incl', 'via', 'used', 'when', 'what', 'how', 'out', 'off', 'yes',
].map(foldWord));

/**
 * The words of a type's name or description that can identify a document —
 * normalised exactly like the text they are matched against.
 */
function importantTokens(...values: string[]): string[] {
  return Array.from(new Set(normalizeForMatch(values.join(' '))
    .split(' ')
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token) && !/^\d+$/.test(token))))
    .slice(0, 32);
}

/**
 * How much text counts as the document's "header".
 *
 * A document declares what it IS at the top — a title, a letterhead, a form
 * name. Evidence found there identifies the document; the same word found on
 * page 40 of a workbook is incidental. Measured on the real Thandanani pack,
 * matching anywhere in the body made every large file score 0.99 as a B-BBEE
 * certificate, because a BEE workbook contains every BEE term somewhere.
 */
const HEADER_CHARS = 1200;

/** Matches deep in the body still count, but they cannot carry a document alone. */
const BODY_MATCH_WEIGHT = 0.3;

/**
 * THE FILENAME IS A LABEL, NOT CONTENT.
 *
 * The filename used to be glued onto the header, so a word in it counted as
 * much as the document's own title. Filenames are typed by people and are
 * often wrong or generic: a file named as skills-development evidence can
 * hold EMP201 returns (and was read as a skills document), and a payroll
 * export was decided by what its name did NOT say. The filename is now its
 * own region with a small weight — enough to break a tie between documents
 * whose content says the same thing, never enough to carry a type the content
 * does not support. Below a body mention on purpose: the body is the document
 * speaking, the filename is someone describing it.
 *
 * Except when there IS no text. An unreadable scan or a blank page has nothing
 * to outweigh the filename, and the adjudicator declines to read fewer than
 * MIN_READABLE_CHARS characters — so there the filename carries the full
 * weight it had before (as if it were the document's title), and the evidence
 * basis still says 'filename'.
 */
const FILENAME_MATCH_WEIGHT = 0.15;

/** Extensions are not words of the name ("pdf", "xlsx" match nothing useful). */
const FILE_EXTENSION = /\.(pdf|docx?|xlsx|xlsm|xls|csv|txt|pptx?|png|jpe?g|tiff?|webp)\b/gi;

interface MatchRegions {
  /** Opening of the document's own text. */
  header: Region;
  /** The whole document text. */
  full: Region;
  /** The filename, extension(s) removed. */
  filename: Region;
  /** What a filename match is worth: FILENAME_MATCH_WEIGHT, or 1 when there is no text. */
  filenameWeight: number;
}

function matchRegions(filename: string, text: string, readableChars = text.trim().length): MatchRegions {
  return {
    header: region(text.slice(0, HEADER_CHARS)),
    full: region(text),
    filename: region(filename.replace(FILE_EXTENSION, ' ')),
    filenameWeight: readableChars < MIN_READABLE_CHARS ? 1 : FILENAME_MATCH_WEIGHT,
  };
}

/** Where a token was found, strongest place first. */
type TokenPlace = 'header' | 'body' | 'filename';

function placeWeight(regions: MatchRegions, place: TokenPlace): number {
  if (place === 'header') return 1;
  return place === 'body' ? BODY_MATCH_WEIGHT : regions.filenameWeight;
}

function tokenPlace(regions: MatchRegions, token: string): TokenPlace | null {
  if (hasSubjectTerm(regions.header.withConcepts, token)) return 'header';
  if (hasSubjectTerm(regions.full.withConcepts, token)) return 'body';
  if (hasSubjectTerm(regions.filename.withConcepts, token)) return 'filename';
  return null;
}

/**
 * Position-aware coverage: a token in the header scores 1, the same token only
 * in the body scores BODY_MATCH_WEIGHT, only in the filename regions.filenameWeight.
 * `inText` lists the tokens the document's own text carries.
 */
function tokenCoverage(
  regions: MatchRegions,
  tokens: string[],
): { score: number; matched: string[]; inText: string[] } {
  if (tokens.length === 0) return { score: 0, matched: [], inText: [] };

  let weight = 0;
  const matched: string[] = [];
  const inText: string[] = [];
  for (const token of tokens) {
    const place = tokenPlace(regions, token);
    if (!place) continue;
    weight += placeWeight(regions, place);
    matched.push(token);
    if (place !== 'filename') inText.push(token);
  }
  return { score: weight / tokens.length, matched, inText };
}

function safeRegexTest(regexSource: string | undefined, text: string): boolean {
  if (!regexSource) return false;
  try {
    return new RegExp(regexSource, 'i').test(text);
  } catch {
    return false;
  }
}

function fieldEvidence(
  regions: MatchRegions,
  rawText: string,
  fields: FieldKnowledge[],
): { score: number; matched: string[]; reasons: string[] } {
  // A non-identifying (borrowed) field is read for the type, not evidence of it.
  const identifying = fields.filter((field) => field.field.identifying !== false);
  const expected = identifying.filter((field) => field.field.required);
  const targetFields = expected.length > 0 ? expected : identifying;
  if (targetFields.length === 0) return { score: 0, matched: [], reasons: [] };

  const matched = new Set<string>();
  const reasons: string[] = [];
  let weight = 0;

  for (const fieldKnowledge of targetFields) {
    const fieldName = fieldKnowledge.field.name;
    const label = normalizeForMatch(fieldName.replace(/_/g, ' '));

    // A labelled regex hit is strong evidence wherever it appears — it matches
    // a shaped value ("Certificate Number: BEE/2026/00184"), not a bare word.
    // Field evidence is the document's TEXT only: a filename carries no fields.
    const patternHit = fieldKnowledge.patterns.some((pattern) => {
      if (pattern.regex && safeRegexTest(pattern.regex, rawText)) return true;
      if (pattern.name && hasTerm(regions.header.words, normalizeForMatch(pattern.name))) return true;
      return false;
    });

    if (patternHit || hasTerm(regions.header.words, label)) {
      matched.add(fieldName);
      weight += 1;
      reasons.push(`expected field matched: ${fieldName}`);
    } else if (hasTerm(regions.full.words, label)) {
      // Present, but only deep in the body — corroborating, not identifying.
      matched.add(fieldName);
      weight += BODY_MATCH_WEIGHT;
    }
  }

  return {
    score: weight / targetFields.length,
    matched: Array.from(matched),
    reasons,
  };
}

/**
 * A ONE-WORD PIECE OF A TYPE'S NAME IS A GENRE, NOT THE TYPE'S NAME.
 *
 * The verification matrix splits a long type name into its parts and keeps
 * each part as an alias, so "Invoices / internal accounting records — each
 * training event" also answers to the bare word "Invoices", "Payroll /
 * remuneration schedules for directors and senior managers" to "Payroll", and
 * "Timesheet / secondment records — … SED initiatives" to "Timesheet". A page
 * titled INVOICE says what KIND of paper it is, not which of these types it is:
 * every SED, ESD and procurement bundle carries invoices, and the part of the
 * name that makes the type (each training event; directors and senior
 * managers) is exactly what the bare word drops. Scored as an alias only one
 * type claims, the word was worth 0.5 — the weight of a document naming itself
 * — and an SED proof-of-payment bundle (two invoices and two bank payment
 * records) ranked 0.56 as a training-event invoice, which the adjudicator then
 * followed. (The word only met the text once plurals folded: "invoices" now
 * matches "INVOICE".)
 *
 * So the word names the type only when the rest of the name is there with it —
 * at least half of the name's words in the document's text. "Securities" over
 * "share register … shares in issue … share classes" IS the securities / share
 * register; INVOICE over a monthly contribution and a bank payment, with
 * nothing about training, is just an invoice. Without its qualifier the word is
 * still evidence — a word of the type's name, which name-token coverage scores
 * beside the name's other words — just not a second, decisive copy of it.
 *
 * Codes are names, not genres: EMP201, COR14.3, EEA1 (a digit) and MOI, AFS,
 * SETA, QSEs (written in capitals) keep their full alias weight, and so does
 * any alias of two or more words, which carries its own qualifier.
 */
function isGenreWordOfName(alias: string, typeName: string): boolean {
  const word = alias.trim();
  if (/\s/.test(word) || /\d/.test(word) || /^[A-Z]{2,}s?$/.test(word)) return false;
  return importantTokens(typeName).includes(normalizeForMatch(word));
}

/** A genre word names its type only when at least this share of the type's name words are in the text. */
const GENRE_QUALIFIER_COVERAGE = 0.5;

/**
 * The labels a type may be named by in this document's text: its name and its
 * aliases, less any genre word whose qualifier the text lacks.
 */
function selfNames(doc: DocumentTypeNode, nameWordsInText: number): string[] {
  const nameWords = importantTokens(doc.name).length;
  const qualified = nameWords > 0 && nameWordsInText / nameWords >= GENRE_QUALIFIER_COVERAGE;
  return [doc.name, ...doc.aliases.filter((alias) => qualified || !isGenreWordOfName(alias, doc.name))].filter(Boolean);
}

/**
 * How many document types claim each alias.
 *
 * An alias only one type claims is decisive: a page containing "COR14.3" or
 * "EMP201" IS that document. An alias many types share ("SETA", "AFS") barely
 * narrows anything. Weighting both the same made specific statutory documents
 * score like generic ones and land under the review threshold.
 */
function buildAliasFrequency(docs: DocumentTypeNode[]): Map<string, number> {
  const frequency = new Map<string, number>();
  for (const doc of docs) {
    const seen = new Set<string>();
    for (const alias of [doc.name, ...doc.aliases].filter(Boolean)) {
      const key = normalizeForMatch(alias);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      frequency.set(key, (frequency.get(key) ?? 0) + 1);
    }
  }
  return frequency;
}

/** B-BBEE vocabulary every evidence type shares — a weak "this is BEE paperwork" signal. */
const GENERIC_BEE_TOKENS = ['bbbee', 'bee', 'status', 'level', 'black', 'ownership', 'expiry', 'certificate'];

function scoreCandidate(
  regions: MatchRegions,
  text: string,
  doc: DocumentTypeNode,
  knowledge: DocumentKnowledge | null,
  aliasFrequency?: Map<string, number>,
): DocumentClassificationCandidate {
  const reasons: string[] = [];
  const matchedEvidence = new Set<string>();

  const nameTokens = tokenCoverage(regions, importantTokens(doc.name));
  const aliases = selfNames(doc, nameTokens.inText.length);

  // An alias in the header is the document naming itself. The same alias buried
  // in a 300-page pack is a mention, not an identity. An alias in the FILENAME
  // only is someone else naming it (see FILENAME_MATCH_WEIGHT).
  const exactAliasMatches = aliases.filter((alias) => hasSubjectTerm(regions.header.words, normalizeForMatch(alias)));
  const bodyAliasMatches = exactAliasMatches.length === 0
    ? aliases.filter((alias) => hasSubjectTerm(regions.full.words, normalizeForMatch(alias)))
    : [];
  const filenameAliasMatches = exactAliasMatches.length === 0 && bodyAliasMatches.length === 0
    ? aliases.filter((alias) => hasSubjectTerm(regions.filename.words, normalizeForMatch(alias)))
    : [];
  for (const alias of [...exactAliasMatches, ...bodyAliasMatches, ...filenameAliasMatches]) matchedEvidence.add(alias);
  if (exactAliasMatches.length > 0) reasons.push(`exact alias/name matched: ${exactAliasMatches[0]}`);
  if (filenameAliasMatches.length > 0) reasons.push(`filename names it: ${filenameAliasMatches[0]}`);

  for (const token of nameTokens.matched) matchedEvidence.add(token);
  if (nameTokens.matched.length > 0) reasons.push(`document-name tokens matched: ${nameTokens.matched.join(', ')}`);

  const descriptionTokens = tokenCoverage(regions, importantTokens(doc.description));
  for (const token of descriptionTokens.matched) matchedEvidence.add(token);

  const fields = fieldEvidence(regions, text, knowledge?.fields ?? []);
  for (const field of fields.matched) matchedEvidence.add(field);
  reasons.push(...fields.reasons.slice(0, 8));

  // Shared vocabulary says "B-BBEE paperwork", not which paperwork, and a
  // filename saying "BEE" says even less: text only.
  const genericBeeSignals = tokenCoverage(
    { ...regions, filename: region('') },
    GENERIC_BEE_TOKENS,
  );
  for (const token of genericBeeSignals.matched) matchedEvidence.add(token);

  // WEIGHTING — the alias is ONE signal, not a master key.
  //
  // It used to be worth 0.6 on its own, which outweighed every substantive
  // signal combined (0.2 + 0.08 + 0.28 + 0.06 = 0.62). That made confidence a
  // measure of "does this document contain our label string" rather than "does
  // it contain the evidence this document type is made of". Real documents
  // title themselves "B-BBEE STATUS LEVEL VERIFICATION CERTIFICATE", never the
  // literal alias "B-BBEE Certificate", so the 0.6 never fired and genuine
  // certificates capped out around 0.39 — under REVIEW_CONFIDENCE, classified
  // low_confidence, and returned to the user as a hard `failed` (HTTP 422).
  //
  // Field evidence (certificate number, status level, black ownership %,
  // expiry) is what actually identifies a document, so it now carries the most
  // weight and can reach confidence on its own. This does NOT loosen any
  // safety gate: the calculator payload still requires status 'passed', which
  // still requires confidence >= PASS_CONFIDENCE and clean validation. The
  // effect is that a real certificate becomes 'review_required' (read, flagged
  // for a human) instead of 'failed' (discarded).
  // An alias no other document type claims is decisive evidence; a shared one is
  // only a hint. Without this, "EMP201" (claimed by exactly one document) counted
  // the same as "AFS" (claimed by many), and specific statutory documents scored
  // like generic ones — landing just under REVIEW_CONFIDENCE and being reported
  // to the user as unreadable.
  const distinctive = (matches: string[]) => matches.some(
    (alias) => (aliasFrequency?.get(normalizeForMatch(alias)) ?? 1) === 1,
  );
  const exactAliasScore = exactAliasMatches.length > 0
    ? (distinctive(exactAliasMatches) ? 0.5 : 0.34)
    // Body-only alias mentions get the same discount as body-only tokens: a
    // pack that merely *refers* to a share register is not a share register.
    : bodyAliasMatches.length > 0 ? 0.34 * BODY_MATCH_WEIGHT
    : filenameAliasMatches.length > 0
      ? (distinctive(filenameAliasMatches) ? 0.5 : 0.34) * regions.filenameWeight
      : 0;
  const nameScore = nameTokens.score * 0.22;
  const descriptionScore = descriptionTokens.score * 0.06;
  const fieldScore = fields.score * 0.32;
  const genericScore = genericBeeSignals.score * 0.06;
  const confidence = Math.min(0.99, exactAliasScore + nameScore + descriptionScore + fieldScore + genericScore);

  return {
    document_type: doc.name,
    pillar: doc.pillar_code,
    confidence,
    matched_evidence: Array.from(matchedEvidence).slice(0, 24),
    reasons: reasons.slice(0, 12),
    evidence_basis: evidenceBasis(
      fields.score,
      [...nameTokens.inText, ...descriptionTokens.inText],
      [...exactAliasMatches, ...bodyAliasMatches],
      filenameAliasMatches.length > 0 || nameTokens.matched.length > nameTokens.inText.length,
    ),
  };
}

/**
 * What a candidate's score actually rests on.
 *
 * `content` — the text carries the type's fields, or words of its name or
 * description beyond the alias itself. `alias` — the text names the type (an
 * alias, possibly shared) and nothing more. `filename` — only the filename
 * points at it. `none` — only the shared B-BBEE vocabulary.
 *
 * A pick resting on `alias` or `filename` is a label match, and a label can be
 * wrong; ParserService sends such a pick to the adjudicator however high it
 * scored.
 */
function evidenceBasis(
  fieldScore: number,
  textTokens: string[],
  textAliases: string[],
  filenameEvidence: boolean,
): NonNullable<DocumentClassificationCandidate['evidence_basis']> {
  const aliasWords = new Set(importantTokens(...textAliases));
  if (fieldScore > 0 || textTokens.some((token) => !aliasWords.has(token))) return 'content';
  if (textAliases.length > 0) return 'alias';
  if (filenameEvidence) return 'filename';
  return 'none';
}

/**
 * How many candidates may clear the review threshold before we conclude the
 * upload is a compendium rather than one document.
 */
const COMPENDIUM_CANDIDATES = 4;

function classifyStatus(
  best: DocumentClassificationCandidate | undefined,
  second: DocumentClassificationCandidate | undefined,
  allCandidates: DocumentClassificationCandidate[] = [],
): Pick<DocumentClassification, 'status' | 'reason' | 'margin'> {
  if (!best || best.confidence <= 0) {
    return { status: 'unsupported', reason: 'No ontology document type matched the uploaded evidence', margin: 0 };
  }

  const margin = best.confidence - (second?.confidence ?? 0);

  // A workbook or strategy pack contains the evidence for MANY document types
  // at once, so many candidates clear the bar together. Naming one of them is
  // guessing; the honest answer is that this upload is not a single document.
  // (Measured: the 24MB Thandanani toolkit scored 0.99 as a "B-BBEE
  // Certificate" with four other types also above threshold.)
  const plausible = allCandidates.filter((candidate) => candidate.confidence >= REVIEW_CONFIDENCE);
  if (plausible.length >= COMPENDIUM_CANDIDATES) {
    return {
      status: 'compendium',
      reason: `This upload matches ${plausible.length} document types (${plausible.slice(0, 3).map((c) => c.document_type).join(', ')}…). `
        + 'It looks like a workbook or pack containing several documents rather than one document.',
      margin,
    };
  }

  if (best.confidence < REVIEW_CONFIDENCE) {
    return { status: 'low_confidence', reason: 'Best document-type confidence is below review threshold', margin };
  }

  // The specific diagnosis comes first. "Too close to call between X and Y" is
  // actionable — it tells a reviewer exactly what to disambiguate — whereas
  // "below pass threshold" only restates the number. Checking the generic case
  // first shadowed the specific one for every document under PASS_CONFIDENCE,
  // which is precisely the band where candidates are most likely to be close.
  // Closeness is what MARGIN measures, so the runner-up needs no separate
  // absolute floor. It used to also require second >= REVIEW_CONFIDENCE, a
  // threshold calibrated against the old alias-dominated scores; once evidence
  // carries the weight, scores sit lower and that floor silently disabled the
  // check. It is also near-redundant: best is already >= REVIEW_CONFIDENCE
  // here, so a runner-up within AMBIGUITY_MARGIN is a credible alternative by
  // construction.
  if (second && margin < AMBIGUITY_MARGIN) {
    return {
      status: 'ambiguous',
      reason: `Top document-type candidates are too close (${best.document_type} vs ${second.document_type})`,
      margin,
    };
  }

  if (best.confidence < PASS_CONFIDENCE) {
    return { status: 'ambiguous', reason: 'Best document-type confidence requires human review', margin };
  }

  return { status: 'classified', reason: 'Document type classified with sufficient confidence and margin', margin };
}

export async function classifyDocument(
  input: RawExtractionInput,
  repository: OntologyRepository,
): Promise<DocumentClassification> {
  const fallbackKnowledge = defaultDocumentKnowledge();
  const fallbackByName = new Map(fallbackKnowledge.map((knowledge) => [knowledge.document.name.toLowerCase(), knowledge]));
  const documentTypesByName = new Map<string, DocumentTypeNode>();
  for (const doc of await repository.listDocumentTypes()) {
    documentTypesByName.set(doc.name.toLowerCase(), doc);
  }
  for (const knowledge of fallbackKnowledge) {
    documentTypesByName.set(knowledge.document.name.toLowerCase(), knowledge.document);
  }
  const documentTypes = Array.from(documentTypesByName.values());
  const text = input.raw_text ?? '';
  // Normalised once per document, not once per candidate type.
  // What a reader would have to read: the adjudicator's own measure (markdown
  // first), so "too little to read" means the same thing on both sides.
  const readableChars = String(input.markdown?.trim() || text).trim().length;
  const regions = matchRegions(input.filename ?? '', text, readableChars);

  const aliasFrequency = buildAliasFrequency(documentTypes);
  const candidates: DocumentClassificationCandidate[] = [];
  for (const doc of documentTypes) {
    const knowledge = await repository.getDocumentKnowledge(doc.name) ?? fallbackByName.get(doc.name.toLowerCase()) ?? null;
    candidates.push(scoreCandidate(regions, text, doc, knowledge, aliasFrequency));
  }

  // SHEET-NAME AUTHORITY: a named workbook sheet states its own element. Lift the
  // specs of that element's pillar so the sheet classifies as what it plainly is
  // — not as whatever affidavit its generic B-BBEE content happens to match.
  // Additive (not a flat floor) so the best-scoring spec of the right pillar
  // still wins; content stays the tiebreak, the sheet name only fixes the pillar.
  const hintElement = elementFromHint(sheetNameOf(input));
  const hintPillar = hintElement ? ELEMENT_TO_PILLAR[hintElement] : null;
  if (hintPillar) {
    for (const candidate of candidates) {
      if (candidate.pillar === hintPillar) {
        candidate.confidence = Math.min(0.99, candidate.confidence + 0.5);
        candidate.reasons = [`sheet name states this is ${hintElement} evidence`, ...candidate.reasons].slice(0, 12);
        candidate.evidence_basis = 'sheet';
      }
    }
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  const best = candidates[0];
  const second = candidates[1];
  const status = classifyStatus(best, second, candidates);

  return {
    document_type: best?.document_type ?? 'Unsupported',
    pillar: best?.pillar ?? 'Unknown',
    confidence: best?.confidence ?? 0,
    matched_evidence: best?.matched_evidence ?? [],
    candidates: candidates.slice(0, 5),
    ranked: candidates,
    ...status,
  };
}
