/**
 * AI extraction — run the expert's prompt against a document and get entities.
 *
 * The deterministic parser matches regexes written per field, so it only ever
 * finds what someone anticipated the exact wording of. That is why real
 * documents came back empty: a certificate that says "Status Level: 4" instead
 * of "B-BBEE Status Level: Level 4" has no pattern.
 *
 * This path is different in kind. Each of the 109 documents in the verification
 * matrix carries an instruction written by the B-BBEE expert and the JSON schema
 * that instruction asks for. We send the document's markdown (structure intact —
 * tables and headings are what the values hang off) with that instruction, and
 * validate the reply against the schema.
 *
 * THREE PROPERTIES THIS MUST HAVE
 *
 * 1. FORMAT-BLIND. A client's evidence is spread across PDFs, spreadsheets,
 *    decks and scans. Everything is converted to markdown upstream, so this
 *    layer never learns what a .pptx is — it reads one text format.
 *
 * 2. MIXED DOCUMENTS. One file routinely carries several documents' worth of
 *    evidence (an information-gathering workbook holds ownership AND employees
 *    AND procurement). So a document is matched against EVERY spec whose
 *    evidence appears in it, not just its single best classification.
 *
 * 3. FAIL-SAFE. With no model configured this returns nothing and the
 *    deterministic path is untouched. Extraction never fabricates: a field the
 *    model did not find is reported missing rather than guessed, and every value
 *    carries the file it came from.
 */
import { createLogger } from '../logger.js';
import { fetchAzureWithRetry } from './azureRetry.js';
import { chunkDocument, mergeChunkResults } from './documentChunking.js';
import { rankSpecsForDocument, elementFromHint } from './specRetrieval.js';
import { groundValues } from './extractionGrounding.js';
import { checksumForField } from '../../parser/checksums.js';
import {
  cachingEnabled,
  extractionCacheKey,
  getExtractionCache,
  logCacheHit,
} from './extractionCache.js';
import {
  aliasIndex,
  findDocumentById,
  type VerificationDocument,
  type VerificationElement,
} from '../../schemas/verification_document_matrix.js';

const logger = createLogger('AiExtraction');

/** One extracted value and where it came from. */
export interface ExtractedValue {
  field: string;
  value: unknown;
  /** Filename the value was read from — provenance for every number we score. */
  sourceFile: string;
  /** Matrix document id whose prompt produced it. */
  sourceDocumentId: string;
}

export interface DocumentExtraction {
  documentId: string;
  documentName: string;
  /** Scorecard element this document serves — disambiguates ESD vs SED etc. */
  element?: string;
  sourceFile: string;
  values: ExtractedValue[];
  /** Schema fields the model did not return — what to ask the user for. */
  missingFields: string[];
  /** Keys the model returned that the schema did not ask for. */
  unexpectedFields: string[];
  /**
   * Fields whose value could not be found in the source document. Reported,
   * never dropped — a grounding miss is evidence for a reviewer, not proof.
   */
  ungroundedFields?: string[];
  /** Exceptions the expert's prompt asked the model to raise. */
  exceptions: string[];
  error?: string;
}

/**
 * The model call, isolated behind an interface so extraction logic is testable
 * without a network and so the provider can change without touching this file.
 */
export interface ExtractionModel {
  name: string;
  complete(system: string, user: string): Promise<string>;
  /**
   * Same call at ESCALATED reasoning effort — used by the sweep, where the
   * question is "look harder for these specific missing values". Optional:
   * absent (tests, non-reasoning deployments) the sweep uses `complete`.
   */
  completeHard?(system: string, user: string): Promise<string>;
}

// NOTE: the old AI_EXTRACTION_MAX_CHARS truncation is gone — long documents are
// chunked (documentChunking.ts) so nothing is silently dropped.

/**
 * Azure OpenAI over plain fetch — the parser has no SDK dependency and does not
 * need one for a single chat completion.
 *
 * Returns null when unconfigured; callers degrade to the deterministic path
 * rather than failing the upload.
 */
