/**
 * Placement telemetry — the honest record of what the parser read but could
 * not place.
 *
 * Both mapping layers already tell the USER the truth (the ESG flow's
 * `unplaced` list, the B-BBEE flow's `rejected` + `unmapped` coverage), but
 * that truth evaporated with the browser tab — so "what should we teach the
 * mapper next?" had no data behind it. There is no App Insights in this stack;
 * this collection is the equivalent, scoped to the one question that matters:
 * which fields, from which documents, fail to land, and why.
 *
 * Written fire-and-forget by the upload flows after mapping. Never blocks the
 * flow, never fails it — a lost telemetry row costs an insight, not a
 * scorecard.
 */
import crypto from "crypto";
import mongoose, { Schema } from "mongoose";
import type { Express, Request, Response } from "express";
import { createLogger } from "./logger";
import { requireAuth } from "./routes";

const logger = createLogger("PlacementTelemetry");

const unplacedEntrySchema = new Schema(
  {
    /** The parser's field name — the unit the mapper resolves on. */
    field: { type: String, required: true },
    /** ESG element / B-BBEE section context, when known. */
    context: { type: String, default: null },
    /** The mapper's plain-language reason (shown to the user verbatim). */
    reason: { type: String, default: null },
    /** How many readings of this field met this fate in the run. */
    count: { type: Number, default: 1 },
  },
  { _id: false },
);

const placementTelemetrySchema = new Schema(
  {
    id: { type: String, default: () => crypto.randomUUID(), unique: true },
    domain: { type: String, enum: ["bbbee", "esg"], required: true, index: true },
    caseId: { type: String, default: null, index: true },
    userId: { type: String, default: null },
    organizationId: { type: String, default: null, index: true },
    fileCount: { type: Number, default: 0 },
    valuesRead: { type: Number, default: 0 },
    placedCount: { type: Number, default: 0 },
    unplacedCount: { type: Number, default: 0 },
    conflictCount: { type: Number, default: 0 },
    unplaced: { type: [unplacedEntrySchema], default: [] },
    /** Parser fields with no mapping at all (B-BBEE coverage.unmapped). */
    unmapped: { type: [String], default: [] },
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { collection: "placementTelemetry", id: false },
);

const PlacementTelemetryModel =
  mongoose.models.PlacementTelemetry || mongoose.model("PlacementTelemetry", placementTelemetrySchema);

const MAX_ENTRIES = 300;
const MAX_TEXT = 400;

const clip = (v: unknown): string => String(v ?? "").slice(0, MAX_TEXT);

export function registerPlacementTelemetryRoutes(app: Express): void {
  /** Record one run's placement outcome. Fire-and-forget from the client. */
  app.post("/api/telemetry/placement", requireAuth, async (req: Request, res: Response) => {
    try {
      if (mongoose.connection.readyState !== 1) {
        // No durable store — acknowledge and move on. Telemetry must never
        // become a reason an upload flow shows an error.
        return res.status(202).json({ stored: false });
      }
      const user = (req as Request & { user?: { id?: string; organizationId?: string | null } }).user;
      const body = (req.body ?? {}) as Record<string, unknown>;
      const domain = body.domain === "esg" ? "esg" : body.domain === "bbbee" ? "bbbee" : null;
      if (!domain) return res.status(400).json({ message: "domain must be bbbee or esg" });

      const rawUnplaced = Array.isArray(body.unplaced) ? body.unplaced : [];
      const unplaced = rawUnplaced.slice(0, MAX_ENTRIES).map((entry) => {
        const e = (entry ?? {}) as Record<string, unknown>;
        return {
          field: clip(e.field) || "(unnamed)",
          context: e.context == null ? null : clip(e.context),
          reason: e.reason == null ? null : clip(e.reason),
          count: Math.max(1, Math.round(Number(e.count ?? 1)) || 1),
        };
      });
      const unmapped = (Array.isArray(body.unmapped) ? body.unmapped : [])
        .slice(0, MAX_ENTRIES)
        .map((f) => clip(f))
        .filter(Boolean);

      await PlacementTelemetryModel.create({
        domain,
        caseId: body.caseId == null ? null : clip(body.caseId),
        userId: user?.id ?? null,
        organizationId: user?.organizationId ?? null,
        fileCount: Math.max(0, Math.round(Number(body.fileCount ?? 0)) || 0),
        valuesRead: Math.max(0, Math.round(Number(body.valuesRead ?? 0)) || 0),
        placedCount: Math.max(0, Math.round(Number(body.placedCount ?? 0)) || 0),
        unplacedCount: Math.max(0, Math.round(Number(body.unplacedCount ?? 0)) || 0),
        conflictCount: Math.max(0, Math.round(Number(body.conflictCount ?? 0)) || 0),
        unplaced,
        unmapped,
      });
      res.status(201).json({ stored: true });
    } catch (err) {
      logger.error("POST /api/telemetry/placement failed", err as Error);
      // Still a soft failure from the caller's point of view.
      res.status(202).json({ stored: false });
    }
  });

  /**
   * The improvement backlog: which fields fail to place most, per domain.
   * Admin-only — it aggregates across every organisation's runs.
   */
  app.get("/api/telemetry/placement/summary", requireAuth, async (req: Request, res: Response) => {
    try {
      const user = (req as Request & { user?: { role?: string | null } }).user;
      if (user?.role !== "super_admin" && user?.role !== "admin") {
        return res.status(403).json({ message: "Admin only" });
      }
      if (mongoose.connection.readyState !== 1) return res.json({ runs: 0, fields: [] });

      const days = Math.min(365, Math.max(1, Number(req.query.days ?? 90) || 90));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const domain = req.query.domain === "esg" || req.query.domain === "bbbee" ? String(req.query.domain) : null;
      const match: Record<string, unknown> = { createdAt: { $gte: since } };
      if (domain) match.domain = domain;

      const [runs, fields] = await Promise.all([
        PlacementTelemetryModel.countDocuments(match),
        PlacementTelemetryModel.aggregate([
          { $match: match },
          { $unwind: "$unplaced" },
          {
            $group: {
              _id: { domain: "$domain", field: "$unplaced.field", reason: "$unplaced.reason" },
              readings: { $sum: "$unplaced.count" },
              runs: { $sum: 1 },
              contexts: { $addToSet: "$unplaced.context" },
            },
          },
          { $sort: { readings: -1 } },
          { $limit: 150 },
          {
            $project: {
              _id: 0,
              domain: "$_id.domain",
              field: "$_id.field",
              reason: "$_id.reason",
              readings: 1,
              runs: 1,
              contexts: { $slice: [{ $setDifference: ["$contexts", [null]] }, 5] },
            },
          },
        ]),
      ]);
      res.json({ runs, sinceDays: days, fields });
    } catch (err) {
      logger.error("GET /api/telemetry/placement/summary failed", err as Error);
      res.status(500).json({ message: "Could not build the placement summary" });
    }
  });

  logger.info("Placement telemetry routes registered");
}
