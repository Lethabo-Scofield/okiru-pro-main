import { Router, type Request as ExpressRequest, type Response } from 'express';
import { v4 as uuid } from 'uuid';
import mongoose from 'mongoose';
import { FeedbackModel } from '../../models.js';
import { isMongoConnected } from '../../db.js';
import { requireAuth } from '../middleware/auth.js';
import { createLogger } from '../logger.js';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;

const logger = createLogger('FeedbackRoutes');
const router = Router();

interface FeedbackRecord {
  id: string;
  message: string;
  category: 'bug' | 'feature' | 'general' | 'compliance';
  pillar: string | null;
  pageUrl: string | null;
  userName: string | null;
  userEmail: string | null;
  userId: string | null;
  organizationId: string | null;
  status: 'open' | 'in-progress' | 'resolved';
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

const memoryStore: FeedbackRecord[] = [];

const VALID_CATEGORIES = new Set(['bug', 'feature', 'general', 'compliance']);
const VALID_STATUSES = new Set(['open', 'in-progress', 'resolved']);
const VALID_PILLARS = new Set([
  '',
  'company',
  'financial',
  'ownership',
  'management',
  'employmentEquity',
  'skills',
  'procurement',
  'supplierDevelopment',
  'sed',
]);

function toRecord(doc: any): FeedbackRecord {
  const obj = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  return {
    id: obj.feedbackId ?? obj.id,
    message: obj.message,
    category: obj.category,
    pillar: obj.pillar ?? null,
    pageUrl: obj.pageUrl ?? null,
    userName: obj.userName ?? null,
    userEmail: obj.userEmail ?? null,
    userId: obj.userId ?? null,
    organizationId: obj.organizationId ?? null,
    status: obj.status,
    userAgent: obj.userAgent ?? null,
    createdAt: obj.createdAt instanceof Date ? obj.createdAt.toISOString() : String(obj.createdAt),
    updatedAt: obj.updatedAt instanceof Date ? obj.updatedAt.toISOString() : String(obj.updatedAt),
  };
}

function feedbackIdFilter(id: string) {
  return { $or: [{ feedbackId: id }, { id }] };
}

function normalizePillar(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  if (!value || !VALID_PILLARS.has(value)) return null;
  return value;
}

function respondFeedbackWriteError(res: Response, err: unknown) {
  if (err instanceof mongoose.Error.ValidationError) {
    const message = Object.values(err.errors).map(e => e.message).join('; ') || 'Invalid feedback data';
    return res.status(400).json({ message });
  }
  if (err && typeof err === 'object' && 'code' in err && (err as { code?: number }).code === 11000) {
    return res.status(400).json({ message: 'Duplicate feedback entry' });
  }
  logger.error('Failed to save feedback', err as Error);
  return res.status(500).json({ message: 'Failed to save feedback' });
}

router.post('/', async (req: Request, res: Response) => {
  try {
    const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
    if (!message) {
      return res.status(400).json({ message: 'Feedback message is required' });
    }
    if (message.length > 5000) {
      return res.status(400).json({ message: 'Feedback is too long (max 5000 characters)' });
    }

    const rawCategory = typeof req.body?.category === 'string' ? req.body.category : 'general';
    const category = VALID_CATEGORIES.has(rawCategory) ? rawCategory : 'general';
    const pillar = normalizePillar(req.body?.pillar);

    const pageUrl = typeof req.body?.pageUrl === 'string' ? req.body.pageUrl.slice(0, 500) : null;
    const userName = typeof req.body?.userName === 'string' ? req.body.userName.slice(0, 200) : null;
    const userEmail = typeof req.body?.userEmail === 'string' ? req.body.userEmail.slice(0, 200) : null;
    const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 500) : null;

    const userId = req.session?.userId ?? null;
    const organizationId = req.session?.organizationId ?? null;

    const now = new Date();
    const feedbackId = uuid();
    const payload = {
      feedbackId,
      id: feedbackId,
      message,
      category,
      pillar,
      pageUrl,
      userName,
      userEmail,
      userId,
      organizationId,
      status: 'open' as const,
      userAgent,
      createdAt: now,
      updatedAt: now,
    };

    if (isMongoConnected()) {
      const created = await FeedbackModel.create(payload);
      return res.status(201).json({ feedback: toRecord(created) });
    }

    const record: FeedbackRecord = {
      ...payload,
      id: feedbackId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    memoryStore.unshift(record);
    return res.status(201).json({ feedback: record });
  } catch (err) {
    return respondFeedbackWriteError(res, err);
  }
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const pillar = typeof req.query.pillar === 'string' ? req.query.pillar : undefined;

    if (isMongoConnected()) {
      const filter: Record<string, unknown> = {};
      if (status && VALID_STATUSES.has(status)) filter.status = status;
      if (category && VALID_CATEGORIES.has(category)) filter.category = category;
      if (pillar && VALID_PILLARS.has(pillar)) filter.pillar = pillar || null;
      const docs = await FeedbackModel.find(filter).sort({ createdAt: -1 }).limit(500).lean();
      const items = docs.map(toRecord);
      return res.json({ feedback: items, total: items.length, source: 'mongodb' });
    }

    let items = [...memoryStore];
    if (status && VALID_STATUSES.has(status)) items = items.filter(i => i.status === status);
    if (category && VALID_CATEGORIES.has(category)) items = items.filter(i => i.category === category);
    if (pillar && VALID_PILLARS.has(pillar)) items = items.filter(i => (i.pillar ?? '') === pillar);
    return res.json({ feedback: items, total: items.length, source: 'memory' });
  } catch (err) {
    logger.error('Failed to list feedback', err as Error);
    return res.status(500).json({ message: 'Failed to list feedback' });
  }
});

