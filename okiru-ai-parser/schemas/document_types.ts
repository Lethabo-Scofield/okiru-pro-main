export const SUPPORTED_DOCUMENT_MIME_TYPES = new Set([
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

export type ParserStatus = 'passed' | 'review_required' | 'failed';

export type ParserDataType =
  | 'string'
  | 'number'
  | 'money'
  | 'percentage'
  | 'date'
  | 'boolean'
  | 'bee_level';

export interface RawExtractionInput {
  file_id: string;
  filename: string;
  mime_type: string;
  raw_text: string;
  tables: unknown[];
  metadata: Record<string, unknown>;
}

export interface DocumentClassification {
  document_type: string;
  pillar: string;
  confidence: number;
  matched_evidence: string[];
  status?: 'classified' | 'ambiguous' | 'low_confidence' | 'unsupported';
  candidates?: DocumentClassificationCandidate[];
  margin?: number;
  reason?: string;
}

export interface DocumentClassificationCandidate {
  document_type: string;
  pillar: string;
  confidence: number;
  matched_evidence: string[];
  reasons: string[];
}
