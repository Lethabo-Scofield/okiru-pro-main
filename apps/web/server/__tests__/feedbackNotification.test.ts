/**
 * Feedback used to be saved and nothing else — nobody was told, and a client's
 * two reports sat unread for days. These pin the two halves of the fix: what
 * the email says (and that a person's text cannot inject markup into it), and
 * the delivery bookkeeping that keeps a send from being lost or doubled.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

const sendMail = vi.fn();
vi.mock("nodemailer", () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

const findOneAndUpdate = vi.fn();
const updateOne = vi.fn();
const find = vi.fn();
vi.mock("../../shared/schema", () => ({
  FeedbackModel: {
    findOneAndUpdate: (...a: unknown[]) => ({ lean: () => findOneAndUpdate(...a) }),
    updateOne: (...a: unknown[]) => updateOne(...a),
    find: (...a: unknown[]) => ({ sort: () => ({ limit: () => ({ lean: () => find(...a) }) }) }),
  },
  UserModel: {
    findOne: () => ({ lean: () => Promise.resolve({ email: "mpho@client.co.za", organizationName: "Client Co" }) }),
  },
  OrganizationModel: { findOne: () => ({ lean: () => Promise.resolve(null) }) },
}));

const { buildFeedbackEmail, getFeedbackRecipients, DEFAULT_FEEDBACK_RECIPIENTS } = await import("../email");
const {
  deliverFeedbackNotification,
  sweepPendingFeedbackNotifications,
  notifyUnstoredFeedback,
  resetFeedbackSendBudget,
  nextAttemptAfter,
  MAX_NOTIFY_ATTEMPTS,
} = await import("../feedbackNotifier");

const SMTP_ENV = { SMTP_HOST: "smtp.example.test", SMTP_USER: "user", SMTP_PASS: "pass", SMTP_FROM: "noreply@example.test" };

function setMongoConnected(connected: boolean) {
  Object.defineProperty(mongoose.connection, "readyState", { value: connected ? 1 : 0, configurable: true });
}

const baseCtx = {
  feedbackId: "fb-1",
  message: "I uploaded procurement but the score went to 0.02",
  category: "bug",
  areaLabel: "Procurement",
  pageUrl: "/toolkit/scorecard",
  userName: "Mpho",
  userEmail: "typed@elsewhere.com",
  accountEmail: "mpho@client.co.za",
  organizationName: "Client Co",
  createdAt: new Date("2026-10-02T09:47:11Z"),
};

beforeEach(() => {
  sendMail.mockReset().mockResolvedValue({ messageId: "x" });
  findOneAndUpdate.mockReset();
  updateOne.mockReset().mockResolvedValue({});
  find.mockReset();
  Object.assign(process.env, SMTP_ENV);
  setMongoConnected(true);
  resetFeedbackSendBudget();
});

afterEach(() => {
  for (const k of Object.keys(SMTP_ENV)) delete process.env[k];
  delete process.env.FEEDBACK_NOTIFY_EMAILS;
  delete process.env.FEEDBACK_NOTIFY_DISABLED;
  delete process.env.FEEDBACK_EMAILS_PER_HOUR;
  delete (mongoose.connection as unknown as Record<string, unknown>).readyState;
});

describe("who is told", () => {
  it("defaults to the three team inboxes", () => {
    expect(getFeedbackRecipients()).toEqual([
      "contact@okiru.co.za",
      "lawubrian15@gmail.com",
      "pm@webparam.co.za",
    ]);
    expect(DEFAULT_FEEDBACK_RECIPIENTS).toHaveLength(3);
  });

  it("can be replaced by FEEDBACK_NOTIFY_EMAILS, ignoring junk and duplicates", () => {
    process.env.FEEDBACK_NOTIFY_EMAILS = "a@x.co.za; B@x.co.za, a@x.co.za, not-an-email";
    expect(getFeedbackRecipients()).toEqual(["a@x.co.za", "b@x.co.za"]);
  });

  it("falls back to the defaults rather than telling nobody", () => {
    process.env.FEEDBACK_NOTIFY_EMAILS = "nonsense";
    expect(getFeedbackRecipients()).toEqual(DEFAULT_FEEDBACK_RECIPIENTS);
  });
});

describe("the email", () => {
  it("leads with the type, area and gist of the message", () => {
    const { subject } = buildFeedbackEmail(baseCtx);
    expect(subject).toBe("[Okiru feedback] Bug · Procurement — I uploaded procurement but the score went to 0.02");
  });

  it("replies only to the signed-in account, never to what was typed into the form", () => {
    expect(buildFeedbackEmail(baseCtx).replyTo).toBe("mpho@client.co.za");
    const anonymous = buildFeedbackEmail({ ...baseCtx, accountEmail: null });
    expect(anonymous.replyTo).toBeNull();
    expect(anonymous.html).not.toContain("mailto:");
    // Still shown, so the team can choose to answer — but labelled for what it is.
    expect(anonymous.text).toContain("Email given (unverified): typed@elsewhere.com");
  });

  it("says whether the sender was signed in", () => {
    expect(buildFeedbackEmail(baseCtx).text).toContain("Signed in as mpho@client.co.za");
    expect(buildFeedbackEmail({ ...baseCtx, accountEmail: null }).text).toContain("unverified");
  });

  it("cannot be made to forge lines or smuggle mail headers through a typed name or address", () => {
    const { text, html } = buildFeedbackEmail({
      ...baseCtx,
      accountEmail: null,
      userName: "Mpho\nSigned in as ceo@okiru.co.za",
      userEmail: "a@b.co?bcc=evil%40x.com&body=hi",
    });
    expect(text).not.toMatch(/^Signed in as ceo@okiru\.co\.za$/m);
    expect(text).toContain("New feedback from Mpho Signed in as ceo@okiru.co.za");
    expect(html).not.toContain("mailto:a@b.co?bcc");
  });

  it("links the page the feedback came from", () => {
    expect(buildFeedbackEmail(baseCtx).html).toContain("https://okiru.pro/toolkit/scorecard");
  });

  it("escapes what the person typed, so it cannot become markup", () => {
    const { html } = buildFeedbackEmail({
      ...baseCtx,
      message: `<img src=x onerror="alert(1)"> & <a href="https://evil">click</a>`,
      userName: `<script>alert(1)</script>`,
    });
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain('<a href="https://evil">');
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  });

  it("shortens a long first line in the subject", () => {
    const { subject } = buildFeedbackEmail({ ...baseCtx, message: "x".repeat(200) });
    expect(subject.endsWith("…")).toBe(true);
    expect(subject.length).toBeLessThan(120);
  });
});

describe("delivery", () => {
  const claimed = {
    _id: "oid-1",
    feedbackId: "fb-1",
    message: "Score went to 0.02",
    category: "general",
    pillar: "procurement",
    pageUrl: "/toolkit/scorecard",
    userName: null,
    userEmail: "mphob@client.co.za",
    userId: "u-1",
    createdAt: new Date("2026-10-02T09:47:11Z"),
  };

  it("claims, sends to the list, then records when and to whom", async () => {
    findOneAndUpdate.mockResolvedValue(claimed);
    await expect(deliverFeedbackNotification("fb-1")).resolves.toBe("sent");

    const [filter, update] = findOneAndUpdate.mock.calls[0];
    expect(JSON.stringify(filter)).toContain('"notifiedAt":null');
    expect(update).toMatchObject({ $inc: { notifyAttempts: 1 } });

    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toEqual(DEFAULT_FEEDBACK_RECIPIENTS);
    expect(mail.replyTo).toBe("mpho@client.co.za");
    expect(mail.subject).toContain("Procurement");

    const [, stamp] = updateOne.mock.calls[0];
    expect(stamp.$set.notifiedAt).toBeInstanceOf(Date);
    expect(stamp.$set.notifiedTo).toEqual(DEFAULT_FEEDBACK_RECIPIENTS);
    expect(stamp.$set.notifyClaimedAt).toBeNull();
  });

  it("releases the claim, keeps the error and backs off when the send fails", async () => {
    findOneAndUpdate.mockResolvedValue({ ...claimed, notifyAttempts: 1 });
    sendMail.mockRejectedValue(new Error("421 try again later"));
    const now = new Date("2026-10-06T10:00:00Z");
    await expect(deliverFeedbackNotification("fb-1", now)).resolves.toBe("failed");
    const [, update] = updateOne.mock.calls[0];
    expect(update.$set.notifyClaimedAt).toBeNull();
    expect(update.$set.notifyError).toContain("421");
    expect(update.$set.notifiedAt).toBeUndefined();
    expect(update.$set.notifyNextAttemptAt.getTime()).toBe(now.getTime() + 5 * 60 * 1000);
  });

  it("backs off by doubling, capped at six hours, so retries span hours not minutes", () => {
    const now = new Date("2026-10-06T10:00:00Z");
    const delayMin = (n: number) => (nextAttemptAfter(n, now).getTime() - now.getTime()) / 60000;
    expect([1, 2, 3, 4].map(delayMin)).toEqual([5, 10, 20, 40]);
    expect(delayMin(12)).toBe(360);
    const total = Array.from({ length: MAX_NOTIFY_ATTEMPTS - 1 }, (_, i) => delayMin(i + 1)).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(8 * 60);
  });

  it("does not claim anything once the hour's email budget is spent — the sweep sends it later", async () => {
    process.env.FEEDBACK_EMAILS_PER_HOUR = "2";
    findOneAndUpdate.mockResolvedValue(claimed);
    const now = new Date("2026-10-06T10:00:00Z");
    await deliverFeedbackNotification("fb-1", now);
    await deliverFeedbackNotification("fb-2", now);
    findOneAndUpdate.mockClear();
    await expect(deliverFeedbackNotification("fb-3", now)).resolves.toBe("skipped");
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    // An hour later there is room again.
    await expect(deliverFeedbackNotification("fb-3", new Date(now.getTime() + 61 * 60 * 1000))).resolves.toBe("sent");
  });

  it("a slot is given back when the record turns out to be someone else's", async () => {
    process.env.FEEDBACK_EMAILS_PER_HOUR = "1";
    findOneAndUpdate.mockResolvedValueOnce(null).mockResolvedValueOnce(claimed);
    await expect(deliverFeedbackNotification("fb-1")).resolves.toBe("skipped");
    await expect(deliverFeedbackNotification("fb-2")).resolves.toBe("sent");
  });

  it("the kill switch stops every path, not just the sweep", async () => {
    process.env.FEEDBACK_NOTIFY_DISABLED = "true";
    findOneAndUpdate.mockResolvedValue(claimed);
    await expect(deliverFeedbackNotification("fb-1")).resolves.toBe("skipped");
    await notifyUnstoredFeedback({
      id: "fb-mem",
      message: "x",
      category: "bug",
      pillar: null,
      pageUrl: null,
      userName: null,
      userEmail: null,
      createdAt: new Date().toISOString(),
    });
    await expect(sweepPendingFeedbackNotifications()).resolves.toEqual({ sent: 0, failed: 0 });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("does nothing when another replica holds it or it was already sent", async () => {
    findOneAndUpdate.mockResolvedValue(null);
    await expect(deliverFeedbackNotification("fb-1")).resolves.toBe("skipped");
    expect(sendMail).not.toHaveBeenCalled();
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("does not burn attempts while there is no mail transport — configuring mail later still delivers it", async () => {
    for (const k of Object.keys(SMTP_ENV)) delete process.env[k];
    await expect(deliverFeedbackNotification("fb-1")).resolves.toBe("skipped");
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("gives up after a bounded number of attempts", () => {
    expect(MAX_NOTIFY_ATTEMPTS).toBeGreaterThan(1);
    expect(MAX_NOTIFY_ATTEMPTS).toBeLessThanOrEqual(10);
  });

  it("only claims a record that is due", async () => {
    findOneAndUpdate.mockResolvedValue(null);
    await deliverFeedbackNotification("fb-1");
    expect(JSON.stringify(findOneAndUpdate.mock.calls[0][0])).toContain("notifyNextAttemptAt");
  });

  it("the sweep delivers everything still owed, oldest first", async () => {
    find.mockResolvedValue([{ feedbackId: "fb-1" }, { feedbackId: "fb-2" }]);
    findOneAndUpdate.mockImplementation(async (filter: any) => ({
      ...claimed,
      feedbackId: filter.$and[0].$or[0].feedbackId,
    }));
    await expect(sweepPendingFeedbackNotifications()).resolves.toEqual({ sent: 2, failed: 0 });
    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});
