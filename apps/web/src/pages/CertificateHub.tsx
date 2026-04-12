import { useState, useEffect, useMemo } from 'react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import {
  ArrowLeft, Download, Loader2, AlertCircle, Search, Lock, Sparkles
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

function FileFormatIcon({ fileName, className }: { fileName: string; className?: string }) {
  const ext = getFileExtension(fileName);

  const colors: Record<string, { page: string; fold: string; badge: string; label: string; text: string }> = {
    pdf:  { page: '#2a1215', fold: '#4a1c22', badge: '#dc2626', label: 'PDF', text: '#fca5a5' },
    png:  { page: '#1e1529', fold: '#2e1f42', badge: '#9333ea', label: 'PNG', text: '#d8b4fe' },
    jpg:  { page: '#1c1508', fold: '#2e2210', badge: '#d97706', label: 'JPG', text: '#fcd34d' },
    jpeg: { page: '#1c1508', fold: '#2e2210', badge: '#d97706', label: 'JPG', text: '#fcd34d' },
    doc:  { page: '#0c1929', fold: '#132744', badge: '#2563eb', label: 'DOC', text: '#93c5fd' },
    docx: { page: '#0c1929', fold: '#132744', badge: '#2563eb', label: 'DOC', text: '#93c5fd' },
    xls:  { page: '#0a1f15', fold: '#103323', badge: '#059669', label: 'XLS', text: '#6ee7b7' },
    xlsx: { page: '#0a1f15', fold: '#103323', badge: '#059669', label: 'XLS', text: '#6ee7b7' },
  };

  const c = colors[ext] || { page: '#1c1c1e', fold: '#2c2c2e', badge: '#636366', label: (ext || 'FILE').toUpperCase(), text: '#a1a1aa' };

  return (
    <div className={`shrink-0 ${className || ''}`} style={{ width: 36, height: 42 }}>
      <svg width="36" height="42" viewBox="0 0 36 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 0h20l12 12v26a4 4 0 01-4 4H4a4 4 0 01-4-4V4a4 4 0 014-4z" fill={c.page} />
        <path d="M24 0l12 12h-8a4 4 0 01-4-4V0z" fill={c.fold} />
        <rect x="2" y="26" width={Math.min(c.label.length * 8 + 8, 32)} height="14" rx="3" fill={c.badge} />
        <text x={2 + Math.min(c.label.length * 8 + 8, 32) / 2} y="36" textAnchor="middle" fill={c.text} fontSize="8" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif" letterSpacing="0.5">
          {c.label}
        </text>
        <rect x="6" y="8" width="12" height="1.5" rx="0.75" fill={c.fold} opacity="0.6" />
        <rect x="6" y="12" width="8" height="1.5" rx="0.75" fill={c.fold} opacity="0.4" />
        <rect x="6" y="16" width="14" height="1.5" rx="0.75" fill={c.fold} opacity="0.3" />
        <rect x="6" y="20" width="10" height="1.5" rx="0.75" fill={c.fold} opacity="0.2" />
      </svg>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-9 h-[42px] rounded-md bg-white/[0.04] shimmer" />
        <div className="space-y-2">
          <div className="h-3.5 w-56 rounded-full bg-white/[0.04] shimmer" />
          <div className="h-2.5 w-20 rounded-full bg-white/[0.03] shimmer" />
        </div>
      </div>
      <div className="h-8 w-24 rounded-lg bg-white/[0.03] shimmer" />
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

function CertTypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    EME: 'text-emerald-400/80 border-emerald-400/15 bg-emerald-400/[0.06]',
    QSE: 'text-amber-400/80 border-amber-400/15 bg-amber-400/[0.06]',
    Generic: 'text-blue-400/80 border-blue-400/15 bg-blue-400/[0.06]',
    Specialised: 'text-purple-400/80 border-purple-400/15 bg-purple-400/[0.06]',
  };
  return (
    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-md border tracking-wider uppercase ${styles[type] || 'text-[#636366] border-white/[0.06] bg-white/[0.02]'}`}>
      {type}
    </span>
  );
}

export default function CertificateHub() {
  const { toast } = useToast();
  const [certificates, setCertificates] = useState<CertificateFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);

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

  const stats = useMemo(() => {
    const exts: Record<string, number> = {};
    certificates.forEach(c => {
      const ext = getFileExtension(c.fileName).toUpperCase() || 'OTHER';
      exts[ext] = (exts[ext] || 0) + 1;
    });
    return exts;
  }, [certificates]);

  const downloadCertificate = async (blobName: string) => {
    setDownloadingFile(blobName);
    try {
      const res = await fetch(`/api/certificates/download?file=${encodeURIComponent(blobName)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Failed to generate download link' }));
        throw new Error(body.message || `Error ${res.status}`);
      }
      const { url } = await res.json();
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message || 'Could not generate a secure download link.', variant: 'destructive' });
    } finally {
      setDownloadingFile(null);
    }
  };

  return (
    <div className="font-sans min-h-screen bg-black" style={{ letterSpacing: '-0.011em', color: '#f5f5f7' }}>
      <header className="h-14 shrink-0 z-20 bg-black/80 glass-dark sticky top-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="max-w-[1100px] mx-auto w-full px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-[8px]" />
            <span className="text-lg font-semibold tracking-tight text-white border-l border-white/[0.07] pl-3">Certificate Hub</span>
          </div>
          <Link
            href="/hub"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-[12px] smooth press-sm text-[#8e8e93] hover:text-[#d1d1d6]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Back to Hub</span>
          </Link>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-4 sm:px-6 pt-12 pb-20">
        <section className="mb-10 fade-in">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[#8e8e93] text-[10px] font-semibold tracking-wider uppercase mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60 animate-pulse"></span>
                Cloud Storage · Azure
              </div>
              <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight text-white leading-[1.1] mb-1.5" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
                B-BBEE Certificates
              </h1>
              <p className="text-[13px] text-[#636366] font-light">
                {loading ? 'Loading your certificate library...' : `${certificates.length} certificates available`}
              </p>
            </div>
            {!loading && certificates.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                {Object.entries(stats).map(([ext, count]) => (
                  <div key={ext} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/[0.06] text-[10px] font-medium text-[#8e8e93]">
                    <span className="font-semibold text-white/70">{count}</span> {ext}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mb-6 fade-in stagger-1">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#3a3a3c]" />
            <input
              type="text"
              disabled
              placeholder="Search certificates..."
              className="w-full rounded-2xl bg-white/[0.02] border border-white/[0.05] pl-11 pr-40 py-3 text-[14px] text-[#3a3a3c] outline-none cursor-not-allowed placeholder:text-[#2c2c2e]"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/[0.06] bg-white/[0.02]">
              <Sparkles className="w-3 h-3 text-indigo-400/60" />
              <span className="text-[10px] font-semibold text-[#48484a] tracking-wide">Azure AI Search — Coming Soon</span>
              <Lock className="w-2.5 h-2.5 text-[#3a3a3c]" />
            </div>
          </div>
        </section>

        {loading ? (
          <section className="fade-in stagger-2">
            <div className="flex items-center justify-between mb-4">
              <div className="h-3 w-32 rounded-full bg-white/[0.04] shimmer" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          </section>
        ) : certificates.length === 0 ? (
          <section className="fade-in stagger-2">
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] p-16 text-center">
              <AlertCircle className="w-8 h-8 text-[#2c2c2e] mx-auto mb-3" />
              <p className="text-[15px] text-[#636366] font-medium mb-1">No certificates found</p>
              <p className="text-[12px] text-[#3a3a3c]">Upload certificates to your Azure Blob Storage container to see them here.</p>
            </div>
          </section>
        ) : (
          <section className="fade-in stagger-2">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] font-semibold text-[#48484a] uppercase tracking-widest">
                All Certificates
              </h2>
            </div>

            <div className="space-y-1">
              {certificates.map((cert, idx) => {
                const certType = extractCertType(cert.fileName);
                const isDownloading = downloadingFile === cert.name;

                return (
                  <div
                    key={cert.name}
                    className={`rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.10] p-3.5 flex items-center justify-between smooth group fade-in`}
                    style={{ animationDelay: `${Math.min(idx * 0.015, 0.3)}s` }}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <FileFormatIcon fileName={cert.fileName} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <p className="text-[13px] font-medium text-[#e5e5ea] truncate leading-snug group-hover:text-white smooth">
                            {cert.fileName.replace(/\.[^/.]+$/, '')}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-[#3a3a3c] font-medium uppercase tracking-wider">
                            {getFileExtension(cert.fileName).toUpperCase()}
                          </span>
                          {certType && (
                            <>
                              <span className="text-[#2c2c2e]">·</span>
                              <CertTypeBadge type={certType} />
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => downloadCertificate(cert.name)}
                      disabled={isDownloading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/[0.12] text-[11px] font-medium text-[#636366] hover:text-white disabled:opacity-40 smooth press-sm shrink-0 ml-3"
                    >
                      {isDownloading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5" />
                      )}
                      <span className="hidden sm:inline">Download</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
