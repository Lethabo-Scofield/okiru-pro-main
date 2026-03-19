/**
 * Document Routes
 *
 * Handles document upload, storage, and extraction via audit-ai.
 * Documents are stored in MongoDB with their chunked representations.
 * Entity extraction uses the audit-ai service (LLM for extraction only, never calculations).
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import { Document, DocumentChunk } from '../../models.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const AUDIT_AI_URL = process.env.AUDIT_AI_URL || 'http://localhost:8007';

// ---------------------------------------------------------------------------
// POST /api/documents/upload - Upload a document for storage and chunking
// ---------------------------------------------------------------------------
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File is required (multipart field: file)' });
    }

    const buffer = req.file.buffer;
    const filename = req.file.originalname || 'document';
    const fileType = req.file.mimetype || 'application/octet-stream';
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    const existing = await Document.findOne({ fileHash });
    if (existing) {
      return res.json({
        message: 'Document already uploaded',
        documentId: existing._id,
        filename: existing.filename,
      });
    }

    const doc = await Document.create({
      filename,
      fileType,
      uploadedAt: new Date(),
      userId: req.body.userId || null,
      entityId: req.body.entityId || null,
      fileHash,
      fileSize: buffer.length,
      rawContent: buffer,
      status: 'uploaded',
    });

    let chunkCount = 0;
    try {
      const formData = new FormData();
      formData.append('file', new Blob([new Uint8Array(buffer)]), filename);

      const resp = await fetch(`${AUDIT_AI_URL}/api/audit/chunk`, {
        method: 'POST',
        body: formData,
      });

      if (resp.ok) {
        const data = await resp.json() as { chunks?: Array<Record<string, unknown>> };
        if (data.chunks && Array.isArray(data.chunks)) {
          const chunkDocs = data.chunks.map((chunk: Record<string, unknown>, idx: number) => ({
            documentId: doc._id,
            chunkIndex: idx,
            text: chunk.text || '',
            pageNumber: chunk.page_number || chunk.pageNumber || null,
            sheetName: chunk.sheet_name || chunk.sheetName || null,
            sectionPath: chunk.section_path || chunk.sectionPath || '',
            chunkType: chunk.chunk_type || chunk.chunkType || 'text',
            metadata: chunk.metadata || {},
            tokenCount: chunk.token_count || chunk.tokenCount || 0,
          }));
          await DocumentChunk.insertMany(chunkDocs);
          chunkCount = chunkDocs.length;
        }
      }

      await Document.findByIdAndUpdate(doc._id, { status: 'chunked', chunkCount });
    } catch (err: unknown) {
      console.warn('[Documents] Chunking failed (non-blocking):', err);
      await Document.findByIdAndUpdate(doc._id, { status: 'chunk_failed' });
    }

    return res.json({
      documentId: doc._id,
      filename,
      fileType,
      fileHash,
      fileSize: buffer.length,
      chunkCount,
      status: chunkCount > 0 ? 'chunked' : 'uploaded',
    });
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Upload failed',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/documents - List all documents
// ---------------------------------------------------------------------------
router.get('/', async (req: Request, res: Response) => {
  try {
    const entityId = req.query.entityId as string | undefined;
    const filter = entityId ? { entityId } : {};
    const docs = await Document.find(filter)
      .select('-rawContent')
      .sort({ uploadedAt: -1 })
      .limit(100);
    return res.json(docs);
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to list documents',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/documents/:id - Get document metadata
// ---------------------------------------------------------------------------
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const doc = await Document.findById(req.params.id).select('-rawContent');
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    return res.json(doc);
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to get document',
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/documents/:id/chunks - Get chunks for a document
// ---------------------------------------------------------------------------
router.get('/:id/chunks', async (req: Request, res: Response) => {
  try {
    const chunks = await DocumentChunk.find({ documentId: req.params.id })
      .sort({ chunkIndex: 1 });
    return res.json({
      documentId: req.params.id,
      totalChunks: chunks.length,
      chunks,
    });
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to get chunks',
    });
  }
});

// ---------------------------------------------------------------------------
// POST /api/entities/extract - Extract entities from a document via audit-ai
// ---------------------------------------------------------------------------
router.post('/extract-entities', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const entityDefinitions = req.body.entityDefinitions;
    if (!entityDefinitions) {
      return res.status(400).json({ message: 'entityDefinitions JSON is required' });
    }

    let fileBuffer: Buffer | null = null;
    let filename = 'document';

    if (req.file) {
      fileBuffer = req.file.buffer;
      filename = req.file.originalname || 'document';
    } else if (req.body.documentId) {
      const doc = await Document.findById(req.body.documentId);
      if (!doc || !doc.rawContent) {
        return res.status(404).json({ message: 'Document not found or has no content' });
      }
      fileBuffer = doc.rawContent;
      filename = doc.filename;
    }

    if (!fileBuffer) {
      return res.status(400).json({ message: 'Either file upload or documentId is required' });
    }

    const formData = new FormData();
    formData.append('file', new Blob([new Uint8Array(fileBuffer)]), filename);
    formData.append('entity_definitions', typeof entityDefinitions === 'string'
      ? entityDefinitions
      : JSON.stringify(entityDefinitions));

    const resp = await fetch(`${AUDIT_AI_URL}/api/audit/extract-entities`, {
      method: 'POST',
      body: formData,
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return res.status(resp.status).json({
        message: `Extraction service error: ${errText}`,
      });
    }

    const extractionResult = await resp.json();
    return res.json(extractionResult);
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Entity extraction failed',
    });
  }
});

export default router;
