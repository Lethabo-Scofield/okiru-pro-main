import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@toolkit/lib/auth';
import {
  Download, Loader2, AlertCircle, Search, X, ChevronDown,
  RefreshCw, ShieldCheck, Clock, AlertTriangle, Award,
  Upload, CheckCircle2, XCircle, FileUp, FileText, TrendingUp,
  Building2, Hash, Users2, Percent, CalendarClock, Eye, ExternalLink,
} from 'lucide-react';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import { AppNavBack } from '@/components/AppNavBack';
import { UserAccountMenu } from '@/components/UserAccountMenu';
import { gatedAuthPath } from '@/lib/authRoutes';
import {
  CertificateUploadForm,
  certificateFormToFormData,
  type CertificateFormValues,
} from '@/components/certificates/CertificateUploadForm';
import { OKIRU_HUB_SECTORS, sectorDisplayLabel } from '@/lib/okiruHubSectors';

const COMPANY_SIZES = ['EME', 'QSE', 'Generic', 'Large', 'Specialised'] as const;

interface CertificateRow {
  name: string;
  fileName: string;
  companyName: string;
  vatNumber: string | null;
  companySize: string | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  bbbeeLevel: number | null;
  certificateNumber?: string | null;
  expiryDate: string | null;
  status: 'valid' | 'expiring' | 'expired' | 'unknown';
  lastModified: string | null;
  id?: string | null;
  slug?: string | null;
  verified?: boolean;
  metadataComplete?: boolean;
  sectorCode?: string | null;
  sectorName?: string | null;
  location?: string | null;
  businessUnit?: string | null;
}

function certificateHaystack(c: CertificateRow): string {
  return `
    ${c.companyName || ''}
    ${c.vatNumber || ''}
    ${c.fileName || ''}
    ${c.bbbeeLevel ?? ''}
    ${c.certificateNumber || ''}
    ${c.sectorCode || ''}
    ${c.sectorName || ''}
    ${c.location || ''}
    ${c.businessUnit || ''}
  `.toLowerCase();
}

interface CertStats {
  total: number;
  valid: number;
  expiring: number;
  expired: number;
  unknown: number;
  avgLevel?: number | null;
  avgBlackOwnership?: number | null;
  recentUploads7d?: number;
  recentUploads30d?: number;
  extractionAvailable?: boolean;
}

/** Backend returns a bare array for GET /list with no limit/offset; with ?limit= it returns `{ success, data: { items, ... } }`. */
function parseCertificateListJson(json: unknown): CertificateRow[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const data = o.data;
    if (data && typeof data === 'object' && Array.isArray((data as { items?: unknown }).items)) {
      return (data as { items: CertificateRow[] }).items;
    }
    if (Array.isArray(o.items)) return o.items as CertificateRow[];
  }
  return [];
}

function parseCertStatsJson(json: unknown): CertStats | null {
  if (!json || typeof json !== 'object') return null;
  const o = json as Record<string, unknown>;
  if (
    o.success === true
    && o.data != null
    && typeof o.data === 'object'
    && typeof (o.data as CertStats).total === 'number'
  ) {
    return o.data as CertStats;
  }
  if (typeof o.total === 'number') return o as unknown as CertStats;
  return null;
}

