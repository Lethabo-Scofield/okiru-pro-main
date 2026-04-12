import { useState, useEffect, useMemo } from 'react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, Download, Loader2, AlertCircle, Search, X, ChevronDown
} from 'lucide-react';

interface CertificateFile {
  name: string;
  fileName: string;
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

export default function CertificateHub() {
  const { toast } = useToast();
  const [certificates, setCertificates] = useState<CertificateFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

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
          <div className="w-12" />
        </div>
      </header>

      <main className="max-w-[900px] mx-auto px-5 pt-8 pb-20">

        <div className="mb-6">
          <h1 className="text-[22px] font-semibold text-white tracking-tight mb-1">B-BBEE Certificates</h1>
          <p className="text-[13px] text-[#636366]">
            {loading ? 'Loading...' : `${certificates.length} certificates · ${filtered.length} shown`}
          </p>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#48484a]" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by company name..."
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

        {loading ? (
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
    </div>
  );
}
