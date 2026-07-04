export type CertificateExtractionStatus = 'pending' | 'completed' | 'text_too_short' | 'failed' | 'missing_blob' | 'unsupported' | 'skipped';

export type CertificateExtractionMode = 'azure_document_intelligence' | 'pdf_text' | 'ocr' | 'filename_only' | 'none' | 'failed';

export const MIN_USEFUL_EXTRACTED_TEXT_LENGTH = 50;

export type CertificateExtractedTextState = {
  extractionStatus?: CertificateExtractionStatus | string | null;
  extractionMode?: CertificateExtractionMode | string | null;
  extractedTextLength?: number | null;
  extractedText?: string | null;
};

export function usefulExtractedTextLength(text: unknown): number {
  if (typeof text !== 'string') return 0;
  return text.replace(/\s+/g, ' ').trim().length;
}

export function hasUsefulExtractedText(text: unknown): text is string {
  return usefulExtractedTextLength(text) >= MIN_USEFUL_EXTRACTED_TEXT_LENGTH;
}

export function extractionStatusForText(text: unknown): CertificateExtractionStatus {
  const len = usefulExtractedTextLength(text);
  return len >= MIN_USEFUL_EXTRACTED_TEXT_LENGTH ? 'completed' : 'text_too_short';
}

export function extractionModeForEmptyText(mode: CertificateExtractionMode): CertificateExtractionMode {
  return mode === 'failed' ? 'failed' : mode === 'none' ? 'none' : mode;
}

export function hasUsableCertificateExtractedText(doc: CertificateExtractedTextState | null | undefined): boolean {
  if (!doc) return false;
  if (doc.extractionStatus !== 'completed') return false;
  if (!['azure_document_intelligence', 'pdf_text', 'ocr'].includes(String(doc.extractionMode || ''))) return false;
  if (Number(doc.extractedTextLength || 0) < MIN_USEFUL_EXTRACTED_TEXT_LENGTH) return false;
  return hasUsefulExtractedText(doc.extractedText);
}
