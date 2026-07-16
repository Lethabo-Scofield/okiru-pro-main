/**
 * The quote (flow step 5) — what the user is asked to pay before we spend a
 * cent on Azure.
 *
 * It is derived, not decided: every rand traces back to predicted Azure tokens
 * (see tokenPrediction.ts). The quote is free to produce — no Azure call, no
 * OCR, no vision, no extraction — which is the whole point: price first, work
 * second.
 *
 * Three line items, because they are the three things we actually do and the
 * three things the user is buying:
 *   1. Extraction        — the real Azure token + OCR cost (derived)
 *   2. Normalisation     — units, dates, percentages, B-BBEE levels
 *   3. Entity mapping    — suppliers/shareholders/contributions → workbook rows
 *
 * Normalisation and mapping are deterministic local work; their fees are flat
 * per document and are PLACEHOLDERS until priced. Extraction is the only line
 * that moves with the document.
 */
import path from 'node:path';
import { SUPPORTED_UPLOAD_MIME_TYPES, type UploadedFileLike } from './fileExtraction.js';
import {
  predictTokensForFile,
  azureCostFor,
  TOKEN_PREDICTION_CONFIG,
  type TokenPrediction,
  type DocumentKind,
} from './tokenPrediction.js';

export type ProcessingEffort = 'standard' | 'high';

export interface PricingQuoteFile {
  fileId: string;
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  detectedDocumentType: string;
  kind: DocumentKind;
  /** 'high' whenever the document needs OCR/vision — the expensive path. */
  processingEffort: ProcessingEffort;
  requiresOcr: boolean;
  tokens: {
    basis: TokenPrediction['basis'];
    input: number;
    expectedOutput: number;
    /** Present only for scans, where tokens can't be known before OCR. */
    band: { lowerTokens: number; upperTokens: number } | null;
  };
  structure: { pages: number | null; sheets: number | null; rows: number | null };
  pricing: {
    currency: string;
    /** The Azure cost for this document (upper bound if banded). */
    extractionCents: number;
    isUpperBound: boolean;
  };
  reasons: string[];
  warnings: string[];
}

export interface QuoteLineItem {
  key: 'extraction' | 'normalisation' | 'entity_mapping';
  label: string;
  detail: string;
  cents: number;
}

export interface PricingQuote {
  quoteId: string;
  status: 'quoted';
  currency: string;
  model: string;
  files: PricingQuoteFile[];
  lineItems: QuoteLineItem[];
  totals: {
    predictedInputTokens: number;
    predictedOutputTokens: number;
    /** Raw Azure cost before margin. */
    azureCents: number;
    /** What the user pays. */
    totalCents: number;
    /** True if any document was a scan, making the total an upper bound. */
    isUpperBound: boolean;
  };
  expiresAt: string;
  paymentRequired: true;
  paymentStatus: 'not_started';
  nextAction: 'proceed_to_payment';
  notes: string[];
}

const CURRENCY = process.env.PARSER_QUOTE_CURRENCY || 'ZAR';
const QUOTE_TTL_MINUTES = numEnv('PARSER_QUOTE_TTL_MINUTES', 30);
/** PLACEHOLDER flat fees per document — deterministic local work. */
const NORMALISATION_FEE_CENTS = numEnv('PARSER_NORMALISATION_FEE_CENTS', 150);
const MAPPING_FEE_CENTS = numEnv('PARSER_MAPPING_FEE_CENTS', 100);

