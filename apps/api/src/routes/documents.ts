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
import * as XLSX from 'xlsx';
import { Document, DocumentChunk } from '../../models.js';
import { DocumentChunker } from '../../pipeline/extraction/documentChunker.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createLogger } from '../logger.js';

const logger = createLogger('Documents');
const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

router.use(requireAuth);

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
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];

      // Convert sheet to text representation
      let sheetText = `Sheet: ${sheetName}\n`;
      for (const row of jsonData) {
        const rowText = row.map(cell => String(cell)).filter(cell => cell).join(' | ');
        if (rowText) sheetText += rowText + '\n';
      }

      pages.push({
        pageId: `sheet_${sheetName}`,
        text: sheetText,
        metadata: { sheetName, type: 'spreadsheet' }
      });
    }

    return pages;
  }

  if (mimetype === 'application/pdf' || ext === 'pdf') {
    try {
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
      const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
      const pdfDoc = await loadingTask.promise;
      const pages: Array<{ pageId: string; text: string; metadata?: any }> = [];
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const text = content.items
          .filter((item: any) => 'str' in item)
          .map((item: any) => item.str)
          .join(' ');
        if (text.trim()) {
          pages.push({ pageId: `pdf_${i}`, text, metadata: { type: 'pdf', pageNumber: i } });
        }
      }
      if (pages.length === 0) {
        pages.push({ pageId: 'pdf_1', text: '[PDF contained no extractable text - may require OCR]', metadata: { type: 'pdf', needsOcr: true } });
      }
      return pages;
    } catch (pdfError) {
      logger.error('PDF parsing failed', pdfError);
      return [{ pageId: 'pdf_1', text: '[PDF parsing failed]', metadata: { type: 'pdf', error: true } }];
    }
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
      const JSZip = await import('jszip');
      const zip = await JSZip.default.loadAsync(buffer);
      const documentXml = await zip.file('word/document.xml')?.async('text');

      if (documentXml) {
        const textMatches = documentXml.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
        const text = textMatches
          .map(match => match.replace(/<w:t[^>]*>|<\/w:t>/g, ''))
          .join(' ');

        return [{ pageId: 'docx_1', text, metadata: { type: 'docx' } }];
      }
    } catch (error) {
      logger.warn('DOCX parsing failed', { error: error instanceof Error ? error.message : String(error) });
    }

    return [{ pageId: 'docx_1', text: '', metadata: { type: 'docx', error: 'Failed to parse' } }];
  }

  // Unsupported type - return as raw text
  return [{ pageId: 'raw_1', text: buffer.toString('utf-8'), metadata: { type: 'raw' } }];
}

// ---------------------------------------------------------------------------
// POST /api/documents/upload - Upload a document for storage and chunking
// ---------------------------------------------------------------------------
router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
  const start = Date.now();
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'File is required (multipart field: file)' });
    }

    const buffer = req.file.buffer;
    const filename = req.file.originalname || 'document';
    const fileType = req.file.mimetype || 'application/octet-stream';
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

    const userId = (req.session as any).userId;

    const existing = await Document.findOne({ fileHash, userId });
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
      userId,
      entityId: req.body.entityId || null,
      fileHash,
      fileSize: buffer.length,
      rawContent: buffer,
      status: 'uploaded',
    });

    // Parse and chunk the document immediately on upload
    logger.info('Parsing document for chunking', { filename });
    const parseStart = Date.now();
    const pages = await parseFileToPages(buffer, fileType, filename);
    const parseTime = Date.now() - parseStart;
    logger.info('Document parsed', { filename, pageCount: pages.length, parseTimeMs: parseTime });

    if (pages.length === 0 || pages.every(p => !p.text.trim())) {
      await Document.findByIdAndUpdate(doc._id, { status: 'uploaded', chunkCount: 0 });
      return res.json({
        documentId: doc._id,
        filename,
        fileType,
        fileHash,
        fileSize: buffer.length,
        chunkCount: 0,
        status: 'uploaded',
        warning: 'No text content extracted from file',
      });
    }

    // Build chunks
    logger.info('Building chunks', { filename });
    const chunkStart = Date.now();
    const chunker = new DocumentChunker();
    const documentId = doc._id.toString();
    const chunks = chunker.chunkPages(pages.map(p => ({ pageId: p.pageId, text: p.text })), documentId);
    const chunkTime = Date.now() - chunkStart;
    logger.info('Chunks created', { filename, chunkCount: chunks.length, chunkTimeMs: chunkTime });

    // Save chunks to MongoDB
    logger.info('Saving chunks to database', { chunkCount: chunks.length });
    const saveStart = Date.now();
    const chunkDocs = chunks.map((chunk, index) => ({
      documentId: doc._id,
      chunkIndex: index,
      text: chunk.text,
      pageNumber: chunk.metadata?.pageNumber || null,
      sheetName: chunk.metadata?.sheetName || null,
      sectionPath: chunk.metadata?.sectionPath || '',
      chunkType: chunk.metadata?.chunkType || 'text',
      metadata: chunk.metadata || {},
      tokenCount: chunk.text.length / 4, // Rough approximation
    }));

    await DocumentChunk.insertMany(chunkDocs);
    const saveTime = Date.now() - saveStart;
    logger.info('Chunks saved', { chunkCount: chunks.length, saveTimeMs: saveTime });

    // Update document status
    await Document.findByIdAndUpdate(doc._id, { status: 'chunked', chunkCount: chunks.length });

    logger.info('Document uploaded successfully', { documentId: doc._id, filename, fileSize: buffer.length, chunkCount: chunks.length, durationMs: Date.now() - start });

    return res.json({
      documentId: doc._id,
      filename,
      fileType,
      fileHash,
      fileSize: buffer.length,
      chunkCount: chunks.length,
      status: 'chunked',
      timing: {
        parse: parseTime,
        chunk: chunkTime,
        save: saveTime,
        total: parseTime + chunkTime + saveTime,
      },
    });
  } catch (error: unknown) {
    logger.error('Upload failed', error);
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
    const userId = (req.session as any).userId;
    const entityId = req.query.entityId as string | undefined;
    const filter: Record<string, any> = { userId };
    if (entityId) filter.entityId = entityId;
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
    const userId = (req.session as any).userId;
    const doc = await Document.findOne({ _id: req.params.id, userId }).select('-rawContent');
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
    const userId = (req.session as any).userId;
    const parentDoc = await Document.findOne({ _id: req.params.id, userId }).select('_id');
    if (!parentDoc) return res.status(404).json({ message: 'Document not found' });
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
// GET /api/documents/:id/download - Download raw file content for session resume
// ---------------------------------------------------------------------------
router.get('/:id/download', async (req: Request, res: Response) => {
  try {
    const userId = (req.session as any).userId;
    const doc = await Document.findOne({ _id: req.params.id, userId });
    if (!doc) return res.status(404).json({ message: 'Document not found' });
    if (!doc.rawContent) return res.status(404).json({ message: 'No file content stored' });
    res.setHeader('Content-Type', doc.fileType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.filename)}"`);
    res.setHeader('Content-Length', doc.rawContent.length);
    return res.send(doc.rawContent);
  } catch (error: unknown) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Failed to download document',
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
