export const SUPPORTED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  // Macro-enabled Excel — every client BEE Information Gathering file is .xlsm.
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.sheet.macroenabled.12',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-powerpoint',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/tiff',
  'image/webp',
]);

/**
 * Extensions we can read, for when the declared MIME type is generic.
 *
 * Browsers and curl frequently send a perfectly good .xlsm or .pptx as
 * `application/octet-stream`. Judging on the declared type alone rejected the
 * most common client upload there is, so acceptance is type OR extension —
 * with this list keeping the fallback bounded rather than open.
 */
export const SUPPORTED_DOCUMENT_EXTENSIONS = new Set([
  '.pdf', '.docx', '.doc', '.xlsx', '.xlsm', '.xls', '.pptx', '.ppt',
  '.csv', '.txt', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.webp',
]);

/** True when either the declared type or the filename's extension is readable. */
export function isReadableDocument(mimeType: string, filename: string): boolean {
  if (SUPPORTED_DOCUMENT_MIME_TYPES.has(mimeType)) return true;
  // Split-sheet provenance names ("File.xlsx › Finance") carry the extension
  // before the marker, not at the end — judge the base name.
  const base = filename.split(' › ')[0];
  const dot = base.lastIndexOf('.');
  if (dot === -1) return false;
  return SUPPORTED_DOCUMENT_EXTENSIONS.has(base.slice(dot).toLowerCase());
}

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
  /**
   * Structure-preserving markdown rendering of the same document (headings, pipe
   * tables, lists). Optional and additive: `raw_text` remains the flat projection
   * the deterministic regex extractor consumes, while LLM-based extractors read
   * `markdown` because tables/headings are the semantic anchors they rely on.
   */
  markdown?: string;
  tables: unknown[];
  metadata: Record<string, unknown>;
}

export interface DocumentClassification {
  document_type: string;
  pillar: string;
  confidence: number;
  matched_evidence: string[];
  /** 'compendium' = the upload holds several documents (a workbook or pack), not one. */
  status?: 'classified' | 'ambiguous' | 'low_confidence' | 'unsupported' | 'compendium';
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
