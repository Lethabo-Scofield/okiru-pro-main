import path from 'node:path';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import { createLogger } from '../logger.js';
import type { RawExtractionInput } from '../../schemas/parser_output.js';
import {
  htmlToMarkdown,
  pptxToMarkdown,
  reconstructPdfLines,
  worksheetToMarkdown,
} from './markdownConversion.js';
import { sheetGridToMarkdown } from './sheetRegions.js';
import { sheetMatrix } from './sheetCellValues.js';
import { convertWithDocling, doclingHandlesExtension, isDoclingEnabled } from './doclingClient.js';
import { preprocessForOcr } from './imagePreprocessing.js';
import { analyseWithDocumentIntelligence, documentIntelligenceConfigured } from './documentIntelligence.js';
import { splitWorkbookIntoSheets, shouldSplitWorkbook } from './workbookSheetSplit.js';
import { extractScannedPdfWithVision } from './visionExtraction.js';

/**
 * Below this many characters a PDF/DOCX is treated as a scan, not a document
 * with a text layer. Scanners commonly leave a few stray characters behind
 * (the real Thandanani scans yielded 0, 4 and 28), so the threshold sits above
 * that noise floor rather than at zero.
 */
const MIN_TEXT_LAYER_CHARS = 120;

const logger = createLogger('FileExtraction');

const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

export const SUPPORTED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  // Macro-enabled Excel. Every one of the client BEE Information Gathering
  // files is .xlsm, so omitting this rejected the single most common upload.
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  PPTX_MIME,
  'application/vnd.ms-powerpoint',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/tiff',
  'image/webp',
]);

export interface UploadedFileLike {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

function positiveIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

// Resource bounds — configurable, with safe defaults — to keep a single upload
// from exhausting CPU or memory (large PDFs, huge spreadsheets, slow OCR).
const EXTRACTION_TIMEOUT_MS = positiveIntEnv('PARSER_EXTRACTION_TIMEOUT_MS', 60_000);
const MAX_PDF_PAGES = positiveIntEnv('PARSER_MAX_PDF_PAGES', 100);
const MAX_SHEET_ROWS = positiveIntEnv('PARSER_MAX_SHEET_ROWS', 20_000);
const MAX_IMAGE_BYTES = positiveIntEnv('PARSER_MAX_IMAGE_BYTES', 15 * 1024 * 1024);

class ExtractionTimeoutError extends Error {
  constructor(ms: number) {
    super(`File extraction timed out after ${ms}ms`);
    this.name = 'ExtractionTimeoutError';
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ExtractionTimeoutError(ms)), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/**
 * Reads a PDF's TEXT LAYER only — it never OCRs. That makes it free and safe to
 * run at quote time, and it doubles as the digital-vs-scan differentiator: a
 * healthy string means a digital PDF (tokenize it exactly), an empty/near-empty
 * one means the pages are images and real OCR will be needed later.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  const pageLimit = Math.min(pdf.numPages, MAX_PDF_PAGES);

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item: unknown) => {
        if (item && typeof item === 'object' && 'str' in item) return String((item as { str: string }).str);
        return '';
      })
      .filter(Boolean)
      .join(' ');
    pages.push(text);
  }

  return pages.join('\n\n');
}

/**
 * Layout-aware markdown rendering of a digital PDF's text layer. Same source
 * items as {@link extractPdfText}, but grouped into visual reading-order lines
 * (via item x/y positions) and split into `## Page N` sections — the structure
 * an LLM reads far more reliably than a single space-joined blob. Text-layer
 * only, never OCR; returns '' when there is no digital text (a scan).
 */
export async function extractPdfMarkdown(buffer: Buffer): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const pageLimit = Math.min(pdf.numPages, MAX_PDF_PAGES);
  const blocks: string[] = [];

  for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const items = content.items
      .map((item: unknown) => {
        if (item && typeof item === 'object' && 'str' in item && 'transform' in item) {
          const it = item as { str: string; transform: number[] };
          return { str: String(it.str), x: it.transform[4] ?? 0, y: it.transform[5] ?? 0 };
        }
        return null;
      })
      .filter((v): v is { str: string; x: number; y: number } => Boolean(v && v.str.trim()));

