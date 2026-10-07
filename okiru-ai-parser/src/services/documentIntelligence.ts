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
 *  - Evaluation runs can keep the RAW response on disk (PARSER_DI_CACHE_DIR,
 *    opt-in, never set in production). The raw analyzeResult is kept, not the
 *    text built from it, so a change to how text and tables are built from a
 *    scan is re-applied to every cached document instead of being hidden by it.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createLogger } from '../logger.js';
import { gridHeader, tableCellKind, type TableCell, type TableGrid } from '../../schemas/table_grid.js';

const logger = createLogger('DocumentIntelligence');

/** The layout model gives headings + tables; `read` would give text only. */
const MODEL_ID = 'prebuilt-layout';
const API_VERSION = '2024-11-30';

/** Analysis is async: poll until the operation completes. */
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_MS = 180_000;

export interface DocumentIntelligenceResult {
  /** Layout-preserving markdown; tables are pipe tables in their reading position. */
  markdown: string;
  /**
   * Plain reading-order text, never HTML: a two-column table with no header
   * reads as `label: value` lines, any other table as `a | b | c` lines
   * (header first). This is what the regex extractor and the classifier read.
   */
  text: string;
  /** Every table as a cell grid (the contract in schemas/table_grid.ts). */
  tables: TableGrid[];
  pageCount: number;
}

export function documentIntelligenceConfigured(): boolean {
  return Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY);
}

/**
 * Is the raw-response cache on? Only evaluation tooling sets it: a replay run
 * has no credentials, and still has to read a scan exactly as the recorded run
 * did, so a cached answer is served even when the service is unconfigured.
 */
export function documentIntelligenceCacheEnabled(): boolean {
  return Boolean(process.env.PARSER_DI_CACHE_DIR);
}

/** One file per (content, model, API version): a different model reads differently. */
function cacheFileFor(buffer: Buffer): string | null {
  const dir = process.env.PARSER_DI_CACHE_DIR;
  if (!dir) return null;
  const sha = createHash('sha256').update(buffer).digest('hex');
  return join(dir, `${sha}.${MODEL_ID}.${API_VERSION}.json`);
}

type RawRegion = { pageNumber?: number };

type RawCell = {
  rowIndex?: number;
  columnIndex?: number;
  rowSpan?: number;
  columnSpan?: number;
  kind?: string;
  content?: string;
  boundingRegions?: RawRegion[];
};

type RawTable = {
  rowCount?: number;
  columnCount?: number;
  cells?: RawCell[];
  boundingRegions?: RawRegion[];
  /** Where the table sits in `content` (offset/length). */
  spans?: Array<{ offset?: number; length?: number }>;
};

type RawAnalyzeResult = {
  content?: string;
  pages?: unknown[];
  tables?: RawTable[];
};

function readCachedAnalysis(file: string, filename: string): RawAnalyzeResult | null {
  if (!existsSync(file)) return null;
  try {
    const kept = JSON.parse(readFileSync(file, 'utf8')) as { analyzeResult?: RawAnalyzeResult };
    return kept.analyzeResult ?? null;
  } catch (err) {
    logger.warn('Cached Document Intelligence response is unreadable; ignoring it', {
      filename,
      error: (err as Error).message,
    });
    return null;
  }
}

function keepAnalysis(file: string, analyzeResult: RawAnalyzeResult, filename: string): void {
  try {
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, JSON.stringify({ modelId: MODEL_ID, apiVersion: API_VERSION, analyzeResult }));
  } catch (err) {
    // A cache that cannot be written costs a repeat call, never the reading.
    logger.warn('Could not keep the Document Intelligence response', { filename, error: (err as Error).message });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function cellText(raw: string | undefined): string {
  return decodeEntities(raw ?? '').replace(/\s+/g, ' ').trim();
}

function positiveInt(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

/**
 * Rebuild a table from the flat cell list Document Intelligence returns,
 * keeping what a reader needs to use it as a table: each cell's kind
 * (columnHeader / rowHeader / content…), its span and its page.
 */
function toTable(raw: RawTable, index: number): TableGrid {
  const rowCount = raw.rowCount ?? 0;
  const columnCount = raw.columnCount ?? 0;
  const tablePage = raw.boundingRegions?.[0]?.pageNumber ?? null;
  const rows: string[][] = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => ''));
  const cells: TableCell[] = [];

  for (const cell of raw.cells ?? []) {
    const rowIndex = cell.rowIndex ?? 0;
    const columnIndex = cell.columnIndex ?? 0;
    if (rowIndex >= rowCount || columnIndex >= columnCount) continue;
    const content = cellText(cell.content);
    rows[rowIndex][columnIndex] = content;
    cells.push({
      page: cell.boundingRegions?.[0]?.pageNumber ?? tablePage,
      rowIndex,
      columnIndex,
      rowSpan: positiveInt(cell.rowSpan, 1),
      columnSpan: positiveInt(cell.columnSpan, 1),
      kind: tableCellKind(cell.kind),
      content,
    });
  }
  return { sheetName: `Table ${index + 1}`, page: tablePage, rows, cells };
}

