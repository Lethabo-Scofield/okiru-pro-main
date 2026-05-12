import { Router, Request, Response } from 'express';
import { createLogger } from '../logger.js';
import { isMongoConnected } from '../../db.js';
import { ProcessorSessionModel, SessionBlobModel } from '../../models.js';

const logger = createLogger("ProcessorSessions");

function routeParam(v: string | string[] | undefined): string {
  if (v == null) return '';
  return Array.isArray(v) ? String(v[0] ?? '') : String(v);
}

/**
 * Strip file content/buffers from filesData to prevent bloating sessions.
 * Only metadata (name, size, type, id, status) is kept.
 */
function stripFileBuffers(filesData: any[]): any[] {
  if (!Array.isArray(filesData)) return [];
  return filesData.map((f: any) => ({
    id: f.id,
    name: f.name,
    size: f.size,
    type: f.type,
    status: f.status,
    documentId: f.documentId || null,
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

/**
 * Save a blob field to the separate sessionBlobs collection.
 * Uses upsert to replace existing blob for this session+field.
 */
async function saveBlob(sessionId: string, field: string, data: any, userId?: string): Promise<void> {
  if (data === undefined || data === null) return;
  try {
    await SessionBlobModel.findOneAndUpdate(
      { sessionId, field },
      { sessionId, field, data, createdByUserId: userId || null, updatedAt: new Date() },
      { upsert: true, new: true }
    );
  } catch (err) {
    logger.error(`Failed to save blob ${field} for session ${sessionId}`, err);
    throw err;
  }
}

/**
 * Load all blob fields for a session and merge them into the session object.
 */
async function loadBlobs(sessionId: string): Promise<Record<string, any>> {
  try {
    const blobs = await SessionBlobModel.find({ sessionId }).lean();
    const result: Record<string, any> = {};
    for (const blob of blobs) {
      result[blob.field] = blob.data;
    }
    return result;
  } catch (err) {
    logger.error(`Failed to load blobs for session ${sessionId}`, err);
    return {};
  }
}

/**
 * Delete all blobs for a session.
 */
async function deleteBlobs(sessionId: string): Promise<void> {
  try {
    await SessionBlobModel.deleteMany({ sessionId });
  } catch (err) {
    logger.error(`Failed to delete blobs for session ${sessionId}`, err);
  }
}

export function createProcessorSessionsRouter(): Router {
  const router = Router();

  // GET /api/processor-sessions - List all sessions for the user (lightweight, no blobs)
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
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));

      res.json(lightweight);
    } catch (error: any) {
      logger.error("Error fetching processor sessions", error);
      res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // GET /api/processor-sessions/:sessionId - Get full session (with blobs merged)
  router.get('/:sessionId', async (req: Request, res: Response) => {
    const userId = (req.session as any)?.userId;
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    if (!isMongoConnected()) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    try {
      const sessionId = routeParam(req.params.sessionId);
      const doc = await ProcessorSessionModel.findOne({ sessionId, createdByUserId: userId }).lean();

      if (!doc) {
        return res.status(404).json({ error: "Session not found" });
      }

      // Load blob data and merge
      const blobs = await loadBlobs(sessionId);
      const result: any = { ...doc, id: (doc as any).sessionId };
      
      // Merge blob fields (they take precedence over any stale data in main doc)
      if (blobs.scorecardResult !== undefined) result.scorecardResult = blobs.scorecardResult;
      if (blobs.foundationData !== undefined) result.foundationData = blobs.foundationData;
      if (blobs.pillarData !== undefined) result.pillarData = blobs.pillarData;
      if (blobs.extractionResults !== undefined) result.extractionResults = blobs.extractionResults;

      res.json(result);
    } catch (error: any) {
      logger.error("Error fetching processor session", error);
      res.status(500).json({ error: "Failed to fetch session" });
    }
  });

  // POST /api/processor-sessions - Save/upsert session (split into main doc + blobs)
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

      const blobPromises: Promise<void>[] = [];
      if (scorecardResult !== undefined) {
        blobPromises.push(saveBlob(sessionId, 'scorecardResult', scorecardResult, userId));
      }
      if (foundationData !== undefined) {
        blobPromises.push(saveBlob(sessionId, 'foundationData', foundationData, userId));
      }
      if (pillarData !== undefined) {
        blobPromises.push(saveBlob(sessionId, 'pillarData', pillarData, userId));
      }
      if (extractionResults !== undefined) {
        blobPromises.push(saveBlob(sessionId, 'extractionResults', safeExtractionResults, userId));
      }
      await Promise.all(blobPromises);

      // Main document only stores metadata and small fields
      const updateData: any = {
        sessionId,
        createdByUserId: userId,
        companyInfo,
        currentStep: currentStep || 'upload',
        filesData: safeFilesData,
        fileClassifications: fileClassifications || {},
        docStatuses: docStatuses || {},
        isComplete: isComplete || false,
        updatedAt: new Date(),
      };

      if (flowMode !== undefined) updateData.flowMode = flowMode;

      const doc = await ProcessorSessionModel.findOneAndUpdate(
        { sessionId, createdByUserId: userId },
        updateData,
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      // Return merged result
      const blobs = await loadBlobs(sessionId);
      const result: any = { ...doc.toJSON(), id: (doc as any).sessionId };
      if (blobs.scorecardResult !== undefined) result.scorecardResult = blobs.scorecardResult;
      if (blobs.foundationData !== undefined) result.foundationData = blobs.foundationData;
      if (blobs.pillarData !== undefined) result.pillarData = blobs.pillarData;
      if (blobs.extractionResults !== undefined) result.extractionResults = blobs.extractionResults;

      res.json(result);
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
      const sessionId = routeParam(req.params.sessionId);
      const allowedSmallFields = ['currentStep', 'isComplete', 'toolkitClientId', 'flowMode'];
      const blobFields = ['scorecardResult', 'foundationData', 'pillarData', 'extractionResults'];
      const patch: any = { updatedAt: new Date() };
      const blobPromises: Promise<void>[] = [];

      for (const field of allowedSmallFields) {
        if (req.body[field] !== undefined) {
          patch[field] = req.body[field];
        }
      }

      // Handle blob fields
      for (const field of blobFields) {
        if (req.body[field] !== undefined) {
          let data = req.body[field];
          // Strip extraction results if needed
          if (field === 'extractionResults' && Array.isArray(data)) {
            data = stripExtractionResults(data);
          }
          blobPromises.push(saveBlob(sessionId, field, data, userId));
        }
      }

      await Promise.all([
        ...blobPromises,
        ProcessorSessionModel.findOneAndUpdate(
          { sessionId, createdByUserId: userId },
          { $set: patch },
          { new: true },
        )
      ]);

      // Fetch and return merged result
      const doc = await ProcessorSessionModel.findOne({ sessionId, createdByUserId: userId }).lean();
      if (!doc) {
        return res.status(404).json({ error: "Session not found" });
      }

      const blobs = await loadBlobs(sessionId);
      const result: any = { ...doc, id: (doc as any).sessionId };
      if (blobs.scorecardResult !== undefined) result.scorecardResult = blobs.scorecardResult;
      if (blobs.foundationData !== undefined) result.foundationData = blobs.foundationData;
      if (blobs.pillarData !== undefined) result.pillarData = blobs.pillarData;
      if (blobs.extractionResults !== undefined) result.extractionResults = blobs.extractionResults;

      res.json(result);
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
      const sessionId = routeParam(req.params.sessionId);
      
      // Delete main doc and blobs in parallel
      const [result] = await Promise.all([
        ProcessorSessionModel.deleteOne({ sessionId, createdByUserId: userId }),
        deleteBlobs(sessionId)
      ]);

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
