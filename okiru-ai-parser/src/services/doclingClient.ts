import { createLogger } from '../logger.js';

/**
 * Client for the optional Docling conversion sidecar (services/docling/app.py).
 *
 * Docling does layout-aware conversion with real table-structure recovery, which
 * the built-in text-layer converters cannot do. It is strictly an ENHANCEMENT:
 * this client returns `null` on any failure — disabled, unreachable, timeout, bad
 * response — and every caller falls back to the built-in converters. A sidecar
 * outage degrades markdown quality; it never breaks extraction.
 *
 * Enable by setting DOCLING_URL (e.g. http://localhost:3400). Unset = disabled.
 */

const logger = createLogger('DoclingClient');

const DOCLING_URL = process.env.DOCLING_URL?.replace(/\/$/, '') ?? '';
const DOCLING_TIMEOUT_MS = Number(process.env.DOCLING_TIMEOUT_MS) > 0
  ? Number(process.env.DOCLING_TIMEOUT_MS)
  : 120_000;

/** Formats Docling handles better than the built-in text-layer converters. */
const DOCLING_EXTENSIONS = new Set(['.pdf', '.docx', '.pptx', '.xlsx', '.png', '.jpg', '.jpeg', '.tiff']);

export interface DoclingTable {
  index: number;
  columns?: string[];
  rows?: Array<Record<string, string>>;
  markdown?: string;
}

export interface DoclingResult {
  markdown: string;
  tables: DoclingTable[];
  pages: number;
  engine: string;
  duration_ms: number;
}

export function isDoclingEnabled(): boolean {
  return DOCLING_URL.length > 0;
}

export function doclingHandlesExtension(ext: string): boolean {
  return DOCLING_EXTENSIONS.has(ext.toLowerCase());
}

/**
 * Convert a document via the sidecar. Returns null whenever Docling cannot be
 * used, so the caller keeps its existing behaviour.
 */
export async function convertWithDocling(
  buffer: Buffer,
  filename: string,
  mimetype: string,
): Promise<DoclingResult | null> {
  if (!isDoclingEnabled()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOCLING_TIMEOUT_MS);

  try {
    const form = new FormData();
    // Uint8Array view keeps the exact bytes; Blob is the standard multipart part.
    const blob = new Blob([new Uint8Array(buffer)], { type: mimetype || 'application/octet-stream' });
    form.append('file', blob, filename);

    const response = await fetch(`${DOCLING_URL}/convert`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      logger.warn('Docling conversion returned non-OK; falling back', {
        filename,
        status: response.status,
      });
      return null;
    }

    const result = (await response.json()) as DoclingResult;
    if (!result || typeof result.markdown !== 'string' || !result.markdown.trim()) {
      logger.warn('Docling returned empty markdown; falling back', { filename });
      return null;
    }

    logger.info('Docling conversion succeeded', {
      filename,
      chars: result.markdown.length,
      tables: result.tables?.length ?? 0,
      durationMs: result.duration_ms,
    });
    return { ...result, tables: result.tables ?? [] };
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    logger.warn(aborted ? 'Docling conversion timed out; falling back' : 'Docling conversion failed; falling back', {
      filename,
      error: String(error),
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
