import { BlobServiceClient } from '@azure/storage-blob';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { writeFileSync, readdirSync, mkdirSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import Tesseract from 'tesseract.js';
import { CertificateMetadataModel } from '../../models.js';
import { createLogger } from '../logger.js';
import { normalizeVat } from './certificateStore.js';
import { extractTextWithDocIntelligence, isDocumentIntelligenceConfigured } from './documentIntelligence.js';
import { extractCertificateWithLLM, extractCertificatePreviewWithLLM, type CertificatePreviewExtraction } from './llmExtractor.js';
import { indexCertificate, isChromaConfigured } from './chromaStore.js';
import {
  getCertBlobServiceClient,
  getCertContainerClient,
} from './azureCertStorage.js';
import {
  type CertificateExtractionMode,
  extractionStatusForText,
  hasUsefulExtractedText,
  usefulExtractedTextLength,
} from './certificateExtractionStatus.js';

const logger = createLogger('CertExtractor');
const TMP_DIR = join(tmpdir(), 'cert-extract');

const MONTH_NAMES: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

function parseDate(dateStr: string): Date | null {
  const cleaned = dateStr.replace(/[,]/g, '').trim();

  const formats = [
    /(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{4})/i,
    /(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})\s+(\d{4})/i,
    /(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/,
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/,
  ];

  const m1 = formats[0].exec(cleaned);
  if (m1) {
    const month = MONTH_NAMES[m1[2].toLowerCase()];
    if (month !== undefined) return new Date(parseInt(m1[3]), month, parseInt(m1[1]));
  }

  const m2 = formats[1].exec(cleaned);
  if (m2) {
    const month = MONTH_NAMES[m2[1].toLowerCase()];
    if (month !== undefined) return new Date(parseInt(m2[3]), month, parseInt(m2[2]));
  }

  const m3 = formats[2].exec(cleaned);
  if (m3) return new Date(parseInt(m3[1]), parseInt(m3[2]) - 1, parseInt(m3[3]));

  const m4 = formats[3].exec(cleaned);
  if (m4) {
    const d = parseInt(m4[1]), mo = parseInt(m4[2]), y = parseInt(m4[3]);
    if (d > 12) return new Date(y, mo - 1, d);
    return new Date(y, mo - 1, d);
  }

  return null;
}

export interface ExtractedCertificateData {
  expiryDate: Date | null;
  issueDate: Date | null;
  bbbeeLevel: number | null;
  supplierName: string | null;
  vatNumber: string | null;
  companySize: string | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  verificationAgency: string | null;
  certificateNumber: string | null;
  bbbeeScore: number | null;
}

/**
 * Returns true when `name` looks like a genuine company name rather than
 * garbage data (all digits, placeholders, single characters, etc.).
 */
export function isValidSupplierName(name: string): boolean {
  const t = name.trim();
  if (t.length < 3) return false;
  if (/^\d+$/.test(t)) return false;                                   // pure number
  if (/^[^a-zA-Z]+$/.test(t)) return false;                           // no letters at all
  if ((t.match(/[a-zA-Z]/g) ?? []).length < 2) return false;          // fewer than 2 letters
  if (/^(?:null|undefined|n\/a|none|unknown|n\.?a\.?)$/i.test(t)) return false;
  return true;
}

const SIZE_CODE_PATTERN = /[\s_\-]+(EME|QSE|GEN|Generic(?:\s+Enterprise)?|Large(?:\s+Enterprise)?|Specialis[e]?d|Specialized)[\s_\-]*$/i;
const TRAILING_DATE_PATTERNS: RegExp[] = [
  // Mon-Year or MonYear: Jan2025, Jan-2025, Jan_2025
  /[\s_\-]+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s_\-]?\d{2,4}$/i,
  // Full ISO date: -2024-01-15 or _2024_01_15
  /[\s_\-]+\d{4}[\s_\-]\d{1,2}[\s_\-]\d{1,2}$/,
  // Year-Month: -2024-01
  /[\s_\-]+\d{4}[\s_\-]\d{1,2}$/,
  // Bare year: -2024 or _24
  /[\s_\-]+20\d{2}$/,
  /[\s_\-]+\d{2}$/,
];