    const lines = reconstructPdfLines(items);
    if (lines.length === 0) continue;
    blocks.push([`## Page ${pageNumber}`, '', ...lines].join('\n'));
  }

  return blocks.join('\n\n');
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

/** DOCX → markdown via mammoth's HTML output (preserves tables, headings, lists). */
export async function extractDocxMarkdown(buffer: Buffer): Promise<string> {
  const result = await mammoth.convertToHtml({ buffer });
  return htmlToMarkdown(result.value);
}

/**
 * `sheet_to_json(sheet, { defval: '' })` with the number format preserved:
 * first row as headers, one object per data row, percentage cells carrying
 * their percent sign. Duplicate headers are suffixed the way SheetJS does, so
 * callers keyed on column names behave unchanged.
 */
function percentAwareRows(sheet: XLSX.WorkSheet): Array<Record<string, unknown>> {
  const matrix = sheetMatrix(sheet);
  if (matrix.length === 0) return [];

  const seen = new Map<string, number>();
  const headers = (matrix[0] ?? []).map((cell, index) => {
    const base = String(cell ?? '').trim() || `__EMPTY${index > 0 ? `_${index}` : ''}`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count}`;
  });

  const rows: Array<Record<string, unknown>> = [];
  for (let r = 1; r < matrix.length; r += 1) {
    const cells = matrix[r] ?? [];
    const row: Record<string, unknown> = {};
    let hasContent = false;
    for (let c = 0; c < headers.length; c += 1) {
      const value = cells[c];
      row[headers[c]] = value ?? '';
      if (String(value ?? '').trim() !== '') hasContent = true;
    }
    // SheetJS omits fully-blank rows; keeping that behaviour avoids handing
    // downstream readers a run of empty objects to filter out.
    if (hasContent) rows.push(row);
  }
  return rows;
}

export function extractWorkbookText(buffer: Buffer): { text: string; tables: unknown[]; markdown: string } {
  // cellNF keeps each cell's number format, which is the only thing that tells
  // a stored 0.32 apart from a displayed "32%" (see sheetCellValues.ts).
  const workbook = XLSX.read(buffer, { type: 'buffer', cellNF: true });
  const tables: unknown[] = [];
  const parts: string[] = [];
  const markdownParts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // Format-aware (sheetCellValues.ts): the deterministic readers that consume
    // `tables` score these cells directly, so a percentage must arrive as
    // "32%" rather than a bare 0.32 they would have to guess the unit of.
    const allRows = percentAwareRows(sheet);
    const rows = allRows.slice(0, MAX_SHEET_ROWS);
    tables.push({ sheetName, rows });
    parts.push(`Sheet: ${sheetName}`);
    parts.push(rowsToReadableText(rows));

    // LLM-facing rendering is REGION-AWARE (sheetRegions.ts): the data table
    // gets its real header + ditto forward-fill; side dropdown/reference
    // lists are labelled so the extractor doesn't invent rows from them. The
    // structured `tables` array above stays raw for deterministic readers.
    const grid = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false });
    markdownParts.push(sheetGridToMarkdown(sheetName, (grid as unknown as string[][]).slice(0, MAX_SHEET_ROWS)));
  }

  return { text: parts.join('\n'), tables, markdown: markdownParts.join('\n\n') };
}

/**
 * Render the structured `tables` array ([{ sheetName, rows }]) as markdown:
 * one `## sheet` heading + pipe table per sheet. Shared by the XLSX and CSV
 * branches so spreadsheets reach the LLM as native markdown tables.
 */
function tablesToMarkdown(tables: unknown[]): string {
  const blocks: string[] = [];
  for (const table of tables) {
    if (!table || typeof table !== 'object') continue;
    const { sheetName, rows } = table as { sheetName?: string; rows?: Array<Record<string, unknown>> };
    if (!Array.isArray(rows) || rows.length === 0) continue;
    blocks.push(worksheetToMarkdown(sheetName ?? 'Sheet', rows));
  }
  return blocks.join('\n\n');
}

function rowsToReadableText(rows: Array<Record<string, unknown>>): string {
  const lines: string[] = [];
  for (const row of rows) {
    const entries = Object.entries(row)
      .map(([key, value]) => [key.trim(), String(value ?? '').trim()] as const)
      .filter(([key, value]) => key || value);

    if (entries.length === 2 && entries[0][0].toLowerCase() === 'document' && entries[1][0].toLowerCase() === 'value') {
      lines.push(`${entries[0][1]}: ${entries[1][1]}`);
      continue;
    }

    for (const [key, value] of entries) {
      if (key && value) lines.push(`${key}: ${value}`);
      else if (value) lines.push(value);
    }
  }
  return lines.join('\n');
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"' && next === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

export function extractCsvText(rawCsv: string): { text: string; tables: unknown[] } {
  const lines = rawCsv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { text: '', tables: [] };

  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header || `column_${index + 1}`, cells[index] ?? '']));
  });

  return {
    text: rowsToReadableText(rows),
    tables: [{ sheetName: 'CSV', rows }],
  };
}

