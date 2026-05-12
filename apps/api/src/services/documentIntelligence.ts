/**
 * Azure Document Intelligence OCR Service
 *
 * Stage 1 of the certificate extraction pipeline.
 * Uses the Azure Form Recognizer / Document Intelligence prebuilt-read model
 * for high-quality OCR of scanned B-BBEE certificates.
 *
 * Falls back to pdfjs text extraction when Azure DI is not configured.
 */

import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createLogger } from '../logger.js';

const logger = createLogger('DocIntelligence');

const AZURE_DI_ENDPOINT = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ?? '';
const AZURE_DI_KEY = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY ?? '';

export function isDocumentIntelligenceConfigured(): boolean {
  return !!(AZURE_DI_ENDPOINT && AZURE_DI_KEY);
}

/**
 * Extract text from a PDF or image document.
 *
 * Priority:
 *   1. Azure Document Intelligence prebuilt-read (if AZURE_DOCUMENT_INTELLIGENCE_* env vars set)
 *   2. pdfjs selectable-text extraction (PDFs only)
 *   3. Returns '' — caller falls back to Tesseract OCR
 */
export async function extractTextWithDocIntelligence(
  buffer: Buffer,
  fileName: string,
): Promise<string> {
  const ext = (fileName.split('.').pop() ?? '').toLowerCase();

  if (isDocumentIntelligenceConfigured()) {
    try {
      const text = await extractWithAzureFormRecognizer(buffer, fileName);
      if (text.trim()) {
        logger.info('Azure Document Intelligence extraction succeeded', {
          fileName,
          chars: text.length,
        });
        return text;
      }
      logger.warn('Azure DI returned empty text, falling back to pdfjs', { fileName });
    } catch (err: any) {
      logger.warn('Azure DI failed, falling back to pdfjs', {
        fileName,
        error: (err as Error).message,
      });
    }
  }

  if (ext === 'pdf') {
    return extractTextFromPdfBuffer(buffer.buffer as ArrayBuffer);
  }

  return '';
}

async function extractWithAzureFormRecognizer(buffer: Buffer, fileName: string): Promise<string> {
  // Dynamic import so startup never fails when the package is absent
  const { DocumentAnalysisClient, AzureKeyCredential } = (await import(
    '@azure/ai-form-recognizer'
  )) as typeof import('@azure/ai-form-recognizer');

  const client = new DocumentAnalysisClient(
    AZURE_DI_ENDPOINT,
    new AzureKeyCredential(AZURE_DI_KEY),
  );

  const ext = (fileName.split('.').pop() ?? '').toLowerCase();
  const contentType =
    ext === 'pdf'
      ? 'application/pdf'
      : ext === 'png'
        ? 'image/png'
        : 'image/jpeg';

  const poller = await client.beginAnalyzeDocument('prebuilt-read', buffer, { contentType });
  const result = await poller.pollUntilDone();

  // result.content contains the full text with layout preserved (preferred)
  if (result.content) return result.content;

  // Fallback: concatenate line content from all pages
  const pages = result.pages ?? [];
  return pages
    .flatMap((p) => (p.lines ?? []).map((l) => l.content ?? ''))
    .join('\n');
}

/**
 * Extract selectable text from a PDF using pdfjs-dist (vector text only, no OCR).
 */
async function extractTextFromPdfBuffer(buffer: ArrayBuffer): Promise<string> {
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
      const pageText = textContent.items.map((item: any) => (item as any).str ?? '').join(' ');
      pages.push(pageText);
    }
    return pages.join('\n');
  } catch {
    return '';
  }
}
