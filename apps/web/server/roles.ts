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

/**
 * Platform admin = Okiru staff, the only role allowed to cross an organisation
 * boundary.
 *
 * `admin` is deliberately NOT one. It is the TENANT administrator (full
 * control *within* one org - see DEFAULT_ROLE_PERMISSIONS in
 * apps/api/src/security/permissions.ts), and every registrant is made one for
 * the company they sign up (auth.ts /register). Accepting `admin` here is what
 * turned every customer into a platform admin who could see every other
 * company. Company-scoped administration is the org's adminUserId pointer,
 * enforced by requireOrgAdmin.
 */
export function isPlatformAdmin(user: RoleCarrier | null | undefined): boolean {
  return hasAnyRole(user, "super_admin");
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
  if (hasAnyRole(user, "super_admin")) {
    orClause.push({ lakeTradingDemo: true });
  }
  return { $or: orClause };
}
