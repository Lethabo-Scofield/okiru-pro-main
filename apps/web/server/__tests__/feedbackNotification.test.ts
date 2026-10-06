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
const { deliverFeedbackNotification, sweepPendingFeedbackNotifications, MAX_NOTIFY_ATTEMPTS } = await import(
  "../feedbackNotifier"
);

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
});

afterEach(() => {
  for (const k of Object.keys(SMTP_ENV)) delete process.env[k];
  delete process.env.FEEDBACK_NOTIFY_EMAILS;
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

  it("replies to the signed-in account rather than whatever was typed into the form", () => {
    expect(buildFeedbackEmail(baseCtx).replyTo).toBe("mpho@client.co.za");
    expect(buildFeedbackEmail({ ...baseCtx, accountEmail: null }).replyTo).toBe("typed@elsewhere.com");
    expect(buildFeedbackEmail({ ...baseCtx, accountEmail: null, userEmail: null }).replyTo).toBeNull();
  });

  it("says whether the sender was signed in", () => {
    expect(buildFeedbackEmail(baseCtx).text).toContain("Signed in as mpho@client.co.za");
    expect(buildFeedbackEmail({ ...baseCtx, accountEmail: null }).text).toContain("unverified");
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

  it("releases the claim and keeps the error when the send fails, so the sweep retries", async () => {
    findOneAndUpdate.mockResolvedValue(claimed);
    sendMail.mockRejectedValue(new Error("421 try again later"));
    await expect(deliverFeedbackNotification("fb-1")).resolves.toBe("failed");
    const [, update] = updateOne.mock.calls[0];
    expect(update.$set.notifyClaimedAt).toBeNull();
    expect(update.$set.notifyError).toContain("421");
    expect(update.$set.notifiedAt).toBeUndefined();
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
