/**
 * Launch readiness: the checklist that decides whether published rules may be served.
 *
 * `RULES_LAUNCHED=true` only takes effect when every BLOCKER below passes. Otherwise the API behaves
 * as not launched (clients use the shipped rules) and says why. This turns "keep it off until the
 * prerequisites are met" from a promise into a mechanism.
 *
 * REHEARSAL: with RULES_REHEARSAL=true (never in production) the local-directory backup store is
 * accepted so the whole flow can be exercised end to end. Readiness then reports rehearsal=true and
 * productionReady=false regardless of how green the rest is.
 */
import { createPrivateKey, createPublicKey } from 'crypto';
import type { Doc, StudioStore } from './studio/studioStore.js';
import type { Grant } from './studio/permissions.js';

export type Severity = 'blocker' | 'warning';

export interface ReadinessCheck {
  id: string;
  label: string;
  ok: boolean;
  severity: Severity;
  detail: string;
  fix: string;
}

export interface Readiness {
  checks: ReadinessCheck[];
  /** Every blocker passes. */
  canLaunch: boolean;
  /** canLaunch AND not a rehearsal setup AND no warnings that matter for production. */
  productionReady: boolean;
  rehearsal: boolean;
  launchedFlag: boolean;
  /** What the API actually does right now. */
  effectiveLaunched: boolean;
}

const has = (v: string | undefined) => !!v && v.trim().length > 0;

function signingKeyValid(env: NodeJS.ProcessEnv): { ok: boolean; detail: string } {
  if (!has(env.RULES_SIGNING_KEY_ID) || !has(env.RULES_SIGNING_PRIVATE_KEY)) return { ok: false, detail: 'RULES_SIGNING_KEY_ID / RULES_SIGNING_PRIVATE_KEY are not set' };
  try {
    const key = createPrivateKey(env.RULES_SIGNING_PRIVATE_KEY!.replace(/\\n/g, '\n').trim());
    if (key.asymmetricKeyType !== 'ed25519') return { ok: false, detail: 'the signing key is not Ed25519' };
    createPublicKey(key);
    return { ok: true, detail: `Ed25519 key "${env.RULES_SIGNING_KEY_ID}" loads` };
  } catch (e) {
    return { ok: false, detail: `the signing key does not parse: ${(e as Error).message.slice(0, 80)}` };
  }
}

function totpKeyValid(env: NodeJS.ProcessEnv): { ok: boolean; detail: string } {
  if (!has(env.RULES_TOTP_ENC_KEY)) return { ok: false, detail: 'RULES_TOTP_ENC_KEY is not set' };
  return Buffer.from(env.RULES_TOTP_ENC_KEY!, 'base64').length === 32 ? { ok: true, detail: '32-byte key present' } : { ok: false, detail: 'RULES_TOTP_ENC_KEY must be 32 bytes, base64-encoded' };
}

