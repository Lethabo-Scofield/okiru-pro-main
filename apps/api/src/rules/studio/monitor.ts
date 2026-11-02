/**
 * Nightly backup, integrity sweep and external heartbeat.
 *
 * runNightly(): signed whole-ledger snapshot -> off-site copy -> read-back verify, verify every
 * signed chain and the audit trail, then (only if all of that succeeded) ping the external
 * heartbeat URL. A dead-man switch monitor (configured outside Okiru, e.g. on a different
 * provider) alarms when the ping stops arriving - that is how a silently dead scheduler,
 * a failed backup or a failed restore test gets noticed even if this process is down.
 *
 * Failures raise critical alarms through the same notification path as everything else.
 */
import { notify } from './notify.js';
import { takeSnapshot, verifyOffsiteSnapshot, type SnapshotDoc } from './snapshots.js';
import { checkIntegrity, snapshotDeps, backupStatus, type StudioCtx } from './studioService.js';

export interface NightlyResult { ok: boolean; snapshotId: string | null; integrityOk: boolean; heartbeat: 'sent' | 'skipped' | 'failed' | 'withheld'; problems: string[] }

export async function runNightly(ctx: StudioCtx, opts: { heartbeatUrl?: string; fetchImpl?: (url: string) => Promise<{ ok: boolean }> } = {}): Promise<NightlyResult> {
  const problems: string[] = [];
  let snapshotId: string | null = null;
  try {
    const snap = await takeSnapshot(snapshotDeps(ctx), { kind: 'nightly', scorecardId: null, actor: 'system:nightly' });
    snapshotId = snap.id;
    // Prove we can still read an OLDER off-site snapshot, not just the one we just wrote.
    const all = await ctx.studio.collection<SnapshotDoc>('ruleSnapshots').find();
    const older = all.filter((s) => s.id !== snap.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).pop();
    if (older && !(await verifyOffsiteSnapshot({ offsite: ctx.offsite, verifier: ctx.rules.verifier }, older))) {
      problems.push(`older off-site snapshot ${older.id} failed verification`);
      await notify(ctx.studio, ctx.notifyCfg, ctx.now(), { type: 'backup.failed', severity: 'critical', message: 'An older off-site snapshot could not be read back and verified.', entity: older.id });
    }
  } catch (e) {
    problems.push(`snapshot: ${(e as Error).message}`); // takeSnapshot already raised the alarm
  }

  const integrity = await checkIntegrity(ctx, 'system:nightly');
  if (!integrity.ok) problems.push('integrity sweep found problems');

  const ok = problems.length === 0;
  let heartbeat: NightlyResult['heartbeat'] = 'skipped';
  if (!ok) {
    heartbeat = 'withheld';
  } else if (opts.heartbeatUrl) {
    try {
      const send = opts.fetchImpl ?? ((u: string) => fetch(u, { signal: AbortSignal.timeout(10_000) }));
      heartbeat = (await send(opts.heartbeatUrl)).ok ? 'sent' : 'failed';
    } catch {
      heartbeat = 'failed';
    }
    if (heartbeat === 'failed') {
      await notify(ctx.studio, ctx.notifyCfg, ctx.now(), { type: 'backup.failed', severity: 'warning', message: 'The backup heartbeat ping could not be delivered.', entity: null });
    }
  }
  return { ok, snapshotId, integrityOk: integrity.ok, heartbeat, problems };
}

/** Called hourly; runs the nightly job when no verified snapshot exists from the last 24 hours. */
export async function runNightlyIfDue(ctx: StudioCtx, opts: Parameters<typeof runNightly>[1] = {}): Promise<NightlyResult | null> {
  const status = await backupStatus(ctx);
  if (status.lastSnapshotAgeHours !== null && status.lastSnapshotAgeHours < 24) return null;
  return runNightly(ctx, opts);
}

/** Starts the hourly check. A job lease keeps the two API replicas from both running it. */
export function startRulesMonitor(env: NodeJS.ProcessEnv = process.env): void {
  if (env.RULES_MONITOR !== 'true' && env.RULES_LAUNCHED !== 'true') return;
  const tick = async () => {
    try {
      const { acquireJobLease, releaseJobLease, leaseHolderId } = await import('../../services/jobLease.js');
      const holder = leaseHolderId();
      if (!(await acquireJobLease('rules-nightly', { ttlMs: 30 * 60_000, holder }))) return;
      try {
        const { getStudioCtx } = await import('../runtime.js');
        await runNightlyIfDue(await getStudioCtx(env), { heartbeatUrl: env.RULES_HEARTBEAT_URL });
      } finally {
        await releaseJobLease('rules-nightly', holder);
      }
    } catch {
      // The next tick retries; a persistently failing run is caught by the missing heartbeat.
    }
  };
  setInterval(() => { void tick(); }, 60 * 60_000).unref();
}
