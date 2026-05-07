import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  Download, Loader2, ShieldCheck, AlertTriangle, Award,
  Building2, Hash, Users2, Percent, CalendarClock, History, Flag,
  X, CheckCircle2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AppNavBack } from '@/components/AppNavBack';

interface CertDetail {
  slug: string;
  companyName: string;
  bbbeeLevel: number | null;
  bbbeeScore: number | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  verificationAgency: string | null;
  certificateNumber: string | null;
  expiryDate: string | null;
  issueDate: string | null;
  blobName: string | null;
  status?: 'valid' | 'expiring' | 'expired' | 'unknown';
  updatedAt?: string | null;
  verified?: boolean;
  vatNumber?: string | null;
  companySize?: string | null;
  id?: string | null;
}

interface VersionEntry {
  blobName: string;
  fileName: string | null;
  expiryDate: string | null;
  uploadedAt: string | null;
  replacedAt: string | null;
  uploadedByUserId: string | null;
}

interface HistoryPayload {
  certificateId: string;
  slug: string | null;
  latest: {
    blobName: string;
    fileName: string | null;
    expiryDate: string | null;
    uploadedAt: string | null;
    uploadedByUserId: string | null;
  };
  versions: VersionEntry[];
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '-';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function StatusBadge({ status }: { status?: string | null }) {
  const map: Record<string, { color: string; bg: string; label: string }> = {
    valid: { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', label: 'Valid' },
    expiring: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Expiring soon' },
    expired: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Expired' },
    unknown: { color: '#8e8e93', bg: 'rgba(142,142,147,0.12)', label: 'Unknown' },
  };
  const cfg = map[status || 'unknown'] || map.unknown;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium tracking-wide uppercase"
      style={{ color: cfg.color, background: cfg.bg }}
    >
      {cfg.label}
    </span>
  );
}

function MetaRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
      <div className="text-[#636366] mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-[#8e8e93] tracking-wide uppercase mb-0.5">{label}</div>
        <div className="text-[14px] text-white">{value}</div>
      </div>
    </div>
  );
}