/** Synchronous, environment-only checks (usable on every request without touching the database). */
export function envReadiness(env: NodeJS.ProcessEnv = process.env): Readiness {
  const isProd = env.NODE_ENV === 'production';
  const rehearsal = env.RULES_REHEARSAL === 'true' && !isProd;
  const local = has(env.RULES_OFFSITE_LOCAL_DIR);
  const azure = has(env.RULES_OFFSITE_AZURE_CONNECTION_STRING) && has(env.RULES_OFFSITE_CONTAINER);
  const s3 = has(env.RULES_OFFSITE_S3_BUCKET) && has(env.RULES_OFFSITE_S3_REGION);
  const primary = env.AZURE_CERT_STORAGE_CONNECTION_STRING || env.AZURE_STORAGE_CONNECTION_STRING;
  const sk = signingKeyValid(env);
  const tk = totpKeyValid(env);
  const checks: ReadinessCheck[] = [];
  const add = (c: ReadinessCheck) => checks.push(c);

  add({ id: 'signing-key', label: 'Dedicated Ed25519 signing key', ok: sk.ok, severity: 'blocker', detail: sk.detail, fix: 'Run `node scripts/rules-studio-setup.mjs` and set RULES_SIGNING_KEY_ID and RULES_SIGNING_PRIVATE_KEY (secret store, not git).' });
  add({ id: 'totp-key', label: 'TOTP secret encryption key', ok: tk.ok, severity: 'blocker', detail: tk.detail, fix: 'Run `node scripts/rules-studio-setup.mjs` and set RULES_TOTP_ENC_KEY.' });

  const offsiteOk = s3 || (azure ? !(primary && primary === env.RULES_OFFSITE_AZURE_CONNECTION_STRING) : local && rehearsal);
  add({
    id: 'offsite-backup', label: 'Off-site backup store (outside the primary subscription)', ok: offsiteOk, severity: 'blocker',
    detail: s3
      ? `S3 bucket ${env.RULES_OFFSITE_S3_BUCKET} in ${env.RULES_OFFSITE_S3_REGION}`
      : azure
      ? (offsiteOk ? 'Azure Blob container configured, different from the primary storage account' : 'the off-site connection string is the PRIMARY storage account')
      : local ? (rehearsal ? 'local directory (REHEARSAL only - not off-site)' : 'RULES_OFFSITE_LOCAL_DIR is set but RULES_REHEARSAL is not true') : 'no off-site store configured',
    fix: 'Create a storage account in a DIFFERENT subscription with an immutability policy; set RULES_OFFSITE_AZURE_CONNECTION_STRING and RULES_OFFSITE_CONTAINER.',
  });
  add({ id: 'build-id', label: 'Build identifier', ok: has(env.BUILD_ID || env.GIT_SHA || env.SOURCE_VERSION), severity: 'blocker', detail: has(env.BUILD_ID || env.GIT_SHA || env.SOURCE_VERSION) ? 'set' : 'BUILD_ID is not set (stamps would say "unversioned-build")', fix: 'Set BUILD_ID to the git SHA in CI.' });
  add({ id: 'not-rehearsal-in-prod', label: 'No rehearsal settings in production', ok: !(isProd && (local || env.RULES_REHEARSAL === 'true')), severity: 'blocker', detail: isProd && (local || env.RULES_REHEARSAL === 'true') ? 'rehearsal settings are present in a production environment' : 'ok', fix: 'Remove RULES_REHEARSAL and RULES_OFFSITE_LOCAL_DIR.' });

  add({ id: 'alarm-webhook', label: 'Alarm webhook for critical alerts', ok: has(env.RULES_ALARM_WEBHOOK_URL), severity: rehearsal ? 'warning' : 'blocker', detail: has(env.RULES_ALARM_WEBHOOK_URL) ? 'configured' : 'RULES_ALARM_WEBHOOK_URL is not set; critical alarms would be in-app only', fix: 'Point RULES_ALARM_WEBHOOK_URL at the team channel.' });
  add({ id: 'heartbeat', label: 'External heartbeat monitor', ok: has(env.RULES_HEARTBEAT_URL), severity: rehearsal ? 'warning' : 'blocker', detail: has(env.RULES_HEARTBEAT_URL) ? 'configured' : 'RULES_HEARTBEAT_URL is not set; a dead scheduler or failed backup would go unnoticed', fix: 'Create a dead-man-switch check outside Okiru and set RULES_HEARTBEAT_URL.' });
  add({ id: 'restricted-db-user', label: 'Rules collections on a restricted database user', ok: has(env.RULES_MONGO_URI), severity: rehearsal ? 'warning' : 'blocker', detail: has(env.RULES_MONGO_URI) ? 'RULES_MONGO_URI set' : 'the rules ledger shares the application database user, so append-only is enforced by the app only', fix: 'Create the role from docs/rules-studio/mongo-roles.md and set RULES_MONGO_URI.' });
  add({ id: 'named-users', label: 'Studio limited to named people', ok: has(env.RULES_STUDIO_ALLOWED_USERS), severity: rehearsal ? 'warning' : 'blocker', detail: has(env.RULES_STUDIO_ALLOWED_USERS) ? 'RULES_STUDIO_ALLOWED_USERS is set' : 'RULES_STUDIO_ALLOWED_USERS is not set, so nobody can use the Studio in production', fix: 'List the user ids of the named people.' });
  add({ id: 'approvals', label: 'Independent approvals required', ok: Number(env.RULES_REQUIRED_APPROVALS ?? 1) >= 1, severity: 'warning', detail: `RULES_REQUIRED_APPROVALS=${env.RULES_REQUIRED_APPROVALS ?? '1 (default)'}`, fix: 'Confirm the number of approvals with the owner.' });
  add({ id: 'smtp', label: 'Email delivery (optional)', ok: has(env.SMTP_HOST) && has(env.SMTP_USER), severity: 'warning', detail: has(env.SMTP_HOST) ? 'configured' : 'SMTP not configured; email stays inactive (webhook and in-app still work)', fix: 'Optional.' });
  add({ id: 'ai', label: 'AI assistance (optional)', ok: has(env.RULES_AI_API_KEY), severity: 'warning', detail: has(env.RULES_AI_API_KEY) ? 'configured' : 'disabled; experts edit rules by hand', fix: 'Optional.' });

  const launchedFlag = env.RULES_LAUNCHED === 'true';
  const canLaunch = checks.filter((c) => c.severity === 'blocker').every((c) => c.ok);
  const productionReady = canLaunch && !rehearsal && checks.every((c) => c.ok || c.id === 'smtp' || c.id === 'ai' || c.id === 'approvals');
  return { checks, canLaunch, productionReady, rehearsal, launchedFlag, effectiveLaunched: launchedFlag && canLaunch };
}