export function createAzureExtractionModel(): ExtractionModel | null {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const deployment = process.env.AZURE_MODEL_DEPLOYMENT ?? process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini';
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-08-01-preview';

  if (!endpoint || !apiKey) {
    logger.warn('AI extraction disabled — AZURE_OPENAI_ENDPOINT / AZURE_OPENAI_API_KEY not set');
    return null;
  }

  const url = `${endpoint.replace(/\/+$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  // gpt-5-family models spend hidden reasoning tokens on EVERY call; for
  // structured field extraction that reasoning adds latency and burns the
  // TPM quota without extracting better. `minimal` cut a large pack's wall
  // time several-fold. Env-tunable: set PARSER_REASONING_EFFORT=off when the
  // deployment is not a reasoning model.
  const reasoningEffort = process.env.PARSER_REASONING_EFFORT ?? 'minimal';
  // The SWEEP is the opposite trade: a short, specific "find these missing
  // values" question where thinking harder genuinely finds more. Runs on the
  // few documents with gaps, not the whole pack, so the extra latency is paid
  // exactly where it buys extraction.
  const sweepEffort = process.env.PARSER_SWEEP_REASONING_EFFORT ?? 'medium';

  const callAt = (effort: string) => async (system: string, user: string): Promise<string> => {
    const response = await fetchAzureWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        // gpt-5-family deployments reject non-default `temperature`, so
        // determinism is best-effort: same document, same prompt, default
        // sampling. Re-run drift is bounded by the json_object format.
        response_format: { type: 'json_object' },
        ...(effort && effort !== 'off' ? { reasoning_effort: effort } : {}),
      }),
    });

    if (!response.ok) {
      throw new Error(`Azure extraction failed: ${response.status} ${await response.text().catch(() => '')}`.trim());
    }
    const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return body.choices?.[0]?.message?.content ?? '';
  };

  return {
    name: deployment,
    complete: callAt(reasoningEffort),
    completeHard: callAt(sweepEffort),
  };
}

const SYSTEM_PROMPT = [
  'You are a B-BBEE verification analyst extracting evidence from a client document.',
  'Follow the analyst instruction exactly and return ONLY a JSON object.',
  'Rules that matter more than completeness:',
  '- Never invent or infer a value. If the document does not state it, use null.',
  '- Copy values as they appear; do not convert currencies, dates or percentages.',
  '- If the document is not the type described, return {"not_this_document": true}.',
  '- Add an "exceptions" array describing anything that fails the analyst checks.',
  '- NEVER extract rows from sections labelled "Reference options", dropdown/option',
  '  lists, legends, or category catalogues — those are template vocabulary, not data.',
  '- Ledger-style tables use blank-means-ditto: a continuation row carrying only a',
  '  date/amount belongs to the last row above it that stated the name/type. Apply',
  '  that stated context to each continuation row; never emit a data row whose only',
  '  content is template vocabulary.',
].join('\n');

/**
 * Parse the model's reply into an object.
 *
 * Models wrap JSON in prose or code fences even when told not to, and a thrown
 * parse error would lose an otherwise good extraction, so recover the outermost
 * object before giving up.
 */
export function parseModelJson(reply: string): Record<string, unknown> | null {
  const trimmed = reply.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const attempt = (candidate: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  };

  const direct = attempt(trimmed);
  if (direct) return direct;

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return attempt(trimmed.slice(start, end + 1));
  return null;
}

/** A value the model returned but which carries no information. */
function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase();
    // Models write these instead of null despite instructions.
    return normalised === '' || normalised === 'null' || normalised === 'n/a'
      || normalised === 'not stated' || normalised === 'not found' || normalised === 'unknown';
  }
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function toExceptions(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  return [String(value)].filter(Boolean);
}

/**
 * Which matrix documents is it worth running against this file?
 *
 * A distinctive alias appearing in the text is strong evidence that the document
 * contains that evidence — and a single file can trip several, which is exactly
 * the mixed-document case (a workbook holding ownership, employees and
 * procurement returns three specs, not one).
 */
export function selectSpecsForDocument(
  text: string,
  filename: string,
  options: { limit?: number } = {},
): VerificationDocument[] {
  const haystack = `${filename}\n${text}`.toLowerCase();
  const hits = new Map<string, { doc: VerificationDocument; strength: number }>();

  for (const { lower, doc } of aliasIndex()) {
    // Very short aliases ("VAT", "AFS") match far too loosely to route work on.
    if (lower.length < 5) continue;
    if (!haystack.includes(lower)) continue;

    const existing = hits.get(doc.id);
    // Longer alias = more specific evidence.
    if (!existing || existing.strength < lower.length) {
      hits.set(doc.id, { doc, strength: lower.length });
    }
  }

  return [...hits.values()]
    .sort((a, b) => b.strength - a.strength)
    .slice(0, options.limit ?? 5)
    .map((hit) => hit.doc);
}

/**
 * Whether the sweep pass runs. On by default — it is the difference between
 * "the model had a go" and a genuine second look. Set AI_EXTRACTION_SWEEP=false
 * to disable (tests that assert single-call behaviour, or cost investigations).
 */
function sweepEnabled(): boolean {
  return process.env.AI_EXTRACTION_SWEEP !== 'false';
}

const SWEEP_SYSTEM_PROMPT = [
  'You are re-reading a document to find SPECIFIC values a first pass missed.',
  'You are given the exact field names still needed. Look for those and nothing else.',
  'Before answering, reason carefully about WHERE each value could live: synonym',
  'wordings, table columns, totals rows, stamps, letterheads and annexures.',
  'Rules:',
  '- Return ONLY a JSON object keyed by the requested field names.',
  '- A field genuinely absent from the document must be null. Never infer or estimate it.',
  '- Values often sit in tables, footers, stamps or annexures rather than in prose — look there.',
  '- The same fact may be worded differently than expected; match on MEANING, not on phrasing.',
  '- Copy values exactly as printed. Do not convert currencies, dates or percentages.',
].join('\n');

/**
 * Second, targeted look for fields the first pass did not return.
 *
 * Deliberately narrow: naming the handful of missing fields makes this a far
 * easier question than the original omnibus prompt, which is why it recovers
 * values rather than repeating the same omission.
 *
 * Failure is non-fatal — a failed sweep leaves the fields missing, exactly as
 * they already were.
 */
async function sweepForMissingFields(
  model: ExtractionModel,
  spec: VerificationDocument,
  filename: string,
  chunks: Array<{ text: string; index: number }>,
  missing: string[],
): Promise<Record<string, unknown>> {
  // The sweep thinks harder than the first pass: escalated reasoning effort
  // where the model supports it (completeHard), the plain call where not.
  const completeSweep = model.completeHard?.bind(model) ?? model.complete.bind(model);
  const ask = async (chunk: { text: string; index: number }): Promise<Record<string, unknown> | null> => {
    const user = [
      `DOCUMENT TYPE: ${spec.name}`,
      `\nFIELDS STILL NEEDED (return exactly these keys): ${missing.join(', ')}`,
      chunks.length > 1 ? `\nThis is part ${chunk.index + 1} of ${chunks.length}.` : '',
      `\nDOCUMENT (${filename}):\n${chunk.text}`,
    ].join('\n');

    try {
      return parseModelJson(await completeSweep(SWEEP_SYSTEM_PROMPT, user));
    } catch (err) {
      logger.warn('Sweep pass failed — leaving fields missing', {
        document: spec.id, file: filename, chunk: chunk.index, reason: (err as Error).message,
      });
      return null;
    }
  };

  const replies = (await Promise.all(chunks.map(ask)))
    .filter((r): r is Record<string, unknown> => r !== null);

  if (replies.length === 0) return {};

  const { merged } = mergeChunkResults(replies);
  const recovered = missing.filter((field) => !isEmptyValue(merged[field]));
  if (recovered.length > 0) {
    logger.info('Sweep pass recovered fields a single pass missed', {
      document: spec.id, file: filename, recovered, stillMissing: missing.length - recovered.length,
    });
  }
  return merged;
}

/** Run one document's extraction prompt against one file. */
export async function extractWithSpec(
  model: ExtractionModel,
  spec: VerificationDocument,
  input: { filename: string; markdown?: string; raw_text: string },
): Promise<DocumentExtraction> {
  // Markdown preferred: the values live in tables and under headings, and a flat
  // text projection destroys the row/column relationship they depend on.
  const source = input.markdown?.trim() || input.raw_text;

  // Multi-pass extraction is the right amount of work to do ONCE. Adding one
  // document to a pack must not re-read the other 25, and a requote must not
  // re-read documents already paid for. Keyed on content AND prompt, so a
  // corrected matrix prompt invalidates every result it produced.
  const cacheKey = extractionCacheKey({
    content: source,
    documentId: spec.id,
    extractionPrompt: spec.extractionPrompt,
    expectedFields: spec.expectedFields,
    // Logic-version salt: the escalated multi-round sweep changes what a given
    // document yields, so pre-sweep cache entries must not serve for it.
    model: `${model.name}#sweep2`,
  });
  if (cachingEnabled()) {
    const hit = getExtractionCache().get(cacheKey);
    if (hit) {
      logCacheHit(spec.id, input.filename);
      // Re-stamp the filename: the same content may arrive under another name,
      // and provenance must name the file the USER uploaded.
      return {
        ...hit,
        sourceFile: input.filename,
        values: hit.values.map((v) => ({ ...v, sourceFile: input.filename })),
      };
    }
  }

  // A long document is CHUNKED, not truncated. `slice(0, MAX_DOCUMENT_CHARS)`
  // was indistinguishable downstream from "the document does not contain that
  // field", so a 300-page pack was read to roughly page 12 and the rest
  // reported missing.
  const { chunks, truncated, totalChars } = chunkDocument(source);
  if (chunks.length > 1) {
    logger.info('Document chunked for extraction', {
      document: spec.id,
      file: input.filename,
      chunks: chunks.length,
      totalChars,
      truncated,
    });
  }

  const base: DocumentExtraction = {
    documentId: spec.id,
    documentName: spec.name,
    element: spec.element,
    sourceFile: input.filename,
    values: [],
    missingFields: [],
    unexpectedFields: [],
    exceptions: [],
  };

  const promptFor = (chunk: { text: string; index: number }): string => [
    `ANALYST INSTRUCTION:\n${spec.extractionPrompt}`,
    `\nEXPECTED JSON KEYS: ${spec.expectedFields.join(', ')}`,
    `\nWHAT CORRECT DATA LOOKS LIKE (for reference only, do not copy):\n${spec.exampleData}`,
    chunks.length > 1
      ? `\nNOTE: this is part ${chunk.index + 1} of ${chunks.length} of a long document. `
        + 'Return only fields visible in THIS part; omit the rest. Do not infer from missing context.'
      : '',
    `\nDOCUMENT (${input.filename}):\n${chunk.text}`,
  ].join('\n');

  // Chunks are read in parallel — they are independent, and a long document
  // should not cost N sequential round trips.
  const replies = await Promise.all(chunks.map(async (chunk) => {
    try {
      return { ok: true as const, reply: await model.complete(SYSTEM_PROMPT, promptFor(chunk)) };
    } catch (err) {
      logger.error('Extraction model call failed', err as Error, {
        document: spec.id, file: input.filename, chunk: chunk.index,
      });
      return { ok: false as const, error: (err as Error).message };
    }
  }));

  const successes = replies.filter((r) => r.ok);
  if (successes.length === 0) {
    const firstError = replies.find((r) => !r.ok);
    return {
      ...base,
      error: firstError && !firstError.ok ? firstError.error : 'All extraction calls failed',
      missingFields: [...spec.expectedFields],
    };
  }

  const parsedChunks = successes
    .map((r) => (r.ok ? parseModelJson(r.reply) : null))
    .filter((p): p is Record<string, unknown> => p !== null);

  if (parsedChunks.length === 0) {
    return { ...base, error: 'Model reply was not JSON', missingFields: [...spec.expectedFields] };
  }

  // First non-empty wins: chunks overlap, and a document states its headline
  // facts before its annexures, so a later part may FILL a field but never
  // overwrite one found earlier.
  const { merged } = mergeChunkResults(parsedChunks);
  const parsed = merged;

  // The model's own escape hatch: this file is not the document we asked about.
  // Treated as "nothing found here", never as a failure.
  if (parsed.not_this_document === true) return base;

  // ── SWEEP PASS ──────────────────────────────────────────────────────────
  // A single pass reads a whole prompt's worth of fields at once and reliably
  // overlooks some — particularly values sitting in tables, footers or under
  // wording the prompt did not anticipate. Asking again, naming ONLY what is
  // still missing, recovers those: a short, specific question is a far easier
  // one to answer than the original omnibus instruction.
  //
  // Bounded to one extra round trip per document, and skipped entirely when the
  // first pass found everything (the common case for clean documents).
  const foundSomething = spec.expectedFields.some((field) => !isEmptyValue(parsed[field]));
  // Only sweep a spec the first pass got SOMETHING from. Zero fields found means
  // this is almost certainly the wrong spec for this document (retrieval offers
  // candidates; most are wrong), not a right document with hidden values — so a
  // second look is a wasted model call. This is the single biggest latency cut
  // once retrieval widened the candidate set.
  //
  // BOUNDED LOOP, progress-gated: a round that recovered nothing proves the
  // remaining fields are not in the document (the prompt forbids inventing
  // them), so looping further would only spend money re-proving absence. A
  // round that DID recover something earns one more look at what remains.
  if (foundSomething && sweepEnabled()) {
    const maxRounds = Math.max(1, Number(process.env.PARSER_SWEEP_ROUNDS) || 2);
    for (let round = 0; round < maxRounds; round++) {
      const stillMissing = spec.expectedFields.filter((field) => isEmptyValue(parsed[field]));
      if (stillMissing.length === 0) break;
      const swept = await sweepForMissingFields(model, spec, input.filename, chunks, stillMissing);
      let recovered = 0;
      for (const [field, value] of Object.entries(swept)) {
        // The sweep may only FILL a gap. It can never overwrite a value the first
        // pass found — a second opinion must not silently replace a first answer.
        if (isEmptyValue(parsed[field]) && !isEmptyValue(value)) {
          parsed[field] = value;
          recovered += 1;
        }
      }
      if (recovered === 0) break;
    }
  }

  const values: ExtractedValue[] = [];
  const missingFields: string[] = [];
  for (const field of spec.expectedFields) {
    const value = parsed[field];
    if (isEmptyValue(value)) {
      missingFields.push(field);
      continue;
    }
    values.push({ field, value, sourceFile: input.filename, sourceDocumentId: spec.id });
  }

  const known = new Set([...spec.expectedFields, 'exceptions', 'not_this_document']);
  const unexpectedFields = Object.keys(parsed).filter((key) => !known.has(key) && !isEmptyValue(parsed[key]));

  // ── VERIFY PASS ─────────────────────────────────────────────────────────
  // Go back to the source and confirm the document actually says each value.
  // Confidence does not catch a confident hallucination — an invented "Level 4"
  // carries the same confidence as a read one. Mostly free: the prompt tells the
  // model to copy values verbatim, so a string search settles it.
  //
  // An ungrounded value is NOT dropped. It is evidence for a reviewer; silently
  // discarding it would be the same silent-zero failure in a new coat.
  const grounded = groundValues(values.map((v) => ({ field: v.field, value: v.value })), source, {
    file: input.filename,
    document: spec.id,
  });
  const ungroundedFields = grounded
    .filter((g) => g.verdict === 'ungrounded')
    .map((g) => g.field);

  const groundingExceptions = ungroundedFields.length > 0
    ? [`Values not found in the source document (possible extraction error): ${ungroundedFields.join(', ')}`]
    : [];

  // ── CHECKSUM CROSS-CHECK ────────────────────────────────────────────────
  // SA ID numbers, CIPC registrations and VAT numbers carry check digits. A
  // failing checksum means the value was MISREAD — one transposed digit in an
  // OCR'd scan produces a number that looks entirely plausible and identifies
  // the wrong person. This is exactly the failure mode of the scanned documents
  // the vision path now reads, and grounding cannot catch it: a misread digit
  // grounds perfectly well against a blurry source.
  //
  // Reported, never dropped: a reviewer decides, and a real document with a
  // genuinely malformed number is a finding in its own right.
  const checksumExceptions: string[] = [];
  for (const { field, value } of values) {
    const result = checksumForField(field, value);
    if (result && !result.valid) {
      checksumExceptions.push(`${field} failed its checksum (${result.reason}) — likely misread: ${String(value)}`);
      logger.warn('Extracted identifier failed its checksum', {
        document: spec.id, file: input.filename, field, reason: result.reason,
      });
    }
  }

  const result: DocumentExtraction = {
    ...base,
    values,
    missingFields,
    unexpectedFields,
    ungroundedFields,
    exceptions: [...toExceptions(parsed.exceptions), ...groundingExceptions, ...checksumExceptions],
  };

  if (cachingEnabled()) getExtractionCache().set(cacheKey, result);
  return result;
}

