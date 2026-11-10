import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@toolkit/lib/auth';
import {
  Download, Loader2, AlertCircle, Search, X, ChevronDown,
  RefreshCw, ShieldCheck, Clock, AlertTriangle, Award,
  Upload, CheckCircle2, XCircle, FileUp, FileText, TrendingUp,
  Building2, Hash, Users2, Percent, CalendarClock, Eye, ExternalLink, ArrowRight,
} from 'lucide-react';
import logoCircle from '@assets/Okiru_WHT_Circle_Logo_V1_1772535293807.png';
import { gatedAuthPath } from '@/lib/authRoutes';
import {
  CertificateUploadForm,
  certificateFormToFormData,
  type CertificateFormValues,
} from '@/components/certificates/CertificateUploadForm';
import { OKIRU_HUB_SECTORS, sectorDisplayLabel } from '@/lib/okiruHubSectors';
import { FieldReviewRow, type ReviewAction } from '@/components/certificates/FieldReviewRow';
import { applyFieldStatuses, countNeedsReview, resolveAllFields, type FieldKey, type FieldStatusView } from '@/lib/certificateFieldState';

import { formatPercent } from '@/lib/formatPercent';
const COMPANY_SIZES = ['EME', 'QSE', 'Generic', 'Large', 'Specialised'] as const;

interface CertificateRow {
  name: string;
  fileName: string;
  companyName: string;
  tradingName?: string | null;
  registrationNumber?: string | null;
  vatNumber: string | null;
  taxNumber?: string | null;
  companySize: string | null;
  blackOwnership: number | null;
  blackWomenOwnership: number | null;
  bbbeeLevel: number | null;
  bbbeeLevelStatus?: string | null;
  certificateType?: string | null;
  procurementRecognition?: number | null;
  certificateNumber?: string | null;
  issueDate?: string | null;
  expiryDate: string | null;
  agency?: string | null;
  sanasAccreditationNumber?: string | null;
  status: 'valid' | 'expiring' | 'expired' | 'unknown' | 'pending_verification' | 'extraction_incomplete' | 'processing' | 'failed' | 'file_missing' | 'metadata_only';
  lastModified: string | null;
  id?: string | null;
  slug?: string | null;
  verified?: boolean;
  metadataComplete?: boolean;
  sectorCode?: string | null;
  sectorName?: string | null;
  extractionStatus?: string | null;
  enrichmentStatus?: string | null;
  reviewFields?: string[];
  fieldConfidence?: Record<string, unknown>;
  /** Explicit per-field state from the API: confirmed / needs_review / missing. */
  fieldStatus?: Record<string, FieldStatusView>;
  reviewCandidates?: Record<string, { value?: unknown; confidence?: number; reason?: string; evidence?: string; needsReview?: boolean }>;
  location?: string | null;
  businessUnit?: string | null;
  contentType?: string | null;
  fileSize?: number | null;
  uploadedAt?: string | null;
  hasFile?: boolean;
  previewSupported?: boolean;
}