/** A row's cells without the empty ones trailing it (keeps leading alignment). */
function trimTrailingEmpty(row: string[]): string[] {
  let end = row.length;
  while (end > 0 && !row[end - 1]) end -= 1;
  return row.slice(0, end);
}

/**
 * The plain-text reading of a table. A two-column table with no header row is
 * a form ("Registration number | 2006/037260/23"), and reads as
 * `label: value`, which is how the same fact is written in prose. Any other
 * table reads as one pipe line per row, header first, so neighbouring cells
 * stay visibly separate rather than running into each other.
 */
export function tableToText(grid: TableGrid): string {
  const width = grid.rows[0]?.length ?? 0;
  const header = gridHeader(grid);

  if (!header.tagged && width === 2) {
    return grid.rows
      .map(([label, value]) => {
        const name = (label ?? '').replace(/[\s:]+$/, '');
        if (name && value) return `${name}: ${value}`;
        return name || value || '';
      })
      .filter(Boolean)
      .join('\n');
  }

  const lines: string[] = [];
  const headerRows = new Set(header.tagged ? header.headerRows : []);
  if (header.tagged) {
    const labels = trimTrailingEmpty(header.labels);
    if (labels.some(Boolean)) lines.push(labels.join(' | '));
  }
  grid.rows.forEach((row, r) => {
    if (headerRows.has(r)) return;
    const cells = trimTrailingEmpty(row);
    if (cells.some(Boolean)) lines.push(cells.join(' | '));
  });
  return lines.join('\n');
}

function escapePipe(text: string): string {
  return text.replace(/\|/g, '\\|');
}

/** Render a table as a markdown pipe table so the extraction prompts see real columns. */
export function tableToMarkdown(grid: TableGrid): string {
  if (grid.rows.length === 0 || (grid.rows[0]?.length ?? 0) === 0) return '';
  const header = gridHeader(grid);
  const skip = new Set(header.headerRows);
  const body = grid.rows.filter((row, r) => !skip.has(r) && row.some(Boolean));
  return [
    `| ${header.labels.map(escapePipe).join(' | ')} |`,
    `| ${header.labels.map(() => '---').join(' | ')} |`,
    ...body.map((row) => `| ${row.map(escapePipe).join(' | ')} |`),
  ].join('\n');
}

/**
 * Last resort for an HTML table in `content` that no structured table claims
 * (never seen in practice; kept so a mismatch can never leak `<td>` into the
 * text). `th` is taken as a column header; colspan is honoured, rowspan is not.
 */
