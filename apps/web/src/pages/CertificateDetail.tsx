import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  Download, Loader2, ShieldCheck, AlertTriangle, Award,
  Building2, Hash, Users2, CalendarClock, History, Flag,
  X, CheckCircle2, Pencil,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { AppNavBack } from '@/components/AppNavBack';
import { useAuth } from '@toolkit/lib/auth';
import { CertificateEditForm } from '@/components/certificates/CertificateEditForm';
import { certificateFormToPatchBody, type CertificateFormValues } from '@/components/certificates/CertificateUploadForm';
import { sectorDisplayLabel, OKIRU_HUB_SECTORS } from '@/lib/okiruHubSectors';

interface CertDetail {
  slug: string;
  companyName: string;
  tradingName?: string | null;
  registrationNumber?: string | null;
  bbbeeLevel: number | null;
  bbbeeLevelStatus?: string | null;
  certificateType?: string | null;
  procurementRecognition?: number | null;
  bbbeeScore: number | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  verificationAgency?: string | null;
  agency?: string | null;
  certificateNumber: string | null;
  expiryDate: string | null;
  issueDate: string | null;
  blobName: string | null;
  fileName?: string | null;
  status?: 'valid' | 'expiring' | 'expired' | 'unknown';
  updatedAt?: string | null;
  verified?: boolean;
  vatNumber?: string | null;
  taxNumber?: string | null;
  companySize?: string | null;
  id?: string | null;
  metadataComplete?: boolean;
  sectorCode?: string | null;
  sectorName?: string | null;
  location?: string | null;
  businessUnit?: string | null;
  empoweringSupplier?: boolean | null;
  valueAddingSupplier?: boolean | null;
  measurementPeriod?: string | null;
  firstProcurementDate?: string | null;
  sizeAtFirstProcurement?: string | null;
  flowThroughBlackOwnership?: number | null;
  blackDesignatedGroupOwnership?: number | null;
  sdRecipient?: boolean | null;
  threeYearContract?: boolean | null;
  annualSpend?: number | null;
  sanasAccreditationNumber?: string | null;
  commissionerDetails?: string | null;
  physicalAddress?: string | null;
  contactDetails?: Record<string, string> | null;
  reviewFields?: string[];
  fieldConfidence?: Record<string, unknown>;
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

function missing(value: string | number | null | undefined): string {
  if (value == null) return 'Missing';
  const text = String(value).trim();
  return text || 'Missing';
}

export default function CertificateDetail({ slug }: { slug: string }) {
  const { toast } = useToast();
  const { user } = useAuth();
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
  const [showEdit, setShowEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

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

  const registryActionsAvailable =
    !!data?.id && data.metadataComplete !== false && !String(data.id).startsWith('blob:');

  const canEdit = !!user && registryActionsAvailable;

  const saveEdit = useCallback(async (values: CertificateFormValues) => {
    if (!data?.id) return;
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/certificates/${encodeURIComponent(data.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(certificateFormToPatchBody(values)),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message || `Update failed (${res.status})`);
      }
      setData((prev) => prev ? {
        ...prev,
        companyName: values.supplierName.trim(),
        vatNumber: values.vatNumber.trim() || null,
        sectorCode: values.sectorCode || null,
        sectorName: OKIRU_HUB_SECTORS.find((s) => s.code === values.sectorCode)?.name ?? null,
        location: values.location.trim() || null,
        businessUnit: values.businessUnit.trim() || null,
        companySize: values.companySize || null,
        bbbeeLevel: values.bbbeeLevel ? Number(values.bbbeeLevel) : null,
        empoweringSupplier: values.empoweringSupplier === 'yes' ? true : values.empoweringSupplier === 'no' ? false : null,
        expiryDate: values.expiryDate || null,
        blackOwnership: values.blackOwnership ? Number(values.blackOwnership) : null,
        blackWomenOwnership: values.blackFemaleOwnership ? Number(values.blackFemaleOwnership) : null,
        flowThroughBlackOwnership: values.flowThroughBlackOwnership ? Number(values.flowThroughBlackOwnership) : null,
        blackDesignatedGroupOwnership: values.blackDesignatedGroupOwnership ? Number(values.blackDesignatedGroupOwnership) : null,
        firstProcurementDate: values.firstProcurementDate || null,
        sizeAtFirstProcurement: values.sizeAtFirstProcurement || null,
        sdRecipient: values.sdRecipient === 'yes' ? true : values.sdRecipient === 'no' ? false : null,
        threeYearContract: values.threeYearContract === 'yes' ? true : values.threeYearContract === 'no' ? false : null,
        annualSpend: values.annualSpend ? Number(values.annualSpend) : null,
      } : prev);
      setShowEdit(false);
      toast({ title: 'Certificate updated' });
    } catch (err: any) {
      toast({ title: 'Could not save changes', description: err.message, variant: 'destructive' });
    } finally {
      setSavingEdit(false);
    }
  }, [data?.id, toast]);

  const loadHistory = useCallback(async () => {
    if (!registryActionsAvailable || !data?.id) {
      toast({ title: 'History unavailable', description: 'Version history requires full certificate metadata.' });
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
  }, [registryActionsAvailable, data?.id, toast]);

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
    if (!registryActionsAvailable || !data?.id) {
      toast({ title: 'Cannot report this certificate', description: 'Reporting requires full certificate metadata.', variant: 'destructive' });
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
  }, [registryActionsAvailable, data?.id, reportReason, reportMessage, reportEmail, toast]);

  return (
    <div className="min-h-screen bg-black text-white" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>
      <header className="sticky top-0 z-20 bg-black/90 backdrop-blur-md" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
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
            {data.metadataComplete === false && (
              <p className="mb-4 text-[13px] text-[#f59e0b] rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-2">
                Metadata missing — some fields may be incomplete until this certificate is fully processed.
              </p>
            )}
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
              <MetaRow icon={<Building2 className="h-4 w-4" />} label="Company" value={missing(data.companyName)} />
              <MetaRow icon={<Building2 className="h-4 w-4" />} label="Sector" value={sectorDisplayLabel(data.sectorCode, data.sectorName)} />
              <MetaRow icon={<Hash className="h-4 w-4" />} label="VAT number" value={missing(data.vatNumber)} />
              <MetaRow icon={<Building2 className="h-4 w-4" />} label="Company size" value={missing(data.companySize)} />
              <MetaRow icon={<Award className="h-4 w-4" />} label="B-BBEE level" value={data.bbbeeLevelStatus || (data.bbbeeLevel != null ? `Level ${data.bbbeeLevel}` : 'Needs review')} />
              <MetaRow icon={<Users2 className="h-4 w-4" />} label="Black ownership" value={data.blackOwnership != null ? `${data.blackOwnership}%` : 'Missing'} />
              <MetaRow icon={<Users2 className="h-4 w-4" />} label="Black women ownership" value={data.blackWomenOwnership != null ? `${data.blackWomenOwnership}%` : 'Missing'} />
              <MetaRow icon={<CalendarClock className="h-4 w-4" />} label="Expiry date" value={data.expiryDate ? formatDate(data.expiryDate) : 'Missing'} />
            </div>

            <div className="flex items-center gap-2 flex-wrap mb-10">
              <button
                onClick={handleDownload}
                disabled={downloading || !data.blobName}
                title={!data.blobName ? 'Download unavailable' : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-white bg-[#6366f1] hover:bg-[#4f46e5] disabled:opacity-40 transition-colors"
              >
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {data.blobName ? 'Download certificate' : 'Download unavailable'}
              </button>
              <button
                onClick={loadHistory}
                disabled={!registryActionsAvailable}
                title={!registryActionsAvailable ? 'Version history unavailable' : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-[#a1a1aa] bg-[#1c1c1e] hover:bg-[#2c2c2e] hover:text-white border border-[#2c2c2e] disabled:opacity-40 transition-colors"
              >
                <History className="h-4 w-4" />
                {registryActionsAvailable ? 'View version history' : 'History unavailable'}
              </button>
              <button
                onClick={() => setShowEdit(true)}
                disabled={!canEdit}
                title={!canEdit ? 'Sign in to edit this certificate' : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-[#a1a1aa] bg-[#1c1c1e] hover:bg-[#2c2c2e] hover:text-white border border-[#2c2c2e] disabled:opacity-40 transition-colors"
              >
                <Pencil className="h-4 w-4" />
                Edit certificate
              </button>
              <button
                onClick={() => { setReportSuccess(false); setShowReport(true); }}
                disabled={!registryActionsAvailable}
                title={!registryActionsAvailable ? 'Report unavailable for this record' : undefined}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] text-[#a1a1aa] hover:text-white hover:bg-[#2c2c2e] disabled:opacity-40 transition-colors"
              >
                <Flag className="h-4 w-4" />
                {registryActionsAvailable ? 'Report incorrect data' : 'Report unavailable'}
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

      {showEdit && data && (
        <CertificateEditForm
          initial={data as unknown as Record<string, unknown>}
          saving={savingEdit}
          onClose={() => setShowEdit(false)}
          onSave={saveEdit}
        />
      )}
    </div>
  );
}
