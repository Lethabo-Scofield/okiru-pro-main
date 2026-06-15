import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bug, Lightbulb, MessageSquare, ShieldCheck,
  RefreshCcw, CheckCircle2, Clock, CircleAlert, Search, Loader2,
} from 'lucide-react';
import { apiRequest } from '@toolkit/lib/queryClient';
import { AppNavBack } from '@/components/AppNavBack';
import { feedbackPillarLabel } from '@/lib/feedbackPillars';

type Status = 'open' | 'in-progress' | 'resolved';
type Category = 'bug' | 'feature' | 'general' | 'compliance';

interface FeedbackItem {
  id: string;
  message: string;
  category: Category;
  pillar?: string | null;
  pageUrl: string | null;
  userName: string | null;
  userEmail: string | null;
  userId: string | null;
  organizationId: string | null;
  status: Status;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FeedbackListResponse {
  feedback: FeedbackItem[];
  total: number;
  source: 'mongodb' | 'memory';
  databaseConnected?: boolean;
}

interface FeedbackStats {
  total: number;
  open: number;
  inProgress: number;
  resolved: number;
  byCategory: Record<string, number>;
  source: 'mongodb' | 'memory';
  databaseConnected?: boolean;
}

const STATUS_FILTERS: Array<{ value: Status | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in-progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
];

const CATEGORY_FILTERS: Array<{ value: Category | 'all'; label: string }> = [
  { value: 'all', label: 'All categories' },
  { value: 'compliance', label: 'Compliance' },
  { value: 'bug', label: 'Bug' },
  { value: 'feature', label: 'Feature request' },
  { value: 'general', label: 'General' },
];

const CATEGORY_ICON: Record<Category, ReactNode> = {
  bug: <Bug className="h-3.5 w-3.5" />,
  feature: <Lightbulb className="h-3.5 w-3.5" />,
  general: <MessageSquare className="h-3.5 w-3.5" />,
  compliance: <ShieldCheck className="h-3.5 w-3.5" />,
};

const STATUS_COLOR: Record<Status, string> = {
  'open': 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  'in-progress': 'bg-blue-500/10 text-blue-300 border-blue-500/30',
  'resolved': 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
};

const STATUS_ICON: Record<Status, ReactNode> = {
  'open': <CircleAlert className="h-3 w-3" />,
  'in-progress': <Clock className="h-3 w-3" />,
  'resolved': <CheckCircle2 className="h-3 w-3" />,
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

export default function DevMode() {
  const [statusFilter, setStatusFilter] = useState<Status | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    document.title = 'DevMode - Feedback Report | Okiru';
  }, []);

  const listQuery = useQuery<FeedbackListResponse>({
    queryKey: ['/api/feedback', statusFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('dbOnly', '1');
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      const qs = params.toString();
      const res = await apiRequest('GET', `/api/feedback?${qs}`);
      return res.json();
    },
  });

  const statsQuery = useQuery<FeedbackStats>({
    queryKey: ['/api/feedback/stats'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/feedback/stats?dbOnly=1');
      return res.json();
    },
  });

  const items = listQuery.data?.feedback ?? [];
  const stats = statsQuery.data;
  const databaseConnected =
    listQuery.data?.databaseConnected ?? statsQuery.data?.databaseConnected ?? true;

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (item) =>
        item.message.toLowerCase().includes(q) ||
        (item.userName ?? '').toLowerCase().includes(q) ||
        (item.userEmail ?? '').toLowerCase().includes(q) ||
        (item.pageUrl ?? '').toLowerCase().includes(q),
    );
  }, [items, search]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-white/5 bg-black/40 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <AppNavBack
              href="/hub"
              eyebrow="Suite"
              label="Hub"
              variant="zinc"
              size="compact"
              data-testid="link-back-home"
            />
            <span className="text-zinc-700">/</span>
            <h1 className="text-sm font-semibold tracking-wide text-white">
              DevMode <span className="text-zinc-500">- Feedback Report</span>
            </h1>
          </div>
          <button
            type="button"
            onClick={() => {
              listQuery.refetch();
              statsQuery.refetch();
            }}
            data-testid="button-refresh"
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        <section className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Total" value={stats?.total ?? 0} loading={statsQuery.isLoading} />
          <StatCard label="Open" value={stats?.open ?? 0} loading={statsQuery.isLoading} accent="amber" />
          <StatCard label="In progress" value={stats?.inProgress ?? 0} loading={statsQuery.isLoading} accent="blue" />
          <StatCard label="Resolved" value={stats?.resolved ?? 0} loading={statsQuery.isLoading} accent="emerald" />
        </section>

        {!databaseConnected && (
          <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-200">
            MongoDB is not connected, so database feedback is not available. No in-memory or sample feedback is shown here.
          </div>
        )}

        <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                data-testid={`filter-status-${f.value}`}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  statusFilter === f.value
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white/5 text-zinc-300 hover:bg-white/10'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as Category | 'all')}
              data-testid="filter-category"
              className="rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-xs text-zinc-200 focus:border-indigo-500 focus:outline-none"
            >
              {CATEGORY_FILTERS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search feedback…"
                data-testid="input-search"
                className="w-64 rounded-md border border-white/10 bg-black/40 py-1.5 pl-7 pr-3 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>
        </section>

        <section>
          {listQuery.isLoading ? (
            <div className="flex items-center justify-center rounded-lg border border-white/5 bg-black/20 py-16 text-sm text-zinc-400">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Loading feedback…
            </div>
          ) : listQuery.isError ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-6 text-sm text-red-200">
              Failed to load feedback. {listQuery.error instanceof Error ? listQuery.error.message : ''}
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="rounded-lg border border-white/5 bg-black/20 py-16 text-center text-sm text-zinc-400" data-testid="empty-feedback">
              No feedback yet. Use the floating button on any page to send the first one.
            </div>
          ) : (
            <ul className="space-y-3">
              {filteredItems.map((item) => (
                <li
                  key={item.id}
                  data-testid={`feedback-item-${item.id}`}
                  className="rounded-lg border border-white/5 bg-black/20 p-4 transition hover:border-white/10"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${STATUS_COLOR[item.status]}`}>
                      {STATUS_ICON[item.status]}
                      {item.status}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-300">
                      {CATEGORY_ICON[item.category]}
                      {item.category}
                    </span>
                    {item.pillar ? (
                      <span className="inline-flex items-center rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-200">
                        {feedbackPillarLabel(item.pillar)}
                      </span>
                    ) : null}
                    <span className="text-[10px] text-zinc-500">
                      {formatDate(item.createdAt)}
                    </span>
                    {item.pageUrl && (
                      <span className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
                        {item.pageUrl}
                      </span>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-zinc-100">
                    {item.message}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="text-[11px] text-zinc-500">
                      {item.userName || item.userEmail ? (
                        <span>
                          From {item.userName ?? 'Unknown'}
                          {item.userEmail ? ` · ${item.userEmail}` : ''}
                        </span>
                      ) : (
                        <span>Anonymous</span>
                      )}
                    </div>
                    <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-400">
                      Read-only public view
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
  accent,
}: {
  label: string;
  value: number;
  loading?: boolean;
  accent?: 'amber' | 'blue' | 'emerald';
}) {
  const accentClass =
    accent === 'amber'
      ? 'text-amber-300'
      : accent === 'blue'
      ? 'text-blue-300'
      : accent === 'emerald'
      ? 'text-emerald-300'
      : 'text-white';
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accentClass}`} data-testid={`stat-${label.toLowerCase().replace(/\s+/g, '-')}`}>
        {loading ? '-' : value}
      </div>
    </div>
  );
}
