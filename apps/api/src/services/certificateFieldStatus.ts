/**
 * Per-field metadata state for a certificate: confirmed / needs_review / missing.
 *
 * This is DERIVED from structures the record already has (the stored value,
 * `fieldConfidence`, `reviewCandidates`, the extraction status) - it adds no new
 * storage. Every consumer (the registry API, the Hub, the diagnostics) asks this
 * one function, so a field can never be "blank" in one place and "needs review"
 * in another.
 *
 *   confirmed      a trusted value is stored (accepted by validation, or confirmed by a person)
 *   needs_review   no trusted value, but a plausible candidate is being held for a person
 *                  (or a stored value is below the safe-save bar)
 *   missing        nothing plausible was found; `missingReason` says why
 */
import { FIELD_MIN_SAVE_CONFIDENCE } from './certificateFieldThresholds.js';
import { resolveOkiruHubSector } from './okiruHubSectors.js';
import type { EnrichmentField } from './certificateEnrichmentJob.js';

export type FieldStatusKind = 'confirmed' | 'needs_review' | 'missing';

export type MissingReason =
  /** The document has no usable extracted text, so nothing could be read. */
  | 'no_usable_text'
  /** Enrichment has not run on this record yet. */
  | 'enrichment_pending'
  /** Text exists and was searched; the value is not in it. */
  | 'not_found_in_text';

export interface FieldCandidateView {
  value: string | number | boolean | null;
  confidence: number | null;
  source: string | null;
  reason: string | null;
  evidence: string | null;
  /** Several values compete; a person must choose one of `alternatives`. */
  ambiguous: boolean;
  alternatives: Array<{ value: string | number | boolean | null; confidence: number | null; snippet: string | null }>;
}

export interface FieldStatus {
  field: string;
  status: FieldStatusKind;
  /** The trusted value, or null when there is none. */
  value: string | number | boolean | null;
  /** Provenance of the trusted value. */
  confidence: number | null;
  source: string | null;
  confirmedBy: string | null;
  confirmedAt: string | null;
  /** The held candidate when status is needs_review and nothing trusted is stored. */
  candidate: FieldCandidateView | null;
  /** Why a stored value was flagged, when status is needs_review with a stored value. */
  reviewReason: string | null;
  missingReason: MissingReason | null;
}

type Doc = Record<string, any>;

/** The fields the Certificate Hub reports on, and where each lives on the record. */
export const STATUS_FIELDS: ReadonlyArray<{ key: EnrichmentField; mongo: readonly string[] }> = [
  { key: 'companyName', mongo: ['supplierName'] },
  { key: 'registrationNumber', mongo: ['companyRegistrationNumber', 'registrationNumber'] },
  { key: 'vatNumber', mongo: ['vatNumber'] },
  { key: 'bbbeeLevel', mongo: ['bbbeeLevel'] },
  { key: 'blackOwnership', mongo: ['blackOwnership'] },
  { key: 'blackWomenOwnership', mongo: ['blackWomenOwnership'] },
  { key: 'companySize', mongo: ['companySize'] },
  { key: 'expiryDate', mongo: ['expiryDate'] },
  { key: 'sectorCode', mongo: ['sectorCode'] },
];

const USABLE_MODES = ['azure_document_intelligence', 'pdf_text', 'ppocr', 'ocr'];
const MIN_USEFUL_TEXT = 50;

const present = (v: unknown): boolean =>
  v != null && !(typeof v === 'string' && v.trim() === '') && !(v instanceof Date && Number.isNaN(v.getTime()));

function plain(v: unknown): string | number | boolean | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  return null;
}

/** Cheap check that works on registry projections (which carry no extractedText). */
function hasUsableText(doc: Doc): boolean {
  return doc.extractionStatus === 'completed'
    && USABLE_MODES.includes(String(doc.extractionMode ?? ''))
    && Number(doc.extractedTextLength ?? 0) >= MIN_USEFUL_TEXT;
}

