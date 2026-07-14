import path from 'node:path';
import * as XLSX from 'xlsx';
import { SUPPORTED_UPLOAD_MIME_TYPES, type UploadedFileLike } from './fileExtraction.js';

export type ProcessingEffort = 'standard' | 'high';

export interface PricingQuoteFile {
  fileId: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  detectedDocumentType: string;
  processingEffort: ProcessingEffort;
  structure: {
    format: string;
    pages: number | null;
    sheets: number | null;
    rows: number | null;
    estimatedUnits: number;
  };
  pricing: {
    currency: string;
    unitPriceCents: number;
    subtotalCents: number;
  };
  reasons: string[];
  warnings: string[];
}

export interface PricingQuote {
  quoteId: string;
  status: 'quoted';
  currency: string;
  files: PricingQuoteFile[];
  subtotalCents: number;
  totalProcessingUnits: number;
  expiresAt: string;
  paymentRequired: true;
  paymentStatus: 'not_started';
  nextAction: 'proceed_to_payment';
  notes: string[];
}

const CURRENCY = process.env.PARSER_QUOTE_CURRENCY || 'ZAR';
const STANDARD_UNIT_PRICE_CENTS = positiveIntEnv('PARSER_STANDARD_UNIT_PRICE_CENTS', 250);
const HIGH_UNIT_PRICE_CENTS = positiveIntEnv('PARSER_HIGH_UNIT_PRICE_CENTS', 500);
const QUOTE_TTL_MINUTES = positiveIntEnv('PARSER_QUOTE_TTL_MINUTES', 30);

function positiveIntEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

function ext(filename: string): string {
  return path.extname(filename).toLowerCase();
}

async function inspectPdf(buffer: Buffer): Promise<{ pages: number; textSampleLength: number }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  let textSampleLength = 0;
  const samplePages = Math.min(pdf.numPages, 3);
  for (let pageNumber = 1; pageNumber <= samplePages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    textSampleLength += content.items
      .map((item: unknown) => (item && typeof item === 'object' && 'str' in item ? String((item as { str: string }).str) : ''))
      .join(' ')
      .trim().length;
  }
  return { pages: pdf.numPages, textSampleLength };
}

function inspectDocx(buffer: Buffer): { pages: number } {
  return { pages: Math.max(1, Math.ceil(buffer.length / (80 * 1024))) };
}

function inspectWorkbook(buffer: Buffer): { sheets: number; rows: number } {
  const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: 20001 });
  let rows = 0;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const range = sheet?.['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null;
    if (range) rows += Math.max(0, range.e.r - range.s.r);
  }
  return { sheets: workbook.SheetNames.length, rows };
}

function inspectCsv(buffer: Buffer): { rows: number } {
  const text = buffer.toString('utf8');
  const rows = text.split(/\r?\n/).filter((line) => line.trim()).length;
  return { rows: Math.max(0, rows - 1) };
}

function detectDocumentType(filename: string, mimeType: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('spend') || lower.includes('procurement') || lower.includes('supplier')) return 'Supplier evidence / schedule';
  if (lower.includes('affidavit')) return 'B-BBEE sworn affidavit';
  if (lower.includes('certificate') || lower.includes('b-bbee') || lower.includes('bbbee') || lower.includes('bee')) return 'B-BBEE certificate';
  if (mimeType.includes('spreadsheet') || ['.xlsx', '.xls', '.csv'].includes(ext(filename))) return 'Tabular evidence';
  if (mimeType === 'application/pdf' || ext(filename) === '.pdf') return 'PDF evidence';
  if (mimeType.startsWith('image/')) return 'Image evidence';
  return 'General document evidence';
}

function effortFromStructure(params: {
  format: string;
  pages: number | null;
  sheets: number | null;
  rows: number | null;
  textSampleLength?: number;
  fileSizeBytes: number;
}): { effort: ProcessingEffort; reasons: string[] } {
  const reasons: string[] = [];
  let high = false;
  if (params.format === 'image') {
    high = true;
    reasons.push('image file normally requires OCR/vision processing later');
  }
  if (params.format === 'pdf' && (params.textSampleLength ?? 0) < 40) {
    high = true;
    reasons.push('PDF has little detectable text in sample pages');
  }
  if ((params.pages ?? 0) > 20) {
    high = true;
    reasons.push('document has more than 20 estimated pages');
  }
  if ((params.sheets ?? 0) > 5 || (params.rows ?? 0) > 1000) {
    high = true;
    reasons.push('spreadsheet has many sheets or rows');
  }
  if (params.fileSizeBytes > 10 * 1024 * 1024) {
    high = true;
    reasons.push('file size is above 10 MB');
  }
  if (!reasons.length) reasons.push('standard digital document structure');
  return { effort: high ? 'high' : 'standard', reasons };
}

