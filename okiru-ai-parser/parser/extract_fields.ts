import type { ExtractionFieldNode, FieldKnowledge, PatternNode } from '../graph/ontology_models.js';
import type { ExtractedFieldOutput, RawExtractionInput } from '../schemas/parser_output.js';
import { normalizeValue } from './normalize.js';
import {
  CIPC_REGISTRATION_PATTERN,
  checksumForField,
  isCompanyRegistrationField,
  isSaIdField,
  isVatNumberField,
  normalizeCipcRegistration,
} from './checksums.js';
import {
  cleanCapture,
  isUnusableCapture,
  labelRegexSource,
  labelsForField,
} from './field_labels.js';
import { findTableValue, tableGridsOf } from './table_fields.js';

// Confidence a value earns when its own checksum/format validates, and the ceiling
// an invalid checksum forces it under (below validate.ts's 0.85 pass threshold, so
// the field is flagged for review rather than silently trusted).
const CHECKSUM_VALID_CONFIDENCE = 0.95;
const CHECKSUM_INVALID_CEILING = 0.4;

/** A value read from a table cell under / beside its label. */
const TABLE_CELL_CONFIDENCE = 0.9;

export interface ExtractedFieldWithMeta extends ExtractedFieldOutput {
  matched_patterns: string[];
}

function snippetAround(text: string, start: number, end: number): string {
  return text.slice(Math.max(0, start - 60), Math.min(text.length, end + 80)).replace(/\s+/g, ' ').trim();
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * The type gate: could this text be a value of this field at all? Identifiers
 * must have their identifier's shape (a checksum failure is still let through,
 * to be flagged, but an ID number is never a company registration); typed
 * fields must normalise to their type. Free text passes.
 */
function fitsField(field: ExtractionFieldNode, value: string): boolean {
  if (isCompanyRegistrationField(field.name)) return /\d{4}\s*\/\s*[0-9A-Za-z]{6}\s*\/\s*[0-9A-Za-z]{2}/.test(value);
  if (isSaIdField(field.name)) return digitsOnly(value).length === 13;
  if (isVatNumberField(field.name)) return digitsOnly(value).length === 10;
  if (field.data_type === 'string') return true;
  return normalizeValue(value, field.data_type) != null;
}

interface Capture {
  value: string;
  start: number;
  end: number;
  /** The document separated label and value itself (a colon), or the pattern is a shaped one. */
  explicit: boolean;
}

/** The value group of a match: the last group that captured something. */
function capturedGroup(match: RegExpMatchArray): string | undefined {
  for (let i = match.length - 1; i >= 1; i -= 1) {
    if (match[i] != null && match[i].trim() !== '') return match[i];
  }
  return undefined;
}

/** Is `index` at the start of a line or of a table cell (only spaces between)? */
function startsLineOrCell(text: string, index: number): boolean {
  for (let i = index - 1; i >= 0; i -= 1) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r' || ch === '|') return true;
    if (ch !== ' ' && ch !== '\t') return false;
  }
  return true;
}

/**
 * Every guarded capture of `regex` in `text`, in order. `formLabel` adds the
 * rules for a bare label (no colon): it must begin its line or cell, and its
 * value must sit on the same line — "Registered Address Change on 14/11/2017"
 * in a change log is prose, and "Director" over the next person's name is a
 * caption, not a label. Either way a value that crossed a line break into a
 * table row ("Label:\nA | B | C") belongs to the table pass, not this one.
 */
function guardedCaptures(regex: RegExp, text: string, formLabel: boolean, clean: (raw: string) => string): Capture[] {
  const global = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
  const out: Capture[] = [];
  for (const match of text.matchAll(global)) {
    const group = capturedGroup(match);
    if (group == null) continue;
    const start = match.index ?? 0;
    const groupAt = match[0].lastIndexOf(group);
    const between = match[0].slice(0, Math.max(0, groupAt));
    const crossedLine = /[\r\n]/.test(between);
    if (crossedLine && group.includes('|')) continue;
    // The separator sits right before the value: "Label:" / "Label -".
    const colon = /[:\-]\s*$/.test(between);
    if (formLabel) {
      // A label is whole words: "holder name" is not inside "SHAREHOLDER NAME",
      // and "ratio" is not the start of "rationale".
      if (start > 0 && /[A-Za-z0-9]/.test(text[start - 1])) continue;
      if (/[A-Za-z0-9]$/.test(between) && /^[A-Za-z0-9]/.test(group)) continue;
      if (!colon && (crossedLine || !startsLineOrCell(text, start))) continue;
    }
    const value = clean(group);
    if (isUnusableCapture(value)) continue;
    out.push({ value, start, end: start + match[0].length, explicit: colon || !formLabel });
  }
  return out;
}