async function extractImageText(buffer: Buffer): Promise<string> {
  // Preprocess first: greyscale + contrast + upscale recovers substantially more
  // characters from phone photos and low-DPI scans than OCR tuning does. Falls
  // back to the original buffer if sharp is unavailable or preprocessing fails.
  const { buffer: ocrInput } = await preprocessForOcr(buffer);

  const worker = await createWorker('eng');
  try {
    const result = await worker.recognize(ocrInput);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

/**
 * Extensions we can read. Browsers and curl frequently send a correct file as
 * `application/octet-stream` — especially .xlsm and .pptx — so the MIME type
 * alone is not a safe gate. It rejected real client workbooks outright.
 */
export const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  '.pdf', '.docx', '.doc', '.xlsx', '.xlsm', '.xls', '.pptx', '.ppt',
  '.csv', '.txt', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.webp',
]);

/** Accept when EITHER the declared type or the extension is one we support. */
export function isSupportedUpload(mimetype: string, filename: string): boolean {
  if (SUPPORTED_UPLOAD_MIME_TYPES.has(mimetype)) return true;
  return SUPPORTED_UPLOAD_EXTENSIONS.has(extensionFromFilename(filename));
}

function extensionFromFilename(filename: string): string {
  return path.extname(filename).toLowerCase();
}

