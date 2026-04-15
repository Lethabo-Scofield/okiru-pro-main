/**
 * POST /api/extract-entities-hybrid
 *
 * Full hybrid RAG extraction pipeline:
 *   File upload OR Document ID (with pre-chunked content)
 *   → Load chunks (from DB if documentId provided, or build from file)
 *   → Build indexes (BM25, Entity, Embeddings)
 *   → Load entity manifest for sector
 *   → Per entity: hybrid retrieval (BM25 + Semantic + Entity)
 *   → LLM reranking (optional)
 *   → GPT-4o-mini extraction
 *   → Validation + confidence scoring
 *   → Return { entities, timing }
 */

import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { inferTablesFromEntities } from '../../pipeline/extraction/aiEntityMapper.js';
import { requireAuth } from '../middleware/requireAuth.js';

// Strings the LLM sometimes returns meaning "no value found"
const NULL_VALUE_SENTINELS = /^(null|n\/a|none|not\s+found|not\s+available|unknown|-)$/i;

function formatExtractedValue(
  value: string | number | null,
  fieldType: string
): string | null {
  if (value === null || value === undefined || value === '') return null;
  // Treat null-sentinel strings as not found
  if (typeof value === 'string' && NULL_VALUE_SENTINELS.test(value.trim())) return null;

  if (fieldType === 'currency') {
    let num: number;
    if (typeof value === 'number') {
      num = value;
    } else {
      const cleaned = String(value).replace(/[^0-9.\-]/g, '');
      num = parseFloat(cleaned);
      if (isNaN(num)) return String(value);
    }
    const isNegative = num < 0;
    const abs = Math.abs(num);
    const parts = abs.toFixed(2).split('.');
    const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    const formatted = parts[1] === '00' ? intPart : `${intPart}.${parts[1]}`;
    return `${isNegative ? '-' : ''}R ${formatted}`;
  }

  if (fieldType === 'percentage') {
    let num: number;
    if (typeof value === 'number') {
      num = value;
    } else {
      const cleaned = String(value).replace(/[^0-9.\-]/g, '');
      num = parseFloat(cleaned);
      if (isNaN(num)) return String(value);
    }
    const formatted = num % 1 === 0 ? num.toString() : num.toFixed(2);
    return `${formatted}%`;
  }

  if (fieldType === 'bee_level') {
    const s = String(value);
    if (/^[1-8]$/.test(s)) return `Level ${s}`;
    if (/^0$/.test(s) || /non/i.test(s)) return 'Non-Compliant';
    return s;
  }

  if (fieldType === 'count') {
    let num: number;
    if (typeof value === 'number') {
      num = value;
    } else {
      const cleaned = String(value).replace(/[^0-9.\-]/g, '');
      num = parseFloat(cleaned);
      if (isNaN(num)) return String(value);
    }
    if (num % 1 === 0) {
      return Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    }
    return num.toFixed(2);
  }

  return String(value);
}

import { DocumentChunker, type TextChunk } from '../../pipeline/extraction/documentChunker.js';
import { BM25Index } from '../../pipeline/extraction/bm25Index.js';
import { EntityIndex } from '../../pipeline/extraction/entityIndex.js';
import { HybridRetriever } from '../../pipeline/extraction/hybridRetriever.js';
import { InMemoryVectorStore, createVectorStore } from '../../pipeline/extraction/embeddingStore.js';
import { generateEmbeddings } from '../../pipeline/extraction/azureOpenAIClient.js';
import {
  buildManifest,
  getAllEntities,
  toExtractionRequest,
  type EntityManifest,
  type EntityField,
} from '../../pipeline/extraction/entityManifest.js';
import {
  LLMExtractor,
  buildExtractionPrompt,
  structuralVerify,
  isAvailable as isLLMAvailable,
  groqVerifyBatch,
  type GroqVerificationEntry,
  type GroqVerificationResult,
} from '../../pipeline/extraction/llmExtractor.js';
import { computeConfidence } from '../../pipeline/extraction/confidenceScorer.js';
import { validateAll, type ValidationResult } from '../../pipeline/extraction/validator.js';
import { ProvenanceTracker } from '../../pipeline/extraction/provenanceTracker.js';
import { smartExtractTables } from '../../pipeline/extraction/aiTableClassifier.js';
import { Document, DocumentChunk } from '../../models.js';
import { 
  isScannedPdf, 
  extractFromScannedPdf,
  extractTablesFromDigitalPdf,
  type VisionExtractionResult,
  type VisionTableResult,
} from '../../pipeline/extraction/visionPdfExtractor.js';

const router = Router();

// Configure multer for memory storage (files processed immediately, not saved)
const upload = multer({ storage: multer.memoryStorage() });

interface ExtractEntitiesRequest {
  sectorCode: string;
  scorecardType: string;
  entityTemplateId?: string;
  documentId?: string; // Use pre-chunked document instead of uploading file
}

interface ExtractionResult {
  name: string;
  value: string | number | null;
  confidence: number;
  status: 'pending' | 'approved' | 'rejected' | 'not_found';
  pillar: string;
  fieldType: string;
  definition: string;
  provenance: {
    pageId: string;
    chunkId: string;
    textSnippet: string;
    retrievalScore: number;
    method: 'llm' | 'llm_fallback' | 'rule_based' | 'dual_agree';
  };
  validation?: ValidationResult;
  groqVerification?: {
    valid: boolean;
    reason: string;
    correctedValue: string | null;
  };
}

