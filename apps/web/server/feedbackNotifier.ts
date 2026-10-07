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
 *
 * The widget is open to anyone, and the relay it mails through also carries
 * sign-in codes. So each replica spends at most FEEDBACK_EMAILS_PER_HOUR on
 * feedback; anything over that is left unclaimed for a later sweep rather than
 * sent, and a failed send backs off (5 min, doubling, up to 6 h) instead of
 * hammering a relay that is already refusing.
 */
import { promises as dns } from "dns";
import mongoose from "mongoose";
import { FeedbackModel, OrganizationModel, UserModel } from "../shared/schema";
import { feedbackPillarLabel } from "../src/lib/feedbackPillars";
import {
  getFeedbackRecipients,
  isSmtpConfigured,
  sendFeedbackNotification,
  type FeedbackEmailContext,
} from "./email";
import { createLogger } from "./logger";

const logger = createLogger("FeedbackNotifier");

/** With back-off doubling from 5 minutes, eight attempts span about ten hours. */
export const MAX_NOTIFY_ATTEMPTS = 8;
/** Older than this is no longer news; the sweep leaves it alone. */
export const BACKFILL_WINDOW_DAYS = 30;
const CLAIM_STALE_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const BACKOFF_BASE_MS = 5 * 60 * 1000;
const BACKOFF_MAX_MS = 6 * HOUR_MS;

function notificationsDisabled(): boolean {
  return process.env.FEEDBACK_NOTIFY_DISABLED === "true";
}

/** When to try again after the `attempts`-th failure. */
export function nextAttemptAfter(attempts: number, now: Date): Date {
  const delay = Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1), BACKOFF_MAX_MS);
  return new Date(now.getTime() + delay);
}

/* Per-replica send budget. Synchronous check-and-take, so concurrent calls in
 * one process cannot both take the last slot. */
const sentAt: number[] = [];

function emailsPerHour(): number {
  const n = Number(process.env.FEEDBACK_EMAILS_PER_HOUR);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 6;
}

function reserveSend(now: number): (() => void) | null {
  while (sentAt.length && sentAt[0] <= now - HOUR_MS) sentAt.shift();
  if (sentAt.length >= emailsPerHour()) return null;
  sentAt.push(now);
  return () => {
    const i = sentAt.lastIndexOf(now);
    if (i >= 0) sentAt.splice(i, 1);
  };
}

/** Test seam: forget the budget between tests. */
export function resetFeedbackSendBudget(): void {
  sentAt.length = 0;
}

function unclaimed(now: Date) {
  return {
    $or: [{ notifyClaimedAt: null }, { notifyClaimedAt: { $lt: new Date(now.getTime() - CLAIM_STALE_MS) } }],
  };
}

function due(now: Date) {
  return { $or: [{ notifyNextAttemptAt: null }, { notifyNextAttemptAt: { $lte: now } }] };
}

/**
 * Not yet sent to everyone on today's list. A recipient added — or an address
 * corrected — after a report went out is still owed that report, so changing
 * the list catches them up on the last BACKFILL_WINDOW_DAYS without anyone
 * forwarding anything.
 */
function owed(recipients: string[]) {
  return { $or: [{ notifiedAt: null }, { notifiedTo: { $not: { $all: recipients } } }] };
}

/** Still owed an email, due, and nobody is sending it right now. */
export function claimFilter(feedbackId: string, now: Date, recipients: string[] = getFeedbackRecipients()) {
  return {
    $and: [
      { $or: [{ feedbackId }, { id: feedbackId }] },
      owed(recipients),
      // `$not` so records written before these fields existed still match.
      { notifyAttempts: { $not: { $gte: MAX_NOTIFY_ATTEMPTS } } },
      due(now),
      unclaimed(now),
    ],
  };
}

export function pendingFilter(now: Date, recipients: string[] = getFeedbackRecipients()) {
  return {
    $and: [
      owed(recipients),
      { notifyAttempts: { $not: { $gte: MAX_NOTIFY_ATTEMPTS } } },
      { createdAt: { $gte: new Date(now.getTime() - BACKFILL_WINDOW_DAYS * DAY_MS) } },
      due(now),
      unclaimed(now),
    ],
  };
}