export async function rawExtractionInputFromUpload(file: UploadedFileLike): Promise<RawExtractionInput> {
  if (!isSupportedUpload(file.mimetype, file.originalname)) {
    throw new Error(`Unsupported file type ${file.mimetype}`);
  }

  const ext = extensionFromFilename(file.originalname);
  let rawText = '';
  // `markdown` is the structure-preserving rendering for LLM extractors; it stays
  // additive so `raw_text` (what the regex extractor reads) never changes shape.
  let markdown = '';
  let tables: unknown[] = [];

  logger.info('Extracting uploaded file', {
    filename: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  });

  if (file.mimetype === 'application/pdf' || ext === '.pdf') {
    rawText = await withTimeout(extractPdfText(file.buffer), EXTRACTION_TIMEOUT_MS);
    markdown = await withTimeout(extractPdfMarkdown(file.buffer), EXTRACTION_TIMEOUT_MS).catch(() => '');
  } else if (
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || ext === '.docx'
  ) {
    rawText = await withTimeout(extractDocxText(file.buffer), EXTRACTION_TIMEOUT_MS);
    markdown = await withTimeout(extractDocxMarkdown(file.buffer), EXTRACTION_TIMEOUT_MS).catch(() => '');
  } else if (
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || file.mimetype === 'application/vnd.ms-excel'
    || ext === '.xlsx'
    || ext === '.xlsm'
    || ext === '.xls'
  ) {
    const extracted = extractWorkbookText(file.buffer);
    rawText = extracted.text;
    tables = extracted.tables;
    markdown = extracted.markdown || tablesToMarkdown(extracted.tables);
  } else if (file.mimetype === 'text/csv' || ext === '.csv') {
    const extracted = extractCsvText(file.buffer.toString('utf8'));
    rawText = extracted.text;
    tables = extracted.tables;
    markdown = tablesToMarkdown(extracted.tables);
  } else if (file.mimetype === PPTX_MIME || ext === '.pptx') {
    const extracted = await withTimeout(pptxToMarkdown(file.buffer), EXTRACTION_TIMEOUT_MS);
    rawText = extracted.text;
    markdown = extracted.markdown;
  } else if (file.mimetype === 'text/plain' || ext === '.txt') {
    rawText = file.buffer.toString('utf8');
    markdown = rawText;
  } else if (file.mimetype.startsWith('image/')) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`Image exceeds maximum size of ${MAX_IMAGE_BYTES} bytes`);
    }
    rawText = await withTimeout(extractImageText(file.buffer), EXTRACTION_TIMEOUT_MS);
    markdown = rawText;
  }

  // SCANNED DOCUMENTS — the text layer is empty because the pages are images.
  //
  // Measured on the real Thandanani pack: the Share Certificate, Share Register
  // and BI Register all returned ZERO characters, and those three carry the
  // entire 25-point Ownership case. Before this, the upload was rejected as
  // unreadable. Document Intelligence reads the scan and returns table
  // structure with it.
  //
  // Deliberately placed BEFORE the throw so it rescues documents that would
  // otherwise be refused, and gated on emptiness so digital documents never pay
  // for a network round trip.
  const looksScanned = rawText.trim().length < MIN_TEXT_LAYER_CHARS && tables.length === 0;
  if (looksScanned) {
    logger.info('Text layer is empty — falling back to scanned-document readers', {
      filename: file.originalname,
      textLayerChars: rawText.trim().length,
    });

    // Preferred: Document Intelligence, which is purpose-built and returns table
    // structure. Used automatically if the subscription ever has it.
    if (documentIntelligenceConfigured()) {
      const analysed = await analyseWithDocumentIntelligence(file.buffer, file.mimetype, file.originalname);
      if (analysed && analysed.text.trim()) {
        rawText = analysed.text;
        markdown = analysed.markdown || analysed.text;
        if (tables.length === 0 && analysed.tables.length > 0) {
          tables = analysed.tables.map((table, index) => ({
            sheetName: `Table ${index + 1}`,
            rows: table.cells,
          }));
        }
      }
    }

    // Fallback: rasterise the pages and let the multimodal model read them.
    // This is what actually runs today — Document Intelligence is not
    // provisioned, gpt-4o is.
    const stillEmpty = rawText.trim().length < MIN_TEXT_LAYER_CHARS;
    if (stillEmpty && (file.mimetype === 'application/pdf' || ext === '.pdf')) {
      const seen = await extractScannedPdfWithVision(file.buffer, file.originalname);
      if (seen && seen.markdown.trim()) {
        rawText = seen.markdown;
        markdown = seen.markdown;

        // If the page cap bit, SAY SO in the document itself. The caller was
        // discarding this flag, so a partially-read scan was indistinguishable
        // from a fully-read one and the untranscribed pages were scored as
        // absent. Carrying it in the text means it reaches the user through
        // every downstream path without new plumbing.
        if (seen.truncated) {
          const notice = `\n\n> NOTE: only the first ${seen.pagesRead} pages of this scanned document were transcribed. Later pages were not read.\n`;
          rawText += notice;
          markdown += notice;
          logger.warn('Scanned document was longer than the vision page cap', {
            filename: file.originalname,
            pagesRead: seen.pagesRead,
          });
        }
      }
    }
  }

  if (!rawText.trim() && tables.length === 0) {
    throw new Error('Could not extract readable text from uploaded file');
  }

  // Optional upgrade: when the Docling sidecar is enabled it does layout-aware
  // conversion with real table-structure recovery, which beats our text-layer
  // rendering. It only ever replaces `markdown` (the LLM-facing field) — never
  // `raw_text`, so the regex extractor is untouched. Any failure returns null and
  // we silently keep the built-in conversion.
  if (isDoclingEnabled() && doclingHandlesExtension(ext)) {
    const docling = await convertWithDocling(file.buffer, file.originalname, file.mimetype);
    if (docling) {
      markdown = docling.markdown;
      // Only adopt Docling's tables when our own converters found none, so the
      // spreadsheet path keeps its exact structured `tables` shape.
      if (tables.length === 0 && docling.tables.length > 0) {
        tables = docling.tables.map((t) => ({ sheetName: `Table ${t.index + 1}`, rows: t.rows ?? [] }));
      }
    }
  }

  // Fall back to the plain text if a structured rendering could not be produced,
  // so downstream LLM consumers always have a non-empty `markdown` to read.
  if (!markdown.trim()) markdown = rawText;

  return {
    file_id: `upload_${Date.now()}`,
    filename: file.originalname,
    mime_type: file.mimetype,
    raw_text: rawText,
    markdown,
    tables,
    metadata: {
      source: 'direct_upload',
      file_size: file.size,
      mime_type: file.mimetype,
    },
  };
}

