/**
 * Workspace pillar-scope resolution for the WORKBOOK surface.
 *
 * The read path GET /api/clients/:id/data strips out-of-scope pillars, and
 * every apps/api per-entity write is pillar-gated — but the workbook routes
 * were org/creator-gated only, and the workbook carries EVERY pillar. A
 * pillar-scoped collaborator who couldn't see Ownership on the client read
 * could open /api/workbook/:companyId and read it anyway, or PUT any section.
 * This module closes that bypass (audit B15 — the workbook half deferred from
 * the Phase-6 note).
 *
 * The Client↔workspace bridge is the ProcessorSession (Assessment), exactly as
 * in resolveClientPillarAccess (apps/web/server/routes.ts) and
 * verifyPillarAccess (apps/api/src/middleware/auth.ts). Workbook companyId and
 * client clientId share the same id space (the back-sync fan-out writes
 * companyId = clientId).
 */
import mongoose from "mongoose";
import { createLogger } from "./logger";
import { ProcessorSessionModel, WorkspaceMemberModel } from "../shared/schema";

const logger = createLogger("PillarAccess");

export type PillarAccess =
  | { mode: "full" }
  | { mode: "readOnly" }
  | { mode: "scoped"; scopes: string[] };

const PILLAR_KEYS = new Set([
  "ownership", "management", "skills", "procurement", "supplierDevelopment",
  "enterpriseDevelopment", "employmentEquity", "sed", "yes",
]);

/** Workbook section → the pillar scope that governs it. */
const SECTION_PILLAR: Record<string, string> = {
  "ownership": "ownership",
  "management-control": "management",
  "skills-development": "skills",
  "procurement": "procurement",
  "esd": "esd",
  "sed": "sed",
};

/**
 * Sections every collaborator may READ (identity + the entity-level
 * denominators their own pillar's context needs), but which are CROSS-PILLAR
 * to WRITE: financials move every pillar's score, so writing them requires
 * full access.
 */
const META_SECTIONS = new Set(["company-information", "financial-information"]);

/** Same loose match as both existing enforcers — management↔EE, esd↔SD↔ED. */
function pillarInScope(pillar: string, scopes: readonly string[]): boolean {
  if (scopes.includes(pillar)) return true;
  if (pillar === "management" && scopes.includes("employmentEquity")) return true;
  if (pillar === "employmentEquity" && scopes.includes("management")) return true;
  if ((pillar === "supplierDevelopment" || pillar === "enterpriseDevelopment") && scopes.includes("esd")) return true;
  if (pillar === "esd" && (scopes.includes("supplierDevelopment") || scopes.includes("enterpriseDevelopment"))) return true;
  return false;
}

function normalizePillarScopes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const k = x.trim();
    if (PILLAR_KEYS.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

/**
 * Resolve the caller's workbook access for a company/client id.
 *
 * null → no workspace overlay exists (single-user flow): the caller's
 * org/creator authorisation (already enforced upstream) stands unfiltered.
 */
export async function resolveWorkbookPillarAccess(
  companyId: string,
  userId: string,
): Promise<PillarAccess | null> {
  if (mongoose.connection.readyState !== 1) return null;
  try {
    const session = await ProcessorSessionModel.findOne({
      clientId: companyId,
      workspaceId: { $nin: [null, ""] },
    })
      .sort({ updatedAt: -1 })
      .lean() as { workspaceId?: string; createdBy?: string; createdByUserId?: string } | null;
    if (!session?.workspaceId) return null;

    const ownerId = session.createdBy ?? session.createdByUserId ?? null;
    if (ownerId && ownerId === userId) return { mode: "full" };

    const member = await WorkspaceMemberModel.findOne({
      workspaceId: String(session.workspaceId),
      userId,
    }).lean() as { role?: string; pillarScopes?: unknown } | null;

    // Not a member of the workspace this client is bound to: the workbook is
    // that workspace's document — deny pillars entirely (empty scope), rather
    // than fall back to unfiltered org access.
    if (!member) return { mode: "scoped", scopes: [] };
    if (member.role === "owner") return { mode: "full" };
    if (member.role === "viewer") return { mode: "readOnly" };
    const scopes = normalizePillarScopes(member.pillarScopes);
    if (scopes.length === 0) return { mode: "full" };
    return { mode: "scoped", scopes };
  } catch (err) {
    // Infra error — org/creator authorisation upstream still applies; do not
    // turn an outage into a 5xx storm at the access layer.
    logger.warn("resolveWorkbookPillarAccess failed (non-fatal)", {
      companyId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/** May this access WRITE the given workbook section? */
export function canWriteSection(access: PillarAccess | null, sectionKey: string): boolean {
  if (!access || access.mode === "full") return true;
  if (access.mode === "readOnly") return false;
  if (META_SECTIONS.has(sectionKey)) return false; // cross-pillar → full only
  const pillar = SECTION_PILLAR[sectionKey];
  if (!pillar) return false; // unknown section: closed, not open
  return pillarInScope(pillar, access.scopes);
}

/** May this access perform CROSS-PILLAR actions (scorecard sync/submit)? */
export function canSyncScorecard(access: PillarAccess | null): boolean {
  return !access || access.mode === "full";
}

/**
 * Strip a workbook's sections down to what this access may READ: pillar
 * sections in scope plus the meta sections (identity + denominators). Full and
 * read-only access see everything; read-only is enforced at the write gates.
 */
export function filterReadableSections<T>(
  access: PillarAccess | null,
  sections: Record<string, T>,
): Record<string, T> {
  if (!access || access.mode === "full" || access.mode === "readOnly") return sections;
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(sections)) {
    if (META_SECTIONS.has(key)) { out[key] = value; continue; }
    const pillar = SECTION_PILLAR[key];
    if (pillar && pillarInScope(pillar, access.scopes)) out[key] = value;
  }
  return out;
}
