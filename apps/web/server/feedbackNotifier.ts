/**
 * Feedback from the in-app widget → the team's inboxes, with retries.
 *
 * Until October 2026 feedback was saved and nothing else happened: nobody was
 * told, so a client's reports sat unread until someone opened DevMode.
 *
 * Saving and emailing are separate steps on purpose. The save is what the
 * person is waiting for, and a mail outage must not lose the feedback or make
 * the widget look broken. Each record carries its own delivery state, so
 * anything the first attempt could not send is picked up by the sweep — shortly
 * after boot and every few minutes after. That is also how reports filed before
 * this existed reach the team once.
 *
 * Two web replicas run this. A send is claimed atomically first, so the same
 * feedback is never emailed twice; a claim older than CLAIM_STALE_MS (a pod died
 * mid-send) may be taken over.
 */
import mongoose from "mongoose";
import { FeedbackModel, OrganizationModel, UserModel } from "../shared/schema";
import { feedbackPillarLabel } from "../src/lib/feedbackPillars";
import { isSmtpConfigured, sendFeedbackNotification, type FeedbackEmailContext } from "./email";
import { createLogger } from "./logger";

const logger = createLogger("FeedbackNotifier");

export const MAX_NOTIFY_ATTEMPTS = 5;
/** Older than this is no longer news; the sweep leaves it alone. */
export const BACKFILL_WINDOW_DAYS = 30;
const CLAIM_STALE_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function unclaimed(now: Date) {
  return {
    $or: [{ notifyClaimedAt: null }, { notifyClaimedAt: { $lt: new Date(now.getTime() - CLAIM_STALE_MS) } }],
  };
}

/** Still owed an email, and nobody is sending it right now. */
export function claimFilter(feedbackId: string, now: Date) {
  return {
    $and: [
      { $or: [{ feedbackId }, { id: feedbackId }] },
      { notifiedAt: null },
      // `$not` so records written before these fields existed still match.
      { notifyAttempts: { $not: { $gte: MAX_NOTIFY_ATTEMPTS } } },
      unclaimed(now),
    ],
  };
}

export function pendingFilter(now: Date) {
  return {
    $and: [
      { notifiedAt: null },
      { notifyAttempts: { $not: { $gte: MAX_NOTIFY_ATTEMPTS } } },
      { createdAt: { $gte: new Date(now.getTime() - BACKFILL_WINDOW_DAYS * DAY_MS) } },
      unclaimed(now),
    ],
  };
}

/** The signed-in account's own email and organisation, which the form fields are not. */
async function emailContextFor(doc: any): Promise<FeedbackEmailContext> {
  let accountEmail: string | null = null;
  let organizationName: string | null = null;
  if (doc.userId) {
    const user: any = await UserModel.findOne({ id: doc.userId }, { email: 1, organizationName: 1 })
      .lean()
      .catch(() => null);
    accountEmail = user?.email ?? null;
    organizationName = user?.organizationName ?? null;
  }
  if (!organizationName && doc.organizationId) {
    const org: any = await OrganizationModel.findOne({ id: doc.organizationId }, { name: 1 })
      .lean()
      .catch(() => null);
    organizationName = org?.name ?? null;
  }
  return {
    feedbackId: doc.feedbackId ?? doc.id,
    message: String(doc.message ?? ""),
    category: doc.category ?? "general",
    areaLabel: feedbackPillarLabel(doc.pillar),
    pageUrl: doc.pageUrl ?? null,
    userName: doc.userName ?? null,
    userEmail: doc.userEmail ?? null,
    accountEmail,
    organizationName,
    createdAt: doc.createdAt ?? new Date(),
  };
}

export type DeliveryOutcome = "sent" | "failed" | "skipped";

/**
 * Email one feedback record if it is still owed. "skipped" means someone else
 * holds it, it was already sent, it ran out of attempts, or there is no mail
 * transport — in that last case nothing is claimed, so configuring mail later
 * still delivers it.
 */
export async function deliverFeedbackNotification(feedbackId: string, now: Date = new Date()): Promise<DeliveryOutcome> {
  if (mongoose.connection.readyState !== 1 || !isSmtpConfigured()) return "skipped";

  const doc: any = await FeedbackModel.findOneAndUpdate(
    claimFilter(feedbackId, now),
    { $set: { notifyClaimedAt: now }, $inc: { notifyAttempts: 1 } },
    { new: true },
  ).lean();
  if (!doc) return "skipped";

  const result = await sendFeedbackNotification(await emailContextFor(doc));
  if (result.sent) {
    await FeedbackModel.updateOne(
      { _id: doc._id },
      { $set: { notifiedAt: new Date(), notifiedTo: result.recipients, notifyError: null, notifyClaimedAt: null } },
    );
    return "sent";
  }
  await FeedbackModel.updateOne(
    { _id: doc._id },
    { $set: { notifyError: result.error ?? "unknown error", notifyClaimedAt: null } },
  );
  return "failed";
}

/** Without a database there is nothing to retry from, so this is a single attempt. */
export async function notifyUnstoredFeedback(record: {
  id: string;
  message: string;
  category: string;
  pillar: string | null;
  pageUrl: string | null;
  userName: string | null;
  userEmail: string | null;
  createdAt: string;
}): Promise<void> {
  await sendFeedbackNotification({
    feedbackId: record.id,
    message: record.message,
    category: record.category,
    areaLabel: feedbackPillarLabel(record.pillar),
    pageUrl: record.pageUrl,
    userName: record.userName,
    userEmail: record.userEmail,
    accountEmail: null,
    organizationName: null,
    createdAt: record.createdAt,
  });
}

export async function sweepPendingFeedbackNotifications(limit = 25): Promise<{ sent: number; failed: number }> {
  if (mongoose.connection.readyState !== 1 || !isSmtpConfigured()) return { sent: 0, failed: 0 };
  const now = new Date();
  const pending: any[] = await FeedbackModel.find(pendingFilter(now), { feedbackId: 1, id: 1 })
    .sort({ createdAt: 1 })
    .limit(limit)
    .lean();
  let sent = 0;
  let failed = 0;
  for (const row of pending) {
    const outcome = await deliverFeedbackNotification(row.feedbackId ?? row.id, now);
    if (outcome === "sent") sent++;
    else if (outcome === "failed") failed++;
  }
  if (sent || failed) logger.info("Feedback notification sweep", { sent, failed });
  return { sent, failed };
}

let timer: NodeJS.Timeout | null = null;

export function startFeedbackNotifier(): void {
  if (timer) return;
  if (process.env.FEEDBACK_NOTIFY_DISABLED === "true") {
    logger.warn("Feedback email notifications disabled by configuration");
    return;
  }
  if (!isSmtpConfigured()) {
    logger.warn("No mail transport configured — feedback is saved but nobody is emailed until SMTP is set");
  }
  const run = () => {
    sweepPendingFeedbackNotifications().catch((err) => logger.error("Feedback notification sweep failed", err));
  };
  setTimeout(run, 30_000).unref?.();
  timer = setInterval(run, SWEEP_INTERVAL_MS);
  timer.unref?.();
}
