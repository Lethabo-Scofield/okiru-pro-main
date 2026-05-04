import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { CertificateEventModel } from '../../models.js';
import { isMongoConnected } from '../../db.js';
import { createLogger } from '../logger.js';

const logger = createLogger('Analytics');

// Local fallback path. Mirrors the certificate store so all registry data
// lives under uploads/certificates when running without Mongo.
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'certificates');
const EVENTS_PATH = path.join(UPLOAD_DIR, '_events.json');
// Cap the on-disk ring buffer. 10k events is enough for a meaningful weekly
// summary and prevents the file from growing unbounded in fallback mode.
const MAX_LOCAL_EVENTS = 10_000;

export type CertEventType =
  | 'view'
  | 'search'
  | 'upload'
  | 'download'
  | 'verify'
  | 'unverify'
  | 'report';

export interface CertEvent {
  id: string;
  type: CertEventType;
  certificateId: string | null;
  certificateSlug: string | null;
  userId: string | null;
  query: string | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

let localEvents: CertEvent[] | null = null;

function ensureLocalLoaded(): CertEvent[] {
  if (localEvents) return localEvents;
  try {
    if (fs.existsSync(EVENTS_PATH)) {
      const raw = fs.readFileSync(EVENTS_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      localEvents = Array.isArray(parsed) ? (parsed as CertEvent[]) : [];
    } else {
      localEvents = [];
    }
  } catch (e) {
    logger.warn('Could not load events file, starting fresh', { error: (e as Error).message });
    localEvents = [];
  }
  return localEvents!;
}

function persistLocal() {
  try {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(EVENTS_PATH, JSON.stringify(localEvents || [], null, 2));
  } catch (e) {
    logger.warn('Could not persist events', { error: (e as Error).message });
  }
}

/**
 * Fire-and-forget event recorder. Always writes to the local ring buffer so
 * we have a stable record even when Mongo is offline; mirrors to Mongo when
 * connected. Never throws — analytics must not break user-facing requests.
 */
export function recordEvent(input: Partial<CertEvent> & { type: CertEventType }): void {
  try {
    const evt: CertEvent = {
      id: randomUUID(),
      type: input.type,
      certificateId: input.certificateId ?? null,
      certificateSlug: input.certificateSlug ?? null,
      userId: input.userId ?? null,
      query: input.query ?? null,
      metadata: input.metadata ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      createdAt: input.createdAt || new Date().toISOString(),
    };

    const arr = ensureLocalLoaded();
    arr.push(evt);
    if (arr.length > MAX_LOCAL_EVENTS) {
      arr.splice(0, arr.length - MAX_LOCAL_EVENTS);
    }
    persistLocal();

    if (isMongoConnected()) {
      CertificateEventModel.create(evt).catch((err: any) => {
        logger.warn('Failed to persist event to Mongo', { type: evt.type, error: err.message });
      });
    }
  } catch (err) {
    logger.warn('recordEvent failed', { error: (err as Error).message });
  }
}

export interface AnalyticsSummary {
  totals: {
    last24h: number;
    last7d: number;
    last30d: number;
    allTime: number;
  };
  byType: Record<string, number>;
  topCertificates: Array<{ certificateId: string; certificateSlug: string | null; views: number }>;
  topQueries: Array<{ query: string; count: number }>;
  recent: CertEvent[];
}

export async function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  let events: CertEvent[] = [];

  if (isMongoConnected()) {
    try {
      const rows = await CertificateEventModel.find({}, { _id: 0 })
        .sort({ createdAt: -1 })
        .limit(5000)
        .lean();
      events = rows.map((r: any) => ({
        id: r.id,
        type: r.type,
        certificateId: r.certificateId,
        certificateSlug: r.certificateSlug,
        userId: r.userId,
        query: r.query,
        metadata: r.metadata,
        ipAddress: r.ipAddress,
        userAgent: r.userAgent,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
      }));
    } catch (err) {
      logger.warn('Mongo analytics fetch failed; falling back to local', { error: (err as Error).message });
    }
  }
  if (events.length === 0) {
    events = ensureLocalLoaded().slice();
  }

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const within = (e: CertEvent, ms: number) => now - new Date(e.createdAt).getTime() <= ms;

  const byType: Record<string, number> = {};
  for (const e of events) {
    byType[e.type] = (byType[e.type] || 0) + 1;
  }

  const viewCounts = new Map<string, { slug: string | null; views: number }>();
  for (const e of events) {
    if (e.type !== 'view' || !e.certificateId) continue;
    const cur = viewCounts.get(e.certificateId) || { slug: e.certificateSlug, views: 0 };
    cur.views++;
    if (!cur.slug && e.certificateSlug) cur.slug = e.certificateSlug;
    viewCounts.set(e.certificateId, cur);
  }
  const topCertificates = Array.from(viewCounts.entries())
    .map(([certificateId, v]) => ({ certificateId, certificateSlug: v.slug, views: v.views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 10);

  const queryCounts = new Map<string, number>();
  for (const e of events) {
    if (e.type !== 'search' || !e.query) continue;
    const norm = e.query.trim().toLowerCase();
    if (!norm) continue;
    queryCounts.set(norm, (queryCounts.get(norm) || 0) + 1);
  }
  const topQueries = Array.from(queryCounts.entries())
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  // Most-recent first; events were already in desc order from Mongo, but
  // local fallback is in chronological order — sort to be safe.
  const recent = events
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 50);

  return {
    totals: {
      last24h: events.filter((e) => within(e, day)).length,
      last7d: events.filter((e) => within(e, 7 * day)).length,
      last30d: events.filter((e) => within(e, 30 * day)).length,
      allTime: events.length,
    },
    byType,
    topCertificates,
    topQueries,
    recent,
  };
}
