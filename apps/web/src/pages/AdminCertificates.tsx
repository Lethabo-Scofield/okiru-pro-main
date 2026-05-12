import { useState, useEffect, useCallback } from 'react';
import { Link } from 'wouter';
import {
  Loader2, ShieldCheck, ShieldOff, AlertTriangle, Flag,
  TrendingUp, Eye, Search as SearchIcon, Upload, Download, Hash,
  CheckCircle2, Copy,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AppNavBack } from '@/components/AppNavBack';

type Tab = 'verify' | 'reports' | 'duplicates' | 'analytics';

interface ListItem {
  name: string;
  fileName: string;
  companyName: string;
  vatNumber: string | null;
  companySize: string | null;
  blackOwnership: number | null;
  bbbeeLevel: number | null;
  expiryDate: string | null;
  status: string;
  lastModified: string | null;
  id?: string | null;
  slug?: string | null;
  verified?: boolean;
}

interface ReportItem {
  id: string;
  certificateId: string;
  certificateSlug: string | null;
  reason: string;
  message: string;
  email: string | null;
  status: string;
  createdAt: string;
}

interface DuplicateCluster {
  vatNumber: string;
  count: number;
  certificates: Array<{
    id: string | null;
    slug: string | null;
    companyName: string;
    fileName: string;
    expiryDate: string | null;
    status: string;
    verified: boolean;
    lastModified: string | null;
  }>;
}

interface Analytics {
  totals: { last24h: number; last7d: number; last30d: number; allTime: number };
  byType: Record<string, number>;
  topCertificates: Array<{ certificateId: string; certificateSlug: string | null; views: number }>;
  topQueries: Array<{ query: string; count: number }>;
  recent: Array<{ id: string; type: string; certificateSlug: string | null; query: string | null; createdAt: string }>;
}