function certificateHaystack(c: CertificateRow): string {
  const suggested = c.reviewCandidates ?? {};
  return `
    ${c.companyName || ''}
    ${c.vatNumber || ''}
    ${suggested.vatNumber?.value ?? ''}
    ${c.fileName || ''}
    ${c.bbbeeLevel ?? ''}
    ${suggested.bbbeeLevel?.value ?? ''}
    ${c.bbbeeLevelStatus || ''}
    ${c.companySize || ''}
    ${suggested.companySize?.value ?? ''}
    ${c.blackOwnership ?? ''}
    ${suggested.blackOwnership?.value ?? ''}
    ${c.blackWomenOwnership ?? ''}
    ${c.expiryDate || ''}
    ${suggested.expiryDate?.value ?? ''}
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

/**
 * A readable label for a certificate whose text has not been extracted yet.
 *
 * The registry stores storage metadata first and extracts the certificate's
 * contents on a later job, so a freshly synced entry has no supplierName. Its
 * FILE NAME, though, is the uploader's own label and follows the archive's
 * convention — "2027 01 12 Vital Distribution Solutions (Pty) Ltd - QSE.pdf".
 * Rendering "Missing supplier name" over 2,951 of those hid information we
 * already had.
 *
 * This is a DISPLAY fallback only: it is never written back to the registry and
 * never treated as a verified supplier name — the card keeps its "metadata
 * missing" state until extraction confirms the real value.
 */
export function labelFromFileName(fileName: string): string {
  const base = fileName
    .replace(/\.[a-z0-9]+$/i, '')            // extension
    .replace(/^[\s_-]*\d{4}[\s._-]*\d{1,2}[\s._-]*\d{1,2}[\s._-]*/, '') // leading date
    .replace(/[\s-]+(EME|QSE|Generic|Non[\s-]?compliant(\s+Letter)?)\s*$/i, '') // trailing size/kind
    .replace(/[_]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return base || fileName;
}

function registryItemToRow(item: Record<string, unknown>): CertificateRow {
  const status = String(item.status || 'unknown') as CertificateRow['status'];
  const fileName = String(item.file_name || item.fileName || item.blob_name || item.blobName || 'certificate');
  const supplierName = typeof item.supplier_name === 'string'
    ? item.supplier_name.trim()
    : typeof item.supplierName === 'string'
      ? item.supplierName.trim()
      : typeof item.companyName === 'string'
        ? item.companyName.trim()
        : '';
  const fieldStatus = item.field_status && typeof item.field_status === 'object'
    ? item.field_status as Record<string, FieldStatusView>
    : item.fieldStatus && typeof item.fieldStatus === 'object'
      ? item.fieldStatus as Record<string, FieldStatusView>
      : undefined;
  const reviewCandidates = item.review_candidates && typeof item.review_candidates === 'object'
    ? item.review_candidates as CertificateRow['reviewCandidates']
    : item.reviewCandidates && typeof item.reviewCandidates === 'object'
      ? item.reviewCandidates as CertificateRow['reviewCandidates']
      : {};
  const fieldConfidence = item.field_confidence && typeof item.field_confidence === 'object'
    ? item.field_confidence as Record<string, unknown>
    : item.fieldConfidence && typeof item.fieldConfidence === 'object'
      ? item.fieldConfidence as Record<string, unknown>
      : {};
  return {
    id: typeof item.id === 'string' ? item.id : null,
    slug: typeof item.slug === 'string' ? item.slug : null,
    name: String(item.blob_name || item.blobName || ''),
    fileName,
    companyName: supplierName || labelFromFileName(fileName),
    vatNumber: typeof item.vat_number === 'string' ? item.vat_number : typeof item.vatNumber === 'string' ? item.vatNumber : null,
    companySize: typeof item.company_size === 'string' ? item.company_size : typeof item.companySize === 'string' ? item.companySize : null,
    blackOwnership: typeof item.black_ownership === 'number' ? item.black_ownership : typeof item.blackOwnership === 'number' ? item.blackOwnership : null,
    blackWomenOwnership: typeof item.black_women_ownership === 'number' ? item.black_women_ownership : typeof item.blackWomenOwnership === 'number' ? item.blackWomenOwnership : null,
    bbbeeLevel: typeof item.bbbee_level === 'number' ? item.bbbee_level : typeof item.bbbeeLevel === 'number' ? item.bbbeeLevel : null,
    certificateType: typeof item.certificate_type === 'string' ? item.certificate_type : typeof item.certificateType === 'string' ? item.certificateType : null,
    certificateNumber: typeof item.certificate_number === 'string' ? item.certificate_number : typeof item.certificateNumber === 'string' ? item.certificateNumber : null,
    tradingName: typeof item.trading_name === 'string' ? item.trading_name : typeof item.tradingName === 'string' ? item.tradingName : null,
    registrationNumber: typeof item.company_registration_number === 'string'
      ? item.company_registration_number
      : typeof item.registrationNumber === 'string'
        ? item.registrationNumber
        : null,
    taxNumber: typeof item.tax_number === 'string' ? item.tax_number : typeof item.taxNumber === 'string' ? item.taxNumber : null,
    bbbeeLevelStatus: typeof item.bbbee_level_status === 'string' ? item.bbbee_level_status : typeof item.bbbeeLevelStatus === 'string' ? item.bbbeeLevelStatus : null,
    procurementRecognition: typeof item.procurement_recognition === 'number' ? item.procurement_recognition : typeof item.procurementRecognition === 'number' ? item.procurementRecognition : null,
    issueDate: typeof item.issue_date === 'string' ? item.issue_date : typeof item.issueDate === 'string' ? item.issueDate : null,
    expiryDate: typeof item.expiry_date === 'string' ? item.expiry_date : typeof item.expiryDate === 'string' ? item.expiryDate : null,
    status,
    lastModified: typeof item.uploaded_at === 'string' ? item.uploaded_at : typeof item.lastModified === 'string' ? item.lastModified : null,
    uploadedAt: typeof item.uploaded_at === 'string' ? item.uploaded_at : typeof item.uploadedAt === 'string' ? item.uploadedAt : null,
    sectorCode: typeof item.sector_code === 'string' ? item.sector_code : typeof item.sectorCode === 'string' ? item.sectorCode : null,
    sectorName: typeof item.sector_name === 'string' ? item.sector_name : typeof item.sectorName === 'string' ? item.sectorName : null,
    extractionStatus: typeof item.extraction_status === 'string' ? item.extraction_status : typeof item.extractionStatus === 'string' ? item.extractionStatus : null,
    enrichmentStatus: typeof item.enrichment_status === 'string'
      ? item.enrichment_status
      : typeof item.enrichmentStatus === 'string'
        ? item.enrichmentStatus
        : item.review_required === true || item.reviewRequired === true
          ? 'review_required'
          : null,
    reviewFields: Array.isArray(item.review_fields)
      ? item.review_fields.filter((field): field is string => typeof field === 'string')
      : Array.isArray(item.reviewFields)
        ? item.reviewFields.filter((field): field is string => typeof field === 'string')
        : [],
    fieldStatus,
    fieldConfidence,
    reviewCandidates,
    agency: typeof item.verification_agency === 'string' ? item.verification_agency : typeof item.verificationAgency === 'string' ? item.verificationAgency : null,
    sanasAccreditationNumber: typeof item.sanas_accreditation_number === 'string'
      ? item.sanas_accreditation_number
      : typeof item.sanasAccreditationNumber === 'string'
        ? item.sanasAccreditationNumber
        : null,
    metadataComplete: Boolean(item.supplier_name || item.supplierName || item.companyName),
    contentType: typeof item.content_type === 'string' ? item.content_type : typeof item.contentType === 'string' ? item.contentType : null,
    fileSize: typeof item.file_size === 'number' ? item.file_size : typeof item.fileSize === 'number' ? item.fileSize : null,
    hasFile: item.has_file !== false && item.hasFile !== false,
    previewSupported: item.preview_supported === true || item.previewSupported === true,
  };
}

function parseCertificateListEnvelope(json: unknown): { items: CertificateRow[]; total: number | null; totalPages: number | null } {
  if (json && typeof json === 'object') {
    const root = json as Record<string, unknown>;
    const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : root;
    if (Array.isArray(data.items)) {
      return {
        items: data.items.map((item) => registryItemToRow(item as Record<string, unknown>)),
        total: typeof data.total === 'number' ? data.total : null,
        totalPages: typeof data.total_pages === 'number' ? data.total_pages : null,
      };
    }
  }
  const items = parseCertificateListJson(json);
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    const data = o.data;
    if (data && typeof data === 'object' && typeof (data as { total?: unknown }).total === 'number') {
      return { items, total: (data as { total: number }).total, totalPages: null };
    }
    if (typeof o.total === 'number') return { items, total: o.total, totalPages: null };
  }
  return { items, total: Array.isArray(json) ? items.length : null, totalPages: null };
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

function encodeBridgeUrl(url: string): string {
  if (typeof btoa === 'function') {
    return btoa(unescape(encodeURIComponent(url))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const bytes = Array.from(url, (ch) => ch.charCodeAt(0) & 0xff);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += alphabet[a >> 2];
    out += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
    if (b !== undefined) out += alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)];
    if (c !== undefined) out += alphabet[c & 63];
  }
  return out;
}

function requestJsonViaScript(url: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new TypeError('Failed to fetch'));
    }, 30_000);
    script.onload = () => {
      window.clearTimeout(timeout);
      try {
        const status = Number(script.dataset.status) || 200;
        const json = script.dataset.payload ? JSON.parse(script.dataset.payload) : null;
        script.remove();
        resolve({ ok: status >= 200 && status < 300, status, json });
      } catch {
        script.remove();
        reject(new TypeError('Failed to fetch'));
      }
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new TypeError('Failed to fetch'));
    };
    script.src = `/__okiru_data?dataset=1&u=${encodeURIComponent(encodeBridgeUrl(url))}`;
    document.body.appendChild(script);
  });
}

async function requestJson(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; json: unknown }> {
  const isGet = !init?.method || String(init.method).toUpperCase() === 'GET';
  if (isGet && typeof document !== 'undefined') {
    return requestJsonViaScript(url);
  }
  if (typeof XMLHttpRequest === 'function') {
    return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init?.method || 'GET', url, true);
    xhr.withCredentials = init?.credentials === 'include';
    const headers = init?.headers;
    if (typeof Headers !== 'undefined' && headers instanceof Headers) {
      headers.forEach((value, key) => xhr.setRequestHeader(key, value));
    } else if (headers && typeof headers === 'object' && !Array.isArray(headers)) {
      for (const [key, value] of Object.entries(headers as Record<string, string>)) {
        xhr.setRequestHeader(key, value);
      }
    }
    xhr.onload = () => {
      let json: unknown = null;
      try {
        json = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        json = null;
      }
      resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json });
    };
    xhr.onerror = () => {
      if (isGet && typeof document !== 'undefined') {
        requestJsonViaScript(url).then(resolve, reject);
        return;
      }
      reject(new TypeError('Failed to fetch'));
    };
    xhr.ontimeout = () => {
      if (isGet && typeof document !== 'undefined') {
        requestJsonViaScript(url).then(resolve, reject);
        return;
      }
      reject(new TypeError('Failed to fetch'));
    };
    xhr.send((init?.body as XMLHttpRequestBodyInit | null | undefined) ?? null);
    });
  }

  const res = await window.fetch(url, init);
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
}

function formatExpiry(dateStr: string | null): string {
  if (!dateStr) return 'Missing';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Missing';
  return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatPct(n: number | null): string {
  return formatPercent(n);
}

function displayValue(value: string | number | null | undefined): string {
  if (value == null) return 'Missing';
  const text = String(value).trim();
  return text || 'Missing';
}

function candidateValue(cert: CertificateRow, field: string): unknown {
  return cert.reviewCandidates?.[field]?.value;
}

function displayCandidate(cert: CertificateRow, field: string): string | null {
  const value = candidateValue(cert, field);
  if (value == null) return null;
  if (field === 'expiryDate') return formatExpiry(String(value));
  if (field === 'blackOwnership' || field === 'blackWomenOwnership') {
    const n = Number(value);
    return Number.isFinite(n) ? formatPct(n) : String(value);
  }
  if (field === 'bbbeeLevel') return `Level ${value}`;
  return displayValue(value as string | number | null | undefined);
}

function hasCandidate(cert: CertificateRow, field: string): boolean {
  return displayCandidate(cert, field) != null;
}

/**
 * A list cell with no trusted value. It is either a held candidate ("Needs review",
 * shown with its value) or genuinely missing - never an ambiguous blank.
 */
function SuggestedValue({ value, title }: { value: string | null; title?: string }) {
  if (!value) {
    return (
      <span className="text-[color:var(--muted)]" title={title || 'Nothing was found for this field'} data-state="missing">
        Missing
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1" title={title || 'Suggested value - open the certificate to confirm, edit or reject it'} data-state="needs_review">
      <span className="text-amber-700">{value}</span>
      <span className="rounded bg-amber-500/15 px-1 text-[9px] font-medium uppercase tracking-wide text-amber-700">review</span>
    </span>
  );
}

function confidenceTitle(cert: CertificateRow, field: string): string | undefined {
  const meta = cert.fieldConfidence?.[field];
  if (!meta || typeof meta !== 'object') return undefined;
  const record = meta as Record<string, unknown>;
  const confidence = typeof record.confidence === 'number' ? `${Math.round(record.confidence * 100)}%` : null;
  const method = typeof record.extractionMethod === 'string' ? record.extractionMethod : null;
  const snippet = typeof record.sourceTextSnippet === 'string' ? record.sourceTextSnippet : null;
  return [confidence && `Confidence ${confidence}`, method, snippet].filter(Boolean).join(' · ') || undefined;
}

function needsReview(cert: CertificateRow): boolean {
  return cert.enrichmentStatus === 'review_required'
    || cert.enrichmentStatus === 'failed'
    || (cert.reviewFields?.length ?? 0) > 0
    || Object.keys(cert.reviewCandidates ?? {}).length > 0;
}

/**
 * Certificates and affidavits are ONE registry.
 *
 * They used to be split across two tabs, and the split misled twice over: the
 * tab counts were derived here from the file name, while the list itself was
 * filtered by the server on `certificateType` — a field almost nothing writes.
 * So the Affidavits tab promised a number it could not show, and a search
 * inside either tab silently hid every match sitting in the other one. A
 * supplier who holds an affidavit rather than a certificate simply looked
 * absent.
 *
 * The list is now unbroken and the headline is a single total. The document
 * type survives as an optional filter pill for anyone who wants to narrow.
 */
function StatusBadge({ status, expiryDate }: { status: CertificateRow['status']; expiryDate: string | null }) {
  const map = {
    valid:    { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', label: 'Valid' },
    expiring: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Expiring' },
    expired:  { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Expired' },
    unknown:  { color: 'var(--body)', bg: 'rgba(142,142,147,0.12)', label: 'Unknown' },
    pending_verification: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Pending review' },
    extraction_incomplete: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Extraction incomplete' },
    processing: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: 'Processing' },
    failed: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Failed' },
    file_missing: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'File missing' },
    metadata_only: { color: 'var(--body)', bg: 'rgba(142,142,147,0.12)', label: 'Metadata only' },
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
            ? 'bg-[#18181b] text-white'
            : 'bg-white text-[color:var(--body)] hover:text-[#18181b] border border-[color:var(--rule)]'
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
          <div className="absolute top-full left-0 mt-1 z-40 bg-white border border-[color:var(--rule)] rounded-lg overflow-hidden min-w-[160px] shadow-xl">
            {options.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-[13px] transition-colors ${
                  value === opt.value
                    ? 'bg-zinc-100 text-[#18181b]'
                    : 'text-[color:var(--body)] hover:bg-zinc-50 hover:text-[#18181b]'
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
    <div className="flex items-center gap-3 rounded-lg px-4 py-3 bg-[color:var(--ink-3)] border border-[color:var(--rule)]">
      <div
        className="shrink-0 flex items-center justify-center w-9 h-9 rounded-lg bg-white/[0.04]"
        style={{ color: iconColor }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[20px] font-semibold text-white leading-tight">{value}</div>
        <div className="text-[11px] text-[color:var(--body)] truncate font-medium">{title}</div>
        {subtitle && (
          <div className="text-[10px] text-[color:var(--muted)] truncate mt-0.5">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="py-4 px-4 flex items-center justify-between" style={{ borderBottom: '1px solid #e4e4e7' }}>
      <div className="space-y-2 flex-1">
        <div className="h-3.5 w-56 rounded bg-zinc-200 animate-pulse" />
        <div className="h-2.5 w-40 rounded bg-zinc-100 animate-pulse" />
      </div>
      <div className="h-8 w-20 rounded-lg bg-zinc-100 animate-pulse" />
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [page, setPage] = useState(() => Math.max(1, Number(new URLSearchParams(window.location.search).get('page')) || 1));
  const [pageSize, setPageSize] = useState(() => Math.min(100, Math.max(10, Number(new URLSearchParams(window.location.search).get('page_size')) || 50)));
  const [totalCertificates, setTotalCertificates] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [sortBy, setSortBy] = useState(new URLSearchParams(window.location.search).get('sort_by') || 'uploaded_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => new URLSearchParams(window.location.search).get('sort_order') === 'asc' ? 'asc' : 'desc');
  const [stats, setStats] = useState<CertStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const initialQuery = useMemo(() => new URLSearchParams(window.location.search), []);
  // '' means both — the default. `?type=affidavit` links from the old tabbed
  // view keep working, they just resolve to the filter instead of a tab.
  const [docTypeFilter, setDocTypeFilter] = useState(() => {
    const type = initialQuery.get('type');
    if (type === 'affidavit') return 'affidavits';
    if (type === 'certificate') return 'certificates';
    return '';
  });
  const [search, setSearch] = useState(() => initialQuery.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(() => initialQuery.get('search') || '');
  const [statusFilter, setStatusFilter] = useState(() => initialQuery.get('status') || '');
  const [sizeFilter, setSizeFilter] = useState(() => initialQuery.get('size') || '');
  const [sectorFilter, setSectorFilter] = useState(() => initialQuery.get('sector') || '');
  const [ownershipFilter, setOwnershipFilter] = useState(() => initialQuery.get('ownership') || '');
  const [bbbeeLevelFilter, setBbbeeLevelFilter] = useState(() => initialQuery.get('level') || '');
  const [fileTypeFilter, setFileTypeFilter] = useState(() => initialQuery.get('file_type') || '');
  const [reviewOnly, setReviewOnly] = useState(() => initialQuery.get('review') === '1');

  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [previewCert, setPreviewCert] = useState<CertificateRow | null>(null);
  const filtersMounted = useRef(false);

  // Upload modal state
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleCertificateSaved = useCallback((updated: CertificateRow) => {
    setAllCerts(prev => prev.map(cert => (
      (updated.id && cert.id === updated.id) || cert.name === updated.name ? updated : cert
    )));
    setPreviewCert(updated);
  }, []);

  useEffect(() => {
    const previous = document.title;
    document.title = 'Okiru';
    return () => { document.title = previous; };
  }, []);

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

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!filtersMounted.current) {
      filtersMounted.current = true;
      return;
    }
    setPage(1);
  }, [debouncedSearch, statusFilter, sizeFilter, sectorFilter, ownershipFilter, bbbeeLevelFilter, fileTypeFilter, reviewOnly, docTypeFilter]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set('page', String(page));
    if (pageSize !== 50) params.set('page_size', String(pageSize));
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    if (sizeFilter) params.set('size', sizeFilter);
    if (sectorFilter) params.set('sector', sectorFilter);
    if (ownershipFilter) params.set('ownership', ownershipFilter);
    if (bbbeeLevelFilter) params.set('level', bbbeeLevelFilter);
    if (fileTypeFilter) params.set('file_type', fileTypeFilter);
    if (reviewOnly) params.set('review', '1');
    if (docTypeFilter === 'affidavits') params.set('type', 'affidavit');
    else if (docTypeFilter === 'certificates') params.set('type', 'certificate');
    if (sortBy !== 'uploaded_at') params.set('sort_by', sortBy);
    if (sortOrder !== 'desc') params.set('sort_order', sortOrder);
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [page, pageSize, debouncedSearch, statusFilter, sizeFilter, sectorFilter, ownershipFilter, bbbeeLevelFilter, fileTypeFilter, reviewOnly, docTypeFilter, sortBy, sortOrder]);

  const loadAllCerts = useCallback(async () => {
    setAllCertsLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        page_size: String(pageSize),
        sort_by: sortBy,
        sort_order: sortOrder,
      });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      if (sizeFilter) params.set('size', sizeFilter);
      if (sectorFilter) params.set('sector', sectorFilter);
      if (bbbeeLevelFilter) params.set('bbbee_level', bbbeeLevelFilter);
      if (fileTypeFilter) params.set('file_type', fileTypeFilter);
      if (reviewOnly) params.set('review_required', 'true');
      // Omitted by default, so the registry returns certificates and affidavits together.
      if (docTypeFilter) params.set('document_kind', docTypeFilter);
      if (ownershipFilter) {
        const [min, max] = ownershipFilter.split('-');
        params.set('min_ownership', min);
        params.set('max_ownership', max);
      }
      const res = await requestJson(`/internal/records?${params.toString()}`);
      const raw = res.json;
      if (!res.ok) throw new Error((raw as any)?.error?.message || `Error ${res.status}`);
      const result = parseCertificateListEnvelope(raw);
      setAllCerts(result.items);
      setTotalCertificates(result.total ?? result.items.length);
      setTotalPages(result.totalPages ?? Math.max(1, Math.ceil((result.total ?? result.items.length) / pageSize)));
    } catch (err: any) {
      setAllCerts([]);
      setLoadError(err.message || 'Could not load certificates');
      toast({ title: 'Could not load certificates', description: err.message || 'Try refreshing', variant: 'destructive' });
    } finally {
      setAllCertsLoading(false);
    }
  }, [page, pageSize, sortBy, sortOrder, debouncedSearch, statusFilter, sizeFilter, sectorFilter, ownershipFilter, bbbeeLevelFilter, fileTypeFilter, reviewOnly, docTypeFilter, toast]);

  const loadStats = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const res = await requestJson('/internal/records/stats', { signal: controller.signal });
      if (res.ok) {
        const raw = res.json;
        const next = parseCertStatsJson(raw);
        if (next) setStats(next);
      }
    } catch {
      // non-fatal
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadAllCerts();
      setLoading(false);
      void loadStats();
    })();
  }, [loadAllCerts, loadStats]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadAllCerts();
    setRefreshing(false);
    void loadStats();
  }, [loadAllCerts, loadStats]);

  const reviewCount = useMemo(() => allCerts.filter(needsReview).length, [allCerts]);
  const hasActiveFilters = !!(search.trim() || statusFilter || sizeFilter || sectorFilter || ownershipFilter || bbbeeLevelFilter || fileTypeFilter || docTypeFilter || reviewOnly);

  const filtered = allCerts;

  const clearAllFilters = () => {
    setSearch('');
    setStatusFilter('');
    setSizeFilter('');
    setSectorFilter('');
    setOwnershipFilter('');
    setBbbeeLevelFilter('');
    setFileTypeFilter('');
    setDocTypeFilter('');
    setReviewOnly(false);
    setPage(1);
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
      const res = await fetch('/internal/records/upload', { method: 'POST', body: fd });
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
      setPage(1);
      await loadAllCerts();
      void loadStats();
    } catch (err: any) {
      toast({ title: 'Upload failed', description: err.message || 'Please try again', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  }, [toast, loadAllCerts, loadStats, navigate]);

  const downloadCertificate = useCallback(async (certificate: CertificateRow) => {
    if (!certificate.id) return;
    if (!user) {
      navigate(gatedAuthPath({ redirect: '/certificates' }));
      return;
    }
    setDownloadingFile(certificate.id);
    try {
      const res = await fetch(`/internal/records/${encodeURIComponent(certificate.id)}/download`, { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: 'Download failed' }));
        throw new Error(body.message || `Error ${res.status}`);
      }
      const body = await res.json();
      const url = body?.data?.url || body?.url;
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
  }, [toast, user, navigate]);

  const headlineCount = totalCertificates || stats?.total || 0;
  const isAuthenticated = !!user && !authLoading;

  return (
    <div className="certificate-hub-light min-h-screen bg-white text-[#18181b]" style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif" }}>

      {/* ─── Header ─────────────────────────────────────────────── */}
      {/* This page is public as well as signed-in. Signed in, the shell above
          carries the wordmark, the trail and the account menu, so this bar
          keeps only what belongs to the registry itself. Signed out there is
          no shell, so it keeps the wordmark and the sign-in actions too. */}
      <header
        className={`sticky top-0 z-20 border-b border-zinc-200 bg-white/95 backdrop-blur-md ${isAuthenticated ? 'border-b' : ''}`}
        style={undefined}
      >
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          {isAuthenticated ? (
            <span className="text-[12px] text-[color:var(--muted)] tracking-wide uppercase">B-BBEE Certificate Registry</span>
          ) : (
            <Link href="/" className="flex items-center gap-2 text-[16px] font-semibold text-[#18181b]">
              Okiru
            </Link>
          )}
          {!isAuthenticated && (
            <span className="hidden sm:inline text-[12px] text-[color:var(--muted)] tracking-wide uppercase">B-BBEE Certificate Registry</span>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-1 text-[13px] text-[color:var(--body)] hover:text-[#18181b] transition-colors disabled:opacity-50"
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
                  href={gatedAuthPath({ redirect: '/certificates' })}
                  className="text-[13px] text-[color:var(--body)] hover:text-[#18181b] transition-colors px-3 py-1.5"
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

      <main className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-6 pb-20">

        {/* ─── Toolkit promo banner (image + overlaid CTAs) ─── */}
        <div className="relative mb-6 overflow-hidden rounded-2xl border border-black/5 shadow-sm">
          <img
            src="/certificate-hub-banner.png"
            alt="Okiru Toolkit — know your B-BBEE level in minutes. The B-BBEE Calculator auto-applies your latest, best-scoring certificate to your scorecard."
            className="block h-auto w-full"
            loading="eager"
          />
          {/* Action buttons overlaid on the banner footer. Tweak right-[..]/bottom-[..] to reposition. */}
          <div className="absolute bottom-[6%] right-[3%] flex flex-wrap items-center gap-2 sm:gap-3">
            {isAuthenticated ? (
              <Link
                href="/hub"
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#6d4bff] px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-black/25 transition-colors hover:bg-[#5a3ce0] sm:px-5 sm:text-[14px]"
              >
                Open the Toolkit
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  href={gatedAuthPath({ mode: "register", redirect: "/hub" })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#6d4bff] px-4 py-2.5 text-[13px] font-semibold text-white shadow-lg shadow-black/25 transition-colors hover:bg-[#5a3ce0] sm:px-5 sm:text-[14px]"
                >
                  Get started free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href={gatedAuthPath({ redirect: "/hub" })}
                  className="inline-flex items-center rounded-lg border border-black/10 bg-white/90 px-4 py-2.5 text-[13px] font-medium text-[#241d4a] shadow-lg shadow-black/10 backdrop-blur transition-colors hover:bg-white sm:px-5 sm:text-[14px]"
                >
                  Sign in
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="mb-5">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-[color:var(--muted)]">
            <FileText className="h-3.5 w-3.5 text-[#818cf8]" />
            Certificate Hub
          </div>
          <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-center">
            <h1 className="flex shrink-0 items-center gap-2 text-[24px] font-semibold tracking-tight text-[#18181b] sm:text-[28px]">
              {loading && allCerts.length === 0 ? 'Loading documents' : `${headlineCount.toLocaleString()} certificates & affidavits`}
              {(loading || allCertsLoading) && (
                <Loader2 className="h-4 w-4 animate-spin text-[color:var(--muted)]" aria-label="Loading more certificates" />
              )}
            </h1>
            <div className="relative min-w-0 flex-1 lg:ml-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[color:var(--muted)]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search every certificate and affidavit by company, VAT number, or B-BBEE level…"
                className="w-full rounded-lg border border-[color:var(--rule)] bg-white py-2.5 pl-11 pr-11 text-[14px] text-[#18181b] outline-none placeholder:text-[#a1a1aa] focus:border-[#6366f1] transition-colors"
                autoComplete="off"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[color:var(--muted)] hover:text-[#18181b] transition-colors"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {reviewCount > 0 && (
              <button
                type="button"
                onClick={() => setReviewOnly((value) => !value)}
                className={[
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2.5 text-[12px] transition-colors',
                  reviewOnly
                    ? 'bg-[#f59e0b] text-black'
                    : 'border border-[#f59e0b]/35 bg-[#f59e0b]/10 text-[#fbbf24] hover:bg-[#f59e0b]/15',
                ].join(' ')}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Review queue
                <span className={reviewOnly ? 'text-black/60' : 'text-[#f59e0b]/70'}>{reviewCount.toLocaleString()}</span>
              </button>
            )}
          </div>
          <div className="mt-2 text-[12px] text-[color:var(--muted)]">
            {stats
              ? <>South Africa&apos;s public B-BBEE registry · <span className="text-[#22c55e]">{stats.valid.toLocaleString()} valid</span> · <span className="text-[#f59e0b]">{stats.expiring.toLocaleString()} expiring soon</span></>
              : 'South Africa’s public B-BBEE registry'}
          </div>
        </div>

        {/* ─── Hero ───────────────────────────────────────────── */}
        <div className="hidden">
          <p className="text-[11px] tracking-[0.14em] uppercase text-[#818cf8] mb-3" style={{ fontFamily: "'Geist Mono', monospace" }}>
            Public B-BBEE Certificate Registry · South Africa
          </p>
          <h1
            className="text-white tracking-tight"
          >
            {loading ? '…' : headlineCount.toLocaleString()} B-BBEE certificates
            <br />
            <em style={{ color: '#a5b4fc' }}>available to the public.</em>
          </h1>
          <p className="mt-4 text-[14px] text-[#a1a1aa] max-w-[640px] leading-relaxed">
            Search and verify South African B-BBEE compliance certificates. Filter by company size, ownership, and validity. Anyone can browse - sign in to add your own certificate to the registry.
          </p>
        </div>

        {/* ─── KPIs ───────────────────────────────────────────── */}
        {!loading && stats && (
          <div className="hidden">
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

        {!loading && reviewCount > 0 && (
          <div className="hidden">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[13px] font-medium text-[#fbbf24]">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{reviewCount.toLocaleString()} certificate{reviewCount === 1 ? '' : 's'} need metadata review</span>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--body)]">
                  Open these records to preview the certificate and verify uncertain enrichment fields.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {reviewOnly && (
                  <button
                    type="button"
                    onClick={() => setReviewOnly(false)}
                    className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-[12px] text-[color:var(--body)] hover:bg-white/[0.06] hover:text-white transition-colors"
                  >
                    Show all
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setReviewOnly(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#f59e0b] px-3 py-2 text-[12px] font-medium text-black hover:bg-[#fbbf24] transition-colors"
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Review now
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─── Toolbar: filters ───────────────────────────────── */}
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <FilterPill
              label="Document type"
              value={docTypeFilter}
              options={[
                { value: 'certificates', label: 'Certificates only' },
                { value: 'affidavits', label: 'Affidavits only' },
              ]}
              onChange={setDocTypeFilter}
            />
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
            <FilterPill
              label="B-BBEE level"
              value={bbbeeLevelFilter}
              options={Array.from({ length: 8 }, (_, index) => ({ value: String(index + 1), label: `Level ${index + 1}` }))}
              onChange={setBbbeeLevelFilter}
            />
            <FilterPill
              label="File type"
              value={fileTypeFilter}
              options={[
                { value: 'pdf', label: 'PDF' },
                { value: 'png', label: 'PNG' },
                { value: 'jpg', label: 'JPEG' },
                { value: 'docx', label: 'Word' },
              ]}
              onChange={setFileTypeFilter}
            />
            <label className="inline-flex items-center gap-2 text-[12px] text-[color:var(--body)]">
              Sort
              <select
                value={`${sortBy}:${sortOrder}`}
                onChange={(event) => {
                  const [field, order] = event.target.value.split(':');
                  setSortBy(field);
                  setSortOrder(order as 'asc' | 'desc');
                  setPage(1);
                }}
                className="rounded-lg border border-[color:var(--rule)] bg-white px-2.5 py-1.5 text-[12px] text-[#18181b] outline-none"
              >
                <option value="uploaded_at:desc">Newest uploaded</option>
                <option value="uploaded_at:asc">Oldest uploaded</option>
                <option value="supplier_name:asc">Supplier A-Z</option>
                <option value="expiry_date:asc">Expiry date</option>
                <option value="bbbee_level:asc">Best B-BBEE level</option>
              </select>
            </label>
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-[12px] text-[color:var(--muted)] hover:text-[#18181b] transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* ─── List ──────────────────────────────────────────── */}

        {!loading && (hasActiveFilters || reviewOnly) && (
          <p className="mb-3 text-[13px] text-[color:var(--body)]">
            {allCertsLoading
              ? 'Loading…'
              : `${filtered.length.toLocaleString()} result${filtered.length !== 1 ? 's' : ''}${search.trim() ? ` for "${search.trim()}"` : ''}${reviewOnly ? ' needing review' : ''}`}
          </p>
        )}

        {loadError && !loading ? (
          <div className="rounded-xl border border-[color:var(--rule)] bg-white px-6 py-14 text-center">
            <AlertCircle className="mx-auto h-6 w-6 text-[#ef4444]" />
            <p className="mt-3 text-[14px] text-[#18181b]">Could not load certificates</p>
            <p className="mt-1 text-[12px] text-[color:var(--body)]">{loadError}</p>
            <button onClick={handleRefresh} className="mt-4 rounded-lg bg-white px-3 py-2 text-[12px] font-medium text-black">Retry</button>
          </div>
        ) : (loading || allCertsLoading) && allCerts.length === 0 ? (
          <div className="rounded-xl overflow-hidden border border-zinc-200 bg-white">
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
          <div className="rounded-xl border border-zinc-300 bg-zinc-50 shadow-sm">
            <div className="sticky top-14 z-10 hidden rounded-t-xl border-b border-zinc-300 bg-zinc-100/95 backdrop-blur-md md:grid grid-cols-[minmax(240px,2.2fr)_minmax(110px,1fr)_minmax(72px,0.55fr)_minmax(86px,0.7fr)_minmax(120px,0.85fr)_minmax(140px,0.9fr)_132px] items-center gap-4 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-600 shadow-[0_8px_20px_rgba(24,24,27,0.04)]">
              <div>Company</div>
              <div>VAT number</div>
              <div>Level</div>
              <div>Size</div>
              <div>Ownership</div>
              <div>Expiry</div>
              <div className="text-right">Open</div>
            </div>
            {filtered.map((cert, idx) => (
              <CertRow
                key={cert.id || cert.name}
                cert={cert}
                searchQuery={search}
                isLast={idx === filtered.length - 1}
                isDownloading={downloadingFile === cert.id}
                onDownload={() => downloadCertificate(cert)}
                onPreview={() => setPreviewCert(cert)}
              />
            ))}
          </div>
        )}

        {!loadError && totalCertificates > 0 && (
          <div className="mt-4 flex flex-col gap-3 border-t border-zinc-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] text-[color:var(--body)]">
              Showing {((page - 1) * pageSize + 1).toLocaleString()}-{Math.min(page * pageSize, totalCertificates).toLocaleString()} of {totalCertificates.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <label className="text-[12px] text-[color:var(--body)]">
                Rows
                <select
                  value={pageSize}
                  onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
                  className="ml-2 rounded-lg border border-[color:var(--rule)] bg-white px-2 py-1.5 text-[#18181b] outline-none"
                >
                  {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || allCertsLoading}
                className="rounded-lg border border-[color:var(--rule)] px-3 py-1.5 text-[12px] text-[#18181b] disabled:opacity-30"
              >
                Previous
              </button>
              <span className="min-w-[88px] text-center text-[12px] text-[color:var(--body)]">{page} of {totalPages}</span>
              <button
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || allCertsLoading}
                className="rounded-lg border border-[color:var(--rule)] px-3 py-1.5 text-[12px] text-[#18181b] disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}

      </main>

      {/* ─── Certificate Preview modal ──────────────────────── */}
      {previewCert && (
        <CertPreviewModal cert={previewCert} onClose={() => setPreviewCert(null)} onSaved={handleCertificateSaved} />
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
      className="group bg-white px-4 py-3.5 transition-colors hover:bg-zinc-50 focus-within:bg-zinc-50"
      style={{ borderBottom: isLast ? 'none' : '1px solid #d4d4d8' }}
    >
      <div className="md:grid md:grid-cols-[minmax(240px,2.2fr)_minmax(110px,1fr)_minmax(72px,0.55fr)_minmax(86px,0.7fr)_minmax(120px,0.85fr)_minmax(140px,0.9fr)_132px] md:items-center md:gap-4">
        <div className="min-w-0">
        <div className="flex items-center gap-2 text-[14px] font-semibold leading-snug text-[#18181b]">
          {cert.slug ? (
            <Link
              href={`/certificates/${cert.slug}`}
              className="min-w-0 truncate text-[#18181b] transition-colors hover:text-[#4f46e5]"
            >
              <HighlightMatch text={cert.companyName} query={searchQuery} />
            </Link>
          ) : (
            <span className="min-w-0 truncate"><HighlightMatch text={cert.companyName} query={searchQuery} /></span>
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
            {needsReview(cert) && (
              <span
                title={cert.reviewFields?.length ? `Needs review: ${cert.reviewFields.join(', ')}` : 'Metadata needs review'}
                className="inline-flex shrink-0 items-center rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 ring-1 ring-amber-200"
                aria-label="Needs review"
              >
                Review
              </span>
            )}
        </div>
        <div className="hidden">
          {(cert.vatNumber || hasCandidate(cert, 'vatNumber')) && <span>VAT: {cert.vatNumber || `Suggested ${displayCandidate(cert, 'vatNumber')}`}</span>}
          {(cert.bbbeeLevelStatus || hasCandidate(cert, 'bbbeeLevel')) && <span>{cert.bbbeeLevelStatus || `Suggested ${displayCandidate(cert, 'bbbeeLevel')}`}</span>}
          {cert.companySize && <span>Size: {cert.companySize}</span>}
          {(cert.blackOwnership != null || hasCandidate(cert, 'blackOwnership')) && <span>Ownership: {cert.blackOwnership != null ? formatPct(cert.blackOwnership) : `Suggested ${displayCandidate(cert, 'blackOwnership')}`}</span>}
          {cert.blackWomenOwnership != null && <span>Women ownership: {formatPct(cert.blackWomenOwnership)}</span>}
          {(cert.expiryDate || hasCandidate(cert, 'expiryDate')) && <span>Expiry: {cert.expiryDate ? formatExpiry(cert.expiryDate) : `Suggested ${displayCandidate(cert, 'expiryDate')}`}</span>}
        </div>
        <div className="md:hidden text-[11px] text-[color:var(--muted)] mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {(cert.vatNumber || hasCandidate(cert, 'vatNumber')) && <span><Hash className="inline h-3 w-3 mr-0.5" /> {cert.vatNumber || displayCandidate(cert, 'vatNumber')}</span>}
          {(cert.bbbeeLevel != null || cert.bbbeeLevelStatus || hasCandidate(cert, 'bbbeeLevel')) && <span><Award className="inline h-3 w-3 mr-0.5" /> {cert.bbbeeLevelStatus || (cert.bbbeeLevel != null ? `Level ${cert.bbbeeLevel}` : displayCandidate(cert, 'bbbeeLevel'))}</span>}
          {cert.companySize && <span><Building2 className="inline h-3 w-3 mr-0.5" /> {cert.companySize}</span>}
          {(cert.blackOwnership != null || hasCandidate(cert, 'blackOwnership')) && <span><Percent className="inline h-3 w-3 mr-0.5" /> {cert.blackOwnership != null ? formatPct(cert.blackOwnership) : displayCandidate(cert, 'blackOwnership')}</span>}
          {(cert.expiryDate || hasCandidate(cert, 'expiryDate')) && <span><CalendarClock className="inline h-3 w-3 mr-0.5" /> {cert.expiryDate ? formatExpiry(cert.expiryDate) : displayCandidate(cert, 'expiryDate')}</span>}
        </div>
        <div className="md:hidden mt-1.5"><StatusBadge status={cert.status} expiryDate={cert.expiryDate} /></div>
      </div>

      <div className="hidden md:block truncate text-[13px] text-zinc-700">
        {cert.vatNumber ? <HighlightMatch text={cert.vatNumber} query={searchQuery} /> : <SuggestedValue value={displayCandidate(cert, 'vatNumber')} />}
      </div>
      <div className="hidden md:block text-[13px] text-zinc-700">
        {cert.bbbeeLevel != null ? (
          <span className="font-medium text-[#18181b]">Level {cert.bbbeeLevel}</span>
        ) : (
          <SuggestedValue value={displayCandidate(cert, 'bbbeeLevel')} />
        )}
      </div>
      <div className="hidden md:block text-[13px] text-zinc-700">
        {cert.companySize || <SuggestedValue value={displayCandidate(cert, 'companySize')} />}
      </div>
      <div className="hidden md:block text-[13px] text-zinc-700">
        {cert.blackOwnership != null ? (
          <span className="font-medium text-[#18181b]">{formatPct(cert.blackOwnership)}</span>
        ) : (
          <SuggestedValue value={displayCandidate(cert, 'blackOwnership')} />
        )}
      </div>
      <div className="hidden md:flex flex-col items-start gap-1 text-[13px] text-zinc-700">
        {cert.expiryDate ? <span>{formatExpiry(cert.expiryDate)}</span> : <SuggestedValue value={displayCandidate(cert, 'expiryDate')} />}
        <StatusBadge status={cert.status} expiryDate={cert.expiryDate} />
      </div>
      <div className="hidden md:flex items-center justify-end gap-2">
        {needsReview(cert) && (
          <button
            onClick={onPreview}
            aria-label={`Review ${cert.companyName}`}
            title="Review"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 transition-colors hover:bg-amber-100"
          >
            <AlertTriangle className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={onPreview}
          disabled={cert.hasFile === false}
          aria-label={`Preview ${cert.companyName}`}
          title={cert.hasFile === false ? 'File missing from storage' : cert.previewSupported === false ? 'Preview unavailable; download instead' : 'Preview'}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-[#18181b] disabled:opacity-30"
        >
          <Eye className="h-4 w-4" />
        </button>
        <button
          onClick={onDownload}
          disabled={isDownloading || cert.hasFile === false}
          aria-label={`Download ${cert.fileName}`}
          title="Download"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 bg-white text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-100 hover:text-[#18181b] disabled:opacity-30"
        >
          {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
      </div>
      </div>
      <div className="hidden">
        {needsReview(cert) && (
          <button
            onClick={onPreview}
            aria-label={`Review ${cert.companyName}`}
            className="inline-flex min-w-[88px] items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[#fbbf24] bg-[#f59e0b]/10 hover:bg-[#f59e0b]/20 transition-colors text-[12px]"
          >
            <AlertTriangle className="h-4 w-4" />
            <span>Review</span>
          </button>
        )}
        <button
          onClick={onPreview}
          aria-label={`Preview ${cert.companyName}`}
          className="inline-flex min-w-[92px] items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[color:var(--body)] hover:text-white hover:bg-[rgba(255,255,255,0.06)] transition-colors text-[12px]"
        >
          <Eye className="h-4 w-4" />
          <span>Preview</span>
        </button>
        <button
          onClick={onDownload}
          disabled={isDownloading}
          aria-label={`Download ${cert.fileName}`}
          className="inline-flex min-w-[104px] items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-[color:var(--body)] hover:text-white hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-30 transition-colors text-[12px]"
        >
          {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span>Download</span>
        </button>
      </div>

      {/* Mobile action buttons */}
      <div className="md:hidden mt-3 flex items-center gap-2">
        {needsReview(cert) && (
          <button
            onClick={onPreview}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-[#fbbf24] bg-[#f59e0b]/10 hover:bg-[#f59e0b]/20 transition-colors"
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Review
          </button>
        )}
        <button
          onClick={onPreview}
          disabled={cert.hasFile === false}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-[12px] text-[#18181b] bg-white hover:bg-zinc-50 transition-colors"
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
        <button
          onClick={onDownload}
          disabled={isDownloading || cert.hasFile === false}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-[12px] text-[#18181b] bg-white hover:bg-zinc-50 disabled:opacity-30 transition-colors"
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

function CertPreviewModal({ cert, onClose, onSaved }: { cert: CertificateRow; onClose: () => void; onSaved: (updated: CertificateRow) => void }) {
  const { toast } = useToast();
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [docError, setDocError] = useState<string | null>(null);
  const [resolvingKey, setResolvingKey] = useState<string | null>(null);

  const displayName = cert.fileName || cert.name;
  const kind = certPreviewKind(displayName);
  const resolvedFields = useMemo(() => resolveAllFields(cert), [cert]);
  const pendingReview = countNeedsReview(cert);

  useEffect(() => {
    let cancelled = false;
    setLoadingDoc(true);
    setDocError(null);
    setDocUrl(null);

    (async () => {
      try {
        // disposition=inline → the SAS URL renders in the iframe/<img> instead of
        // forcing a download. The Download button omits it and keeps `attachment`.
        if (!cert.id) throw new Error('Certificate record is missing an id');
        const res = await fetch(`/internal/records/${encodeURIComponent(cert.id)}/view`, { credentials: 'include' });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ message: 'Could not load document' }));
          throw new Error(body.message || `Error ${res.status}`);
        }
        const body = await res.json();
        const url = body?.data?.url || body?.url;
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
  }, [cert.id]);

  /** Resolve ONE field: confirm the held value, save an edited one, or reject the suggestion. */
  const resolveFieldAction = async (key: FieldKey, action: ReviewAction, value?: string) => {
    if (!cert.id) {
      toast({ title: 'Cannot save', description: 'This certificate record has no id.', variant: 'destructive' });
      return;
    }
    setResolvingKey(key);
    try {
      const res = await fetch(`/internal/records/${encodeURIComponent(cert.id)}/review`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: key, action, ...(value !== undefined ? { value } : {}) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || 'Could not save this field');
      const data = (body?.data ?? body) as {
        fieldStatuses?: Record<string, FieldStatusView>;
        reviewFields?: string[];
        reviewCandidates?: CertificateRow['reviewCandidates'];
        enrichmentStatus?: string | null;
      };
      const sectorCode = data.fieldStatuses?.sectorCode?.value;
      const sector = OKIRU_HUB_SECTORS.find((s) => s.code === sectorCode);
      onSaved(applyFieldStatuses(cert, data.fieldStatuses ?? {}, {
        reviewFields: data.reviewFields,
        reviewCandidates: data.reviewCandidates,
        enrichmentStatus: data.enrichmentStatus,
        sectorName: sector?.name,
      }));
      toast({
        title: action === 'reject' ? 'Suggestion rejected' : action === 'edit' ? 'Value saved' : 'Value confirmed',
        description: action === 'reject'
          ? 'It stays on record and will not be suggested again.'
          : 'Saved as a trusted value for this certificate.',
      });
    } catch (err) {
      toast({
        title: 'Could not save',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setResolvingKey(null);
    }
  };

  // Every status the registry can emit needs an entry. It previously held only
  // the four expiry states while `publicStatus()` also returns the six pipeline
  // states below, so opening a certificate that was still processing looked up
  // `undefined` and crashed the modal on `s.color`. That is the NORMAL state for
  // a freshly synced certificate, not an edge case.
  const statusMap: Record<CertificateRow['status'], { color: string; bg: string; label: string }> = {
    valid:                 { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   label: 'Valid' },
    expiring:              { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'Expiring Soon' },
    expired:               { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   label: 'Expired' },
    unknown:               { color: 'var(--body)', bg: 'rgba(142,142,147,0.12)', label: 'Unknown' },
    processing:            { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  label: 'Processing' },
    pending_verification:  { color: '#a5b4fc', bg: 'rgba(165,180,252,0.12)', label: 'Pending Verification' },
    extraction_incomplete: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'Partly Read' },
    metadata_only:         { color: 'var(--body)', bg: 'rgba(142,142,147,0.12)', label: 'Metadata Only' },
    failed:                { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   label: 'Read Failed' },
    file_missing:          { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   label: 'File Missing' },
  };
  // Belt and braces: a status added server-side before this map still renders.
  const s = statusMap[cert.status] ?? statusMap.unknown;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[90vh] rounded-2xl bg-white border border-[color:var(--rule)] shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid #e4e4e7' }}>
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className="h-4 w-4 text-[#a5b4fc] shrink-0" />
            <h2 className="text-[15px] font-semibold text-[#18181b] truncate">{cert.companyName}</h2>
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
            <button onClick={onClose} className="text-[color:var(--muted)] hover:text-[#18181b] transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 min-h-0 overflow-hidden">
          <div className="flex flex-col min-h-[240px] lg:min-h-0 lg:w-1/2 shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-[color:var(--rule)]">
            <div className="px-4 py-2.5 flex items-center gap-2 shrink-0 border-b border-[color:var(--rule)]">
              <FileText className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm font-medium text-[#18181b] truncate">{displayName}</span>
            </div>
            <div className="flex-1 min-h-[280px] flex flex-col">
              {loadingDoc && (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-[color:var(--muted)]" />
                </div>
              )}
              {!loadingDoc && docError && (
                <div className="flex-1 flex items-center justify-center p-6 text-center text-sm text-[color:var(--body)]">
                  {docError}
                </div>
              )}
              {!loadingDoc && !docError && docUrl && kind === 'pdf' && (
                <iframe title={displayName} src={docUrl} className="w-full flex-1 min-h-[320px] bg-white" />
              )}
              {!loadingDoc && !docError && docUrl && kind === 'image' && (
                <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
                  <img src={docUrl} alt={displayName} className="max-w-full max-h-full object-contain" />
                </div>
              )}
              {!loadingDoc && !docError && docUrl && kind === 'other' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-[color:var(--body)]">
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
                <p className="text-[11px] text-[color:var(--muted)] uppercase tracking-wider mb-1">Status</p>
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

            {needsReview(cert) && (
              <div className="rounded-lg border border-[#f59e0b]/25 bg-[#f59e0b]/10 px-3 py-2.5">
                <div className="flex items-center gap-2 text-[12px] font-medium text-[#fbbf24]">
                  <AlertTriangle className="h-4 w-4" />
                  Needs metadata review
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--body)]">
                  {cert.enrichmentStatus === 'failed'
                    ? 'The enrichment job could not safely process this certificate.'
                    : 'Check the document on the left, correct the fields below, then save confirmed values to clear the review alert.'}
                </p>
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[12px] font-semibold text-[#18181b]">Certificate details</p>
                {pendingReview > 0 && (
                  <span className="text-[11px] text-amber-700" data-testid="pending-review-count">
                    {pendingReview} {pendingReview === 1 ? 'field needs' : 'fields need'} review
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {resolvedFields.map((field) => (
                  <FieldReviewRow
                    key={field.key}
                    field={field}
                    busy={resolvingKey === field.key}
                    canResolve={resolvingKey == null || resolvingKey === field.key}
                    onResolve={resolveFieldAction}
                  />
                ))}
              </div>
            </div>

            {cert.slug && (
              <Link
                href={`/certificates/${cert.slug}`}
                className="inline-flex items-center gap-1.5 text-[12px] text-[#4f46e5] hover:text-[#18181b] hover:underline"
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
      <div className="py-16 text-center rounded-xl border border-zinc-200 bg-white">
        <AlertCircle className="w-6 h-6 text-[color:var(--muted)] mx-auto mb-3" />
        <p className="text-[14px] text-[color:var(--body)] mb-2">No certificates match your filters</p>
        <button onClick={onClearFilters} className="text-[13px] text-[#4f46e5] hover:text-[#18181b] transition-colors">
          Clear all filters
        </button>
      </div>
    );
  }
  return (
    <div className="py-16 text-center rounded-xl border border-zinc-200 bg-white">
      <img src={logoCircle} alt="" className="h-12 w-12 mx-auto mb-3 opacity-40" />
      <p className="text-[14px] text-[#a1a1aa] mb-1">The registry is empty for now</p>
      <p className="text-[12px] text-[color:var(--muted)] mb-4">Be the first to add a B-BBEE certificate.</p>
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
