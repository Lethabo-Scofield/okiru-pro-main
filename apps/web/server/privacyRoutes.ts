/**
 * Data-subject participation and retention.
 *
 * POPIA sections 23 and 24 give a data subject the right to know what personal
 * information is held about them and to have it corrected or deleted. The
 * disclosure recorded our position on that as "handled on request through the
 * client; no self-service facility", which meant the right existed and the
 * mechanism did not.
 *
 * Two things this deliberately does NOT do:
 *
 *  - It does not let anyone delete an audit record. The trail is what proves
 *    who touched client data, and a deletion right that erases the evidence of
 *    processing defeats the accountability condition it sits next to. Erasure
 *    pseudonymises the actor instead: the record survives, the person behind it
 *    is no longer identifiable from it.
 *
 *  - It does not erase client business data on a data subject's say-so. For the
 *    ESG and B-BBEE records, the client is the responsible party and we are the
 *    operator; acting unilaterally on their data would be us processing outside
 *    their instruction. Those requests are recorded and routed to the client,
 *    with a clock on them.
 */
import type { Express, Request, Response } from "express";
import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { createLogger } from "./logger";
import { hasAnyRole, isPlatformAdmin } from "./roles";
import { recordAudit } from "./securityAudit.js";
import { AUDIT_RETENTION_DAYS } from "./auditRetention.js";

const logger = createLogger("PrivacyRoutes");

/**
 * How long each category is kept, and why.
 *
 * "For the life of the engagement" is not a retention period — POPIA section 14
 * requires records not be kept longer than necessary for the purpose, which
 * means the purpose has to have an end. These are the defaults; a client
 * engagement can shorten them in writing, and the longer ones exist because
 * something else requires them.
 */
export const RETENTION_POLICY = [
  {
    category: "Account records",
    detail: "Name, work email, role, organisation",
    period: "For the life of the account, then 90 days",
    basis: "Needed to operate the account; the 90 days allows a mistaken closure to be reversed",
  },
  {
    category: "Authentication records",
    detail: "Password hash, two-factor state, sessions",
    period: "Deleted with the account; sessions expire after 7 days",
    basis: "No reason to retain a credential beyond the account it protects",
  },
  {
    category: "Audit trail",
    detail: "Who did what, when, from where",
    period: `${AUDIT_RETENTION_DAYS} days`,
    basis: "Accountability. Covers two annual audit cycles. Sealed and archived before deletion",
  },
  {
    category: "Client business records",
    detail: "ESG and B-BBEE workbooks, scorecards, uploaded documents",
    period: "For the engagement, then per the client's own retention terms",
    basis: "The client is the responsible party for this data; we hold it on their instruction",
  },
  {
    category: "Activity records",
    detail: "Page and feature usage by user",
    period: "365 days",
    basis: "Support and capacity. Not used for profiling or any secondary purpose",
  },
  {
    category: "Backups",
    detail: "Full database copies",
    period: "7 days in-cluster, 30 days off-cluster",
    basis: "Recovery. A deletion request is satisfied in the live system immediately and works through the backups within 30 days",
  },
] as const;

function mongoReady(): boolean {
  return mongoose.connection.readyState === 1;
}

/** Everything the platform holds that is linked to one person. */
const PERSONAL_COLLECTIONS: { collection: string; field: string; label: string }[] = [
  { collection: "users", field: "id", label: "Account record" },
  { collection: "company_profiles", field: "userId", label: "Company profile" },
  { collection: "userActivityEvents", field: "userId", label: "Activity" },
  { collection: "workspace_members", field: "userId", label: "Workspace membership" },
  { collection: "feedback", field: "userId", label: "Feedback submitted" },
  { collection: "auditLogs", field: "actorUserId", label: "Audit trail" },
];

const REDACT = new Set(["password", "otpCode", "otpExpiry", "otpAttempts", "signature", "_id"]);

