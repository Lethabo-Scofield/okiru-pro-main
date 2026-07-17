/**
 * Token prediction + Azure cost — the engine the quote is built on.
 *
 * The product rule: the user must see the price BEFORE we spend anything on
 * Azure. So everything in here is free and local — it reads the document's own
 * text layer / structure and never calls Azure, never OCRs, never runs vision.
 *
 * How a document's tokens are predicted:
 *
 *   Digital text (PDF with a text layer, DOCX, XLSX, CSV, TXT)
 *     → we already have the exact string the model would read, so we tokenize it
 *       with the model's real encoding. The count is EXACT and so is the price.
 *
 *   Scan / image (PDF whose text layer is empty, photo, TIFF)
 *     → the text only exists after OCR, and OCR is part of what's being paid for.
 *       So we predict from pages x TOKENS_PER_SCANNED_PAGE and return a BAND.
 *       We quote the band's upper bound and never charge above it.
 *
 * `extractPdfText` reads the text layer only (it never OCRs), which is what lets
 * one free call both differentiate digital-vs-scan AND give us the exact string.
 *
 * EVERY RATE BELOW IS A PLACEHOLDER until the Azure deployment + its published
 * price are confirmed, and until TOKENS_PER_SCANNED_PAGE is calibrated against
 * real certificates/affidavits. They are env-driven so they can be set without
 * a rebuild. Nothing here invents a price it can defend.
 */
import path from 'node:path';
import { encode } from 'gpt-tokenizer';
import {
  extractPdfText,
  extractDocxText,
  extractWorkbookText,
  extractCsvText,
  type UploadedFileLike,
} from './fileExtraction.js';

export type TokenBasis = 'exact-text' | 'estimated-scan';
export type DocumentKind = 'pdf-digital' | 'pdf-scanned' | 'docx' | 'spreadsheet' | 'csv' | 'text' | 'image';

export interface TokenPrediction {
  kind: DocumentKind;
  /** True when the document needs OCR/vision (scan or image). */
  requiresOcr: boolean;
  basis: TokenBasis;
  /** Tokens we will send to the model. */
  inputTokens: number;
  /** Tokens we expect the model to emit (the structured entity JSON). */
  expectedOutputTokens: number;
  /** Null when exact; a range when the count had to be estimated. */
  band: { lowerTokens: number; upperTokens: number } | null;
  pages: number | null;
  sheets: number | null;
  rows: number | null;
  reasons: string[];
}

export interface AzureCostBreakdown {
  currency: string;
  model: string;
  inputCents: number;
  outputCents: number;
  /** OCR / vision is billed per page, separately from tokens. */
  ocrCents: number;
  /** Sum of the above, before margin. */
  azureCents: number;
  /** What we charge = azureCents x margin. */
  totalCents: number;
  marginMultiplier: number;
  /** True when the underlying token count was a band, so this is an upper bound. */
  isUpperBound: boolean;
}

// ── config — all placeholders, all env-overridable ────────────────────────────
const CURRENCY = process.env.PARSER_QUOTE_CURRENCY || 'ZAR';
const AZURE_MODEL = process.env.AZURE_MODEL_DEPLOYMENT || 'gpt-4o-mini';
/** PLACEHOLDER rates in cents per 1 000 tokens. Set from the Azure price list. */
const INPUT_COST_PER_1K_CENTS = numEnv('AZURE_INPUT_COST_PER_1K_CENTS', 0.3);
const OUTPUT_COST_PER_1K_CENTS = numEnv('AZURE_OUTPUT_COST_PER_1K_CENTS', 1.2);
/** PLACEHOLDER — OCR/vision per page (Azure Document Intelligence bills per page). */
const OCR_COST_PER_PAGE_CENTS = numEnv('AZURE_OCR_COST_PER_PAGE_CENTS', 3.0);
/** PLACEHOLDER — calibrate on real scanned certificates before quoting. */
const TOKENS_PER_SCANNED_PAGE = numEnv('PARSER_TOKENS_PER_SCANNED_PAGE', 750);
/** Estimate band for scans (±20%). We quote the upper bound. */
const SCAN_BAND_PCT = numEnv('PARSER_SCAN_BAND_PCT', 0.2);
/** Output (structured JSON) is a fraction of input. PLACEHOLDER. */
const OUTPUT_TOKEN_RATIO = numEnv('PARSER_OUTPUT_TOKEN_RATIO', 0.25);
/** 1.0 = charge Azure cost at par. Set >1 to add margin. */
const MARGIN_MULTIPLIER = numEnv('PARSER_MARGIN_MULTIPLIER', 1.0);
/** A PDF text layer shorter than this per page means the page is an image. */
const SCAN_TEXT_THRESHOLD_PER_PAGE = numEnv('PARSER_SCAN_TEXT_THRESHOLD_PER_PAGE', 40);

function numEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

function ext(filename: string): string {
  return path.extname(filename).toLowerCase();
}

/** Exact token count using the model's own encoding. */
export function countTokens(text: string): number {
  if (!text) return 0;
  return encode(text).length;
}

async function pdfPageCount(buffer: Buffer): Promise<number> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
  return pdf.numPages;
}

/**
 * Predict the tokens a single uploaded file will cost to read. Free: no Azure,
 * no OCR, no vision — only local text-layer reads and structure inspection.
 */