/**
 * Clean a blob storage path or filename into a human-readable company name.
 * Handles patterns like `CompanyName-EME-Jan2025.pdf` and `uuid-CompanyName.pdf`.
 * Returns null if the result is not a valid supplier name.
 */
export function cleanNameFromBlobPath(blobNameOrPath: string): string | null {
  // Use only the filename part (strip org/folder prefix)
  const base = blobNameOrPath.includes('/') ? blobNameOrPath.split('/').pop()! : blobNameOrPath;

  // Strip UUID prefix added by the upload pipeline: 8-4-4-4-12 hex pattern
  let working = base.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '');

  // Strip file extension
  working = working.replace(/\.[^/.]+$/, '');

  // Strip leading date prefixes: 2024-01-15_, 20240115_, 2024_01_15, 2024_
  working = working
    .replace(/^\d{4}[\s_\-]+\d{1,2}[\s_\-]+\d{1,2}[\s_\-]+/, '')
    .replace(/^(?:19|20)\d{2}[\s._\-]+/, '');

  // Strip trailing size codes (possibly multiple, e.g. -QSE-2024)
  let changed = true;
  while (changed) {
    changed = false;
    const before = working;
    // Size codes
    working = working.replace(SIZE_CODE_PATTERN, '');
    // B-BBEE / certificate noise
    working = working
      .replace(/[\s_\-]+B[\s\-]?BBEE.*$/i, '')
      .replace(/[\s_\-]+Certificate.*$/i, '')
      .replace(/[\s_\-]+Affidavit.*$/i, '')
      .replace(/[\s_\-]+Scorecard.*$/i, '')
      .replace(/[\s_\-]+Verification.*$/i, '')
      .replace(/[\s_\-]+BEE$/i, '')
      .replace(/[\s_\-]*\(?\d+\)?$/, '');
    // Trailing date patterns (loop to handle stacked: -QSE-2024)
    for (const pat of TRAILING_DATE_PATTERNS) {
      working = working.replace(pat, '');
    }
    if (working !== before) changed = true;
  }

  // Normalise separators to spaces
  working = working
    .replace(/[_\-–—]+/gu, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!working) return null;

  // Title-case: capitalise first letter of each word; preserve known abbreviations
  const KEEP_UPPER = new Set(['PTY', 'LTD', 'CC', 'LLC', 'SA', 'NPC', 'RF', 'SOC', 'JV']);
  working = working.replace(/\b(\w+)/g, (word) => {
    const up = word.toUpperCase();
    if (KEEP_UPPER.has(up)) return up;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  if (!isValidSupplierName(working)) return null;
  return working.slice(0, 150);
}

/** @deprecated Prefer extractCertificateData — kept for call sites that only need date/level/name fields. */
export type ExtractedDates = Pick<
  ExtractedCertificateData,
  'expiryDate' | 'issueDate' | 'bbbeeLevel' | 'supplierName'
>;

function extractCompanySizeFromFileName(fileName: string): string | null {
  const base = fileName.replace(/\.[^/.]+$/, '');
  const m = /\s*-\s*(EME|QSE|Generic(?:\s+Enterprise)?|Large(?:\s+Enterprise)?)\s*$/i.exec(base);
  if (!m) return null;
  const raw = m[1].replace(/\s+/g, ' ').trim();
  const u = raw.toUpperCase();
  if (u === 'EME') return 'EME';
  if (u === 'QSE') return 'QSE';
  if (/^GENERIC/i.test(raw)) return 'Generic Enterprise';
  if (/^LARGE/i.test(raw)) return 'Large Enterprise';
  return raw;
}

function extractCompanySizeFromText(normalised: string): string | null {
  if (/\bLarge\s+Enterprise\b/i.test(normalised)) return 'Large Enterprise';
  if (/\bGeneric\s+Enterprise\b/i.test(normalised)) return 'Generic Enterprise';
  if (/\bQualifying\s+Small(?:\s+Enterprise)?\b/i.test(normalised) || /(?:^|[^\w])QSE(?:[^\w]|$)/i.test(normalised)) {
    return 'QSE';
  }
  if (/\bExempt\s+Micro(?:\s+Enterprise)?\b/i.test(normalised) || /(?:^|[^\w])EME(?:[^\w]|$)/i.test(normalised)) {
    return 'EME';
  }

  const entLine = /enterprise\s*classification[:\s]+([^\n]{3,80})/i.exec(normalised);
  if (entLine) {
    const fragment = entLine[1];
    if (/\bEME\b/i.test(fragment)) return 'EME';
    if (/\bQSE\b/i.test(fragment)) return 'QSE';
    if (/Generic/i.test(fragment)) return 'Generic Enterprise';
    if (/Large/i.test(fragment)) return 'Large Enterprise';
  }
  return null;
}

function parsePercentGroup(m: RegExpExecArray | null): number | null {
  if (!m) return null;
  const v = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(v) || v < 0 || v > 100) return null;
  return v;
}

