import type { Assessment, IStorage } from "./storage";
import type { WorkspaceMember } from "../shared/schema";

/** Toolkit pillar keys used in Build / assessments pillar payloads */
export const SCORECARD_PILLAR_KEYS = [
  "ownership",
  "management",
  "skills",
  "procurement",
  "supplierDevelopment",
  "enterpriseDevelopment",
  "employmentEquity",
  "sed",
  "yes",
] as const;

export type ScorecardPillarKey = (typeof SCORECARD_PILLAR_KEYS)[number];

const KEY_SET = new Set<string>(SCORECARD_PILLAR_KEYS);

export function normalizePillarScopes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const k = x.trim();
    if (KEY_SET.has(k) && !out.includes(k)) out.push(k);
  }
  return out;
}

export type AssessmentAccess =
  | { ok: false }
  | { ok: true; mode: "full" | "owner_override"; member?: WorkspaceMember }
  | { ok: true; mode: "readOnly"; member: WorkspaceMember }
  | { ok: true; mode: "scoped"; scopes: string[]; member: WorkspaceMember };

export async function resolveAssessmentAccess(
  storage: IStorage,
  userId: string,
  assessment: Assessment,
): Promise<AssessmentAccess> {
  const ownerId = assessment.createdBy;
  if (ownerId && ownerId === userId) {
    return { ok: true, mode: "full" };
  }

  const wsId = assessment.workspaceId;
  if (!wsId) return { ok: false };

  const member = await storage.getMember(wsId, userId);
  if (!member) return { ok: false };

  if (member.role === "owner") {
    return { ok: true, mode: "owner_override", member };
  }
  if (member.role === "viewer") {
    return { ok: true, mode: "readOnly", member };
  }

  const scopes = normalizePillarScopes(member.pillarScopes);
  if (scopes.length === 0) {
    return { ok: true, mode: "full", member };
  }
  return { ok: true, mode: "scoped", scopes, member };
}

export function filterPillarsForAccess(pillars: Record<string, unknown> | null | undefined, access: AssessmentAccess): Record<string, unknown> {
  const p = pillars && typeof pillars === "object" ? pillars : {};
  if (!access.ok || access.mode === "full" || access.mode === "owner_override") {
    return { ...p };
  }
  if (access.mode === "readOnly") {
    return { ...p };
  }
  const out: Record<string, unknown> = {};
  for (const k of access.scopes) {
    if (p[k] !== undefined) out[k] = p[k];
  }
  return out;
}

export function filterPillarActivityForAccess(
  activity: Record<string, { at?: string; userId?: string }> | null | undefined,
  access: AssessmentAccess,
): Record<string, { at?: string; userId?: string }> {
  const a = activity && typeof activity === "object" ? activity : {};
  if (!access.ok || access.mode === "full" || access.mode === "owner_override" || access.mode === "readOnly") {
    return { ...a };
  }
  const out: Record<string, { at?: string; userId?: string }> = {};
  for (const k of access.scopes) {
    if (a[k]) out[k] = a[k];
  }
  return out;
}

export function mergeScopedPillarPatch(
  existingPillars: Record<string, unknown> | null | undefined,
  patch: Record<string, unknown> | null | undefined,
  access: AssessmentAccess,
): { merged: Record<string, unknown>; touchedKeys: string[] } {
  const base = existingPillars && typeof existingPillars === "object" ? { ...existingPillars } : {};
  const p = patch && typeof patch === "object" ? patch : {};
  const touchedKeys: string[] = [];

  if (!access.ok) {
    return { merged: base, touchedKeys: [] };
  }

  const allowed =
    access.mode === "scoped"
      ? new Set(access.scopes)
      : new Set<string>([...SCORECARD_PILLAR_KEYS]);

  if (access.mode === "readOnly") {
    return { merged: base, touchedKeys: [] };
  }

  for (const key of Object.keys(p)) {
    if (!KEY_SET.has(key)) continue;
    if (!allowed.has(key)) continue;
    base[key] = p[key];
    touchedKeys.push(key);
  }

  return { merged: base, touchedKeys };
}

export function canWritePillars(access: AssessmentAccess): boolean {
  return access.ok && access.mode !== "readOnly";
}

export function canRestoreScorecard(access: AssessmentAccess): boolean {
  if (!access.ok || access.mode === "readOnly") return false;
  if (access.mode === "full" || access.mode === "owner_override") return true;
  return false;
}
