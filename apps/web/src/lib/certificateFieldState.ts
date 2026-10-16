/**
 * What the Certificate Hub shows for each metadata field.
 *
 * Every field is exactly one of:
 *   confirmed     a trusted value is stored
 *   needs_review  nothing trusted yet, but a plausible candidate is being held
 *   missing       nothing plausible was found (and we can say why)
 *
 * A held candidate is NEVER shown as a blank. The API sends the state explicitly
 * (`field_status`); when an older API does not, it is derived here from the same
 * structures, so the two can not disagree.
 */
import { formatPercent } from '@/lib/formatPercent';

export type FieldState = 'confirmed' | 'needs_review' | 'missing';
export type FieldKey =
  | 'companyName'
  | 'registrationNumber'
  | 'vatNumber'
  | 'bbbeeLevel'
  | 'blackOwnership'
  | 'blackWomenOwnership'
  | 'companySize'
  | 'expiryDate'
  | 'sectorCode';

export type FieldInput = 'text' | 'number' | 'date' | 'size' | 'sector';

export const FIELD_DEFS: ReadonlyArray<{ key: FieldKey; label: string; input: FieldInput }> = [
  { key: 'companyName', label: 'Company', input: 'text' },
  { key: 'registrationNumber', label: 'Registration number', input: 'text' },
  { key: 'vatNumber', label: 'VAT number', input: 'text' },
  { key: 'bbbeeLevel', label: 'B-BBEE level', input: 'number' },
  { key: 'blackOwnership', label: 'Black ownership', input: 'number' },
  { key: 'blackWomenOwnership', label: 'Black women ownership', input: 'number' },
  { key: 'companySize', label: 'Company size', input: 'size' },
  { key: 'expiryDate', label: 'Expiry date', input: 'date' },
  { key: 'sectorCode', label: 'Sector', input: 'sector' },
];

type Scalar = string | number | boolean | null;

/** Shape of one entry of the API's `field_status`. */
export interface FieldStatusView {
  field: string;
  status: FieldState;
  value: Scalar;
  confidence: number | null;
  source: string | null;
  confirmedBy?: string | null;
  confirmedAt?: string | null;
  candidate: {
    value: Scalar;
    confidence: number | null;
    source: string | null;
    reason: string | null;
    evidence: string | null;
    ambiguous: boolean;
    alternatives: Array<{ value: Scalar; confidence: number | null; snippet: string | null }>;
  } | null;
  reviewReason?: string | null;
  missingReason: 'no_usable_text' | 'enrichment_pending' | 'not_found_in_text' | null;
}

/** The slice of a Hub row this module reads. */
export interface FieldStateCert {
  companyName?: string | null;
  metadataComplete?: boolean;
  registrationNumber?: string | null;
  vatNumber?: string | null;
  bbbeeLevel?: number | null;
  blackOwnership?: number | null;
  blackWomenOwnership?: number | null;
  companySize?: string | null;
  expiryDate?: string | null;
  sectorCode?: string | null;
  sectorName?: string | null;
  fieldConfidence?: Record<string, unknown>;
  reviewCandidates?: Record<string, { value?: unknown; confidence?: number; source?: string; reason?: string; evidence?: string; candidates?: Array<{ value?: unknown; confidence?: number; snippet?: string }>; ambiguous?: boolean } | undefined>;
  fieldStatus?: Record<string, FieldStatusView>;
}

export interface ResolvedCandidate {
  raw: Scalar;
  display: string;
  confidence: number | null;
  source: string | null;
  reason: string | null;
  evidence: string | null;
  ambiguous: boolean;
  alternatives: Array<{ raw: Scalar; display: string; confidence: number | null; snippet: string | null }>;
}

export interface ResolvedField {
  key: FieldKey;
  label: string;
  input: FieldInput;
  state: FieldState;
  /** What to show as the value: the trusted value, or the held candidate, or null. */
  display: string | null;
  raw: Scalar;
  confidence: number | null;
  source: string | null;
  confirmedByPerson: boolean;
  candidate: ResolvedCandidate | null;
  /** Why a stored value was flagged, or why nothing was found. */
  note: string | null;
}

const STATE_LABEL: Record<FieldState, string> = {
  confirmed: 'Confirmed',
  needs_review: 'Needs review',
  missing: 'Missing',
};
export const stateLabel = (state: FieldState): string => STATE_LABEL[state];

const SOURCE_LABEL: Record<string, string> = {
  text: 'document text',
  filename: 'file name',
  regex_fallback: 'loose text match',
  trusted_mapping: 'trusted mapping',
  manual: 'a person',
};
export const sourceLabel = (source: string | null): string | null => (source ? SOURCE_LABEL[source] ?? source : null);

const MISSING_NOTE: Record<string, string> = {
  no_usable_text: 'The document could not be read, so nothing could be extracted.',
  enrichment_pending: 'This certificate has not been analysed yet.',
  not_found_in_text: 'Searched the document text; this value was not found.',
};
const REVIEW_NOTE: Record<string, string> = {
  stored_value_below_safe_save_confidence: 'This value was saved with low confidence.',
  sector_code_not_a_known_hub_sector: 'This is not one of the Okiru Hub sectors.',
};

function isoDateLabel(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Display text for a raw field value. */
export function formatFieldValue(key: FieldKey, raw: unknown, cert?: Pick<FieldStateCert, 'sectorName'>): string {
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) return '';
  switch (key) {
    case 'bbbeeLevel':
      return `Level ${raw}`;
    case 'blackOwnership':
    case 'blackWomenOwnership': {
      const n = Number(raw);
      return Number.isFinite(n) ? formatPercent(n) : String(raw);
    }
    case 'expiryDate':
      return isoDateLabel(String(raw));
    case 'sectorCode':
      return cert?.sectorName ? `${raw} - ${cert.sectorName}` : String(raw);
    default:
      return String(raw);
  }
}