function trimAgencyLabel(raw: string): string {
  return raw
    .replace(/\s{2,}/g, ' ')
    .replace(/[.,;:]+$/g, '')
    .trim()
    .slice(0, 120);
}

export function extractCertificateData(text: string, fileName: string): ExtractedCertificateData {
  const result: ExtractedCertificateData = {
    expiryDate: null,
    issueDate: null,
    bbbeeLevel: null,
    supplierName: null,
    vatNumber: null,
    companySize: null,
    blackOwnership: null,
    blackWomenOwnership: null,
    verificationAgency: null,
    certificateNumber: null,
    bbbeeScore: null,
  };

  const normalised = (text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const expiryPatterns = [
    /(?:expir(?:y|es|ation)\s*(?:date)?|valid\s*(?:until|to|through|till)|date\s*of\s*expir(?:y|ation)|certificate\s*expires?|validity\s*(?:period\s*)?(?:ends?|to|until)|end\s*date|not\s*valid\s*after)[:\s]*([^\n]{6,40})/gi,
  ];

  for (const pattern of expiryPatterns) {
    let match;
    while ((match = pattern.exec(normalised)) !== null) {
      const dateStr = match[1].trim();
      const parsed = parseDate(dateStr);
      if (parsed && !isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020 && parsed.getFullYear() <= 2035) {
        result.expiryDate = parsed;
        break;
      }
    }
    if (result.expiryDate) break;
  }

  if (!result.expiryDate) {
    const looseDatePattern = /(\d{1,2}\s+(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4})/gi;
    const allDates: Date[] = [];
    let m;
    while ((m = looseDatePattern.exec(normalised)) !== null) {
      const d = parseDate(m[1]);
      if (d && !isNaN(d.getTime()) && d.getFullYear() >= 2020 && d.getFullYear() <= 2035) {
        allDates.push(d);
      }
    }
    if (allDates.length > 0) {
      allDates.sort((a, b) => b.getTime() - a.getTime());
      result.expiryDate = allDates[0];
      if (allDates.length > 1) {
        result.issueDate = allDates[allDates.length - 1];
      }
    }
  }

  const issuePatterns = [
    /(?:(?:date\s*(?:of\s*)?)?issue[d]?|issued?\s*(?:on|date)|certificate\s*date|date\s*issued)[:\s]*([^\n]{6,40})/gi,
  ];
  if (!result.issueDate) {
    for (const pattern of issuePatterns) {
      let match;
      while ((match = pattern.exec(normalised)) !== null) {
        const dateStr = match[1].trim();
        const parsed = parseDate(dateStr);
        if (parsed && !isNaN(parsed.getTime()) && parsed.getFullYear() >= 2020 && parsed.getFullYear() <= 2035) {
          result.issueDate = parsed;
          break;
        }
      }
      if (result.issueDate) break;
    }
  }

  const levelMatch = /(?:b-?bbee|bee|broad.?based)\s*(?:status\s*)?level\s*[:\s]*(\d)/i.exec(normalised);
  if (levelMatch) {
    const level = parseInt(levelMatch[1], 10);
    if (level >= 1 && level <= 8) result.bbbeeLevel = level;
  }

  const shortName = fileName.includes('/') ? fileName.split('/').pop()! : fileName;

  // --- Supplier name: text patterns first, filename fallback ---
  const textNamePatterns: RegExp[] = [
    /(?:company\s*name|registered\s*(?:company\s*)?name|entity\s*(?:name)?|supplier\s*(?:name)?|organisation(?:al)?\s*(?:name)?|name\s*of\s*(?:entity|company|organisation))[:\s]+([^\n\r]{3,120})/i,
    /(?:this\s+certificate\s+(?:is\s+)?issued\s+to|certificate\s+(?:is\s+)?issued\s+to|issued\s+to)[:\s]+([^\n\r]{3,120})/i,
    /(?:trading\s+(?:as|name))[:\s]+([^\n\r]{3,120})/i,
  ];
  for (const p of textNamePatterns) {
    const m = p.exec(normalised);
    if (m) {
      // Strip trailing noise: extra whitespace runs, leading label bleed
      const raw = m[1].split(/\s{3,}|\t/)[0].replace(/[.,;:]+$/, '').trim();
      if (isValidSupplierName(raw)) {
        result.supplierName = raw.slice(0, 150);
        break;
      }
    }
  }
  // Filename fallback: use cleanNameFromBlobPath for robust date/size stripping + title case
  if (!result.supplierName) {
    const blobDerived = cleanNameFromBlobPath(shortName);
    if (blobDerived) {
      result.supplierName = blobDerived;
    }
  }

  result.companySize = extractCompanySizeFromText(normalised) || extractCompanySizeFromFileName(shortName);

  // SA VAT registration numbers are exactly 10 digits and always start with 4.
  const vatMatch =
    /(?:vat|value\s*added\s*tax|tax\s*registration)(?:\s*(?:no|number|nr\.?|reg\.?\s*(?:no\.?|number)?))?[:\s#-]*(4[\d\s]{9,13})/i.exec(
      normalised,
    ) || /\b(?:vat|tin)\s*[#:]?\s*(4[\d\s]{9,13})\b/i.exec(normalised);
  if (vatMatch) {
    const digits = vatMatch[1].replace(/\D/g, '');
    if (digits.length === 10 && digits.startsWith('4')) {
      result.vatNumber = digits;
    }
  }

  const womenPct =
    parsePercentGroup(/black\s*wom(?:en|an)[^\d%]{0,50}?(\d{1,3}(?:[.,]\d+)?)\s*%/i.exec(normalised)) ??
    parsePercentGroup(/(\d{1,3}(?:[.,]\d+)?)\s*%\s*black\s*wom(?:en|an)/i.exec(normalised));
  if (womenPct !== null) result.blackWomenOwnership = womenPct;

  const blackPct =
    parsePercentGroup(
      /black\s*(?:economic\s*interest|ownership|shareholding)[^\d%]{0,50}?(\d{1,3}(?:[.,]\d+)?)\s*%/i.exec(
        normalised,
      ),
    ) ??
    parsePercentGroup(/(\d{1,3}(?:[.,]\d+)?)\s*%\s*black\s*own(?:ed|ership)?/i.exec(normalised)) ??
    parsePercentGroup(/(\d{1,3}(?:[.,]\d+)?)\s*%\s*b(?:l)?ack\s*owned\b/i.exec(normalised));
  if (blackPct !== null) result.blackOwnership = blackPct;

  const scoreMatch = /(?:overall\s*score|total\s*score|bbbee\s*score|score\s*achieved)[:\s]*(\d{1,3}(?:[.,]\d+)?)/i.exec(
    normalised,
  );
  if (scoreMatch) {
    const score = parseFloat(scoreMatch[1].replace(',', '.'));
    if (Number.isFinite(score) && score >= 0 && score <= 130) result.bbbeeScore = score;
  }

  let agency: string | null = null;
  const agencyMatch1 =
    /(?:verification\s*agency|verified\s*by|issued\s*by|verification\s*by)[:\s]+([A-Za-z0-9][A-Za-z0-9&.,'\- ]{2,80})/i.exec(
      normalised,
    );
  if (agencyMatch1) agency = trimAgencyLabel(agencyMatch1[1]);

  if (!agency) {
    const named = /\b((?:[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*){1,4}\s+(?:Verification|Analytics|Consulting|Services)(?:\s+(?:\(Pty\)|Pty|Ltd|Limited|Inc)\.?)?)\b/.exec(
      normalised,
    );
    if (named) agency = trimAgencyLabel(named[1]);
  }
  if (!agency) {
    const sanas2 = /\bSANAS\b[^\n]{0,100}?\b([A-Za-z][A-Za-z&.\- ]{3,60}(?:accredited|verification|agency))\b/i.exec(
      normalised,
    );
    if (sanas2) agency = trimAgencyLabel(sanas2[1]);
  }
  result.verificationAgency = agency;

  const certSlash = /(?:certificate\s*(?:no|number|#)|cert\s*no)[:\s.#-]*(\d{4}\/\d{2,8})/i.exec(normalised);
  const certWide =
    /(?:certificate\s*(?:no|number|#)|cert\s*no)[:\s.#-]*([A-Z0-9][A-Z0-9\-_/]{3,30})/i.exec(normalised);
  const rawCert = certSlash?.[1] || certWide?.[1] || null;
  if (rawCert) {
    result.certificateNumber = rawCert.toUpperCase().replace(/_/g, '-');
  }

  return result;
}

/** Backward-compatible subset used by older imports and tests. */
export function extractDatesFromText(text: string, fileName: string): ExtractedDates {
  const e = extractCertificateData(text, fileName);
  return {
    expiryDate: e.expiryDate,
    issueDate: e.issueDate,
    bbbeeLevel: e.bbbeeLevel,
    supplierName: e.supplierName,
  };
}

async function extractTextFromPdf(buffer: ArrayBuffer): Promise<string> {
  try {
    const pdf = await getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      disableFontFace: true,
    }).promise;

    const pages: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str || '').join(' ');
      pages.push(pageText);
    }
    return pages.join('\n');
  } catch {
    return '';
  }
}

async function ocrImage(imageBuffer: Buffer): Promise<string> {
  try {
    const result = await Tesseract.recognize(imageBuffer, 'eng', { logger: () => {} });
    return result.data.text.trim();
  } catch {
    return '';
  }
}

async function ocrPdf(pdfBuffer: Buffer, fileName: string): Promise<string> {
  const workDir = join(TMP_DIR, createHash('md5').update(fileName).digest('hex'));
  if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });

  const pdfPath = join(workDir, 'input.pdf');
  writeFileSync(pdfPath, pdfBuffer);

  try {
    const outputPrefix = join(workDir, 'page');
    execSync(`pdftoppm -png -r 200 -l 3 "${pdfPath}" "${outputPrefix}"`, {
      timeout: 30000,
      stdio: 'pipe',
    });

    const imageFiles = readdirSync(workDir).filter(f => f.startsWith('page') && f.endsWith('.png')).sort();
    if (imageFiles.length === 0) return '';

    const allText: string[] = [];
    for (const imgFile of imageFiles) {
      const imgPath = join(workDir, imgFile);
      try {
        const result = await Tesseract.recognize(imgPath, 'eng', { logger: () => {} });
        if (result.data.text.trim()) allText.push(result.data.text.trim());
      } catch {}
    }
    return allText.join('\n');
  } catch {
    return '';
  } finally {
    try { rmSync(workDir, { recursive: true, force: true }); } catch {}
  }
}

function computeStatus(expiryDate: Date | null): 'valid' | 'expiring' | 'expired' | 'unknown' {
  if (!expiryDate) return 'unknown';
  const now = new Date();
  const sixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
  if (expiryDate < now) return 'expired';
  if (expiryDate <= sixtyDays) return 'expiring';
  return 'valid';
}

export async function processOneCertificate(
  blobServiceClient: BlobServiceClient,
  blobName: string,
  force = false,
): Promise<{ blobName: string; status: string; expiryDate: Date | null }> {
  const existing = await CertificateMetadataModel.findOne({ blobName });
  if (existing && existing.extractionStatus === 'completed' && !force) {
    return { blobName, status: 'skipped', expiryDate: existing.expiryDate };
  }

  const containerClient = getCertContainerClient(blobServiceClient);
  const blobClient = containerClient.getBlobClient(blobName);
  const fileName = blobName.includes('/') ? blobName.split('/').pop()! : blobName;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  let text = '';
  let extractionMode: CertificateExtractionMode = 'none';
  try {
    const downloaded = await blobClient.downloadToBuffer();

    if (ext === 'pdf') {
      if (isDocumentIntelligenceConfigured()) {
        text = await extractTextWithDocIntelligence(downloaded, fileName);
        if (hasUsefulExtractedText(text)) extractionMode = 'pdf_text';
      }
      if (!hasUsefulExtractedText(text)) {
        text = await extractTextFromPdf(downloaded.buffer as ArrayBuffer);
        if (hasUsefulExtractedText(text)) extractionMode = 'pdf_text';
      }
      if (!hasUsefulExtractedText(text)) {
        logger.info('PDF has no usable text layer, trying OCR', { blobName, fileName });
        text = await ocrPdf(downloaded, fileName);
        if (hasUsefulExtractedText(text)) extractionMode = 'ocr';
      }
    } else if (['png', 'jpg', 'jpeg'].includes(ext)) {
      if (isDocumentIntelligenceConfigured()) {
        text = await extractTextWithDocIntelligence(downloaded, fileName);
        if (hasUsefulExtractedText(text)) extractionMode = 'pdf_text';
      }
      if (!hasUsefulExtractedText(text)) {
        text = await ocrImage(downloaded);
        if (hasUsefulExtractedText(text)) extractionMode = 'ocr';
      }
    }
  } catch (err: any) {
    logger.error('Certificate extraction failed', {
      blobName,
      fileName,
      downloadSucceeded: false,
      extractionMode: 'failed',
      extractedTextLength: 0,
      extractionStatus: 'failed',
      error: err.message,
    });
    await CertificateMetadataModel.findOneAndUpdate(
      { blobName },
      {
        $set: {
          blobName,
          fileName,
          extractionStatus: 'failed',
          extractionMode: 'failed',
          extractionError: err.message,
          extractedTextLength: 0,
          extractedAt: new Date(),
          processedAt: new Date(),
        },
        $inc: { extractionAttempts: 1 },
      },
      { upsert: true },
    );
    return { blobName, status: 'error', expiryDate: null };
  }

  const extractedTextLength = usefulExtractedTextLength(text);
  const extractionStatus = extractionStatusForText(text);
  if (extractionStatus !== 'completed') {
    const companySize = extractCompanySizeFromFileName(fileName);
    const emptyTextUpdates: Record<string, unknown> = {
      blobName,
      fileName,
      extractionStatus,
      extractionMode: companySize ? 'filename_only' : extractionMode,
      extractedTextLength,
      extractionError: `No usable extracted text (${extractedTextLength} chars)`,
      extractedAt: new Date(),
      processedAt: new Date(),
    };
    if (companySize) emptyTextUpdates.companySize = companySize;

    logger.warn('Certificate extraction produced no usable text', {
      blobName,
      fileName,
      downloadSucceeded: true,
      extractionMode: emptyTextUpdates.extractionMode,
      extractedTextLength,
      extractionStatus,
      error: emptyTextUpdates.extractionError,
    });
    await CertificateMetadataModel.findOneAndUpdate(
      { blobName },
      {
        $set: emptyTextUpdates,
        $setOnInsert: { createdAt: new Date() },
        $inc: { extractionAttempts: 1 },
      },
      { upsert: true, new: true },
    );
    return { blobName, status: extractionStatus, expiryDate: null };
  }

  const extracted = await extractCertificateWithLLM(text, fileName);
  const blobDerivedName = cleanNameFromBlobPath(blobName);
  if (blobDerivedName) extracted.supplierName = blobDerivedName;

  const certStatus = computeStatus(extracted.expiryDate);
  const vatNumberNormalized = normalizeVat(extracted.vatNumber);

  await CertificateMetadataModel.findOneAndUpdate(
    { blobName },
    {
      blobName,
      fileName,
      expiryDate: extracted.expiryDate,
      issueDate: extracted.issueDate,
      supplierName: extracted.supplierName,
      vatNumber: extracted.vatNumber,
      vatNumberNormalized,
      companySize: extracted.companySize,
      bbbeeLevel: extracted.bbbeeLevel,
      bbbeeScore: extracted.bbbeeScore,
      blackOwnership: extracted.blackOwnership,
      blackWomenOwnership: extracted.blackWomenOwnership,
      verificationAgency: extracted.verificationAgency,
      certificateNumber: extracted.certificateNumber,
      status: certStatus,
      extractedText: text.substring(0, 4000),
      extractionStatus: 'completed',
      extractionMode,
      extractedTextLength,
      extractionError: null,
      extractedAt: new Date(),
      processedAt: new Date(),
    },
    { upsert: true, new: true },
  );

  logger.info('Processed certificate', {
    blobName,
    fileName,
    downloadSucceeded: true,
    expiryDate: extracted.expiryDate?.toISOString() ?? null,
    bbbeeLevel: extracted.bbbeeLevel,
    vatNumber: extracted.vatNumber,
    companySize: extracted.companySize,
    status: certStatus,
    extractionMode,
    extractedTextLength,
    extractionStatus: 'completed',
  });

  if (isChromaConfigured() && text.trim()) {
    void indexCertificate(blobName, text, {
      supplierName: extracted.supplierName ?? '',
      vatNumber: extracted.vatNumber ?? '',
      bbbeeLevel: extracted.bbbeeLevel ?? '',
      companySize: extracted.companySize ?? '',
      status: certStatus,
      expiryDate: extracted.expiryDate?.toISOString() ?? '',
    });
  }

  return { blobName, status: certStatus, expiryDate: extracted.expiryDate };
}

export async function processAllCertificates(
  blobServiceClient: BlobServiceClient,
  force = false,
  onProgress?: (done: number, total: number) => void,
): Promise<{ processed: number; skipped: number; errors: number }> {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const containerClient = getCertContainerClient(blobServiceClient);
  const blobs: string[] = [];
  for await (const blob of containerClient.listBlobsFlat()) {
    blobs.push(blob.name);
  }

  let processed = 0, skipped = 0, errors = 0;
  for (let i = 0; i < blobs.length; i++) {
    const result = await processOneCertificate(blobServiceClient, blobs[i], force);
    if (result.status === 'skipped') skipped++;
    else if (result.status === 'error') errors++;
    else processed++;

    onProgress?.(i + 1, blobs.length);
  }

  return { processed, skipped, errors };
}

export async function getCertificateStats(): Promise<{
  total: number;
  valid: number;
  expiring: number;
  expired: number;
  unknown: number;
  processed: number;
  pending: number;
}> {
  const [statusCounts, extractionCounts, total] = await Promise.all([
    CertificateMetadataModel.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    CertificateMetadataModel.aggregate([
      { $group: { _id: '$extractionStatus', count: { $sum: 1 } } },
    ]),
    CertificateMetadataModel.countDocuments(),
  ]);

  const now = new Date();
  const sixtyDays = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);

  const freshCounts = await CertificateMetadataModel.aggregate([
    { $match: { extractionStatus: 'completed', expiryDate: { $ne: null } } },
    {
      $group: {
        _id: null,
        valid: { $sum: { $cond: [{ $gt: ['$expiryDate', sixtyDays] }, 1, 0] } },
        expiring: { $sum: { $cond: [{ $and: [{ $lte: ['$expiryDate', sixtyDays] }, { $gte: ['$expiryDate', now] }] }, 1, 0] } },
        expired: { $sum: { $cond: [{ $lt: ['$expiryDate', now] }, 1, 0] } },
      },
    },
  ]);

  const counts = freshCounts[0] || { valid: 0, expiring: 0, expired: 0 };
  const noExpiry = await CertificateMetadataModel.countDocuments({ extractionStatus: 'completed', expiryDate: null });

  const extractionMap: Record<string, number> = {};
  for (const e of extractionCounts) extractionMap[e._id] = e.count;

  return {
    total,
    valid: counts.valid,
    expiring: counts.expiring,
    expired: counts.expired,
    unknown: noExpiry + (extractionMap['failed'] || 0),
    processed: (extractionMap['completed'] || 0),
    pending: extractionMap['pending'] || 0,
  };
}

function normalizePreviewCompanySize(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (/^eme$/i.test(s)) return 'EME';
  if (/^qse$/i.test(s)) return 'QSE';
  if (/generic/i.test(s)) return 'Generic';
  if (/large/i.test(s)) return 'Large';
  if (/special/i.test(s)) return 'Specialised';
  return s;
}

/** Extract certificate fields from an uploaded file buffer (MAIA preview — no persistence). */
export async function extractPreviewFromBuffer(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<CertificatePreviewExtraction & { sectorDetected: boolean }> {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  let text = '';

  if (ext === 'pdf' || mimeType === 'application/pdf') {
    if (isDocumentIntelligenceConfigured()) {
      text = await extractTextWithDocIntelligence(buffer, fileName);
    }
    if (!text.trim()) {
      text = await extractTextFromPdf(buffer.buffer as ArrayBuffer);
    }
    if (!text.trim()) {
      text = await ocrPdf(buffer, fileName);
    }
  } else if (['png', 'jpg', 'jpeg'].includes(ext) || mimeType.startsWith('image/')) {
    if (isDocumentIntelligenceConfigured()) {
      text = await extractTextWithDocIntelligence(buffer, fileName);
    }
    if (!text.trim()) {
      text = await ocrImage(buffer);
    }
  }

  const extracted = await extractCertificatePreviewWithLLM(text, fileName);
  const sectorDetected = extracted.sectorConfidence === 'high' && !!extracted.sectorCode;

  return {
    ...extracted,
    companySize: normalizePreviewCompanySize(extracted.companySize),
    sectorDetected,
  };
}

export function previewExtractionToFormJson(extracted: CertificatePreviewExtraction & { sectorDetected?: boolean }) {
  return {
    supplierName: extracted.supplierName,
    vatNumber: extracted.vatNumber,
    companySize: normalizePreviewCompanySize(extracted.companySize),
    bbbeeLevel: extracted.bbbeeLevel,
    blackOwnership: extracted.blackOwnership,
    blackWomenOwnership: extracted.blackWomenOwnership,
    expiryDate: extracted.expiryDate ? extracted.expiryDate.toISOString().slice(0, 10) : null,
    issueDate: extracted.issueDate ? extracted.issueDate.toISOString().slice(0, 10) : null,
    verificationAgency: extracted.verificationAgency,
    certificateNumber: extracted.certificateNumber,
    sectorCode: extracted.sectorDetected ? extracted.sectorCode : null,
    sectorDetected: !!extracted.sectorDetected,
  };
}
