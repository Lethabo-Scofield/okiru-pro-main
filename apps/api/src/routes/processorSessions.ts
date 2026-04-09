import { Router, Request, Response } from 'express';
import { createLogger } from '../logger.js';
import { isMongoConnected } from '../../db.js';
import { ProcessorSessionModel } from '../../models.js';

const logger = createLogger("ProcessorSessions");

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

      res.json({ ...doc, id: (doc as any).sessionId });
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

      const updateData: any = {
        sessionId,
        createdByUserId: userId,
        companyInfo,
        currentStep: currentStep || 'upload',
        filesData: filesData || [],
        fileClassifications: fileClassifications || {},
        extractionResults: extractionResults || [],
        docStatuses: docStatuses || {},
        isComplete: isComplete || false,
        updatedAt: new Date(),
      };

      if (scorecardResult !== undefined) updateData.scorecardResult = scorecardResult;
      if (foundationData !== undefined) updateData.foundationData = foundationData;
      if (pillarData !== undefined) updateData.pillarData = pillarData;
      if (flowMode !== undefined) updateData.flowMode = flowMode;

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
        if (req.body[field] !== undefined) patch[field] = req.body[field];
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
