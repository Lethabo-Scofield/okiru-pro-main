/**
 * Studio authorisation. Permissions live in `studioGrants`; they are NEVER derived from a
 * tenant admin or platform super-admin role. Okiru Admin manages grants, audits and
 * emergency operations but deliberately cannot approve or publish ordinary changes.
 */
import { randomUUID } from 'crypto';
import type { StudioStore, Doc } from './studioStore.js';

export const STUDIO_ROLES = ['viewer', 'expert_editor', 'developer', 'expert_approver', 'admin'] as const;
export type StudioRole = (typeof STUDIO_ROLES)[number];

export const STUDIO_ACTIONS = [
  'read', 'draft.write', 'draft.submit', 'review.decide', 'publish', 'freeze', 'rollback.emergency',
  'grants.manage', 'audit.read', 'changeRequest.create', 'changeRequest.manage', 'backups.read', 'backups.drill', 'pins.manage',
] as const;
export type StudioAction = (typeof STUDIO_ACTIONS)[number];

/** Actions that apply to every scorecard at once and so need an unscoped ('*') grant. */
const GLOBAL_ACTIONS: ReadonlySet<StudioAction> = new Set(['grants.manage', 'audit.read', 'backups.read', 'backups.drill']);

export const PERMISSION_MATRIX: Readonly<Record<StudioAction, readonly StudioRole[]>> = {
  'read': ['viewer', 'expert_editor', 'developer', 'expert_approver', 'admin'],
  'draft.write': ['expert_editor'],
  'draft.submit': ['expert_editor'],
  'review.decide': ['expert_approver'],
  'publish': ['expert_approver'],
  'freeze': ['expert_approver', 'admin'],
  'rollback.emergency': ['expert_approver', 'admin'],
  'grants.manage': ['admin'],
  'audit.read': ['admin'],
  'changeRequest.create': ['expert_editor', 'developer'],
  'changeRequest.manage': ['developer'],
  'backups.read': ['admin', 'expert_approver'],
  'backups.drill': ['admin'],
  'pins.manage': ['expert_approver', 'admin'],
};

export interface Grant extends Doc {
  kind: 'grant';
  userId: string;
  role: StudioRole;
  /** Scorecard ids this grant covers, or ['*'] for all. */
  scorecards: string[];
  createdBy: string;
  createdAt: string;
  revokedAt: string | null;
}

export class ForbiddenError extends Error {
  readonly code = 'FORBIDDEN';
  constructor(message = 'You do not have permission to do this') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * The named people allowed in the Studio at all (RULES_STUDIO_ALLOWED_USERS, comma-separated user ids).
 * Signup is open, so a grant alone does not prove a person: without this, one person holding two Okiru
 * accounts could be both editor and approver. In production an empty list means nobody.
 */
export function allowedUsers(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.RULES_STUDIO_ALLOWED_USERS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

export function isAllowedUser(userId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const list = allowedUsers(env);
  if (list.length) return list.includes(userId);
  return env.NODE_ENV !== 'production';
}

export function bootstrapAdmins(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.RULES_STUDIO_BOOTSTRAP_ADMINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

const covers = (g: Grant, scorecardId: string | undefined) =>
  g.scorecards.includes('*') || (scorecardId !== undefined && g.scorecards.includes(scorecardId));

export async function activeGrants(store: StudioStore, userId: string): Promise<Grant[]> {
  const all = await store.collection<Grant>('studioGrants').find({ userId } as never);
  return all.filter((g) => g.kind === 'grant' && !g.revokedAt);
}

/**
 * Returns the grant that authorises `action` (on `scorecardId` when scoped) or throws
 * ForbiddenError. Bootstrap admins (env) hold an implicit unscoped admin grant so the very
 * first grants can be created; that grant authorises admin actions only.
 */
export async function authorize(
  store: StudioStore, userId: string | undefined, action: StudioAction, scorecardId?: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Grant> {
  if (!userId) throw new ForbiddenError('Not authenticated');
  if (!isAllowedUser(userId, env)) throw new ForbiddenError();
  const allowed = PERMISSION_MATRIX[action];
  const grants = await activeGrants(store, userId);
  if (bootstrapAdmins(env).includes(userId)) {
    grants.push({ id: `bootstrap:${userId}`, rev: 1, kind: 'grant', userId, role: 'admin', scorecards: ['*'], createdBy: 'bootstrap', createdAt: '1970-01-01T00:00:00.000Z', revokedAt: null });
  }
  const scoped = !GLOBAL_ACTIONS.has(action);
  const hit = grants.find((g) => allowed.includes(g.role) && (scoped ? covers(g, scorecardId) : g.scorecards.includes('*')));
  if (!hit) throw new ForbiddenError();
  return hit;
}

/** Whether the user holds ANY active grant (used to decide if the Studio is visible at all). */
export async function hasAnyGrant(store: StudioStore, userId: string | undefined, env: NodeJS.ProcessEnv = process.env): Promise<boolean> {
  if (!userId || !isAllowedUser(userId, env)) return false;
  return bootstrapAdmins(env).includes(userId) || (await activeGrants(store, userId)).length > 0;
}

export async function createGrant(store: StudioStore, input: { userId: string; role: StudioRole; scorecards: string[]; createdBy: string; now: Date }, env: NodeJS.ProcessEnv = process.env): Promise<Grant> {
  if (!isAllowedUser(input.userId, env)) throw new ForbiddenError('That account is not on the list of named Studio users');
  if (!STUDIO_ROLES.includes(input.role)) throw new ForbiddenError(`Unknown role ${input.role}`);
  if (!input.userId || !input.scorecards.length) throw new ForbiddenError('A grant needs a user and at least one scorecard (or *)');
  const grant: Grant = {
    id: randomUUID(), rev: 1, kind: 'grant', userId: input.userId, role: input.role,
    scorecards: [...new Set(input.scorecards)], createdBy: input.createdBy, createdAt: input.now.toISOString(), revokedAt: null,
  };
  await store.collection<Grant>('studioGrants').insert(grant);
  return grant;
}

export async function revokeGrant(store: StudioStore, id: string, now: Date): Promise<Grant> {
  const col = store.collection<Grant>('studioGrants');
  const g = await col.get(id);
  if (!g || g.kind !== 'grant') throw new ForbiddenError('No such grant');
  if (g.revokedAt) return g;
  return col.replace({ ...g, revokedAt: now.toISOString() }, g.rev);
}
