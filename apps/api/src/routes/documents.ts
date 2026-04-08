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

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// Document extraction will be handled internally using patterns from audit-ai as reference

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
      console.error('PDF parsing error:', pdfError);
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
      console.warn('[documents] DOCX parsing failed:', error);
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

    // Create document record first
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

    // Parse and chunk the document immediately on upload
    console.log(`[documents] Parsing ${filename} for chunking...`);
    const parseStart = Date.now();
    const pages = await parseFileToPages(buffer, fileType, filename);
    const parseTime = Date.now() - parseStart;
    console.log(`[documents] Parsed ${pages.length} pages in ${parseTime}ms`);

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
    console.log(`[documents] Building chunks...`);
    const chunkStart = Date.now();
    const chunker = new DocumentChunker();
    const documentId = doc._id.toString();
    const chunks = chunker.chunkPages(pages.map(p => ({ pageId: p.pageId, text: p.text })), documentId);
    const chunkTime = Date.now() - chunkStart;
    console.log(`[documents] Created ${chunks.length} chunks in ${chunkTime}ms`);

    // Save chunks to MongoDB
    console.log(`[documents] Saving ${chunks.length} chunks to database...`);
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
    console.log(`[documents] Saved chunks in ${saveTime}ms`);

    // Update document status
    await Document.findByIdAndUpdate(doc._id, { status: 'chunked', chunkCount: chunks.length });

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
    console.error('[documents] Upload failed:', error);
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
