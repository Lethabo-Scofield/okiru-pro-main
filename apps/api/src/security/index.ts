/**
 * Public surface of the security module. Routes should import from here
 * rather than reaching into individual files, which lets us evolve the
 * internals without disturbing call sites.
 */
export {
  PERMISSIONS,
  ALL_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  defaultPermissionsForRole,
  isKnownPermission,
  type Permission,
} from "./permissions.js";

export {
  resolvePermissions,
  invalidatePermissionsCache,
  requirePermission,
  requireAnyPermission,
  hasPermissionFromDefaults,
  type ResolvedPermissions,
} from "./rbac.js";

export {
  RbacRoleModel,
  RbacRoleAssignmentModel,
  RbacTeamModel,
} from "./rbacModels.js";

export {
  AuditLogModel,
  recordAudit,
  buildAuditRow,
  auditAction,
  queryAuditLogs,
  type AuditEventInput,
  type AuditResult,
  type AuditQuery,
} from "./auditLog.js";

export {
  getTenantContext,
  requireTenantContext,
  assertSameTenant,
  requireTenantOwnership,
  type TenantContext,
} from "./tenant.js";

export { validateBody, validateQuery } from "./validate.js";

export {
  getEffectiveRoles,
  getDataScopeRoles,
  hasAnyRole,
  hasDataScopeRole,
  isPlatformAdmin,
  type RoleCarrier,
} from "./roles.js";