export async function predictTokensForFile(file: UploadedFileLike): Promise<TokenPrediction> {
  const extension = ext(file.originalname);
  const reasons: string[] = [];

  const exact = (kind: DocumentKind, text: string, extra: Partial<TokenPrediction> = {}): TokenPrediction => {
    const inputTokens = countTokens(text);
    return {
      kind,
      requiresOcr: false,
      basis: 'exact-text',
      inputTokens,
      expectedOutputTokens: Math.ceil(inputTokens * OUTPUT_TOKEN_RATIO),
      band: null,
      pages: null,
      sheets: null,
      rows: null,
      reasons,
      ...extra,
    };
  };

  const estimatedScan = (kind: DocumentKind, pages: number): TokenPrediction => {
    const inputTokens = Math.ceil(pages * TOKENS_PER_SCANNED_PAGE);
    return {
      kind,
      requiresOcr: true,
      basis: 'estimated-scan',
      inputTokens,
      expectedOutputTokens: Math.ceil(inputTokens * OUTPUT_TOKEN_RATIO),
      band: {
        lowerTokens: Math.floor(inputTokens * (1 - SCAN_BAND_PCT)),
        upperTokens: Math.ceil(inputTokens * (1 + SCAN_BAND_PCT)),
      },
      pages,
      sheets: null,
      rows: null,
      reasons,
    };
  };

  // ── images: never OCR to quote. Estimate from page count (1 per image). ──
  if (file.mimetype.startsWith('image/')) {
    reasons.push('image needs OCR/vision — tokens estimated from page count, not read');
    return estimatedScan('image', 1);
  }

  // ── PDF: one free text-layer read tells us digital vs scanned. ──
  if (file.mimetype === 'application/pdf' || extension === '.pdf') {
    const [text, pages] = await Promise.all([
      extractPdfText(file.buffer).catch(() => ''),
      pdfPageCount(file.buffer).catch(() => 1),
    ]);
    const perPage = pages > 0 ? text.trim().length / pages : text.trim().length;
    if (perPage < SCAN_TEXT_THRESHOLD_PER_PAGE) {
      reasons.push(`PDF text layer is empty (${Math.round(perPage)} chars/page) — pages are images, OCR needed`);
      return estimatedScan('pdf-scanned', pages);
    }
    reasons.push(`PDF has a text layer (${pages} page${pages === 1 ? '' : 's'}) — tokens counted exactly`);
    return exact('pdf-digital', text, { pages });
  }

  // ── Word ──
  if (extension === '.docx' || file.mimetype.includes('wordprocessingml')) {
    const text = await extractDocxText(file.buffer).catch(() => '');
    reasons.push('Word document — text read directly, tokens counted exactly');
    return exact('docx', text);
  }

  // ── Spreadsheet: size drives tokens (every row is text the model reads). ──
  if (['.xlsx', '.xls'].includes(extension) || file.mimetype.includes('spreadsheet') || file.mimetype === 'application/vnd.ms-excel') {
    const { text, tables } = extractWorkbookText(file.buffer);
    const sheets = tables.length;
    const rows = tables.reduce<number>((n, t) => n + ((t as { rows?: unknown[] }).rows?.length ?? 0), 0);
    reasons.push(`spreadsheet — ${sheets} sheet${sheets === 1 ? '' : 's'}, ${rows} rows read, tokens counted exactly`);
    return exact('spreadsheet', text, { sheets, rows });
  }

  // ── CSV ──
  if (extension === '.csv' || file.mimetype === 'text/csv') {
    const { text, tables } = extractCsvText(file.buffer.toString('utf8'));
    const rows = ((tables[0] as { rows?: unknown[] })?.rows?.length) ?? 0;
    reasons.push(`CSV — ${rows} rows read, tokens counted exactly`);
    return exact('csv', text, { sheets: 1, rows });
  }

  // ── Plain text ──
  const text = file.buffer.toString('utf8');
  reasons.push('plain text — tokens counted exactly');
  return exact('text', text);
}

/**
 * Price a prediction at the Azure model's rate. Tokens are billed per 1k;
 * OCR/vision is billed per page on top, because that is how Azure charges it.
 */
export function azureCostFor(prediction: TokenPrediction): AzureCostBreakdown {
  // For a banded (scanned) estimate we price the UPPER bound so we never
  // charge more than we quoted.
  const billableInput = prediction.band ? prediction.band.upperTokens : prediction.inputTokens;
  const billableOutput = prediction.band
    ? Math.ceil(prediction.band.upperTokens * OUTPUT_TOKEN_RATIO)
    : prediction.expectedOutputTokens;

  // Round each component FIRST, then sum the rounded parts. Rounding the sum
  // instead would leave the itemisation a cent off the total — and a price
  // that doesn't add up is a price the user can't check against Azure's rates.
  const inputCents = round2((billableInput / 1000) * INPUT_COST_PER_1K_CENTS);
  const outputCents = round2((billableOutput / 1000) * OUTPUT_COST_PER_1K_CENTS);
  const ocrCents = round2(prediction.requiresOcr ? (prediction.pages ?? 1) * OCR_COST_PER_PAGE_CENTS : 0);
  const azureCents = round2(inputCents + outputCents + ocrCents);

  return {
    currency: CURRENCY,
    model: AZURE_MODEL,
    inputCents,
    outputCents,
    ocrCents,
    azureCents,
    totalCents: round2(azureCents * MARGIN_MULTIPLIER),
    marginMultiplier: MARGIN_MULTIPLIER,
    isUpperBound: prediction.band != null,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const TOKEN_PREDICTION_CONFIG = {
  currency: CURRENCY,
  model: AZURE_MODEL,
  inputCostPer1kCents: INPUT_COST_PER_1K_CENTS,
  outputCostPer1kCents: OUTPUT_COST_PER_1K_CENTS,
  ocrCostPerPageCents: OCR_COST_PER_PAGE_CENTS,
  tokensPerScannedPage: TOKENS_PER_SCANNED_PAGE,
  scanBandPct: SCAN_BAND_PCT,
  outputTokenRatio: OUTPUT_TOKEN_RATIO,
  marginMultiplier: MARGIN_MULTIPLIER,
} as const;
