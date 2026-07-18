/**
 * The quote (flow step 5) — what the user is asked to pay before we spend a
 * cent on Azure.
 *
 * It is derived, not decided: every rand traces back to predicted Azure tokens
 * (see tokenPrediction.ts). The quote is free to produce — no Azure call, no
 * OCR, no vision, no extraction — which is the whole point: price first, work
 * second.
 *
 * One price for the whole job: read the documents, make the extracted values
 * mapper-ready, and place them in the workbook — one pipeline, one line. The
 * price is the predicted Azure cost, floored to what a card can actually settle
 * (see MINIMUM_CHARGE_CENTS). Normalisation/mapping only ever get their own line
 * if they carry a fee of their own; by default they fold into processing.
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
  key: 'extraction' | 'normalisation' | 'entity_mapping' | 'minimum_charge';
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
  /**
   * What Azure itself will charge, itemised — the quote is derived from exactly
   * this, so the user can see the price is Azure's, not ours.
   */
  azureBreakdown: {
    model: string;
    inputTokens: number;
    inputCents: number;
    outputTokens: number;
    outputCents: number;
    ocrPages: number;
    ocrCents: number;
    marginMultiplier: number;
  };
  expiresAt: string;
  paymentRequired: true;
  paymentStatus: 'not_started';
  nextAction: 'proceed_to_payment';
  notes: string[];
}

const CURRENCY = process.env.PARSER_QUOTE_CURRENCY || 'ZAR';
const QUOTE_TTL_MINUTES = numEnv('PARSER_QUOTE_TTL_MINUTES', 30);
/**
 * The quote IS the predicted Azure cost of the whole job — so anything that
 * does not call Azure adds nothing to it. Normalisation and entity mapping are
 * deterministic local work today (regex + ontology + the workbook mapper), so
 * they carry no model cost and default to 0.
 *
 * These stay configurable for the day either step starts calling the model (or
 * a margin is wanted), but they must never be used to invent a price that
 * isn't grounded in real Azure spend.
 */
const NORMALISATION_FEE_CENTS = numEnv('PARSER_NORMALISATION_FEE_CENTS', 0);
const MAPPING_FEE_CENTS = numEnv('PARSER_MAPPING_FEE_CENTS', 0);
/**
 * The floor a card payment can actually settle at.
 *
 * Pricing at pure Azure cost produces sub-cent amounts (reading three
 * documents costs Azure a few hundredths of a cent). No card processor can
 * charge that — a card processor's practical minimum is around R2.00 — so without a floor
 * the checkout simply fails with "amount must be positive".
 *
 * This is the one place the price is NOT purely Azure's: when the true cost is
 * below the floor we charge the floor, and we say so on the quote rather than
 * quietly inflating the Azure figure. Set to 0 only if payment moves to
 * prepaid credits or monthly aggregation, where a per-job floor stops applying.
 */
const MINIMUM_CHARGE_CENTS = numEnv('PARSER_MINIMUM_CHARGE_CENTS', 200);

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
  // Itemised Azure spend — the quote is nothing more than the sum of these.
  let azInputCents = 0;
  let azOutputCents = 0;
  let azOcrCents = 0;
  let ocrPages = 0;

  for (const [index, file] of files.entries()) {
    if (!SUPPORTED_UPLOAD_MIME_TYPES.has(file.mimetype)) {
      throw new Error(`Unsupported file type ${file.mimetype}`);
    }

    const prediction = await predictTokensForFile(file);
    const cost = azureCostFor(prediction);

    extractionCents += cost.totalCents;
    azureCents += cost.azureCents;
    azInputCents += cost.inputCents;
    azOutputCents += cost.outputCents;
    azOcrCents += cost.ocrCents;
    if (prediction.requiresOcr) ocrPages += prediction.pages ?? 1;
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

  // One price for the whole job. Extraction reads the documents; normalisation
  // then makes the extracted values mapper-ready and mapping places them in the
  // workbook — one continuous pipeline, priced together. We only itemise
  // normalisation / mapping as their own lines if they ever carry a fee of
  // their own; by default they fold into processing.
  const lineItems: QuoteLineItem[] = [
    {
      key: 'extraction',
      label: 'Document processing',
      detail: `${docCount} document${docCount === 1 ? '' : 's'}${scanCount ? ` · ${scanCount} scanned` : ''} · ~${inputTokens.toLocaleString()} tokens`,
      cents: round2(extractionCents + normalisationCents + mappingCents),
    },
  ];
  if (normalisationCents > 0) {
    lineItems.push({ key: 'normalisation', label: 'Normalisation', detail: 'units, dates, percentages, B-BBEE levels', cents: normalisationCents });
    lineItems[0].cents = round2(lineItems[0].cents - normalisationCents);
  }
  if (mappingCents > 0) {
    lineItems.push({ key: 'entity_mapping', label: 'Entity mapping', detail: 'suppliers, shareholders, contributions → workbook', cents: mappingCents });
    lineItems[0].cents = round2(lineItems[0].cents - mappingCents);
  }

  const derivedCents = round2(lineItems.reduce((sum, li) => sum + li.cents, 0));

  // Apply the card-payment floor, visibly. The user sees the true Azure cost
  // AND the amount that will actually be charged — we never dress the Azure
  // figure up to reach the minimum.
  const minimumApplies = MINIMUM_CHARGE_CENTS > 0 && derivedCents < MINIMUM_CHARGE_CENTS;
  if (minimumApplies) {
    lineItems.push({
      key: 'minimum_charge',
      label: 'Minimum charge',
      detail: `this job costs ${CURRENCY} ${(derivedCents / 100).toFixed(4)} to run — card payments can’t settle below ${CURRENCY} ${(MINIMUM_CHARGE_CENTS / 100).toFixed(2)}`,
      cents: round2(MINIMUM_CHARGE_CENTS - derivedCents),
    });
  }
  const totalCents = minimumApplies ? round2(MINIMUM_CHARGE_CENTS) : derivedCents;

  const notes = [
    'Quote is derived from each document’s text layer and structure only.',
    'No Azure call, OCR, vision, extraction or scoring has been run yet.',
    `This price is the predicted Azure cost for ${TOKEN_PREDICTION_CONFIG.model} — tokens plus OCR pages — worked out before the model is called.`,
  ];
  if (anyUpperBound) {
    notes.push('Scanned documents are estimated from page count and quoted at the upper bound — you are never charged more than this.');
  }
  if (minimumApplies) {
    notes.push(
      `The Azure cost of this job is ${CURRENCY} ${(derivedCents / 100).toFixed(4)}, which is below what a card payment can settle, so the ${CURRENCY} ${(MINIMUM_CHARGE_CENTS / 100).toFixed(2)} minimum applies.`,
    );
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
    azureBreakdown: {
      model: TOKEN_PREDICTION_CONFIG.model,
      inputTokens,
      inputCents: round2(azInputCents),
      outputTokens,
      outputCents: round2(azOutputCents),
      ocrPages,
      ocrCents: round2(azOcrCents),
      marginMultiplier: TOKEN_PREDICTION_CONFIG.marginMultiplier,
    },
    expiresAt: new Date(Date.now() + QUOTE_TTL_MINUTES * 60 * 1000).toISOString(),
    paymentRequired: true,
    paymentStatus: 'not_started',
    nextAction: 'proceed_to_payment',
    notes,
  };
}
