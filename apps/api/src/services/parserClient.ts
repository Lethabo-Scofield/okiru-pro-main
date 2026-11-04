import { createLogger } from '../logger.js';

const logger = createLogger('ParserClient');

/**
 * Thin HTTP client for the standalone okiru-ai-parser service.
 *
 * The parser is deployed as its own service (default port 3200) and is called
 * over HTTP — it is intentionally NOT imported in-process so the two keep
 * separate ontologies/graphs and lifecycles. All failures are non-fatal: the
 * caller decides what to do when the parser is unavailable.
 */

export interface ParserRawExtractionInput {
  file_id: string;
  filename: string;
  mime_type: string;
  raw_text: string;
  tables?: unknown[];
  metadata?: Record<string, unknown>;
}

export interface ParserResult {
  file_id: string;
  filename: string;
  document_type: string;
  pillar: string;
  overall_confidence: number;
  status: 'passed' | 'review_required' | 'failed';
  extracted_fields: Record<string, unknown>;
  calculator_payload: Record<string, unknown>;
  validation: {
    passed: boolean;
    warnings: string[];
    errors: string[];
    missing_fields: string[];
  };
  audit_trail: Record<string, unknown>;
  /**
   * A full paid read's signed run record (rule layer + model and agent values),
   * verified by the caller before it is stored. Null when the parser cannot
   * sign; absent from a rule-only read.
   */
  run_attestation?: { filename: string; payload: string; signature: string } | null;
  ai_value_count?: number;
}

/**
 * How long a single-file read may take. A full read (rules, model, agent) of a
 * scanned pack runs for minutes; this stays under the 600s idle limit of the
 * ingress and the web proxy in front of /reread, so the api answers before
 * either drops the browser's connection. PARSER_FILE_TIMEOUT_MS overrides it.
 */
export const DEFAULT_FILE_TIMEOUT_MS = 540_000;

function fileTimeoutMs(): number {
  const configured = Number(process.env.PARSER_FILE_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_FILE_TIMEOUT_MS;
}

export function parserServiceUrl(): string {
  return (process.env.PARSER_SERVICE_URL || 'http://127.0.0.1:3200').replace(/\/+$/, '');
}

export function isParserConfigured(): boolean {
  return Boolean(process.env.PARSER_SERVICE_URL) || process.env.NODE_ENV !== 'production';
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export interface ParserResolveOutcome {
  ok: boolean;
  result?: ParserResult;
  error?: string;
}

/** Calls POST /api/parser/resolve. Never throws — returns a typed outcome. */
export async function resolveWithParser(
  input: ParserRawExtractionInput,
  options: { timeoutMs?: number } = {},
): Promise<ParserResolveOutcome> {
  const url = `${parserServiceUrl()}/api/parser/resolve`;
  const timeoutMs = options.timeoutMs ?? (Number(process.env.PARSER_TIMEOUT_MS) || 30_000);
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tables: [],
          metadata: {},
          ...input,
        }),
      },
      timeoutMs,
    );

    const body = await res.text();
    let parsed: unknown = null;
    try { parsed = body ? JSON.parse(body) : null; } catch { /* non-JSON */ }

    // The parser returns 200 for passed/review_required and 422 for failed —
    // both carry a valid ParserResult body we want to keep.
    if ((res.ok || res.status === 422) && parsed && typeof parsed === 'object' && 'status' in parsed) {
      return { ok: true, result: parsed as ParserResult };
    }
    return { ok: false, error: `Parser responded ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('Parser service call failed', { url, error: message });
    return { ok: false, error: message };
  }
}

/**
 * Calls POST /api/parser/resolve-file with the raw bytes. Never throws.
 *
 * The text-based `resolveWithParser` above needs the caller to have already
 * turned a file into text, which the library cannot do — it stores the original
 * bytes and nothing else. Sending the file itself lets the parser run its own
 * extraction chain (text layer → Document Intelligence → OCR), which is the
 * whole point of re-parsing: the second attempt should be able to succeed where
 * the first failed, and it cannot if it re-uses the first attempt's text.
 */
export async function resolveFileWithParser(
  file: { buffer: Buffer; filename: string; mimeType: string },
  options: { timeoutMs?: number } = {},
): Promise<ParserResolveOutcome> {
  const url = `${parserServiceUrl()}/api/parser/resolve-file`;
  // Re-extraction can involve OCR on a scanned pack, so this is deliberately
  // far more generous than the text path's 30s.
  const timeoutMs = options.timeoutMs ?? fileTimeoutMs();
  try {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimeType || 'application/octet-stream' }),
      file.filename,
    );

    const res = await fetchWithTimeout(url, { method: 'POST', body: form }, timeoutMs);
    const body = await res.text();
    let parsed: unknown = null;
    try { parsed = body ? JSON.parse(body) : null; } catch { /* non-JSON */ }

    // 200 for passed/review_required, 422 for failed — both carry a result.
    if ((res.ok || res.status === 422) && parsed && typeof parsed === 'object' && 'status' in parsed) {
      return { ok: true, result: parsed as ParserResult };
    }
    const detail = parsed && typeof parsed === 'object' && 'error' in parsed
      ? String((parsed as { error?: { message?: string } }).error?.message ?? '')
      : '';
    return { ok: false, error: detail || `Parser responded ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('Parser file resolve failed', { url, error: message });
    return { ok: false, error: message };
  }
}

