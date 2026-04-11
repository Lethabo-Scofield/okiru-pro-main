import { Router, Request, Response } from 'express';
import { createLogger } from '../logger.js';
import { isMongoConnected } from '../../db.js';
import { ProcessorSessionModel } from '../../models.js';
import { gzipSync, gunzipSync } from 'zlib';

const logger = createLogger("ProcessorSessions");

// MongoDB document size limit is 16MB, we stay well under that
const MAX_DOC_SIZE_MB = 15;
const MAX_DOC_SIZE_BYTES = MAX_DOC_SIZE_MB * 1024 * 1024;

/**
 * Compress large data fields to stay under MongoDB's 16MB limit
 */
function compressIfLarge(data: any): { data: any; compressed: boolean } {
  if (!data) return { data, compressed: false };

  const jsonStr = JSON.stringify(data);
  const sizeBytes = Buffer.byteLength(jsonStr, 'utf8');

  if (sizeBytes > 100 * 1024) { // Compress if > 100KB
    const compressed = gzipSync(Buffer.from(jsonStr, 'utf8'));
    return {
      data: compressed.toString('base64'),
      compressed: true
    };
  }

  return { data, compressed: false };
}

/**
 * Estimate total document size
 */
function estimateSize(obj: any): number {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

/**
 * Prune large entity arrays to stay under size limit
 */
function pruneLargeData(data: any): any {
  if (!data || typeof data !== 'object') return data;

  const pruned: any = {};
  for (const [key, value] of Object.entries(data)) {
    if (Array.isArray(value) && value.length > 50) {
      pruned[key] = {
        _pruned: true,
        totalCount: value.length,
        items: value.slice(0, 50),
      };
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      pruned[key] = pruneLargeData(value);
    } else {
      pruned[key] = value;
    }
  }
  return pruned;
}

/**
 * Strip file content/buffers from filesData to prevent bloating sessions.
 * Only metadata (name, size, type, id) is kept.
 */
function stripFileBuffers(filesData: any[]): any[] {
  if (!Array.isArray(filesData)) return [];
  return filesData.map((f: any) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    type: f.type,
    status: f.status,
    // Explicitly exclude: content, buffer, data, base64, arrayBuffer, etc.
  }));
}

/**
 * Strip extraction results down to essential fields only.
 * Removes large provenance text snippets and raw data.
 */
function stripExtractionResults(results: any[]): any[] {
  if (!Array.isArray(results)) return [];
  return results.map((r: any) => {
    const stripped: any = {
      fileName: r.fileName,
      templateName: r.templateName,
      sectorCode: r.sectorCode,
      scorecardType: r.scorecardType,
    };
    if (Array.isArray(r.entities)) {
      stripped.entities = r.entities.map((e: any) => ({
        name: e.name,
        value: e.value,
        confidence: e.confidence,
        status: e.status,
        pillar: e.pillar,
        fieldType: e.fieldType,
        // Exclude: provenance (textSnippet can be huge), definition, groqVerification
      }));
    }
    return stripped;
  });
}

