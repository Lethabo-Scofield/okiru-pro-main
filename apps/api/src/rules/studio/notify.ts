/**
 * Notifications and alarms.
 *
 * - In-app notifications are rows in `notifications` (read by the Studio UI).
 * - Critical alarms are also POSTed to RULES_ALARM_WEBHOOK_URL with bounded retries; every
 *   attempt is recorded in the append-only `notificationDeliveries`, and a delivery that keeps
 *   failing is surfaced on the notifications screen rather than lost.
 * - Email goes to an outbox only when SMTP is configured; otherwise it stays safely inactive
 *   (the webhook and in-app channels still fire).
 * - Payloads carry ids and short plain-language summaries, never client data.
 */
import { randomUUID } from 'crypto';
import type { Doc, StudioStore } from './studioStore.js';

export type Severity = 'info' | 'warning' | 'critical';

export const NOTIFICATION_TYPES = [
  'draft.submitted', 'draft.approved', 'draft.rejected', 'draft.changes_requested', 'publication.completed',
  'freeze.performed', 'unfreeze.performed', 'rollback.performed', 'backup.failed', 'integrity.failure',
  'compatibility.failure', 'login.unusual', 'permissions.changed', 'change_request.outstanding', 'review.task',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface Notification extends Doc {
  type: NotificationType;
  severity: Severity;
  message: string;
  entity: string | null;
  /** Roles that should see it; empty = everyone with Studio access. */
  audience: string[];
  dueAt: string | null;
  readBy: string[];
  createdAt: string;
}

export interface Delivery extends Doc {
  notificationId: string;
  channel: 'webhook' | 'email';
  attempt: number;
  status: 'delivered' | 'failed' | 'skipped';
  detail: string;
  createdAt: string;
}

export interface NotifyConfig {
  webhookUrl?: string;
  smtpConfigured: boolean;
  maxAttempts: number;
  timeoutMs: number;
  fetchImpl: (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number }>;
}

export function notifyConfigFromEnv(env: NodeJS.ProcessEnv = process.env): NotifyConfig {
  return {
    webhookUrl: env.RULES_ALARM_WEBHOOK_URL || undefined,
    smtpConfigured: !!(env.SMTP_HOST && env.SMTP_USER),
    maxAttempts: 3,
    timeoutMs: 5000,
    fetchImpl: (url, init) => fetch(url, init) as Promise<{ ok: boolean; status: number }>,
  };
}

export async function notify(
  store: StudioStore, cfg: NotifyConfig, now: Date,
  input: { type: NotificationType; severity: Severity; message: string; entity?: string | null; audience?: string[]; dueAt?: string | null },
): Promise<Notification> {
  const n: Notification = {
    id: randomUUID(), rev: 1, type: input.type, severity: input.severity, message: input.message.slice(0, 500),
    entity: input.entity ?? null, audience: input.audience ?? [], dueAt: input.dueAt ?? null, readBy: [], createdAt: now.toISOString(),
  };
  await store.collection<Notification>('notifications').insert(n);

  const record = (channel: Delivery['channel'], attempt: number, status: Delivery['status'], detail: string) =>
    store.collection<Delivery>('notificationDeliveries').insert({ id: randomUUID(), rev: 1, notificationId: n.id, channel, attempt, status, detail, createdAt: now.toISOString() });

  if (input.severity === 'critical') {
    if (!cfg.webhookUrl) {
      await record('webhook', 0, 'skipped', 'RULES_ALARM_WEBHOOK_URL is not configured - the alarm is in-app only');
    } else {
      for (let attempt = 1; attempt <= cfg.maxAttempts; attempt++) {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs);
        try {
          const res = await cfg.fetchImpl(cfg.webhookUrl, {
            method: 'POST', headers: { 'content-type': 'application/json' }, signal: ctl.signal,
            body: JSON.stringify({ source: 'okiru-rules-studio', type: n.type, severity: n.severity, message: n.message, entity: n.entity, at: n.createdAt, notificationId: n.id }),
          });
          if (res.ok) { await record('webhook', attempt, 'delivered', `HTTP ${res.status}`); break; }
          await record('webhook', attempt, 'failed', `HTTP ${res.status}`);
        } catch (e) {
          await record('webhook', attempt, 'failed', (e as Error).name === 'AbortError' ? 'timeout' : (e as Error).message.slice(0, 120));
        } finally {
          clearTimeout(timer);
        }
      }
    }
  }
  if (!cfg.smtpConfigured) await record('email', 0, 'skipped', 'SMTP is not configured');
  return n;
}

/** Notifications whose webhook delivery never succeeded, for the "delivery problems" banner. */
export async function persistentDeliveryFailures(store: StudioStore, maxAttempts = 3): Promise<Array<{ notificationId: string; attempts: number; lastDetail: string }>> {
  const all = await store.collection<Delivery>('notificationDeliveries').find({ channel: 'webhook' } as never);
  const by = new Map<string, Delivery[]>();
  for (const d of all) by.set(d.notificationId, [...(by.get(d.notificationId) ?? []), d]);
  return [...by.entries()]
    .filter(([, ds]) => !ds.some((d) => d.status === 'delivered') && ds.filter((d) => d.status === 'failed').length >= maxAttempts)
    .map(([notificationId, ds]) => ({ notificationId, attempts: ds.filter((d) => d.status === 'failed').length, lastDetail: ds[ds.length - 1].detail }));
}
