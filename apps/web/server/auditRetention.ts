/**
 * Audit trail integrity, archival and retention.
 *
 * The audit log lives in the same database as the application data it describes,
 * which means anyone who can write to that database could also rewrite its own
 * trail. Moving it to a different system is the eventual answer; until then this
 * makes tampering *detectable*, which is the part a client's auditor actually
 * tests:
 *
 *  - every record carries an HMAC over its own contents, so changing a field
 *    invalidates it (see `signAuditRecord` in securityAudit.ts);
 *  - each closed day is sealed with a digest over that day's records in order,
 *    so deleting or inserting a record breaks the day's seal even though every
 *    remaining record still verifies individually;
 *  - each seal is copied off the database — to append-only blob storage where it
 *    is configured — so the seal cannot be rewritten alongside the records.
 *
 * Retention deletes nothing that has not been sealed first. A day that was never
 * sealed is kept indefinitely and reported, because silently dropping records we
 * could not account for is the one outcome worse than keeping them too long.
 */
import crypto from "crypto";
import mongoose from "mongoose";
import { createLogger } from "./logger.js";

const logger = createLogger("AuditRetention");

const AUDIT_COLLECTION = "auditLogs";
const SEAL_COLLECTION = "auditSeals";

/** Two years by default — long enough to cover an annual audit cycle twice. */
export const AUDIT_RETENTION_DAYS = Math.max(30, Number(process.env.AUDIT_RETENTION_DAYS || 730));

function signingKey(): string {
  return process.env.AUDIT_SIGNING_KEY || process.env.SESSION_SECRET || "okiru-audit-unsigned";
}

export function signingConfigured(): boolean {
  return Boolean(process.env.AUDIT_SIGNING_KEY || process.env.SESSION_SECRET);
}

/**
 * Canonical form of an audit record for signing.
 *
 * Field order is fixed here rather than taken from object key order, so a record
 * that round-trips through JSON or through a different driver version still
 * produces the same signature.
 */
export function canonicalAuditPayload(row: Record<string, any>): string {
  const ts = row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp ?? "");
  return [
    row.id ?? "",
    ts,
    row.actorUserId ?? "",
    row.organizationId ?? "",
    row.action ?? "",
    row.resourceType ?? "",
    row.resourceId ?? "",
    row.result ?? "",
    row.ip ?? "",
    row.method ?? "",
    row.path ?? "",
    JSON.stringify(row.metadata ?? {}),
  ].join("\u001f");
}

export function signAuditRecord(row: Record<string, any>): string {
  return crypto.createHmac("sha256", signingKey()).update(canonicalAuditPayload(row)).digest("hex");
}

export function auditRecordIsIntact(row: Record<string, any>): boolean {
  if (!row?.signature) return false;
  const expected = signAuditRecord(row);
  const a = Buffer.from(String(row.signature));
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function dayBounds(day: Date): { start: Date; end: Date; key: string } {
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end, key: start.toISOString().slice(0, 10) };
}

export interface DaySeal {
  _id: string;
  day: string;
  count: number;
  digest: string;
  firstId: string | null;
  lastId: string | null;
  sealedAt: Date;
  invalidRecords: number;
  signature: string;
  archived?: boolean;
  archiveUri?: string | null;
}

async function computeDayDigest(start: Date, end: Date): Promise<{
  count: number;
  digest: string;
  firstId: string | null;
  lastId: string | null;
  invalidRecords: number;
  records: Record<string, any>[];
}> {
  const col = mongoose.connection.db!.collection(AUDIT_COLLECTION);
  const cursor = col
    .find({ timestamp: { $gte: start, $lt: end } })
    .sort({ timestamp: 1, id: 1 });

  const hash = crypto.createHash("sha256");
  let count = 0;
  let firstId: string | null = null;
  let lastId: string | null = null;
  let invalidRecords = 0;
  const records: Record<string, any>[] = [];

  for await (const row of cursor) {
    const canonical = canonicalAuditPayload(row as any);
    hash.update(canonical);
    hash.update("\u001e");
    if ((row as any).signature && !auditRecordIsIntact(row as any)) invalidRecords += 1;
    if (!firstId) firstId = (row as any).id ?? null;
    lastId = (row as any).id ?? null;
    count += 1;
    records.push(row as any);
  }

  return { count, digest: hash.digest("hex"), firstId, lastId, invalidRecords, records };
}

