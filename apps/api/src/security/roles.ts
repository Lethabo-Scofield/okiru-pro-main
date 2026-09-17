/**
 * Effective role helpers for RBAC permissions vs data scoping.
 * super_admin grants platform permissions; secondaryRoles preserve data visibility.
 */

export type RoleCarrier = {
  role?: string | null;
  secondaryRoles?: string[] | null;
};

/** All roles assigned to a user (primary + secondary, deduped). */
export function getEffectiveRoles(user: RoleCarrier | null | undefined): string[] {
  const roles = new Set<string>();
  if (user?.role) roles.add(user.role);
  for (const r of user?.secondaryRoles ?? []) {
    if (r) roles.add(r);
  }
  return Array.from(roles);
}

/** Roles used for tenant/data scoping (excludes super_admin when other roles exist). */
export function getDataScopeRoles(user: RoleCarrier | null | undefined): string[] {
  const all = getEffectiveRoles(user);
  const scoped = all.filter((r) => r !== "super_admin");
  return scoped.length > 0 ? scoped : all;
}

export function hasAnyRole(user: RoleCarrier | null | undefined, ...roles: string[]): boolean {
  const effective = getEffectiveRoles(user);
  return roles.some((r) => effective.includes(r));
}

export function hasDataScopeRole(user: RoleCarrier | null | undefined, ...roles: string[]): boolean {
  const scope = getDataScopeRoles(user);
  return roles.some((r) => scope.includes(r));
}

/**
 * Platform admin: cross-ORGANISATION reach - `super_admin` only.
 *
 * `admin` is the tenant administrator (ALL_PERMISSIONS *inside* one org, see
 * permissions.ts) and is handed to every registrant for their own company, so
 * it must never gate a cross-tenant surface. Mirrors apps/web/server/roles.ts.
 */
export function isPlatformAdmin(user: RoleCarrier | null | undefined): boolean {
  return hasAnyRole(user, "super_admin");
}