router.get('/stats', async (_req: Request, res: Response) => {
  try {
    if (isMongoConnected()) {
      const [total, open, inProgress, resolved, byCategory, byPillar] = await Promise.all([
        FeedbackModel.countDocuments({}),
        FeedbackModel.countDocuments({ status: 'open' }),
        FeedbackModel.countDocuments({ status: 'in-progress' }),
        FeedbackModel.countDocuments({ status: 'resolved' }),
        FeedbackModel.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
        FeedbackModel.aggregate([{ $group: { _id: '$pillar', count: { $sum: 1 } } }]),
      ]);
      const categoryMap: Record<string, number> = {};
      for (const row of byCategory as Array<{ _id: string; count: number }>) {
        categoryMap[row._id] = row.count;
      }
      const pillarMap: Record<string, number> = {};
      for (const row of byPillar as Array<{ _id: string | null; count: number }>) {
        pillarMap[row._id ?? 'general'] = row.count;
      }
      return res.json({ total, open, inProgress, resolved, byCategory: categoryMap, byPillar: pillarMap, source: 'mongodb' });
    }
    const total = memoryStore.length;
    const open = memoryStore.filter(i => i.status === 'open').length;
    const inProgress = memoryStore.filter(i => i.status === 'in-progress').length;
    const resolved = memoryStore.filter(i => i.status === 'resolved').length;
    const byCategory: Record<string, number> = {};
    const byPillar: Record<string, number> = {};
    for (const item of memoryStore) {
      byCategory[item.category] = (byCategory[item.category] ?? 0) + 1;
      const key = item.pillar ?? 'general';
      byPillar[key] = (byPillar[key] ?? 0) + 1;
    }
    return res.json({ total, open, inProgress, resolved, byCategory, byPillar, source: 'memory' });
  } catch (err) {
    logger.error('Failed to compute feedback stats', err as Error);
    return res.status(500).json({ message: 'Failed to compute feedback stats' });
  }
});

router.patch('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const status = typeof req.body?.status === 'string' ? req.body.status : undefined;
    if (!status || !VALID_STATUSES.has(status)) {
      return res.status(400).json({ message: 'Invalid status. Must be one of: open, in-progress, resolved' });
    }
    const now = new Date();

    if (isMongoConnected()) {
      const updated = await FeedbackModel.findOneAndUpdate(
        feedbackIdFilter(id),
        { $set: { status, updatedAt: now } },
        { new: true },
      );
      if (!updated) return res.status(404).json({ message: 'Feedback not found' });
      return res.json({ feedback: toRecord(updated) });
    }

    const idx = memoryStore.findIndex(i => i.id === id);
    if (idx === -1) return res.status(404).json({ message: 'Feedback not found' });
    memoryStore[idx] = { ...memoryStore[idx], status: status as FeedbackRecord['status'], updatedAt: now.toISOString() };
    return res.json({ feedback: memoryStore[idx] });
  } catch (err) {
    logger.error('Failed to update feedback', err as Error);
    return res.status(500).json({ message: 'Failed to update feedback' });
  }
});

router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    if (isMongoConnected()) {
      const result = await FeedbackModel.deleteOne(feedbackIdFilter(id));
      if (result.deletedCount === 0) return res.status(404).json({ message: 'Feedback not found' });
      return res.status(204).end();
    }
    const idx = memoryStore.findIndex(i => i.id === id);
    if (idx === -1) return res.status(404).json({ message: 'Feedback not found' });
    memoryStore.splice(idx, 1);
    return res.status(204).end();
  } catch (err) {
    logger.error('Failed to delete feedback', err as Error);
    return res.status(500).json({ message: 'Failed to delete feedback' });
  }
});

export default router;