interface ExtractedTables {
  shareholders?: Array<{ name: string; blackOwnership: number; blackWomenOwnership: number; shares: number; shareValue: number; isDesignatedGroup: boolean; blackNewEntrant: boolean; yearsHeld?: number; votingRightsPercent?: number; economicInterestPercent?: number }>;
  employees?: Array<{ name: string; race: string; gender: string; designation: string; isDisabled: boolean; isForeign: boolean }>;
  suppliers?: Array<{ name: string; spend: number; beeLevel: number; blackOwnership: number; blackWomenOwnership: number; enterpriseType: string; isDesignatedGroup: boolean; isBlackOwned51: boolean; isBlackWomanOwned30: boolean; isEME: boolean; isQSE: boolean }>;
  contributions?: Array<{ beneficiary: string; type: string; amount: number; category: 'sd' | 'ed' | 'sed' }>;
  trainingPrograms?: Array<{ name: string; category: string; cost: number; race?: string; gender?: string; isDisabled?: boolean }>;
  ownershipFinancials?: Array<{ companyValue: number; outstandingDebt: number; yearsHeld?: number }>;
  financials?: Array<Record<string, any>>;
}

interface ExtractionResponse {
  success: boolean;
  entities: ExtractionResult[];
  tables: ExtractedTables;
  timing: {
    parse: number;
    chunk: number;
    load: number;
    index: number;
    extract: number;
    verify: number;
    total: number;
  };
  stats: {
    totalEntities: number;
    extractedCount: number;
    nullCount: number;
    verifiedCount: number;
    invalidatedCount: number;
    avgConfidence: number;
  };
  documentId?: string;
}

// ────────────────────────────────────────────────────────────────────────
// Smart Spreadsheet Chunker
// Inspired by sim/apps/sim/lib/chunkers/structured-data-chunker.ts
// Dynamically handles any sheet format — tabular or key-value
// ────────────────────────────────────────────────────────────────────────

const SHEET_CONFIG = {
  TARGET_CHUNK_SIZE: 2500,
  MIN_ROWS_PER_CHUNK: 20,
  MAX_ROWS_PER_CHUNK: 80,
};

/**
 * Forward-fill merged cells: Excel merged cells export a value in the
 * first cell and empty strings below. Carry the last non-empty value
 * forward so rows under a merge retain their context.
 */
function forwardFillMergedCells(rows: any[][]): any[][] {
  if (rows.length < 2) return rows;
  const lastSeen: Record<number, any> = {};
  return rows.map((row, rowIdx) => {
    if (rowIdx === 0) return row;
    return row.map((cell: any, colIdx: number) => {
      const isEmpty = cell === '' || cell === null || cell === undefined;
      if (!isEmpty) {
        lastSeen[colIdx] = cell;
        return cell;
      }
      return lastSeen[colIdx] ?? '';
    });
  });
}

/** Trim footer/total/note rows from the bottom of the data */
const FOOTER_PATTERNS = [
  /^(total|subtotal|grand\s+total)/i,
  /^source\s*:/i, /^note\s*:/i,
  /^(prepared|generated|exported)\s+(by|on|at)/i,
  /^disclaimer/i, /^-{3,}$/, /^={3,}$/,
];

function trimFooterRows(rows: any[][], colCount: number): any[][] {
  const minPopulated = Math.max(1, Math.ceil(colCount * 0.3));
  let end = rows.length;
  while (end > 0) {
    const row = rows[end - 1];
    const populated = row.filter((v: any) => v !== undefined && v !== null && String(v).trim() !== '').length;
    const firstCell = String(row[0] ?? '').trim();
    if (populated < minPopulated || FOOTER_PATTERNS.some(re => re.test(firstCell))) {
      end--;
    } else break;
  }
  return rows.slice(0, end);
}

/**
 * Detect if first row is a proper header row (tabular data).
 * Headers have 3+ short non-empty cells that look like column names.
 */
function isTabularSheet(rows: any[][]): boolean {
  if (rows.length < 2) return false;
  const firstRow = rows[0];
  const nonEmpty = firstRow.filter((c: any) => c !== undefined && c !== null && String(c).trim() !== '');
  if (nonEmpty.length < 3) return false;
  const shortCount = nonEmpty.filter((c: any) => String(c).length < 50).length;
  return shortCount / nonEmpty.length >= 0.7;
}

/** Convert a single row to "Header: Value, Header: Value" natural language */
function rowToNL(headers: string[], values: any[]): string {
  return headers
    .map((h, i) => {
      const v = values[i];
      if (v === undefined || v === null || String(v).trim() === '') return null;
      return `${h}: ${v}`;
    })
    .filter(Boolean)
    .join(', ');
}

/**
 * Build a chunk from a slice of rows — works for both tabular and key-value.
 * Tabular: "Row N: Col1: Val1, Col2: Val2, ..."
 * Key-value: pairs adjacent non-empty cells as "Label: Value"
 */
function buildChunkText(
  sheetName: string,
  rows: any[][],
  rowStart: number,
  headers: string[] | null,
): string {
  const parts: string[] = [`Sheet: ${sheetName}`];

  if (headers) {
    parts.push(`Columns: ${headers.join(', ')}`);
    parts.push(`Rows ${rowStart + 2}-${rowStart + rows.length + 1}`);
    parts.push('');
    for (let i = 0; i < rows.length; i++) {
      const nl = rowToNL(headers, rows[i]);
      if (nl) parts.push(`Row ${rowStart + i + 2}: ${nl}`);
    }
  } else {
    parts.push('');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row) continue;
      const cells = row.map((c: any) => String(c ?? '').trim()).filter(Boolean);
      if (cells.length === 0) continue;

      if (cells.length === 2) {
        parts.push(`${cells[0]}: ${cells[1]}`);
      } else if (cells.length === 1) {
        parts.push(cells[0]);
      } else {
        // Scan for label-value pairs in multi-cell rows
        const pairs: string[] = [];
        for (let c = 0; c < cells.length; c++) {
          const label = cells[c];
          const value = cells[c + 1];
          if (value && isNaN(Number(label)) && label.length < 60) {
            pairs.push(`${label}: ${value}`);
            c++;
          } else {
            pairs.push(label);
          }
        }
        parts.push(pairs.join(', '));
      }
    }
  }

  return parts.join('\n');
}

/**
 * Parse any sheet into searchable natural language chunks.
 * Auto-detects tabular vs key-value format. No hardcoded filters.
 */