/**
 * Turn one upload into one OR MORE extraction inputs.
 *
 * A multi-sheet workbook is not one document — it is one document per sheet
 * (Ownership, Employees, Procurement, Social Development…). Classifying and
 * extracting it as a whole drowns the model: Phase 4's first real run
 * classified a 17-sheet BEE workbook as "Skills Development schedule" and
 * yielded almost nothing. Split per sheet and each sheet meets the prompts
 * whose evidence it actually contains.
 *
 * Everything that is not a multi-sheet workbook — a PDF, a scan, a single-sheet
 * spreadsheet, a CSV — passes straight through as one input, unchanged. The
 * split can never make a file less readable: if it produces nothing, the
 * whole-file input is used.
 */
export async function extractionInputsFromUpload(file: UploadedFileLike): Promise<RawExtractionInput[]> {
  const ext = extensionFromFilename(file.originalname);
  const isWorkbook = file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || file.mimetype === 'application/vnd.ms-excel'
    || file.mimetype === 'application/vnd.ms-excel.sheet.macroEnabled.12'
    || file.mimetype === 'application/vnd.ms-excel.sheet.macroenabled.12'
    || ext === '.xlsx' || ext === '.xlsm' || ext === '.xls';

  if (isWorkbook) {
    const sheets = splitWorkbookIntoSheets(file.buffer);

    // A SINGLE-sheet workbook is not worth splitting into one document, but it
    // still has header-keyed rows, and the deterministic readers (supplier
    // ledgers, spend schedules) need exactly those. Without this they saw only
    // markdown and every single-sheet supplier ledger — which is how ledgers
    // are always filed — extracted nothing.
    if (sheets.length === 1) {
      const [sheet] = sheets;
      const input = await rawExtractionInputFromUpload(file);
      return [{
        ...input,
        tables: [{ sheetName: sheet.sheetName, rows: sheet.rows }],
        metadata: { ...input.metadata, sheet_name: sheet.sheetName },
      }];
    }

    if (shouldSplitWorkbook(sheets)) {
      logger.info('Splitting workbook into per-sheet documents', {
        filename: file.originalname,
        sheets: sheets.length,
      });
      // Browsers routinely upload a real workbook as application/octet-stream.
      // The PARENT survives that (extension fallback), but a split child's
      // derived name ("File.xlsx › Finance") has no extension, so the child
      // failed schema validation and one generic-mime workbook killed the
      // whole paid case at resolve. The child's rows came out of a workbook we
      // just parsed — declare the type we KNOW it is.
      const childMime = SUPPORTED_UPLOAD_MIME_TYPES.has(file.mimetype)
        ? file.mimetype
        : ext === '.xlsm'
          ? 'application/vnd.ms-excel.sheet.macroEnabled.12'
          : ext === '.xls'
            ? 'application/vnd.ms-excel'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      return sheets.map((sheet) => ({
        // Provenance names the sheet, so a value traces back to "File › Sheet".
        file_id: `upload_${Date.now()}_${sheet.sheetName.replace(/\W+/g, '_')}`,
        filename: `${file.originalname} › ${sheet.sheetName}`,
        mime_type: childMime,
        raw_text: sheet.text,
        markdown: sheet.markdown,
        tables: [{ sheetName: sheet.sheetName, rows: sheet.rows }],
        metadata: {
          source: 'direct_upload',
          file_size: file.size,
          mime_type: file.mimetype,
          sheet_name: sheet.sheetName,
          parent_file: file.originalname,
        },
      }));
    }
  }

  // Not a multi-sheet workbook — one input, the existing path (which also
  // handles scanned PDFs via vision, DOCX, PPTX, images, etc.).
  return [await rawExtractionInputFromUpload(file)];
}
