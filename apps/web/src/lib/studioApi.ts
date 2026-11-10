/**
 * Thin client for /api/rules-studio and /api/auth/step-up.
 *
 * Mutating calls carry the Studio request header the server requires. Errors keep the
 * server's machine-readable `code` so screens can explain "why" instead of showing a status.
 */
export class StudioApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown) {
    super(message);
    this.name = 'StudioApiError';
  }
}

const BASE = '/api/rules-studio';

export async function studio<T = any>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const isStepUp = path.startsWith('/api/auth/');
  const res = await fetch(isStepUp ? path : `${BASE}${path}`, {
    method,
    credentials: 'include',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(method !== 'GET' ? { 'X-Requested-With': 'okiru-studio' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) throw new StudioApiError(res.status, json?.code ?? `http_${res.status}`, json?.message ?? res.statusText, json?.details);
  return json as T;
}

export const stepUpStart = (action: string, params: Record<string, unknown>) =>
  studio<{ challengeId: string; expiresAt: string }>('POST', '/api/auth/step-up/start', { action, params });
export const stepUpVerify = (challengeId: string, code: string) =>
  studio<{ token: string; expiresAt: string }>('POST', '/api/auth/step-up/verify', { challengeId, code });

export const explainError = (e: unknown): string => {
  if (e instanceof StudioApiError) {
    if (e.code === 'checks_failed' && (e.details as any)?.checks) {
      return `${e.message}. ${(e.details as any).checks.filter((c: any) => !c.ok).map((c: any) => `${c.id}: ${c.detail}`).join(' · ')}`;
    }
    return e.message;
  }
  return e instanceof Error ? e.message : 'Something went wrong';
};

export const UNIT_LABEL: Record<string, string> = { fraction: 'fraction (0.25 = 25%)', percent: 'percent', points: 'points', factor: 'factor (0-1)' };

export const formatValue = (v: unknown, unit?: string): string => {
  if (typeof v !== 'number') return '-';
  if (unit === 'fraction' || unit === 'factor') return `${Number((v * 100).toFixed(2))}%`;
  if (unit === 'percent') return `${Number(v.toFixed(3))}%`;
  return String(Number(v.toFixed(3)));
};
