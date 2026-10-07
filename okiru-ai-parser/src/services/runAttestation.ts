/**
 * Signed parser runs — what the document library will accept as "what the
 * parser read".
 *
 * The library (apps/api `POST /api/parser-documents/:id/runs`) is written to by
 * the BROWSER, after a paid read, because only the browser holds both the
 * library's document ids and the parser's result. It used to accept any JSON as
 * a parser result, so anyone signed in could file a "parser reading" they had
 * typed themselves (fields, confidence, a `passed` status) against a document,
 * and the library and review screens presented it as the parser's.
 *
 * So the record a run is built from is now made HERE, where the read happened,
 * and signed: an HMAC over the exact JSON text, with a key derived from
 * PARSER_INTERNAL_SECRET (the secret web, parser and api already share). The
 * browser carries the text unopened and the api verifies it before storing.
 * Each record is bound to the SHA-256 of the uploaded bytes, so a genuine
 * reading of one file cannot be filed against another.
 *
 * A record carries BOTH layers of the read. `parserOutput` is the rule layer
 * (the lexical classifier and the regex fields), stored as before. `aiValues`
 * is everything the model and the agent read from the same file — the spec
 * extraction, the table readers, the agent's cited second read — which is most
 * of what a read finds. Before it rode in the signed record, the library
 * showed only the rule layer, a few percent of what the parser had read.
 *
 * The api holds a copy of the verifying half (apps/api/src/security/
 * parserRunAttestation.ts). Both test suites pin the same known-answer vector,
 * so the two cannot drift apart without a test failing.
 */
import { createHash, createHmac } from 'node:crypto';
import { createLogger } from '../logger.js';
import type { ParserCaseOutput } from '../../schemas/parser_output.js';
import type { DocumentExtraction } from './aiExtraction.js';
import type { UploadedFileLike } from './fileExtraction.js';
import { SHEET_INSTRUCTIONS_DOCUMENT_ID } from './sheetInstructionsExtraction.js';

const logger = createLogger('RunAttestation');

/**
 * Mixed into the signing key, so a signature made with the shared secret for
 * any other purpose can never verify as a parser run, and the raw secret is
 * never used as an HMAC key directly.
 */
const ATTESTATION_CONTEXT = 'okiru/parser-run-attestation/v1';

export const RUN_ATTESTATION_TYPE = 'okiru.parser-run';
export const RUN_ATTESTATION_VERSION = 1;

/**
 * How long a signed run can be filed. The browser files it seconds after the
 * read; a day is generous for a slow connection and short for a replay.
 */
export const RUN_ATTESTATION_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * How much of a read a run carries. A run is one MongoDB document (16MB), and
 * the library is where a person checks values, not where a 30 000-row register
 * is stored — the case result keeps every row. Past these, a value says how
 * much was left out rather than silently ending.
 */
export const AI_VALUE_LIMITS = {
  /** Values per run. */
  maxValues: 1500,
  /** Rows kept of a register (array) value; `rowCount` says how many there were. */
  maxRows: 200,
  /** Characters kept of a text value or a citation quote. */
  maxText: 4000,
  /**
   * Serialised size of one run's AI block. Well under MongoDB's 16MB document
   * limit with the rule layer beside it; a run that would not fit is a run the
   * api cannot store at all, which loses the whole read, not just its tail.
   */
  maxBytes: 6_000_000,
} as const;

export type AiValueLimits = { [K in keyof typeof AI_VALUE_LIMITS]: number };

/** Which reader produced a value, as the library shows it. */
export type RunValueLayer = 'rule' | 'ai' | 'agent';

/**
 * One value the model or the agent read from the file — the shape the library
 * shows and a person corrects. `key` is unique within the run and is the key
 * a correction is filed under.
 */
export interface RunAiValue {
  key: string;
  field: string;
  value: unknown;
  layer: RunValueLayer;
  /** Null: this reader does not score a confidence. Never an invented number. */
  confidence: number | null;
  /** The spec or reader that produced it. */
  documentId: string;
  documentName: string;
  element: string | null;
  /** The part of the upload it came from — a workbook's sheet is "File.xlsx › Sheet". */
  sourceFile: string;
  page: number | null;
  cell: string | null;
  quote: string | null;
  /** False when the value could not be found in the document's own text. */
  grounded: boolean | null;
  /** A register's full row count, when only the first rows are carried. */
  rowCount?: number;
}