function gridFromHtmlTable(html: string): TableGrid {
  const parsed: Array<Array<{ text: string; header: boolean; span: number }>> = [
    ...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi),
  ].map(([, rowHtml]) => [...rowHtml.matchAll(/<(t[hd])\b([^>]*)>([\s\S]*?)<\/t[hd]>/gi)].map(([, tag, attrs, inner]) => ({
    text: cellText(inner.replace(/<[^>]+>/g, ' ')),
    header: tag.toLowerCase() === 'th',
    span: positiveInt(Number(/colspan="?(\d+)/i.exec(attrs)?.[1]), 1),
  })));

  const width = parsed.reduce((w, row) => Math.max(w, row.reduce((n, c) => n + c.span, 0)), 0);
  const rows = parsed.map(() => Array.from({ length: width }, () => ''));
  const cells: TableCell[] = [];
  parsed.forEach((row, r) => {
    let column = 0;
    for (const cell of row) {
      rows[r][column] = cell.text;
      cells.push({
        page: null,
        rowIndex: r,
        columnIndex: column,
        rowSpan: 1,
        columnSpan: cell.span,
        kind: cell.header ? 'columnHeader' : 'content',
        content: cell.text,
      });
      column += cell.span;
    }
  });
  return { sheetName: 'Table', page: null, rows, cells };
}

const HTML_TABLE = /<table\b[^>]*>[\s\S]*?<\/table>/gi;

/**
 * Which structured table each `<table>` block in `content` is. They come in
 * reading order, so equal counts pair by position; otherwise each table's span
 * offset picks the block it falls in.
 */
function pairTables(blocks: Array<{ start: number; end: number }>, raw: RawTable[]): Map<number, number> {
  const pairs = new Map<number, number>();
  if (blocks.length === raw.length) {
    blocks.forEach((_, i) => pairs.set(i, i));
    return pairs;
  }
  const claimed = new Set<number>();
  raw.forEach((table, t) => {
    const offset = table.spans?.[0]?.offset;
    if (typeof offset !== 'number') return;
    const b = blocks.findIndex((block, i) => !pairs.has(i) && offset >= block.start && offset < block.end);
    if (b >= 0 && !claimed.has(t)) {
      pairs.set(b, t);
      claimed.add(t);
    }
  });
  return pairs;
}

/** Prose between tables, as plain text: no tags, no markdown heading marks. */
function proseToText(segment: string): string {
  return decodeEntities(
    segment
      .replace(/<!--\s*PageBreak\s*-->/gi, '\n\n')
      // A running header or footer can carry the entity name or a registration
      // number; its words are kept, the markup is not.
      .replace(/<!--\s*Page(?:Header|Footer)\s*=\s*"([^"]*)"\s*-->/gi, '\n$1\n')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/?[a-zA-Z][^>]*>/g, ''),
  ).replace(/^[ \t]*#{1,6}[ \t]+/gm, '');
}

/** Prose between tables, as markdown: figure wrappers dropped, entities decoded. */
function proseToMarkdown(segment: string): string {
  return decodeEntities(segment.replace(/<\/?(?:figure|figcaption)\b[^>]*>/gi, ''));
}

function tidy(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Build the text and markdown from `content`, putting each table back where
 * it was read as a text or pipe-table rendering of its cells, never as HTML.
 */
function readingsFromContent(content: string, raw: RawTable[], grids: TableGrid[]): { text: string; markdown: string } {
  const blocks = [...content.matchAll(HTML_TABLE)].map((m) => ({ start: m.index ?? 0, end: (m.index ?? 0) + m[0].length, html: m[0] }));
  const pairs = pairTables(blocks, raw);

  const text: string[] = [];
  const markdown: string[] = [];
  let cursor = 0;
  blocks.forEach((block, i) => {
    const before = content.slice(cursor, block.start);
    text.push(proseToText(before));
    markdown.push(proseToMarkdown(before));
    const paired = pairs.get(i);
    const grid = paired !== undefined ? grids[paired] : gridFromHtmlTable(block.html);
    text.push(`\n${tableToText(grid)}\n`);
    markdown.push(`\n\n${tableToMarkdown(grid)}\n\n`);
    cursor = block.end;
  });
  const rest = content.slice(cursor);
  text.push(proseToText(rest));
  markdown.push(proseToMarkdown(rest));

  // A table the content never showed (or one we could not place) is appended,
  // so a flattened rendering never loses the grid.
  const placed = new Set(pairs.values());
  grids.forEach((grid, t) => {
    if (placed.has(t)) return;
    text.push(`\n\n${tableToText(grid)}`);
    markdown.push(`\n\n${tableToMarkdown(grid)}`);
  });

  return { text: tidy(text.join('')), markdown: tidy(markdown.join('')) };
}

/** Build the reading from a raw analyzeResult — the same for a live and a cached answer. */
function resultFromAnalysis(analyzeResult: RawAnalyzeResult, filename: string): DocumentIntelligenceResult {
  const content = analyzeResult.content ?? '';
  const rawTables = analyzeResult.tables ?? [];
  const tables = rawTables.map(toTable);
  const { text, markdown } = readingsFromContent(content, rawTables, tables);

  logger.info('Document Intelligence analysis complete', {
    filename,
    pages: analyzeResult.pages?.length ?? 0,
    tables: tables.length,
    characters: markdown.length,
  });

  return {
    markdown,
    text,
    tables,
    pageCount: analyzeResult.pages?.length ?? 0,
  };
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
  const cacheFile = cacheFileFor(buffer);
  if (cacheFile) {
    const cached = readCachedAnalysis(cacheFile, filename);
    if (cached) return resultFromAnalysis(cached, filename);
  }

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
        analyzeResult?: RawAnalyzeResult;
      };

      if (body.status === 'running' || body.status === 'notStarted') continue;
      if (body.status !== 'succeeded') {
        logger.warn('Document Intelligence analysis did not succeed', { filename, status: body.status });
        return null;
      }

      if (cacheFile && body.analyzeResult) keepAnalysis(cacheFile, body.analyzeResult, filename);
      return resultFromAnalysis(body.analyzeResult ?? {}, filename);
    }

    logger.warn('Document Intelligence analysis timed out', { filename, maxPollMs: MAX_POLL_MS });
    return null;
  } catch (err) {
    logger.error('Document Intelligence call failed', err as Error);
    return null;
  }
}
