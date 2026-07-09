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
