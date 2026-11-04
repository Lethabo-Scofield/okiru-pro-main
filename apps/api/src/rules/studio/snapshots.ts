/**
 * Signed pre-publication snapshots with a verified OFF-SITE copy.
 *
 * Order (directive 8.1): the caller has already built and signed the candidate version;
 * here we capture the existing state, sign the snapshot (Ed25519), write it to MongoDB,
 * copy it off-site, READ IT BACK and verify its hash and signature. Only if every step
 * succeeds may the publish proceed. Any failure raises an alarm and throws
 * SnapshotFailedError (HTTP 503 `snapshot_failed`).
 *
 * There is no "local copy" substitute. If no off-site store is configured, snapshots - and
 * therefore protected publishing - are unavailable until it is.
 */
import { createHash, randomUUID } from 'crypto';
import { SCORECARD_IDS } from '../../../../web/Toolkit/src/lib/rules/scorecards';
import { registryHashOf } from '../../../../web/Toolkit/src/lib/rules/registry';
import { canonicalJson, sha256, type RulesVersionRecord } from '../ledger.js';
import type { Signer, Verifier } from '../signing.js';
import type { RulesStore } from '../store.js';
import type { Doc, StudioStore } from './studioStore.js';

export interface OffsiteStore {
  /** True for the local-directory REHEARSAL store: it proves the flow, not durability. Never production-ready. */
  readonly rehearsal?: boolean;
  /** Human-readable target, for status pages ("azure-blob:account/container"). Never a secret. */
  describe(): string;
  /** Must fail (not overwrite) if the key exists - snapshots are immutable. */
  put(key: string, data: string): Promise<void>;
  get(key: string): Promise<string | null>;
}

export class SnapshotFailedError extends Error {
  readonly code = 'snapshot_failed';
  constructor(public readonly stage: 'offsite-not-configured' | 'capture' | 'sign' | 'mongo-write' | 'offsite-write' | 'offsite-readback' | 'verify', detail: string) {
    super(`Snapshot failed at ${stage}: ${detail}`);
    this.name = 'SnapshotFailedError';
  }
}

export type SnapshotKind = 'pre-publish' | 'pre-rollback' | 'pre-restore' | 'nightly';

export interface SnapshotDoc extends Doc {
  kind: SnapshotKind;
  scorecardId: string | null;
  actor: string;
  createdAt: string;
  contentHash: string;
  content: string;
  keyId: string;
  signature: string;
  offsiteKey: string;
  offsiteTarget: string;
  verifiedAt: string;
}

export interface SnapshotDeps {
  studio: StudioStore;
  rules: RulesStore;
  signer?: Signer;
  verifier: Verifier;
  offsite: OffsiteStore | null;
  buildId: string;
  now: () => Date;
  /** Called for every failure; the monitoring layer turns it into an alarm. */
  alarm: (event: { kind: 'snapshot_failed'; stage: string; detail: string; scorecardId: string | null }) => Promise<void> | void;
}

async function capture(deps: SnapshotDeps, kind: SnapshotKind, scorecardId: string | null, actor: string, candidate: RulesVersionRecord | null) {
  const ids = scorecardId ? [scorecardId] : [...SCORECARD_IDS];
  const history: Record<string, RulesVersionRecord[]> = {};
  for (const id of ids) history[id] = await deps.rules.getVersions(id);
  const registryHashes: Record<string, string> = {};
  for (const id of SCORECARD_IDS) registryHashes[id] = await registryHashOf(id);
  return {
    schema: 'okiru.rules.snapshot/1',
    kind, scorecardId, actor, createdAt: deps.now().toISOString(), buildId: deps.buildId,
    candidate, history, freezeEvents: await deps.rules.getFreezeEvents(), registryHashes,
  };
}