/** Adds the database-backed checks: someone can edit, someone else can approve, step-up is enrolled. */
export async function fullReadiness(studio: StudioStore, env: NodeJS.ProcessEnv = process.env): Promise<Readiness> {
  const base = envReadiness(env);
  const grants = (await studio.collection<Grant & Doc>('studioGrants').find()).filter((g: any) => g.kind === 'grant' && !g.revokedAt) as Grant[];
  const editors = new Set(grants.filter((g) => g.role === 'expert_editor').map((g) => g.userId));
  const approvers = new Set(grants.filter((g) => g.role === 'expert_approver').map((g) => g.userId));
  const independent = [...approvers].some((a) => !editors.has(a) || editors.size > 1);
  const enrolled = (await studio.collection<any>('studioGrants').find()).filter((g: any) => g.kind === 'totp' && g.confirmed).map((g: any) => g.userId);
  const approverEnrolled = [...approvers].some((a) => enrolled.includes(a));

  base.checks.push(
    { id: 'roles', label: 'An editor and an independent approver exist', ok: editors.size >= 1 && approvers.size >= 1 && independent, severity: 'blocker', detail: `${editors.size} editor(s), ${approvers.size} approver(s)${independent ? '' : ' - the only approver is also the only editor, so four-eyes cannot be satisfied'}`, fix: 'Create grants (Okiru Admin) for at least one Expert Editor and a DIFFERENT Expert Approver.' },
    { id: 'approver-enrolled', label: 'An approver has enrolled an authenticator', ok: approverEnrolled, severity: 'blocker', detail: approverEnrolled ? 'enrolled' : 'no approver has completed authenticator enrolment', fix: 'The approver enrols on first publish (Review and publish -> Publish).' },
  );
  base.canLaunch = base.checks.filter((c) => c.severity === 'blocker').every((c) => c.ok);
  base.productionReady = base.canLaunch && !base.rehearsal && base.checks.every((c) => c.ok || ['smtp', 'ai', 'approvals'].includes(c.id));
  base.effectiveLaunched = base.launchedFlag && envReadiness(env).canLaunch;
  return base;
}
