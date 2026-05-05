/**
 * Permissions catalogue and default role mappings.
 *
 * Permissions are action-based strings of the form `<resource>.<action>`.
 * Roles are resolved to permission sets at request time. The default mapping
 * here is the source of truth; tenants can add custom roles in MongoDB
 * (collection: `rbacRoles`) which are merged on top of the defaults.
 */

export const PERMISSIONS = {
  // Documents / extractions
  DOCUMENT_READ: "document.read",
  DOCUMENT_WRITE: "document.write",
  DOCUMENT_DELETE: "document.delete",

  // Clients (the core tenant-owned entity)
  CLIENT_READ: "client.read",
  CLIENT_WRITE: "client.write",
  CLIENT_DELETE: "client.delete",

  // Users / membership
  USER_INVITE: "user.invite",
  USER_MANAGE: "user.manage",

  // Billing
  BILLING_VIEW: "billing.view",

  // Audit
  AUDIT_READ: "audit.read",

  // Settings
  SETTINGS_MANAGE: "settings.manage",

  // Exports
  EXPORT_RUN: "export.run",

  // API keys
  APIKEY_MANAGE: "apikey.manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

/**
 * Built-in roles. Tenants can extend or override these via DB-backed roles
 * (see `rbac.ts`). Keep names lowercase to match what's already stored on
 * `users.role` in MongoDB (`auditor`, `analyst`, `manager`, `admin`, `user`).
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  // Read-only role for compliance reviewers.
  auditor: [
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.AUDIT_READ,
  ],

  // Standard practitioner — reads/writes data but cannot manage users or roles.
  analyst: [
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.CLIENT_WRITE,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_WRITE,
    PERMISSIONS.EXPORT_RUN,
  ],

  // Team lead — analyst + invite users + delete data.
  manager: [
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.CLIENT_WRITE,
    PERMISSIONS.CLIENT_DELETE,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_WRITE,
    PERMISSIONS.DOCUMENT_DELETE,
    PERMISSIONS.EXPORT_RUN,
    PERMISSIONS.USER_INVITE,
    PERMISSIONS.AUDIT_READ,
  ],

  // Tenant administrator — full control within an organization.
  admin: ALL_PERMISSIONS,

  // Legacy default — kept for backwards compatibility with existing users
  // whose `role` field defaulted to `"user"`. Maps to analyst-equivalent.
  user: [
    PERMISSIONS.CLIENT_READ,
    PERMISSIONS.CLIENT_WRITE,
    PERMISSIONS.DOCUMENT_READ,
    PERMISSIONS.DOCUMENT_WRITE,
    PERMISSIONS.EXPORT_RUN,
  ],
};

/**
 * Resolve the permission set for a role using only the default mapping.
 * DB-backed overrides are layered on top in `rbac.ts::resolvePermissions`.
 */
export function defaultPermissionsForRole(role: string | null | undefined): Permission[] {
  if (!role) return [];
  return DEFAULT_ROLE_PERMISSIONS[role] ?? [];
}

export function isKnownPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as string[]).includes(value);
}