function parserError(parsed: unknown): { code?: string; message?: string } {
  const error = parsed && typeof parsed === 'object' ? (parsed as { error?: { code?: unknown; message?: unknown } }).error : undefined;
  return { code: error?.code ? String(error.code) : undefined, message: error?.message ? String(error.message) : undefined };
}

function fileForm(file: { buffer: Buffer; filename: string; mimeType: string }, field: string): FormData {
  const form = new FormData();
  form.append(field, new Blob([new Uint8Array(file.buffer)], { type: file.mimeType || 'application/octet-stream' }), file.filename);
  return form;
}

export interface ParserQuoteOutcome {
  ok: boolean;
  quoteId?: string;
  status?: number;
  error?: string;
}

/**
 * Price ONE stored or replacement file — POST /api/parser/quote-files, the
 * same free structure scan the upload flow uses. The quote is bound to these
 * exact bytes (sha256 + size), so the paid read that follows must send them
 * unchanged.
 */
export async function quoteFileWithParser(
  file: { buffer: Buffer; filename: string; mimeType: string },
  options: { timeoutMs?: number } = {},
): Promise<ParserQuoteOutcome> {
  const url = `${parserServiceUrl()}/api/parser/quote-files`;
  try {
    const res = await fetchWithTimeout(url, { method: 'POST', body: fileForm(file, 'files') }, options.timeoutMs ?? 60_000);
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    const data = (parsed && typeof parsed === 'object' && 'data' in parsed ? (parsed as { data?: unknown }).data : parsed) as { quoteId?: unknown } | null;
    if (res.ok && data?.quoteId) return { ok: true, quoteId: String(data.quoteId) };
    return { ok: false, status: res.status, error: parserError(parsed).message || `Parser responded ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('Parser quote failed', { url, error: message });
    return { ok: false, error: message };
  }
}

export interface ParserPaidReadOutcome extends ParserResolveOutcome {
  /** The parser's HTTP status when it refused (402 unpaid, 409 voided/used, 410 expired). */
  status?: number;
  /** The parser's error code — QUOTE_VOIDED, QUOTE_ALREADY_USED, QUOTE_FILE_MISMATCH … */
  code?: string;
}

/**
 * Read ONE file against a paid quote — POST /api/parser/resolve-file-paid.
 * The parser checks the quote is paid and these are the quoted bytes, claims
 * it (once), reads, and records what the read delivered, so a read that
 * produced nothing is refunded by the same settlement every paid run gets.
 *
 * `full` asks for the whole per-document read — rules, model, agent — through
 * the reader for `domain`, returned with the signed run record. Without it the
 * parser reads the rule layer only, as it always did.
 */
export async function resolvePaidFileWithParser(
  file: { buffer: Buffer; filename: string; mimeType: string },
  quoteId: string,
  options: { timeoutMs?: number; domain?: 'bbbee' | 'esg'; full?: boolean } = {},
): Promise<ParserPaidReadOutcome> {
  const url = `${parserServiceUrl()}/api/parser/resolve-file-paid`;
  const timeoutMs = options.timeoutMs ?? fileTimeoutMs();
  try {
    const form = fileForm(file, 'file');
    form.append('quote_id', quoteId);
    if (options.full) form.append('read', 'full');
    if (options.domain) form.append('domain', options.domain);
    const res = await fetchWithTimeout(url, { method: 'POST', body: form }, timeoutMs);
    const text = await res.text();
    let parsed: unknown = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* non-JSON */ }
    if ((res.ok || res.status === 422) && parsed && typeof parsed === 'object' && 'status' in parsed) {
      return { ok: true, result: parsed as ParserResult };
    }
    const { code, message } = parserError(parsed);
    return { ok: false, status: res.status, code, error: message || `Parser responded ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('Parser paid read failed', { url, error: message });
    return { ok: false, error: message };
  }
}

export interface ParserSupplierRow {
  supplier_name: string | null;
  spend_amount: number | null;
  bee_level: number | null;
  black_ownership: number | null;
  black_women_ownership: number | null;
  enterprise_type: 'eme' | 'qse' | 'generic' | null;
  calculator_fields: Record<string, unknown>;
  status: 'passed' | 'review_required';
  issues: string[];
  source_file: string;
}

export interface ParserCaseResult {
  case_id: string;
  status: 'passed' | 'review_required' | 'failed';
  documents_detected: Array<Record<string, unknown>>;
  calculator_payload: Record<string, unknown>;
  supplier_rows: ParserSupplierRow[];
  /** Total Measured Procurement Spend (procurement denominator), or null. */
  measured_procurement_spend: number | null;
  missing_required_documents: string[];
  documents_needing_review: Array<Record<string, unknown>>;
  audit_trail: Record<string, unknown>;
}

export interface ParserCaseOutcome {
  ok: boolean;
  result?: ParserCaseResult;
  error?: string;
}

/**
 * Calls POST /api/parser/resolve-case for a bundle of documents (e.g. all the
 * documents uploaded for one scorecard). Never throws.
 */
export async function resolveCaseWithParser(
  documents: ParserRawExtractionInput[],
  caseId?: string,
  options: { timeoutMs?: number } = {},
): Promise<ParserCaseOutcome> {
  const url = `${parserServiceUrl()}/api/parser/resolve-case`;
  const timeoutMs = options.timeoutMs ?? (Number(process.env.PARSER_TIMEOUT_MS) || 30_000);
  try {
    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          case_id: caseId,
          documents: documents.map((d) => ({ tables: [], metadata: {}, ...d })),
        }),
      },
      timeoutMs,
    );
    const body = await res.text();
    let parsed: unknown = null;
    try { parsed = body ? JSON.parse(body) : null; } catch { /* non-JSON */ }
    if ((res.ok || res.status === 422) && parsed && typeof parsed === 'object' && 'status' in parsed) {
      return { ok: true, result: parsed as ParserCaseResult };
    }
    return { ok: false, error: `Parser responded ${res.status}` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('Parser case call failed', { url, error: message });
    return { ok: false, error: message };
  }
}

/** Liveness probe for readiness reporting. */
export async function parserHealth(): Promise<{ reachable: boolean; detail?: unknown }> {
  try {
    const res = await fetchWithTimeout(`${parserServiceUrl()}/ready`, { method: 'GET' }, 5_000);
    if (!res.ok) return { reachable: false };
    return { reachable: true, detail: await res.json().catch(() => undefined) };
  } catch {
    return { reachable: false };
  }
}
