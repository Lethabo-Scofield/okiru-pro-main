import path from 'node:path';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import { createLogger } from '../logger.js';
import type { RawExtractionInput } from '../../schemas/parser_output.js';

const logger = createLogger('FileExtraction');

export const SUPPORTED_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
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

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}

export function extractWorkbookText(buffer: Buffer): { text: string; tables: unknown[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const tables: unknown[] = [];
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const allRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
    const rows = allRows.slice(0, MAX_SHEET_ROWS);
    tables.push({ sheetName, rows });
    parts.push(`Sheet: ${sheetName}`);
    parts.push(rowsToReadableText(rows));
  }

  return { text: parts.join('\n'), tables };
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
  const worker = await createWorker('eng');
  try {
    const result = await worker.recognize(buffer);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

function extensionFromFilename(filename: string): string {
  return path.extname(filename).toLowerCase();
}

export async function rawExtractionInputFromUpload(file: UploadedFileLike): Promise<RawExtractionInput> {
  if (!SUPPORTED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
    throw new Error(`Unsupported file type ${file.mimetype}`);
  }

  const ext = extensionFromFilename(file.originalname);
  let rawText = '';
  let tables: unknown[] = [];

  logger.info('Extracting uploaded file', {
    filename: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
  });

  if (file.mimetype === 'application/pdf' || ext === '.pdf') {
    rawText = await withTimeout(extractPdfText(file.buffer), EXTRACTION_TIMEOUT_MS);
  } else if (
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || ext === '.docx'
  ) {
    rawText = await withTimeout(extractDocxText(file.buffer), EXTRACTION_TIMEOUT_MS);
  } else if (
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || file.mimetype === 'application/vnd.ms-excel'
    || ext === '.xlsx'
    || ext === '.xls'
  ) {
    const extracted = extractWorkbookText(file.buffer);
    rawText = extracted.text;
    tables = extracted.tables;
  } else if (file.mimetype === 'text/csv' || ext === '.csv') {
    const extracted = extractCsvText(file.buffer.toString('utf8'));
    rawText = extracted.text;
    tables = extracted.tables;
  } else if (file.mimetype === 'text/plain' || ext === '.txt') {
    rawText = file.buffer.toString('utf8');
  } else if (file.mimetype.startsWith('image/')) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(`Image exceeds maximum size of ${MAX_IMAGE_BYTES} bytes`);
    }
    rawText = await withTimeout(extractImageText(file.buffer), EXTRACTION_TIMEOUT_MS);
  }

  if (!rawText.trim() && tables.length === 0) {
    throw new Error('Could not extract readable text from uploaded file');
  }

  return {
    file_id: `upload_${Date.now()}`,
    filename: file.originalname,
    mime_type: file.mimetype,
    raw_text: rawText,
    tables,
    metadata: {
      source: 'direct_upload',
      file_size: file.size,
      mime_type: file.mimetype,
    },
  };
}