/**
 * Recipients whose domain does not exist. A typo here fails silently: the relay
 * accepts the message and the bounce never comes back to the app — which is how
 * every copy to "pm@webparam.co.za" vanished. Only a domain that does not exist
 * is flagged; a resolver timeout proves nothing either way.
 */
export async function undeliverableRecipients(
  recipients: string[],
  resolveMx: (domain: string) => Promise<Array<{ exchange: string }>> = (d) => dns.resolveMx(d),
): Promise<string[]> {
  const bad: string[] = [];
  for (const recipient of recipients) {
    const domain = recipient.split("@")[1] ?? "";
    try {
      const records = await resolveMx(domain);
      if (records.length === 0) bad.push(recipient);
    } catch (err) {
      if ((err as { code?: string })?.code === "ENOTFOUND") bad.push(recipient);
    }
  }
  return bad;
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
 * holds it, it was already sent, it is not due yet, it ran out of attempts, the
 * hour's budget is spent, notifications are switched off, or there is no mail
 * transport — in none of those cases is anything claimed, so a later sweep (or
 * configuring mail later) still delivers it.
 */
export async function deliverFeedbackNotification(feedbackId: string, now: Date = new Date()): Promise<DeliveryOutcome> {
  if (notificationsDisabled() || mongoose.connection.readyState !== 1 || !isSmtpConfigured()) return "skipped";

  const release = reserveSend(now.getTime());
  if (!release) return "skipped";

  const recipients = getFeedbackRecipients();
  const doc: any = await FeedbackModel.findOneAndUpdate(
    claimFilter(feedbackId, now, recipients),
    { $set: { notifyClaimedAt: now }, $inc: { notifyAttempts: 1 } },
    { new: true },
  ).lean();
  if (!doc) {
    release();
    return "skipped";
  }

  // Everyone on a first send; after one, only who has joined the list since.
  const already = new Set<string>(
    (doc.notifiedAt ? doc.notifiedTo ?? [] : []).map((e: unknown) => String(e).toLowerCase()),
  );
  const missing = recipients.filter((r) => !already.has(r));
  if (missing.length === 0) {
    await FeedbackModel.updateOne({ _id: doc._id }, { $set: { notifyClaimedAt: null } });
    release();
    return "skipped";
  }

  const result = await sendFeedbackNotification(await emailContextFor(doc), missing);
  if (result.sent) {
    await FeedbackModel.updateOne(
      { _id: doc._id },
      {
        $set: {
          notifiedAt: doc.notifiedAt ?? new Date(),
          notifyError: null,
          notifyClaimedAt: null,
          notifyNextAttemptAt: null,
        },
        $addToSet: { notifiedTo: { $each: result.recipients } },
      },
    );
    return "sent";
  }

  const attempts = Number(doc.notifyAttempts) || 1;
  await FeedbackModel.updateOne(
    { _id: doc._id },
    {
      $set: {
        notifyError: result.error ?? "unknown error",
        notifyClaimedAt: null,
        notifyNextAttemptAt: nextAttemptAfter(attempts, now),
      },
    },
  );
  if (attempts >= MAX_NOTIFY_ATTEMPTS) {
    logger.error("Feedback notification abandoned — nobody was emailed about this report", undefined, {
      feedbackId,
      attempts,
      lastError: result.error,
    });
  }
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
  if (notificationsDisabled() || !reserveSend(Date.now())) return;
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
  if (notificationsDisabled() || mongoose.connection.readyState !== 1 || !isSmtpConfigured()) {
    return { sent: 0, failed: 0 };
  }
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
  if (notificationsDisabled()) {
    logger.warn("Feedback email notifications disabled by configuration");
    return;
  }
  if (!isSmtpConfigured()) {
    logger.warn("No mail transport configured — feedback is saved but nobody is emailed until SMTP is set");
  }
  void undeliverableRecipients(getFeedbackRecipients())
    .then((bad) => {
      if (bad.length) {
        logger.error("Feedback recipients whose domain does not exist — they will never receive a report", undefined, {
          recipients: bad,
        });
      }
    })
    .catch(() => {});
  const run = () => {
    sweepPendingFeedbackNotifications().catch((err) => logger.error("Feedback notification sweep failed", err));
  };
  setTimeout(run, 30_000).unref?.();
  timer = setInterval(run, SWEEP_INTERVAL_MS);
  timer.unref?.();
}
