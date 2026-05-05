/**
 * Permission catalogue + role resolution unit tests.
 * Pure functions only — no DB required.
 */
import { describe, it, expect } from "vitest";
import {
  PERMISSIONS,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  defaultPermissionsForRole,
  isKnownPermission,
} from "../../src/security/permissions.js";
import { hasPermissionFromDefaults } from "../../src/security/rbac.js";

describe("PERMISSIONS catalogue", () => {
  it("uses dot-namespaced action strings", () => {
    for (const value of Object.values(PERMISSIONS)) {
      expect(value).toMatch(/^[a-z]+(\.[a-z]+)+$/);
    }
  });

  it("ALL_PERMISSIONS contains every entry", () => {
    expect(ALL_PERMISSIONS.length).toBe(Object.keys(PERMISSIONS).length);
  });

  it("isKnownPermission accepts catalogue values and rejects unknowns", () => {
    expect(isKnownPermission(PERMISSIONS.CLIENT_READ)).toBe(true);
    expect(isKnownPermission("not.a.real.permission")).toBe(false);
  });
});

describe("DEFAULT_ROLE_PERMISSIONS", () => {
  it("admin has every permission", () => {
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toEqual(ALL_PERMISSIONS);
  });

  it("auditor is read-only on clients and documents", () => {
    const perms = DEFAULT_ROLE_PERMISSIONS.auditor;
    expect(perms).toContain(PERMISSIONS.CLIENT_READ);
    expect(perms).toContain(PERMISSIONS.DOCUMENT_READ);
    expect(perms).not.toContain(PERMISSIONS.CLIENT_WRITE);
    expect(perms).not.toContain(PERMISSIONS.CLIENT_DELETE);
    expect(perms).not.toContain(PERMISSIONS.DOCUMENT_DELETE);
  });

  it("analyst can write but not delete clients or manage users", () => {
    const perms = DEFAULT_ROLE_PERMISSIONS.analyst;
    expect(perms).toContain(PERMISSIONS.CLIENT_WRITE);
    expect(perms).not.toContain(PERMISSIONS.CLIENT_DELETE);
    expect(perms).not.toContain(PERMISSIONS.USER_MANAGE);
    expect(perms).not.toContain(PERMISSIONS.AUDIT_READ);
  });

  it("manager can delete clients and read audit but cannot manage users", () => {
    const perms = DEFAULT_ROLE_PERMISSIONS.manager;
    expect(perms).toContain(PERMISSIONS.CLIENT_DELETE);
    expect(perms).toContain(PERMISSIONS.AUDIT_READ);
    expect(perms).toContain(PERMISSIONS.USER_INVITE);
    expect(perms).not.toContain(PERMISSIONS.USER_MANAGE);
  });

  it("legacy 'user' role maps to analyst-equivalent for backwards compat", () => {
    const perms = DEFAULT_ROLE_PERMISSIONS.user;
    expect(perms).toContain(PERMISSIONS.CLIENT_WRITE);
    expect(perms).not.toContain(PERMISSIONS.CLIENT_DELETE);
  });
});

describe("defaultPermissionsForRole", () => {
  it("returns [] for unknown roles", () => {
    expect(defaultPermissionsForRole("godmode")).toEqual([]);
  });

  it("returns [] for null/undefined/empty", () => {
    expect(defaultPermissionsForRole(null)).toEqual([]);
    expect(defaultPermissionsForRole(undefined)).toEqual([]);
    expect(defaultPermissionsForRole("")).toEqual([]);
  });

  it("returns the mapped set for a known role", () => {
    expect(defaultPermissionsForRole("admin")).toEqual(ALL_PERMISSIONS);
  });
});

describe("hasPermissionFromDefaults", () => {
  it("returns true when role has the permission", () => {
    expect(hasPermissionFromDefaults("manager", PERMISSIONS.CLIENT_DELETE)).toBe(true);
  });

  it("returns false when role lacks the permission", () => {
    expect(hasPermissionFromDefaults("auditor", PERMISSIONS.CLIENT_DELETE)).toBe(false);
  });

  it("returns false for unknown role", () => {
    expect(hasPermissionFromDefaults("attacker", PERMISSIONS.AUDIT_READ)).toBe(false);
  });

  it("OR-resolves across multiple roles", () => {
    // auditor lacks CLIENT_DELETE; manager has it -> OR is true.
    expect(
      hasPermissionFromDefaults(["auditor", "manager"], PERMISSIONS.CLIENT_DELETE),
    ).toBe(true);
    // analyst lacks USER_INVITE and so does the legacy 'user' role -> OR is false.
    expect(
      hasPermissionFromDefaults(["analyst", "user"], PERMISSIONS.USER_INVITE),
    ).toBe(false);
  });
});