function numEnv(name: string, fallback: number): number {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

function ext(filename: string): string {
  return path.extname(filename).toLowerCase();
}

function detectDocumentType(filename: string, mimeType: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('spend') || lower.includes('procurement') || lower.includes('supplier')) return 'Supplier evidence / schedule';
  if (lower.includes('affidavit')) return 'B-BBEE sworn affidavit';
  if (lower.includes('certificate') || lower.includes('b-bbee') || lower.includes('bbbee') || lower.includes('bee')) return 'B-BBEE certificate';
  if (lower.includes('ownership') || lower.includes('shareholder')) return 'Ownership confirmation';
  if (mimeType.includes('spreadsheet') || ['.xlsx', '.xls', '.csv'].includes(ext(filename))) return 'Tabular evidence';
  if (mimeType === 'application/pdf' || ext(filename) === '.pdf') return 'PDF evidence';
  if (mimeType.startsWith('image/')) return 'Image evidence';
  return 'General document evidence';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Quote a set of uploaded files. Free + deterministic: reads text layers and
 * structure only. Nothing here touches Azure.
 */
export async function quoteUploadedFiles(files: UploadedFileLike[]): Promise<PricingQuote> {
  const quotedFiles: PricingQuoteFile[] = [];
  let extractionCents = 0;
  let azureCents = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let anyUpperBound = false;

  for (const [index, file] of files.entries()) {
    if (!SUPPORTED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      throw new Error(`Unsupported file type ${file.mimetype}`);
    }

    const prediction = await predictTokensForFile(file);
    const cost = azureCostFor(prediction);

    extractionCents += cost.totalCents;
    azureCents += cost.azureCents;
    inputTokens += prediction.band ? prediction.band.upperTokens : prediction.inputTokens;
    outputTokens += prediction.expectedOutputTokens;
    if (cost.isUpperBound) anyUpperBound = true;

    quotedFiles.push({
      fileId: `quote_file_${index + 1}`,
      filename: file.originalname,
      mimeType: file.mimetype,
      fileSizeBytes: file.size,
      detectedDocumentType: detectDocumentType(file.originalname, file.mimetype),
      kind: prediction.kind,
      processingEffort: prediction.requiresOcr ? 'high' : 'standard',
      requiresOcr: prediction.requiresOcr,
      tokens: {
        basis: prediction.basis,
        input: prediction.inputTokens,
        expectedOutput: prediction.expectedOutputTokens,
        band: prediction.band,
      },
      structure: { pages: prediction.pages, sheets: prediction.sheets, rows: prediction.rows },
      pricing: { currency: CURRENCY, extractionCents: cost.totalCents, isUpperBound: cost.isUpperBound },
      reasons: prediction.reasons,
      warnings: [],
    });
  }

  const docCount = quotedFiles.length;
  const normalisationCents = round2(docCount * NORMALISATION_FEE_CENTS);
  const mappingCents = round2(docCount * MAPPING_FEE_CENTS);
  const scanCount = quotedFiles.filter((f) => f.requiresOcr).length;

  const lineItems: QuoteLineItem[] = [
    {
      key: 'extraction',
      label: 'Extraction',
      detail: `read ${docCount} document${docCount === 1 ? '' : 's'}${scanCount ? ` (${scanCount} scanned)` : ''} · ${inputTokens.toLocaleString()} predicted tokens`,
      cents: round2(extractionCents),
    },
    {
      key: 'normalisation',
      label: 'Normalisation',
      detail: 'units, dates, percentages, B-BBEE levels',
      cents: normalisationCents,
    },
    {
      key: 'entity_mapping',
      label: 'Entity mapping',
      detail: 'suppliers, shareholders, contributions → workbook',
      cents: mappingCents,
    },
  ];

  const totalCents = round2(lineItems.reduce((sum, li) => sum + li.cents, 0));

  const notes = [
    'Quote is derived from each document’s text layer and structure only.',
    'No Azure call, OCR, vision, extraction or scoring has been run yet.',
  ];
  if (anyUpperBound) {
    notes.push('Scanned documents are estimated from page count and quoted at the upper bound — you are never charged more than this.');
  }

  return {
    quoteId: `quote_${Date.now()}`,
    status: 'quoted',
    currency: CURRENCY,
    model: TOKEN_PREDICTION_CONFIG.model,
    files: quotedFiles,
    lineItems,
    totals: {
      predictedInputTokens: inputTokens,
      predictedOutputTokens: outputTokens,
      azureCents: round2(azureCents),
      totalCents,
      isUpperBound: anyUpperBound,
    },
    expiresAt: new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000).toISOString(),
    paymentRequired: true,
    paymentStatus: 'not_started',
    nextAction: 'proceed_to_payment',
    notes,
  };
}
