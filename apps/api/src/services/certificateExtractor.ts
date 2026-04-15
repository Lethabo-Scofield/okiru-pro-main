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

const logger = createLogger('CertExtractor');
const CONTAINER_NAME = 'clients-certs';
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

interface ExtractedDates {
  expiryDate: Date | null;
  issueDate: Date | null;
  bbbeeLevel: number | null;
  supplierName: string | null;
}

export function extractDatesFromText(text: string, fileName: string): ExtractedDates {
  const result: ExtractedDates = { expiryDate: null, issueDate: null, bbbeeLevel: null, supplierName: null };
  if (!text) return result;

  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

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
    const level = parseInt(levelMatch[1]);
    if (level >= 1 && level <= 8) result.bbbeeLevel = level;
  }

  const nameFromFile = fileName.replace(/^\d{4}\s+\d{2}\s+\d{1,2}\s+/, '').replace(/\s*-\s*(EME|QSE|Generic|Large).*$/i, '').trim();
  if (nameFromFile && nameFromFile !== fileName) {
    result.supplierName = nameFromFile;
  }

  return result;
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

  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
  const blobClient = containerClient.getBlobClient(blobName);
  const fileName = blobName.includes('/') ? blobName.split('/').pop()! : blobName;
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  let text = '';
  try {
    const downloaded = await blobClient.downloadToBuffer();

    if (ext === 'pdf') {
      text = await extractTextFromPdf(downloaded.buffer as ArrayBuffer);
      if (!text.trim()) {
        logger.info('PDF has no text layer, trying OCR', { fileName });
        text = await ocrPdf(downloaded, fileName);
      }
    } else if (['png', 'jpg', 'jpeg'].includes(ext)) {
      text = await ocrImage(downloaded);
    }
  } catch (err: any) {
    logger.error('Failed to download/extract', { blobName, error: err.message });
    await CertificateMetadataModel.findOneAndUpdate(
      { blobName },
      { blobName, fileName, extractionStatus: 'failed', extractionError: err.message, processedAt: new Date() },
      { upsert: true },
    );
    return { blobName, status: 'error', expiryDate: null };
  }

  const extracted = extractDatesFromText(text, fileName);
  const certStatus = computeStatus(extracted.expiryDate);

  await CertificateMetadataModel.findOneAndUpdate(
    { blobName },
    {
      blobName,
      fileName,
      expiryDate: extracted.expiryDate,
      issueDate: extracted.issueDate,
      supplierName: extracted.supplierName,
      bbbeeLevel: extracted.bbbeeLevel,
      status: certStatus,
      extractedText: text.substring(0, 2000),
      extractionStatus: 'completed',
      extractionError: null,
      processedAt: new Date(),
    },
    { upsert: true, new: true },
  );

  logger.info('Processed certificate', {
    fileName,
    expiryDate: extracted.expiryDate?.toISOString() || null,
    bbbeeLevel: extracted.bbbeeLevel,
    status: certStatus,
  });

  return { blobName, status: certStatus, expiryDate: extracted.expiryDate };
}

export async function processAllCertificates(
  blobServiceClient: BlobServiceClient,
  force = false,
  onProgress?: (done: number, total: number) => void,
): Promise<{ processed: number; skipped: number; errors: number }> {
  if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR, { recursive: true });

  const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
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