export function createProcessorSessionsRouter(): Router {
  const router = Router();

  // GET /api/processor-sessions - List all sessions for the user
  router.get('/', async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (!isMongoConnected()) {
      return res.json([]);
    }

    try {
      const query = { createdByUserId: userId };
      logger.debug(`Fetching sessions for user: ${userId}`);

      const sessions = await ProcessorSessionModel.find(query)
        .select({
          sessionId: 1,
          companyInfo: 1,
          currentStep: 1,
          isComplete: 1,
          flowMode: 1,
          'filesData.id': 1,
          'filesData.name': 1,
          'filesData.size': 1,
          'filesData.type': 1,
          'extractionResults.fileName': 1,
          'extractionResults.templateName': 1,
          createdAt: 1,
          updatedAt: 1,
        })
        .sort({ updatedAt: -1 })
        .lean();

      const lightweight = sessions.map((s: any) => ({
        id: s.sessionId,
        sessionId: s.sessionId,
        companyInfo: {
          name: s.companyInfo?.name || '',
          sector: s.companyInfo?.sector || '',
          registrationNumber: s.companyInfo?.registrationNumber || '',
          annualTurnover: s.companyInfo?.annualTurnover || '',
          employees: s.companyInfo?.employees || '',
          contactName: s.companyInfo?.contactName || '',
          contactEmail: s.companyInfo?.contactEmail || '',
          currentBBEELevel: s.companyInfo?.currentBBEELevel || '',
        },
        currentStep: s.currentStep,
        isComplete: s.isComplete,
        flowMode: s.flowMode || null,
        filesData: (s.filesData || []).map((f: any) => ({ id: f.id, name: f.name, size: f.size, type: f.type })),
        extractionResults: (s.extractionResults || []).map((r: any) => ({ fileName: r.fileName, templateName: r.templateName })),
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));

      res.json(lightweight);
    } catch (error: any) {
      logger.error("Error fetching processor sessions", error);
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // GET /api/processor-sessions/:sessionId - Get full session
  router.get('/:sessionId', async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (!isMongoConnected()) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    try {
      const { sessionId } = req.params;
      const doc = await ProcessorSessionModel.findOne({ sessionId, createdByUserId: userId }).lean();

      if (!doc) {
        return res.status(404).json({ error: "Session not found" });
      }

      const result: any = { ...doc, id: (doc as any).sessionId };

      // Decompress data if needed
      try {
        if ((doc as any)._scorecardCompressed && typeof result.scorecardResult === 'string') {
          const decompressed = gunzipSync(Buffer.from(result.scorecardResult, 'base64'));
          result.scorecardResult = JSON.parse(decompressed.toString('utf8'));
          delete result._scorecardCompressed;
        }
        if ((doc as any)._foundationCompressed && typeof result.foundationData === 'string') {
          const decompressed = gunzipSync(Buffer.from(result.foundationData, 'base64'));
          result.foundationData = JSON.parse(decompressed.toString('utf8'));
          delete result._foundationCompressed;
        }
        if ((doc as any)._pillarCompressed && typeof result.pillarData === 'string') {
          const decompressed = gunzipSync(Buffer.from(result.pillarData, 'base64'));
          result.pillarData = JSON.parse(decompressed.toString('utf8'));
          delete result._pillarCompressed;
        }
      } catch (decompressErr) {
        logger.warn(`Failed to decompress session ${sessionId}`, decompressErr);
        // Continue with potentially compressed data
      }

      res.json(result);
    } catch (error: any) {
      logger.error("Error fetching processor session", error);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  // POST /api/processor-sessions - Save/upsert session
  router.post('/', async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (!isMongoConnected()) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    try {
      const {
        sessionId, companyInfo, currentStep, filesData, fileClassifications,
        extractionResults, docStatuses, isComplete, scorecardResult,
        foundationData, pillarData, flowMode,
      } = req.body;

      if (!sessionId || !companyInfo?.name) {
        return res.status(400).json({ error: "sessionId and companyInfo.name are required" });
      }

      const existing = await ProcessorSessionModel.findOne({ sessionId });
      if (existing && existing.createdByUserId !== userId) {
        return res.status(403).json({ error: "You don't have permission to modify this session" });
      }

      // Strip file buffers/content from filesData - only keep metadata
      const safeFilesData = stripFileBuffers(filesData);
      // Strip extraction results to essentials
      const safeExtractionResults = stripExtractionResults(extractionResults);

      // Compress large data fields to stay under MongoDB's 16MB limit
      const compressedScorecard = scorecardResult !== undefined ? compressIfLarge(scorecardResult) : undefined;
      const compressedFoundation = foundationData !== undefined ? compressIfLarge(foundationData) : undefined;
      const compressedPillar = pillarData !== undefined ? compressIfLarge(pruneLargeData(pillarData)) : undefined;

      const updateData: any = {
        sessionId,
        createdByUserId: userId,
        companyInfo,
        currentStep: currentStep || 'upload',
        filesData: safeFilesData,
        fileClassifications: fileClassifications || {},
        extractionResults: safeExtractionResults,
        docStatuses: docStatuses || {},
        isComplete: isComplete || false,
        updatedAt: new Date(),
      };

      if (compressedScorecard) {
        updateData.scorecardResult = compressedScorecard.data;
        updateData._scorecardCompressed = compressedScorecard.compressed;
      }
      if (compressedFoundation) {
        updateData.foundationData = compressedFoundation.data;
        updateData._foundationCompressed = compressedFoundation.compressed;
      }
      if (compressedPillar) {
        updateData.pillarData = compressedPillar.data;
        updateData._pillarCompressed = compressedPillar.compressed;
      }
      if (flowMode !== undefined) updateData.flowMode = flowMode;

      // Check estimated size and apply progressive pruning
      let estimatedSize = estimateSize(updateData);
      if (estimatedSize > MAX_DOC_SIZE_BYTES) {
        logger.warn(`Session ${sessionId} exceeds limit after initial pruning (${(estimatedSize / 1024 / 1024).toFixed(2)}MB). Stripping extraction entities.`);
        // Strip extraction results to bare minimum
        updateData.extractionResults = (extractionResults || []).map((r: any) => ({
          fileName: r.fileName,
          templateName: r.templateName,
        }));
        estimatedSize = estimateSize(updateData);
      }

      if (estimatedSize > MAX_DOC_SIZE_BYTES) {
        logger.warn(`Session ${sessionId} still exceeds limit (${(estimatedSize / 1024 / 1024).toFixed(2)}MB). Dropping pillarData & foundationData.`);
        // Last resort: drop the heaviest fields entirely
        updateData.pillarData = null;
        updateData._pillarCompressed = false;
        updateData.foundationData = null;
        updateData._foundationCompressed = false;
        estimatedSize = estimateSize(updateData);
      }

      if (estimatedSize > MAX_DOC_SIZE_BYTES) {
        logger.warn(`Session ${sessionId} still exceeds limit (${(estimatedSize / 1024 / 1024).toFixed(2)}MB). Dropping scorecardResult.`);
        updateData.scorecardResult = null;
        updateData._scorecardCompressed = false;
      }

      const doc = await ProcessorSessionModel.findOneAndUpdate(
        { sessionId, createdByUserId: userId },
        updateData,
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      res.json({ ...doc.toJSON(), id: (doc as any).sessionId });
    } catch (error: any) {
      logger.error("Error saving processor session", error);
      res.status(500).json({ error: "Failed to save session" });
    }
  });

  // PATCH /api/processor-sessions/:sessionId - Partial update
  router.patch('/:sessionId', async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (!isMongoConnected()) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    try {
      const { sessionId } = req.params;
      const allowedFields = ['currentStep', 'isComplete', 'scorecardResult', 'toolkitClientId',
        'foundationData', 'pillarData', 'flowMode'];
      const patch: any = { updatedAt: new Date() };

      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          // Compress large data fields
          if (field === 'scorecardResult') {
            const compressed = compressIfLarge(req.body[field]);
            patch[field] = compressed.data;
            patch._scorecardCompressed = compressed.compressed;
          } else if (field === 'foundationData') {
            const compressed = compressIfLarge(req.body[field]);
            patch[field] = compressed.data;
            patch._foundationCompressed = compressed.compressed;
          } else if (field === 'pillarData') {
            const compressed = compressIfLarge(pruneLargeData(req.body[field]));
            patch[field] = compressed.data;
            patch._pillarCompressed = compressed.compressed;
          } else {
            patch[field] = req.body[field];
          }
        }
      }

      const doc = await ProcessorSessionModel.findOneAndUpdate(
        { sessionId, createdByUserId: userId },
        { $set: patch },
        { new: true },
      );

      if (!doc) {
        return res.status(404).json({ error: "Session not found or you don't have permission" });
      }

      res.json({ ...doc.toJSON(), id: (doc as any).sessionId });
    } catch (error: any) {
      logger.error("Error patching processor session", error);
      res.status(500).json({ error: "Failed to patch session" });
    }
  });

  // DELETE /api/processor-sessions/:sessionId - Delete session
  router.delete('/:sessionId', async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (!isMongoConnected()) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    try {
      const { sessionId } = req.params;
      const result = await ProcessorSessionModel.deleteOne({ sessionId, createdByUserId: userId });

      if (result.deletedCount === 0) {
        return res.status(404).json({ error: "Session not found or you don't have permission" });
      }

      res.json({ success: true });
    } catch (error: any) {
      logger.error("Error deleting processor session", error);
      res.status(500).json({ error: "Failed to delete session" });
    }
  });

  return router;
}
