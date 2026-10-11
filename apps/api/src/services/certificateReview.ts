/**
 * Resolving a held review candidate: confirm, edit or reject - one field at a time.
 *
 * Pure: it validates the value and BUILDS the MongoDB update, nothing more, so the
 * rules are unit-testable without a database and the route is a thin wrapper.
 *
 * What each action leaves behind:
 *   confirm / edit  the value becomes the trusted value, its provenance is marked
 *                   manual (so enrichment can never replace it), the held candidate
 *                   is cleared, and the resolution is appended to the audit log.
 *   reject          the candidate is removed from the held list but REMAINS
 *                   inspectable (audit log + rejectedCandidates), and the same value
 *                   is never proposed again for that field.
 * A field is only ever resolved when the caller names it. Saving one field can no
 * longer silently confirm every other pending candidate.
 */
import { resolveOkiruHubSector } from './okiruHubSectors.js';
import type { EnrichmentField } from './certificateEnrichmentJob.js';

export type ReviewAction = 'confirm' | 'edit' | 'reject';

type Doc = Record<string, any>;
type Coerced = { ok: true; value: string | number | Date; extra?: Record<string, unknown> } | { ok: false; message: string };

/** Fields a person can resolve, and where each is stored. */
export const REVIEW_FIELD_MAP: Record<string, { mongo: string; label: string }> = {
  companyName: { mongo: 'supplierName', label: 'Company name' },
  registrationNumber: { mongo: 'registrationNumber', label: 'Registration number' },
  vatNumber: { mongo: 'vatNumber', label: 'VAT number' },
  bbbeeLevel: { mongo: 'bbbeeLevel', label: 'B-BBEE level' },
  blackOwnership: { mongo: 'blackOwnership', label: 'Black ownership' },
  blackWomenOwnership: { mongo: 'blackWomenOwnership', label: 'Black women ownership' },
  companySize: { mongo: 'companySize', label: 'Company size' },
  expiryDate: { mongo: 'expiryDate', label: 'Expiry date' },
  sectorCode: { mongo: 'sectorCode', label: 'Sector' },
};

const SIZES: Record<string, string> = {
  eme: 'EME', qse: 'QSE', generic: 'Generic Enterprise', 'generic enterprise': 'Generic Enterprise',
  large: 'Large Enterprise', 'large enterprise': 'Large Enterprise', micro: 'Micro', small: 'Small', medium: 'Medium',
  specialised: 'Specialised', specialized: 'Specialised',
};

/** Validate and normalise a value for a field. Never coerces something invalid into something plausible. */
export function coerceReviewValue(field: string, raw: unknown): Coerced {
  const label = REVIEW_FIELD_MAP[field]?.label ?? field;
  if (raw == null || (typeof raw === 'string' && raw.trim() === '')) return { ok: false, message: `${label} needs a value` };
  const text = String(raw).trim();

  switch (field) {
    case 'companyName':
      return text.length >= 2 && text.length <= 150 ? { ok: true, value: text } : { ok: false, message: `${label} must be 2-150 characters` };
    case 'registrationNumber': {
      const compact = text.toUpperCase().replace(/\s+/g, '');
      return /^\d{4}\/\d{6}\/\d{2,3}$/.test(compact) || /^\d{10,14}$/.test(compact)
        ? { ok: true, value: compact }
        : { ok: false, message: `${label} must look like 2019/123456/07` };
    }
    case 'vatNumber': {
      const digits = text.replace(/[\s-]/g, '');
      return /^4\d{9}$/.test(digits) ? { ok: true, value: digits } : { ok: false, message: `${label} must be 10 digits starting with 4` };
    }
    case 'bbbeeLevel': {
      const n = Number(text.replace(/^level\s*/i, ''));
      return Number.isInteger(n) && n >= 1 && n <= 8 ? { ok: true, value: n } : { ok: false, message: `${label} must be a whole number from 1 to 8` };
    }
    case 'blackOwnership':
    case 'blackWomenOwnership': {
      const n = Number(text.replace('%', '').replace(',', '.'));
      return Number.isFinite(n) && n >= 0 && n <= 100 ? { ok: true, value: n } : { ok: false, message: `${label} must be between 0 and 100` };
    }
    case 'companySize': {
      const size = SIZES[text.toLowerCase()];
      return size ? { ok: true, value: size } : { ok: false, message: `${label} must be one of EME, QSE, Generic, Large, Specialised, Micro, Small or Medium` };
    }
    case 'expiryDate': {
      const d = new Date(text);
      return Number.isFinite(d.getTime()) && d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2100
        ? { ok: true, value: d }
        : { ok: false, message: `${label} must be a valid date` };
    }
    case 'sectorCode': {
      const sector = resolveOkiruHubSector(text);
      return sector
        ? { ok: true, value: sector.sectorCode, extra: { sectorName: sector.sectorName } }
        : { ok: false, message: `${label} is not a known sector code` };
    }
    default:
      return { ok: false, message: `${field} cannot be reviewed here` };
  }
}

export type ReviewResolution =
  | { ok: false; status: 400 | 404 | 409; message: string }
  | {
      ok: true;
      field: string;
      action: ReviewAction;
      value: string | number | Date | null;
      update: Record<string, unknown>;
    };

const same = (a: unknown, b: unknown) => String(a instanceof Date ? a.toISOString().slice(0, 10) : a).trim().toLowerCase()
  === String(b instanceof Date ? b.toISOString().slice(0, 10) : b).trim().toLowerCase();