function fmtDate(s: string | null): string {
  if (!s) return '-';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtDateTime(s: string | null): string {
  if (!s) return '-';
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleString('en-ZA', { dateStyle: 'short', timeStyle: 'short' });
}

const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
  { key: 'verify', label: 'Verification', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { key: 'reports', label: 'Reports', icon: <Flag className="h-3.5 w-3.5" /> },
  { key: 'duplicates', label: 'Duplicates', icon: <Copy className="h-3.5 w-3.5" /> },
  { key: 'analytics', label: 'Analytics', icon: <TrendingUp className="h-3.5 w-3.5" /> },
];

export default function AdminCertificates() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('verify');

  const [items, setItems] = useState<ListItem[]>([]);
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [clusters, setClusters] = useState<DuplicateCluster[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);

  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [listRes, reportsRes, dupesRes, analyticsRes] = await Promise.all([
        fetch('/api/certificates/list?limit=100&sort=recent'),
        fetch('/api/certificates/admin/reports?limit=100'),
        fetch('/api/certificates/admin/duplicates'),
        fetch('/api/certificates/admin/analytics'),
      ]);

      if (reportsRes.status === 401 || reportsRes.status === 403) {
        setError('Admin access required. Sign in with an administrator account.');
        return;
      }

      if (listRes.ok) {
        const json = await listRes.json();
        setItems(json?.data?.items || []);
      }
      if (reportsRes.ok) {
        const json = await reportsRes.json();
        setReports(json?.data?.items || []);
      }
      if (dupesRes.ok) {
        const json = await dupesRes.json();
        setClusters(json?.data?.clusters || []);
      }
      if (analyticsRes.ok) {
        const json = await analyticsRes.json();
        setAnalytics(json?.data || null);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load admin data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const verifyCert = useCallback(async (id: string, verify: boolean) => {
    setActing(id);
    try {
      const res = await fetch(`/api/certificates/${encodeURIComponent(id)}/${verify ? 'verify' : 'unverify'}`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || `Action failed (${res.status})`);
      }
      toast({ title: verify ? 'Certificate verified' : 'Verification removed' });
      await loadAll();
    } catch (err: any) {
      toast({ title: 'Action failed', description: err.message, variant: 'destructive' });
    } finally {
      setActing(null);
    }
  }, [loadAll, toast]);

  return (
    <div className="min-h-screen bg-black text-white" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
      <header className="sticky top-0 z-20 bg-black/90 backdrop-blur-md" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <AppNavBack href="/hub" eyebrow="Suite" label="Hub" variant="dark" size="compact" />
          <span className="text-[12px] text-[#636366] tracking-wide uppercase">Admin · Certificates</span>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-5 pt-10 pb-20">
        <div className="mb-6">
          <p className="text-[11px] tracking-[0.14em] uppercase text-[#818cf8] mb-2" style={{ fontFamily: "'Geist Mono', monospace" }}>
            Certificate Administration
          </p>
          <h1
            className="text-white tracking-tight"
            style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400, fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', lineHeight: 1.1 }}
          >
            Registry control panel
          </h1>
        </div>

        {error && (
          <div className="rounded-xl border border-[#2c2c2e] bg-[#1c1c1e] p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-[#f59e0b] shrink-0 mt-0.5" />
            <p className="text-[13px] text-white">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-1 mb-6 overflow-x-auto" style={{ borderBottom: '1px solid #1c1c1e' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] transition-colors whitespace-nowrap ${
                tab === t.key
                  ? 'text-white border-b-2 border-[#6366f1]'
                  : 'text-[#8e8e93] hover:text-white border-b-2 border-transparent'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="py-16 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#636366] mx-auto" />
          </div>
        )}

        {!loading && tab === 'verify' && (
          <div className="rounded-xl border border-[#1c1c1e] overflow-hidden">
            <div className="px-4 py-3 text-[12px] text-[#8e8e93] tracking-wide uppercase" style={{ borderBottom: '1px solid #1c1c1e' }}>
              {items.length} certificates · most recent first
            </div>
            {items.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-[#636366]">No certificates in the registry yet.</p>
            ) : (
              items.map((c) => (
                <div
                  key={c.name}
                  className="px-4 py-3 flex items-center gap-3"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {c.slug ? (
                        <Link href={`/certificates/${c.slug}`} className="text-[14px] text-white hover:text-[#a5b4fc] truncate">
                          {c.companyName}
                        </Link>
                      ) : (
                        <span className="text-[14px] text-white truncate">{c.companyName}</span>
                      )}
                      {c.verified && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide" style={{ color: '#22d3ee', background: 'rgba(34,211,238,0.12)' }}>
                          <ShieldCheck className="h-3 w-3" /> Verified
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#636366] mt-0.5 flex flex-wrap gap-x-3">
                      {c.vatNumber && <span><Hash className="inline h-3 w-3 mr-0.5" />{c.vatNumber}</span>}
                      {c.companySize && <span>{c.companySize}</span>}
                      {c.bbbeeLevel != null && <span>Level {c.bbbeeLevel}</span>}
                      {c.expiryDate && <span>Expires {fmtDate(c.expiryDate)}</span>}
                      <span>Updated {fmtDate(c.lastModified)}</span>
                    </div>
                  </div>
                  {c.id ? (
                    c.verified ? (
                      <button
                        onClick={() => verifyCert(c.id!, false)}
                        disabled={acting === c.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-[#a1a1aa] hover:text-white border border-[#2c2c2e] hover:bg-[#2c2c2e] disabled:opacity-40 transition-colors"
                      >
                        {acting === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
                        Unverify
                      </button>
                    ) : (
                      <button
                        onClick={() => verifyCert(c.id!, true)}
                        disabled={acting === c.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-40 transition-colors"
                      >
                        {acting === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        Verify
                      </button>
                    )
                  ) : (
                    <span className="text-[11px] text-[#636366]">no id</span>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {!loading && tab === 'reports' && (
          <div className="rounded-xl border border-[#1c1c1e] overflow-hidden">
            <div className="px-4 py-3 text-[12px] text-[#8e8e93] tracking-wide uppercase" style={{ borderBottom: '1px solid #1c1c1e' }}>
              {reports.length} reports
            </div>
            {reports.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-[#636366]">No reports submitted yet.</p>
            ) : (
              reports.map((r) => (
                <div key={r.id} className="px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide bg-[#2c2c2e] text-[#a1a1aa]">
                      {r.reason}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide" style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.12)' }}>
                      {r.status}
                    </span>
                    {r.certificateSlug && (
                      <Link href={`/certificates/${r.certificateSlug}`} className="text-[12px] text-[#a5b4fc] hover:text-white">
                        View certificate
                      </Link>
                    )}
                    <span className="text-[11px] text-[#636366] ml-auto">{fmtDateTime(r.createdAt)}</span>
                  </div>
                  <p className="text-[13px] text-white whitespace-pre-wrap">{r.message}</p>
                  {r.email && <p className="text-[11px] text-[#636366] mt-1">From: {r.email}</p>}
                </div>
              ))
            )}
          </div>
        )}

        {!loading && tab === 'duplicates' && (
          <div className="space-y-3">
            <div className="text-[12px] text-[#8e8e93] uppercase tracking-wide">
              {clusters.length} duplicate cluster{clusters.length === 1 ? '' : 's'} grouped by VAT number
            </div>
            {clusters.length === 0 && (
              <div className="py-12 text-center rounded-xl border border-[#1c1c1e]">
                <CheckCircle2 className="h-6 w-6 text-[#22c55e] mx-auto mb-2" />
                <p className="text-[13px] text-[#a1a1aa]">No duplicates detected.</p>
              </div>
            )}
            {clusters.map((cluster) => (
              <div key={cluster.vatNumber} className="rounded-xl border border-[#2c2c2e] bg-[#0d0d10] overflow-hidden">
                <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid #1c1c1e' }}>
                  <Hash className="h-3.5 w-3.5 text-[#636366]" />
                  <span className="text-[13px] text-white">VAT {cluster.vatNumber}</span>
                  <span className="ml-auto text-[11px] text-[#f59e0b]">{cluster.count} certificates</span>
                </div>
                {cluster.certificates.map((c, idx) => (
                  <div key={(c.id || c.slug || c.fileName) + idx} className="px-4 py-2.5 flex items-center gap-3" style={{ borderTop: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.04)' }}>
                    <div className="flex-1 min-w-0">
                      {c.slug ? (
                        <Link href={`/certificates/${c.slug}`} className="text-[13px] text-white hover:text-[#a5b4fc]">
                          {c.companyName}
                        </Link>
                      ) : (
                        <span className="text-[13px] text-white">{c.companyName}</span>
                      )}
                      <div className="text-[11px] text-[#636366]">
                        {c.fileName} · {c.expiryDate ? `expires ${fmtDate(c.expiryDate)}` : 'no expiry'} · updated {fmtDate(c.lastModified)}
                      </div>
                    </div>
                    {c.verified && <ShieldCheck className="h-3.5 w-3.5 text-[#22d3ee]" />}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {!loading && tab === 'analytics' && analytics && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {([
                ['Last 24 hours', analytics.totals.last24h],
                ['Last 7 days', analytics.totals.last7d],
                ['Last 30 days', analytics.totals.last30d],
                ['All time', analytics.totals.allTime],
              ] as const).map(([label, value]) => (
                <div key={label} className="rounded-lg p-4 bg-[#1c1c1e] border border-[#2c2c2e]">
                  <div className="text-[20px] text-white font-semibold">{value}</div>
                  <div className="text-[11px] text-[#8e8e93] uppercase tracking-wide mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-[#1c1c1e] p-4">
                <h3 className="text-[12px] text-[#8e8e93] uppercase tracking-wide mb-3">Events by type</h3>
                <div className="space-y-1.5">
                  {(['view', 'search', 'upload', 'download', 'verify', 'unverify', 'report'] as const).map((t) => {
                    const v = analytics.byType[t] || 0;
                    const ICON: Record<string, React.ReactNode> = {
                      view: <Eye className="h-3.5 w-3.5" />,
                      search: <SearchIcon className="h-3.5 w-3.5" />,
                      upload: <Upload className="h-3.5 w-3.5" />,
                      download: <Download className="h-3.5 w-3.5" />,
                      verify: <ShieldCheck className="h-3.5 w-3.5" />,
                      unverify: <ShieldOff className="h-3.5 w-3.5" />,
                      report: <Flag className="h-3.5 w-3.5" />,
                    };
                    return (
                      <div key={t} className="flex items-center gap-2 text-[13px]">
                        <span className="text-[#636366]">{ICON[t]}</span>
                        <span className="text-[#a1a1aa] capitalize flex-1">{t}</span>
                        <span className="text-white tabular-nums">{v}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-[#1c1c1e] p-4">
                <h3 className="text-[12px] text-[#8e8e93] uppercase tracking-wide mb-3">Top viewed certificates</h3>
                {analytics.topCertificates.length === 0 ? (
                  <p className="text-[13px] text-[#636366]">No view events yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {analytics.topCertificates.map((c) => (
                      <div key={c.certificateId} className="flex items-center gap-2 text-[13px]">
                        {c.certificateSlug ? (
                          <Link href={`/certificates/${c.certificateSlug}`} className="text-[#a5b4fc] hover:text-white truncate flex-1">
                            {c.certificateSlug}
                          </Link>
                        ) : (
                          <span className="text-[#a1a1aa] truncate flex-1">{c.certificateId}</span>
                        )}
                        <span className="text-white tabular-nums">{c.views}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-[#1c1c1e] p-4">
              <h3 className="text-[12px] text-[#8e8e93] uppercase tracking-wide mb-3">Top search queries</h3>
              {analytics.topQueries.length === 0 ? (
                <p className="text-[13px] text-[#636366]">No search queries recorded yet.</p>
              ) : (
                <div className="space-y-1.5">
                  {analytics.topQueries.map((q) => (
                    <div key={q.query} className="flex items-center gap-2 text-[13px]">
                      <SearchIcon className="h-3.5 w-3.5 text-[#636366]" />
                      <span className="text-[#a1a1aa] flex-1 truncate">{q.query}</span>
                      <span className="text-white tabular-nums">{q.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[#1c1c1e] p-4">
              <h3 className="text-[12px] text-[#8e8e93] uppercase tracking-wide mb-3">Recent activity</h3>
              {analytics.recent.length === 0 ? (
                <p className="text-[13px] text-[#636366]">No activity yet.</p>
              ) : (
                <div className="space-y-1">
                  {analytics.recent.slice(0, 30).map((e) => (
                    <div key={e.id} className="flex items-center gap-2 text-[12px] text-[#a1a1aa]">
                      <span className="text-[#636366] tabular-nums w-32 shrink-0">{fmtDateTime(e.createdAt)}</span>
                      <span className="text-white capitalize w-20 shrink-0">{e.type}</span>
                      <span className="truncate text-[#8e8e93]">
                        {e.certificateSlug || e.query || ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