/**
 * A field's own label, written in a form: "Label: value", or "Label value" at
 * the start of a line. Tried for the field's name and the printed variants of
 * it (field_labels.ts). A short unit note may sit between label and colon, as
 * spreadsheet headers write it ("Black Ownership (%): 51%").
 */
function formLabelRegex(label: string): RegExp {
  return new RegExp(
    `${labelRegexSource(label)}(?:[ \\t]*\\([^)\\n]{0,20}\\))?(?:[ \\t]*[:\\-][ \\t]*(?:\\r?\\n[ \\t]*){0,2}|[ \\t]+)([^\\n\\r]+)`,
    'i',
  );
}

const MONEY_VALUE = 'R\\s?-?\\d[\\d,\\s]*(?:\\.\\d+)?(?:\\s?(?:m|million|k|thousand)\\b)?|-?\\d{1,3}(?:[\\s,]\\d{3})+(?:\\.\\d+)?|-?\\d+\\.\\d{2}|\\d+(?:\\.\\d+)?%';
const DATE_VALUE = '\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[\\/\\-]\\d{1,2}[\\/\\-]\\d{4}';

/** Name-shaped field roles, each read only from its own label ("Supplier: …"). */
const NAME_ROLES = ['supplier', 'beneficiary', 'shareholder', 'holder', 'employee', 'director', 'lender', 'borrower', 'deponent', 'author', 'member', 'recipient'];
const ORGANISATION_WORDS = new Set(['entity', 'company', 'enterprise', 'supplier']);
/** A name never starts with these: "we have", "the company has", "to be confirmed". */
const NAME_STOP_WORDS = new Set([
  'we', 'i', 'you', 'they', 'he', 'she', 'it', 'our', 'us', 'your', 'their', 'this', 'that', 'these', 'those',
  'is', 'are', 'was', 'were', 'has', 'have', 'had', 'will', 'shall', 'hereby', 'which', 'who', 'whom',
  'to', 'of', 'for', 'in', 'on', 'at', 'by', 'as', 'if', 'and', 'or', 'not', 'no', 'yes', 'none', 'n/a', 'na', 'tbc',
]);
/** The last word of a field that is NOT a name although it mentions an entity ("entity_type"). */
const NOT_A_NAME_SUFFIX = new Set(['type', 'status', 'number', 'no', 'id', 'date', 'count', 'level', 'percentage', 'address', 'code']);