function unitsFor(effort: ProcessingEffort, pages: number | null, sheets: number | null, rows: number | null): number {
  if (sheets != null) {
    return Math.max(1, sheets, Math.ceil((rows ?? 0) / 500));
  }
  return Math.max(1, pages ?? 1) * (effort === 'high' ? 2 : 1);
}

export async function quoteUploadedFiles(files: UploadedFileLike[]): Promise<PricingQuote> {
  const quotedFiles: PricingQuoteFile[] = [];

  for (const [index, file] of files.entries()) {
    if (!SUPPORTED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      throw new Error(`Unsupported file type ${file.mimetype}`);
    }

    const extension = ext(file.originalname);
    let format = extension.replace('.', '') || file.mimetype;
    let pages: number | null = null;
    let sheets: number | null = null;
    let rows: number | null = null;
    let textSampleLength = 0;
    const warnings: string[] = [];

    if (file.mimetype === 'application/pdf' || extension === '.pdf') {
      format = 'pdf';
      const pdf = await inspectPdf(file.buffer);
      pages = pdf.pages;
      textSampleLength = pdf.textSampleLength;
    } else if (file.mimetype.startsWith('image/')) {
      format = 'image';
      pages = 1;
    } else if (extension === '.docx' || file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      format = 'docx';
      const docx = inspectDocx(file.buffer);
      pages = docx.pages;
    } else if (['.xlsx', '.xls'].includes(extension) || file.mimetype.includes('spreadsheet') || file.mimetype === 'application/vnd.ms-excel') {
      format = 'spreadsheet';
      const workbook = inspectWorkbook(file.buffer);
      sheets = workbook.sheets;
      rows = workbook.rows;
    } else if (extension === '.csv' || file.mimetype === 'text/csv') {
      format = 'csv';
      sheets = 1;
      rows = inspectCsv(file.buffer).rows;
    } else {
      format = extension === '.txt' ? 'text' : format;
      const text = file.buffer.toString('utf8');
      pages = Math.max(1, Math.ceil(text.trim().split(/\s+/).filter(Boolean).length / 500));
      textSampleLength = text.trim().length;
    }

    const effort = effortFromStructure({ format, pages, sheets, rows, textSampleLength, fileSizeBytes: file.size });
    const estimatedUnits = unitsFor(effort.effort, pages, sheets, rows);
    const unitPriceCents = effort.effort === 'high' ? HIGH_UNIT_PRICE_CENTS : STANDARD_UNIT_PRICE_CENTS;
    const subtotalCents = estimatedUnits * unitPriceCents;

    quotedFiles.push({
      fileId: `quote_file_${index + 1}`,
      filename: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      detectedDocumentType: detectDocumentType(file.originalname, file.mimetype),
      processingEffort: effort.effort,
      structure: { format, pages, sheets, rows, estimatedUnits },
      pricing: { currency: CURRENCY, unitPriceCents, subtotalCents },
      reasons: effort.reasons,
      warnings,
    });
  }

  const subtotalCents = quotedFiles.reduce((sum, file) => sum + file.pricing.subtotalCents, 0);
  const totalProcessingUnits = quotedFiles.reduce((sum, file) => sum + file.structure.estimatedUnits, 0);
  return {
    quoteId: `quote_${Date.now()}`,
    status: 'quoted',
    currency: CURRENCY,
    files: quotedFiles,
    subtotalCents,
    totalProcessingUnits,
    expiresAt: new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000).toISOString(),
    paymentRequired: true,
    paymentStatus: 'not_started',
    nextAction: 'proceed_to_payment',
    notes: [
      'Quote is based on file structure only.',
      'No OCR, LLM, vision processing, extraction, validation, scoring, or parser resolution has been run.',
    ],
  };
}
