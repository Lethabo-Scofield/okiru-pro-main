import type { BlobServiceClient } from '@azure/storage-blob';
import { execFileSync, execSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import Tesseract from 'tesseract.js';
import { CertificateMetadataModel } from '../../models.js';
import { createLogger } from '../logger.js';
import { getCertContainerClient } from './azureCertStorage.js';
import {
  type CertificateExtractionMode,
  type CertificateExtractionStatus,
  MIN_USEFUL_EXTRACTED_TEXT_LENGTH,
  extractionStatusForText,
  hasUsefulExtractedText,
  usefulExtractedTextLength,
} from './certificateExtractionStatus.js';
import {
  extractTextWithAzureDocumentIntelligenceOnly,
  isDocumentIntelligenceConfigured,
} from './documentIntelligence.js';

const logger = createLogger('CertTextExtraction');
const TMP_DIR = join(tmpdir(), 'cert-text-extraction');
const RETRYABLE_STATUSES: CertificateExtractionStatus[] = ['pending', 'failed', 'missing_blob', 'text_too_short'];
export const DEFAULT_DRY_RUN_TEXT_EXTRACTION_LIMIT = 20;
export const DEFAULT_REAL_TEXT_EXTRACTION_LIMIT = 5;
export const MAX_TEXT_EXTRACTION_RETRY_LIMIT = 25;
export const DEFAULT_TEXT_EXTRACTION_FILE_TIMEOUT_MS = 120_000;
export const DEFAULT_METADATA_UPDATE_TIMEOUT_MS = 15_000;
export const MAX_TEXT_EXTRACTION_CONCURRENCY = 3;

type MongoDoc = Record<string, any>;

export type TextExtractionCoverageReport = {
  totalCertificates: number;
  usableExtractedText: number;
  missingExtractedText: number;
  textTooShort: number;
  failed: number;
  missingBlob: number;
  unsupported: number;
  pendingOrNotAttempted: number;
  byExtractionStatus: Record<string, number>;
  byExtractionMode: Record<string, number>;
  averageExtractedTextLength: number;
  topFailureReasons: Array<{ reason: string; count: number }>;
  dependencies: {
    azureDocumentIntelligenceConfigured: boolean;
    tesseractJsAvailable: boolean;
    pdftoppmAvailable: boolean;
  };
};

export type TextExtractionAttempt = {
  certificateId: string;
  blobName: string;
  fileName: string;
  previousStatus: CertificateExtractionStatus | null;
  nextStatus: CertificateExtractionStatus;
  previousTextLength: number;
  nextTextLength: number;
  extractionMode: CertificateExtractionMode;
  failureReason: string | null;
  failureReasons: string[];
  downloadSucceeded: boolean;
  timedOut: boolean;
  durationMs: number;
  updated: boolean;
  dryRun: boolean;
};

export type TextExtractionRetryOptions = {
  limit?: number;
  dryRun?: boolean;
  force?: boolean;
  includeDetails?: boolean;
  statuses?: CertificateExtractionStatus[];
  modes?: CertificateExtractionMode[];
  onlyMissingText?: boolean;
  fileTimeoutMs?: number;
  concurrency?: number;
};

export type TextExtractionRetryResult = {
  dryRun: boolean;
  limit: number;
  requestedLimit: number | null;
  maxLimit: number;
  concurrency: number;
  fileTimeoutMs: number;
  matched: number;
  retried: number;
  wouldRetry: number;
  updated: number;
  skipped: number;
  completed: number;
  textTooShort: number;
  failed: number;
  timedOut: number;
  durationMs: number;
  averageMsPerFile: number;
  results: TextExtractionAttempt[];
  summary: Record<string, number>;
  coverage: TextExtractionCoverageReport;
};

function normalizeReason(reason: unknown): string {
  if (typeof reason !== 'string' || !reason.trim()) return 'No extraction error recorded';
  return reason.replace(/\s+/g, ' ').trim().slice(0, 180);
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.floor(parsed);
}

function retryLimit(options: TextExtractionRetryOptions, dryRun: boolean): { limit: number; requestedLimit: number | null } {
  const requestedLimit = options.limit == null ? null : positiveInt(options.limit, dryRun ? DEFAULT_DRY_RUN_TEXT_EXTRACTION_LIMIT : DEFAULT_REAL_TEXT_EXTRACTION_LIMIT);
  const defaultLimit = dryRun ? DEFAULT_DRY_RUN_TEXT_EXTRACTION_LIMIT : DEFAULT_REAL_TEXT_EXTRACTION_LIMIT;
  return {
    limit: Math.min(requestedLimit ?? defaultLimit, MAX_TEXT_EXTRACTION_RETRY_LIMIT),
    requestedLimit,
  };
}

function retryConcurrency(value: unknown): number {
  return Math.min(positiveInt(value ?? process.env.CERT_EXTRACTION_CONCURRENCY, 1), MAX_TEXT_EXTRACTION_CONCURRENCY);
}

function retryFileTimeoutMs(value: unknown): number {
  return positiveInt(value ?? process.env.CERT_EXTRACTION_FILE_TIMEOUT_MS, DEFAULT_TEXT_EXTRACTION_FILE_TIMEOUT_MS);
}

function isTimeoutError(err: unknown): boolean {
  return err instanceof Error && err.name === 'CertificateExtractionTimeoutError';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fileName: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Certificate extraction timed out after ${timeoutMs}ms for ${fileName}`);
      err.name = 'CertificateExtractionTimeoutError';
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function withMetadataUpdateTimeout<T>(promise: Promise<T>, timeoutMs: number, fileName: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Certificate extraction metadata update timed out after ${timeoutMs}ms for ${fileName}`);
      err.name = 'CertificateExtractionMetadataUpdateTimeoutError';
      reject(err);
    }, timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function isPdftoppmAvailable(): boolean {
  try {
    execSync(`"${pdftoppmCommand()}" -h`, { stdio: 'ignore', timeout: 5_000 });
    return true;
  } catch {
    return false;
  }
}