/** One document's run, before signing. */
export interface RunRecord {
  /** The uploaded file's own name — how the browser finds the file to file it under. */
  filename: string;
  /** SHA-256 (hex) of the uploaded bytes. The api refuses it for any other document. */
  contentSha256: string;
  /** Stored verbatim as the run's lossless snapshot (the rule layer). */
  parserOutput: Record<string, unknown>;
  reviewReasons: string[];
  /** The model and agent layers of the same read. */
  aiValues?: RunAiValue[];
}

/** What the browser receives and hands to the library, unopened. */
export interface SignedParserRun {
  filename: string;
  /** The claims, as the exact JSON text that was signed. */
  payload: string;
  /** base64url HMAC-SHA256 of `payload`. */
  signature: string;
}

export interface ParserRunClaims {
  typ: typeof RUN_ATTESTATION_TYPE;
  v: typeof RUN_ATTESTATION_VERSION;
  iat: number;
  exp: number;
  domain: 'bbbee' | 'esg';
  caseId: string | null;
  quoteId: string | null;
  filename: string;
  contentSha256: string;
  reviewReasons: string[];
  parserOutput: Record<string, unknown>;
  /** Absent on a record with no model read (no model configured, or a failed file). */
  aiValues?: RunAiValue[];
}

export function contentSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export function runAttestationKey(secret: string): Buffer {
  return createHmac('sha256', secret).update(ATTESTATION_CONTEXT).digest();
}

export function signRunPayload(payload: string, secret: string): string {
  return createHmac('sha256', runAttestationKey(secret)).update(payload, 'utf8').digest('base64url');
}

/** The quote a run was paid with — only when the payment gate checked it. */
export function verifiedQuoteId(body: unknown, paymentRequired: boolean): string | null {
  const quoteId = (body as { quote_id?: unknown } | undefined)?.quote_id;
  return paymentRequired && typeof quoteId === 'string' ? quoteId : null;
}

let warnedUnsigned = false;

/**
 * Sign every record. Undefined when no secret is configured: the browser then
 * has nothing to file and says the results were not archived, which is true —
 * an unsigned run would be refused anyway.
 */
export function signParserRuns(
  domain: ParserRunClaims['domain'],
  records: readonly RunRecord[],
  context: { caseId?: string | null; quoteId?: string | null },
  options: { secret?: string; now?: number } = {},
): SignedParserRun[] | undefined {
  const secret = options.secret ?? process.env.PARSER_INTERNAL_SECRET ?? '';
  if (!secret) {
    if (!warnedUnsigned) {
      warnedUnsigned = true;
      logger.warn('PARSER_INTERNAL_SECRET is not set: parser runs are not signed, and the document library will refuse them');
    }
    return undefined;
  }
  const iat = options.now ?? Date.now();
  return records.map((record) => {
    const claims: ParserRunClaims = {
      typ: RUN_ATTESTATION_TYPE,
      v: RUN_ATTESTATION_VERSION,
      iat,
      exp: iat + RUN_ATTESTATION_TTL_MS,
      domain,
      caseId: context.caseId ?? null,
      quoteId: context.quoteId ?? null,
      filename: record.filename,
      contentSha256: record.contentSha256,
      reviewReasons: record.reviewReasons,
      parserOutput: record.parserOutput,
      ...(record.aiValues ? { aiValues: record.aiValues } : {}),
    };
    const payload = JSON.stringify(claims);
    return { filename: record.filename, payload, signature: signRunPayload(payload, secret) };
  });
}

/** First upload per name — the browser matches by name and takes the first, too. */
function uploadsByName<T extends UploadedFileLike>(files: readonly T[]): Map<string, T> {
  const out = new Map<string, T>();
  for (const file of files) if (!out.has(file.originalname)) out.set(file.originalname, file);
  return out;
}

type InputLike = { filename: string; metadata?: Record<string, unknown> };

/**
 * The upload a source belongs to. A workbook's sheets come back as
 * "File.xlsx › Sheet" sources (with `parent_file` in their metadata) and
 * belong to the workbook that was uploaded.
 */
export function uploadNameResolver(
  uploadNames: ReadonlySet<string> | ReadonlyMap<string, unknown>,
  inputs: readonly InputLike[] = [],
): (source: unknown) => string | null {
  const parentOf = new Map(inputs.map((item) => [item.filename, String(item.metadata?.parent_file ?? item.filename)]));
  return (source) => {
    const name = String(source ?? '').trim();
    if (uploadNames.has(name)) return name;
    const parent = parentOf.get(name);
    if (parent && uploadNames.has(parent)) return parent;
    const marker = name.indexOf('›');
    if (marker >= 0) {
      const workbook = name.slice(0, marker).trim();
      if (uploadNames.has(workbook)) return workbook;
    }
    return null;
  };
}

