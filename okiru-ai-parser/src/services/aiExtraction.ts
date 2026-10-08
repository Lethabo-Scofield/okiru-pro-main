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
import { boundedAll, chunkConcurrency } from './concurrentMap.js';
import {
  agentReasoningEffort,
  azureCompleteWithTools,
  type AgentCallOptions,
  type AgentMessage,
  type AgentTool,
  type AgentTurn,
} from './agentModel.js';
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
import type { VerificationDocument } from '../../schemas/verification_document_matrix.js';
import {
  extractionDomain,
  hoistGridRowsFrom,
  type DomainDocument,
  type ExtractionDomain,
  type RoutableElement,
} from './extractionDomain.js';
import {
  expectedKeysWithSkill,
  requiredFirst,
  skillFieldNotes,
  skillPromptSections,
  type Skill,
} from './skills.js';

const logger = createLogger('AiExtraction');

/** One extracted value and where it came from. */
export interface ExtractedValue {
  field: string;
  value: unknown;
  /** Filename the value was read from — provenance for every number we score. */
  sourceFile: string;
  /** Matrix document id whose prompt produced it. */
  sourceDocumentId: string;
  /**
   * Where the value was read, when the reader cited it. Only the agent loop
   * (agentExtraction.ts) sets this today: method 'agent', plus the page or
   * table cell and the quote the citation check found there.
   */
  source?: ExtractedValueSource;
}

export interface ExtractedValueSource {
  /**
   * 'agent': read by the agent loop, with a citation. 'derived': worked out in
   * code from other extracted values (skillDerivations.ts) — `quote` then says
   * what it was derived from, and the value is never a printed one.
   */
  method: 'agent' | 'derived';
  page?: number;
  cellRef?: string;
  quote: string;
  /** A row array's value: each row's own citation, in row order. */
  rows?: Array<{ page?: number; cellRef?: string; quote: string }>;
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
  /** What the agent-loop pass did on this document, when it ran (agentExtraction.ts). */
  agent?: AgentPassReport;
}

export interface AgentPassReport {
  turns: number;
  tokens: number;
  stopReason: string;
  /** Fields the first pass left empty and the agent filled, with a citation. */
  filled: string[];
  /** Fields where the agent disagreed; the first-pass value was kept. */
  conflicts: string[];
  /** Submitted values the citation or target check refused. */
  rejected: number;
  reasons: string[];
  error?: string;
  /** Which document type the agent read the file as, and why (agentExtraction chooseAgentTarget). */
  target?: {
    specId: string;
    skillId?: string;
    /** classifier | classifier_alias | skill_signals | first_pass */
    source: string;
    /** The classifier's final (adjudicated) type, when there was one. */
    type?: string;
    /** The first-pass spec the classifier's type overrode. */
    overrode?: string;
  };
  /** Turns this document was allowed (longer scans get more). */
  turnBudget?: number;
  /** Why the run ended with a forced submit_values turn, when it did. */
  forcedSubmit?: string;
  /** Rows the agent filled under the skill's rows field (only when the first pass had none). */
  rowsFilled?: number;
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
  /**
   * The strongest reasoning tier — ONE call per case, for the analyst review
   * that reads the assembled evidence as a whole. Optional: absent, the review
   * uses completeHard, then complete.
   */
  completeReview?(system: string, user: string): Promise<string>;
  /**
   * One tool-calling turn of the agent-loop extractor (agentExtraction.ts):
   * the whole transcript in, one assistant message (with tool_calls) out.
   * Optional: absent, the agent pass is skipped and nothing else changes.
   */
  completeWithTools?(messages: AgentMessage[], tools: AgentTool[], options?: AgentCallOptions): Promise<AgentTurn>;
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
  // The case review is ONE call per case, so it can afford real thinking.
  const reviewEffort = process.env.PARSER_REVIEW_REASONING_EFFORT ?? 'high';

