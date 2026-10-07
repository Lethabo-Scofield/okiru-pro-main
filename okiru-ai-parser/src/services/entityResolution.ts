/**
 * Resolve extracted values across a whole case.
 *
 * A client's evidence for one fact is scattered: the entity name appears on the
 * certificate, the CIPC registration and the AFS; NPAT is in the AFS and again
 * in the SED workpaper; an employee count is in the payroll and the EEA2. So
 * extraction produces many values per field, from many files, and something has
 * to decide what the case actually says.
 *
 * The decisions here are deliberately conservative, because these values become
 * a B-BBEE score:
 *
 *  - AGREEMENT IS EVIDENCE. Two files saying the same thing raises confidence.
 *  - DISAGREEMENT IS NEVER RESOLVED SILENTLY. Where files disagree we keep the
 *    most-supported value, mark the field conflicted, and carry every rival
 *    value with its source. An auditor's job is to explain differences, not to
 *    have a tie broken invisibly.
 *  - EVERYTHING KEEPS ITS SOURCE. Any number that reaches a scorecard must be
 *    traceable to the file it came from.
 */
import type { DocumentExtraction, ExtractedValue } from './aiExtraction.js';

export interface ResolvedField {
  field: string;
  /** The value the case is taken to assert. */
  value: unknown;
  /** Files that reported this value. */
  sources: string[];
  /** How many extractions agreed on it. */
  agreementCount: number;
  /** True when files reported materially different values. */
  conflicted: boolean;
  /** Rival values, present only when conflicted. */
  alternatives: Array<{ value: unknown; sources: string[] }>;
}

export interface CaseEntities {
  fields: Record<string, ResolvedField>;
  /** Fields where sources disagree — the auditor's review queue. */
  conflicts: ResolvedField[];
  /** Schema fields no document supplied — what to still ask the client for. */
  missingFields: Array<{ field: string; expectedFrom: string[] }>;
  /** Exceptions raised by the expert's own checks, with their document. */
  exceptions: Array<{ document: string; sourceFile: string; message: string }>;
  documentsExtracted: number;
  filesWithNoExtraction: string[];
}

/**
 * Compare values for agreement.
 *
 * Loose enough that "R 1 250 000" and "1250000" agree, strict enough that two
 * genuinely different numbers never do. Anything non-scalar is compared by its
 * JSON shape.
 */