function formatExpiry(dateStr: string | null): string {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatPct(n: number | null): string {
  if (n == null) return '-';
  return `${n.toFixed(n < 10 ? 1 : 0)}%`;
}

function StatusBadge({ status, expiryDate }: { status: CertificateRow['status']; expiryDate: string | null }) {
  const map = {
    valid:    { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', label: 'Valid' },
    expiring: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Expiring' },
    expired:  { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Expired' },
    unknown:  { color: '#8e8e93', bg: 'rgba(142,142,147,0.12)', label: 'Unknown' },
  } as const;
  const cfg = map[status];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase"
      style={{ color: cfg.color, background: cfg.bg }}
      title={expiryDate ? `Expires ${formatExpiry(expiryDate)}` : 'No expiry on record'}
    >
      {cfg.label}
    </span>
  );
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-purple-500/30 text-purple-200 rounded-sm px-0.5">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function FilterPill({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = value !== '';
  const current = options.find(o => o.value === value);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] transition-colors ${
          active
            ? 'bg-white text-black'
            : 'bg-[#1c1c1e] text-[#8e8e93] hover:text-white border border-[#2c2c2e]'
        }`}
      >
        {active && current ? current.label : label}
        {active ? (
          <X
            className="h-3 w-3 ml-0.5"
            onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }}
          />
        ) : (
          <ChevronDown className="h-3 w-3" />
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 z-40 bg-[#1c1c1e] border border-[#2c2c2e] rounded-lg overflow-hidden min-w-[160px] shadow-xl">
            {options.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-[13px] transition-colors ${
                  value === opt.value
                    ? 'bg-[#2c2c2e] text-white'
                    : 'text-[#8e8e93] hover:bg-[#2c2c2e] hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  title, value, subtitle, iconColor, icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  iconColor: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-4 py-3 bg-[#1c1c1e] border border-[#2c2c2e]">
      <div
        className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-white/[0.04]"
        style={{ color: iconColor }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[20px] font-semibold text-white leading-tight">{value}</div>
        <div className="text-[11px] text-[#8e8e93] truncate font-medium">{title}</div>
        {subtitle && (
          <div className="text-[10px] text-[#636366] truncate mt-0.5">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="py-4 px-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="space-y-2 flex-1">
        <div className="h-3.5 w-56 rounded bg-white/[0.06] animate-pulse" />
        <div className="h-2.5 w-40 rounded bg-white/[0.04] animate-pulse" />
      </div>
      <div className="h-8 w-20 rounded-lg bg-white/[0.04] animate-pulse" />
    </div>
  );
}

const OWNERSHIP_RANGES = [
  { value: '', label: 'Any ownership' },
  { value: '0-25', label: '0–25% black ownership' },
  { value: '25-50', label: '25–50% black ownership' },
  { value: '50-75', label: '50–75% black ownership' },
  { value: '75-100', label: '75–100% black ownership' },
];

export default function CertificateHub() {
  const { toast } = useToast();
  const { user, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const [allCerts, setAllCerts] = useState<CertificateRow[]>([]);
  const [allCertsLoading, setAllCertsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CertStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [sectorFilter, setSectorFilter] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState('');

  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [previewCert, setPreviewCert] = useState<CertificateRow | null>(null);

  // Upload modal state
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Auto-open upload modal when arriving with ?openUpload=1 (e.g. after onboarding)
  useEffect(() => {
    if (authLoading) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('openUpload') === '1' && user) {
      setShowUpload(true);
      params.delete('openUpload');
      const qs = params.toString();
      const cleanUrl = window.location.pathname + (qs ? `?${qs}` : '');
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [user, authLoading]);

  const loadAllCerts = useCallback(async () => {
    setAllCertsLoading(true);
    try {
      const res = await fetch('/api/certificates/list');
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const raw = await res.json();
      setAllCerts(parseCertificateListJson(raw));
    } catch (err: any) {
      toast({ title: 'Could not load certificates', description: err.message || 'Try refreshing', variant: 'destructive' });
    } finally {
      setAllCertsLoading(false);
    }
  }, [toast]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/certificates/stats');
      if (res.ok) {
        const raw = await res.json();
        const next = parseCertStatsJson(raw);
        if (next) setStats(next);
      }
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadAllCerts(), loadStats()]);
      setLoading(false);
    })();
  }, [loadAllCerts, loadStats]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadAllCerts(), loadStats()]);
    setRefreshing(false);
  }, [loadAllCerts, loadStats]);

  const hasActiveFilters = !!(search.trim() || statusFilter || sizeFilter || sectorFilter || ownershipFilter);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = allCerts.filter(c => {
      if (q) {
        if (!certificateHaystack(c).includes(q)) return false;
      }
      if (statusFilter && c.status !== statusFilter) return false;
      if (sizeFilter && (c.companySize || '').toLowerCase() !== sizeFilter.toLowerCase()) return false;
      if (sectorFilter && (c.sectorCode || '').toUpperCase() !== sectorFilter.toUpperCase()) return false;
      if (ownershipFilter) {
        const [minStr, maxStr] = ownershipFilter.split('-');
        const min = Number(minStr), max = Number(maxStr);
        if (c.blackOwnership == null) return false;
        if (c.blackOwnership < min || c.blackOwnership > max) return false;
      }
      return true;
    });
    // Verified-first sort, then most-recently uploaded.
    return out.sort((a, b) => {
      const av = !!a.verified, bv = !!b.verified;
      if (av !== bv) return av ? -1 : 1;
      return (b.lastModified || '').localeCompare(a.lastModified || '');
    });
  }, [allCerts, search, statusFilter, sizeFilter, sectorFilter, ownershipFilter]);

  const clearAllFilters = () => {
    setSearch('');
    setStatusFilter('');
    setSizeFilter('');
    setSectorFilter('');
    setOwnershipFilter('');
  };

  const requireLoginToUpload = useCallback(() => {
    if (user) {
      setShowUpload(true);
      return;
    }
    navigate(gatedAuthPath({ mode: 'register', redirect: '/certificates' }));
  }, [user, navigate]);

  const submitUpload = useCallback(async (file: File, values: CertificateFormValues) => {
    const fd = certificateFormToFormData(file, values);
    setUploading(true);
    try {
      const res = await fetch('/api/certificates/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({ message: 'Upload failed' }));
      if (!res.ok) {
        if (res.status === 401) {
          toast({ title: 'Sign in required', description: 'Please sign in to upload certificates.', variant: 'destructive' });
          navigate(gatedAuthPath({ mode: 'register', redirect: '/certificates' }));
          return;
        }
        throw new Error(data.message || `Upload failed (${res.status})`);
      }
      toast({ title: 'Certificate uploaded', description: `${values.supplierName} added to the public registry.` });
      setShowUpload(false);
      await Promise.all([loadAllCerts(), loadStats()]);
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message || 'Please try again', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [toast, loadAllCerts, loadStats, navigate]);

  const downloadCertificate = useCallback(async (blobName: string) => {
    setDownloadingFile(blobName);
    try {
      const res = await fetch(`/api/certificates/download?file=${encodeURIComponent(blobName)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Download failed' }));
        throw new Error(body.message || `Error ${res.status}`);
      }
      const { url } = await res.json();
      if (!url) throw new Error('No download URL returned');
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message || 'Could not generate link', variant: 'destructive' });
    } finally {
      setDownloadingFile(null);
    }
  }, [toast]);

  const headlineCount = stats?.total ?? allCerts.length;
  const isAuthenticated = !!user && !authLoading;

  return (
    <div className="h-screen overflow-y-auto bg-black text-white" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>

      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-black/90 backdrop-blur-md" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {isAuthenticated ? (
            <AppNavBack href="/" label="Home" variant="dark" size="compact" />
          ) : (
            <Link
              href="/"
              className="flex items-center gap-2"
              style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontSize: 20, color: '#fff' }}
            >
              Okiru
            </Link>
          )}
          <span className="hidden sm:inline text-[12px] text-[#636366] tracking-wide uppercase">B-BBEE Certificate Registry</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1 text-[13px] text-[#8e8e93] hover:text-white transition-colors disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            {isAuthenticated && (
              <UserAccountMenu variant="certificate" />
            )}
            {isAuthenticated ? (
              <button
                onClick={requireLoginToUpload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white bg-[#6366f1] hover:bg-[#4f46e5] transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                Upload
              </button>
            ) : (
              <>
                <Link
                  href={gatedAuthPath({ redirect: '/certificates' })}
                  className="text-[13px] text-[#8e8e93] hover:text-white transition-colors px-3 py-1.5"
                >
                  Sign in
                </Link>
                <Link
                  href={gatedAuthPath({ mode: 'register', redirect: '/certificates' })}
                  className="inline-flex items-center px-3 py-1.5 rounded-lg text-[12px] text-white bg-[#6366f1] hover:bg-[#4f46e5] transition-colors"
                >
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-5 pt-10 pb-20">

        {/* ─── Hero ───────────────────────────────────────────── */}
        <div className="mb-8">
          <p className="text-[11px] tracking-[0.14em] uppercase text-[#818cf8] mb-3" style={{ fontFamily: "'Geist Mono', monospace" }}>
            Public B-BBEE Certificate Registry · South Africa
          </p>
          <h1
            className="text-white tracking-tight"
            style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400, fontSize: 'clamp(2.2rem, 5vw, 3.4rem)', lineHeight: 1.05 }}
          >
            {loading ? '…' : headlineCount.toLocaleString()} B-BBEE certificates
            <br />
            <em style={{ color: '#a5b4fc' }}>available to the public.</em>
          </h1>
          <p className="mt-4 text-[14px] text-[#a1a1aa] max-w-[640px] leading-relaxed">
            Search and verify South African B-BBEE compliance certificates. Filter by company size, ownership, and validity. Anyone can browse - sign in to add your own certificate to the registry.
          </p>
        </div>

        {/* ─── Hero search (primary CTA) ───────────────────── */}
        <div className="relative mb-8">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#636366]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by company name, VAT number, or B-BBEE level…"
            className="w-full bg-[#1c1c1e] rounded-xl pl-12 pr-12 py-4 text-[16px] text-white placeholder:text-[#48484a] outline-none border border-[#2c2c2e] focus:border-[#6366f1] transition-colors shadow-sm"
            autoComplete="off"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#48484a] hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* ─── KPIs ───────────────────────────────────────────── */}
        {!loading && stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <KpiCard
              title="Total certificates"
              value={String(stats.total)}
              subtitle="across the registry"
              iconColor="#818cf8"
              icon={<FileText className="h-4 w-4" />}
            />
            <KpiCard
              title="Valid"
              value={String(stats.valid)}
              subtitle={stats.total > 0 ? `${Math.round((stats.valid / stats.total) * 100)}% of registry` : 'in date'}
              iconColor="#22c55e"
              icon={<ShieldCheck className="h-4 w-4" />}
            />
            <KpiCard
              title="Expiring soon"
              value={String(stats.expiring)}
              subtitle="within 60 days"
              iconColor="#f59e0b"
              icon={<Clock className="h-4 w-4" />}
            />
            <KpiCard
              title="Recent uploads"
              value={String(stats.recentUploads30d ?? 0)}
              subtitle="in last 30 days"
              iconColor="#06b6d4"
              icon={<TrendingUp className="h-4 w-4" />}
            />
          </div>
        )}

        {/* ─── Filters ────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mb-6 flex-wrap">
          <FilterPill
            label="Validity"
            value={statusFilter}
            options={[
              { value: 'valid', label: 'Valid' },
              { value: 'expiring', label: 'Expiring soon' },
              { value: 'expired', label: 'Expired' },
              { value: 'unknown', label: 'No expiry on record' },
            ]}
            onChange={setStatusFilter}
          />
          <FilterPill
            label="Company size"
            value={sizeFilter}
            options={COMPANY_SIZES.map(s => ({ value: s, label: s }))}
            onChange={setSizeFilter}
          />
          <FilterPill
            label="Sector"
            value={sectorFilter}
            options={OKIRU_HUB_SECTORS.map(s => ({ value: s.code, label: s.code }))}
            onChange={setSectorFilter}
          />
          <FilterPill
            label="Black ownership"
            value={ownershipFilter}
            options={OWNERSHIP_RANGES.filter(o => o.value).map(o => ({ value: o.value, label: o.label }))}
            onChange={setOwnershipFilter}
          />
          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="text-[12px] text-[#636366] hover:text-white transition-colors ml-1"
            >
              Clear all
            </button>
          )}
        </div>

        {/* ─── List ──────────────────────────────────────────── */}

        {/* Stats bar + section header */}
        {!loading && (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-[15px] font-semibold text-white mb-0.5 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#22d3ee]" />
                {hasActiveFilters ? 'Search results' : 'All certificates'}
              </h2>
              {hasActiveFilters ? (
                <p className="text-[13px] text-[#8e8e93]">
                  {allCertsLoading
                    ? 'Loading…'
                    : `${filtered.length.toLocaleString()} result${filtered.length !== 1 ? 's' : ''}${search.trim() ? ` for "${search.trim()}"` : ''}`
                  }
                </p>
              ) : stats ? (
                <p className="text-[12px] text-[#636366]">
                  <span className="text-[#a1a1aa]">{filtered.length.toLocaleString()} shown</span>
                  {stats.total > filtered.length && (
                    <> · <span className="text-[#a1a1aa]">{stats.total.toLocaleString()} total in registry</span></>
                  )}
                  {' · '}
                  <span className="text-[#22c55e]">{stats.valid} valid</span>
                  {' · '}
                  <span className="text-[#f59e0b]">{stats.expiring} expiring soon</span>
                </p>
              ) : (
                <p className="text-[12px] text-[#636366]">{filtered.length.toLocaleString()} certificates</p>
              )}
            </div>

            {/* "Add Your Certificate" inline CTA */}
            {!hasActiveFilters && (
              <button
                onClick={requireLoginToUpload}
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium text-white border border-[#6366f1]/50 hover:bg-[#6366f1]/10 transition-colors"
              >
                <Upload className="h-3.5 w-3.5 text-[#a5b4fc]" />
                Add Your Certificate
              </button>
            )}
          </div>
        )}

        {(loading || allCertsLoading) ? (
          <div className="rounded-xl overflow-hidden border border-[#1c1c1e]">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            hasCertificates={allCerts.length > 0}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={clearAllFilters}
            onUpload={requireLoginToUpload}
            isAuthenticated={isAuthenticated}
          />
        ) : (
          <div className="rounded-xl overflow-hidden border border-[#1c1c1e] bg-[#0d0d10]">
            <div className="hidden md:grid grid-cols-[minmax(240px,2.2fr)_minmax(110px,1fr)_minmax(72px,0.55fr)_minmax(86px,0.7fr)_minmax(150px,1.15fr)_minmax(150px,1fr)] items-center gap-4 px-4 py-2.5 text-[10px] uppercase tracking-wider text-[#636366]" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div>Company / sector</div>
              <div>VAT number</div>
              <div>Level</div>
              <div>Size</div>
              <div>Ownership</div>
              <div>Expiry</div>
            </div>
            {filtered.map((cert, idx) => (
              <CertRow
                key={cert.id || cert.name}
                cert={cert}
                searchQuery={search}
                isLast={idx === filtered.length - 1}
                isDownloading={downloadingFile === cert.name}
                onDownload={() => downloadCertificate(cert.name)}
                onPreview={() => setPreviewCert(cert)}
              />
            ))}
          </div>
        )}

      </main>

      {/* ─── Certificate Preview modal ──────────────────────── */}
      {previewCert && (
        <CertPreviewModal cert={previewCert} onClose={() => setPreviewCert(null)} />
      )}

      {/* ─── Upload modal ───────────────────────────────────── */}
      {showUpload && isAuthenticated && (
        <CertificateUploadForm
          uploading={uploading}
          onClose={() => setShowUpload(false)}
          onSubmit={submitUpload}
        />
      )}
    </div>
  );
}