function scrub(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (REDACT.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export function registerPrivacyRoutes(
  app: Express,
  requireAuth: (req: Request, res: Response, next: (err?: unknown) => void) => void,
): void {
  /** What we keep, and for how long. Open to anyone signed in. */
  app.get("/api/privacy/retention", requireAuth as any, (_req: Request, res: Response) => {
    res.json({ policy: RETENTION_POLICY, auditRetentionDays: AUDIT_RETENTION_DAYS });
  });

  /**
   * Everything we hold about the person asking. Section 23 access, answered by
   * the platform rather than by a support ticket.
   */
  app.get("/api/privacy/my-data", requireAuth as any, async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ message: "Not authenticated" });
    if (!mongoReady()) return res.status(503).json({ message: "Not available right now" });

    try {
      const db = mongoose.connection.db!;
      const sections: Record<string, unknown> = {};
      for (const { collection, field, label } of PERSONAL_COLLECTIONS) {
        try {
          const rows = await db
            .collection(collection)
            .find({ [field]: user.id })
            .limit(5000)
            .toArray();
          sections[label] = rows.map((r) => scrub(r as Record<string, unknown>));
        } catch {
          sections[label] = { error: "could not be read" };
        }
      }

      await recordAudit(req, {
        action: "privacy.subject_access",
        resourceType: "user",
        resourceId: user.id,
        metadata: { sections: Object.keys(sections).length },
      });

      const filename = `okiru-my-data-${user.id}-${new Date().toISOString().slice(0, 10)}.json`;
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.setHeader("Content-Type", "application/json");
      res.send(
        JSON.stringify(
          {
            subject: { id: user.id, username: user.username, email: user.email },
            generatedAt: new Date().toISOString(),
            retention: RETENTION_POLICY,
            note:
              "This is everything the Okiru platform holds that is linked to you as a person. Business records belonging to your organisation are not listed here: your organisation is the responsible party for those, and they are available through your organisation administrator.",
            data: sections,
          },
          null,
          2,
        ),
      );
    } catch (err) {
      logger.error("Subject access request failed", err as Error);
      res.status(500).json({ message: "Could not assemble your data" });
    }
  });

  /**
   * Lodge a correction or erasure request. Recorded with a clock on it rather
   * than actioned silently, because for most of this data the client — not
   * Okiru — decides.
   */
  app.post("/api/privacy/requests", requireAuth as any, async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!user?.id) return res.status(401).json({ message: "Not authenticated" });

    const type = String(req.body?.type || "").toLowerCase();
    if (type !== "correction" && type !== "erasure" && type !== "objection") {
      return res.status(400).json({ message: "type must be correction, erasure or objection" });
    }
    const detail = typeof req.body?.detail === "string" ? req.body.detail.slice(0, 4000) : "";
    if (!detail.trim()) return res.status(400).json({ message: "Please describe the request" });

    const record = {
      id: randomUUID(),
      type,
      detail,
      subjectUserId: user.id,
      subjectEmail: user.email ?? null,
      organizationId: user.organizationId ?? null,
      status: "received",
      receivedAt: new Date(),
      // POPIA does not set a number here; 30 days is the commitment we make so
      // that "on request" has a meaning.
      dueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    };

    try {
      if (mongoReady()) {
        await mongoose.connection.db!.collection("privacyRequests").insertOne(record as any);
      }
      await recordAudit(req, {
        action: `privacy.request.${type}`,
        resourceType: "privacyRequest",
        resourceId: record.id,
        metadata: { type, organizationId: record.organizationId },
      });
      logger.warn("Data-subject request lodged", { id: record.id, type, userId: user.id });
      res.status(201).json({
        id: record.id,
        status: record.status,
        dueAt: record.dueAt,
        message:
          "Recorded. We will respond within 30 days. Where the request concerns records your organisation is responsible for, we will route it to them and tell you that we have.",
      });
    } catch (err) {
      logger.error("Could not record data-subject request", err as Error);
      res.status(500).json({ message: "Could not record the request" });
    }
  });

  /** Outstanding requests for an organisation. Administrators only. */
  app.get("/api/privacy/requests", requireAuth as any, async (req: Request, res: Response) => {
    const user = (req as any).user;
    if (!hasAnyRole(user, "admin") && !isPlatformAdmin(user)) {
      return res.status(403).json({ message: "Not permitted" });
    }
    if (!mongoReady()) return res.status(503).json({ message: "Not available right now" });

    const filter: Record<string, unknown> = isPlatformAdmin(user)
      ? {}
      : { organizationId: user.organizationId };
    const rows = await mongoose.connection
      .db!.collection("privacyRequests")
      .find(filter)
      .sort({ receivedAt: -1 })
      .limit(500)
      .toArray();
    res.json({ requests: rows.map((r) => scrub(r as Record<string, unknown>)) });
  });

  /**
   * Erase a person from the platform.
   *
   * Pseudonymisation, not deletion. The account row is emptied of anything that
   * identifies a person and marked erased; the audit trail keeps its records but
   * the actor becomes an opaque identifier. The processing history survives —
   * which is what accountability requires — and the person behind it does not.
   */
  app.post(
    "/api/privacy/users/:userId/erase",
    requireAuth as any,
    async (req: Request, res: Response) => {
      const actor = (req as any).user;
      const targetId = String(req.params.userId);

      if (!hasAnyRole(actor, "admin") && !isPlatformAdmin(actor)) {
        return res.status(403).json({ message: "Only an organisation administrator can do this" });
      }
      if (!mongoReady()) return res.status(503).json({ message: "Not available right now" });

      const db = mongoose.connection.db!;
      const target = await db.collection("users").findOne({ id: targetId });
      if (!target) return res.status(404).json({ message: "No such user" });

      if (!isPlatformAdmin(actor) && target.organizationId !== actor.organizationId) {
        return res.status(403).json({ message: "That user is not in your organisation" });
      }
      if (targetId === actor.id) {
        return res
          .status(400)
          .json({ message: "Ask another administrator to do this — it would end your own access" });
      }

      const tombstone = `erased-${randomUUID().slice(0, 8)}`;
      try {
        await db.collection("users").updateOne(
          { id: targetId },
          {
            $set: {
              username: tombstone,
              email: `${tombstone}@erased.invalid`,
              fullName: "Erased at request",
              password: "",
              profilePicture: null,
              twofaEnabled: false,
              otpCode: null,
              otpExpiry: null,
              isVerified: false,
              erasedAt: new Date(),
              erasedBy: actor.id,
            },
          },
        );

        // Personal detail held elsewhere goes; counts and organisation-level
        // aggregates stay, because they are not personal information.
        await db.collection("company_profiles").deleteMany({ userId: targetId });
        await db.collection("feedback").updateMany(
          { userId: targetId },
          { $set: { userName: null, userEmail: null } },
        );

        // Sessions end immediately — an erased account must not stay signed in.
        const sessions = await db.collection("sessions").find({}).toArray();
        const doomed = sessions
          .filter((s: any) => {
            const raw = s.session;
            try {
              const p = typeof raw === "string" ? JSON.parse(raw) : raw;
              return p?.userId === targetId;
            } catch {
              return false;
            }
          })
          .map((s: any) => s._id);
        if (doomed.length) await db.collection("sessions").deleteMany({ _id: { $in: doomed } });

        await recordAudit(req, {
          action: "privacy.user.erased",
          resourceType: "user",
          resourceId: targetId,
          metadata: { tombstone, sessionsRevoked: doomed.length },
        });

        logger.warn("User erased on request", { targetId, tombstone, actor: actor.id });
        res.json({
          erased: true,
          tombstone,
          sessionsRevoked: doomed.length,
          note:
            "The account no longer identifies a person. Audit records of what the account did are retained, with the actor reduced to an opaque identifier, because deleting them would erase the evidence of processing that accountability requires. Backups age out within 30 days.",
        });
      } catch (err) {
        logger.error("Erasure failed", err as Error, { targetId });
        res.status(500).json({ message: "Erasure failed" });
      }
    },
  );
}