/**
 * Copy a sealed day off the database.
 *
 * Azure Blob Storage with an immutability policy is the intended destination —
 * once written, a blob under a legal hold or time-based retention policy cannot
 * be altered or deleted, including by us. The SDK is loaded on demand so the
 * absence of either the package or the configuration is a no-op rather than a
 * crash at boot.
 */
async function archiveDay(
  seal: Omit<DaySeal, "archived" | "archiveUri">,
  records: Record<string, any>[],
): Promise<string | null> {
  const conn =
    process.env.AUDIT_ARCHIVE_CONNECTION_STRING || process.env.AZURE_STORAGE_CONNECTION_STRING;
  if (!conn) return null;
  const container = process.env.AUDIT_ARCHIVE_CONTAINER || "audit-archive";

  try {
    const { BlobServiceClient } = await import("@azure/storage-blob");
    const service = BlobServiceClient.fromConnectionString(conn);
    const containerClient = service.getContainerClient(container);
    await containerClient.createIfNotExists();

    const body =
      records.map((r) => JSON.stringify(r)).join("\n") +
      "\n" +
      JSON.stringify({ __seal: seal }) +
      "\n";
    const name = `${seal.day}/audit-${seal.day}.ndjson`;
    const blob = containerClient.getBlockBlobClient(name);
    await blob.upload(body, Buffer.byteLength(body), {
      blobHTTPHeaders: { blobContentType: "application/x-ndjson" },
      metadata: { day: seal.day, digest: seal.digest, count: String(seal.count) },
    });
    return blob.url;
  } catch (err) {
    logger.warn("Audit archive upload failed — the day stays sealed but unarchived", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** Seal one closed day. Idempotent: an existing seal is never overwritten. */
export async function sealDay(day: Date): Promise<DaySeal | null> {
  if (mongoose.connection.readyState !== 1) return null;
  const { start, end, key } = dayBounds(day);
  const seals = mongoose.connection.db!.collection(SEAL_COLLECTION);

  const existing = (await seals.findOne({ _id: key as any })) as DaySeal | null;
  if (existing) return existing;

  const { count, digest, firstId, lastId, invalidRecords, records } = await computeDayDigest(start, end);
  const base = {
    _id: key,
    day: key,
    count,
    digest,
    firstId,
    lastId,
    sealedAt: new Date(),
    invalidRecords,
  };
  const seal: DaySeal = { ...base, signature: signAuditRecord({ id: key, metadata: base }) };

  const archiveUri = await archiveDay(seal, records);
  seal.archived = Boolean(archiveUri);
  seal.archiveUri = archiveUri;

  await seals.updateOne({ _id: key as any }, { $setOnInsert: seal }, { upsert: true });
  logger.info("Audit day sealed", {
    day: key,
    count,
    invalidRecords,
    archived: seal.archived,
  });
  if (invalidRecords > 0) {
    logger.error("Audit records failed signature verification", undefined, {
      day: key,
      invalidRecords,
    });
  }
  return seal;
}

/** Re-derive a day's digest and compare it with the seal taken at the time. */
export async function verifyDay(day: Date): Promise<{
  day: string;
  sealed: boolean;
  matches: boolean;
  expectedCount?: number;
  actualCount?: number;
  invalidRecords?: number;
}> {
  const { start, end, key } = dayBounds(day);
  const seals = mongoose.connection.db!.collection(SEAL_COLLECTION);
  const seal = (await seals.findOne({ _id: key as any })) as DaySeal | null;
  if (!seal) return { day: key, sealed: false, matches: false };

  const { count, digest, invalidRecords } = await computeDayDigest(start, end);
  return {
    day: key,
    sealed: true,
    matches: digest === seal.digest && count === seal.count,
    expectedCount: seal.count,
    actualCount: count,
    invalidRecords,
  };
}

/**
 * Seal every closed day that has records but no seal yet, then delete records
 * past the retention period — but only from days that are sealed and, where an
 * archive destination is configured, archived.
 */
export async function runRetentionPass(): Promise<{
  sealed: string[];
  deleted: number;
  skipped: string[];
}> {
  const result = { sealed: [] as string[], deleted: 0, skipped: [] as string[] };
  if (mongoose.connection.readyState !== 1) return result;

  const audit = mongoose.connection.db!.collection(AUDIT_COLLECTION);
  const seals = mongoose.connection.db!.collection(SEAL_COLLECTION);

  const todayStart = dayBounds(new Date()).start;

  // Seal closed days. Bounded to the last 400 distinct days so a first run on a
  // long-lived database does not turn into an unbounded scan.
  const distinctDays: string[] = await audit
    .aggregate([
      { $match: { timestamp: { $lt: todayStart } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: "UTC" } },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 400 },
    ])
    .toArray()
    .then((rows) => rows.map((r: any) => r._id));

  for (const dayKey of distinctDays) {
    const already = await seals.findOne({ _id: dayKey as any });
    if (already) continue;
    const seal = await sealDay(new Date(`${dayKey}T00:00:00.000Z`));
    if (seal) result.sealed.push(dayKey);
  }

  const cutoff = new Date(todayStart.getTime() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const archiveRequired = Boolean(
    process.env.AUDIT_ARCHIVE_CONNECTION_STRING || process.env.AZURE_STORAGE_CONNECTION_STRING,
  );

  const expiredDays: string[] = await audit
    .aggregate([
      { $match: { timestamp: { $lt: cutoff } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: "UTC" } },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 100 },
    ])
    .toArray()
    .then((rows) => rows.map((r: any) => r._id));

  for (const dayKey of expiredDays) {
    const seal = (await seals.findOne({ _id: dayKey as any })) as DaySeal | null;
    if (!seal) {
      result.skipped.push(dayKey);
      continue;
    }
    if (archiveRequired && !seal.archived) {
      result.skipped.push(dayKey);
      continue;
    }
    const { start, end } = dayBounds(new Date(`${dayKey}T00:00:00.000Z`));
    const del = await audit.deleteMany({ timestamp: { $gte: start, $lt: end } });
    result.deleted += del.deletedCount ?? 0;
    await seals.updateOne(
      { _id: dayKey as any },
      { $set: { purgedAt: new Date(), purgedCount: del.deletedCount ?? 0 } },
    );
  }

  if (result.skipped.length) {
    logger.warn("Audit days past retention were kept because they are not sealed or not archived", {
      days: result.skipped,
    });
  }
  logger.info("Audit retention pass complete", {
    sealedDays: result.sealed.length,
    deleted: result.deleted,
    retentionDays: AUDIT_RETENTION_DAYS,
  });
  return result;
}

let timer: NodeJS.Timeout | null = null;

/**
 * Run the retention pass shortly after boot and then daily.
 *
 * Both web replicas will try; the pass is idempotent (seals use `$setOnInsert`,
 * deletes are by time range) so a duplicate run is harmless.
 */
export function startAuditRetentionJob(): void {
  if (timer) return;
  if (process.env.AUDIT_RETENTION_DISABLED === "true") {
    logger.warn("Audit retention job disabled by configuration");
    return;
  }
  if (!signingConfigured()) {
    logger.warn(
      "No AUDIT_SIGNING_KEY or SESSION_SECRET set — audit records are being signed with a default key, which provides no tamper evidence.",
    );
  }

  const run = () => {
    runRetentionPass().catch((err) => logger.error("Audit retention pass failed", err));
  };

  setTimeout(run, 60_000).unref?.();
  timer = setInterval(run, 24 * 60 * 60 * 1000);
  timer.unref?.();
}