function isNameValue(value: string): boolean {
  const first = value.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  if (!first || NAME_STOP_WORDS.has(first)) return false;
  return /^[A-Z0-9(]/.test(value.trim());
}

interface HeuristicCandidate {
  pattern: string;
  regex: RegExp;
  confidence: number;
  /** A bare label (no colon) must start its line; see guardedCaptures. */
  formLabel?: boolean;
  accept?: (value: string) => boolean;
}

function tokensOf(fieldName: string): string[] {
  return fieldName.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function hasToken(tokens: string[], words: string[]): boolean {
  return tokens.some((t) => words.includes(t));
}

/**
 * Shape-based guesses for a field the document never labels. Each guess is
 * gated by the field's TYPE: an amount is only read beside the field's own
 * label (the first Rand figure on the page is no particular amount), a date
 * pattern is never offered to a money or identifier field, and every value
 * must normalise to the field's type before it is accepted.
 */
function heuristicCandidates(field: ExtractionFieldNode): HeuristicCandidate[] {
  const name = field.name;
  const tokens = tokensOf(name);
  const candidates: HeuristicCandidate[] = [];

  // The same classifiers as the checksum. Matching the fragment "vat" here
  // offered the VAT-number pattern to claimed_spend_ex_vat, so a supplier's
  // VAT number could be read back as its spend.
  const saId = isSaIdField(name);
  const companyRegistration = isCompanyRegistrationField(name);
  const vatNumber = isVatNumberField(name);
  if (saId) candidates.push({ pattern: 'sa_id_number', regex: /\b(\d{13})\b/, confidence: 0.88 });
  if (companyRegistration) candidates.push({ pattern: 'registration_number', regex: new RegExp(`(${CIPC_REGISTRATION_PATTERN.source})`), confidence: 0.88 });
  if (vatNumber) candidates.push({ pattern: 'vat_number', regex: /\b(4\d{9})\b/, confidence: 0.86 });

  const lastToken = tokens[tokens.length - 1] ?? '';
  const identifier = saId || companyRegistration || vatNumber || ['number', 'no', 'nr', 'id', 'code'].includes(lastToken);
  const money = field.data_type === 'money';

  if (!money && !identifier) {
    if (hasToken(tokens, ['expiry'])) {
      candidates.push({
        pattern: 'expiry_date_label',
        regex: new RegExp(`\\b(?:Expiry|Expiration|Valid\\s+Until|Valid\\s+To)(?:\\s*Date)?\\s*[:\\-]?\\s*(${DATE_VALUE})\\b`, 'i'),
        confidence: 0.86,
      });
    } else if (hasToken(tokens, ['signed'])) {
      candidates.push({
        pattern: 'signed_date_label',
        regex: new RegExp(`\\b(?:Signed|Signature)\\s*Date\\s*[:\\-]?\\s*(${DATE_VALUE})\\b`, 'i'),
        confidence: 0.86,
      });
    } else if (hasToken(tokens, ['issue', 'issued'])) {
      candidates.push({
        pattern: 'issue_date_label',
        regex: new RegExp(`\\b(?:Issue|Issued)\\s*Date\\s*[:\\-]?\\s*(${DATE_VALUE})\\b`, 'i'),
        confidence: 0.86,
      });
    } else if (hasToken(tokens, ['date', 'appointment', 'start', 'end', 'effective', 'incorporation', 'registration'])) {
      candidates.push({ pattern: 'date_value', regex: new RegExp(`\\b(${DATE_VALUE})\\b`), confidence: 0.86 });
    }
  }

  if (money || hasToken(tokens, ['amount', 'value', 'spend', 'cost', 'npat', 'revenue', 'debt', 'balance', 'budget', 'principal', 'total', 'target', 'rate'])) {
    // Label-anchored only: the field's own label, then an amount on the same line.
    for (const label of labelsForField(name)) {
      candidates.push({
        pattern: 'money_or_number',
        regex: new RegExp(`${labelRegexSource(label)}[^\\n\\r\\d]{0,30}?(${MONEY_VALUE})`, 'i'),
        confidence: 0.84,
      });
    }
  }
  if (hasToken(tokens, ['percentage', 'percent', 'ownership', 'margin'])) {
    // Unchanged on purpose, trailing \b and all (a "%" followed by a word): any
    // wider and black_women_ownership takes the page's first "100.00%".
    candidates.push({ pattern: 'percentage_value', regex: /\b(\d+(?:\.\d+)?%)\b/, confidence: 0.86 });
  }
  if (hasToken(tokens, ['status', 'outcome'])) {
    candidates.push({ pattern: 'status_value', regex: /\b(current|expired|active|resigned|valid|invalid|passed|failed|met|not met|none)\b/i, confidence: 0.78 });
  }
  // "signed" is not here: signed_date is a date, and "ID no" is not a refusal to sign.
  if (hasToken(tokens, ['bool', 'present', 'confirmed', 'matches', 'within', 'covered', 'legible', 'accredited', 'valid', 'met', 'applied', 'included', 'excludes', 'vested'])) {
    candidates.push({ pattern: 'boolean_signal', regex: /\b(yes|no|true|false|present|absent|confirmed|not confirmed|matches|does not match|valid|invalid)\b/i, confidence: 0.75 });
  }

  const roles = NAME_ROLES.filter((role) => tokens.includes(role));
  const organisation = tokens.some((t) => ORGANISATION_WORDS.has(t));
  const nameShaped = (tokens.includes('name') || tokens.includes('names') || roles.length > 0 || organisation)
    && !NOT_A_NAME_SUFFIX.has(lastToken);
  if (nameShaped) {
    const labels = [
      ...(organisation ? ['Enterprise\\s+Name', 'Entity\\s+Name', 'Company\\s+Name', 'Registered\\s+Name', 'Measured\\s+Entity'] : []),
      ...roles.map((role) => `${role}(?:\\s+Name)?`),
    ];
    if (labels.length > 0) {
      candidates.push({
        pattern: 'name_label',
        regex: new RegExp(`(?<![A-Za-z0-9])(?:${labels.join('|')})(?![A-Za-z0-9])(?:[ \\t]*[:\\-][ \\t]*(?:\\r?\\n[ \\t]*){0,2}|[ \\t]+)([^\\n\\r,;|\\t]+)`, 'i'),
        confidence: 0.82,
        formLabel: true,
        accept: isNameValue,
      });
    }
  }
  return candidates;
}

function cleanExtractedRawValue(fieldName: string, rawValue: string): string {
  if (!/name|entity|supplier|beneficiary|shareholder|employee|director|deponent/.test(fieldName)) {
    return rawValue;
  }

  return rawValue
    .split(/\s{2,}|\t|Certificate\s+Number|B[-\s]?BBEE\s+Status|Black\s+Ownership|Black\s+Female|Issue\s+Date|Expiry\s+Date|Empowering\s+Supplier|VAT\s+Number/i)[0]
    .replace(/[.,;:]+$/g, '')
    .trim();
}

export interface ExtractFieldsOptions {
  /**
   * Only accept values the document LABELS (a field's own pattern, a
   * "Field name: value" line, or a table cell under / beside the label). Skips
   * the name/date/money-shaped heuristics, which will find a "beneficiary" in
   * a lunch menu. Used when the document's type is itself uncertain: an
   * unlabelled guess about an unidentified document is two guesses stacked,
   * and reads as fact once it is a field.
   */
  labelledOnly?: boolean;
}

interface FieldRead {
  rawValue: string;
  confidence: number;
  textSnippet: string | null;
  page: number | null;
  table: string | null;
  pattern: string;
}

/**
 * The first guarded capture across `regexes`, preferring one that fits the
 * field's type. A value the document itself separates from its label
 * ("Expiry Date: TBC") is still kept when it does not fit and nothing better
 * is labelled — it is the document's own statement, and its failure to
 * normalise flags it for review. A bare "Label value" line that does not fit
 * is not a statement about the field at all ("BENEFICIAL INTEREST REGISTER"
 * is a title, not a percentage of "REGISTER").
 */
function firstLabelledRead(
  field: ExtractionFieldNode,
  text: string,
  regexes: Array<{ regex: RegExp; name: string; formLabel: boolean }>,
  confidence: number,
): FieldRead | null {
  let fallback: FieldRead | null = null;
  for (const { regex, name, formLabel } of regexes) {
    for (const capture of guardedCaptures(regex, text, formLabel, (raw) => cleanExtractedRawValue(field.name, cleanCapture(raw)))) {
      if (isUnusableCapture(capture.value)) continue;
      const read: FieldRead = {
        rawValue: capture.value,
        confidence,
        textSnippet: snippetAround(text, capture.start, capture.end),
        page: 1,
        table: null,
        pattern: name,
      };
      if (fitsField(field, capture.value)) return read;
      if (capture.explicit) fallback ??= read;
    }
  }
  return fallback;
}

function readField(fieldKnowledge: FieldKnowledge, input: RawExtractionInput, options: ExtractFieldsOptions): FieldRead | null {
  const { field, patterns } = fieldKnowledge;
  const text = input.raw_text || '';

  // 1. Table cells: the value under its column header or beside its row label.
  const hit = findTableValue(labelsForField(field.name), tableGridsOf(input.tables), (value) => {
    const cleaned = cleanExtractedRawValue(field.name, value);
    return !isUnusableCapture(cleaned) && fitsField(field, cleaned);
  });
  if (hit) {
    return {
      rawValue: cleanExtractedRawValue(field.name, hit.value),
      confidence: TABLE_CELL_CONFIDENCE,
      textSnippet: `${hit.labelText} → ${hit.value}`.slice(0, 200),
      page: hit.page,
      table: hit.table,
      // A labelled read: the document names the field itself.
      pattern: field.name,
    };
  }

  // 2. The type's own patterns (canonical types carry shaped regexes).
  const shaped = patterns
    .filter((p): p is PatternNode & { regex: string } => Boolean(p.regex) && p.pattern_type !== 'label')
    .map((p) => ({ regex: new RegExp(p.regex, 'i'), name: p.name, formLabel: false }));
  const fromPatterns = firstLabelledRead(field, text, shaped, 0.9);
  if (fromPatterns) return fromPatterns;

  // 3. The field's label in a form: its label pattern, then its name and the
  // printed variants of it.
  const labelled = [
    ...patterns
      .filter((p): p is PatternNode & { regex: string } => Boolean(p.regex) && p.pattern_type === 'label')
      .map((p) => ({ regex: new RegExp(p.regex, 'i'), name: field.name, formLabel: true })),
    ...labelsForField(field.name).map((label) => ({ regex: formLabelRegex(label), name: field.name, formLabel: true })),
  ];
  const fromLabel = firstLabelledRead(field, text, labelled, 0.72);
  if (fromLabel) return fromLabel;

  // A type whose spec asks for one record per item (a register, a ledger)
  // is read from labels only: a shape guess there picks an arbitrary row.
  if (options.labelledOnly || field.labelled_only) return null;

  // 4. Shape-based guesses, each gated by the field's type.
  for (const candidate of heuristicCandidates(field)) {
    for (const capture of guardedCaptures(candidate.regex, text, candidate.formLabel ?? false, (raw) => cleanExtractedRawValue(field.name, cleanCapture(raw)))) {
      if (candidate.accept && !candidate.accept(capture.value)) continue;
      if (!fitsField(field, capture.value)) continue;
      return {
        rawValue: capture.value,
        confidence: candidate.confidence,
        textSnippet: snippetAround(text, capture.start, capture.end),
        page: 1,
        table: null,
        pattern: candidate.pattern,
      };
    }
  }
  return null;
}

/** The field's value in its one written form, or null when it does not parse. */
function normalizedFor(field: ExtractionFieldNode, rawValue: unknown): unknown | null {
  if (rawValue != null && isCompanyRegistrationField(field.name)) {
    const registration = normalizeCipcRegistration(rawValue);
    if (registration) return registration;
  }
  return normalizeValue(rawValue, field.data_type);
}

export function extractFields(
  input: RawExtractionInput,
  fields: FieldKnowledge[],
  options: ExtractFieldsOptions = {},
): Record<string, ExtractedFieldWithMeta> {
  const output: Record<string, ExtractedFieldWithMeta> = {};

  for (const fieldKnowledge of fields) {
    const { field } = fieldKnowledge;
    const read = readField(fieldKnowledge, input, options);
    const rawValue: string | null = read?.rawValue ?? null;
    let confidence = read?.confidence ?? 0;
    const matchedPatterns: string[] = read ? [read.pattern] : [];
    if (read?.table) matchedPatterns.push(`table_cell:${read.table}`);

    const normalizedValue = normalizedFor(field, rawValue);
    if (rawValue != null && normalizedValue == null) confidence = Math.min(confidence, 0.45);

    // Checksum gate: if this field is a SA identifier, let its check digit / format
    // confirm or discredit the OCR'd value. Valid → raise confidence; invalid →
    // cap it under the pass threshold so validate.ts routes it to human review.
    if (rawValue != null) {
      const checksum = checksumForField(field.name, rawValue);
      if (checksum) {
        if (checksum.valid) {
          confidence = Math.max(confidence, CHECKSUM_VALID_CONFIDENCE);
          matchedPatterns.push('checksum_valid');
        } else {
          confidence = Math.min(confidence, CHECKSUM_INVALID_CEILING);
          matchedPatterns.push(`checksum_failed:${checksum.reason ?? 'invalid'}`);
        }
      }
    }

    output[field.name] = {
      raw_value: rawValue,
      normalized_value: normalizedValue,
      data_type: field.data_type,
      confidence,
      source: {
        page: rawValue == null ? null : read?.page ?? null,
        table: read?.table ?? null,
        text_snippet: read?.textSnippet ?? null,
      },
      matched_patterns: matchedPatterns,
    };
  }

  return output;
}