  const callAt = (effort: string) => async (system: string, user: string): Promise<string> => {
    // JSON mode is refused outright (400) unless the messages say "json". A
    // prompt that forgot to failed every call it made — the ESG register
    // choice did, for every sheet — so the instruction is added, not trusted.
    const asked = /json/i.test(system) || /json/i.test(user) ? system : `${system}\nReply in JSON.`;
    const response = await fetchAzureWithRetry(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': apiKey },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: asked },
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
    completeReview: callAt(reviewEffort),
    // The agent loop's turns (only reached when PARSER_AGENT_EXTRACTION is on).
    completeWithTools: azureCompleteWithTools(url, apiKey, agentReasoningEffort()),
  };
}

/**
 * The extraction system prompt.
 *
 * Only the FIRST line is domain-specific — who is reading the document. Every
 * rule after it is about not inventing values, and is identical whether the
 * evidence is a share register or a municipal water account, so both domains
 * share one prompt body rather than drifting apart in two copies.
 */
function systemPromptFor(domain: ExtractionDomain, skill: Skill | null = null): string {
  return [
    extractionDomain(domain).analystRole,
    // A skill's contract answers a wrong document with nulls and a reason, so
    // the reason reaches a reviewer; the bare marker said only "not this one".
    ...(skill ? SYSTEM_PROMPT_RULES.map((rule) => (rule === NOT_THIS_DOCUMENT_RULE ? SKILL_WRONG_DOCUMENT_RULE : rule)) : SYSTEM_PROMPT_RULES),
  ].join('\n');
}

const NOT_THIS_DOCUMENT_RULE = '- If the document is not the type described, return {"not_this_document": true}.';
const SKILL_WRONG_DOCUMENT_RULE = '- If the document is not the type described, return null for every key and say what it is in "exceptions".';

/** "Document is a X, not a <type>" — the reason SKILL_WRONG_DOCUMENT_RULE asks for. */
const WRONG_TYPE_STATEMENT = /^(?:the\s+)?(?:source\s+|provided\s+|uploaded\s+|attached\s+)?(?:document|file|this)\b[^.;]*?\bnot\s+(?:a|an|the)\s+([A-Za-z0-9][^.;,]*)/i;
/** Words that qualify a document of the right type (a copy, an expired one), never name a type. */
const TYPE_QUALIFIERS = new Set(['valid', 'original', 'certified', 'signed', 'complete', 'current', 'full', 'final', 'official', 'clear', 'legible']);

/** Words any document type could carry; they never say which type a document is. */
const GENERIC_DOCUMENT_WORDS = new Set([
  'document', 'file', 'report', 'spreadsheet', 'sheet', 'excel', 'workbook', 'tab', 'summary', 'list',
  'register', 'record', 'form', 'template', 'statement', 'data', 'page', 'pdf', 'scan', 'copy', 'part',
  'section', 'extract', 'export', 'table', 'schedule', 'listing', 'overview', 'detail',
]);

function typeWords(text: string): string[] {
  return text.toLowerCase()
    .split(/[^a-z0-9.]+/)
    .map((word) => word.replace(/\.+$/, '').replace(/s$/, ''))
    .filter((word) => word.length >= 3);
}

/**
 * The exception in which a skill read says the document is NOT this type
 * ("Document is a beneficial interest register, not a CIPC COR14.1"), or null.
 * The type named after "not a" must start with a word of this spec's own name,
 * aliases or skill id — "not an original CIPC certificate" is a reservation
 * about the copy, not a different type.
 */
export function wrongTypeStatement(
  exceptions: string[],
  spec: { name: string; aliases?: readonly string[] },
  skillId: string,
): string | null {
  const identity = new Set(
    [spec.name, ...(spec.aliases ?? []), skillId.replace(/_/g, ' ')]
      .flatMap(typeWords)
      .filter((word) => !TYPE_QUALIFIERS.has(word)),
  );
  // The first word that names a kind of document: "a spreadsheet report of
  // fuel" is named by "fuel", never by a word any document type could carry.
  const firstTypeWord = (text: string | undefined) =>
    text ? typeWords(text).find((word) => !TYPE_QUALIFIERS.has(word) && !GENERIC_DOCUMENT_WORDS.has(word)) : undefined;
  for (const exception of exceptions) {
    const named = exception.trim().match(WRONG_TYPE_STATEMENT)?.[1];
    const first = named ? typeWords(named)[0] : undefined;
    if (!first || !identity.has(first)) continue;
    // What the document IS, when it says so: "Document is a code of conduct
    // (not an incident register)" names a part of a spec that covers the code,
    // the policy AND the register. A document that is this type, lacking one
    // part of it, keeps its values.
    const is = /\b(?:is|appears to be|looks like)\s+(?:a|an|the)?\s*(.*?)\s*[,(;:–-]*\s*\bnot\s+(?:a|an|the)\b/i.exec(exception)?.[1];
    const isFirst = firstTypeWord(is);
    if (isFirst && identity.has(isFirst)) continue;
    return exception.trim();
  }
  return null;
}

const SYSTEM_PROMPT_RULES = [
  'Follow the analyst instruction exactly and return ONLY a JSON object.',
  'Rules that matter more than completeness:',
  '- Never invent or infer a value. If the document does not state it, use null.',
  '- Copy values as they appear; do not convert currencies, dates or percentages.',
  NOT_THIS_DOCUMENT_RULE,
  '- Add an "exceptions" array describing anything that fails the analyst checks.',
  '- NEVER extract rows from sections labelled "Reference options", dropdown/option',
  '  lists, legends, or category catalogues — those are template vocabulary, not data.',
  '- Ledger-style tables use blank-means-ditto: a continuation row carrying only a',
  '  date/amount belongs to the last row above it that stated the name/type. Apply',
  '  that stated context to each continuation row; never emit a data row whose only',
  '  content is template vocabulary.',
];

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

/** Keys a reply carries about itself, never a wrapper around the record. */
const REPLY_META_KEYS = new Set(['exceptions', 'not_this_document']);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export interface UnwrappedReply {
  /** The reply with a single wrapped record's fields lifted to the top level. */
  record: Record<string, unknown>;
  /** The key the record was lifted out of, when one was. */
  wrapper?: string;
  /** A wrapper holding SEVERAL records: reported, never chosen between. */
  multiple?: { key: string; count: number };
}

/**
 * A single-record answer nested one level down.
 *
 * A spec that reads one record ("Return JSON per letter: signatory_name, …")
 * is answered flat ({"signatory_name": …}) or wrapped ({"letters": [{…}],
 * "expected_parties": …}, {"letter": {…}}). Both say the same thing, but the
 * wrapped shape left every expected key absent at the top level, so the whole
 * extraction read as "nothing found" and was dropped.
 *
 * A wrapper is a key the spec does NOT expect (an expected array field such as
 * `shareholder_rows` is the answer, not a wrapper) whose value is one object,
 * or an array of exactly one object, carrying at least one expected field.
 * Its fields only FILL gaps: a value stated at the top level always wins. The
 * record's own `exceptions` join the reply's.
 *
 * Nothing is guessed: two candidate wrappers, or one wrapper holding several
 * records, leave the reply as it was (the second reported in `multiple`).
 *
 * And a reply that already names any expected field at the top level — even as
 * null — IS the record: a nested object beside it is a sub-entity (an auditor,
 * a signatory), not a wrapper, and must not fill the record's gaps. Without
 * this, {"entity_name": null, "auditor": {"entity_name": "…"}} read the
 * auditor's name as the company's.
 */
export function unwrapSingleRecord(
  parsed: Record<string, unknown>,
  expectedFields: readonly string[],
): UnwrappedReply {
  const expected = new Set(expectedFields);
  if (Object.keys(parsed).some((key) => expected.has(key))) return { record: parsed };
  const carriesExpected = (candidate: Record<string, unknown>) =>
    Object.keys(candidate).some((key) => expected.has(key) && !isEmptyValue(candidate[key]));

  const singles: Array<{ key: string; inner: Record<string, unknown> }> = [];
  let multiple: UnwrappedReply['multiple'];
  for (const [key, value] of Object.entries(parsed)) {
    if (expected.has(key) || REPLY_META_KEYS.has(key)) continue;
    if (isPlainObject(value)) {
      if (carriesExpected(value)) singles.push({ key, inner: value });
      continue;
    }
    if (!Array.isArray(value)) continue;
    const records = value.filter(isPlainObject).filter(carriesExpected);
    if (records.length === 1 && value.length === 1) singles.push({ key, inner: records[0] });
    else if (records.length > 1) multiple = { key, count: records.length };
  }

  if (singles.length !== 1 || multiple) return { record: parsed, multiple };

  const [{ key, inner }] = singles;
  const record: Record<string, unknown> = { ...parsed };
  delete record[key];
  for (const [field, value] of Object.entries(inner)) {
    if (field === 'exceptions') continue;
    if (isEmptyValue(record[field]) && !isEmptyValue(value)) record[field] = value;
  }
  const exceptions = [...toExceptions(parsed.exceptions), ...toExceptions(inner.exceptions)];
  if (exceptions.length > 0) record.exceptions = exceptions;
  return { record, wrapper: key };
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
  options?: { limit?: number; domain?: 'bbbee' },
): VerificationDocument[];
export function selectSpecsForDocument(
  text: string,
  filename: string,
  options: { limit?: number; domain: ExtractionDomain },
): DomainDocument[];
export function selectSpecsForDocument(
  text: string,
  filename: string,
  options: { limit?: number; domain?: ExtractionDomain } = {},
): DomainDocument[] {
  const haystack = `${filename}\n${text}`.toLowerCase();
  const hits = new Map<string, { doc: DomainDocument; strength: number }>();

  for (const { lower, doc } of extractionDomain(options.domain).aliasIndex()) {
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
  spec: DomainDocument,
  filename: string,
  chunks: Array<{ text: string; index: number }>,
  missing: string[],
  skill: Skill | null = null,
): Promise<Record<string, unknown>> {
  // The sweep thinks harder than the first pass: escalated reasoning effort
  // where the model supports it (completeHard), the plain call where not.
  const completeSweep = model.completeHard?.bind(model) ?? model.complete.bind(model);
  // With a skill, each missing field comes with what it is and how it is
  // printed: "where could this live" is exactly what the sweep asks.
  const notes = skill ? skillFieldNotes(skill, missing) : '';
  const ask = async (chunk: { text: string; index: number }): Promise<Record<string, unknown> | null> => {
    const user = [
      `DOCUMENT TYPE: ${spec.name}`,
      `\nFIELDS STILL NEEDED (return exactly these keys): ${missing.join(', ')}`,
      // Spread, not an empty string: without a skill the prompt stays byte-identical.
      ...(notes ? [`\nWHAT EACH FIELD IS:\n${notes}`] : []),
      chunks.length > 1 ? `\nThis is part ${chunk.index + 1} of ${chunks.length}.` : '',
      `\nDOCUMENT (${filename}):\n${chunk.text}`,
    ].join('\n');

    try {
      const reply = parseModelJson(await completeSweep(SWEEP_SYSTEM_PROMPT, user));
      return reply ? unwrapSingleRecord(reply, missing).record : null;
    } catch (err) {
      logger.warn('Sweep pass failed — leaving fields missing', {
        document: spec.id, file: filename, chunk: chunk.index, reason: (err as Error).message,
      });
      return null;
    }
  };

  const replies = (await boundedAll(chunks, chunkConcurrency(), ask))
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
  spec: DomainDocument,
  input: { filename: string; markdown?: string; raw_text: string },
  options: {
    domain?: ExtractionDomain;
    /** The input is a workbook sheet (see DomainDefinition.skillsReadSheets). */
    sheet?: boolean;
  } = {},
): Promise<DocumentExtraction> {
  const domain = options.domain ?? 'bbbee';
  const definition = extractionDomain(domain);
  const skillsApply = !options.sheet || definition.skillsReadSheets;
  // Markdown preferred: the values live in tables and under headings, and a flat
  // text projection destroys the row/column relationship they depend on.
  const source = input.markdown?.trim() || input.raw_text;

  // The document type's SKILL, when one exists: what the type is, where its
  // values sit, its traps, and a typed field list. It shapes the prompt, the
  // keys asked for and the sweep; without one everything below is exactly as
  // before (byte-identical prompts, the same cache key).
  const skill = skillsApply ? definition.skillFor(spec.id) : null;
  const skillRegistry = skill ? definition.skills() : null;
  const keys = skill ? expectedKeysWithSkill(skill, spec.expectedFields) : spec.expectedFields;
  const rowsField = skill?.rowsField ?? null;

  // Multi-pass extraction is the right amount of work to do ONCE. Adding one
  // document to a pack must not re-read the other 25, and a requote must not
  // re-read documents already paid for. Keyed on content AND prompt, so a
  // corrected matrix prompt invalidates every result it produced.
  const cacheKey = extractionCacheKey({
    content: source,
    documentId: spec.id,
    extractionPrompt: spec.extractionPrompt,
    expectedFields: keys,
    // Logic-version salt: the escalated multi-round sweep changes what a given
    // document yields, so pre-sweep cache entries must not serve for it. A
    // skill-shaped prompt is salted with the whole skill set's hash, so editing
    // any skill (or the global traps) invalidates what the old text produced.
    model: `${model.name}#sweep2${skillRegistry ? `#skills:${skillRegistry.hash.slice(0, 16)}` : ''}`,
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

  const chunkNote = (chunk: { index: number }): string => (chunks.length > 1
    ? `\nNOTE: this is part ${chunk.index + 1} of ${chunks.length} of a long document. `
      + 'Return only fields visible in THIS part; omit the rest. Do not infer from missing context.'
    : '');
  const skillText = skill ? skillPromptSections(skill, skillRegistry?.global ?? null).text : '';
  const promptFor = (chunk: { text: string; index: number }): string => (skill
    ? [
        `ANALYST INSTRUCTION:\n${spec.extractionPrompt}`,
        // The skill's worked example replaces the matrix's example data: it
        // shows the exact shape (flat keys, rows under one array) asked for.
        `\n${skillText}`,
        '\nWhere the analyst instruction and the skill name a field or a shape differently, follow the skill\'s FIELDS TO RETURN.',
        `\nEXPECTED JSON KEYS: ${keys.join(', ')}`,
        chunkNote(chunk),
        `\nDOCUMENT (${input.filename}):\n${chunk.text}`,
      ].join('\n')
    : [
        `ANALYST INSTRUCTION:\n${spec.extractionPrompt}`,
        `\nEXPECTED JSON KEYS: ${spec.expectedFields.join(', ')}`,
        `\nWHAT CORRECT DATA LOOKS LIKE (for reference only, do not copy):\n${spec.exampleData}`,
        chunkNote(chunk),
        `\nDOCUMENT (${input.filename}):\n${chunk.text}`,
      ].join('\n'));

  // Chunks are read in parallel (PARSER_CHUNK_CONCURRENCY at a time; all at
  // once when unset): they are independent, and a long document should not
  // cost N sequential round trips.
  const replies = await boundedAll(chunks, chunkConcurrency(), async (chunk) => {
    try {
      return { ok: true as const, reply: await model.complete(systemPromptFor(domain, skill), promptFor(chunk)) };
    } catch (err) {
      logger.error('Extraction model call failed', err as Error, {
        document: spec.id, file: input.filename, chunk: chunk.index,
      });
      return { ok: false as const, error: (err as Error).message };
    }
  });

  const successes = replies.filter((r) => r.ok);
  if (successes.length === 0) {
    const firstError = replies.find((r) => !r.ok);
    return {
      ...base,
      error: firstError && !firstError.ok ? firstError.error : 'All extraction calls failed',
      missingFields: [...keys],
    };
  }

  // A register spec's rows are hoisted by the GRID PASS below; every other spec
  // reads one record, which a model may still answer inside a wrapper.
  const grid = extractionDomain(domain).gridForDocument(spec.id);
  const wrapperExceptions: string[] = [];
  const parsedChunks = successes
    .map((r) => (r.ok ? parseModelJson(r.reply) : null))
    .filter((p): p is Record<string, unknown> => p !== null)
    .map((reply) => {
      if (grid) return reply;
      const { record, wrapper, multiple } = unwrapSingleRecord(reply, keys);
      if (wrapper) {
        logger.info('Read a single record from inside a wrapper', { document: spec.id, file: input.filename, wrapper });
      }
      if (multiple) {
        wrapperExceptions.push(
          `The reply held ${multiple.count} records under "${multiple.key}"; this document type reads one record, so none was chosen`,
        );
      }
      return record;
    });

  if (parsedChunks.length === 0) {
    return { ...base, error: 'Model reply was not JSON', missingFields: [...keys] };
  }

  // First non-empty wins: chunks overlap, and a document states its headline
  // facts before its annexures, so a later part may FILL a field but never
  // overwrite one found earlier.
  const { merged } = mergeChunkResults(parsedChunks);
  const parsed = merged;

  // The model's own escape hatch: this file is not the document we asked about.
  // Treated as "nothing found here", never as a failure.
  if (parsed.not_this_document === true) return base;

  // A skill's contract answers a wrong document with nulls and a reason. A reply
  // that gives the reason ("Document is a beneficial interest register, not a
  // CIPC COR14.1") but returns values anyway read ANOTHER document under this
  // type's field names: none of them is kept.
  if (skill) {
    const statement = wrongTypeStatement(toExceptions(parsed.exceptions), spec, skill.id);
    if (statement) {
      logger.info('A skill read said the document is another type; its values were not kept', { document: spec.id, file: input.filename });
      return { ...base, exceptions: [`${statement} (read as ${spec.name}: none of its values were kept)`] };
    }
  }

  // ── GRID PASS ───────────────────────────────────────────────────────────
  // Some specs describe a REGISTER, not a record: the fleet list, the EEA2
  // occupational-level matrix, the King application register, the risk register.
  // Their prompt asks for an array of rows PLUS the register's own totals in one
  // reply, so the row columns are never top-level keys. Without this the pipeline
  // would report all eighteen fleet columns "missing", sweep the model twice
  // looking for them, and then discard the 134 vehicles as an unexpected key.
  //
  // The rows become ONE array-valued field — the same convention the B-BBEE side
  // already uses for `shareholder_rows` / `supplier_rows` — which the calculator
  // mapping expands into N rows. `gridForDocument` returns null for every B-BBEE
  // spec, so nothing below this comment changes for that domain.
  const hoisted = grid ? hoistGridRowsFrom(parsed, grid) : { rows: [], key: null };
  const gridRows = hoisted.rows;
  // Row columns stop counting as document-level fields once the rows are in
  // hand — except where the same name is legitimately BOTH a row column and a
  // register total (waste per stream and per site), where both are read.
  // The rows themselves are stored ONCE, by the grid push below: a skill adds
  // its rows field to the keys, and for most ESG registers that name IS the
  // grid's rows field, so the same array would otherwise be stored as a field
  // and again as the grid (every register row twice in the workbook, every
  // fuel fill counted twice in its month).
  const scalarFields = grid && gridRows.length > 0
    ? keys.filter((field) => field !== grid.rowsField
      && field !== hoisted.key
      && !(grid.suppressRowScalars && grid.rowFields.includes(field)))
    : keys;
  if (grid && gridRows.length > 0) {
    logger.info('Extracted a register grid', {
      document: spec.id, file: input.filename, field: grid.rowsField, rows: gridRows.length,
    });
  }

  // ── SWEEP PASS ──────────────────────────────────────────────────────────
  // A single pass reads a whole prompt's worth of fields at once and reliably
  // overlooks some — particularly values sitting in tables, footers or under
  // wording the prompt did not anticipate. Asking again, naming ONLY what is
  // still missing, recovers those: a short, specific question is a far easier
  // one to answer than the original omnibus instruction.
  //
  // Bounded to one extra round trip per document, and skipped entirely when the
  // first pass found everything (the common case for clean documents).
  const foundSomething = scalarFields.some((field) => !isEmptyValue(parsed[field]))
    || gridRows.length > 0;
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
      const stillMissing = requiredFirst(skill, scalarFields.filter((field) => field !== rowsField && isEmptyValue(parsed[field])));
      if (stillMissing.length === 0) break;
      const swept = await sweepForMissingFields(model, spec, input.filename, chunks, stillMissing, skill);
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
  for (const field of scalarFields) {
    const value = parsed[field];
    if (isEmptyValue(value)) {
      missingFields.push(field);
      continue;
    }
    values.push({ field, value, sourceFile: input.filename, sourceDocumentId: spec.id });
  }
  if (grid && gridRows.length > 0) {
    values.push({
      field: grid.rowsField,
      value: gridRows,
      sourceFile: input.filename,
      sourceDocumentId: spec.id,
    });
  } else if (grid && !missingFields.includes(grid.rowsField) && !values.some((v) => v.field === grid.rowsField)) {
    // A register that yielded no rows says so, rather than reporting each column
    // absent as if the client had left them blank (once, even when a skill
    // also asked for the rows field by name).
    missingFields.push(grid.rowsField);
  }

  const known = new Set([
    ...keys,
    ...(grid ? [...grid.containerKeys, ...grid.rowFields] : []),
    'exceptions',
    'not_this_document',
  ]);
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
    exceptions: [
      ...toExceptions(parsed.exceptions),
      ...wrapperExceptions,
      ...groundingExceptions,
      ...checksumExceptions,
    ],
  };

  if (cachingEnabled()) getExtractionCache().set(cacheKey, result);
  return result;
}

/** A workbook sheet's input name: "Book.xlsx › Sheet" (the workbook split's convention). */
export function isSheetName(filename: string): boolean {
  return /\S\s›\s\S/.test(filename ?? '');
}

/**
 * Extract everything this file has to offer, across every document type whose
 * evidence appears in it.
 */
export async function extractDocument(
  model: ExtractionModel,
  input: { filename: string; markdown?: string; raw_text: string; elementHint?: string },
  options: {
    specIds?: string[];
    limit?: number;
    elementOverride?: RoutableElement;
    /** Which matrix to extract against. Defaults to the B-BBEE matrix. */
    domain?: ExtractionDomain;
  } = {},
): Promise<DocumentExtraction[]> {
  const domain = options.domain ?? 'bbbee';
  const definition = extractionDomain(domain);
  // Prefer markdown for RETRIEVAL too: a sheet's column headers ("Beneficiary",
  // "% Black participation") are the terms that discriminate its element, and
  // they live in the markdown table, not the flat text projection.
  const retrievalText = input.markdown?.trim() || input.raw_text;
  const specs = options.specIds
    ? options.specIds.map((id) => definition.findDocumentById(id)).filter((doc): doc is DomainDocument => doc !== null)
    : rankSpecsForDocument(retrievalText, input.filename, {
        limit: options.limit, // retrieval picks a smart default: 3 with a hint, 5 without
        elementHint: input.elementHint,
        elementOverride: options.elementOverride, // Pass A classification, when confident
        domain,
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
  // A workbook sheet arrives with its sheet name as the hint and its name as
  // "Book.xlsx › Sheet": it is not the standalone document a B-BBEE skill describes.
  const sheet = Boolean(input.elementHint) || isSheetName(input.filename);
  for (const spec of specs) {
    results.push(await extractWithSpec(model, spec, input, { domain, sheet }));
  }

  // Retrieval now offers CANDIDATES (BM25 surfaces weak matches); the model is
  // the gate. A spec it tried but got nothing from is not evidence — returning
  // it as an empty extraction would clutter the case and misreport a lunch
  // receipt as N documents-we-found-nothing-in. Keep only extractions that
  // produced values, or that errored (a failure the caller must see).
  return results.filter((r) => r.values.length > 0 || Boolean(r.error));
}
