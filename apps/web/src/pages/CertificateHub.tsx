import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Download, Loader2, AlertCircle, Search, X, ChevronDown, FileSearch,
  RefreshCw, CloudUpload, ChevronUp, Users, ShieldCheck, Clock, AlertTriangle,
  BarChart3, Award
} from 'lucide-react';

interface CertificateFile {
  name: string;
  fileName: string;
}

interface SearchResultItem {
  file_name: string;
  file_url: string;
  snippet: string;
}

interface SupplierChunk {
  id: string;
  supplier_name: string;
  expiry_date: string | null;
  level: number | null;
  empowering_supplier: boolean;
  upload_date: string;
  enterprise_type: string;
  black_ownership: number;
}

type KpiFilter = 'all' | 'valid' | 'expiring' | 'expired' | 'empowering';

function getFileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  if (dot === -1) return '';
  return fileName.substring(dot + 1).toLowerCase();
}

function FileFormatIcon({ fileName }: { fileName: string }) {
  const ext = getFileExtension(fileName);
  const labels: Record<string, string> = {
    pdf: 'PDF', png: 'PNG', jpg: 'JPG', jpeg: 'JPG',
    doc: 'DOC', docx: 'DOC', xls: 'XLS', xlsx: 'XLS',
  };
  const label = labels[ext] || (ext || 'FILE').toUpperCase();
  return (
    <div className="shrink-0" style={{ width: 34, height: 40 }}>
      <svg width="34" height="40" viewBox="0 0 34 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 0h19l11 11v25a4 4 0 01-4 4H4a4 4 0 01-4-4V4a4 4 0 014-4z" fill="#1c1c1e" />
        <path d="M23 0l11 11h-7a4 4 0 01-4-4V0z" fill="#2c2c2e" />
        <rect x="5" y="7" width="11" height="1.5" rx="0.75" fill="#2c2c2e" />
        <rect x="5" y="11" width="7" height="1.5" rx="0.75" fill="#2c2c2e" />
        <rect x="5" y="15" width="13" height="1.5" rx="0.75" fill="#2c2c2e" />
        <rect x="2" y="25" width={Math.min(label.length * 7 + 6, 30)} height="13" rx="2.5" fill="#3a3a3c" />
        <text x={2 + Math.min(label.length * 7 + 6, 30) / 2} y="34.5" textAnchor="middle" fill="#e5e5ea" fontSize="7.5" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif" letterSpacing="0.5">
          {label}
        </text>
      </svg>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="py-3 px-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="flex items-center gap-3">
        <div className="w-[34px] h-[40px] rounded bg-white/[0.04] shimmer" />
        <div className="space-y-2">
          <div className="h-3.5 w-56 rounded bg-white/[0.04] shimmer" />
          <div className="h-2.5 w-20 rounded bg-white/[0.03] shimmer" />
        </div>
      </div>
      <div className="h-8 w-8 rounded-lg bg-white/[0.03] shimmer" />
    </div>
  );
}

function extractCertType(fileName: string): string | null {
  const lower = fileName.toLowerCase();
  if (lower.includes('- eme') || lower.includes('-eme')) return 'EME';
  if (lower.includes('- qse') || lower.includes('-qse')) return 'QSE';
  if (lower.includes('- generic') || lower.includes('-generic')) return 'Generic';
  if (lower.includes('- specialised') || lower.includes('-specialised')) return 'Specialised';
  return null;
}

function extractYear(fileName: string): string | null {
  const match = fileName.match(/^(\d{4})\s/);
  return match ? match[1] : null;
}

function extractMonth(fileName: string): string | null {
  const match = fileName.match(/^\d{4}\s(\d{2})\s/);
  return match ? match[1] : null;
}

const MONTH_NAMES: Record<string, string> = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
};