export function valuesAgree(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return false;

  if (typeof a === 'object' || typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  const numericA = toNumber(a);
  const numericB = toNumber(b);
  if (numericA !== null && numericB !== null) return numericA === numericB;

  return normaliseText(a) === normaliseText(b);
}

function normaliseText(value: unknown): string {
  return String(value).toLowerCase().replace(/[\s.,;:'"()-]+/g, ' ').trim();
}

/** Parse "R 1 250 000", "51%", "1,250.50" → number. Returns null for prose. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;

  const cleaned = value.replace(/[R$€£\s,%]/g, '').replace(/,/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Group a field's values into buckets of mutually-agreeing values. */
function bucketValues(values: ExtractedValue[]): Array<{ value: unknown; sources: string[] }> {
  const buckets: Array<{ value: unknown; sources: string[] }> = [];

  for (const entry of values) {
    const bucket = buckets.find((candidate) => valuesAgree(candidate.value, entry.value));
    if (bucket) {
      if (!bucket.sources.includes(entry.sourceFile)) bucket.sources.push(entry.sourceFile);
      continue;
    }
    buckets.push({ value: entry.value, sources: [entry.sourceFile] });
  }

  // Most-corroborated first; that is the value the case asserts.
  return buckets.sort((a, b) => b.sources.length - a.sources.length);
}

/** The row property naming the file a register row came from (see mergeRegister). */
export const ROW_SOURCE_KEY = '__source';

/**
 * Marks a register row read from a HIDDEN sheet: scratch copies and old lists
 * whose rows may describe what is already known, but not what exists.
 */
export const ROW_HIDDEN_KEY = '__hidden';

/**
 * Marks a register row that states ONE MONTH's figures for its record — a
 * vehicle's kilometres and litres from a depot's monthly fuel report. The value
 * is that month, "YYYY-MM": a month's figures travel together, and are never
 * paired with another document's month.
 */
export const ROW_PERIOD_KEY = '__period';

/**
 * A REGISTER adds up; it does not compete.
 *
 * Two sheets listing different vehicles are two halves of one fleet, not two
 * answers to one question — yet compared as JSON blobs they could only ever
 * "disagree", so the whole register was held back as a conflict and nothing in
 * it placed. Rows are concatenated, each carrying the file it came from, so a
 * later step can total within a document and raise a conflict only BETWEEN
 * documents. A row two files state identically is one fact stated twice, so it
 * is kept once; repeated rows within one file are kept, because only that file
 * knows whether they are two meters or one mistake.
 */
function mergeRegister(field: string, values: ExtractedValue[]): ResolvedField {
  const rows: Array<Record<string, unknown>> = [];
  const statedBy = new Map<string, Set<string>>();
  const sources: string[] = [];
  for (const entry of values) {
    if (!sources.includes(entry.sourceFile)) sources.push(entry.sourceFile);
    if (!Array.isArray(entry.value)) continue;
    for (const raw of entry.value) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const { [ROW_SOURCE_KEY]: _stated, ...cells } = raw as Record<string, unknown>;
      const key = JSON.stringify(cells);
      const files = statedBy.get(key) ?? new Set<string>();
      if (files.size > 0 && !files.has(entry.sourceFile)) continue;
      files.add(entry.sourceFile);
      statedBy.set(key, files);
      rows.push({ ...cells, [ROW_SOURCE_KEY]: entry.sourceFile });
    }
  }
  return { field, value: rows, sources, agreementCount: sources.length, conflicted: false, alternatives: [] };
}

export function resolveCaseEntities(
  extractions: DocumentExtraction[],
  options: {
    allFiles?: string[];
    /** Register fields whose rows add up across documents instead of competing. */
    additiveFields?: ReadonlySet<string>;
  } = {},
): CaseEntities {
  const byField = new Map<string, ExtractedValue[]>();
  for (const extraction of extractions) {
    for (const value of extraction.values) {
      const list = byField.get(value.field) ?? [];
      list.push(value);
      byField.set(value.field, list);
    }
  }

  const fields: Record<string, ResolvedField> = {};
  const conflicts: ResolvedField[] = [];

  for (const [field, values] of Array.from(byField.entries())) {
    if (options.additiveFields?.has(field)) {
      fields[field] = mergeRegister(field, values);
      continue;
    }
    const buckets = bucketValues(values);
    const [winner, ...rivals] = buckets;

    const resolved: ResolvedField = {
      field,
      value: winner.value,
      sources: winner.sources,
      agreementCount: winner.sources.length,
      conflicted: rivals.length > 0,
      alternatives: rivals,
    };
    fields[field] = resolved;
    if (resolved.conflicted) conflicts.push(resolved);
  }

  // A field is only missing if NO document supplied it. A field absent from one
  // document but present in another is found, not missing — which is the whole
  // point of resolving across the case rather than per file.
  const missing = new Map<string, Set<string>>();
  for (const extraction of extractions) {
    for (const field of extraction.missingFields) {
      if (fields[field]) continue;
      const from = missing.get(field) ?? new Set<string>();
      from.add(extraction.documentName);
      missing.set(field, from);
    }
  }

  const exceptions = extractions.flatMap((extraction) =>
    extraction.exceptions.map((message) => ({
      document: extraction.documentName,
      sourceFile: extraction.sourceFile,
      message,
    })),
  );

  const filesWithValues = new Set(
    extractions.filter((extraction) => extraction.values.length > 0).map((extraction) => extraction.sourceFile),
  );

  return {
    fields,
    conflicts,
    missingFields: Array.from(missing.entries())
      .map(([field, from]) => ({ field, expectedFrom: Array.from(from) }))
      .sort((a, b) => a.field.localeCompare(b.field)),
    exceptions,
    documentsExtracted: extractions.filter((extraction) => extraction.values.length > 0).length,
    filesWithNoExtraction: (options.allFiles ?? []).filter((file) => !filesWithValues.has(file)),
  };
}