/**
 * Extract everything this file has to offer, across every document type whose
 * evidence appears in it.
 */
export async function extractDocument(
  model: ExtractionModel,
  input: { filename: string; markdown?: string; raw_text: string; elementHint?: string },
  options: { specIds?: string[]; limit?: number; elementOverride?: VerificationElement } = {},
): Promise<DocumentExtraction[]> {
  // Prefer markdown for RETRIEVAL too: a sheet's column headers ("Beneficiary",
  // "% Black participation") are the terms that discriminate its element, and
  // they live in the markdown table, not the flat text projection.
  const retrievalText = input.markdown?.trim() || input.raw_text;
  const specs = options.specIds
    ? options.specIds.map(findDocumentById).filter((doc): doc is VerificationDocument => doc !== null)
    : rankSpecsForDocument(retrievalText, input.filename, {
        limit: options.limit, // retrieval picks a smart default: 3 with a hint, 5 without
        elementHint: input.elementHint,
        elementOverride: options.elementOverride, // Pass A classification, when confident
      }).map((c) => c.spec);

  if (specs.length === 0) return [];

  logger.info('Extracting document', {
    file: input.filename,
    specs: specs.map((spec) => spec.id),
  });

  // Sequential on purpose: these run behind a paid quote, and a burst of
  // parallel calls per file is the fastest way to hit a rate limit mid-case and
  // lose extractions the user has already paid for.
  const results: DocumentExtraction[] = [];
  for (const spec of specs) {
    results.push(await extractWithSpec(model, spec, input));
  }

  // Retrieval now offers CANDIDATES (BM25 surfaces weak matches); the model is
  // the gate. A spec it tried but got nothing from is not evidence — returning
  // it as an empty extraction would clutter the case and misreport a lunch
  // receipt as N documents-we-found-nothing-in. Keep only extractions that
  // produced values, or that errored (a failure the caller must see).
  return results.filter((r) => r.values.length > 0 || Boolean(r.error));
}