function clipText(text: string, limits: AiValueLimits = AI_VALUE_LIMITS): string {
  return text.length > limits.maxText ? `${text.slice(0, limits.maxText)}…` : text;
}

/** A value as the run carries it: registers clipped to their first rows, long text cut. */
function carriedValue(value: unknown, limits: AiValueLimits): { value: unknown; rowCount?: number } {
  if (Array.isArray(value)) {
    return value.length > limits.maxRows
      ? { value: value.slice(0, limits.maxRows), rowCount: value.length }
      : { value };
  }
  if (typeof value === 'string') return { value: clipText(value, limits) };
  return { value: value ?? null };
}

/** Code-only readers: no model decided anything about these values. */
const RULE_READERS = new Set<string>([SHEET_INSTRUCTIONS_DOCUMENT_ID]);

function layerOf(extraction: DocumentExtraction, value: DocumentExtraction['values'][number]): RunValueLayer {
  if (value.source?.method === 'agent') return 'agent';
  if (RULE_READERS.has(extraction.documentId)) return 'rule';
  return 'ai';
}

/** Correction keys share the library's field-key alphabet. */
function keyPart(text: string): string {
  return text.replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 50) || 'x';
}

/**
 * Every value the model and the agent read from ONE upload, in the library's
 * shape, with its citation when the reader gave one.
 *
 * Values are matched to the upload by source (a workbook's sheets to the
 * workbook). Order follows the extractions, so the first answer for a field is
 * the one listed first — the same first-document-wins order the case uses.
 */
export function aiValuesForUpload(
  extractions: readonly DocumentExtraction[] | null | undefined,
  filename: string,
  uploadOf: (source: unknown) => string | null,
  limits: AiValueLimits = AI_VALUE_LIMITS,
): RunAiValue[] {
  const out: RunAiValue[] = [];
  const keys = new Set<string>();
  let bytes = 2;
  for (const extraction of extractions ?? []) {
    if (uploadOf(extraction.sourceFile) !== filename) continue;
    const ungrounded = new Set(extraction.ungroundedFields ?? []);
    for (const value of extraction.values ?? []) {
      if (out.length >= limits.maxValues) return out;
      if (value.value === null || value.value === undefined || value.value === '') continue;
      const base = `ai.${keyPart(extraction.documentId)}.${keyPart(value.field)}`;
      let key = base;
      for (let n = 2; keys.has(key); n += 1) key = `${base}.${n}`;
      keys.add(key);
      const carried = carriedValue(value.value, limits);
      const source = value.source;
      const entry: RunAiValue = {
        key,
        field: value.field,
        value: carried.value,
        layer: layerOf(extraction, value),
        confidence: null,
        documentId: extraction.documentId,
        documentName: extraction.documentName,
        element: extraction.element ?? null,
        sourceFile: String(value.sourceFile || extraction.sourceFile || filename),
        page: typeof source?.page === 'number' ? source.page : null,
        cell: typeof source?.cellRef === 'string' ? source.cellRef : null,
        quote: typeof source?.quote === 'string' && source.quote ? clipText(source.quote, limits) : null,
        grounded: extraction.ungroundedFields ? !ungrounded.has(value.field) : null,
        ...(carried.rowCount !== undefined ? { rowCount: carried.rowCount } : {}),
      };
      const size = Buffer.byteLength(JSON.stringify(entry)) + 1;
      if (bytes + size > limits.maxBytes) {
        logger.warn('The AI block of a run reached its size limit; later values are left out of the library copy', {
          filename,
          kept: out.length,
        });
        return out;
      }
      bytes += size;
      out.push(entry);
    }
  }
  return out;
}

type DetectedDocument = ParserCaseOutput['documents_detected'][number];

const STATUS_RANK: Record<string, number> = { passed: 0, review_required: 1, failed: 2 };

/**
 * A workbook's run, from the documents its sheets became.
 *
 * The case parser reads a workbook one sheet at a time, and each sheet is a
 * document of its own ("Pack.xlsx › Ownership"). None of them is an upload the
 * library holds, so a B-BBEE workbook used to get no run at all — the most
 * important file in most packs was absent from the library. Its run is the
 * workbook's: the sheets' fields together (the first sheet to read a field
 * wins, as in the case), the worst sheet's status, and each sheet listed.
 */
