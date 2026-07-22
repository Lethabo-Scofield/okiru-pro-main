/**
 * Azure Document Intelligence — how scanned documents become readable.
 *
 * WHY: measured on the real Thandanani pack, five PDFs returned zero text from
 * the PDF text layer — including the Share Certificate and Share Register, which
 * are the entire basis of a 25-point Ownership score. They are page images. The
 * bundled tesseract.js path errored on them outright.
 *
 * Document Intelligence reads scans AND returns table structure, which the
 * regex extractor cannot recover from flattened text (a supplier schedule is a
 * table; prose patterns like `Supplier Name: X` never match a spreadsheet row).
 *
 * DESIGN
 *  - Returns markdown. The layout model emits headings, tables and reading
 *    order, which is exactly what the AI extraction prompts consume.
 *  - Returns null on every failure path. Callers fall back to the existing text
 *    layer, so a Document Intelligence outage degrades quality without taking
 *    uploads down.
 *  - Unconfigured is not an error: no endpoint/key means the feature is simply
 *    off (local dev, tests).
 */
import { createLogger } from '../logger.js';

const logger = createLogger('DocumentIntelligence');

/** The layout model gives headings + tables; `read` would give text only. */
const MODEL_ID = 'prebuilt-layout';
const API_VERSION = '2024-11-30';

/** Analysis is async: poll until the operation completes. */
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 180_000;

export interface DocumentIntelligenceTable {
  rowCount: number;
  columnCount: number;
  /** Row-major cell text, [row][column]. */
  cells: string[][];
}

export interface DocumentIntelligenceResult {
  /** Layout-preserving markdown, including tables. */
  markdown: string;
  /** Plain reading-order text. */
  text: string;
  tables: DocumentIntelligenceTable[];
  pageCount: number;
}

export function documentIntelligenceConfigured(): boolean {
  return Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Rebuild a table from the flat cell list Document Intelligence returns. */
function toTable(raw: {
  rowCount?: number;
  columnCount?: number;
  cells?: Array<{ rowIndex?: number; columnIndex?: number; content?: string }>;
}): DocumentIntelligenceTable {
  const rowCount = raw.rowCount ?? 0;
  const columnCount = raw.columnCount ?? 0;
  const cells: string[][] = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => ''));

  for (const cell of raw.cells ?? []) {
    const row = cell.rowIndex ?? 0;
    const column = cell.columnIndex ?? 0;
    if (row < rowCount && column < columnCount) {
      cells[row][column] = (cell.content ?? '').replace(/\s+/g, ' ').trim();
    }
  }
  return { rowCount, columnCount, cells };
}

/** Render a table as markdown so the extraction prompts see real columns. */
function tableToMarkdown(table: DocumentIntelligenceTable): string {
  if (table.cells.length === 0) return '';
  const [header, ...body] = table.cells;
  const lines = [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.join(' | ')} |`),
  ];
  return lines.join('\n');
}

/**
 * Analyse a document. Returns null when unconfigured or on any failure — the
 * caller keeps whatever the local extractor produced.
 */
export async function analyseWithDocumentIntelligence(
  buffer: Buffer,
  contentType: string,
  filename: string,
): Promise<DocumentIntelligenceResult | null> {
  if (!documentIntelligenceConfigured()) return null;

  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT!.replace(/\/+$/, '');
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY!;
  const url = `${endpoint}/documentintelligence/documentModels/${MODEL_ID}:analyze`
    + `?api-version=${API_VERSION}&outputContentFormat=markdown`;

  try {
    const started = await fetch(url, {
      method: 'POST',
      headers: { 'Ocp-Apim-Subscription-Key': key, 'Content-Type': contentType },
      body: new Uint8Array(buffer),
    });

    if (!started.ok) {
      logger.warn('Document Intelligence rejected the analyse request', {
        filename,
        status: started.status,
        detail: (await started.text().catch(() => '')).slice(0, 200),
      });
      return null;
    }

    const operationUrl = started.headers.get('operation-location');
    if (!operationUrl) {
      logger.warn('Document Intelligence returned no operation-location', { filename });
      return null;
    }

    const deadline = Date.now() + MAX_POLL_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const polled = await fetch(operationUrl, { headers: { 'Ocp-Apim-Subscription-Key': key } });
      if (!polled.ok) {
        logger.warn('Document Intelligence poll failed', { filename, status: polled.status });
        return null;
      }

      const body = await polled.json() as {
        status?: string;
        analyzeResult?: {
          content?: string;
          pages?: unknown[];
          tables?: Array<Parameters<typeof toTable>[0]>;
        };
      };

      if (body.status === 'running' || body.status === 'notStarted') continue;
      if (body.status !== 'succeeded') {
        logger.warn('Document Intelligence analysis did not succeed', { filename, status: body.status });
        return null;
      }

      const content = body.analyzeResult?.content ?? '';
      const tables = (body.analyzeResult?.tables ?? []).map(toTable);
      const tableMarkdown = tables.map(tableToMarkdown).filter(Boolean).join('\n\n');

      // `content` is already markdown (outputContentFormat=markdown). Tables are
      // appended explicitly so a flattened rendering never loses the grid.
      const markdown = tableMarkdown && !content.includes('|')
        ? `${content}\n\n${tableMarkdown}`
        : content;

      logger.info('Document Intelligence analysis complete', {
        filename,
        pages: body.analyzeResult?.pages?.length ?? 0,
        tables: tables.length,
        characters: markdown.length,
      });

      return {
        markdown,
        text: content,
        tables,
        pageCount: body.analyzeResult?.pages?.length ?? 0,
      };
    }

    logger.warn('Document Intelligence analysis timed out', { filename, maxPollMs: MAX_POLL_MS });
    return null;
  } catch (err) {
    logger.error('Document Intelligence call failed', err as Error);
    return null;
  }
}
