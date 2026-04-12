import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import {
  ArrowLeft, Award, Download, FileText, Loader2, AlertCircle
} from 'lucide-react';

interface CertificateFile {
  name: string;
  fileName: string;
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
      <header className="h-14 shrink-0 z-20 bg-black sticky top-0" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="max-w-[1400px] mx-auto w-full px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={logoCircle} alt="Okiru" className="h-8 w-8 rounded-[8px]" />
            <span className="text-lg font-semibold tracking-tight text-white border-l border-white/[0.07] pl-3">Certificate Hub</span>
          </div>
          <Link
            href="/hub"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-[12px] text-[#8e8e93] hover:text-[#d1d1d6] transition-all duration-200"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Back to Hub</span>
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-16">
        <section className="text-center mb-12 fade-in">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/[0.08] bg-white/[0.03] text-[#8e8e93] text-[11px] font-semibold tracking-wider uppercase mb-6">
            <Award className="w-3 h-3 text-indigo-400" />
            B-BBEE Certificates
          </div>
          <h1 className="text-[32px] leading-[1.12] sm:text-[40px] font-bold tracking-tight text-white mb-3" style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}>
            Certificate Management
          </h1>
          <p className="text-[14px] text-[#636366] leading-relaxed max-w-md mx-auto font-light">
            View and download B-BBEE compliance certificates stored securely in the cloud.
          </p>
        </section>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 fade-in">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400 mb-4" />
            <p className="text-[14px] text-[#636366]">Loading certificates...</p>
          </div>
        ) : certificates.length === 0 ? (
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-12 text-center fade-in">
            <AlertCircle className="w-8 h-8 text-[#2c2c2e] mx-auto mb-3" />
            <p className="text-[14px] text-[#636366]">No certificates found.</p>
          </div>
        ) : (
          <section className="fade-in stagger-1">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[12px] font-semibold text-[#48484a] uppercase tracking-widest">
                Certificates · <span className="text-[#8e8e93]">{certificates.length}</span>
              </h2>
            </div>

            <div className="space-y-2">
              {certificates.map((cert) => (
                <div
                  key={cert.name}
                  className="rounded-xl bg-white/[0.03] border border-white/[0.07] hover:border-white/[0.12] p-4 flex items-center justify-between transition-all duration-200 group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-white truncate">{cert.fileName}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => downloadCertificate(cert.name)}
                    disabled={downloadingFile === cert.name}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.07] text-[12px] font-medium text-[#8e8e93] hover:text-white disabled:opacity-50 transition-all duration-200 shrink-0"
                  >
                    {downloadingFile === cert.name ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Download
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