function isoOrNull(v: unknown): string | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  return typeof v === 'string' && v ? v : null;
}

function candidateView(raw: any): FieldCandidateView | null {
  if (!raw || typeof raw !== 'object') return null;
  const alternatives = Array.isArray(raw.candidates)
    ? raw.candidates
        .filter((c: any) => c && present(c.value))
        .map((c: any) => ({
          value: plain(c.value),
          confidence: typeof c.confidence === 'number' ? c.confidence : null,
          snippet: typeof c.snippet === 'string' ? c.snippet : null,
        }))
    : [];
  const value = plain(raw.value) ?? alternatives[0]?.value ?? null;
  if (value == null && alternatives.length === 0) return null;
  return {
    value,
    confidence: typeof raw.confidence === 'number' ? raw.confidence : null,
    source: typeof raw.source === 'string' ? raw.source : null,
    reason: typeof raw.reason === 'string' ? raw.reason : null,
    evidence: typeof raw.evidence === 'string' ? raw.evidence : null,
    ambiguous: raw.ambiguous === true || alternatives.length > 1,
    alternatives,
  };
}

export function buildFieldStatus(doc: Doc, key: EnrichmentField, mongo: readonly string[]): FieldStatus {
  const storedKey = mongo.find((k) => present(doc[k]));
  const value = storedKey ? plain(doc[storedKey]) : null;
  const meta = doc.fieldConfidence?.[key];
  const confidence = typeof meta?.confidence === 'number' ? meta.confidence : null;
  const source = typeof meta?.source === 'string' ? meta.source : null;
  const confirmedBy = typeof meta?.confirmedBy === 'string' ? meta.confirmedBy : null;
  const confirmedAt = isoOrNull(meta?.confirmedAt);
  const base = { field: key, confidence, source, confirmedBy, confirmedAt };

  if (value != null) {
    const human = source === 'manual' || !!confirmedAt || !!confirmedBy;
    const bar = FIELD_MIN_SAVE_CONFIDENCE[key];
    // Older values have no recorded confidence and are treated as trusted; only a
    // value we KNOW was stored below the safe-save bar is flagged.
    const lowConfidence = !human && confidence != null && bar != null && confidence < bar;
    // A sector must be one of the canonical hub sectors; a legacy code is shown
    // (never hidden) but flagged, matching the list API which withholds it.
    const unknownSector = key === 'sectorCode' && !human && !resolveOkiruHubSector(value as string);
    const flagged = lowConfidence || unknownSector;
    return {
      ...base,
      status: flagged ? 'needs_review' : 'confirmed',
      value,
      candidate: null,
      reviewReason: unknownSector ? 'sector_code_not_a_known_hub_sector' : lowConfidence ? 'stored_value_below_safe_save_confidence' : null,
      missingReason: null,
    };
  }

  const candidate = candidateView(doc.reviewCandidates?.[key]);
  if (candidate) {
    return { ...base, status: 'needs_review', value: null, candidate, reviewReason: candidate.reason, missingReason: null };
  }

  const missingReason: MissingReason = !hasUsableText(doc)
    ? 'no_usable_text'
    : doc.lastEnrichedAt ? 'not_found_in_text' : 'enrichment_pending';
  return { ...base, status: 'missing', value: null, candidate: null, reviewReason: null, missingReason };
}

export function buildFieldStatuses(doc: Doc): Record<string, FieldStatus> {
  const out: Record<string, FieldStatus> = {};
  for (const { key, mongo } of STATUS_FIELDS) out[key] = buildFieldStatus(doc, key, mongo);
  return out;
}

export function summariseFieldStatuses(statuses: Record<string, FieldStatus>): Record<FieldStatusKind, number> {
  const summary: Record<FieldStatusKind, number> = { confirmed: 0, needs_review: 0, missing: 0 };
  for (const s of Object.values(statuses)) summary[s.status]++;
  return summary;
}