function workbookOutput(filename: string, sheets: readonly DetectedDocument[]): Record<string, unknown> {
  const outputs = sheets.map((sheet) => sheet.parser_output as unknown as Record<string, any>);
  const extracted: Record<string, unknown> = {};
  for (const output of outputs) {
    for (const [key, field] of Object.entries((output.extracted_fields ?? {}) as Record<string, any>)) {
      const has = field?.normalized_value != null || field?.raw_value != null;
      const current = extracted[key] as { normalized_value?: unknown; raw_value?: unknown } | undefined;
      if (!current || (has && current.normalized_value == null && current.raw_value == null)) extracted[key] = field;
    }
  }
  const status = sheets.reduce<string>(
    (worst, sheet) => ((STATUS_RANK[sheet.status] ?? 0) > (STATUS_RANK[worst] ?? 0) ? sheet.status : worst),
    'passed',
  );
  const all = (pick: (output: Record<string, any>) => unknown) =>
    Array.from(new Set(outputs.flatMap((output) => (Array.isArray(pick(output)) ? (pick(output) as unknown[]).map(String) : []))));
  const sheetName = (name: string) => name.slice(name.indexOf('›') + 1).trim();
  const types = Array.from(new Set(sheets.map((sheet) => sheet.document_type).filter(Boolean)));
  return {
    file_id: sheets[0]?.file_id ?? filename,
    filename,
    document_type: types.length === 1 ? types[0] : 'Workbook',
    pillar: types.length === 1 ? String(outputs[0]?.pillar ?? '') : '',
    overall_confidence: Math.min(...sheets.map((sheet) => Number(sheet.overall_confidence ?? 0))),
    status,
    extracted_fields: extracted,
    calculator_payload: {},
    supplier_rows: outputs.flatMap((output) => (Array.isArray(output.supplier_rows) ? output.supplier_rows : [])),
    measured_procurement_spend: null,
    sheets: sheets.map((sheet) => ({
      sheet: sheetName(sheet.filename),
      document_type: sheet.document_type,
      status: sheet.status,
      overall_confidence: sheet.overall_confidence,
    })),
    validation: {
      passed: status === 'passed',
      warnings: all((output) => output.validation?.warnings),
      errors: all((output) => output.validation?.errors),
      missing_fields: all((output) => output.validation?.missing_fields)
        .filter((key) => {
          const field = extracted[key] as { normalized_value?: unknown; raw_value?: unknown } | undefined;
          return !field || (field.normalized_value == null && field.raw_value == null);
        }),
    },
    audit_trail: {
      source_file: filename,
      matched_patterns: all((output) => output.audit_trail?.matched_patterns),
      rules_applied: all((output) => output.audit_trail?.rules_applied),
      graph_version: String(outputs[0]?.audit_trail?.graph_version ?? 'unknown'),
      requires_human_review: status !== 'passed',
      classification_candidates: [],
      classification_reason: `Read sheet by sheet: ${sheets.map((sheet) => `${sheetName(sheet.filename)} as ${sheet.document_type}`).join('; ')}.`,
      rejected_calculator_keys: outputs.flatMap((output) =>
        (Array.isArray(output.audit_trail?.rejected_calculator_keys) ? output.audit_trail.rejected_calculator_keys : [])),
    },
  };
}

/**
 * B-BBEE: one run per uploaded file, built from the parser's own
 * `parser_output` — the record the browser used to forward, now signed — plus
 * the model and agent values read from the same file.
 *
 * A workbook comes back as one detected document per sheet and gets ONE run,
 * the workbook's (see `workbookOutput`).
 */
export function bbbeeRunRecords(
  result: Pick<ParserCaseOutput, 'documents_detected' | 'documents_needing_review'>,
  files: readonly UploadedFileLike[],
  ai: { extractions?: readonly DocumentExtraction[] | null; inputs?: readonly InputLike[] } = {},
): RunRecord[] {
  const uploads = uploadsByName(files);
  const uploadOf = uploadNameResolver(uploads, ai.inputs ?? []);
  const byUpload = new Map<string, DetectedDocument[]>();
  for (const detected of result.documents_detected) {
    const upload = uploadOf(detected.filename);
    if (!upload) continue;
    const list = byUpload.get(upload) ?? [];
    list.push(detected);
    byUpload.set(upload, list);
  }
  const records: RunRecord[] = [];
  for (const [filename, documents] of byUpload) {
    const file = uploads.get(filename)!;
    // The upload read as itself, when it was; otherwise it is a workbook read
    // sheet by sheet.
    const own = documents.find((doc) => doc.filename === filename);
    records.push({
      filename,
      contentSha256: contentSha256(file.buffer),
      parserOutput: own
        ? (own.parser_output as unknown as Record<string, unknown>)
        : workbookOutput(filename, documents),
      reviewReasons: Array.from(new Set((result.documents_needing_review ?? [])
        .filter((row) => uploadOf(row.filename) === filename)
        .flatMap((row) => (row.filename === filename ? row.reasons ?? [] : (row.reasons ?? []).map((reason) => `${row.filename}: ${reason}`))))),
      ...(ai.extractions ? { aiValues: aiValuesForUpload(ai.extractions, filename, uploadOf) } : {}),
    });
  }
  return records;
}