function pdftoppmCommand(): string {
  const bundledPoppler = process.env.USERPROFILE
    ? join(process.env.USERPROFILE, '.cache', 'codex-runtimes', 'codex-primary-runtime', 'dependencies', 'native', 'poppler', 'Library', 'bin', 'pdftoppm.exe')
    : '';
  if (bundledPoppler && existsSync(bundledPoppler)) return bundledPoppler;
  return process.platform === 'win32' ? 'pdftoppm.cmd' : 'pdftoppm';
}

function isTesseractJsAvailable(): boolean {
  return typeof Tesseract?.recognize === 'function';
}

export function getTextExtractionDependencies() {
  return {
    azureDocumentIntelligenceConfigured: isDocumentIntelligenceConfigured(),
    tesseractJsAvailable: isTesseractJsAvailable(),
    pdftoppmAvailable: isPdftoppmAvailable(),
  };
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdf = await getDocument({
      data: new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)),
      useSystemFonts: true,
      disableFontFace: true,
    }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str || '').join(' ');
      if (pageText.trim()) pages.push(pageText.trim());
    }
    return pages.join('\n');
  } catch {
    return '';
  }
}

async function ocrImageBuffer(buffer: Buffer): Promise<string> {
  if (!isTesseractJsAvailable()) return '';
  try {
    const result = await Tesseract.recognize(buffer, 'eng', { logger: () => {} });
    return result.data.text.trim();
  } catch {
    return '';
  }
}

