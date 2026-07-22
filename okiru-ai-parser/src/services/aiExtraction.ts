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
import { chunkDocument, mergeChunkResults } from './documentChunking.js';
import {
  aliasIndex,
  findDocumentById,
  type VerificationDocument,
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
  sourceFile: string;
  values: ExtractedValue[];
  /** Schema fields the model did not return — what to ask the user for. */
  missingFields: string[];
  /** Keys the model returned that the schema did not ask for. */
  unexpectedFields: string[];
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

  return {
    name: deployment,
    async complete(system: string, user: string): Promise<string> {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          // Deterministic: the same document must extract the same values on a
          // re-run, otherwise a score changes without the evidence changing.
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        throw new Error(`Azure extraction failed: ${response.status} ${await response.text().catch(() => '')}`.trim());
      }
      const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      return body.choices?.[0]?.message?.content ?? '';
    },
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

/** Run one document's extraction prompt against one file. */
export async function extractWithSpec(
  model: ExtractionModel,
  spec: VerificationDocument,
  input: { filename: string; markdown?: string; raw_text: string },
): Promise<DocumentExtraction> {
  // Markdown preferred: the values live in tables and under headings, and a flat
  // text projection destroys the row/column relationship they depend on.
  const source = input.markdown?.trim() || input.raw_text;

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

  return {
    ...base,
    values,
    missingFields,
    unexpectedFields,
    exceptions: toExceptions(parsed.exceptions),
  };
}

/**
 * Extract everything this file has to offer, across every document type whose
 * evidence appears in it.
 */
export async function extractDocument(
  model: ExtractionModel,
  input: { filename: string; markdown?: string; raw_text: string },
  options: { specIds?: string[]; limit?: number } = {},
): Promise<DocumentExtraction[]> {
  const specs = options.specIds
    ? options.specIds.map(findDocumentById).filter((doc): doc is VerificationDocument => doc !== null)
    : selectSpecsForDocument(input.raw_text, input.filename, { limit: options.limit });

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
  return results;
}