function CertRow({
  cert, searchQuery, isLast, isDownloading, onDownload, onPreview,
}: {
  cert: CertificateRow;
  searchQuery: string;
  isLast: boolean;
  isDownloading: boolean;
  onDownload: () => void;
  onPreview: () => void;
}) {
  return (
    <div
      className="px-4 py-3.5 hover:bg-[#16161b] transition-colors"
      style={{ borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)' }}
    >
      <div className="md:grid md:grid-cols-[minmax(240px,2.2fr)_minmax(110px,1fr)_minmax(72px,0.55fr)_minmax(86px,0.7fr)_minmax(150px,1.15fr)_minmax(150px,1fr)] md:items-start md:gap-4">
        <div className="min-w-0">
        <div className="text-[14px] text-white font-medium leading-snug flex items-center gap-1.5 flex-wrap">
          {cert.slug ? (
            <Link
              href={`/certificates/${cert.slug}`}
              className="text-white hover:text-[#a5b4fc] transition-colors"
            >
              <HighlightMatch text={cert.companyName} query={searchQuery} />
            </Link>
          ) : (
            <HighlightMatch text={cert.companyName} query={searchQuery} />
          )}
          {cert.metadataComplete === false && (
            <span
              title="File is in storage but certificate metadata has not been linked yet"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase"
              style={{ color: '#f59e0b', background: 'rgba(245,158,11,0.12)' }}
            >
              Metadata missing
            </span>
          )}
          {cert.verified && (
            <span
              title="Verified by an administrator"
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium tracking-wide uppercase"
              style={{ color: '#22d3ee', background: 'rgba(34,211,238,0.12)' }}
            >
              <ShieldCheck className="h-3 w-3" />
              Verified
            </span>
          )}
        </div>
        <div
          className="mt-1 flex items-start gap-1.5 text-[12px] leading-snug text-[#8e8e93]"
          title={sectorDisplayLabel(cert.sectorCode, cert.sectorName)}
        >
          <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#636366]" />
          <span className="min-w-0 truncate">
            {cert.sectorCode ? sectorDisplayLabel(cert.sectorCode, cert.sectorName) : 'Sector not captured'}
          </span>
        </div>
        <div className="md:hidden text-[11px] text-[#636366] mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {cert.vatNumber && <span><Hash className="inline h-3 w-3 mr-0.5" /> {cert.vatNumber}</span>}
          {cert.bbbeeLevel != null && <span><Award className="inline h-3 w-3 mr-0.5" /> Level {cert.bbbeeLevel}</span>}
          {cert.companySize && <span><Building2 className="inline h-3 w-3 mr-0.5" /> {cert.companySize}</span>}
          {cert.blackOwnership != null && <span><Percent className="inline h-3 w-3 mr-0.5" /> {formatPct(cert.blackOwnership)} black</span>}
          {cert.expiryDate && <span><CalendarClock className="inline h-3 w-3 mr-0.5" /> {formatExpiry(cert.expiryDate)}</span>}
        </div>
        <div className="md:hidden mt-1.5"><StatusBadge status={cert.status} expiryDate={cert.expiryDate} /></div>
      </div>

      <div className="hidden md:block text-[13px] text-[#a1a1aa] truncate">
        {cert.vatNumber ? <HighlightMatch text={cert.vatNumber} query={searchQuery} /> : <span className="text-[#48484a]">—</span>}
      </div>
      <div className="hidden md:block text-[13px] text-[#a1a1aa]">
        {cert.bbbeeLevel != null ? (
          <span className="text-white">Level {cert.bbbeeLevel}</span>
        ) : (
          <span className="text-[#48484a]">—</span>
        )}
      </div>
      <div className="hidden md:block text-[13px] text-[#a1a1aa]">
        {cert.companySize || <span className="text-[#48484a]">—</span>}
      </div>
      <div className="hidden md:block text-[13px] text-[#a1a1aa]">
        {cert.blackOwnership != null ? (
          <span className="inline-flex flex-col gap-0.5">
            <span className="text-white">{formatPct(cert.blackOwnership)}</span>
            {cert.blackWomenOwnership != null && (
              <span className="text-[#636366] text-[11px]">· {formatPct(cert.blackWomenOwnership)} women</span>
            )}
          </span>
        ) : (
          <span className="text-[#48484a]">-</span>
        )}
      </div>
      <div className="hidden md:flex flex-col items-start gap-1 text-[13px] text-[#a1a1aa]">
        <span>{formatExpiry(cert.expiryDate)}</span>
        <StatusBadge status={cert.status} expiryDate={cert.expiryDate} />
      </div>
      </div>
      <div className="hidden md:flex items-center justify-end gap-2 mt-3">
        <button
          onClick={onPreview}
          aria-label={`Preview ${cert.companyName}`}
          className="inline-flex min-w-[92px] items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[#8e8e93] hover:text-white hover:bg-[#2c2c2e] transition-colors text-[12px]"
        >
          <Eye className="h-4 w-4" />
          <span>Preview</span>
        </button>
        <button
          onClick={onDownload}
          disabled={isDownloading}
          aria-label={`Download ${cert.fileName}`}
          className="inline-flex min-w-[104px] items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[#8e8e93] hover:text-white hover:bg-[#2c2c2e] disabled:opacity-30 transition-colors text-[12px]"
        >
          {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span>Download</span>
        </button>
      </div>

      {/* Mobile action buttons */}
      <div className="md:hidden mt-3 flex items-center gap-2">
        <button
          onClick={onPreview}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
        <button
          onClick={onDownload}
          disabled={isDownloading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-30 transition-colors"
        >
          {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
          Download
        </button>
      </div>
    </div>
  );
}

function certPreviewKind(fileName: string): 'pdf' | 'image' | 'other' {
  if (/\.pdf$/i.test(fileName)) return 'pdf';
  if (/\.(png|jpe?g|gif|webp)$/i.test(fileName)) return 'image';
  return 'other';
}

function CertPreviewModal({ cert, onClose }: { cert: CertificateRow; onClose: () => void }) {
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [docError, setDocError] = useState<string | null>(null);

  const displayName = cert.fileName || cert.name;
  const kind = certPreviewKind(displayName);

  useEffect(() => {
    let cancelled = false;
    setLoadingDoc(true);
    setDocError(null);
    setDocUrl(null);

    (async () => {
      try {
        // disposition=inline → the SAS URL renders in the iframe/<img> instead of
        // forcing a download. The Download button omits it and keeps `attachment`.
        const res = await fetch(`/api/certificates/download?file=${encodeURIComponent(cert.name)}&disposition=inline`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({ message: 'Could not load document' }));
          throw new Error(body.message || `Error ${res.status}`);
        }
        const { url } = await res.json();
        if (!url) throw new Error('No preview URL returned');
        if (!cancelled) setDocUrl(url);
      } catch (err: unknown) {
        if (!cancelled) {
          setDocError(err instanceof Error ? err.message : 'Could not load document');
        }
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    })();

    return () => { cancelled = true; };
  }, [cert.name]);

  const statusMap = {
    valid:    { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', label: 'Valid' },
    expiring: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Expiring Soon' },
    expired:  { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Expired' },
    unknown:  { color: '#8e8e93', bg: 'rgba(142,142,147,0.12)', label: 'Unknown' },
  } as const;
  const s = statusMap[cert.status];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] rounded-2xl bg-[#1c1c1e] border border-[#2c2c2e] shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-4 w-4 text-[#a5b4fc] shrink-0" />
            <h2 className="text-[15px] font-semibold text-white truncate">{cert.companyName}</h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {docUrl && (
              <a
                href={docUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[12px] font-medium text-[#5e9bff] hover:underline"
              >
                Open <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button onClick={onClose} className="text-[#636366] hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col min-h-[240px] lg:min-h-0 lg:w-1/2 shrink-0 bg-[#0d0d0d] border-b lg:border-b-0 lg:border-r border-[#2c2c2e]">
            <div className="px-4 py-2.5 flex items-center gap-2 shrink-0 border-b border-[#2c2c2e]">
              <FileText className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm font-medium text-white truncate">{displayName}</span>
            </div>
            <div className="flex-1 min-h-[280px] flex flex-col">
              {loadingDoc && (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[#636366]" />
                </div>
              )}
              {!loadingDoc && docError && (
                <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-[#8e8e93]">
                  {docError}
                </div>
              )}
              {!loadingDoc && !docError && docUrl && kind === 'pdf' && (
                <iframe title={displayName} src={docUrl} className="w-full flex-1 min-h-[320px] bg-[#111]" />
              )}
              {!loadingDoc && !docError && docUrl && kind === 'image' && (
                <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
                  <img src={docUrl} alt={displayName} className="max-w-full max-h-full object-contain" />
                </div>
              )}
              {!loadingDoc && !docError && docUrl && kind === 'other' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[#8e8e93]">
                  <p>Inline preview isn&apos;t available for this file type.</p>
                  <a href={docUrl} target="_blank" rel="noreferrer" className="text-[#5e9bff] font-medium hover:underline">
                    Open or download file
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] text-[#636366] uppercase tracking-wider mb-1">Status</p>
                <span
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium tracking-wide uppercase"
                  style={{ color: s.color, background: s.bg }}
                >
                  {cert.status === 'valid' && <ShieldCheck className="h-3 w-3" />}
                  {cert.status === 'expiring' && <Clock className="h-3 w-3" />}
                  {cert.status === 'expired' && <AlertTriangle className="h-3 w-3" />}
                  {s.label}
                </span>
              </div>
              {cert.verified && (
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium"
                  style={{ color: '#22d3ee', background: 'rgba(34,211,238,0.1)' }}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Verified
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <PreviewField label="Sector" value={sectorDisplayLabel(cert.sectorCode, cert.sectorName)} icon={<Building2 className="h-3.5 w-3.5" />} />
              <PreviewField label="VAT Number" value={cert.vatNumber ?? '-'} icon={<Hash className="h-3.5 w-3.5" />} />
              <PreviewField label="Company Size" value={cert.companySize ?? '-'} icon={<Building2 className="h-3.5 w-3.5" />} />
              <PreviewField
                label="B-BBEE Level"
                value={cert.bbbeeLevel != null ? `Level ${cert.bbbeeLevel}` : '-'}
                icon={<Award className="h-3.5 w-3.5" />}
              />
              <PreviewField
                label="Expiry Date"
                value={formatExpiry(cert.expiryDate)}
                icon={<CalendarClock className="h-3.5 w-3.5" />}
              />
              <PreviewField
                label="Black Ownership"
                value={formatPct(cert.blackOwnership)}
                icon={<Percent className="h-3.5 w-3.5" />}
              />
              <PreviewField
                label="Black Women Ownership"
                value={formatPct(cert.blackWomenOwnership)}
                icon={<Users2 className="h-3.5 w-3.5" />}
              />
            </div>

            {cert.slug && (
              <Link
                href={`/certificates/${cert.slug}`}
                className="inline-flex items-center gap-1.5 text-[12px] text-[#a5b4fc] hover:text-white hover:underline"
              >
                View public certificate page
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewField({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-[#0d0d10] border border-[#2c2c2e] px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] text-[#636366] uppercase tracking-wider mb-1">
        {icon}
        {label}
      </div>
      <div className="text-[13px] text-white font-medium truncate">{value}</div>
    </div>
  );
}

function EmptyState({
  hasCertificates, hasActiveFilters, onClearFilters, onUpload, isAuthenticated,
}: {
  hasCertificates: boolean;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
  onUpload: () => void;
  isAuthenticated: boolean;
}) {
  if (hasCertificates && hasActiveFilters) {
    return (
      <div className="py-16 text-center rounded-xl border border-[#1c1c1e]">
        <AlertCircle className="w-6 h-6 text-[#3a3a3c] mx-auto mb-3" />
        <p className="text-[14px] text-[#8e8e93] mb-2">No certificates match your filters</p>
        <button onClick={onClearFilters} className="text-[13px] text-[#a5b4fc] hover:text-white transition-colors">
          Clear all filters
        </button>
      </div>
    );
  }
  return (
    <div className="py-16 text-center rounded-xl border border-[#1c1c1e]">
      <img src={logoCircle} alt="" className="h-12 w-12 mx-auto mb-3 opacity-40" />
      <p className="text-[14px] text-[#a1a1aa] mb-1">The registry is empty for now</p>
      <p className="text-[12px] text-[#636366] mb-4">Be the first to add a B-BBEE certificate.</p>
      <button
        onClick={onUpload}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-white bg-[#6366f1] hover:bg-[#4f46e5] transition-colors"
      >
        <Upload className="h-3.5 w-3.5" />
        {isAuthenticated ? 'Upload the first certificate' : 'Sign in to upload'}
      </button>
    </div>
  );
}