function parseSheetToChunks(
  sheetName: string,
  rawData: any[][]
): Array<{ pageId: string; text: string; metadata: Record<string, any> }> {
  if (rawData.length === 0) return [];

  const tabular = isTabularSheet(rawData);
  let headers: string[] | null = null;
  let dataRows: any[][];

  if (tabular) {
    headers = rawData[0].map((h: any) => String(h || '').trim());
    dataRows = forwardFillMergedCells(rawData).slice(1);
    dataRows = trimFooterRows(dataRows, headers.length);
  } else {
    dataRows = rawData;
  }

  // Adaptive chunk sizing based on column count
  const colCount = headers ? headers.length : Math.max(...dataRows.slice(0, 5).map(r => r?.length ?? 0), 1);
  const tokensPerRow = Math.max(1, colCount * 8);
  const rowsPerChunk = Math.min(
    Math.max(SHEET_CONFIG.MIN_ROWS_PER_CHUNK, Math.floor(SHEET_CONFIG.TARGET_CHUNK_SIZE / tokensPerRow)),
    SHEET_CONFIG.MAX_ROWS_PER_CHUNK,
  );

  const pages: Array<{ pageId: string; text: string; metadata: Record<string, any> }> = [];

  for (let start = 0; start < dataRows.length; start += rowsPerChunk) {
    const end = Math.min(start + rowsPerChunk, dataRows.length);
    const slice = dataRows.slice(start, end);

    const text = buildChunkText(sheetName, slice, start, headers);
    if (text.split('\n').length <= 2) continue; // skip empty chunks

    pages.push({
      pageId: `sheet_${sheetName}_${start}-${end}`,
      text,
      metadata: { sheetName, rowStart: start, rowEnd: end, type: 'spreadsheet' }
    });
  }

  return pages;
}

/**
 * Parse uploaded file to text pages based on file type.
 */
