/** Client-side role helpers (mirrors apps/web/server/roles.ts). */

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

export function hasAnyRole(user: RoleCarrier | null | undefined, ...roles: string[]): boolean {
  const effective = getEffectiveRoles(user);
  return roles.some((r) => effective.includes(r));
}

export function isSuperAdmin(user: RoleCarrier | null | undefined): boolean {
  return hasAnyRole(user, "super_admin");
}
