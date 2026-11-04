/**
 * First Studio grants, from deployment settings: RULES_STUDIO_INITIAL_GRANTS="<userId>:<role>,<userId>:<role>".
 *
 * Someone has to hold the first grant before anyone can hand out the rest. Each entry is created once and
 * audited. A grant that was later revoked is NOT recreated on restart, so a revocation stays revoked.
 */
import { appendAudit } from './audit.js';
import { createGrant, STUDIO_ROLES, type Grant, type StudioRole } from './permissions.js';
import type { StudioCtx } from './studioService.js';

export function parseInitialGrants(raw: string | undefined): Array<{ userId: string; role: StudioRole }> {
  return (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean).flatMap((entry) => {
    const [userId, role] = entry.split(':').map((s) => s.trim());
    return userId && (STUDIO_ROLES as readonly string[]).includes(role) ? [{ userId, role: role as StudioRole }] : [];
  });
}

export async function ensureInitialGrants(ctx: StudioCtx): Promise<number> {
  const wanted = parseInitialGrants(ctx.env.RULES_STUDIO_INITIAL_GRANTS);
  if (!wanted.length) return 0;
  const existing = (await ctx.studio.collection<Grant>('studioGrants').find()).filter((g) => g.kind === 'grant');
  let created = 0;
  for (const { userId, role } of wanted) {
    if (existing.some((g) => g.userId === userId && g.role === role)) continue;
    const grant = await createGrant(ctx.studio, { userId, role, scorecards: ['*'], createdBy: 'deployment-settings', now: ctx.now() }, ctx.env);
    await appendAudit(ctx.studio, ctx.rules.signer, { actor: 'deployment-settings', action: 'grant.create', target: grant.id, details: { role, scorecards: ['*'], userId }, now: ctx.now() });
    created++;
  }
  return created;
}