async function parseFileToPages(
  buffer: Buffer,
  mimetype: string,
  originalname: string
): Promise<Array<{ pageId: string; text: string; metadata?: Record<string, any> }>> {
  const ext = originalname.toLowerCase().split('.').pop() || '';

  // CSV / Excel - Convert to natural language chunks
  if (mimetype === 'text/csv' || ext === 'csv' || mimetype.includes('excel') || ext === 'xlsx' || ext === 'xls') {
    // Limit to 5000 rows per sheet at the parser level to avoid OOM on sheets with 1M+ rows
    const workbook = XLSX.read(buffer, { type: 'buffer', sheetRows: 5000 });
    const pages: Array<{ pageId: string; text: string; metadata?: Record<string, any> }> = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = (XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: '',
        blankrows: false,
      }) as any[][])
        .filter(row => row && row.length > 0 && row.some((c: any) => c !== undefined && c !== null && String(c).trim() !== ''));

      if (jsonData.length < 2) {
        console.log(`[hybridExtraction] Skipping sheet "${sheetName}" (${jsonData.length} rows — no data)`);
        continue;
      }

      const tabular = isTabularSheet(jsonData);
      const sheetChunks = parseSheetToChunks(sheetName, jsonData);
      pages.push(...sheetChunks);

      console.log(`[hybridExtraction] Sheet "${sheetName}": ${jsonData.length} rows → ${sheetChunks.length} chunks (${tabular ? 'tabular' : 'key-value'})`);
    }

    return pages;
  }

  // PDF - with scanned PDF detection and vision fallback
  if (mimetype === 'application/pdf' || ext === 'pdf') {
    const pdfData = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const pdfDocument = await pdfjs.getDocument({ data: pdfData }).promise;
    const pages: Array<{ pageId: string; text: string; metadata?: Record<string, any> }> = [];

    for (let i = 1; i <= pdfDocument.numPages; i++) {
      const page = await pdfDocument.getPage(i);
      const textContent = await page.getTextContent();
      const text = textContent.items.map((item: any) => item.str).join(' ');

      pages.push({
        pageId: `page_${i}`,
        text,
        metadata: { pageNumber: i, type: 'pdf' },
      });
    }

    const totalText = pages.map(p => p.text).join(' ');
    const scannedDetection = isScannedPdf(totalText);
    
    console.log(`[hybridExtraction] PDF text extraction: ${totalText.length} chars. Scanned PDF detected: ${scannedDetection}`);
    
    if (scannedDetection) {
      console.log(`[hybridExtraction] Switching to GPT-4o Vision OCR for scanned PDF`);
      try {
        const visionResults = await extractFromScannedPdf(buffer, 'RCOGP', 'Generic', null);
        
        if (visionResults && visionResults.length > 0) {
          return visionResults.map((vr, idx) => ({
            pageId: vr.pageId || `page_${idx + 1}`,
            text: vr.text || '',
            metadata: { 
              pageNumber: vr.metadata.pageNumber || idx + 1, 
              type: 'pdf_vision' as const,
              ocrConfidence: vr.metadata.ocrConfidence,
              visionExtracted: true,
              entities: vr.entities || []
            },
          }));
        }
      } catch (visionErr) {
        console.warn(`[hybridExtraction] Vision OCR failed, falling back to text extraction:`, visionErr);
      }
    } else {
      // Digital PDF with text — run vision on table-heavy pages for layout-aware extraction
      try {
        console.log(`[hybridExtraction] Running vision table extraction on digital PDF`);
        const visionTables = await extractTablesFromDigitalPdf(buffer, pages);
        
        if (visionTables.length > 0) {
          const totalVisionTables = visionTables.reduce((s, v) => s + v.tables.length, 0);
          console.log(`[hybridExtraction] Vision extracted ${totalVisionTables} tables from ${visionTables.length} pages`);
          
          // Enhance pages with vision-extracted table data
          for (const vt of visionTables) {
            const pageIdx = vt.pageNumber - 1;
            if (pageIdx >= 0 && pageIdx < pages.length) {
              const existing = pages[pageIdx];
              // Append structured table text to the page for downstream extraction
              const tableText = vt.tables.map(t => {
                const headerLine = t.headers.join(' | ');
                const rowLines = t.rows.map((r: Record<string, any>) => 
                  t.headers.map((h: string) => r[h] ?? '').join(' | ')
                ).join('\n');
                return `\n[TABLE: ${t.title}]\n${headerLine}\n${rowLines}`;
              }).join('\n');

              pages[pageIdx] = {
                ...existing,
                text: existing.text + tableText,
                metadata: {
                  ...existing.metadata,
                  type: 'pdf_vision_enhanced',
                  visionTables: vt.tables,
                },
              };
            }
          }
        }
      } catch (visionErr) {
        console.warn(`[hybridExtraction] Vision table extraction failed (non-fatal):`, visionErr);
      }
    }

    return pages;
  }

  // TXT / Text files
  if (mimetype === 'text/plain' || ext === 'txt') {
    const text = buffer.toString('utf-8');
    // Split into chunks if very long
    const maxChunkSize = 5000;
    const chunks: Array<{ pageId: string; text: string }> = [];

    if (text.length <= maxChunkSize) {
      chunks.push({ pageId: 'text_1', text });
    } else {
      let currentChunk = '';
      let chunkNum = 1;
      const lines = text.split('\n');

      for (const line of lines) {
        if ((currentChunk + line).length > maxChunkSize) {
          chunks.push({ pageId: `text_${chunkNum}`, text: currentChunk });
          currentChunk = line + '\n';
          chunkNum++;
        } else {
          currentChunk += line + '\n';
        }
      }

      if (currentChunk) {
        chunks.push({ pageId: `text_${chunkNum}`, text: currentChunk });
      }
    }

    return chunks.map(c => ({ ...c, metadata: { type: 'text' } }));
  }

  // DOCX / DOC — mammoth preserves tables, lists, headings
  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimetype === 'application/msword' ||
    ext === 'docx' || ext === 'doc'
  ) {
    try {
      const mammoth = await import('mammoth');
      const result = await mammoth.default.convertToHtml({ buffer });
      const html = result.value;

      // Convert HTML tables to pipe-delimited text for downstream extraction
      let text = html
        .replace(/<table[^>]*>/gi, '\n[TABLE]\n')
        .replace(/<\/table>/gi, '\n[/TABLE]\n')
        .replace(/<tr[^>]*>/gi, '')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<t[hd][^>]*>/gi, ' | ')
        .replace(/<\/t[hd]>/gi, '')
        .replace(/<li[^>]*>/gi, '- ')
        .replace(/<\/li>/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<h[1-6][^>]*>/gi, '\n## ')
        .replace(/<\/h[1-6]>/gi, '\n')
        .replace(/<p[^>]*>/gi, '\n')
        .replace(/<\/p>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

      if (result.messages?.length) {
        console.warn(`[hybridExtraction] DOCX warnings:`, result.messages.map((m: any) => m.message).join('; '));
      }

      // Split into manageable chunks (one per ~5000 chars)
      const maxChunk = 5000;
      const pages: Array<{ pageId: string; text: string; metadata?: Record<string, any> }> = [];
      if (text.length <= maxChunk) {
        pages.push({ pageId: 'docx_1', text, metadata: { type: 'docx' } });
      } else {
        const paragraphs = text.split('\n\n');
        let chunk = '';
        let chunkNum = 1;
        for (const para of paragraphs) {
          if (chunk.length + para.length > maxChunk && chunk.length > 0) {
            pages.push({ pageId: `docx_${chunkNum}`, text: chunk.trim(), metadata: { type: 'docx', chunkNum } });
            chunkNum++;
            chunk = '';
          }
          chunk += para + '\n\n';
        }
        if (chunk.trim()) {
          pages.push({ pageId: `docx_${chunkNum}`, text: chunk.trim(), metadata: { type: 'docx', chunkNum } });
        }
      }

      console.log(`[hybridExtraction] DOCX extracted: ${text.length} chars → ${pages.length} chunks`);
      return pages;
    } catch (error) {
      console.warn('[hybridExtraction] DOCX/DOC parsing failed:', error);
    }

    return [{ pageId: 'docx_1', text: '', metadata: { type: 'docx', error: 'Failed to parse' } }];
  }

  // Unsupported type
  throw new Error(`Unsupported file type: ${mimetype} (${ext})`);
}

/**
 * Main extraction endpoint
 * Supports both file upload and documentId (for pre-chunked documents)
 */