export async function takeSnapshot(
  deps: SnapshotDeps,
  input: { kind: SnapshotKind; scorecardId: string | null; actor: string; candidate?: RulesVersionRecord | null },
): Promise<SnapshotDoc> {
  const fail = async (stage: SnapshotFailedError['stage'], detail: string): Promise<never> => {
    await deps.alarm({ kind: 'snapshot_failed', stage, detail, scorecardId: input.scorecardId });
    throw new SnapshotFailedError(stage, detail);
  };

  if (!deps.offsite) return fail('offsite-not-configured', 'no off-site backup store is configured');
  if (!deps.signer) return fail('sign', 'no signing key is configured');

  let content: string;
  try {
    content = canonicalJson(await capture(deps, input.kind, input.scorecardId, input.actor, input.candidate ?? null));
  } catch (e) {
    return fail('capture', (e as Error).message);
  }
  const contentHash = sha256(content);
  const signature = deps.signer.sign(content);
  const id = randomUUID();
  const createdAt = deps.now().toISOString();
  const offsiteKey = `rules-snapshots/${createdAt.slice(0, 10)}/${input.kind}-${input.scorecardId ?? 'all'}-${id}.json`;
  const envelope = canonicalJson({ id, contentHash, keyId: deps.signer.keyId, signature, content });

  const doc: SnapshotDoc = {
    id, rev: 1, kind: input.kind, scorecardId: input.scorecardId, actor: input.actor, createdAt, contentHash, content,
    keyId: deps.signer.keyId, signature, offsiteKey, offsiteTarget: deps.offsite.describe(), verifiedAt: '',
  };
  try {
    await deps.studio.collection<SnapshotDoc>('ruleSnapshots').insert(doc);
  } catch (e) {
    return fail('mongo-write', (e as Error).message);
  }

  try {
    await deps.offsite.put(offsiteKey, envelope);
  } catch (e) {
    return fail('offsite-write', (e as Error).message);
  }

  let back: string | null;
  try {
    back = await deps.offsite.get(offsiteKey);
  } catch (e) {
    return fail('offsite-readback', (e as Error).message);
  }
  if (back === null) return fail('offsite-readback', 'the off-site copy could not be read back');

  try {
    const parsed = JSON.parse(back) as { contentHash: string; keyId: string; signature: string; content: string };
    if (createHash('sha256').update(back, 'utf8').digest('hex') !== sha256(envelope)) throw new Error('off-site bytes differ from what was written');
    if (sha256(parsed.content) !== contentHash || parsed.contentHash !== contentHash) throw new Error('off-site content hash mismatch');
    if (!deps.verifier.verify(parsed.content, parsed.signature, parsed.keyId)) throw new Error('off-site signature does not verify');
  } catch (e) {
    return fail('verify', (e as Error).message);
  }

  const verifiedAt = deps.now().toISOString();
  await deps.studio.collection('backupChecks').insert({
    id: randomUUID(), rev: 1, kind: 'snapshot-verified', snapshotId: id, offsiteKey, contentHash, verifiedAt, createdAt: verifiedAt,
  } as Doc);
  return { ...doc, verifiedAt };
}

/** Re-reads an off-site snapshot and verifies it end to end (used by drills and nightly checks). */
export async function verifyOffsiteSnapshot(deps: Pick<SnapshotDeps, 'offsite' | 'verifier'>, snapshot: Pick<SnapshotDoc, 'offsiteKey' | 'contentHash'>): Promise<boolean> {
  if (!deps.offsite) return false;
  const raw = await deps.offsite.get(snapshot.offsiteKey);
  if (!raw) return false;
  try {
    const p = JSON.parse(raw) as { contentHash: string; keyId: string; signature: string; content: string };
    return p.contentHash === snapshot.contentHash && sha256(p.content) === snapshot.contentHash && deps.verifier.verify(p.content, p.signature, p.keyId);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ Azure Blob adapter */

export class AzureBlobOffsite implements OffsiteStore {
  constructor(private readonly container: import('@azure/storage-blob').ContainerClient, private readonly label: string) {}
  describe() { return this.label; }

  async put(key: string, data: string): Promise<void> {
    // ifNoneMatch '*' => never overwrite an existing snapshot.
    await this.container.getBlockBlobClient(key).upload(data, Buffer.byteLength(data), { conditions: { ifNoneMatch: '*' }, blobHTTPHeaders: { blobContentType: 'application/json' } });
  }

  async get(key: string): Promise<string | null> {
    const blob = this.container.getBlobClient(key);
    if (!(await blob.exists())) return null;
    return (await blob.downloadToBuffer()).toString('utf8');
  }
}

/**
 * Off-site store from the environment, or null when not configured (=> protected publishing
 * stays disabled). It must NOT be the primary storage account: an off-site copy that lives and
 * dies with the primary subscription is not off-site.
 *
 *   RULES_OFFSITE_AZURE_CONNECTION_STRING   a connection string for a DIFFERENT subscription/account
 *   RULES_OFFSITE_CONTAINER                 container with an immutability (WORM) policy
 */
/**
 * REHEARSAL ONLY. Writes snapshots to a local directory so the whole publish flow (snapshot, read-back,
 * verification) can be exercised without a cloud account. It is NOT off-site: it lives and dies with this
 * machine. It refuses to exist in production, and readiness never counts it as production-ready.
 */
export class LocalDirOffsite implements OffsiteStore {
  readonly rehearsal = true;
  constructor(private readonly dir: string) {}
  describe() { return `LOCAL-REHEARSAL:${this.dir}`; }
  private pathFor(key: string) {
    // keep only path-safe characters and never allow ".." to climb out of the directory
    const safe = key.replace(/[^A-Za-z0-9._/-]/g, '_').replace(/\.{2,}/g, '_');
    return `${this.dir.replace(/[\\/]+$/, '')}/${safe}`;
  }
  async put(key: string, data: string): Promise<void> {
    const { mkdir, writeFile } = await import('fs/promises');
    const { dirname } = await import('path');
    const p = this.pathFor(key);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, data, { encoding: 'utf8', flag: 'wx' }); // wx: never overwrite
  }
  async get(key: string): Promise<string | null> {
    const { readFile } = await import('fs/promises');
    try { return await readFile(this.pathFor(key), 'utf8'); } catch { return null; }
  }
}

/**
 * Amazon S3 off-site store. The bucket should have Object Lock on and the credentials should only be able to write and
 * read, so nothing that runs on the application server can change or delete a snapshot once written.
 */
export class S3Offsite implements OffsiteStore {
  constructor(private readonly client: { send(command: unknown): Promise<any> }, private readonly bucket: string, private readonly label: string,
    private readonly commands: { Put: new (input: any) => unknown; Get: new (input: any) => unknown }) {}
  describe() { return this.label; }

  async put(key: string, data: string): Promise<void> {
    // IfNoneMatch '*': S3 refuses the write if the key exists, so a snapshot is never overwritten. The
    // checksum makes Object Lock buckets accept the write and has S3 reject corrupted bytes.
    await this.client.send(new this.commands.Put({ Bucket: this.bucket, Key: key, Body: data, ContentType: 'application/json', IfNoneMatch: '*', ChecksumAlgorithm: 'SHA256' }));
  }

  async get(key: string): Promise<string | null> {
    try {
      const out = await this.client.send(new this.commands.Get({ Bucket: this.bucket, Key: key }));
      return await out.Body.transformToString('utf-8');
    } catch (e) {
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) return null;
      throw e;
    }
  }
}

