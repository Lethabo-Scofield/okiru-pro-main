/**
 * An advisory lease, so a once-per-process job stays once-per-cluster.
 *
 * The API runs two replicas. Anything kicked off at startup therefore runs
 * twice, at the same time, over the same data. That was invisible while the
 * work was cheap and idempotent; it stopped being invisible when the
 * certificate extraction walk started costing money per file, because both
 * replicas were paying for the same page.
 *
 * The mechanism is the standard Mongo one and it rests on the unique `_id`:
 *
 *   - the update matches only a lease that has lapsed, so a live holder is
 *     never displaced;
 *   - with nothing to match, the upsert tries to INSERT, and the second replica
 *     gets a duplicate-key error rather than a second lease.
 *
 * The duplicate key is the whole lock. It is a single atomic operation, so two
 * replicas starting in the same millisecond cannot both win.
 *
 * Leases EXPIRE rather than being held until released. A pod killed mid-walk
 * cannot release anything, and a lock that outlives its holder is worse than no
 * lock at all — it turns one crash into a job that never runs again.
 */
import { JobLeaseModel } from '../../models.js';
import { createLogger } from '../logger.js';

const logger = createLogger('JobLease');

/** Who we are, for the log line that says why a replica stood down. */
export function leaseHolderId(env: NodeJS.ProcessEnv = process.env): string {
  return env.HOSTNAME || env.POD_NAME || `pid-${process.pid}`;
}

export interface JobLeaseOptions {
  /** How long the lease is good for. Longer than the job is expected to take. */
  ttlMs: number;
  holder?: string;
}

/**
 * Try to take the lease for `name`.
 *
 * Returns true only for the replica that holds it. A database that is
 * unreachable returns false: without coordination the safe answer is "do not
 * run", because the cost of the job running twice is higher than the cost of it
 * running on the next restart.
 */
export async function acquireJobLease(name: string, options: JobLeaseOptions): Promise<boolean> {
  const holder = options.holder ?? leaseHolderId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + options.ttlMs);

  try {
    await JobLeaseModel.findOneAndUpdate(
      { _id: name, expiresAt: { $lte: now } },
      { $set: { holder, acquiredAt: now, expiresAt } },
      { upsert: true },
    );
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
      logger.info('Job lease held elsewhere, standing down', { name, holder });
      return false;
    }
    logger.warn('Could not reach the job lease store — not running', {
      name,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Give the lease back early.
 *
 * Only the holder may release, so a replica that finished cannot cancel a lease
 * someone else has since taken over after an expiry.
 */
export async function releaseJobLease(name: string, holder = leaseHolderId()): Promise<void> {
  try {
    await JobLeaseModel.deleteOne({ _id: name, holder });
  } catch (err) {
    // A lease that is not released simply expires. Nothing is broken by this.
    logger.warn('Could not release job lease', {
      name,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
