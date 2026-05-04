import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@toolkit/lib/auth';
import {
  ArrowLeft, Download, Loader2, AlertCircle, Search, X, ChevronDown,
  RefreshCw, ShieldCheck, Clock, AlertTriangle, Award,
  Upload, CloudUpload, CheckCircle2, XCircle, FileUp, FileText, TrendingUp,
  Building2, Hash, Users2, Percent, CalendarClock, Info,
} from 'lucide-react';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';

const COMPANY_SIZES = ['EME', 'QSE', 'Generic', 'Large', 'Specialised'] as const;
type CompanySize = typeof COMPANY_SIZES[number];

interface CertificateRow {
  name: string;
  fileName: string;
  companyName: string;
  vatNumber: string | null;
  companySize: string | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  bbbeeLevel: number | null;
  expiryDate: string | null;
  status: 'valid' | 'expiring' | 'expired' | 'unknown';
  lastModified: string | null;
  // Phase 2 — public visibility
  id?: string | null;
  slug?: string | null;
  verified?: boolean;
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

function formatExpiry(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatPct(n: number | null): string {
  if (n == null) return '—';
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

  const [certificates, setCertificates] = useState<CertificateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<CertStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sizeFilter, setSizeFilter] = useState('');
  const [ownershipFilter, setOwnershipFilter] = useState('');

  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

  // Upload modal state
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const [form, setForm] = useState({
    companyName: '',
    vatNumber: '',
    companySize: '' as CompanySize | '',
    blackOwnership: '',
    blackWomenOwnership: '',
    expiryDate: '',
  });

  const loadCertificates = useCallback(async () => {
    try {
      const res = await fetch('/api/certificates/list');
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data: CertificateRow[] = await res.json();
      setCertificates(data);
    } catch (err: any) {
      toast({ title: 'Could not load certificates', description: err.message || 'Try refreshing', variant: 'destructive' });
    }
  }, [toast]);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch('/api/certificates/stats');
      if (res.ok) setStats(await res.json());
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadCertificates(), loadStats()]);
      setLoading(false);
    })();
  }, [loadCertificates, loadStats]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadCertificates(), loadStats()]);
    setRefreshing(false);
  }, [loadCertificates, loadStats]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = certificates.filter(c => {
      if (q) {
        const hay = `${c.companyName} ${c.vatNumber || ''} ${c.fileName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter && c.status !== statusFilter) return false;
      if (sizeFilter && (c.companySize || '').toLowerCase() !== sizeFilter.toLowerCase()) return false;
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
  }, [certificates, search, statusFilter, sizeFilter, ownershipFilter]);

  const hasActiveFilters = search.trim() || statusFilter || sizeFilter || ownershipFilter;

  const clearAllFilters = () => {
    setSearch('');
    setStatusFilter('');
    setSizeFilter('');
    setOwnershipFilter('');
  };

  const requireLoginToUpload = useCallback(() => {
    if (user) {
      setShowUpload(true);
      return;
    }
    navigate('/auth?mode=register&redirect=' + encodeURIComponent('/certificates'));
  }, [user, navigate]);

  const handleFileSelected = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    const f = arr[0];
    if (f.size > 50 * 1024 * 1024) {
      toast({ title: 'File too large', description: `${f.name} exceeds 50MB`, variant: 'destructive' });
      return;
    }
    setUploadFile(f);
    if (!form.companyName) {
      const guess = f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[_\-]+/g, ' ').trim();
      setForm(prev => ({ ...prev, companyName: guess.slice(0, 80) }));
    }
  }, [form.companyName, toast]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFileSelected(e.dataTransfer.files);
  }, [handleFileSelected]);

  const closeUploadModal = useCallback(() => {
    if (uploading) return;
    setShowUpload(false);
    setUploadFile(null);
    setForm({
      companyName: '', vatNumber: '', companySize: '',
      blackOwnership: '', blackWomenOwnership: '', expiryDate: '',
    });
    setDragOver(false);
  }, [uploading]);

  const submitUpload = useCallback(async () => {
    if (!uploadFile) {
      toast({ title: 'Select a file', description: 'Add a certificate file before uploading.', variant: 'destructive' });
      return;
    }
    if (!form.companyName.trim()) {
      toast({ title: 'Company name required', description: 'Tell us which company this certificate belongs to.', variant: 'destructive' });
      return;
    }
    const fd = new FormData();
    fd.append('files', uploadFile);
    fd.append('companyName', form.companyName.trim());
    if (form.vatNumber.trim()) fd.append('vatNumber', form.vatNumber.trim());
    if (form.companySize) fd.append('companySize', form.companySize);
    if (form.blackOwnership) fd.append('blackOwnership', form.blackOwnership);
    if (form.blackWomenOwnership) fd.append('blackWomenOwnership', form.blackWomenOwnership);
    if (form.expiryDate) fd.append('expiryDate', form.expiryDate);

    setUploading(true);
    try {
      const res = await fetch('/api/certificates/upload', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({ message: 'Upload failed' }));
      if (!res.ok) {
        if (res.status === 401) {
          toast({ title: 'Sign in required', description: 'Please sign in to upload certificates.', variant: 'destructive' });
          navigate('/auth?mode=register&redirect=' + encodeURIComponent('/certificates'));
          return;
        }
        throw new Error(data.message || `Upload failed (${res.status})`);
      }
      toast({ title: 'Certificate uploaded', description: `${form.companyName} added to the public registry.` });
      closeUploadModal();
      await Promise.all([loadCertificates(), loadStats()]);
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message || 'Please try again', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [uploadFile, form, toast, closeUploadModal, loadCertificates, loadStats, navigate]);

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

  const headlineCount = stats?.total ?? certificates.length;
  const isAuthenticated = !!user && !authLoading;

  return (
    <div className="min-h-screen bg-black text-white" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>

      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-20 bg-black/90 backdrop-blur-md" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-[1100px] mx-auto px-5 h-14 flex items-center justify-between">
          {isAuthenticated ? (
            <Link href="/hub" className="flex items-center gap-1.5 text-[13px] text-[#8e8e93] hover:text-white transition-colors">
              <ArrowLeft className="h-4 w-4" />
              Hub
            </Link>
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
                  href="/auth"
                  className="text-[13px] text-[#8e8e93] hover:text-white transition-colors px-3 py-1.5"
                >
                  Sign in
                </Link>
                <Link
                  href="/auth?mode=register"
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
            Search and verify South African B-BBEE compliance certificates. Filter by company size, ownership, and validity. Anyone can browse — sign in to add your own certificate to the registry.
          </p>
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

        {/* ─── Search ─────────────────────────────────────────── */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#48484a]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by company name or VAT number…"
            className="w-full bg-[#1c1c1e] rounded-lg pl-10 pr-10 py-2.5 text-[14px] text-white placeholder:text-[#48484a] outline-none border border-[#2c2c2e] focus:border-[#48484a] transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#48484a] hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

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
        {loading ? (
          <div className="rounded-xl overflow-hidden border border-[#1c1c1e]">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            hasCertificates={certificates.length > 0}
            hasActiveFilters={!!hasActiveFilters}
            onClearFilters={clearAllFilters}
            onUpload={requireLoginToUpload}
            isAuthenticated={isAuthenticated}
          />
        ) : (
          <div className="rounded-xl overflow-hidden border border-[#1c1c1e] bg-[#0d0d10]">
            <div className="hidden md:grid grid-cols-[2fr_1.2fr_0.8fr_1.2fr_1fr_auto] items-center gap-3 px-4 py-2.5 text-[10px] uppercase tracking-wider text-[#636366]" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <div>Company</div>
              <div>VAT number</div>
              <div>Size</div>
              <div>Ownership</div>
              <div>Expiry</div>
              <div />
            </div>
            {filtered.map((cert, idx) => (
              <CertRow
                key={cert.name}
                cert={cert}
                searchQuery={search}
                isLast={idx === filtered.length - 1}
                isDownloading={downloadingFile === cert.name}
                onDownload={() => downloadCertificate(cert.name)}
              />
            ))}
          </div>
        )}

        {/* ─── Upload your certificate (instructions) ─────────── */}
        <section
          className="mt-12 rounded-2xl border p-6 md:p-8"
          style={{ borderColor: 'rgba(99,102,241,0.2)', background: 'linear-gradient(135deg, rgba(99,102,241,0.06), transparent 60%)' }}
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg" style={{ background: 'rgba(99,102,241,0.15)', color: '#a5b4fc' }}>
              <CloudUpload className="h-5 w-5" />
            </div>
            <div>
              <h2
                className="text-[22px] text-white tracking-tight"
                style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400 }}
              >
                Add your certificate
              </h2>
              <p className="text-[13px] text-[#a1a1aa] mt-1 max-w-[620px] leading-relaxed">
                Make your B-BBEE status discoverable to clients, procurement teams and anyone evaluating suppliers. Uploads require a free Okiru account.
              </p>
            </div>
          </div>

          <ol className="grid sm:grid-cols-3 gap-4 mt-4">
            {[
              { n: '1', title: 'Sign in or create an account', body: 'Free, takes under a minute. Required so we can attribute uploads.' },
              { n: '2', title: 'Upload your certificate', body: 'PDF, image, or document. Add company name, VAT, size and ownership.' },
              { n: '3', title: 'Goes live in the registry', body: 'Anyone can search and verify. You can update or remove it any time.' },
            ].map(step => (
              <li key={step.n} className="rounded-xl border border-[#1c1c1e] bg-[#0d0d10] p-4">
                <div className="text-[10px] tracking-[0.14em] uppercase text-[#818cf8] mb-2" style={{ fontFamily: "'Geist Mono', monospace" }}>
                  Step {step.n}
                </div>
                <div className="text-[14px] text-white font-medium mb-1">{step.title}</div>
                <div className="text-[12px] text-[#8e8e93] leading-relaxed">{step.body}</div>
              </li>
            ))}
          </ol>

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            <button
              onClick={requireLoginToUpload}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-[13px] font-medium text-white bg-[#6366f1] hover:bg-[#4f46e5] transition-colors"
            >
              <Upload className="h-4 w-4" />
              {isAuthenticated ? 'Upload a certificate' : 'Sign in to upload'}
            </button>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-[#636366]">
              <Info className="h-3.5 w-3.5" />
              Accepted: PDF, PNG, JPG, XLS, DOC · up to 50MB
            </span>
          </div>
        </section>
      </main>

      {/* ─── Upload modal ───────────────────────────────────── */}
      {showUpload && isAuthenticated && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-lg mx-4 rounded-2xl bg-[#1c1c1e] border border-[#2c2c2e] shadow-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="text-[15px] font-semibold text-white">Upload certificate</h2>
              <button onClick={closeUploadModal} disabled={uploading} className="text-[#636366] hover:text-white transition-colors disabled:opacity-50">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4 overflow-y-auto">
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  dragOver
                    ? 'border-[#6366f1] bg-[#6366f1]/10'
                    : 'border-[#2c2c2e] hover:border-[#48484a] hover:bg-white/[0.02]'
                }`}
              >
                {uploadFile ? (
                  <div className="flex items-center justify-center gap-2 text-[13px] text-white">
                    <FileUp className="h-4 w-4 text-[#a5b4fc]" />
                    <span className="truncate max-w-[280px]">{uploadFile.name}</span>
                    <span className="text-[#636366]">· {(uploadFile.size / 1024).toFixed(0)} KB</span>
                  </div>
                ) : (
                  <>
                    <CloudUpload className={`h-8 w-8 mx-auto mb-2 ${dragOver ? 'text-[#6366f1]' : 'text-[#48484a]'}`} />
                    <p className="text-[13px] text-[#e5e5ea] mb-1">
                      {dragOver ? 'Drop file here' : 'Drag & drop or click to browse'}
                    </p>
                    <p className="text-[11px] text-[#48484a]">PDF, PNG, JPG, XLS, DOC · up to 50MB</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.doc,.docx"
                  className="hidden"
                  onChange={e => { if (e.target.files) handleFileSelected(e.target.files); e.target.value = ''; }}
                />
              </div>

              <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Company name *" required>
                  <input
                    type="text"
                    value={form.companyName}
                    onChange={e => setForm({ ...form, companyName: e.target.value })}
                    placeholder="e.g. Acme Holdings (Pty) Ltd"
                    className="ok-cert-input"
                  />
                </Field>
                <Field label="VAT number">
                  <input
                    type="text"
                    value={form.vatNumber}
                    onChange={e => setForm({ ...form, vatNumber: e.target.value })}
                    placeholder="e.g. 4123456789"
                    className="ok-cert-input"
                  />
                </Field>
                <Field label="Company size">
                  <select
                    value={form.companySize}
                    onChange={e => setForm({ ...form, companySize: e.target.value as CompanySize | '' })}
                    className="ok-cert-input"
                  >
                    <option value="">— Select —</option>
                    {COMPANY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
                <Field label="Expiry date">
                  <input
                    type="date"
                    value={form.expiryDate}
                    onChange={e => setForm({ ...form, expiryDate: e.target.value })}
                    className="ok-cert-input"
                  />
                </Field>
                <Field label="Black ownership %">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={form.blackOwnership}
                    onChange={e => setForm({ ...form, blackOwnership: e.target.value })}
                    placeholder="e.g. 51"
                    className="ok-cert-input"
                  />
                </Field>
                <Field label="Black women ownership %">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={form.blackWomenOwnership}
                    onChange={e => setForm({ ...form, blackWomenOwnership: e.target.value })}
                    placeholder="e.g. 30"
                    className="ok-cert-input"
                  />
                </Field>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <button
                onClick={closeUploadModal}
                disabled={uploading}
                className="px-4 py-2 rounded-lg text-[13px] text-[#8e8e93] hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={submitUpload}
                disabled={uploading || !uploadFile || !form.companyName.trim()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-white bg-[#6366f1] hover:bg-[#4f46e5] transition-colors disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Upload className="h-3.5 w-3.5" />
                    Add certificate
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Local input styles for the upload modal */}
      <style>{`
        .ok-cert-input {
          width: 100%;
          background: #0d0d10;
          border: 1px solid #2c2c2e;
          border-radius: 8px;
          padding: 8px 10px;
          font-size: 13px;
          color: #fff;
          outline: none;
          transition: border-color 0.15s;
        }
        .ok-cert-input:focus { border-color: #6366f1; }
        .ok-cert-input::placeholder { color: #48484a; }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] text-[#8e8e93] mb-1.5 tracking-wide">{label}</span>
      {children}
    </label>
  );
}

function CertRow({
  cert, searchQuery, isLast, isDownloading, onDownload,
}: {
  cert: CertificateRow;
  searchQuery: string;
  isLast: boolean;
  isDownloading: boolean;
  onDownload: () => void;
}) {
  return (
    <div
      className="md:grid md:grid-cols-[2fr_1.2fr_0.8fr_1.2fr_1fr_auto] md:items-center md:gap-3 px-4 py-3.5 hover:bg-[#16161b] transition-colors"
      style={{ borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)' }}
    >
      {/* Mobile: stacked. Desktop: grid columns */}
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
        <div className="md:hidden text-[11px] text-[#636366] mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {cert.vatNumber && <span><Hash className="inline h-3 w-3 mr-0.5" /> {cert.vatNumber}</span>}
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
        {cert.companySize || <span className="text-[#48484a]">—</span>}
      </div>
      <div className="hidden md:block text-[13px] text-[#a1a1aa]">
        {cert.blackOwnership != null ? (
          <span>
            <span className="text-white">{formatPct(cert.blackOwnership)}</span>
            {cert.blackWomenOwnership != null && (
              <span className="text-[#636366] text-[11px] ml-1">· {formatPct(cert.blackWomenOwnership)} women</span>
            )}
          </span>
        ) : (
          <span className="text-[#48484a]">—</span>
        )}
      </div>
      <div className="hidden md:flex items-center gap-2 text-[13px] text-[#a1a1aa]">
        <span>{formatExpiry(cert.expiryDate)}</span>
        <StatusBadge status={cert.status} expiryDate={cert.expiryDate} />
      </div>
      <div className="hidden md:flex justify-end">
        <button
          onClick={onDownload}
          disabled={isDownloading}
          aria-label={`Download ${cert.fileName}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[#8e8e93] hover:text-white hover:bg-[#2c2c2e] disabled:opacity-30 transition-colors text-[12px]"
        >
          {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="hidden lg:inline">Download</span>
        </button>
      </div>

      {/* Mobile download button */}
      <div className="md:hidden mt-3">
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
