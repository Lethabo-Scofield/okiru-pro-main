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
import { Document, DocumentChunk } from '../../models.js';

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

interface ExtractionResponse {
  success: boolean;
  entities: ExtractionResult[];
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

/**
 * Parse uploaded file to text pages based on file type.
 */
async function parseFileToPages(
  buffer: Buffer,
  mimetype: string,
  originalname: string
): Promise<Array<{ pageId: string; text: string; metadata?: Record<string, any> }>> {
  const ext = originalname.toLowerCase().split('.').pop() || '';

  // CSV / Excel
  if (mimetype === 'text/csv' || ext === 'csv' || mimetype.includes('excel') || ext === 'xlsx' || ext === 'xls') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const pages: Array<{ pageId: string; text: string; metadata?: Record<string, any> }> = [];

    for (const sheetName of workbook.SheetNames) {
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      const MAX_XLSX_ROWS = 3000;
      const rowLimit = Math.min(jsonData.length, MAX_XLSX_ROWS);

      // Convert sheet to text format (row-based); cap rows so huge toolkits don't OOM or time out
      let text = `Sheet: ${sheetName}\n\n`;
      if (jsonData.length > MAX_XLSX_ROWS) {
        text += `[Note: first ${MAX_XLSX_ROWS} of ${jsonData.length} rows included for extraction]\n\n`;
      }
      for (let i = 0; i < rowLimit; i++) {
        const row = jsonData[i];
        if (row && row.length > 0) {
          text += `Row ${i + 1}: ${row.map(cell => String(cell || '')).join(' | ')}\n`;
        }
      }

      pages.push({
        pageId: `sheet_${sheetName}`,
        text,
        metadata: { sheetName, rowCount: jsonData.length, type: 'spreadsheet', rowsIncluded: rowLimit },
      });
    }

    return pages;
  }

  // PDF
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

  // DOCX (basic support - extract text from XML)
  if (mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') {
    try {
      // Simple DOCX text extraction using unzip + XML parsing
      const JSZip = await import('jszip');
      const zip = await JSZip.default.loadAsync(buffer);
      const documentXml = await zip.file('word/document.xml')?.async('text');

      if (documentXml) {
        // Extract text between <w:t> tags
        const textMatches = documentXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        const text = textMatches
          .map(match => match.replace(/<w:t[^>]*>|<\/w:t>/g, ''))
          .join(' ');

        return [{ pageId: 'docx_1', text, metadata: { type: 'docx' } }];
      }
    } catch (error) {
      console.warn('[hybridExtraction] DOCX parsing failed:', error);
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
        const pages = await parseFileToPages(file.buffer, file.mimetype, file.originalname);
        parseTime = Date.now() - parseStart;
        console.log(`[hybridExtraction] Parsed ${pages.length} pages in ${parseTime}ms`);

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

      // Step 5: Extract entities
      const extractStart = Date.now();
      const llmExtractor = new LLMExtractor();
      const provenanceTracker = new ProvenanceTracker();
      const extractionResults: ExtractionResult[] = [];

      // Process entities in parallel batches. 15 concurrent Azure calls is safe
      // for standard Azure OpenAI rate limits and cuts wall-clock time ~3x vs 5.
      const BATCH_SIZE = 15;
      const entities = getAllEntities(manifest);

      for (let i = 0; i < entities.length; i += BATCH_SIZE) {
        const batch = entities.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
          batch.map(async (entity) => {
            try {
              // Build search query from entity
              const searchQuery = [entity.name, ...entity.extraction.aliases].join(' ');

              // Hybrid retrieval with embeddings (no per-entity LLM reranking —
              // embedding+BM25 scoring is sufficient and avoids extra Azure calls)
              const retrievalResults = await retriever.searchWithEmbeddings(
                searchQuery,
                10,
                {
                  rerank: false,
                  rerankTopK: 5,
                  getChunkText: (pageId) => {
                    const chunk = chunks.find(c => c.chunkId === pageId || c.pageId === pageId);
                    return chunk?.text;
                  },
                }
              );

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

              // Get top chunk for extraction
              const topResult = retrievalResults[0];
              const topChunk = chunks.find(
                c => c.chunkId === topResult.pageId || c.pageId === topResult.pageId
              );

              if (!topChunk) {
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

              const extractionRequest = toExtractionRequest(entity, topChunk.text, topChunk.pageId);

              const llmResult = await llmExtractor.extract(extractionRequest);

              const confidenceResult = computeConfidence({
                retrievalScore: topResult.score,
                maxRetrievalScore: 1,
                matchedEntities: retrievalResults[0]?.matchedEntities?.length ?? 0,
                expectedEntities: Math.max(1, entity.extraction.aliases.length),
                structurallyVerified: llmResult.structuralVerification,
                valueIsNull: llmResult.extractedValue === null,
                foundInExpectedZone: entity.extraction.zones.length === 0 || entity.extraction.zones.some(z => (topChunk.metadata?.sheetName || topChunk.pageId || '').toLowerCase().includes(z.toLowerCase())),
                llmValue: llmResult.extractedValue,
                ruleBasedValue: null,
              });

              const validation: ValidationResult | undefined = undefined;

              const formattedValue = formatExtractedValue(llmResult.extractedValue, entity.fieldType);

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

        // Progress logging
        console.log(`[hybridExtraction] Processed ${Math.min(i + BATCH_SIZE, entities.length)}/${entities.length} entities`);
      }

      extractTime = Date.now() - extractStart;

      // ── LLM Verification Pass (Azure OpenAI gpt-4o) ──────────────────────
      // For every entity that produced a non-null value, ask Azure to confirm
      // the extracted value is actually correct (verification, NOT re-extraction).
      {
        const verifyStart = Date.now();
        const VERIFY_BATCH = 10;

        const toVerify = extractionResults
          .map((r, idx) => ({ r, idx }))
          .filter(({ r }) => r.value !== null && r.value !== '');

        console.log(`[hybridExtraction] Starting LLM verification for ${toVerify.length} non-null entities`);

        for (let vi = 0; vi < toVerify.length; vi += VERIFY_BATCH) {
          const batch = toVerify.slice(vi, vi + VERIFY_BATCH);

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

          console.log(`[hybridExtraction] Verified ${Math.min(vi + VERIFY_BATCH, toVerify.length)}/${toVerify.length} entities`);
        }

        verifyTime = Date.now() - verifyStart;
        console.log(`[hybridExtraction] LLM verification complete in ${verifyTime}ms`);
      }

      const totalTime = Date.now() - totalStartTime;

      // Calculate stats
      const extractedCount = extractionResults.filter(r => r.value !== null).length;
      const nullCount = extractionResults.filter(r => r.value === null).length;
      const verifiedCount = extractionResults.filter(r => r.groqVerification?.valid === true).length;
      const invalidatedCount = extractionResults.filter(r => r.groqVerification?.valid === false).length;
      const avgConfidence = extractionResults.reduce((sum, r) => sum + r.confidence, 0) / extractionResults.length;

      console.log(`[hybridExtraction] Complete: ${extractionResults.length} entities, ${totalTime}ms total (verify: ${verifyTime}ms)`);

      const response: ExtractionResponse = {
        success: true,
        entities: extractionResults,
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

export default router;