export default function CertificateDetail({ slug }: { slug: string }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [data, setData] = useState<CertDetail | null>(null);
  const [history, setHistory] = useState<HistoryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Report form state
  const [reportReason, setReportReason] = useState<'incorrect-data' | 'expired' | 'fraudulent' | 'duplicate' | 'other'>('incorrect-data');
  const [reportMessage, setReportMessage] = useState('');
  const [reportEmail, setReportEmail] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/certificates/by-slug/${encodeURIComponent(slug)}`);
        if (!res.ok) {
          if (res.status === 404) throw new Error('Certificate not found in the public registry.');
          throw new Error(`Lookup failed (${res.status})`);
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Could not load this certificate.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const loadHistory = useCallback(async () => {
    if (!data?.id) {
      toast({ title: 'No history available', description: 'This certificate has no version history yet.' });
      return;
    }
    try {
      const res = await fetch(`/api/certificates/${encodeURIComponent(data.id)}/history`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error?.message || 'Failed to load history');
      setHistory(json.data);
      setShowHistory(true);
    } catch (err: any) {
      toast({ title: 'Could not load history', description: err.message, variant: 'destructive' });
    }
  }, [data?.id, toast]);

  const handleDownload = useCallback(async () => {
    if (!data?.blobName) {
      toast({ title: 'No file available', variant: 'destructive' });
      return;
    }
    setDownloading(true);
    try {
      const res = await fetch(`/api/certificates/download?file=${encodeURIComponent(data.blobName)}`);
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
      toast({ title: 'Download failed', description: err.message, variant: 'destructive' });
    } finally {
      setDownloading(false);
    }
  }, [data, toast]);

  const submitReport = useCallback(async () => {
    if (!data?.id) {
      toast({ title: 'Cannot report this certificate', description: 'No identifier available.', variant: 'destructive' });
      return;
    }
    if (reportMessage.trim().length < 10) {
      toast({ title: 'Add more detail', description: 'Please describe the issue (at least 10 characters).', variant: 'destructive' });
      return;
    }
    setReportSubmitting(true);
    try {
      const res = await fetch(`/api/certificates/${encodeURIComponent(data.id)}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reportReason,
          message: reportMessage.trim(),
          email: reportEmail.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || `Submission failed (${res.status})`);
      }
      setReportSuccess(true);
      setReportMessage('');
      setReportEmail('');
      toast({ title: 'Report submitted', description: 'Thank you. Our team will review it shortly.' });
    } catch (err: any) {
      toast({ title: 'Could not submit report', description: err.message, variant: 'destructive' });
    } finally {
      setReportSubmitting(false);
    }
  }, [data?.id, reportReason, reportMessage, reportEmail, toast]);

  return (
    <div className="min-h-screen bg-black text-white" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
      <header className="sticky top-0 z-20 bg-black/90 backdrop-blur-md" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="max-w-[860px] mx-auto px-5 h-14 flex items-center justify-between">
          <AppNavBack
            href="/certificates"
            eyebrow="Registry"
            label="All certificates"
            variant="dark"
            size="compact"
          />
          <span className="text-[12px] text-[#636366] tracking-wide uppercase">B-BBEE Certificate</span>
        </div>
      </header>

      <main className="max-w-[860px] mx-auto px-5 pt-10 pb-20">
        {loading && (
          <div className="py-24 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#636366] mx-auto" />
            <p className="text-[13px] text-[#636366] mt-3">Loading certificate…</p>
          </div>
        )}

        {!loading && error && (
          <div className="py-16 text-center rounded-xl border border-[#1c1c1e]">
            <AlertTriangle className="h-6 w-6 text-[#ef4444] mx-auto mb-3" />
            <p className="text-[14px] text-white mb-1">{error}</p>
            <button onClick={() => navigate('/certificates')} className="text-[13px] text-[#a5b4fc] hover:text-white mt-3">
              Browse all certificates
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <>
            <div className="mb-8">
              <p className="text-[11px] tracking-[0.14em] uppercase text-[#818cf8] mb-3" style={{ fontFamily: "'Geist Mono', monospace" }}>
                Public Certificate Record
              </p>
              <h1
                className="text-white tracking-tight mb-4"
                style={{ fontFamily: "'Instrument Serif', serif", fontWeight: 400, fontSize: 'clamp(2rem, 4.5vw, 3rem)', lineHeight: 1.1 }}
              >
                {data.companyName}
              </h1>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge status={data.status || 'unknown'} />
                {data.verified && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium tracking-wide uppercase"
                    style={{ color: '#22d3ee', background: 'rgba(34,211,238,0.12)' }}
                  >
                    <ShieldCheck className="h-3 w-3" />
                    Verified
                  </span>
                )}
                {data.bbbeeLevel != null && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium tracking-wide uppercase"
                    style={{ color: '#a5b4fc', background: 'rgba(165,180,252,0.12)' }}>
                    <Award className="h-3 w-3" />
                    Level {data.bbbeeLevel}
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 mb-10">
              <MetaRow icon={<Hash className="h-4 w-4" />} label="VAT number" value={data.vatNumber || '-'} />
              <MetaRow icon={<Building2 className="h-4 w-4" />} label="Company size" value={data.companySize || '-'} />
              <MetaRow icon={<Award className="h-4 w-4" />} label="B-BBEE level" value={data.bbbeeLevel != null ? `Level ${data.bbbeeLevel}` : '-'} />
              <MetaRow icon={<Percent className="h-4 w-4" />} label="B-BBEE score" value={data.bbbeeScore != null ? `${data.bbbeeScore}` : '-'} />
              <MetaRow icon={<Users2 className="h-4 w-4" />} label="Black ownership" value={data.blackOwnership != null ? `${data.blackOwnership}%` : '-'} />
              <MetaRow icon={<Users2 className="h-4 w-4" />} label="Black women ownership" value={data.blackWomenOwnership != null ? `${data.blackWomenOwnership}%` : '-'} />
              <MetaRow icon={<CalendarClock className="h-4 w-4" />} label="Issue date" value={formatDate(data.issueDate)} />
              <MetaRow icon={<CalendarClock className="h-4 w-4" />} label="Expiry date" value={formatDate(data.expiryDate)} />
              <MetaRow icon={<ShieldCheck className="h-4 w-4" />} label="Verification agency" value={data.verificationAgency || '-'} />
              <MetaRow icon={<Hash className="h-4 w-4" />} label="Certificate number" value={data.certificateNumber || '-'} />
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-10">
              <button
                onClick={handleDownload}
                disabled={downloading || !data.blobName}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-white bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-40 transition-colors"
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                Download certificate
              </button>
              <button
                onClick={loadHistory}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-[#a1a1aa] bg-[#1c1c1e] hover:bg-[#2c2c2e] hover:text-white border border-[#2c2c2e] transition-colors"
              >
                <History className="h-4 w-4" />
                View version history
              </button>
              <button
                onClick={() => { setReportSuccess(false); setShowReport(true); }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-[#a1a1aa] hover:text-white hover:bg-[#2c2c2e] transition-colors"
              >
                <Flag className="h-4 w-4" />
                Report incorrect data
              </button>
            </div>

            {data.updatedAt && (
              <p className="text-[12px] text-[#636366]">Last updated {formatDate(data.updatedAt)}</p>
            )}
          </>
        )}
      </main>

      {/* History dialog */}
      {showHistory && history && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setShowHistory(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg bg-[#0d0d10] rounded-2xl border border-[#2c2c2e] overflow-hidden"
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #1c1c1e' }}>
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-[#a5b4fc]" />
                <span className="text-[14px] text-white">Version history</span>
              </div>
              <button onClick={() => setShowHistory(false)} className="text-[#8e8e93] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-3 max-h-[60vh] overflow-y-auto">
              <div className="rounded-lg p-3 bg-[#1c1c1e] border border-[#2c2c2e]">
                <div className="text-[12px] text-[#22d3ee] uppercase tracking-wide mb-1">Current</div>
                <div className="text-[13px] text-white">{history.latest.fileName || '-'}</div>
                <div className="text-[12px] text-[#8e8e93]">
                  Uploaded {formatDate(history.latest.uploadedAt)}
                  {history.latest.expiryDate && ` · expires ${formatDate(history.latest.expiryDate)}`}
                </div>
              </div>
              {history.versions.length === 0 && (
                <p className="text-[13px] text-[#636366] text-center py-4">No previous versions on record.</p>
              )}
              {history.versions.slice().reverse().map((v, idx) => (
                <div key={idx} className="rounded-lg p-3 bg-[#0d0d10] border border-[#1c1c1e]">
                  <div className="text-[12px] text-[#636366] uppercase tracking-wide mb-1">Previous</div>
                  <div className="text-[13px] text-[#a1a1aa]">{v.fileName || '-'}</div>
                  <div className="text-[12px] text-[#636366]">
                    Replaced {formatDate(v.replacedAt)}
                    {v.expiryDate && ` · expired ${formatDate(v.expiryDate)}`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Report dialog */}
      {showReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={() => setShowReport(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md bg-[#0d0d10] rounded-2xl border border-[#2c2c2e] overflow-hidden"
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #1c1c1e' }}>
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-[#f59e0b]" />
                <span className="text-[14px] text-white">Report this certificate</span>
              </div>
              <button onClick={() => setShowReport(false)} className="text-[#8e8e93] hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            {reportSuccess ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="h-10 w-10 text-[#22c55e] mx-auto mb-3" />
                <p className="text-[14px] text-white mb-1">Report submitted</p>
                <p className="text-[12px] text-[#8e8e93]">An administrator will review your submission.</p>
                <button
                  onClick={() => setShowReport(false)}
                  className="mt-5 px-4 py-2 rounded-lg text-[13px] text-white bg-[#6366f1] hover:bg-[#4f46e5]"
                >
                  Close
                </button>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                <label className="block">
                  <span className="block text-[11px] text-[#8e8e93] mb-1.5 tracking-wide">REASON</span>
                  <select
                    value={reportReason}
                    onChange={(e) => setReportReason(e.target.value as typeof reportReason)}
                    className="w-full bg-[#1c1c1e] rounded-lg px-3 py-2 text-[14px] text-white border border-[#2c2c2e] focus:border-[#6366f1] outline-none"
                  >
                    <option value="incorrect-data">Incorrect data on the certificate</option>
                    <option value="expired">Certificate is expired</option>
                    <option value="fraudulent">Certificate appears fraudulent</option>
                    <option value="duplicate">Duplicate of another listing</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[11px] text-[#8e8e93] mb-1.5 tracking-wide">DETAILS (required)</span>
                  <textarea
                    value={reportMessage}
                    onChange={(e) => setReportMessage(e.target.value)}
                    rows={4}
                    placeholder="Tell us what's wrong with this certificate (minimum 10 characters)…"
                    className="w-full bg-[#1c1c1e] rounded-lg px-3 py-2 text-[14px] text-white border border-[#2c2c2e] focus:border-[#6366f1] outline-none resize-none"
                  />
                </label>
                <label className="block">
                  <span className="block text-[11px] text-[#8e8e93] mb-1.5 tracking-wide">EMAIL (optional)</span>
                  <input
                    type="email"
                    value={reportEmail}
                    onChange={(e) => setReportEmail(e.target.value)}
                    placeholder="So we can follow up if needed"
                    className="w-full bg-[#1c1c1e] rounded-lg px-3 py-2 text-[14px] text-white border border-[#2c2c2e] focus:border-[#6366f1] outline-none"
                  />
                </label>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    onClick={() => setShowReport(false)}
                    disabled={reportSubmitting}
                    className="px-4 py-2 rounded-lg text-[13px] text-[#a1a1aa] hover:text-white hover:bg-[#2c2c2e] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitReport}
                    disabled={reportSubmitting || reportMessage.trim().length < 10}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-white bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-40"
                  >
                    {reportSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Submit report
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
