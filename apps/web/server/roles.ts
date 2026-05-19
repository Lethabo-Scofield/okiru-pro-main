/**
 * Effective role helpers (mirrors apps/api/src/security/roles.ts).
 */

export type RoleCarrier = {
  role?: string | null;
  secondaryRoles?: string[] | null;
};

export function getEffectiveRoles(user: RoleCarrier | null | undefined): string[] {
  const roles = new Set<string>();
  if (user?.role) roles.add(user.role);
  for (const r of user?.secondaryRoles ?? []) {
    if (r) roles.add(r);
  }
  return Array.from(roles);
}

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

export function isPlatformAdmin(user: RoleCarrier | null | undefined): boolean {
  return hasAnyRole(user, "admin", "super_admin");
}

/** Mongo filter for clients visible to this user (org + own creations). */
export function buildClientVisibilityFilter(
  userId: string,
  user: RoleCarrier & { organizationId?: string | null },
): Record<string, unknown> {
  const orClause: Record<string, unknown>[] = [{ createdByUserId: userId }];
  if (user.organizationId) {
    orClause.push({ organizationId: user.organizationId });
  }
  return { $or: orClause };
}
