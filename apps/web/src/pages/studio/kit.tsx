import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { explainError, studio } from '@/lib/studioApi';

/** Loads JSON from the Studio API with loading / error / reload handling. */
export function useStudio<T = any>(path: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(path !== null);
  const reload = useCallback(async () => {
    if (path === null) return;
    setLoading(true); setError('');
    try { setData(await studio<T>('GET', path)); } catch (e) { setError(explainError(e)); }
    setLoading(false);
  }, [path]);
  useEffect(() => { void reload(); }, [reload, ...deps]);
  return { data, error, loading, reload };
}

export function Page({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-4" aria-labelledby="page-title">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="page-title" className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-sm text-zinc-600 dark:text-zinc-400">{subtitle}</p>}
        </div>
        {actions && <div className="flex gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Panel({ title, children, tone = 'plain' }: { title?: string; children: ReactNode; tone?: 'plain' | 'warn' | 'danger' | 'ok' }) {
  const tones = { plain: 'border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900', warn: 'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40', danger: 'border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/40', ok: 'border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40' };
  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      {title && <h2 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-100">{title}</h2>}
      {children}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return message ? <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">{message}</p> : null;
}

export function Loading({ what = 'Loading' }: { what?: string }) {
  return <p className="text-sm text-zinc-500 dark:text-zinc-400" role="status">{what}...</p>;
}

const VERDICT_TONE: Record<string, string> = {
  match: 'bg-zinc-100 text-zinc-700', deliberate: 'bg-blue-100 text-blue-800', unexplained: 'bg-red-100 text-red-800', missing: 'bg-red-100 text-red-800',
};
export const VerdictBadge = ({ verdict }: { verdict: string }) => <Badge className={VERDICT_TONE[verdict] ?? ''} variant="secondary">{verdict}</Badge>;

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-zinc-100 text-zinc-700', changes_requested: 'bg-amber-100 text-amber-800', submitted: 'bg-blue-100 text-blue-800',
  approved: 'bg-emerald-100 text-emerald-800', published: 'bg-emerald-200 text-emerald-900', rejected: 'bg-red-100 text-red-800', withdrawn: 'bg-zinc-100 text-zinc-500',
};
export const StatusBadge = ({ status }: { status: string }) => <Badge className={STATUS_TONE[status] ?? ''} variant="secondary">{status.replace('_', ' ')}</Badge>;

export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '-');
export const short = (h?: string | null) => (h ? h.slice(0, 10) : '-');
