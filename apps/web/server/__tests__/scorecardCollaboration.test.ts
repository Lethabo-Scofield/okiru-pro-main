import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorage } from "../storage";
import {
  normalizePillarScopes,
  resolveAssessmentAccess,
  filterPillarsForAccess,
  filterPillarActivityForAccess,
  mergeScopedPillarPatch,
  canWritePillars,
  canRestoreScorecard,
} from "../scorecardCollaboration";

describe("scorecardCollaboration helpers", () => {
  it("normalizePillarScopes trims, dedupes, rejects unknown keys", () => {
    expect(normalizePillarScopes(["skills", " invalid ", "skills", "nope"])).toEqual(["skills"]);
  });

  it("filterPillarsForAccess returns full object for full access", () => {
    const pillars = { ownership: { a: 1 }, skills: { b: 2 } };
    const access = { ok: true as const, mode: "full" as const };
    expect(filterPillarsForAccess(pillars, access)).toEqual(pillars);
  });

  it("filterPillarsForAccess scoped keeps only scope keys present", () => {
    const pillars = { ownership: { a: 1 }, skills: { b: 2 }, procurement: { c: 3 } };
    const access = {
      ok: true as const,
      mode: "scoped" as const,
      scopes: ["skills"],
      member: { id: "m", workspaceId: "w", userId: "u", role: "collaborator" as const, joinedAt: new Date() },
    };
    expect(filterPillarsForAccess(pillars, access)).toEqual({ skills: { b: 2 } });
  });

  it("filterPillarActivityForAccess scoped filters activity keys", () => {
    const activity = {
      ownership: { at: "1", userId: "a" },
      skills: { at: "2", userId: "b" },
    };
    const access = {
      ok: true as const,
      mode: "scoped" as const,
      scopes: ["skills"],
      member: { id: "m", workspaceId: "w", userId: "u", role: "collaborator" as const, joinedAt: new Date() },
    };
    expect(filterPillarActivityForAccess(activity, access)).toEqual({ skills: { at: "2", userId: "b" } });
  });

  it("mergeScopedPillarPatch ignores disallowed keys for scoped collaborator", () => {
    const existing = { ownership: 1, skills: 2 };
    const access = {
      ok: true as const,
      mode: "scoped" as const,
      scopes: ["skills"],
      member: { id: "m", workspaceId: "w", userId: "u", role: "collaborator" as const, joinedAt: new Date() },
    };
    const { merged, touchedKeys } = mergeScopedPillarPatch(existing, { ownership: 9, skills: 3 }, access);
    expect(merged).toEqual({ ownership: 1, skills: 3 });
    expect(touchedKeys).toEqual(["skills"]);
  });

  it("mergeScopedPillarPatch applies all known keys for full access", () => {
    const { merged, touchedKeys } = mergeScopedPillarPatch(
      { skills: 1 },
      { skills: 5, procurement: 9 },
      { ok: true, mode: "full" },
    );
    expect(merged.skills).toBe(5);
    expect(merged.procurement).toBe(9);
    expect(touchedKeys.sort()).toEqual(["procurement", "skills"]);
  });

  it("mergeScopedPillarPatch no-ops for readOnly", () => {
    const existing = { skills: 2 };
    const access = {
      ok: true as const,
      mode: "readOnly" as const,
      member: { id: "m", workspaceId: "w", userId: "u", role: "viewer" as const, joinedAt: new Date() },
    };
    const { merged, touchedKeys } = mergeScopedPillarPatch(existing, { skills: 9 }, access);
    expect(merged).toEqual(existing);
    expect(touchedKeys).toEqual([]);
  });

  it("canWritePillars / canRestoreScorecard reflect access mode", () => {
    const readOnly = {
      ok: true as const,
      mode: "readOnly" as const,
      member: { id: "m", workspaceId: "w", userId: "u", role: "viewer" as const, joinedAt: new Date() },
    };
    expect(canWritePillars(readOnly)).toBe(false);
    expect(canRestoreScorecard(readOnly)).toBe(false);

    const scoped = {
      ok: true as const,
      mode: "scoped" as const,
      scopes: ["skills"],
      member: { id: "m", workspaceId: "w", userId: "u", role: "collaborator" as const, joinedAt: new Date() },
    };
    expect(canWritePillars(scoped)).toBe(true);
    expect(canRestoreScorecard(scoped)).toBe(false);

    expect(canRestoreScorecard({ ok: true, mode: "full" })).toBe(true);
    expect(canRestoreScorecard({ ok: true, mode: "owner_override", member: scoped.member })).toBe(true);
  });
});

describe("resolveAssessmentAccess (MemoryStorage)", () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
  });

  it("owner user gets full access without workspace", async () => {
    const a = await storage.createOrUpdateAssessment({
      assessmentId: "assessment-owner",
      createdBy: "owner_1",
      sessionId: "s",
    });
    const access = await resolveAssessmentAccess(storage, "owner_1", a);
    expect(access).toEqual({ ok: true, mode: "full" });
  });

  it("non-member cannot access workspace-linked assessment", async () => {
    const ws = await storage.createWorkspace("W", "owner_1");
    const a = await storage.createOrUpdateAssessment({
      assessmentId: "assessment-ws",
      createdBy: "owner_1",
      workspaceId: ws.id,
      sessionId: "s",
    });
    const access = await resolveAssessmentAccess(storage, "stranger", a);
    expect(access).toEqual({ ok: false });
  });

  it("workspace collaborator with pillarScopes gets scoped access", async () => {
    const ws = await storage.createWorkspace("W", "owner_1");
    await storage.addMember(ws.id, "editor_1", "collaborator");
    await storage.updateWorkspaceMember(ws.id, "editor_1", { pillarScopes: ["skills", "bogus"] });

    const a = await storage.createOrUpdateAssessment({
      assessmentId: "assessment-ed",
      createdBy: "owner_1",
      workspaceId: ws.id,
      sessionId: "s",
    });

    const access = await resolveAssessmentAccess(storage, "editor_1", a);
    expect(access.ok).toBe(true);
    if (access.ok && access.mode === "scoped") {
      expect(access.scopes).toEqual(["skills"]);
    } else {
      throw new Error("expected scoped access");
    }
  });

  it("workspace owner gets owner_override", async () => {
    const ws = await storage.createWorkspace("W", "owner_1");
    const a = await storage.createOrUpdateAssessment({
      assessmentId: "assessment-o",
      createdBy: "someone_else",
      workspaceId: ws.id,
      sessionId: "s",
    });
    const access = await resolveAssessmentAccess(storage, "owner_1", a);
    expect(access.ok).toBe(true);
    if (access.ok) expect(access.mode).toBe("owner_override");
  });

  it("viewer gets readOnly", async () => {
    const ws = await storage.createWorkspace("W", "owner_1");
    await storage.addMember(ws.id, "view_1", "viewer");
    const a = await storage.createOrUpdateAssessment({
      assessmentId: "assessment-v",
      createdBy: "owner_1",
      workspaceId: ws.id,
      sessionId: "s",
    });
    const access = await resolveAssessmentAccess(storage, "view_1", a);
    expect(access).toMatchObject({ ok: true, mode: "readOnly" });
  });
});