async function ocrPdfBuffer(buffer: Buffer, fileName: string, failureReasons: string[]): Promise<string> {
  if (!isPdftoppmAvailable()) {
    failureReasons.push('OCR skipped: pdftoppm is not installed or not callable');
    return '';
  }
  if (!isTesseractJsAvailable()) {
    failureReasons.push('OCR skipped: tesseract.js is not available');
    return '';
  }

  const workDir = join(TMP_DIR, createHash('sha1').update(`${fileName}:${Date.now()}`).digest('hex'));
  mkdirSync(workDir, { recursive: true });
  const pdfPath = join(workDir, 'input.pdf');
  writeFileSync(pdfPath, buffer);

  try {
    const outputPrefix = join(workDir, 'page');
    execSync(`"${pdftoppmCommand()}" -png -r 250 -l 5 "${pdfPath}" "${outputPrefix}"`, { timeout: 60_000, stdio: 'pipe' });
    const imageFiles = readdirSync(workDir).filter((f) => f.startsWith('page') && f.endsWith('.png')).sort();
    if (imageFiles.length === 0) {
      failureReasons.push('OCR failed: pdftoppm produced no page images');
      return '';
    }

    const pages: string[] = [];
    for (const image of imageFiles) {
      try {
        const result = await Tesseract.recognize(join(workDir, image), 'eng', { logger: () => {} });
        if (result.data.text.trim()) pages.push(result.data.text.trim());
      } catch (err: any) {
        failureReasons.push(`OCR page failed: ${err?.message || String(err)}`);
      }
    }
    return pages.join('\n');
  } catch (err: any) {
    failureReasons.push(`OCR failed: ${err?.message || String(err)}`);
    return '';
  } finally {
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

export async function extractCertificateTextFromBuffer(
  buffer: Buffer,
  fileName: string,
): Promise<{
  text: string;
  status: CertificateExtractionStatus;
  mode: CertificateExtractionMode;
  extractedTextLength: number;
  failureReason: string | null;
  failureReasons: string[];
}> {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const failureReasons: string[] = [];
  let text = '';
  let mode: CertificateExtractionMode = 'none';

  if (!['pdf', 'png', 'jpg', 'jpeg'].includes(ext)) {
    return {
      text: '',
      status: 'unsupported',
      mode: 'none',
      extractedTextLength: 0,
      failureReason: `Unsupported certificate file type: ${ext || 'unknown'}`,
      failureReasons: [`Unsupported certificate file type: ${ext || 'unknown'}`],
    };
  }

  const di = await extractTextWithAzureDocumentIntelligenceOnly(buffer, fileName);
  if (!di.configured) {
    failureReasons.push(di.error || 'Azure Document Intelligence is not configured');
  } else if (hasUsefulExtractedText(di.text)) {
    text = di.text;
    mode = 'azure_document_intelligence';
  } else {
    failureReasons.push(di.error || 'Azure Document Intelligence returned unusable text');
  }

  if (!hasUsefulExtractedText(text) && ext === 'pdf') {
    const pdfText = await extractPdfText(buffer);
    if (hasUsefulExtractedText(pdfText)) {
      text = pdfText;
      mode = 'pdf_text';
    } else if (usefulExtractedTextLength(pdfText) > usefulExtractedTextLength(text)) {
      text = pdfText;
      mode = 'pdf_text';
      failureReasons.push(`PDF text layer too short (${usefulExtractedTextLength(pdfText)} chars)`);
    } else {
      failureReasons.push('PDF text layer produced no usable text');
    }
  }

  if (!hasUsefulExtractedText(text) && ext === 'pdf') {
    const ocrText = await ocrPdfBuffer(buffer, fileName, failureReasons);
    if (usefulExtractedTextLength(ocrText) > usefulExtractedTextLength(text)) {
      text = ocrText;
      mode = 'ocr';
    }
  }

  if (!hasUsefulExtractedText(text) && ['png', 'jpg', 'jpeg'].includes(ext)) {
    const ocrText = await ocrImageBuffer(buffer);
    if (usefulExtractedTextLength(ocrText) > usefulExtractedTextLength(text)) {
      text = ocrText;
      mode = 'ocr';
    } else {
      failureReasons.push('Image OCR produced no usable text');
    }
  }

  const extractedTextLength = usefulExtractedTextLength(text);
  const status = extractionStatusForText(text);
  const failureReason = status === 'completed'
    ? null
    : failureReasons[0] || `No usable extracted text (${extractedTextLength} chars)`;

  return {
    text,
    status,
    mode: status === 'completed' ? mode : mode === 'none' ? 'none' : mode,
    extractedTextLength,
    failureReason,
    failureReasons,
  };
}

export async function getCertificateTextExtractionCoverage(): Promise<TextExtractionCoverageReport> {
  const [totalCerts, statusCounts, modeCounts, avgLenRows, failureRows, missingTextCount, usableTextCount, shortTextCount] = await Promise.all([
    CertificateMetadataModel.countDocuments(),
    CertificateMetadataModel.aggregate([
      { $group: { _id: '$extractionStatus', count: { $sum: 1 } } },
    ]),
    CertificateMetadataModel.aggregate([
      { $group: { _id: '$extractionMode', count: { $sum: 1 } } },
    ]),
    CertificateMetadataModel.aggregate([
      { $group: { _id: null, avg: { $avg: { $ifNull: ['$extractedTextLength', 0] } } } },
    ]),
    CertificateMetadataModel.aggregate([
      {
        $match: {
          extractionStatus: { $in: ['failed', 'missing_blob', 'unsupported', 'text_too_short'] },
        },
      },
      { $group: { _id: '$extractionError', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]),
    CertificateMetadataModel.countDocuments({
      $or: [
        { extractedText: { $in: [null, ''] } },
        { extractedTextLength: { $in: [null, 0] } },
      ],
    }),
    CertificateMetadataModel.countDocuments({
      extractedTextLength: { $gte: MIN_USEFUL_EXTRACTED_TEXT_LENGTH },
    }),
    CertificateMetadataModel.countDocuments({
      extractedTextLength: { $gt: 0, $lt: MIN_USEFUL_EXTRACTED_TEXT_LENGTH },
    }),
  ]);

  const statuses: Record<string, number> = {};
  for (const row of statusCounts) {
    const key = row._id || 'pending';
    statuses[key] = (statuses[key] || 0) + row.count;
  }

  const byExtractionMode: Record<string, number> = {};
  for (const row of modeCounts) {
    const key = row._id || 'none';
    byExtractionMode[key] = (byExtractionMode[key] || 0) + row.count;
  }

  return {
    totalCertificates: totalCerts,
    usableExtractedText: usableTextCount,
    missingExtractedText: missingTextCount,
    textTooShort: Math.max(statuses.text_too_short || 0, shortTextCount),
    failed: statuses.failed || 0,
    missingBlob: statuses.missing_blob || 0,
    unsupported: statuses.unsupported || 0,
    pendingOrNotAttempted: (statuses.pending || 0) + (statuses.null || 0),
    byExtractionStatus: statuses,
    byExtractionMode,
    averageExtractedTextLength: Math.round(Number(avgLenRows[0]?.avg || 0)),
    topFailureReasons: failureRows.map((row) => ({
      reason: normalizeReason(row._id),
      count: row.count,
    })),
    dependencies: getTextExtractionDependencies(),
  };
}

function weakOrMissingTextFilter() {
  return {
    $or: [
      { extractedTextLength: { $lt: MIN_USEFUL_EXTRACTED_TEXT_LENGTH } },
      { extractedTextLength: { $in: [null, 0] } },
      { extractedText: { $in: [null, ''] } },
    ],
  };
}

function retryFilter(
  force: boolean,
  statuses?: CertificateExtractionStatus[],
  modes?: CertificateExtractionMode[],
  onlyMissingText = true,
) {
  if (force) return {};
  const and: any[] = [];
  if (statuses?.length) {
    and.push({ extractionStatus: { $in: statuses } });
  } else {
    and.push({
      $or: [
        { extractionStatus: { $in: RETRYABLE_STATUSES } },
        weakOrMissingTextFilter(),
      ],
    });
  }
  if (modes?.length) {
    const selectedModes = modes.includes('none') ? Array.from(new Set([...modes, null])) : modes;
    and.push({ extractionMode: { $in: selectedModes } });
  }
  if (onlyMissingText) and.push(weakOrMissingTextFilter());
  return and.length === 1 ? and[0] : { $and: and };
}

export async function runCertificateTextExtractionRetryJob(
  blobServiceClient: BlobServiceClient,
  options: TextExtractionRetryOptions = {},
): Promise<TextExtractionRetryResult> {
  const startedAt = Date.now();
  const dryRun = options.dryRun !== false;
  const force = options.force === true;
  const includeDetails = options.includeDetails !== false;
  const { limit, requestedLimit } = retryLimit(options, dryRun);
  const concurrency = retryConcurrency(options.concurrency);
  const fileTimeoutMs = retryFileTimeoutMs(options.fileTimeoutMs);

  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const docs = await CertificateMetadataModel.find(
    {
      ...retryFilter(force, options.statuses, options.modes, options.onlyMissingText !== false),
      blobName: { $nin: [null, ''] },
    },
    {
      blobName: 1,
      fileName: 1,
      extractionStatus: 1,
      extractionMode: 1,
      extractedTextLength: 1,
      extractionError: 1,
    },
  )
    .sort({ extractionAttempts: 1, updatedAt: -1 })
    .limit(limit)
    .lean();

  const container = getCertContainerClient(blobServiceClient);
  const summary: Record<string, number> = {};
  let updated = 0;
  let timedOut = 0;

  async function processDoc(doc: MongoDoc): Promise<TextExtractionAttempt> {
    const attemptStartedAt = Date.now();
    const certificateId = String(doc.id || doc._id || '');
    const blobName = String(doc.blobName);
    const fileName = String(doc.fileName || blobName.split('/').pop() || blobName);
    const previousStatus = (doc.extractionStatus || null) as CertificateExtractionStatus | null;
    const previousTextLength = Number(doc.extractedTextLength || 0);
    let attempt: TextExtractionAttempt;

    try {
      const extracted = await withTimeout(
        (async () => {
          const buffer = await container.getBlobClient(blobName).downloadToBuffer();
          return extractCertificateTextFromBuffer(buffer, fileName);
        })(),
        fileTimeoutMs,
        fileName,
      );
      const failureReason = extracted.failureReason;
      summary[extracted.status] = (summary[extracted.status] || 0) + 1;

      attempt = {
        certificateId,
        blobName,
        fileName,
        previousStatus,
        nextStatus: extracted.status,
        previousTextLength,
        nextTextLength: extracted.extractedTextLength,
        extractionMode: extracted.mode,
        failureReason,
        failureReasons: extracted.failureReasons,
        downloadSucceeded: true,
        timedOut: false,
        durationMs: Date.now() - attemptStartedAt,
        updated: false,
        dryRun,
      };

      if (!dryRun) {
        const set: Record<string, unknown> = {
          extractionStatus: extracted.status,
          extractionMode: extracted.mode,
          extractedTextLength: extracted.extractedTextLength,
          extractionError: extracted.status === 'completed' ? null : failureReason,
          extractedAt: new Date(),
        };
        if (extracted.text.trim()) set.extractedText = extracted.text.substring(0, 4000);

        try {
          await withMetadataUpdateTimeout(
            CertificateMetadataModel.updateOne(
              { _id: doc._id },
              {
                $set: set,
                $inc: { extractionAttempts: 1 },
              },
            ).exec(),
            DEFAULT_METADATA_UPDATE_TIMEOUT_MS,
            fileName,
          );
          updated++;
          attempt.updated = true;
        } catch (updateErr: any) {
          const updateReason = updateErr?.message || String(updateErr);
          attempt.failureReasons.push(`Mongo update failed: ${updateReason}`);
          logger.error('Certificate text extraction retry update failed', {
            blobName,
            fileName,
            dryRun,
            extractionMode: attempt.extractionMode,
            extractedTextLength: attempt.nextTextLength,
            extractionStatus: attempt.nextStatus,
            durationMs: Date.now() - attemptStartedAt,
            error: updateReason,
          });
        }
      }

      logger.info('Certificate text extraction retry processed', {
        blobName,
        fileName,
        dryRun,
        downloadSucceeded: true,
        extractionMode: attempt.extractionMode,
        extractedTextLength: attempt.nextTextLength,
        extractionStatus: attempt.nextStatus,
        failureReason,
        durationMs: attempt.durationMs,
      });
    } catch (err: any) {
      const reason = err?.message || String(err);
      const attemptTimedOut = isTimeoutError(err);
      const nextStatus: CertificateExtractionStatus = attemptTimedOut
        ? 'failed'
        : /not\s*found|blobnotfound|404/i.test(reason)
        ? 'missing_blob'
        : 'failed';
      if (attemptTimedOut) timedOut++;
      summary[nextStatus] = (summary[nextStatus] || 0) + 1;
      attempt = {
        certificateId,
        blobName,
        fileName,
        previousStatus,
        nextStatus,
        previousTextLength,
        nextTextLength: 0,
        extractionMode: 'failed',
        failureReason: reason,
        failureReasons: [reason],
        downloadSucceeded: !attemptTimedOut && !/not\s*found|blobnotfound|404/i.test(reason),
        timedOut: attemptTimedOut,
        durationMs: Date.now() - attemptStartedAt,
        updated: false,
        dryRun,
      };

      if (!dryRun) {
        try {
          await withMetadataUpdateTimeout(
            CertificateMetadataModel.updateOne(
              { _id: doc._id },
              {
                $set: {
                  extractionStatus: nextStatus,
                  extractionMode: 'failed',
                  extractionError: reason,
                  extractedTextLength: 0,
                  extractedAt: new Date(),
                },
                $inc: { extractionAttempts: 1 },
              },
            ).exec(),
            DEFAULT_METADATA_UPDATE_TIMEOUT_MS,
            fileName,
          );
          updated++;
          attempt.updated = true;
        } catch (updateErr: any) {
          const updateReason = updateErr?.message || String(updateErr);
          attempt.failureReasons.push(`Mongo update failed: ${updateReason}`);
          logger.error('Certificate text extraction retry failure update failed', {
            blobName,
            fileName,
            dryRun,
            extractionStatus: nextStatus,
            durationMs: Date.now() - attemptStartedAt,
            error: updateReason,
          });
        }
      }

      logger.error('Certificate text extraction retry failed', {
        blobName,
        fileName,
        dryRun,
        downloadSucceeded: attempt.downloadSucceeded,
        extractionMode: 'failed',
        extractedTextLength: 0,
        extractionStatus: nextStatus,
        timedOut: attemptTimedOut,
        durationMs: attempt.durationMs,
        error: reason,
      });
    }

    return attempt;
  }

  const attempts = await runWithConcurrency(docs as MongoDoc[], concurrency, processDoc);
  const results = includeDetails ? attempts : [];
  const durationMs = Date.now() - startedAt;
  const completed = summary.completed || 0;
  const textTooShort = summary.text_too_short || 0;
  const failed = summary.failed || 0;
  const retried = dryRun ? 0 : docs.length;

  return {
    dryRun,
    limit,
    requestedLimit,
    maxLimit: MAX_TEXT_EXTRACTION_RETRY_LIMIT,
    concurrency,
    fileTimeoutMs,
    matched: docs.length,
    retried,
    wouldRetry: dryRun ? docs.length : 0,
    updated,
    skipped: 0,
    completed,
    textTooShort,
    failed,
    timedOut,
    durationMs,
    averageMsPerFile: docs.length ? Math.round(durationMs / docs.length) : 0,
    results,
    summary,
    coverage: await getCertificateTextExtractionCoverage(),
  };
}
