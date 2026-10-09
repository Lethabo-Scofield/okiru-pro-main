/**
 * Calculation Review — reviewer notes
 *
 * Backs the Calculation Review page, where a B-BBEE verification professional
 * reads what the scoring engine does, indicator by indicator, and records what
 * they find against the exact row they found it on.
 *
 * The calculations themselves are not served from here — the page reads the
 * live sector configuration from GET /api/sectors, which is the same registry
 * the engine scores from. This file only stores the review.
 *
 * ROUTING NOTE. These routes live on apps/api deliberately. The production
 * ingress sends every unclaimed /api/* prefix to this service, so a new route
 * group here is reachable the moment it ships. A new /api/* group on the web
 * server is NOT: it is swallowed by that same catch-all and answers 404 in
 * production while working perfectly in development — which is how the token
 * wallet stayed invisible in prod for three weeks.
 */

import { Router, type Request as ExpressRequest, type Response } from 'express';
import { CalculationReviewNoteModel, UserModel } from '../../models.js';
import { isMongoConnected } from '../../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { createLogger } from '../logger.js';

type Request = ExpressRequest<Record<string, string>, any, any, Record<string, string>>;

const logger = createLogger('CalculationReview');
const router = Router();

// Reviewing what the engine scores means reading this organisation's sector
// rules. Authenticated only — never anonymously reachable through the catch-all.
router.use(requireAuth);

const VERDICTS = new Set(['note', 'question', 'confirmed', 'defect']);
const MAX_BODY = 8000;

export interface ReviewNote {
  id: string;
  sectorCode: string;
  scorecardType: string;
  pillarKey: string;
  anchor: string;
  body: string;
  verdict: string;
  authorUserId: string;
  authorName: string | null;
  createdAt: string;
  updatedAt: string;
  /** True for the signed-in reviewer's own note — the only one they may change. */
  mine?: boolean;
}

function toNote(doc: any, viewerId: string): ReviewNote {
  const o = typeof doc?.toObject === 'function' ? doc.toObject() : { ...doc };
  return {
    id: o.id,
    sectorCode: o.sectorCode,
    scorecardType: o.scorecardType,
    pillarKey: o.pillarKey,
    anchor: o.anchor,
    body: o.body,
    verdict: VERDICTS.has(o.verdict) ? o.verdict : 'note',
    authorUserId: o.authorUserId,
    authorName: o.authorName ?? null,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    mine: o.authorUserId === viewerId,
  };
}

/** An anchor is "indicator:<row code>" or "pillar:<element key>" — nothing else. */
function validAnchor(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const a = raw.trim();
  return /^(indicator|pillar):[A-Za-z0-9._-]{1,80}$/.test(a) ? a : null;
}

function validCode(raw: unknown, max = 40): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  if (!v || v.length > max || !/^[A-Za-z0-9 _-]+$/.test(v)) return null;
  return v;
}

/**
 * Notes are kept in memory when Mongo is absent (local development, offline
 * demo) so the page works there too. Process-local and not durable — the same
 * contract the rest of this codebase uses for its Mongo-free fallbacks.
 */
const memoryNotes: ReviewNote[] = [];

/**
 * Who is writing this note.
 *
 * Normally the session, and ONLY the session — a note can never be authored as
 * somebody else by asking. The second branch is the offline-demo identity the
 * web proxy forwards when it runs without Mongo: `requireAuth` already lets
 * that request through in development, so without this the page would load but
 * every save would be refused locally. The proxy strips any client-supplied
 * copy of the header before setting it and never sets it in production, so it
 * cannot become a way to author notes anonymously on the live site.
 */
function actorId(req: Request): string {
  const sessionUser = req.session?.userId;
  if (sessionUser) return String(sessionUser);
  if (
    process.env.NODE_ENV !== 'production' &&
    req.headers['x-okiru-demo-user'] === 'demo-offline-user'
  ) {
    return 'demo-offline-user';
  }
  return '';
}

function memoryKey(n: {
  sectorCode: string;
  scorecardType: string;
  anchor: string;
  authorUserId: string;
}): string {
  return `${n.sectorCode}|${n.scorecardType}|${n.anchor}|${n.authorUserId}`;
}