export async function offsiteFromEnv(env: NodeJS.ProcessEnv = process.env): Promise<OffsiteStore | null> {
  const localDir = env.RULES_OFFSITE_LOCAL_DIR;
  if (localDir) {
    if (env.NODE_ENV === 'production') {
      throw new SnapshotFailedError('offsite-not-configured', 'RULES_OFFSITE_LOCAL_DIR is a rehearsal store and is refused in production');
    }
    return new LocalDirOffsite(localDir);
  }
  if (env.RULES_OFFSITE_S3_BUCKET) {
    if (!env.RULES_OFFSITE_S3_REGION) throw new SnapshotFailedError('offsite-not-configured', 'RULES_OFFSITE_S3_REGION is required with RULES_OFFSITE_S3_BUCKET');
    const { S3Client, PutObjectCommand, GetObjectCommand } = await import('@aws-sdk/client-s3');
    // Dedicated keys when given, so the Studio never leans on whatever else the host can do.
    const credentials = env.RULES_OFFSITE_S3_ACCESS_KEY_ID && env.RULES_OFFSITE_S3_SECRET_ACCESS_KEY
      ? { accessKeyId: env.RULES_OFFSITE_S3_ACCESS_KEY_ID, secretAccessKey: env.RULES_OFFSITE_S3_SECRET_ACCESS_KEY }
      : undefined;
    const client = new S3Client({ region: env.RULES_OFFSITE_S3_REGION, ...(credentials ? { credentials } : {}) });
    return new S3Offsite(client, env.RULES_OFFSITE_S3_BUCKET, `s3:${env.RULES_OFFSITE_S3_BUCKET}`, { Put: PutObjectCommand, Get: GetObjectCommand });
  }
  const conn = env.RULES_OFFSITE_AZURE_CONNECTION_STRING;
  const containerName = env.RULES_OFFSITE_CONTAINER;
  if (!conn || !containerName) return null;
  const primary = env.AZURE_CERT_STORAGE_CONNECTION_STRING || env.AZURE_STORAGE_CONNECTION_STRING;
  if (primary && primary === conn) {
    throw new SnapshotFailedError('offsite-not-configured', 'RULES_OFFSITE_AZURE_CONNECTION_STRING is the primary storage account; the off-site copy must live outside it');
  }
  const { BlobServiceClient } = await import('@azure/storage-blob');
  const svc = BlobServiceClient.fromConnectionString(conn);
  return new AzureBlobOffsite(svc.getContainerClient(containerName), `azure-blob:${svc.accountName}/${containerName}`);
}