router.post(
  '/extract-entities-hybrid',
  requireAuth,
  upload.single('file'),
  async (req, res) => {
    const totalStartTime = Date.now();
    let parseTime = 0;
    let chunkTime = 0;
    let indexTime = 0;
    let extractTime = 0;
    let loadTime = 0;
    let verifyTime = 0;

    try {
      const file = req.file;
      const body = req.body as ExtractEntitiesRequest;
      const { sectorCode, scorecardType, entityTemplateId, documentId } = body;

      // Validate request - need either file OR documentId
      if (!file && !documentId) {
        return res.status(400).json({ error: 'Either file upload or documentId is required' });
      }

      if (!sectorCode || !scorecardType) {
        return res.status(400).json({
          error: 'Missing required fields: sectorCode, scorecardType',
        });
      }

      // Validate sector code
      const validSectors = ['RCOGP', 'ICT', 'FSC', 'AGRI'];
      if (!validSectors.includes(sectorCode.toUpperCase())) {
        return res.status(400).json({
          error: `Invalid sectorCode: ${sectorCode}. Must be one of: ${validSectors.join(', ')}`,
        });
      }

      // Validate scorecard type
      const validTypes = ['Generic', 'QSE'];
      if (!validTypes.includes(scorecardType)) {
        return res.status(400).json({
          error: `Invalid scorecardType: ${scorecardType}. Must be one of: ${validTypes.join(', ')}`,
        });
      }

      // Check if sector supports QSE
      const sectorsWithQSE = ['RCOGP', 'ICT'];
      if (scorecardType === 'QSE' && !sectorsWithQSE.includes(sectorCode.toUpperCase())) {
        return res.status(400).json({
          error: `${sectorCode} does not have a QSE variant. Use Generic instead.`,
        });
      }

      let chunks: TextChunk[] = [];
      let sourceDocumentId: string = '';
      let parsedPages: Array<{ pageId: string; text: string; metadata?: Record<string, any> }> = [];

      // Option 1: Use pre-chunked document from database
      if (documentId) {
        console.log(`[hybridExtraction] Loading pre-chunked document ${documentId} for ${sectorCode}/${scorecardType}`);

        const loadStart = Date.now();

        // Verify document exists and has chunks
        const doc = await Document.findById(documentId);
        if (!doc) {
          return res.status(404).json({ error: 'Document not found' });
        }

        // Load chunks from database
        const dbChunks = await DocumentChunk.find({ documentId }).sort({ chunkIndex: 1 });
        if (dbChunks.length === 0) {
          return res.status(400).json({ error: 'Document has no chunks. Please upload the file again.' });
        }

        // Convert DB chunks to TextChunk format
        chunks = dbChunks.map((dbChunk, index) => ({
          chunkId: `chunk_${doc._id}_${index}`,
          pageId: dbChunk.pageNumber ? `page_${dbChunk.pageNumber}` : `chunk_${index}`,
          text: dbChunk.text,
          metadata: {
            pageNumber: dbChunk.pageNumber,
            sheetName: dbChunk.sheetName,
            sectionPath: dbChunk.sectionPath,
            chunkType: dbChunk.chunkType,
            ...dbChunk.metadata,
          },
        }));

        sourceDocumentId = documentId;
        loadTime = Date.now() - loadStart;
        console.log(`[hybridExtraction] Loaded ${chunks.length} chunks from database in ${loadTime}ms`);
      }
      // Option 2: Process uploaded file (legacy mode - for direct uploads without saving)
      else if (file) {
        console.log(`[hybridExtraction] Processing uploaded file ${file.originalname} for ${sectorCode}/${scorecardType}`);

        // Step 1: Parse file to pages
        const parseStart = Date.now();
        parsedPages = await parseFileToPages(file.buffer, file.mimetype, file.originalname);
        parseTime = Date.now() - parseStart;
        console.log(`[hybridExtraction] Parsed ${parsedPages.length} pages in ${parseTime}ms`);
        const pages = parsedPages;

        if (pages.length === 0 || pages.every(p => !p.text.trim())) {
          return res.status(400).json({ error: 'No text content extracted from file' });
        }

        // Step 2: Build chunks
        const chunkStart = Date.now();
        const chunker = new DocumentChunker();
        sourceDocumentId = `doc_${Date.now()}`;
        chunks = chunker.chunkPages(pages.map(p => ({ pageId: p.pageId, text: p.text })), sourceDocumentId);
        chunkTime = Date.now() - chunkStart;
        console.log(`[hybridExtraction] Created ${chunks.length} chunks in ${chunkTime}ms`);

        // Log sample chunks for debugging
        for (let ci = 0; ci < Math.min(3, chunks.length); ci++) {
          console.log(`[hybridExtraction] Sample chunk ${ci}: pageId=${chunks[ci].pageId} len=${chunks[ci].text.length} preview="${chunks[ci].text.substring(0, 150).replace(/\n/g, '\\n')}..."`);
        }
      }

      if (chunks.length === 0) {
        return res.status(400).json({ error: 'No chunks available for extraction' });
      }

      // Step 3: Build indexes
      const indexStart = Date.now();

      // BM25 index
      const bm25Index = new BM25Index();
      for (const chunk of chunks) {
        bm25Index.addPage(chunk.chunkId, chunk.text);
      }
      bm25Index.build();

      // Entity index
      const entityIndex = new EntityIndex();
      for (const chunk of chunks) {
        entityIndex.indexPage(chunk.chunkId, chunk.text);
      }

      // Vector store (embeddings)
      const vectorStore = createVectorStore();
      try {
        await vectorStore.indexChunks(
          chunks.map(c => ({
            chunkId: c.chunkId,
            pageId: c.pageId,
            text: c.text,
            metadata: c.metadata,
          })),
          {
            onProgress: (completed, total) => {
              if (completed % 50 === 0 || completed === total) {
                console.log(`[hybridExtraction] Embeddings: ${completed}/${total}`);
              }
            },
          }
        );
      } catch (error) {
        console.warn('[hybridExtraction] Embedding generation failed:', error);
        // Continue without embeddings
      }

      const hasEmbeddings = vectorStore.getStats().totalChunks > 0;
      const llmAvailable = isLLMAvailable();
      const retriever = new HybridRetriever(bm25Index, entityIndex, vectorStore, {
        entityWeight: hasEmbeddings ? 0.15 : 0.35,
        bm25Weight: hasEmbeddings ? 0.35 : 0.65,
        semanticWeight: hasEmbeddings ? 0.5 : 0,
        topK: 10,
        // LLM reranking disabled — embedding+BM25 retrieval already accurate enough.
        // Enabling it adds 1 Azure call per entity (117+ extra calls) and severely
        // slows extraction. Reranking reserved for dedicated search endpoints.
        enableReranking: false,
        rerankTopK: 5,
      });

      indexTime = Date.now() - indexStart;
      console.log(`[hybridExtraction] Indexes built in ${indexTime}ms (embeddings: ${hasEmbeddings}, llm: ${llmAvailable})`);

      // Step 4: Load entity manifest
      const manifest = await buildManifest(sectorCode.toUpperCase(), scorecardType);

      // Step 5: Extract ALL entities via unified extraction
      // Natural language chunks are indexed and searched for all entity types
      const extractStart = Date.now();
      const llmExtractor = new LLMExtractor();
      const provenanceTracker = new ProvenanceTracker();
      const extractionResults: ExtractionResult[] = [];

      // Build chunk lookup map for O(1) access instead of O(n) find()
      const chunkMap = new Map<string, TextChunk>();
      for (const chunk of chunks) {
        chunkMap.set(chunk.chunkId, chunk);
        chunkMap.set(chunk.pageId, chunk);
      }

      // Extract ALL entities using natural language search
      const allEntities = getAllEntities(manifest);
      const entities = allEntities;
      console.log(`[hybridExtraction] Extracting all ${entities.length} entities via natural language search`);

      // Pre-compute all entity query embeddings in ONE batch API call
      // This eliminates ~N individual embedding calls (major speedup)
      console.log(`[hybridExtraction] Pre-computing embeddings for ${entities.length} entity queries...`);
      const entityQueries = entities.map(e => [e.name, ...e.extraction.aliases].join(' '));
      let queryEmbeddings: number[][] = [];
      if (hasEmbeddings) {
        try {
          queryEmbeddings = await generateEmbeddings(entityQueries, { batchSize: 100 });
        } catch (err) {
          console.warn('[hybridExtraction] Batch embedding generation failed, falling back to per-entity:', err);
        }
      }

      // ── Zone-boosted retrieval helper ──
      // Checks if a chunk's pageId or sheet metadata matches any of the entity's zones
      function chunkMatchesZone(chunk: TextChunk, zones: string[]): boolean {
        if (zones.length === 0) return true;
        const id = (chunk.metadata?.sheetName || chunk.pageId || '').toLowerCase();
        return zones.some(z => id.includes(z.toLowerCase()));
      }

      // Process entities in parallel batches. 25 concurrent Azure calls is safe
      // for standard Azure OpenAI rate limits and cuts wall-clock time significantly.
      const BATCH_SIZE = 25;
      const TOP_K_CONTEXT = 5;

      for (let i = 0; i < entities.length; i += BATCH_SIZE) {
        const batch = entities.slice(i, i + BATCH_SIZE);
        const batchEmbeddings = queryEmbeddings.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
          batch.map(async (entity, batchIdx) => {
            try {
              const searchQuery = [entity.name, ...entity.extraction.aliases].join(' ');

              // Hybrid retrieval with lower semantic threshold (0.3) for spreadsheet data
              let retrievalResults;
              if (hasEmbeddings && batchEmbeddings[batchIdx]) {
                const semanticResults = vectorStore.searchWithEmbedding(batchEmbeddings[batchIdx], 40, 0.3);
                // Use chunkId (not pageId) to align with BM25 which indexes by chunkId
                retrievalResults = retriever.searchWithSemantic(searchQuery, semanticResults.map(r => ({ pageId: r.chunkId, score: r.score })), 15);
              } else {
                retrievalResults = await retriever.searchWithEmbeddings(
                  searchQuery,
                  15,
                  {
                    rerank: false,
                    rerankTopK: 5,
                    getChunkText: (pageId) => chunkMap.get(pageId)?.text,
                  }
                );
              }

              if (retrievalResults.length === 0) {
                return {
                  name: entity.name,
                  value: null,
                  confidence: 0,
                  status: 'not_found' as const,
                  pillar: entity.pillarCode,
                  fieldType: entity.fieldType,
                  definition: entity.extraction.definition,
                  provenance: {
                    pageId: 'none',
                    chunkId: 'none',
                    textSnippet: 'No relevant passages found',
                    retrievalScore: 0,
                    method: 'llm_fallback' as const,
                  },
                };
              }

              // Zone-boosted ranking: re-sort so chunks from the entity's expected
              // zone appear first, then fall back to retrieval score order.
              const entityZones = entity.extraction.zones;
              if (entityZones.length > 0) {
                retrievalResults.sort((a, b) => {
                  const aChunk = chunkMap.get(a.pageId);
                  const bChunk = chunkMap.get(b.pageId);
                  const aMatch = aChunk ? chunkMatchesZone(aChunk, entityZones) : false;
                  const bMatch = bChunk ? chunkMatchesZone(bChunk, entityZones) : false;
                  if (aMatch && !bMatch) return -1;
                  if (!aMatch && bMatch) return 1;
                  return b.score - a.score;
                });
              }

              const topResult = retrievalResults[0];
              const contextChunks: TextChunk[] = [];
              for (let ci = 0; ci < Math.min(TOP_K_CONTEXT, retrievalResults.length); ci++) {
                const chunk = chunkMap.get(retrievalResults[ci].pageId);
                if (chunk) contextChunks.push(chunk);
              }

              if (contextChunks.length === 0) {
                return {
                  name: entity.name,
                  value: null,
                  confidence: 0,
                  status: 'not_found' as const,
                  pillar: entity.pillarCode,
                  fieldType: entity.fieldType,
                  definition: entity.extraction.definition,
                  provenance: {
                    pageId: topResult.pageId,
                    chunkId: topResult.pageId,
                    textSnippet: 'Chunk not found',
                    retrievalScore: topResult.score,
                    method: 'llm_fallback' as const,
                  },
                };
              }

              const combinedText = contextChunks.map(c => c.text).join('\n\n---\n\n');
              const extractionRequest = toExtractionRequest(entity, combinedText, contextChunks[0].pageId);

              const llmResult = await llmExtractor.extract(extractionRequest);

              const topChunk = contextChunks[0];
              const confidenceResult = computeConfidence({
                retrievalScore: topResult.score,
                maxRetrievalScore: 1,
                matchedEntities: retrievalResults[0]?.matchedEntities?.length ?? 0,
                expectedEntities: Math.max(1, entity.extraction.aliases.length),
                structurallyVerified: llmResult.structuralVerification,
                valueIsNull: llmResult.extractedValue === null,
                foundInExpectedZone: entityZones.length === 0 || chunkMatchesZone(topChunk, entityZones),
                llmValue: llmResult.extractedValue,
                ruleBasedValue: null,
              });

              const validation: ValidationResult | undefined = undefined;

              const formattedValue = formatExtractedValue(llmResult.extractedValue, entity.fieldType);

              // Log extraction details for debugging
              if (!formattedValue) {
                const zoneMatch = entityZones.length === 0 || chunkMatchesZone(topChunk, entityZones);
                console.log(`[extract:MISS] ${entity.name} | zones=${entityZones.join(',')} | topChunk=${topChunk.pageId} | zoneMatch=${zoneMatch} | score=${topResult.score.toFixed(3)} | llm=${llmResult.extractedValue}`);
              }

              return {
                name: entity.name,
                value: formattedValue,
                confidence: confidenceResult.normalizedScore,
                status: formattedValue ? 'pending' as const : 'not_found' as const,
                pillar: entity.pillarCode,
                fieldType: entity.fieldType,
                definition: entity.extraction.definition,
                provenance: {
                  pageId: topChunk.pageId,
                  chunkId: topChunk.chunkId,
                  textSnippet: topChunk.text.substring(0, 200),
                  retrievalScore: topResult.score,
                  method: llmResult.method,
                },
                validation,
              };
            } catch (error) {
              console.error(`[hybridExtraction] Error extracting ${entity.name}:`, error);

              return {
                name: entity.name,
                value: null,
                confidence: 0,
                status: 'not_found' as const,
                pillar: entity.pillarCode,
                fieldType: entity.fieldType,
                definition: entity.extraction.definition,
                provenance: {
                  pageId: 'error',
                  chunkId: 'error',
                  textSnippet: 'Could not extract this value from the document',
                  retrievalScore: 0,
                  method: 'llm_fallback' as const,
                },
              };
            }
          })
        );

        extractionResults.push(...batchResults);

        // Progress logging with extraction success rate
        const batchFound = batchResults.filter(r => r.value !== null).length;
        console.log(`[hybridExtraction] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchFound}/${batchResults.length} extracted | Total: ${Math.min(i + BATCH_SIZE, entities.length)}/${entities.length} entities`);
      }

      extractTime = Date.now() - extractStart;

      // ── LLM Verification Pass (Azure OpenAI gpt-4o) ──────────────────────
      // For every entity that produced a non-null value, ask Azure to confirm
      // the extracted value is actually correct (verification, NOT re-extraction).
      // Can be skipped with ?skipVerify=true for faster extraction when speed matters.
      const skipVerify = req.query.skipVerify === 'true';
      if (!skipVerify) {
        const verifyStart = Date.now();
        const VERIFY_BATCH = 10;
        const MAX_PARALLEL_BATCHES = 3; // Run up to 3 verification batches concurrently

        const toVerify = extractionResults
          .map((r, idx) => ({ r, idx }))
          .filter(({ r }) => r.value !== null && r.value !== '');

        console.log(`[hybridExtraction] Starting LLM verification for ${toVerify.length} non-null entities (parallel)`);

        // Process verification batches in parallel groups
        for (let vi = 0; vi < toVerify.length; vi += VERIFY_BATCH * MAX_PARALLEL_BATCHES) {
          const parallelBatches: Promise<void>[] = [];

          for (let pb = 0; pb < MAX_PARALLEL_BATCHES; pb++) {
            const batchStart = vi + (pb * VERIFY_BATCH);
            if (batchStart >= toVerify.length) break;

            const batch = toVerify.slice(batchStart, batchStart + VERIFY_BATCH);

            parallelBatches.push((async () => {
              const entries: GroqVerificationEntry[] = batch.map(({ r }) => ({
                entityName: r.name,
                definition: r.definition,
                extractedValue: String(r.value),
                sourceSnippet: r.provenance.textSnippet,
                fieldType: r.fieldType,
                pillar: r.pillar,
              }));

              const verResults = await groqVerifyBatch(entries);

              for (let j = 0; j < batch.length; j++) {
                const { r, idx } = batch[j];
                const ver = verResults[j];
                if (!ver) continue;

                extractionResults[idx].groqVerification = {
                  valid: ver.valid,
                  reason: ver.reason,
                  correctedValue: ver.correctedValue,
                };

                if (!ver.valid) {
                  if (ver.correctedValue) {
                    extractionResults[idx].value = ver.correctedValue;
                    extractionResults[idx].confidence = Math.min(extractionResults[idx].confidence, 0.75);
                    console.log(`[LLMVerify] Corrected "${r.name}": "${r.value}" → "${ver.correctedValue}"`);
                  } else {
                    extractionResults[idx].value = null;
                    extractionResults[idx].status = 'not_found';
                    extractionResults[idx].confidence = Math.max(extractionResults[idx].confidence * 0.3, 0.1);
                    console.log(`[LLMVerify] Invalidated "${r.name}": was "${r.value}" — ${ver.reason}`);
                  }
                } else {
                  extractionResults[idx].confidence = Math.min(extractionResults[idx].confidence * 1.05, 0.99);
                }
              }
            })());
          }

          await Promise.all(parallelBatches);
          console.log(`[hybridExtraction] Verified ${Math.min(vi + (VERIFY_BATCH * MAX_PARALLEL_BATCHES), toVerify.length)}/${toVerify.length} entities`);
        }

        verifyTime = Date.now() - verifyStart;
        console.log(`[hybridExtraction] LLM verification complete in ${verifyTime}ms`);
      } else {
        console.log('[hybridExtraction] Skipping LLM verification (skipVerify=true)');
      }

      // ── AI-Powered Table Extraction ─────────────────────────────────────
      // Uses the AI Table Classifier to:
      //   1. Classify every sheet by B-BBEE pillar (no hardcoded sheet names)
      //   2. Extract structured tables from correctly classified sheets
      //   3. Handle any sheet naming convention
      const tableStart = Date.now();
      let extractedTables: ExtractedTables = {};

      // Group chunks by sheet name for table extraction
      const sheetChunks = new Map<string, string[]>();
      for (const chunk of chunks) {
        const sheetMatch = chunk.pageId.match(/^sheet_(.+)_\d+-\d+$/);
        if (sheetMatch) {
          const sheet = sheetMatch[1];
          if (!sheetChunks.has(sheet)) sheetChunks.set(sheet, []);
          sheetChunks.get(sheet)!.push(chunk.text);
        }
      }

      if (sheetChunks.size > 0) {
        const { tables: aiTables, classifications } = await smartExtractTables(sheetChunks);
        extractedTables = aiTables;

        console.log(`[hybridExtraction] AI classified ${classifications.length} sheets:`);
        for (const c of classifications) {
          console.log(`  ${c.sheetName} → ${c.pillarType} (${(c.confidence * 100).toFixed(0)}%)`);
        }
      }

      const tableTime = Date.now() - tableStart;
      console.log(`[hybridExtraction] AI table extraction complete in ${tableTime}ms: employees=${extractedTables.employees?.length || 0}, shareholders=${extractedTables.shareholders?.length || 0}, suppliers=${extractedTables.suppliers?.length || 0}, contributions=${extractedTables.contributions?.length || 0}, training=${extractedTables.trainingPrograms?.length || 0}, financials=${(extractedTables as any).financials?.length || 0}`);

      const totalTime = Date.now() - totalStartTime;

      // Calculate stats
      const extractedCount = extractionResults.filter(r => r.value !== null).length;
      const nullCount = extractionResults.filter(r => r.value === null).length;
      const verifiedCount = extractionResults.filter(r => r.groqVerification?.valid === true).length;
      const invalidatedCount = extractionResults.filter(r => r.groqVerification?.valid === false).length;
      const avgConfidence = extractionResults.reduce((sum, r) => sum + r.confidence, 0) / extractionResults.length;

      // ── Detailed extraction diagnostics ──────────────────────────────────
      const foundEntities = extractionResults.filter(r => r.value !== null);
      const missedEntities = extractionResults.filter(r => r.value === null);

      const byPillar: Record<string, { found: string[]; missed: string[] }> = {};
      for (const r of extractionResults) {
        const p = r.pillar || 'unknown';
        if (!byPillar[p]) byPillar[p] = { found: [], missed: [] };
        if (r.value !== null) byPillar[p].found.push(r.name);
        else byPillar[p].missed.push(r.name);
      }

      console.log(`\n${'═'.repeat(70)}`);
      console.log(`[hybridExtraction] EXTRACTION REPORT`);
      console.log(`${'═'.repeat(70)}`);
      console.log(`  Total entities:  ${extractionResults.length}`);
      console.log(`  Extracted:       ${extractedCount} (${Math.round(extractedCount / extractionResults.length * 100)}%)`);
      console.log(`  Missing:         ${nullCount}`);
      console.log(`  Verified:        ${verifiedCount}`);
      console.log(`  Invalidated:     ${invalidatedCount}`);
      console.log(`  Avg confidence:  ${(avgConfidence * 100).toFixed(1)}%`);
      console.log(`  Timing:          parse=${parseTime}ms chunk=${chunkTime}ms index=${indexTime}ms extract=${extractTime}ms verify=${verifyTime}ms total=${totalTime}ms`);
      console.log(`  Chunks indexed:  ${chunks.length}`);
      console.log(`${'─'.repeat(70)}`);

      for (const [pillar, data] of Object.entries(byPillar)) {
        console.log(`  [${pillar}]  found=${data.found.length}  missed=${data.missed.length}`);
        if (data.found.length > 0) console.log(`    ✓ ${data.found.join(', ')}`);
        if (data.missed.length > 0) console.log(`    ✗ ${data.missed.join(', ')}`);
      }

      if (missedEntities.length > 0) {
        console.log(`${'─'.repeat(70)}`);
        console.log(`  MISSED ENTITIES (${missedEntities.length}):`);
        for (const m of missedEntities) {
          const reason = m.provenance.textSnippet === 'No relevant passages found' ? 'no_retrieval_match'
            : m.provenance.textSnippet === 'Chunk not found' ? 'chunk_not_found'
            : m.provenance.method === 'llm_fallback' ? 'llm_returned_null'
            : 'extraction_null';
          console.log(`    ✗ ${m.name} [${m.pillar}] reason=${reason} retrieval_score=${m.provenance.retrievalScore.toFixed(3)}`);
        }
      }
      console.log(`${'═'.repeat(70)}\n`);

      console.log(`[hybridExtraction] Complete: ${extractionResults.length} entities, ${totalTime}ms total (verify: ${verifyTime}ms)`);

      const response: ExtractionResponse = {
        success: true,
        entities: extractionResults,
        tables: extractedTables,
        timing: {
          parse: parseTime,
          chunk: chunkTime,
          load: loadTime,
          index: indexTime,
          extract: extractTime,
          verify: verifyTime,
          total: totalTime,
        },
        stats: {
          totalEntities: extractionResults.length,
          extractedCount,
          nullCount,
          verifiedCount,
          invalidatedCount,
          avgConfidence: Math.round(avgConfidence * 100) / 100,
        },
        documentId: sourceDocumentId || undefined,
      };

      res.json(response);
    } catch (error) {
      console.error('[hybridExtraction] Error:', error);
      res.status(500).json({
        error: 'Extraction failed',
        message: String(error),
      });
    }
  }
);

router.post('/infer-tables', requireAuth, async (req, res) => {
  try {
    const { entities } = req.body;
    if (!Array.isArray(entities) || entities.length === 0) {
      return res.status(400).json({ error: 'entities array is required' });
    }

    console.log(`[infer-tables] Inferring tables from ${entities.length} flat entities`);
    const tables = await inferTablesFromEntities(entities);

    console.log('[infer-tables] Inferred tables:', {
      shareholders: tables.shareholders?.length ?? 0,
      employees: tables.employees?.length ?? 0,
      suppliers: tables.suppliers?.length ?? 0,
      contributions: tables.contributions?.length ?? 0,
      trainingPrograms: tables.trainingPrograms?.length ?? 0,
    });

    res.json({ tables });
  } catch (error: any) {
    console.error('[infer-tables] Error:', error);
    res.status(500).json({ error: 'Table inference failed', message: error.message || String(error) });
  }
});

export default router;