/**
 * ESG: one run per uploaded file, carrying every value read from it — a
 * workbook's sheets come back as "File.xlsx › Sheet" sources and belong to the
 * workbook that was uploaded.
 *
 * The ESG reader is model and table readers only; it has no rule layer. So its
 * values travel as `aiValues` (with their source and citation), the rule
 * layer's `extracted_fields` stays empty, and the run's status says whether
 * anything was read. The record the browser used to build had no `status`, so
 * the library refused every ESG run.
 *
 * Files the parser could not read at all get a `failed` run with the reason,
 * so a paid read that failed is still on record.
 */
export function esgRunRecords(input: {
  files: readonly UploadedFileLike[];
  /** The inputs the files became — a split workbook names its parent file. */
  inputs: ReadonlyArray<InputLike>;
  /** Null when the extraction produced nothing at all (or never ran). */
  extractions: readonly DocumentExtraction[] | null;
  /** Upload name → why it could not be read. */
  readErrors: ReadonlyMap<string, string>;
}): RunRecord[] {
  const uploads = uploadsByName(input.files);
  const uploadOf = uploadNameResolver(uploads, input.inputs);

  return Array.from(uploads.entries()).map(([filename, file]) => {
    const mine = (input.extractions ?? []).filter((e) => uploadOf(e.sourceFile) === filename);
    const readError = input.readErrors.get(filename) ?? null;
    const readSomething = mine.some((e) => (e.values?.length ?? 0) > 0);
    const exceptions = Array.from(new Set(mine.flatMap((e) => (e.exceptions ?? []).map(String))));
    const extractionErrors = mine.flatMap((e) => (e.error ? [String(e.error)] : []));
    const missingFields = Array.from(new Set(mine.flatMap((e) => e.missingFields ?? [])));

    const failure = readError
      ?? (input.extractions == null ? 'Nothing was extracted from this document.' : null);
    const warnings = [
      ...exceptions,
      ...extractionErrors,
      ...(!failure && !readSomething ? ['Nothing was extracted from this document.'] : []),
    ];
    const status = failure ? 'failed' : warnings.length > 0 ? 'review_required' : 'passed';
    // The duplicate-workbook note rides on the first file with no values; the
    // document's type is the one its values were read under.
    const primary = mine.find((e) => (e.values?.length ?? 0) > 0) ?? mine[0];

    return {
      filename,
      contentSha256: contentSha256(file.buffer),
      parserOutput: {
        filename,
        domain: 'esg',
        document_type: primary?.documentName ?? 'Unknown',
        // The ESG analogue of a pillar, under the same key so the library
        // renders both domains with one template.
        pillar: primary?.element ?? '',
        status,
        extracted_fields: {},
        validation: {
          passed: status === 'passed',
          warnings,
          errors: failure ? [failure] : [],
          missing_fields: missingFields,
        },
        audit_trail: {
          source_file: filename,
          matched_patterns: [],
          rules_applied: [],
          graph_version: 'unknown',
          requires_human_review: status !== 'passed',
          classification_candidates: [],
          rejected_calculator_keys: [],
        },
      },
      reviewReasons: [],
      aiValues: aiValuesForUpload(mine, filename, uploadOf),
    };
  });
}

/** How many values a record delivered, across both layers — what a paid read is settled on. */
export function recordValueCount(record: Pick<RunRecord, 'parserOutput' | 'aiValues'>): number {
  let rule = 0;
  for (const field of Object.values((record.parserOutput.extracted_fields ?? {}) as Record<string, unknown>)) {
    const f = field as { normalized_value?: unknown; raw_value?: unknown } | null;
    const v = f?.normalized_value ?? f?.raw_value;
    if (v !== null && v !== undefined && String(v).trim() !== '') rule += 1;
  }
  return rule + (record.aiValues?.length ?? 0);
}
