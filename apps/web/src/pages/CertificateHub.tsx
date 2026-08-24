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
  const fileName = String(item.file_name || item.blob_name || 'certificate');
  const supplierName = typeof item.supplier_name === 'string' ? item.supplier_name.trim() : '';
  return {
    id: typeof item.id === 'string' ? item.id : null,
    slug: typeof item.slug === 'string' ? item.slug : null,
    name: String(item.blob_name || ''),
    fileName,
    companyName: supplierName || labelFromFileName(fileName),
    vatNumber: typeof item.vat_number === 'string' ? item.vat_number : null,
    companySize: typeof item.company_size === 'string' ? item.company_size : null,
    blackOwnership: typeof item.black_ownership === 'number' ? item.black_ownership : null,
    blackWomenOwnership: typeof item.black_women_ownership === 'number' ? item.black_women_ownership : null,
    bbbeeLevel: typeof item.bbbee_level === 'number' ? item.bbbee_level : null,
    certificateType: typeof item.certificate_type === 'string' ? item.certificate_type : null,
    certificateNumber: typeof item.certificate_number === 'string' ? item.certificate_number : null,
    issueDate: typeof item.issue_date === 'string' ? item.issue_date : null,
    expiryDate: typeof item.expiry_date === 'string' ? item.expiry_date : null,
    status,
    lastModified: typeof item.uploaded_at === 'string' ? item.uploaded_at : null,
    uploadedAt: typeof item.uploaded_at === 'string' ? item.uploaded_at : null,
    sectorCode: typeof item.sector_code === 'string' ? item.sector_code : null,
    sectorName: typeof item.sector_name === 'string' ? item.sector_name : null,
    extractionStatus: typeof item.extraction_status === 'string' ? item.extraction_status : null,
    enrichmentStatus: item.review_required === true ? 'review_required' : null,
    reviewFields: [],
    metadataComplete: Boolean(item.supplier_name),
    contentType: typeof item.content_type === 'string' ? item.content_type : null,
    fileSize: typeof item.file_size === 'number' ? item.file_size : null,
    hasFile: item.has_file !== false,
    previewSupported: item.preview_supported === true,
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

function formatExpiry(dateStr: string | null): string {
  if (!dateStr) return 'Missing';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 'Missing';
  return d.toLocaleDateString('en-ZA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatPct(n: number | null): string {
  if (n == null) return 'Missing';
  return `${n.toFixed(n < 10 ? 1 : 0)}%`;
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

function SuggestedValue({ value, title }: { value: string | null; title?: string }) {
  if (!value) {
    return (
      <span className="text-[#48484a]" title={title || 'No safe value found; open review to verify'}>
        -
      </span>
    );
  }
  return (
    <span className="text-[#fbbf24]" title={title || 'Suggested value needs review in the document preview'}>
      {value}
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

/** Sworn affidavits (EME/QSE self-declarations) get their own tab. */
function isAffidavitRow(cert: CertificateRow): boolean {
  if (cert.certificateType) return /affidavit/i.test(cert.certificateType);
  return /affidavit/i.test(cert.fileName || cert.name || '');
}

/**
 * A document earns a spot in the registry views when it either already has
 * extracted metadata, has suggested candidates awaiting review, or its text
 * extracted cleanly so the data is still recoverable. Unreadable documents
 * with no metadata stay out of both tabs.
 */
function hasDataOrPotential(cert: CertificateRow): boolean {
  if (cert.vatNumber || cert.bbbeeLevel != null || cert.bbbeeLevelStatus || cert.expiryDate) return true;
  if (cert.blackOwnership != null || cert.blackWomenOwnership != null) return true;
  if (Object.keys(cert.reviewCandidates ?? {}).length > 0) return true;
  return cert.extractionStatus === 'completed';
}

const REVIEW_EDIT_FIELDS = [
  { key: 'vatNumber', label: 'VAT Number', type: 'text' },
  { key: 'bbbeeLevel', label: 'B-BBEE Level', type: 'number' },
  { key: 'companySize', label: 'Size', type: 'select' },
  { key: 'blackOwnership', label: 'Black Ownership %', type: 'number' },
  { key: 'blackWomenOwnership', label: 'Black Women Ownership %', type: 'number' },
  { key: 'expiryDate', label: 'Expiry Date', type: 'date' },
] as const;

type ReviewEditFieldKey = typeof REVIEW_EDIT_FIELDS[number]['key'];

function reviewFieldValue(cert: CertificateRow, key: ReviewEditFieldKey): string {
  const current = cert[key as keyof CertificateRow];
  const candidate = candidateValue(cert, key);
  const value = current ?? candidate;
  if (value == null) return '';
  if (key === 'expiryDate') return String(value).slice(0, 10);
  return String(value);
}

function reviewFieldNeedsAttention(cert: CertificateRow, key: ReviewEditFieldKey): boolean {
  return (cert.reviewFields ?? []).includes(key)
    || Boolean(cert.reviewCandidates?.[key])
    || reviewFieldValue(cert, key).trim() === '';
}

function castReviewValue(key: ReviewEditFieldKey, value: string): string | number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (key === 'bbbeeLevel' || key === 'blackOwnership' || key === 'blackWomenOwnership') {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return trimmed;
}

function StatusBadge({ status, expiryDate }: { status: CertificateRow['status']; expiryDate: string | null }) {
  const map = {
    valid:    { color: '#22c55e', bg: 'rgba(34,197,94,0.12)', label: 'Valid' },
    expiring: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Expiring' },
    expired:  { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Expired' },
    unknown:  { color: '#8e8e93', bg: 'rgba(142,142,147,0.12)', label: 'Unknown' },
    pending_verification: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Pending review' },
    extraction_incomplete: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', label: 'Extraction incomplete' },
    processing: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', label: 'Processing' },
    failed: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'Failed' },
    file_missing: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', label: 'File missing' },
    metadata_only: { color: '#8e8e93', bg: 'rgba(142,142,147,0.12)', label: 'Metadata only' },
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
  const [docTab, setDocTab] = useState<'certificates' | 'affidavits'>(() => initialQuery.get('type') === 'affidavit' ? 'affidavits' : 'certificates');
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
  }, [debouncedSearch, statusFilter, sizeFilter, sectorFilter, ownershipFilter, bbbeeLevelFilter, fileTypeFilter, reviewOnly, docTab]);

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
    if (docTab === 'affidavits') params.set('type', 'affidavit');
    if (sortBy !== 'uploaded_at') params.set('sort_by', sortBy);
    if (sortOrder !== 'desc') params.set('sort_order', sortOrder);
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [page, pageSize, debouncedSearch, statusFilter, sizeFilter, sectorFilter, ownershipFilter, bbbeeLevelFilter, fileTypeFilter, reviewOnly, docTab, sortBy, sortOrder]);

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
      params.set('document_kind', docTab);
      if (ownershipFilter) {
        const [min, max] = ownershipFilter.split('-');
        params.set('min_ownership', min);
        params.set('max_ownership', max);
      }
      const res = await fetch(`/api/certificates?${params.toString()}`);
      const raw = await res.json().catch(() => null);
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
  }, [page, pageSize, sortBy, sortOrder, debouncedSearch, statusFilter, sizeFilter, sectorFilter, ownershipFilter, bbbeeLevelFilter, fileTypeFilter, reviewOnly, docTab, toast]);

  const loadStats = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch('/api/certificates/stats', { signal: controller.signal });
      if (res.ok) {
        const raw = await res.json();
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
  const hasActiveFilters = !!(search.trim() || statusFilter || sizeFilter || sectorFilter || ownershipFilter || bbbeeLevelFilter || fileTypeFilter || reviewOnly);

  const tabCounts = useMemo(() => {
    let certificates = 0;
    let affidavits = 0;
    let hidden = 0;
    for (const c of allCerts) {
      if (!hasDataOrPotential(c)) { hidden++; continue; }
      if (isAffidavitRow(c)) affidavits++;
      else certificates++;
    }
    return { certificates, affidavits, hidden };
  }, [allCerts]);

  const filtered = allCerts;

  const clearAllFilters = () => {
    setSearch('');
    setStatusFilter('');
    setSizeFilter('');
    setSectorFilter('');
    setOwnershipFilter('');
    setBbbeeLevelFilter('');
    setFileTypeFilter('');
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
      const res = await fetch(`/api/certificates/${encodeURIComponent(certificate.id)}/download`, { credentials: 'include' });
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
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide text-[#636366]">
            <FileText className="h-3.5 w-3.5 text-[#818cf8]" />
            Certificate Hub
          </div>
          <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-center">
            <h1 className="flex shrink-0 items-center gap-2 text-[24px] font-semibold tracking-tight text-white sm:text-[28px]">
              {loading && allCerts.length === 0 ? 'Loading certificates' : `${headlineCount.toLocaleString()} certificates`}
              {(loading || allCertsLoading) && (
                <Loader2 className="h-4 w-4 animate-spin text-[#636366]" aria-label="Loading more certificates" />
              )}
            </h1>
            <div className="relative min-w-0 flex-1 lg:ml-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-[#636366]" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by company name, VAT number, or B-BBEE level…"
                className="w-full rounded-lg border border-[#2c2c2e] bg-[#111114] py-2.5 pl-11 pr-11 text-[14px] text-white outline-none placeholder:text-[#55555a] focus:border-[#6366f1] transition-colors"
                autoComplete="off"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#48484a] hover:text-white transition-colors"
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
          <div className="mt-2 text-[12px] text-[#636366]">
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
                <p className="mt-1 text-[12px] leading-relaxed text-[#d1d1d6]">
                  Open these records to preview the certificate and verify uncertain enrichment fields.
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {reviewOnly && (
                  <button
                    type="button"
                    onClick={() => setReviewOnly(false)}
                    className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-[12px] text-[#d1d1d6] hover:bg-white/[0.06] hover:text-white transition-colors"
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

        {/* ─── Toolbar: document tabs + filters ────────────────── */}
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
          <div
            className="inline-flex rounded-lg border border-[#2c2c2e] bg-[#1c1c1e] p-0.5"
            title={tabCounts.hidden > 0 ? `${tabCounts.hidden.toLocaleString()} unreadable documents without metadata are excluded` : undefined}
          >
            {([
              { key: 'certificates', label: 'Certificates', count: tabCounts.certificates },
              { key: 'affidavits', label: 'Affidavits', count: tabCounts.affidavits },
            ] as const).map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setDocTab(tab.key)}
                className={[
                  'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-colors',
                  docTab === tab.key
                    ? 'bg-[#2c2c2e] text-white shadow-sm'
                    : 'text-[#8e8e93] hover:text-white',
                ].join(' ')}
              >
                {tab.label}
                <span className={docTab === tab.key ? 'text-[#a5b4fc]' : 'text-[#636366]'}>
                  {tab.count.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
          <div className="hidden h-5 w-px bg-[#2c2c2e] sm:block" />
          <div className="flex flex-wrap items-center gap-2">
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
            <label className="inline-flex items-center gap-2 text-[12px] text-[#8e8e93]">
              Sort
              <select
                value={`${sortBy}:${sortOrder}`}
                onChange={(event) => {
                  const [field, order] = event.target.value.split(':');
                  setSortBy(field);
                  setSortOrder(order as 'asc' | 'desc');
                  setPage(1);
                }}
                className="rounded-lg border border-[#2c2c2e] bg-[#111114] px-2.5 py-1.5 text-[12px] text-white outline-none"
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
                className="text-[12px] text-[#636366] hover:text-white transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        </div>

        {/* ─── List ──────────────────────────────────────────── */}

        {!loading && (hasActiveFilters || reviewOnly) && (
          <p className="mb-3 text-[13px] text-[#8e8e93]">
            {allCertsLoading
              ? 'Loading…'
              : `${filtered.length.toLocaleString()} result${filtered.length !== 1 ? 's' : ''}${search.trim() ? ` for "${search.trim()}"` : ''}${reviewOnly ? ' needing review' : ''}`}
          </p>
        )}

        {loadError && !loading ? (
          <div className="rounded-xl border border-[#2c2c2e] bg-[#0d0d10] px-6 py-14 text-center">
            <AlertCircle className="mx-auto h-6 w-6 text-[#ef4444]" />
            <p className="mt-3 text-[14px] text-white">Could not load certificates</p>
            <p className="mt-1 text-[12px] text-[#8e8e93]">{loadError}</p>
            <button onClick={handleRefresh} className="mt-4 rounded-lg bg-white px-3 py-2 text-[12px] font-medium text-black">Retry</button>
          </div>
        ) : (loading || allCertsLoading) && allCerts.length === 0 ? (
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
          <div className="rounded-xl border border-[#1c1c1e] bg-[#0d0d10]">
            <div className="sticky top-14 z-10 hidden rounded-t-xl border-b border-white/[0.06] bg-[#0d0d10]/95 backdrop-blur-md md:grid grid-cols-[minmax(240px,2.2fr)_minmax(110px,1fr)_minmax(72px,0.55fr)_minmax(86px,0.7fr)_minmax(150px,1.15fr)_minmax(140px,0.9fr)_104px] items-center gap-4 px-4 py-2.5 text-[10px] uppercase tracking-wider text-[#8e8e93] shadow-[0_8px_20px_rgba(0,0,0,0.28)]">
              <div>Company / sector</div>
              <div>VAT number</div>
              <div>Level</div>
              <div>Size</div>
              <div>Ownership</div>
              <div>Expiry</div>
              <div className="text-right">Actions</div>
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
          <div className="mt-4 flex flex-col gap-3 border-t border-white/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[12px] text-[#8e8e93]">
              Showing {((page - 1) * pageSize + 1).toLocaleString()}-{Math.min(page * pageSize, totalCertificates).toLocaleString()} of {totalCertificates.toLocaleString()}
            </p>
            <div className="flex items-center gap-2">
              <label className="text-[12px] text-[#8e8e93]">
                Rows
                <select
                  value={pageSize}
                  onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}
                  className="ml-2 rounded-lg border border-[#2c2c2e] bg-[#111114] px-2 py-1.5 text-white outline-none"
                >
                  {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
              <button
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || allCertsLoading}
                className="rounded-lg border border-[#2c2c2e] px-3 py-1.5 text-[12px] text-white disabled:opacity-30"
              >
                Previous
              </button>
              <span className="min-w-[88px] text-center text-[12px] text-[#8e8e93]">{page} of {totalPages}</span>
              <button
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                disabled={page >= totalPages || allCertsLoading}
                className="rounded-lg border border-[#2c2c2e] px-3 py-1.5 text-[12px] text-white disabled:opacity-30"
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
      className="group px-4 py-3.5 hover:bg-[#16161b] focus-within:bg-[#16161b] transition-colors"
      style={{ borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)' }}
    >
      <div className="md:grid md:grid-cols-[minmax(240px,2.2fr)_minmax(110px,1fr)_minmax(72px,0.55fr)_minmax(86px,0.7fr)_minmax(150px,1.15fr)_minmax(140px,0.9fr)_104px] md:items-start md:gap-4">
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
            {needsReview(cert) && (
              <span
                title={cert.reviewFields?.length ? `Needs review: ${cert.reviewFields.join(', ')}` : 'Metadata needs review'}
                className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#f59e0b]/80"
                aria-label="Needs review"
              />
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
        <div className="hidden">
          {(cert.vatNumber || hasCandidate(cert, 'vatNumber')) && <span>VAT: {cert.vatNumber || `Suggested ${displayCandidate(cert, 'vatNumber')}`}</span>}
          {(cert.bbbeeLevelStatus || hasCandidate(cert, 'bbbeeLevel')) && <span>{cert.bbbeeLevelStatus || `Suggested ${displayCandidate(cert, 'bbbeeLevel')}`}</span>}
          {cert.companySize && <span>Size: {cert.companySize}</span>}
          {(cert.blackOwnership != null || hasCandidate(cert, 'blackOwnership')) && <span>Ownership: {cert.blackOwnership != null ? formatPct(cert.blackOwnership) : `Suggested ${displayCandidate(cert, 'blackOwnership')}`}</span>}
          {cert.blackWomenOwnership != null && <span>Women ownership: {formatPct(cert.blackWomenOwnership)}</span>}
          {(cert.expiryDate || hasCandidate(cert, 'expiryDate')) && <span>Expiry: {cert.expiryDate ? formatExpiry(cert.expiryDate) : `Suggested ${displayCandidate(cert, 'expiryDate')}`}</span>}
        </div>
        <div className="md:hidden text-[11px] text-[#636366] mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {(cert.vatNumber || hasCandidate(cert, 'vatNumber')) && <span><Hash className="inline h-3 w-3 mr-0.5" /> {cert.vatNumber || displayCandidate(cert, 'vatNumber')}</span>}
          {(cert.bbbeeLevel != null || cert.bbbeeLevelStatus || hasCandidate(cert, 'bbbeeLevel')) && <span><Award className="inline h-3 w-3 mr-0.5" /> {cert.bbbeeLevelStatus || (cert.bbbeeLevel != null ? `Level ${cert.bbbeeLevel}` : displayCandidate(cert, 'bbbeeLevel'))}</span>}
          {cert.companySize && <span><Building2 className="inline h-3 w-3 mr-0.5" /> {cert.companySize}</span>}
          {(cert.blackOwnership != null || hasCandidate(cert, 'blackOwnership')) && <span><Percent className="inline h-3 w-3 mr-0.5" /> {cert.blackOwnership != null ? formatPct(cert.blackOwnership) : displayCandidate(cert, 'blackOwnership')} black</span>}
          {(cert.expiryDate || hasCandidate(cert, 'expiryDate')) && <span><CalendarClock className="inline h-3 w-3 mr-0.5" /> {cert.expiryDate ? formatExpiry(cert.expiryDate) : displayCandidate(cert, 'expiryDate')}</span>}
        </div>
        <div className="md:hidden mt-1.5"><StatusBadge status={cert.status} expiryDate={cert.expiryDate} /></div>
      </div>

      <div className="hidden md:block text-[13px] text-[#a1a1aa] truncate">
        {cert.vatNumber ? <HighlightMatch text={cert.vatNumber} query={searchQuery} /> : <SuggestedValue value={displayCandidate(cert, 'vatNumber')} />}
      </div>
      <div className="hidden md:block text-[13px] text-[#a1a1aa]">
        {cert.bbbeeLevel != null ? (
          <span className="text-white">Level {cert.bbbeeLevel}</span>
        ) : (
          <SuggestedValue value={displayCandidate(cert, 'bbbeeLevel')} />
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
          <SuggestedValue value={displayCandidate(cert, 'blackOwnership')} />
        )}
      </div>
      <div className="hidden md:flex flex-col items-start gap-1 text-[13px] text-[#a1a1aa]">
        {cert.expiryDate ? <span>{formatExpiry(cert.expiryDate)}</span> : <SuggestedValue value={displayCandidate(cert, 'expiryDate')} />}
        <StatusBadge status={cert.status} expiryDate={cert.expiryDate} />
      </div>
      <div className="hidden md:flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {needsReview(cert) && (
          <button
            onClick={onPreview}
            aria-label={`Review ${cert.companyName}`}
            title="Review"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#fbbf24] hover:bg-[#f59e0b]/15 transition-colors"
          >
            <AlertTriangle className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={onPreview}
          disabled={cert.hasFile === false}
          aria-label={`Preview ${cert.companyName}`}
          title={cert.hasFile === false ? 'File missing from storage' : cert.previewSupported === false ? 'Preview unavailable; download instead' : 'Preview'}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#8e8e93] hover:text-white hover:bg-[#2c2c2e] disabled:opacity-30 transition-colors"
        >
          <Eye className="h-4 w-4" />
        </button>
        <button
          onClick={onDownload}
          disabled={isDownloading || cert.hasFile === false}
          aria-label={`Download ${cert.fileName}`}
          title="Download"
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#8e8e93] hover:text-white hover:bg-[#2c2c2e] disabled:opacity-30 transition-colors"
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] text-white bg-white/[0.06] hover:bg-white/[0.12] transition-colors"
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>
        <button
          onClick={onDownload}
          disabled={isDownloading || cert.hasFile === false}
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

function CertPreviewModal({ cert, onClose, onSaved }: { cert: CertificateRow; onClose: () => void; onSaved: (updated: CertificateRow) => void }) {
  const { toast } = useToast();
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(true);
  const [docError, setDocError] = useState<string | null>(null);
  const [reviewDraft, setReviewDraft] = useState<Record<ReviewEditFieldKey, string>>(() => (
    Object.fromEntries(REVIEW_EDIT_FIELDS.map(field => [field.key, reviewFieldValue(cert, field.key)])) as Record<ReviewEditFieldKey, string>
  ));
  const [savingReview, setSavingReview] = useState(false);

  const displayName = cert.fileName || cert.name;
  const kind = certPreviewKind(displayName);
  const reviewFieldsToShow = REVIEW_EDIT_FIELDS.filter(field => reviewFieldNeedsAttention(cert, field.key));

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
        const res = await fetch(`/api/certificates/${encodeURIComponent(cert.id)}/view`, { credentials: 'include' });
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

  useEffect(() => {
    setReviewDraft(Object.fromEntries(
      REVIEW_EDIT_FIELDS.map(field => [field.key, reviewFieldValue(cert, field.key)]),
    ) as Record<ReviewEditFieldKey, string>);
  }, [cert]);

  const saveReviewedFields = async () => {
    const payload: Partial<Record<ReviewEditFieldKey, string | number | null>> = {};
    for (const field of reviewFieldsToShow) {
      payload[field.key] = castReviewValue(field.key, reviewDraft[field.key] ?? '');
    }

    if (!Object.keys(payload).length || !cert.id) {
      toast({ title: 'Nothing to save', description: 'No review fields are available for this certificate.' });
      return;
    }

    setSavingReview(true);
    try {
      const res = await fetch(`/api/certificates/${encodeURIComponent(cert.id)}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.message || 'Could not save certificate metadata');

      const confirmedFields = Object.keys(payload) as ReviewEditFieldKey[];
      const nextCandidates = { ...(cert.reviewCandidates ?? {}) };
      confirmedFields.forEach(field => { delete nextCandidates[field]; });
      const nextReviewFields = (cert.reviewFields ?? []).filter(field => !confirmedFields.includes(field as ReviewEditFieldKey));
      const localUpdates: Partial<CertificateRow> = {};
      if ('vatNumber' in payload) localUpdates.vatNumber = payload.vatNumber == null ? null : String(payload.vatNumber);
      if ('companySize' in payload) localUpdates.companySize = payload.companySize == null ? null : String(payload.companySize);
      if ('expiryDate' in payload) localUpdates.expiryDate = payload.expiryDate == null ? null : String(payload.expiryDate);
      if ('bbbeeLevel' in payload) localUpdates.bbbeeLevel = typeof payload.bbbeeLevel === 'number' ? payload.bbbeeLevel : null;
      if ('blackOwnership' in payload) localUpdates.blackOwnership = typeof payload.blackOwnership === 'number' ? payload.blackOwnership : null;
      if ('blackWomenOwnership' in payload) localUpdates.blackWomenOwnership = typeof payload.blackWomenOwnership === 'number' ? payload.blackWomenOwnership : null;
      const nextCert: CertificateRow = {
        ...cert,
        ...localUpdates,
        bbbeeLevelStatus: localUpdates.bbbeeLevel != null ? `Level ${localUpdates.bbbeeLevel}` : cert.bbbeeLevelStatus,
        reviewFields: nextReviewFields,
        reviewCandidates: nextCandidates,
        enrichmentStatus: nextReviewFields.length || Object.keys(nextCandidates).length ? 'review_required' : 'completed',
      };
      onSaved(nextCert);
      toast({ title: 'Review saved', description: 'Confirmed fields were saved and their review alerts were cleared.' });
    } catch (err) {
      toast({
        title: 'Could not save review',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSavingReview(false);
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
    unknown:               { color: '#8e8e93', bg: 'rgba(142,142,147,0.12)', label: 'Unknown' },
    processing:            { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  label: 'Processing' },
    pending_verification:  { color: '#a5b4fc', bg: 'rgba(165,180,252,0.12)', label: 'Pending Verification' },
    extraction_incomplete: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  label: 'Partly Read' },
    metadata_only:         { color: '#8e8e93', bg: 'rgba(142,142,147,0.12)', label: 'Metadata Only' },
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

            {needsReview(cert) && (
              <div className="rounded-lg border border-[#f59e0b]/25 bg-[#f59e0b]/10 px-3 py-2.5">
                <div className="flex items-center gap-2 text-[12px] font-medium text-[#fbbf24]">
                  <AlertTriangle className="h-4 w-4" />
                  Needs metadata review
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-[#d1d1d6]">
                  {cert.enrichmentStatus === 'failed'
                    ? 'The enrichment job could not safely process this certificate.'
                    : 'Check the document on the left, correct the fields below, then save confirmed values to clear the review alert.'}
                </p>
              </div>
            )}

            {reviewFieldsToShow.length > 0 && (
              <div className="rounded-xl border border-[#2c2c2e] bg-[#111114] p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-semibold text-white">Verify fields</p>
                    <p className="text-[11px] text-[#8e8e93]">Only these fields are currently flagged or missing.</p>
                  </div>
                  <button
                    onClick={saveReviewedFields}
                    disabled={savingReview}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#f59e0b]/15 px-3 py-1.5 text-[12px] font-medium text-[#fbbf24] transition-colors hover:bg-[#f59e0b]/25 disabled:opacity-50"
                  >
                    {savingReview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Save confirmed
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {reviewFieldsToShow.map(field => {
                    const candidate = cert.reviewCandidates?.[field.key];
                    return (
                      <label key={field.key} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-[10px] uppercase tracking-wider text-[#8e8e93]">{field.label}</span>
                          {candidate?.confidence != null && (
                            <span className="text-[10px] text-[#fbbf24]">{Math.round(candidate.confidence * 100)}% confidence</span>
                          )}
                        </div>
                        {field.type === 'select' ? (
                          <select
                            value={reviewDraft[field.key] ?? ''}
                            onChange={e => setReviewDraft(prev => ({ ...prev, [field.key]: e.target.value }))}
                            className="w-full rounded-md border border-[#2c2c2e] bg-[#0d0d10] px-2.5 py-2 text-[13px] text-white outline-none focus:border-[#f59e0b]/60"
                          >
                            <option value="">Missing</option>
                            {COMPANY_SIZES.map(size => <option key={size} value={size}>{size}</option>)}
                          </select>
                        ) : (
                          <input
                            value={reviewDraft[field.key] ?? ''}
                            type={field.type}
                            step={field.type === 'number' ? '0.01' : undefined}
                            min={field.type === 'number' ? '0' : undefined}
                            max={field.key === 'bbbeeLevel' ? '8' : field.type === 'number' ? '100' : undefined}
                            onChange={e => setReviewDraft(prev => ({ ...prev, [field.key]: e.target.value }))}
                            className="w-full rounded-md border border-[#2c2c2e] bg-[#0d0d10] px-2.5 py-2 text-[13px] text-white outline-none focus:border-[#f59e0b]/60"
                          />
                        )}
                        {(candidate?.reason || candidate?.evidence) && (
                          <p className="mt-1.5 line-clamp-2 text-[11px] text-[#8e8e93]">
                            {candidate.reason || candidate.evidence}
                          </p>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <PreviewField label="Company" value={displayValue(cert.companyName)} icon={<Building2 className="h-3.5 w-3.5" />} title={confidenceTitle(cert, 'companyName')} />
              <PreviewField label="Sector" value={sectorDisplayLabel(cert.sectorCode, cert.sectorName)} icon={<Building2 className="h-3.5 w-3.5" />} />
              <PreviewField label="VAT Number" value={displayValue(cert.vatNumber)} icon={<Hash className="h-3.5 w-3.5" />} title={confidenceTitle(cert, 'vatNumber') || cert.reviewCandidates?.vatNumber?.reason} />
              <PreviewField label="Company Size" value={displayValue(cert.companySize)} icon={<Building2 className="h-3.5 w-3.5" />} title={confidenceTitle(cert, 'companySize')} />
              <PreviewField
                label="B-BBEE Level"
                value={cert.bbbeeLevelStatus || (cert.bbbeeLevel != null ? `Level ${cert.bbbeeLevel}` : 'Missing')}
                icon={<Award className="h-3.5 w-3.5" />}
                title={confidenceTitle(cert, 'bbbeeLevel') || cert.reviewCandidates?.bbbeeLevel?.reason}
              />
              <PreviewField
                label="Expiry Date"
                value={cert.expiryDate ? formatExpiry(cert.expiryDate) : 'Missing'}
                icon={<CalendarClock className="h-3.5 w-3.5" />}
                title={confidenceTitle(cert, 'expiryDate') || cert.reviewCandidates?.expiryDate?.reason}
              />
              <PreviewField
                label="Black Ownership"
                value={cert.blackOwnership != null ? formatPct(cert.blackOwnership) : 'Missing'}
                icon={<Percent className="h-3.5 w-3.5" />}
                title={confidenceTitle(cert, 'blackOwnership') || cert.reviewCandidates?.blackOwnership?.reason}
              />
              <PreviewField
                label="Black Women Ownership"
                value={cert.blackWomenOwnership != null ? formatPct(cert.blackWomenOwnership) : 'Missing'}
                icon={<Users2 className="h-3.5 w-3.5" />}
                title={confidenceTitle(cert, 'blackWomenOwnership') || cert.reviewCandidates?.blackWomenOwnership?.reason}
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

function PreviewField({ label, value, icon, title }: { label: string; value: string; icon?: React.ReactNode; title?: string }) {
  return (
    <div className="rounded-lg bg-[#0d0d10] border border-[#2c2c2e] px-3 py-2.5" title={title}>
      <div className="flex items-center gap-1.5 text-[10px] text-[#636366] uppercase tracking-wider mb-1">
        {icon}
        {label}
      </div>
      <div className={`text-[13px] font-medium truncate ${value === 'Missing' || value === 'Needs review' ? 'text-[#8e8e93]' : 'text-white'}`}>{value}</div>
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
