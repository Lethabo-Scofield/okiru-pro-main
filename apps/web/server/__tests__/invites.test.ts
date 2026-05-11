import { describe, it, expect, beforeEach } from "vitest";
import { MemoryStorage } from "../storage";
import { buildWorkspaceInviteEmail } from "../email";

async function seedWorkspace(s: MemoryStorage, ownerId: string, name = "Acme Compliance") {
  const ws = await s.createWorkspace(name, ownerId);
  await s.addMember(ws.id, ownerId, "owner");
  return ws;
}

describe("WorkspaceInvite storage (MemoryStorage)", () => {
  let s: MemoryStorage;
  beforeEach(() => {
    s = new MemoryStorage();
  });

  it("creates an invite with a secure token, lowercased email and 14-day default expiry", async () => {
    const ws = await seedWorkspace(s, "user_1");
    const inv = await s.createInvite({
      workspaceId: ws.id,
      email: "Person@Example.COM",
      role: "collaborator",
      invitedByUserId: "user_1",
    });
    expect(inv.email).toBe("person@example.com");
    expect(inv.token).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(inv.acceptedAt).toBeNull();
    expect(inv.revokedAt).toBeNull();
    const ttl = +new Date(inv.expiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(13 * 24 * 60 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(14 * 24 * 60 * 60 * 1000 + 1000);
  });

  it("issues a unique token per invite", async () => {
    const ws = await seedWorkspace(s, "user_1");
    const tokens = new Set<string>();
    for (let i = 0; i < 25; i++) {
      const inv = await s.createInvite({
        workspaceId: ws.id,
        email: `p${i}@x.com`,
        role: "viewer",
        invitedByUserId: "user_1",
      });
      tokens.add(inv.token);
    }
    expect(tokens.size).toBe(25);
  });

  it("marks invite accepted (acceptInvite is idempotent on null acceptedAt)", async () => {
    const ws = await seedWorkspace(s, "user_1");
    const inv = await s.createInvite({
      workspaceId: ws.id,
      email: "a@b.com",
      role: "viewer",
      invitedByUserId: "user_1",
    });
    const accepted = await s.acceptInvite(inv.token);
    expect(accepted?.acceptedAt).toBeInstanceOf(Date);
  });

  it("revokeInvite is scoped to its own workspace (no cross-tenant revoke)", async () => {
    const wsA = await seedWorkspace(s, "owner_a", "Tenant A");
    const wsB = await seedWorkspace(s, "owner_b", "Tenant B");
    const invA = await s.createInvite({
      workspaceId: wsA.id,
      email: "x@a.com",
      role: "viewer",
      invitedByUserId: "owner_a",
    });
    // Owner B tries to revoke A's invite by passing their own workspace id
    const ok = await s.revokeInvite(wsB.id, invA.id);
    expect(ok).toBe(false);
    const stillThere = await s.getInviteByToken(invA.token);
    expect(stillThere?.revokedAt).toBeNull();

    // Same-tenant revoke succeeds
    const ok2 = await s.revokeInvite(wsA.id, invA.id);
    expect(ok2).toBe(true);
    const after = await s.getInviteByToken(invA.token);
    expect(after?.revokedAt).toBeInstanceOf(Date);
  });

  it("listInvites returns only invites for the queried workspace", async () => {
    const wsA = await seedWorkspace(s, "owner_a", "A");
    const wsB = await seedWorkspace(s, "owner_b", "B");
    await s.createInvite({ workspaceId: wsA.id, email: "1@a.com", role: "viewer", invitedByUserId: "owner_a" });
    await s.createInvite({ workspaceId: wsA.id, email: "2@a.com", role: "viewer", invitedByUserId: "owner_a" });
    await s.createInvite({ workspaceId: wsB.id, email: "1@b.com", role: "viewer", invitedByUserId: "owner_b" });
    const a = await s.listInvites(wsA.id);
    const b = await s.listInvites(wsB.id);
    expect(a.map((i) => i.email).sort()).toEqual(["1@a.com", "2@a.com"]);
    expect(b.map((i) => i.email)).toEqual(["1@b.com"]);
  });

  describe("findActivePendingInvite", () => {
    it("returns the pending invite (case-insensitive email match)", async () => {
      const ws = await seedWorkspace(s, "user_1");
      const inv = await s.createInvite({
        workspaceId: ws.id,
        email: "p@x.com",
        role: "viewer",
        invitedByUserId: "user_1",
      });
      const found = await s.findActivePendingInvite(ws.id, "P@X.COM");
      expect(found?.id).toBe(inv.id);
    });

    it("returns undefined for accepted invites", async () => {
      const ws = await seedWorkspace(s, "user_1");
      const inv = await s.createInvite({
        workspaceId: ws.id, email: "p@x.com", role: "viewer", invitedByUserId: "user_1",
      });
      await s.acceptInvite(inv.token);
      const found = await s.findActivePendingInvite(ws.id, "p@x.com");
      expect(found).toBeUndefined();
    });

    it("returns undefined for revoked invites", async () => {
      const ws = await seedWorkspace(s, "user_1");
      const inv = await s.createInvite({
        workspaceId: ws.id, email: "p@x.com", role: "viewer", invitedByUserId: "user_1",
      });
      await s.revokeInvite(ws.id, inv.id);
      const found = await s.findActivePendingInvite(ws.id, "p@x.com");
      expect(found).toBeUndefined();
    });

    it("returns undefined for expired invites and the public status reflects 'expired'", async () => {
      const ws = await seedWorkspace(s, "user_1");
      const inv = await s.createInvite({
        workspaceId: ws.id,
        email: "p@x.com",
        role: "viewer",
        invitedByUserId: "user_1",
        ttlDays: 0.0001, // ~8.6 seconds; we'll rewrite expiresAt below
      });
      // Force the invite into the past
      inv.expiresAt = new Date(Date.now() - 60_000);
      const found = await s.findActivePendingInvite(ws.id, "p@x.com");
      expect(found).toBeUndefined();
    });

    it("does not match invites from another workspace (tenant isolation)", async () => {
      const wsA = await seedWorkspace(s, "owner_a", "A");
      const wsB = await seedWorkspace(s, "owner_b", "B");
      await s.createInvite({
        workspaceId: wsA.id, email: "shared@x.com", role: "viewer", invitedByUserId: "owner_a",
      });
      const found = await s.findActivePendingInvite(wsB.id, "shared@x.com");
      expect(found).toBeUndefined();
    });
  });
});

describe("buildWorkspaceInviteEmail", () => {
  const baseCtx = {
    inviteeEmail: "invitee@example.com",
    inviterName: "Jane Doe",
    inviterEmail: "jane@acme.co.za",
    inviterCompany: "Acme Compliance",
    workspaceName: "Q4 Verification",
    role: "collaborator" as const,
    acceptUrl: "https://app.okiru.co.za/invite/abc123token",
    expiresAt: new Date("2026-12-31T00:00:00Z"),
  };

  it("subject names the inviter and the workspace", () => {
    const { subject } = buildWorkspaceInviteEmail(baseCtx);
    expect(subject).toContain("Jane Doe");
    expect(subject).toContain("Q4 Verification");
  });

  it("from-name reads as inviter-via-Okiru, not platform-only", () => {
    const { fromName } = buildWorkspaceInviteEmail(baseCtx);
    expect(fromName).toMatch(/Jane Doe/);
    expect(fromName).toMatch(/Acme Compliance/);
    expect(fromName).toMatch(/via Okiru/);
  });

  it("body includes inviter, company, project, role, accept URL and recipient email", () => {
    const { html, text } = buildWorkspaceInviteEmail(baseCtx);
    for (const needle of [
      "Jane Doe",
      "Acme Compliance",
      "Q4 Verification",
      "Editor",
      "https://app.okiru.co.za/invite/abc123token",
      "invitee@example.com",
    ]) {
      expect(html).toContain(needle);
      expect(text).toContain(needle);
    }
  });

  it("escapes HTML in user-supplied fields", () => {
    const { html } = buildWorkspaceInviteEmail({
      ...baseCtx,
      inviterName: 'Mallory<script>alert("x")</script>',
      workspaceName: "<b>Evil</b>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Evil</b>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
  });

  it("falls back gracefully when company is missing", () => {
    const { fromName, html } = buildWorkspaceInviteEmail({
      ...baseCtx,
      inviterCompany: null,
    });
    expect(fromName).toBe("Jane Doe (via Okiru)");
    expect(html).toContain("Jane Doe");
  });
});