const hasValue = (v: unknown): boolean => v != null && !(typeof v === 'string' && v.trim() === '');

function toCandidate(key: FieldKey, c: NonNullable<FieldStatusView['candidate']>, cert: FieldStateCert): ResolvedCandidate {
  return {
    raw: c.value,
    display: formatFieldValue(key, c.value, cert),
    confidence: c.confidence,
    source: c.source,
    reason: c.reason,
    evidence: c.evidence,
    ambiguous: c.ambiguous,
    alternatives: c.alternatives.map((a) => ({ raw: a.value, display: formatFieldValue(key, a.value, cert), confidence: a.confidence, snippet: a.snippet })),
  };
}

/** Derive the API's field status from the row, for APIs that predate `field_status`. */
function deriveStatus(cert: FieldStateCert, key: FieldKey): FieldStatusView {
  const value = (cert as Record<string, unknown>)[key] as Scalar | undefined;
  // `companyName` falls back to a label built from the file name, which is display-only.
  const stored = key === 'companyName' ? (cert.metadataComplete ? (value ?? null) : null) : (value ?? null);
  const meta = cert.fieldConfidence?.[key] as { confidence?: number; source?: string } | undefined;
  const held = cert.reviewCandidates?.[key];
  const alternatives = Array.isArray(held?.candidates) ? held!.candidates!.filter((c) => hasValue(c?.value)) : [];
  const base = { field: key, confidence: typeof meta?.confidence === 'number' ? meta.confidence : null, source: meta?.source ?? null };

  if (hasValue(stored)) return { ...base, status: 'confirmed', value: stored, candidate: null, missingReason: null };
  const heldValue = (hasValue(held?.value) ? held!.value : alternatives[0]?.value) as Scalar | undefined;
  if (held && hasValue(heldValue)) {
    return {
      ...base,
      status: 'needs_review',
      value: null,
      candidate: {
        value: heldValue ?? null,
        confidence: typeof held.confidence === 'number' ? held.confidence : null,
        source: held.source ?? null,
        reason: held.reason ?? null,
        evidence: held.evidence ?? null,
        ambiguous: held.ambiguous === true || alternatives.length > 1,
        alternatives: alternatives.map((a) => ({ value: a.value as Scalar, confidence: typeof a.confidence === 'number' ? a.confidence : null, snippet: a.snippet ?? null })),
      },
      missingReason: null,
    };
  }
  return { ...base, status: 'missing', value: null, candidate: null, missingReason: null };
}

export function resolveField(cert: FieldStateCert, key: FieldKey): ResolvedField {
  const def = FIELD_DEFS.find((d) => d.key === key)!;
  const status = cert.fieldStatus?.[key] ?? deriveStatus(cert, key);
  const candidate = status.candidate ? toCandidate(key, status.candidate, cert) : null;
  const raw = status.value;
  const display = status.status === 'confirmed'
    ? formatFieldValue(key, raw, cert)
    : candidate?.display || (hasValue(raw) ? formatFieldValue(key, raw, cert) : null);

  const note = status.status === 'missing'
    ? (status.missingReason ? MISSING_NOTE[status.missingReason] : null)
    : status.reviewReason
      ? REVIEW_NOTE[status.reviewReason] ?? status.reviewReason
      : candidate?.reason ?? null;

  return {
    key,
    label: def.label,
    input: def.input,
    state: status.status,
    display: display || null,
    raw,
    confidence: status.confidence,
    source: status.source,
    confirmedByPerson: status.source === 'manual' || !!status.confirmedAt || !!status.confirmedBy,
    candidate,
    note,
  };
}

export const resolveAllFields = (cert: FieldStateCert): ResolvedField[] => FIELD_DEFS.map((d) => resolveField(cert, d.key));

/** Fields still waiting on a person. */
export const countNeedsReview = (cert: FieldStateCert): number =>
  resolveAllFields(cert).filter((f) => f.state === 'needs_review').length;

/**
 * Fold the API's post-resolution field states back into a Hub row so the modal and
 * the list update without a reload. Only fields that are now confirmed change value.
 */
export function applyFieldStatuses<T extends FieldStateCert>(
  cert: T,
  statuses: Record<string, FieldStatusView>,
  extra: { reviewFields?: string[]; reviewCandidates?: T['reviewCandidates']; enrichmentStatus?: string | null; sectorName?: string | null } = {},
): T {
  const next: Record<string, unknown> = { ...(cert as Record<string, unknown>), fieldStatus: statuses };
  for (const def of FIELD_DEFS) {
    const s = statuses[def.key];
    if (!s || s.status !== 'confirmed') continue;
    next[def.key] = s.value;
    if (def.key === 'bbbeeLevel') next.bbbeeLevelStatus = `Level ${s.value}`;
    if (def.key === 'companyName') next.metadataComplete = true;
  }
  if (extra.reviewFields) next.reviewFields = extra.reviewFields;
  if (extra.reviewCandidates) next.reviewCandidates = extra.reviewCandidates;
  if (extra.enrichmentStatus !== undefined) next.enrichmentStatus = extra.enrichmentStatus;
  if (extra.sectorName !== undefined && extra.sectorName !== null) next.sectorName = extra.sectorName;
  return next as T;
}
