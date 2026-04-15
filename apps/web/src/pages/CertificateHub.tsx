import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Download, Loader2, AlertCircle, Search, X, ChevronDown, FileSearch,
  RefreshCw, Users, ShieldCheck, Clock, AlertTriangle, BarChart3, Award,
  Upload, CloudUpload, CheckCircle2, XCircle, FileUp, FileText
} from 'lucide-react';

interface CertificateFile {
  name: string;
  fileName: string;
  lastModified: string | null;
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
  label,
  value,
  options,
  onChange,
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
      <div className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-white/[0.04]" style={{ color: iconColor }}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[20px] font-semibold text-white leading-tight">{value}</div>
        <div className="text-[11px] text-[#636366] truncate">{title}</div>
      </div>
    </div>
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
  const [refreshing, setRefreshing] = useState(false);

  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResults, setUploadResults] = useState<Array<{ fileName: string; status: 'uploaded' | 'error'; error?: string }> | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadChunks = useCallback(async () => {
    try {
      const res = await fetch('/api/supplier-certificates');
      if (!res.ok) throw new Error('Failed to load supplier data');
      const data = await res.json();
      setChunks(data.chunks || []);
    } catch {
      setChunks([]);
    } finally {
      setChunksLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadChunks(); }, [loadChunks]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setChunksLoading(true);
    loadChunks();
  }, [loadChunks]);

  const reloadCertificates = useCallback(async () => {
    try {
      const res = await fetch('/api/certificates/list');
      if (!res.ok) throw new Error('Failed to reload');
      const data: CertificateFile[] = await res.json();
      setCertificates(data);
    } catch {}
  }, []);

  const handleFilesSelected = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files);
    setUploadFiles(prev => [...prev, ...fileArray]);
    setUploadResults(null);
  }, []);

  const removeUploadFile = useCallback((index: number) => {
    setUploadFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleUpload = useCallback(async () => {
    if (uploadFiles.length === 0) return;
    if (uploadFiles.length > 20) {
      toast({ title: 'Too many files', description: 'Maximum 20 files per upload', variant: 'destructive' });
      return;
    }
    const oversized = uploadFiles.filter(f => f.size > 50 * 1024 * 1024);
    if (oversized.length > 0) {
      toast({ title: 'File too large', description: `${oversized[0].name} exceeds 50MB limit`, variant: 'destructive' });
      return;
    }
    setUploading(true);
    setUploadResults(null);
    try {
      const formData = new FormData();
      uploadFiles.forEach(f => formData.append('files', f));
      const res = await fetch('/api/certificates/upload', { method: 'POST', body: formData });
      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new Error(`Server error (${res.status})`);
      }
      if (!res.ok) throw new Error(data.message || 'Upload failed');
      setUploadResults(data.results || []);
      const successCount = (data.results || []).filter((r: any) => r.status === 'uploaded').length;
      if (successCount > 0) {
        toast({ title: 'Upload complete', description: data.message });
        await reloadCertificates();
      }
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [uploadFiles, toast, reloadCertificates]);

  const closeUploadModal = useCallback(() => {
    if (!uploading) {
      setShowUpload(false);
      setUploadFiles([]);
      setUploadResults(null);
      setDragOver(false);
    }
  }, [uploading]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      handleFilesSelected(e.dataTransfer.files);
    }
  }, [handleFilesSelected]);

  const kpis = useMemo(() => {
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

    return { total, valid, expiring, expired, avgLevel, empoweringCount, empoweringPct };
  }, [chunks]);

  const certKpis = useMemo(() => {
    const now = new Date();
    const sixtyDaysFromNow = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    const total = certificates.length;
    let valid = 0, expiring = 0, expired = 0;

    for (const cert of certificates) {
      if (!cert.lastModified) {
        valid++;
        continue;
      }
      const issued = new Date(cert.lastModified);
      const expiryDate = new Date(issued);
      expiryDate.setFullYear(expiryDate.getFullYear() + 1);

      if (expiryDate < now) {
        expired++;
      } else if (expiryDate <= sixtyDaysFromNow) {
        expiring++;
      } else {
        valid++;
      }
    }

    return { total, valid, expiring, expired };
  }, [certificates]);

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
        toast({ title: 'Error', description: err.message || 'Failed to load certificates', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(`/api/certificates/search?q=${encodeURIComponent(query.trim())}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Search failed' }));
        throw new Error(body.message || `Error ${res.status}`);
      }
      const data: SearchResultItem[] = await res.json();
      setSearchResults(data);
    } catch (err: any) {
      toast({ title: 'Search error', description: err.message || 'Search failed', variant: 'destructive' });
      setSearchResults(null);
    } finally {
      setSearching(false);
    }
  }, [toast]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    if (!value.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimerRef.current = setTimeout(() => {
      performSearch(value);
    }, 400);
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
      types: Object.entries(types)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([v, count]) => ({ value: v, label: v, count })),
      years: Object.entries(years)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([v, count]) => ({ value: v, label: v, count })),
      months: Object.entries(months)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([v, count]) => ({ value: v, label: MONTH_NAMES[v] || v, count })),
    };
  }, [certificates]);

  const filtered = useMemo(() => {
    return certificates.filter(c => {
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        if (!c.fileName.toLowerCase().includes(q)) return false;
      }
      if (typeFilter) {
        if (extractCertType(c.fileName) !== typeFilter) return false;
      }
      if (yearFilter) {
        if (extractYear(c.fileName) !== yearFilter) return false;
      }
      if (monthFilter) {
        if (extractMonth(c.fileName) !== monthFilter) return false;
      }
      return true;
    });
  }, [certificates, search, typeFilter, yearFilter, monthFilter]);

  const hasActiveFilters = typeFilter || yearFilter || monthFilter;

  const clearAllFilters = () => {
    setSearch('');
    setSearchResults(null);
    setSearching(false);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    setTypeFilter('');
    setYearFilter('');
    setMonthFilter('');
  };

  const downloadCertificate = async (blobName: string, fileName: string) => {
    setDownloadingFile(blobName);
    try {
      const res = await fetch(`/api/certificates/download?file=${encodeURIComponent(blobName)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Failed to generate download link' }));
        throw new Error(body.message || `Error ${res.status}`);
      }
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
    } finally {
      setDownloadingFile(null);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>

      <header className="sticky top-0 z-20 bg-black/90 backdrop-blur-md" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-[900px] mx-auto px-5 h-12 flex items-center justify-between">
          <Link href="/hub" className="flex items-center gap-1.5 text-[13px] text-[#8e8e93] hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Hub
          </Link>
          <span className="text-[13px] font-medium text-[#e5e5ea]">Certificate Hub</span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1 text-[13px] text-[#8e8e93] hover:text-white transition-colors disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors"
            >
              <Upload className="h-3.5 w-3.5" />
              Upload
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-5 pt-8 pb-20">

        <div className="mb-6">
          <h1 className="text-[22px] font-semibold text-white tracking-tight mb-1">B-BBEE Certificates</h1>
          <p className="text-[13px] text-[#636366]">
            {loading ? 'Loading...' : searchResults !== null && search.trim()
              ? `Searching across document content`
              : `${certificates.length} certificates · ${filtered.length} shown`}
          </p>
        </div>

        {!loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            <KpiCard
              title="Total Certificates"
              value={String(certKpis.total)}
              subtitle="in storage"
              iconColor="#3b82f6"
              icon={<FileText className="h-4 w-4" />}
            />
            <KpiCard
              title="Valid"
              value={String(certKpis.valid)}
              subtitle="up to date"
              iconColor="#22c55e"
              icon={<ShieldCheck className="h-4 w-4" />}
            />
            <KpiCard
              title="Expiring Soon"
              value={String(certKpis.expiring)}
              subtitle="within 60 days"
              iconColor="#f59e0b"
              icon={<Clock className="h-4 w-4" />}
            />
            <KpiCard
              title="Expired"
              value={String(certKpis.expired)}
              subtitle="needs renewal"
              iconColor="#ef4444"
              icon={<AlertTriangle className="h-4 w-4" />}
            />
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg px-4 py-3 bg-[#1c1c1e] border border-[#2c2c2e] animate-pulse">
                <div className="shrink-0 w-9 h-9 rounded-lg bg-white/[0.04]" />
                <div className="flex-1">
                  <div className="h-5 w-10 rounded bg-white/[0.04] mb-1.5" />
                  <div className="h-2.5 w-20 rounded bg-white/[0.03]" />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#48484a]" />
          <input
            type="text"
            value={search}
            onChange={e => handleSearchChange(e.target.value)}
            placeholder="Search certificates by name or content..."
            className="w-full bg-[#1c1c1e] rounded-lg pl-10 pr-10 py-2.5 text-[14px] text-white placeholder:text-[#48484a] outline-none border border-[#2c2c2e] focus:border-[#48484a] transition-colors"
          />
          {searching && (
            <Loader2 className="absolute right-10 top-1/2 -translate-y-1/2 h-4 w-4 text-[#48484a] animate-spin" />
          )}
          {search && (
            <button
              onClick={() => { handleSearchChange(''); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#48484a] hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {!loading && certificates.length > 0 && (
          <div className="flex items-center gap-2 mb-6 flex-wrap">
            <FilterDropdown
              label="Type"
              value={typeFilter}
              options={filterOptions.types}
              onChange={setTypeFilter}
            />
            {filterOptions.years.length > 1 && (
              <FilterDropdown
                label="Year"
                value={yearFilter}
                options={filterOptions.years}
                onChange={setYearFilter}
              />
            )}
            <FilterDropdown
              label="Month"
              value={monthFilter}
              options={filterOptions.months}
              onChange={setMonthFilter}
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
        )}

        {searchResults !== null && search.trim() ? (
          searching ? (
            <div className="rounded-xl overflow-hidden border border-[#1c1c1e]">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : searchResults.length === 0 ? (
            <div className="py-20 text-center">
              <FileSearch className="w-6 h-6 text-[#3a3a3c] mx-auto mb-3" />
              <p className="text-[14px] text-[#636366] mb-1">
                No documents match "{search}"
              </p>
              <p className="text-[12px] text-[#48484a] mb-3">
                Try searching for names, keywords, or phrases inside certificates
              </p>
              <button onClick={clearAllFilters} className="text-[13px] text-[#8e8e93] hover:text-white transition-colors">
                Clear search
              </button>
            </div>
          ) : (
            <>
              <p className="text-[12px] text-[#636366] mb-3">
                {searchResults.length} document{searchResults.length !== 1 ? 's' : ''} found matching "{search}"
              </p>
              <div className="rounded-xl overflow-hidden border border-[#1c1c1e]">
                {searchResults.map((result, idx) => {
                  const certType = extractCertType(result.file_name);
                  const isDownloading = downloadingFile === result.file_url;

                  return (
                    <div
                      key={result.file_url + idx}
                      className="flex items-center justify-between px-4 py-3 hover:bg-[#1c1c1e] transition-colors group"
                      style={{ borderBottom: idx < searchResults.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <FileFormatIcon fileName={result.file_name} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] text-[#e5e5ea] truncate group-hover:text-white transition-colors">
                            {result.file_name.replace(/\.[^/.]+$/, '')}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[11px] text-[#3a3a3c] tracking-wide">
                              {getFileExtension(result.file_name).toUpperCase()}
                            </span>
                            {certType && (
                              <>
                                <span className="text-[#2c2c2e]">·</span>
                                <span className="text-[11px] text-[#636366]">{certType}</span>
                              </>
                            )}
                          </div>
                          {result.snippet && (
                            <p className="text-[11px] text-[#48484a] mt-1 line-clamp-2 leading-relaxed">
                              ...{result.snippet}...
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => downloadCertificate(result.file_url, result.file_name)}
                        disabled={isDownloading}
                        aria-label={`Download ${result.file_name}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[#636366] hover:text-white hover:bg-[#2c2c2e] disabled:opacity-30 transition-colors shrink-0 ml-2 text-[12px]"
                      >
                        {isDownloading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        <span className="hidden sm:inline">Download</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )
        ) : loading ? (
          <div className="rounded-xl overflow-hidden border border-[#1c1c1e]">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center">
            <AlertCircle className="w-6 h-6 text-[#3a3a3c] mx-auto mb-3" />
            <p className="text-[14px] text-[#636366] mb-1">
              {search || hasActiveFilters ? 'No certificates match your filters' : 'No certificates found'}
            </p>
            {(search || hasActiveFilters) && (
              <button onClick={clearAllFilters} className="text-[13px] text-[#8e8e93] hover:text-white transition-colors mt-1">
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border border-[#1c1c1e]">
            {filtered.map((cert, idx) => {
              const certType = extractCertType(cert.fileName);
              const isDownloading = downloadingFile === cert.name;

              return (
                <div
                  key={cert.name}
                  className="flex items-center justify-between px-4 py-3 hover:bg-[#1c1c1e] transition-colors group"
                  style={{ borderBottom: idx < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileFormatIcon fileName={cert.fileName} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-[#e5e5ea] truncate group-hover:text-white transition-colors">
                        {cert.fileName.replace(/\.[^/.]+$/, '')}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] text-[#3a3a3c] tracking-wide">
                          {getFileExtension(cert.fileName).toUpperCase()}
                        </span>
                        {certType && (
                          <>
                            <span className="text-[#2c2c2e]">·</span>
                            <span className="text-[11px] text-[#636366]">{certType}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => downloadCertificate(cert.name, cert.fileName)}
                    disabled={isDownloading}
                    aria-label={`Download ${cert.fileName}`}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[#636366] hover:text-white hover:bg-[#2c2c2e] disabled:opacity-30 transition-colors shrink-0 ml-2 text-[12px]"
                  >
                    {isDownloading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    <span className="hidden sm:inline">Download</span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-lg mx-4 rounded-2xl bg-[#1c1c1e] border border-[#2c2c2e] shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <h2 className="text-[15px] font-semibold text-white">Upload Certificates</h2>
              <button onClick={closeUploadModal} disabled={uploading} className="text-[#636366] hover:text-white transition-colors disabled:opacity-50">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 py-4">
              <div
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                  dragOver
                    ? 'border-[#2563eb] bg-[#2563eb]/10'
                    : 'border-[#2c2c2e] hover:border-[#48484a] hover:bg-white/[0.02]'
                }`}
              >
                <CloudUpload className={`h-8 w-8 mx-auto mb-3 ${dragOver ? 'text-[#2563eb]' : 'text-[#48484a]'}`} />
                <p className="text-[14px] text-[#e5e5ea] mb-1">
                  {dragOver ? 'Drop files here' : 'Drag & drop files here'}
                </p>
                <p className="text-[12px] text-[#48484a]">
                  or click to browse · PDF, PNG, JPG, XLS, DOC · up to 50MB each
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.xls,.xlsx,.doc,.docx"
                className="hidden"
                onChange={e => { if (e.target.files) handleFilesSelected(e.target.files); e.target.value = ''; }}
              />

              {uploadFiles.length > 0 && (
                <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                  {uploadFiles.map((file, idx) => {
                    const result = uploadResults?.find(r => r.fileName === file.name);
                    return (
                      <div
                        key={`${file.name}-${idx}`}
                        className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/[0.03]"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <FileUp className="h-4 w-4 text-[#636366] shrink-0" />
                          <div className="min-w-0">
                            <p className="text-[13px] text-[#e5e5ea] truncate">{file.name}</p>
                            <p className="text-[11px] text-[#48484a]">{(file.size / 1024).toFixed(0)} KB</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          {result && result.status === 'uploaded' && (
                            <CheckCircle2 className="h-4 w-4 text-[#22c55e]" />
                          )}
                          {result && result.status === 'error' && (
                            <XCircle className="h-4 w-4 text-[#ef4444]" title={result.error} />
                          )}
                          {!uploading && !result && (
                            <button onClick={() => removeUploadFile(idx)} className="text-[#48484a] hover:text-white transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-5 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-[12px] text-[#48484a]">
                {uploadFiles.length} file{uploadFiles.length !== 1 ? 's' : ''} selected
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={closeUploadModal}
                  disabled={uploading}
                  className="px-4 py-2 rounded-lg text-[13px] text-[#8e8e93] hover:text-white bg-white/[0.04] hover:bg-white/[0.08] transition-colors disabled:opacity-50"
                >
                  {uploadResults ? 'Close' : 'Cancel'}
                </button>
                {!uploadResults && (
                  <button
                    onClick={handleUpload}
                    disabled={uploading || uploadFiles.length === 0}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-white bg-[#2563eb] hover:bg-[#1d4ed8] transition-colors disabled:opacity-50"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-3.5 w-3.5" />
                        Upload {uploadFiles.length > 0 ? `(${uploadFiles.length})` : ''}
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
