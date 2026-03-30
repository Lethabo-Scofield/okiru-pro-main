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
  status: 'pending' | 'approved' | 'rejected';
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
    total: number;
  };
  stats: {
    totalEntities: number;
    extractedCount: number;
    nullCount: number;
    avgConfidence: number;
  };
  documentId?: string; // Return the document ID used for extraction
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

      // Convert sheet to text format (row-based)
      let text = `Sheet: ${sheetName}\n\n`;
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (row && row.length > 0) {
          text += `Row ${i + 1}: ${row.map(cell => String(cell || '')).join(' | ')}\n`;
        }
      }

      pages.push({
        pageId: `sheet_${sheetName}`,
        text,
        metadata: { sheetName, rowCount: jsonData.length, type: 'spreadsheet' },
      });
    }

    return pages;
  }

  // PDF
  if (mimetype === 'application/pdf' || ext === 'pdf') {
    const pdfDocument = await pdfjs.getDocument({ data: buffer }).promise;
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

      // Build hybrid retriever
      const retriever = new HybridRetriever(bm25Index, entityIndex, vectorStore, {
        entityWeight: 0.15,
        bm25Weight: 0.35,
        semanticWeight: 0.5,
        topK: 10,
        enableReranking: true,
        rerankTopK: 5,
      });

      indexTime = Date.now() - indexStart;
      console.log(`[hybridExtraction] Indexes built in ${indexTime}ms`);

      // Step 4: Load entity manifest
      const manifest = buildManifest(sectorCode.toUpperCase(), scorecardType);

      // Step 5: Extract entities
      const extractStart = Date.now();
      const llmExtractor = new LLMExtractor();
      const provenanceTracker = new ProvenanceTracker();
      const extractionResults: ExtractionResult[] = [];

      // Process entities in batches to avoid overwhelming the LLM
      const BATCH_SIZE = 5;
      const entities = getAllEntities(manifest);

      for (let i = 0; i < entities.length; i += BATCH_SIZE) {
        const batch = entities.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
          batch.map(async (entity) => {
            try {
              // Build search query from entity
              const searchQuery = [entity.name, ...entity.extraction.aliases].join(' ');

              // Hybrid retrieval with embeddings and optional reranking
              const retrievalResults = await retriever.searchWithEmbeddings(
                searchQuery,
                10,
                {
                  rerank: true,
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
                  confidence: 0.3,
                  status: 'pending' as const,
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
                  confidence: 0.3,
                  status: 'pending' as const,
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

              // Build LLM extraction request
              const extractionRequest = toExtractionRequest(entity, topChunk.text, topChunk.pageId);

              // Extract using LLM
              const llmResult = await llmExtractor.extract(extractionRequest);

              // Compute confidence
              const confidenceFactors = {
                retrievalScore: topResult.score,
                verificationPassed: llmResult.structuralVerification,
                validationPassed: llmResult.confidence > 0.7,
                extractionMethod: llmResult.method,
              };
              const confidenceResult = computeConfidence(confidenceFactors);

              // Skip cross-entity validation during extraction - will be done post-processing
              // validateAll is for grouped data validation, not individual entity values
              const validation: ValidationResult | undefined = undefined;

              return {
                name: entity.name,
                value: llmResult.extractedValue,
                confidence: confidenceResult.score,
                status: 'pending' as const,
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
                status: 'pending' as const,
                pillar: entity.pillarCode,
                fieldType: entity.fieldType,
                definition: entity.extraction.definition,
                provenance: {
                  pageId: 'error',
                  chunkId: 'error',
                  textSnippet: String(error),
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
      const totalTime = Date.now() - totalStartTime;

      // Calculate stats
      const extractedCount = extractionResults.filter(r => r.value !== null).length;
      const nullCount = extractionResults.filter(r => r.value === null).length;
      const avgConfidence = extractionResults.reduce((sum, r) => sum + r.confidence, 0) / extractionResults.length;

      console.log(`[hybridExtraction] Complete: ${extractionResults.length} entities, ${totalTime}ms total`);

      const response: ExtractionResponse = {
        success: true,
        entities: extractionResults,
        timing: {
          parse: parseTime,
          chunk: chunkTime,
          load: loadTime,
          index: indexTime,
          extract: extractTime,
          total: totalTime,
        },
        stats: {
          totalEntities: extractionResults.length,
          extractedCount,
          nullCount,
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