/** Build the update for resolving ONE field of `doc`. */
export function buildReviewResolution(params: {
  doc: Doc;
  field: string;
  action: ReviewAction;
  value?: unknown;
  userId: string | null;
  note?: string | null;
  now?: Date;
}): ReviewResolution {
  const { doc, field, action, userId } = params;
  const now = params.now ?? new Date();
  const map = REVIEW_FIELD_MAP[field];
  if (!map) return { ok: false, status: 400, message: `${field} cannot be reviewed here` };
  if (!['confirm', 'edit', 'reject'].includes(action)) return { ok: false, status: 400, message: 'action must be confirm, edit or reject' };

  const held = doc.reviewCandidates?.[field];
  const alternatives: Array<{ value: unknown }> = Array.isArray(held?.candidates) ? held.candidates.filter((c: any) => c && c.value != null) : [];
  const heldValue = held?.value ?? alternatives[0]?.value ?? null;
  const ambiguous = held?.ambiguous === true || alternatives.length > 1;

  // Snapshot of what was proposed, kept in the audit log so it stays inspectable.
  const previousCandidate = held
    ? {
        value: heldValue,
        candidates: alternatives,
        confidence: typeof held.confidence === 'number' ? held.confidence : null,
        source: held.source ?? null,
        reason: held.reason ?? null,
      }
    : null;

  const remainingFields = Array.isArray(doc.reviewFields) ? doc.reviewFields.filter((f: string) => f !== field) : [];
  const remainingCandidates = Object.keys(doc.reviewCandidates ?? {}).filter((f) => f !== field);
  const stillNeedsReview = remainingFields.length > 0 || remainingCandidates.length > 0;
  const statusSet = {
    enrichmentStatus: stillNeedsReview ? 'review_required' : 'completed',
    metadataStatus: stillNeedsReview ? 'needs_review' : 'complete',
  };
  const audit = (extra: Record<string, unknown>) => ({
    id: `review-${now.getTime()}-${field}`,
    at: now,
    type: 'certificate_review_resolved',
    action,
    field,
    by: userId,
    note: params.note ?? null,
    previousCandidate,
    ...extra,
  });

  if (action === 'reject') {
    if (!held) return { ok: false, status: 409, message: `There is no pending ${map.label.toLowerCase()} candidate to reject` };
    const rejectedValues = [heldValue, ...alternatives.map((a) => a.value)].filter((v) => v != null);
    return {
      ok: true,
      field,
      action,
      value: null,
      update: {
        $set: { ...statusSet, updatedAt: now },
        $unset: { [`reviewCandidates.${field}`]: '' },
        $pull: { reviewFields: field },
        // Never propose the same value for this field again.
        $addToSet: { [`rejectedCandidates.${field}`]: { $each: rejectedValues.map((v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v)) } },
        $push: { auditLog: { $each: [audit({ value: null })], $slice: -50 } },
      },
    };
  }

  // confirm: use the held value; if several compete the person must name one.
  let raw = params.value;
  if (action === 'confirm' && (raw == null || raw === '')) {
    if (!held) return { ok: false, status: 409, message: `There is no pending ${map.label.toLowerCase()} candidate to confirm` };
    if (ambiguous) return { ok: false, status: 400, message: `Several ${map.label.toLowerCase()} values were found; choose one` };
    raw = heldValue;
  }
  const coerced = coerceReviewValue(field, raw);
  if (!coerced.ok) return { ok: false, status: 400, message: coerced.message };

  const set: Record<string, unknown> = {
    [map.mongo]: coerced.value,
    ...(coerced.extra ?? {}),
    [`fieldConfidence.${field}`]: {
      confidence: 1,
      source: 'manual',
      extractionMethod: 'manual_review',
      validation: 'confirmed_by_person',
      confirmedBy: userId,
      confirmedAt: now,
      action,
      // Where the value came from, when a held candidate was involved.
      proposedFrom: previousCandidate ? { source: previousCandidate.source, confidence: previousCandidate.confidence, reason: previousCandidate.reason } : null,
      matchedCandidate: previousCandidate ? same(coerced.value, previousCandidate.value) : false,
    },
    ...statusSet,
    updatedAt: now,
  };
  if (field === 'vatNumber') set.vatNumberNormalized = String(coerced.value);
  if (field === 'bbbeeLevel') set.bbbeeLevelStatus = `Level ${coerced.value}`;
  if (field === 'expiryDate') {
    const exp = (coerced.value as Date).getTime();
    set.status = exp < now.getTime() ? 'expired' : exp <= now.getTime() + 60 * 86_400_000 ? 'expiring' : 'valid';
  }

  return {
    ok: true,
    field,
    action,
    value: coerced.value,
    update: {
      $set: set,
      ...(held ? { $unset: { [`reviewCandidates.${field}`]: '' } } : {}),
      $pull: { reviewFields: field },
      $push: { auditLog: { $each: [audit({ value: coerced.value instanceof Date ? coerced.value.toISOString().slice(0, 10) : coerced.value })], $slice: -50 } },
    },
  };
}

/** Typed export so callers can name fields without importing the enrichment job. */
export const REVIEWABLE_FIELD_KEYS = Object.keys(REVIEW_FIELD_MAP) as EnrichmentField[];