async function authorNameFor(userId: string): Promise<string | null> {
  if (!isMongoConnected()) return null;
  try {
    const u = (await UserModel.findOne({ id: userId })
      .select('fullName username')
      .lean()) as { fullName?: string | null; username?: string | null } | null;
    return u?.fullName || u?.username || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// GET /api/calculation-review/notes?sectorCode=RCOGP&scorecardType=QSE
//
// Every reviewer's notes for one scorecard, so the page can show them under the
// indicator each one is about. Omitting the query returns all of them, which is
// how a reviewer sees their outstanding items across every sector at once.
// ---------------------------------------------------------------------------
router.get('/notes', async (req: Request, res: Response) => {
  const viewerId = actorId(req);
  const sectorCode = validCode(req.query.sectorCode);
  const scorecardType = validCode(req.query.scorecardType);

  const filter: Record<string, string> = {};
  if (sectorCode) filter.sectorCode = sectorCode;
  if (scorecardType) filter.scorecardType = scorecardType;

  try {
    if (!isMongoConnected()) {
      const rows = memoryNotes.filter(
        (n) =>
          (!sectorCode || n.sectorCode === sectorCode) &&
          (!scorecardType || n.scorecardType === scorecardType),
      );
      return res.json({
        success: true,
        notes: rows.map((n) => ({ ...n, mine: n.authorUserId === viewerId })),
      });
    }

    const docs = await CalculationReviewNoteModel.find(filter).sort({ updatedAt: -1 }).lean();
    return res.json({ success: true, notes: docs.map((d) => toNote(d, viewerId)) });
  } catch (error: unknown) {
    logger.error('Failed to list review notes', error);
    return res.status(500).json({ success: false, error: 'Could not load review notes' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/calculation-review/notes
//
// Save the signed-in reviewer's note on one anchor. Saving again replaces their
// own note rather than appending, so an indicator carries one current position
// per reviewer. Nobody can write a note as anyone else: the author is taken
// from the session, never from the request body.
// ---------------------------------------------------------------------------
router.put('/notes', async (req: Request, res: Response) => {
  const authorUserId = actorId(req);
  if (!authorUserId) return res.status(401).json({ success: false, error: 'Not authenticated' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const sectorCode = validCode(body.sectorCode);
  const scorecardType = validCode(body.scorecardType);
  const pillarKey = validCode(body.pillarKey, 60);
  const anchor = validAnchor(body.anchor);
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  const verdict =
    typeof body.verdict === 'string' && VERDICTS.has(body.verdict) ? body.verdict : 'note';

  if (!sectorCode || !scorecardType || !pillarKey || !anchor) {
    return res.status(400).json({
      success: false,
      error:
        'A note needs a sector code, a scorecard type, an element and the indicator it is about.',
    });
  }
  if (!text) {
    return res.status(400).json({ success: false, error: 'The note is empty.' });
  }
  if (text.length > MAX_BODY) {
    return res
      .status(400)
      .json({ success: false, error: `A note is limited to ${MAX_BODY} characters.` });
  }

  const now = new Date().toISOString();

  try {
    if (!isMongoConnected()) {
      const key = memoryKey({ sectorCode, scorecardType, anchor, authorUserId });
      const existing = memoryNotes.find((n) => memoryKey(n) === key);
      if (existing) {
        existing.body = text;
        existing.verdict = verdict;
        existing.pillarKey = pillarKey;
        existing.updatedAt = now;
        return res.json({ success: true, note: { ...existing, mine: true } });
      }
      const note: ReviewNote = {
        id: `mem-${memoryNotes.length + 1}`,
        sectorCode,
        scorecardType,
        pillarKey,
        anchor,
        body: text,
        verdict,
        authorUserId,
        authorName: null,
        createdAt: now,
        updatedAt: now,
        mine: true,
      };
      memoryNotes.push(note);
      return res.json({ success: true, note });
    }

    const authorName = await authorNameFor(authorUserId);
    const doc = await CalculationReviewNoteModel.findOneAndUpdate(
      { sectorCode, scorecardType, anchor, authorUserId },
      {
        $set: { pillarKey, body: text, verdict, authorName, updatedAt: now },
        $setOnInsert: { sectorCode, scorecardType, anchor, authorUserId, createdAt: now },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    logger.info('Review note saved', { sectorCode, scorecardType, anchor, verdict });
    return res.json({ success: true, note: toNote(doc, authorUserId) });
  } catch (error: unknown) {
    logger.error('Failed to save review note', error);
    return res.status(500).json({ success: false, error: 'Could not save the note' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/calculation-review/notes/:id
//
// A reviewer may withdraw their own note. One reviewer cannot delete another's,
// and a refusal does not say which of the two reasons applied.
// ---------------------------------------------------------------------------
router.delete('/notes/:id', async (req: Request, res: Response) => {
  const authorUserId = actorId(req);
  const id = String(req.params.id ?? '');
  if (!id) return res.status(400).json({ success: false, error: 'No note given.' });

  try {
    if (!isMongoConnected()) {
      const i = memoryNotes.findIndex((n) => n.id === id && n.authorUserId === authorUserId);
      if (i < 0) return res.status(404).json({ success: false, error: 'Note not found.' });
      memoryNotes.splice(i, 1);
      return res.json({ success: true });
    }

    const result = await CalculationReviewNoteModel.deleteOne({ id, authorUserId });
    if ((result.deletedCount ?? 0) === 0) {
      return res.status(404).json({ success: false, error: 'Note not found.' });
    }
    return res.json({ success: true });
  } catch (error: unknown) {
    logger.error('Failed to delete review note', error);
    return res.status(500).json({ success: false, error: 'Could not delete the note' });
  }
});

export default router;