function FilterDropdown({
  label, value, options, onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string; count: number }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = value !== '';
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
        {active ? options.find(o => o.value === value)?.label || label : label}
        {active ? (
          <X className="h-3 w-3 ml-0.5" onClick={e => { e.stopPropagation(); onChange(''); setOpen(false); }} />
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
                className={`w-full text-left px-3 py-2 text-[13px] flex items-center justify-between transition-colors ${
                  value === opt.value
                    ? 'bg-[#2c2c2e] text-white'
                    : 'text-[#8e8e93] hover:bg-[#2c2c2e] hover:text-white'
                }`}
              >
                <span>{opt.label}</span>
                <span className="text-[11px] text-[#48484a]">{opt.count}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function getSupplierStatus(expiryDate: string | null): 'valid' | 'expiring' | 'expired' {
  if (!expiryDate) return 'expired';
  const expiry = new Date(expiryDate + 'T23:59:59');
  if (isNaN(expiry.getTime())) return 'expired';
  const now = new Date();
  if (expiry < now) return 'expired';
  const sixtyDaysFromNow = new Date();
  sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);
  if (expiry <= sixtyDaysFromNow) return 'expiring';
  return 'valid';
}

function KpiCard({
  title, value, subtitle, borderColor, icon, active, onClick,
}: {
  title: string;
  value: string;
  subtitle: string;
  borderColor: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative rounded-xl p-5 text-left transition-all duration-200 w-full group ${
        active
          ? 'bg-white/[0.08] ring-1 ring-white/20'
          : 'bg-white/[0.03] hover:bg-white/[0.06]'
      }`}
      style={{
        backdropFilter: 'blur(16px)',
        borderBottom: `3px solid ${borderColor}`,
      }}
      aria-pressed={active}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-medium tracking-wider text-[#636366] uppercase">{title}</span>
        <span style={{ color: borderColor }} className="opacity-60">{icon}</span>
      </div>
      <div className="text-[2.5rem] font-bold text-white leading-none tracking-tight">{value}</div>
      <div className="text-[12px] text-[#636366] mt-1.5">{subtitle}</div>
    </button>
  );
}

function StatusBadge({ status }: { status: 'valid' | 'expiring' | 'expired' }) {
  const config = {
    valid: { label: 'Valid', bg: 'rgba(34,197,94,0.12)', text: '#22c55e', border: 'rgba(34,197,94,0.25)' },
    expiring: { label: 'Expiring', bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', border: 'rgba(245,158,11,0.25)' },
    expired: { label: 'Expired', bg: 'rgba(239,68,68,0.12)', text: '#ef4444', border: 'rgba(239,68,68,0.25)' },
  };
  const c = config[status];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium"
      style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
    >
      {c.label}
    </span>
  );
}

function LevelBadge({ level }: { level: number | null }) {
  if (level === null) return <span className="text-[#48484a] text-[13px]">N/A</span>;
  const colors: Record<number, string> = {
    1: '#22c55e', 2: '#4ade80', 3: '#a3e635', 4: '#facc15',
    5: '#f59e0b', 6: '#f97316', 7: '#ef4444', 8: '#dc2626',
  };
  const color = colors[level] || '#636366';
  return (
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-lg text-[13px] font-bold"
      style={{ background: `${color}20`, color, border: `1px solid ${color}40` }}
    >
      {level}
    </span>
  );
}

export default function CertificateHub() {
  const { toast } = useToast();
  const [certificates, setCertificates] = useState<CertificateFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResultItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [chunks, setChunks] = useState<SupplierChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(true);
  const [kpiFilter, setKpiFilter] = useState<KpiFilter>('all');
  const [supplierSearch, setSupplierSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [sortField, setSortField] = useState<'name' | 'level' | 'expiry'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [activeTab, setActiveTab] = useState<'database' | 'files'>('database');
  const [refreshing, setRefreshing] = useState(false);

  const loadChunks = useCallback(async () => {
    try {
      const res = await fetch('/api/supplier-certificates');
      if (!res.ok) throw new Error('Failed to load supplier data');
      const data = await res.json();
      setChunks(data.chunks || []);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setChunksLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  useEffect(() => {
    loadChunks();
  }, [loadChunks]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/certificates/list');
        if (!res.ok) {
          const body = await res.json().catch(() => ({ message: 'Failed to load certificates' }));
          throw new Error(body.message || `Error ${res.status}`);
        }
        const data: CertificateFile[] = await res.json();
        setCertificates(data);
      } catch (err: any) {
        console.warn('[CertHub] Certificate file list unavailable:', err.message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setChunksLoading(true);
    loadChunks();
  }, [loadChunks]);

  const kpis = useMemo(() => {
    const now = new Date();
    const sixtyDaysFromNow = new Date();
    sixtyDaysFromNow.setDate(sixtyDaysFromNow.getDate() + 60);

    const latestBySupplier = new Map<string, SupplierChunk>();
    for (const chunk of chunks) {
      const key = chunk.supplier_name;
      const existing = latestBySupplier.get(key);
      if (!existing || (chunk.upload_date > (existing.upload_date || ''))) {
        latestBySupplier.set(key, chunk);
      }
    }

    const uniqueSuppliers = Array.from(latestBySupplier.values());
    const total = uniqueSuppliers.length;

    let valid = 0, expiring = 0, expired = 0;
    let levelSum = 0, levelCount = 0;
    let empoweringCount = 0;

    for (const s of uniqueSuppliers) {
      const status = getSupplierStatus(s.expiry_date);
      if (status === 'valid') valid++;
      else if (status === 'expiring') expiring++;
      else expired++;

      if (s.level !== null) {
        levelSum += s.level;
        levelCount++;
      }
      if (s.empowering_supplier) empoweringCount++;
    }

    const avgLevel = levelCount > 0 ? (levelSum / levelCount) : 0;
    const empoweringPct = total > 0 ? (empoweringCount / total) * 100 : 0;

    return { total, valid, expiring, expired, avgLevel, empoweringCount, empoweringPct, uniqueSuppliers };
  }, [chunks]);

  const filteredSuppliers = useMemo(() => {
    let list = kpis.uniqueSuppliers;

    if (kpiFilter === 'valid') list = list.filter(s => getSupplierStatus(s.expiry_date) === 'valid');
    else if (kpiFilter === 'expiring') list = list.filter(s => getSupplierStatus(s.expiry_date) === 'expiring');
    else if (kpiFilter === 'expired') list = list.filter(s => getSupplierStatus(s.expiry_date) === 'expired');
    else if (kpiFilter === 'empowering') list = list.filter(s => s.empowering_supplier);

    if (supplierSearch.trim()) {
      const q = supplierSearch.toLowerCase();
      list = list.filter(s => s.supplier_name.toLowerCase().includes(q));
    }

    if (levelFilter) {
      list = list.filter(s => s.level !== null && String(s.level) === levelFilter);
    }

    if (statusFilter) {
      list = list.filter(s => getSupplierStatus(s.expiry_date) === statusFilter);
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') cmp = a.supplier_name.localeCompare(b.supplier_name);
      else if (sortField === 'level') cmp = (a.level ?? 99) - (b.level ?? 99);
      else if (sortField === 'expiry') cmp = (a.expiry_date || '').localeCompare(b.expiry_date || '');
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return list;
  }, [kpis.uniqueSuppliers, kpiFilter, supplierSearch, levelFilter, statusFilter, sortField, sortDir]);

  const handleSort = (field: 'name' | 'level' | 'expiry') => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const exportCsv = useCallback(() => {
    const headers = ['Supplier Name', 'B-BBEE Level', 'Status', 'Expiry Date', 'Enterprise Type', 'Empowering Supplier', 'Black Ownership %'];
    const rows = filteredSuppliers.map(s => [
      s.supplier_name,
      s.level ?? 'N/A',
      getSupplierStatus(s.expiry_date),
      s.expiry_date || 'N/A',
      s.enterprise_type,
      s.empowering_supplier ? 'Yes' : 'No',
      s.black_ownership,
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${v}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'supplier-certificates.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [filteredSuppliers]);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults(null); setSearching(false); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/certificates/search?q=${encodeURIComponent(query.trim())}`);
      if (!res.ok) { const body = await res.json().catch(() => ({ message: 'Search failed' })); throw new Error(body.message || `Error ${res.status}`); }
      const data: SearchResultItem[] = await res.json();
      setSearchResults(data);
    } catch (err: any) {
      toast({ title: 'Search error', description: err.message, variant: 'destructive' });
      setSearchResults(null);
    } finally { setSearching(false); }
  }, [toast]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!value.trim()) { setSearchResults(null); setSearching(false); return; }
    setSearching(true);
    searchTimerRef.current = setTimeout(() => { performSearch(value); }, 400);
  }, [performSearch]);

  const filterOptions = useMemo(() => {
    const types: Record<string, number> = {};
    const years: Record<string, number> = {};
    const months: Record<string, number> = {};
    certificates.forEach(c => {
      const t = extractCertType(c.fileName);
      if (t) types[t] = (types[t] || 0) + 1;
      const y = extractYear(c.fileName);
      if (y) years[y] = (years[y] || 0) + 1;
      const m = extractMonth(c.fileName);
      if (m) months[m] = (months[m] || 0) + 1;
    });
    return {
      types: Object.entries(types).sort(([a], [b]) => a.localeCompare(b)).map(([v, count]) => ({ value: v, label: v, count })),
      years: Object.entries(years).sort(([a], [b]) => b.localeCompare(a)).map(([v, count]) => ({ value: v, label: v, count })),
      months: Object.entries(months).sort(([a], [b]) => a.localeCompare(b)).map(([v, count]) => ({ value: v, label: MONTH_NAMES[v] || v, count })),
    };
  }, [certificates]);

  const filteredCerts = useMemo(() => {
    return certificates.filter(c => {
      if (search.trim()) { const q = search.toLowerCase().trim(); if (!c.fileName.toLowerCase().includes(q)) return false; }
      if (typeFilter && extractCertType(c.fileName) !== typeFilter) return false;
      if (yearFilter && extractYear(c.fileName) !== yearFilter) return false;
      if (monthFilter && extractMonth(c.fileName) !== monthFilter) return false;
      return true;
    });
  }, [certificates, search, typeFilter, yearFilter, monthFilter]);

  const hasActiveFilters = typeFilter || yearFilter || monthFilter;

  const clearAllFilters = () => {
    setSearch(''); setSearchResults(null); setSearching(false);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setTypeFilter(''); setYearFilter(''); setMonthFilter('');
  };

  const downloadCertificate = async (blobName: string, fileName: string) => {
    setDownloadingFile(blobName);
    try {
      const res = await fetch(`/api/certificates/download?file=${encodeURIComponent(blobName)}`);
      if (!res.ok) { const body = await res.json().catch(() => ({ message: 'Failed to generate download link' })); throw new Error(body.message || `Error ${res.status}`); }
      const { url } = await res.json();
      const fileRes = await fetch(url);
      if (!fileRes.ok) throw new Error('Failed to fetch file from storage');
      const blob = await fileRes.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message || 'Could not generate a secure download link.', variant: 'destructive' });
    } finally { setDownloadingFile(null); }
  };

  const SortIcon = ({ field }: { field: 'name' | 'level' | 'expiry' }) => {
    if (sortField !== field) return <ChevronDown className="h-3 w-3 text-[#48484a]" />;
    return sortDir === 'asc' ? <ChevronUp className="h-3 w-3 text-white" /> : <ChevronDown className="h-3 w-3 text-white" />;
  };

  return (
    <div className="min-h-screen text-white" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif", background: '#0a1428' }}>

      <header className="sticky top-0 z-20 backdrop-blur-md" style={{ background: 'rgba(10,20,40,0.92)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-[1400px] mx-auto px-5 h-14 flex items-center justify-between">
          <Link href="/hub" className="flex items-center gap-1.5 text-[13px] text-[#8e8e93] hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Hub
          </Link>
          <span className="text-[15px] font-semibold text-[#e5e5ea]">Certificate Database</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-[#8e8e93] hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors disabled:opacity-50"
              aria-label="Refresh data"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors">
              <CloudUpload className="h-3.5 w-3.5" />
              SharePoint Sync
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-5 pt-6 pb-20">

        {!chunksLoading && chunks.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
            <KpiCard
              title="Total Suppliers"
              value={String(kpis.total)}
              subtitle="in database"
              borderColor="#14b8a6"
              icon={<Users className="h-4 w-4" />}
              active={kpiFilter === 'all'}
              onClick={() => setKpiFilter(kpiFilter === 'all' ? 'all' : 'all')}
            />
            <KpiCard
              title="Valid Certificates"
              value={String(kpis.valid)}
              subtitle="up to date"
              borderColor="#22c55e"
              icon={<ShieldCheck className="h-4 w-4" />}
              active={kpiFilter === 'valid'}
              onClick={() => setKpiFilter(kpiFilter === 'valid' ? 'all' : 'valid')}
            />
            <KpiCard
              title="Expiring Soon"
              value={String(kpis.expiring)}
              subtitle="within 60 days"
              borderColor="#f59e0b"
              icon={<Clock className="h-4 w-4" />}
              active={kpiFilter === 'expiring'}
              onClick={() => setKpiFilter(kpiFilter === 'expiring' ? 'all' : 'expiring')}
            />
            <KpiCard
              title="Expired"
              value={String(kpis.expired)}
              subtitle="action required"
              borderColor="#ef4444"
              icon={<AlertTriangle className="h-4 w-4" />}
              active={kpiFilter === 'expired'}
              onClick={() => setKpiFilter(kpiFilter === 'expired' ? 'all' : 'expired')}
            />
            <KpiCard
              title="Avg B-BBEE Level"
              value={kpis.avgLevel.toFixed(1)}
              subtitle="across portfolio"
              borderColor="#8b5cf6"
              icon={<BarChart3 className="h-4 w-4" />}
              active={false}
              onClick={() => {}}
            />
            <KpiCard
              title="Empowering Suppliers"
              value={`${kpis.empoweringCount} (${kpis.empoweringPct.toFixed(0)}%)`}
              subtitle="of total base"
              borderColor="#ec4899"
              icon={<Award className="h-4 w-4" />}
              active={kpiFilter === 'empowering'}
              onClick={() => setKpiFilter(kpiFilter === 'empowering' ? 'all' : 'empowering')}
            />
          </div>
        )}

        {chunksLoading && (
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3 mb-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl p-5 bg-white/[0.03] animate-pulse" style={{ borderBottom: '3px solid #2c2c2e' }}>
                <div className="h-2.5 w-20 rounded bg-white/[0.04] mb-4" />
                <div className="h-8 w-16 rounded bg-white/[0.04] mb-2" />
                <div className="h-2 w-14 rounded bg-white/[0.03]" />
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-1 mb-6 bg-white/[0.03] rounded-lg p-1 w-fit">
          <button
            onClick={() => setActiveTab('database')}
            className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
              activeTab === 'database' ? 'bg-white/[0.1] text-white' : 'text-[#636366] hover:text-white'
            }`}
          >
            Supplier Registry
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-colors ${
              activeTab === 'files' ? 'bg-white/[0.1] text-white' : 'text-[#636366] hover:text-white'
            }`}
          >
            Certificate Files
          </button>
        </div>

        {activeTab === 'database' && (
          <>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4">
              <div className="relative flex-1 w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#48484a]" />
                <input
                  type="text"
                  value={supplierSearch}
                  onChange={e => setSupplierSearch(e.target.value)}
                  placeholder="Filter suppliers..."
                  className="w-full bg-white/[0.04] rounded-lg pl-10 pr-4 py-2 text-[13px] text-white placeholder:text-[#48484a] outline-none border border-white/[0.06] focus:border-white/[0.15] transition-colors"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={levelFilter}
                  onChange={e => setLevelFilter(e.target.value)}
                  className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] text-[#8e8e93] outline-none"
                >
                  <option value="">All Levels</option>
                  {[1,2,3,4,5,6,7,8].map(l => (
                    <option key={l} value={String(l)}>Level {l}</option>
                  ))}
                </select>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="bg-white/[0.04] border border-white/[0.06] rounded-lg px-3 py-2 text-[13px] text-[#8e8e93] outline-none"
                >
                  <option value="">All Status</option>
                  <option value="valid">Valid</option>
                  <option value="expiring">Expiring</option>
                  <option value="expired">Expired</option>
                </select>
                <button
                  onClick={exportCsv}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] text-[#8e8e93] hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export CSV
                </button>
              </div>
              {kpiFilter !== 'all' && (
                <button
                  onClick={() => setKpiFilter('all')}
                  className="text-[12px] text-[#8e8e93] hover:text-white transition-colors flex items-center gap-1"
                >
                  <X className="h-3 w-3" />
                  Clear KPI filter
                </button>
              )}
            </div>

            <div className="rounded-xl overflow-hidden border border-white/[0.06]" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <th className="text-left px-4 py-3 text-[11px] font-medium text-[#636366] uppercase tracking-wider">
                        <button onClick={() => handleSort('name')} className="flex items-center gap-1 hover:text-white transition-colors">
                          Supplier Name <SortIcon field="name" />
                        </button>
                      </th>
                      <th className="text-center px-4 py-3 text-[11px] font-medium text-[#636366] uppercase tracking-wider">
                        <button onClick={() => handleSort('level')} className="flex items-center gap-1 hover:text-white transition-colors mx-auto">
                          B-BBEE Level <SortIcon field="level" />
                        </button>
                      </th>
                      <th className="text-center px-4 py-3 text-[11px] font-medium text-[#636366] uppercase tracking-wider">Type</th>
                      <th className="text-center px-4 py-3 text-[11px] font-medium text-[#636366] uppercase tracking-wider">Status</th>
                      <th className="text-center px-4 py-3 text-[11px] font-medium text-[#636366] uppercase tracking-wider">
                        <button onClick={() => handleSort('expiry')} className="flex items-center gap-1 hover:text-white transition-colors mx-auto">
                          Expiry Date <SortIcon field="expiry" />
                        </button>
                      </th>
                      <th className="text-center px-4 py-3 text-[11px] font-medium text-[#636366] uppercase tracking-wider">Empowering</th>
                      <th className="text-center px-4 py-3 text-[11px] font-medium text-[#636366] uppercase tracking-wider">Black Ownership</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSuppliers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-[#636366]">
                          <AlertCircle className="h-5 w-5 mx-auto mb-2 text-[#3a3a3c]" />
                          No suppliers match the current filters
                        </td>
                      </tr>
                    ) : (
                      filteredSuppliers.map((s, idx) => {
                        const status = getSupplierStatus(s.expiry_date);
                        return (
                          <tr
                            key={s.id}
                            className="hover:bg-white/[0.03] transition-colors"
                            style={{ borderBottom: idx < filteredSuppliers.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                          >
                            <td className="px-4 py-3 text-[#e5e5ea] font-medium">{s.supplier_name}</td>
                            <td className="px-4 py-3 text-center"><LevelBadge level={s.level} /></td>
                            <td className="px-4 py-3 text-center text-[#8e8e93]">{s.enterprise_type}</td>
                            <td className="px-4 py-3 text-center"><StatusBadge status={status} /></td>
                            <td className="px-4 py-3 text-center text-[#8e8e93]">
                              {s.expiry_date ? new Date(s.expiry_date).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A'}
                            </td>
                            <td className="px-4 py-3 text-center">
                              {s.empowering_supplier ? (
                                <span className="text-[#22c55e] text-[12px] font-medium">Yes</span>
                              ) : (
                                <span className="text-[#636366] text-[12px]">No</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-center text-[#8e8e93]">{s.black_ownership}%</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              {filteredSuppliers.length > 0 && (
                <div className="px-4 py-3 text-[12px] text-[#48484a]" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                  Showing {filteredSuppliers.length} of {kpis.total} suppliers
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'files' && (
          <>
            <div className="mb-4">
              <p className="text-[13px] text-[#636366] mb-3">
                {loading ? 'Loading...' : searchResults !== null && search.trim()
                  ? 'Searching across document content'
                  : `${certificates.length} certificates · ${filteredCerts.length} shown`}
              </p>
            </div>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#48484a]" />
              <input
                type="text"
                value={search}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Search certificates by name or content..."
                className="w-full bg-white/[0.04] rounded-lg pl-10 pr-10 py-2.5 text-[14px] text-white placeholder:text-[#48484a] outline-none border border-white/[0.06] focus:border-white/[0.15] transition-colors"
              />
              {searching && <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 text-[#48484a] animate-spin" />}
              {search && (
                <button onClick={() => handleSearchChange('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#48484a] hover:text-white transition-colors">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {!loading && certificates.length > 0 && (
              <div className="flex items-center gap-2 mb-6 flex-wrap">
                <FilterDropdown label="Type" value={typeFilter} options={filterOptions.types} onChange={setTypeFilter} />
                {filterOptions.years.length > 1 && <FilterDropdown label="Year" value={yearFilter} options={filterOptions.years} onChange={setYearFilter} />}
                <FilterDropdown label="Month" value={monthFilter} options={filterOptions.months} onChange={setMonthFilter} />
                {hasActiveFilters && (
                  <button onClick={clearAllFilters} className="text-[12px] text-[#636366] hover:text-white transition-colors ml-1">Clear all</button>
                )}
              </div>
            )}

            {searchResults !== null && search.trim() ? (
              searching ? (
                <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                  {Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)}
                </div>
              ) : searchResults.length === 0 ? (
                <div className="py-20 text-center">
                  <FileSearch className="w-6 h-6 text-[#3a3a3c] mx-auto mb-3" />
                  <p className="text-[14px] text-[#636366] mb-1">No documents match "{search}"</p>
                  <p className="text-[12px] text-[#48484a] mb-3">Try searching for names, keywords, or phrases inside certificates</p>
                  <button onClick={clearAllFilters} className="text-[13px] text-[#8e8e93] hover:text-white transition-colors">Clear search</button>
                </div>
              ) : (
                <>
                  <p className="text-[12px] text-[#636366] mb-3">{searchResults.length} document{searchResults.length !== 1 ? 's' : ''} found matching "{search}"</p>
                  <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                    {searchResults.map((result, idx) => {
                      const certType = extractCertType(result.file_name);
                      const isDownloading = downloadingFile === result.file_url;
                      return (
                        <div key={result.file_url + idx} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors group" style={{ borderBottom: idx < searchResults.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <FileFormatIcon fileName={result.file_name} />
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] text-[#e5e5ea] truncate group-hover:text-white transition-colors">{result.file_name.replace(/\.[^/.]+$/, '')}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[11px] text-[#3a3a3c] tracking-wide">{getFileExtension(result.file_name).toUpperCase()}</span>
                                {certType && (<><span className="text-[#2c2c2e]">·</span><span className="text-[11px] text-[#636366]">{certType}</span></>)}
                              </div>
                              {result.snippet && <p className="text-[11px] text-[#48484a] mt-1 line-clamp-2 leading-relaxed">...{result.snippet}...</p>}
                            </div>
                          </div>
                          <button onClick={() => downloadCertificate(result.file_url, result.file_name)} disabled={isDownloading} aria-label={`Download ${result.file_name}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[#636366] hover:text-white hover:bg-[#2c2c2e] disabled:opacity-30 transition-colors shrink-0 ml-2 text-[12px]">
                            {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            <span className="hidden sm:inline">Download</span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              )
            ) : loading ? (
              <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                {Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)}
              </div>
            ) : filteredCerts.length === 0 ? (
              <div className="py-20 text-center">
                <AlertCircle className="w-6 h-6 text-[#3a3a3c] mx-auto mb-3" />
                <p className="text-[14px] text-[#636366] mb-1">{search || hasActiveFilters ? 'No certificates match your filters' : 'No certificates found'}</p>
                {(search || hasActiveFilters) && (
                  <button onClick={clearAllFilters} className="text-[13px] text-[#8e8e93] hover:text-white transition-colors mt-1">Clear all filters</button>
                )}
              </div>
            ) : (
              <div className="rounded-xl overflow-hidden border border-white/[0.06]">
                {filteredCerts.map((cert, idx) => {
                  const certType = extractCertType(cert.fileName);
                  const isDownloading = downloadingFile === cert.name;
                  return (
                    <div key={cert.name} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.03] transition-colors group" style={{ borderBottom: idx < filteredCerts.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <FileFormatIcon fileName={cert.fileName} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] text-[#e5e5ea] truncate group-hover:text-white transition-colors">{cert.fileName.replace(/\.[^/.]+$/, '')}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-[#3a3a3c] tracking-wide">{getFileExtension(cert.fileName).toUpperCase()}</span>
                            {certType && (<><span className="text-[#2c2c2e]">·</span><span className="text-[11px] text-[#636366]">{certType}</span></>)}
                          </div>
                        </div>
                      </div>
                      <button onClick={() => downloadCertificate(cert.name, cert.fileName)} disabled={isDownloading} aria-label={`Download ${cert.fileName}`} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[#636366] hover:text-white hover:bg-[#2c2c2e] disabled:opacity-30 transition-colors shrink-0 ml-2 text-[12px]">
                        {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        <span className="hidden sm:inline">Download</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

      </main>
    </div>
  );
}
