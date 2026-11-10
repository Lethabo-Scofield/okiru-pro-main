import { Router, type Request, type Response } from 'express';
import { v4 as uuid } from 'uuid';
import { createLogger } from '../logger.js';
// Use the shared API auth middleware so the local web proxy's verified demo
// identity is accepted during development while production still requires a
// real authenticated session.
import { requireAuth } from '../middleware/requireAuth.js';
import { buildScorecardAdviceContext, buildSupplierOnlyAdviceContext } from '../services/scorecardAdviceContext.js';
import { runScorecardAdviceChat, validateAdviceMessage } from '../services/scorecardAdviceChat.js';
import { isSupplierQuestion } from '../services/supplierIntelligence.js';

const logger = createLogger('ScorecardAdviceRoute');

const router = Router();

router.post('/:scorecardId/advice/chat', requireAuth, async (req: Request, res: Response) => {
  const userId = (req.session as any).userId as string;
  const organizationId = ((req.session as any).organizationId as string | undefined) || null;
  const scorecardId = String(req.params.scorecardId || '').trim();
  const conversationId = typeof req.body?.conversationId === 'string' && req.body.conversationId.trim()
    ? req.body.conversationId.trim()
    : uuid();

  if (!scorecardId) {
    return res.status(400).json({ message: 'scorecardId is required' });
  }

  try {
    const message = validateAdviceMessage(req.body?.message);
    const toolkitId = typeof req.body?.toolkitId === 'string' ? req.body.toolkitId : 'bbbee';
    if (toolkitId !== 'bbbee') {
      return res.status(400).json({ message: 'Only the B-BBEE toolkit assistant is supported right now.' });
    }

    // Supplier discovery is a company-level capability, not a scorecard
    // explanation. The Toolkit often sends the active client id here, so
    // checking only for the literal "current" route made supplier questions
    // fall through to the generic scorecard fallback.
    const context = isSupplierQuestion(message) && organizationId
      ? await buildSupplierOnlyAdviceContext({ userId, organizationId })
      : await buildScorecardAdviceContext({
          scorecardId,
          userId,
          organizationId,
          runtimeSnapshot: req.body?.runtimeSnapshot,
        });

    if (!context) {
      return res.status(404).json({ message: 'Scorecard not found or access denied' });
    }

    const result = await runScorecardAdviceChat({ message, context });

    return res.json({
      answer: result.answer,
      conversationId,
      sources: result.sources,
      tables: result.tables,
      actions: result.actions,
      suppliers: result.supplierResults,
      suggestedQuestions: result.suggestedQuestions,
      warnings: result.warnings,
    });
  } catch (error) {
    const status = typeof (error as any)?.status === 'number' ? (error as any).status : 500;
    const message = error instanceof Error ? error.message : 'Scorecard advice failed';
    logger.warn('Scorecard advice request failed', {
      status,
      scorecardId,
      userId,
      error: message,
    });
    return res.status(status).json({ message });
  }
});

export default router;
