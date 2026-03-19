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

// Document extraction will be handled internally using patterns from audit-ai as reference

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

    // For now, just store the document. Chunking will be implemented later using audit-ai patterns
    let chunkCount = 0;
    await Document.findByIdAndUpdate(doc._id, { status: 'uploaded', chunkCount });

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

    // Entity extraction will be implemented later using audit-ai patterns as reference
    return res.json({
      message: 'Entity extraction not yet implemented. Will use audit-ai patterns as reference.',
      filename,
      entityDefinitions: typeof entityDefinitions === 'string' ? JSON.parse(entityDefinitions) : entityDefinitions,
    });
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Entity extraction failed',
    });
  }
});

export default router;
