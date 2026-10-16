import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The certificate metadata pipeline: extracted value -> trusted value or held
 * review candidate -> persisted record -> API response. A plausible value must end
 * up as exactly one of: trusted, review candidate, or explicitly missing - never
 * silently dropped, and a trusted value must never be overwritten by something
 * weaker.
 */

const aggregate = vi.hoisted(() => vi.fn());
const countDocuments = vi.hoisted(() => vi.fn());
const find = vi.hoisted(() => vi.fn());
const updateOne = vi.hoisted(() => vi.fn());
const findOneAndUpdate = vi.hoisted(() => vi.fn());

vi.mock('@azure/storage-blob', () => ({ BlobServiceClient: class BlobServiceClient {} }));
vi.mock('tesseract.js', () => ({ default: { recognize: vi.fn() } }));
vi.mock('../../../models.js', () => ({
  CertificateMetadataModel: { aggregate, countDocuments, find, updateOne, findOneAndUpdate },
}));
vi.mock('../azureCertStorage.js', () => ({
  getCertContainerClient: vi.fn(),
  getCertAccountName: () => 'acct',
  getCertBlobContainerName: () => 'certificates',
  listCertificateBlobs: vi.fn(),
}));
vi.mock('../certificateExtractor.js', () => ({
  extractCertificateData: vi.fn(() => ({})),
  isValidSupplierName: vi.fn(() => true),
}));
vi.mock('../certificateStore.js', () => ({ normalizeVat: vi.fn((v: string) => v) }));
vi.mock('../documentIntelligence.js', () => ({ extractTextWithDocIntelligence: vi.fn() }));

import {
  bestCandidatePerField,
  buildReviewCandidates,
  collectFieldCandidates,
  ENRICHMENT_FIELDS,
  isHumanConfirmed,
  MIN_SAVE_CONFIDENCE,
  mergeReviewCandidates,
  runCertificateEnrichmentJob,
  shouldUpdateField,
  type FieldCandidate,
} from '../certificateEnrichmentJob.js';
import { buildFieldStatuses } from '../certificateFieldStatus.js';
import { buildReviewResolution, coerceReviewValue } from '../certificateReview.js';
import { mapCertificateRegistryItem } from '../certificateRegistry.js';

const FIELDS = [...ENRICHMENT_FIELDS];
const candidatesFor = (text: string, file = 'cert.pdf') => {
  const reviews: any[] = [];
  const candidates = collectFieldCandidates(text, file, FIELDS, reviews);
  return { candidates, reviews, byField: (f: string) => candidates.find((c) => c.field === f) };
};
const pad = (s: string) => `B-BBEE VERIFICATION CERTIFICATE\nCompany Name: Test Trading (Pty) Ltd\n${s}\n`;

/** Run the real enrichment job over one stored document and return what it wrote. */
async function enrich(doc: Record<string, any>, options: Record<string, unknown> = {}) {
  find.mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => [doc] }) }) });
  findOneAndUpdate.mockResolvedValue({});
  const result = await runCertificateEnrichmentJob({} as never, { onlyUsableText: true, limit: 5, includeDetails: true, ...options });
  const update = findOneAndUpdate.mock.calls[0]?.[1];
  return { result, set: update?.$set ?? {}, audit: update?.$push?.auditLog?.$each?.[0] };
}
const storedDoc = (text: string, extra: Record<string, any> = {}) => ({
  id: 'c1', blobName: 'org/c1.pdf', fileName: 'c1.pdf',
  extractionStatus: 'completed', extractionMode: 'pdf_text', extractedTextLength: text.length, extractedText: text,
  ...extra,
});

beforeEach(() => {
  [aggregate, countDocuments, find, updateOne, findOneAndUpdate].forEach((m) => m.mockReset());
  countDocuments.mockResolvedValue(0);
  aggregate.mockResolvedValue([]);
  updateOne.mockResolvedValue({});
});

describe('persistence: trusted value vs review candidate', () => {
  it('persists a high-confidence labelled value with its provenance', async () => {
    const text = pad('Registration Number: 2019/123456/07');
    const { set, audit } = await enrich(storedDoc(text));
    expect(set.registrationNumber).toBe('2019/123456/07');
    expect(set.fieldConfidence.registrationNumber).toMatchObject({ confidence: 0.94, source: 'text', validation: 'accepted' });
    // provenance trail: what was extracted, how sure, what was kept
    const decision = audit.fieldDecisions.find((d: any) => d.field === 'registrationNumber');
    expect(decision).toMatchObject({ decision: 'accepted', extractedValue: '2019/123456/07', persistedValue: '2019/123456/07' });
  });

  it('holds a low-confidence value as a review candidate with its REAL confidence, not a flat default', async () => {
    const text = pad('Reg. No.: 2019/123456/07');
    const { set, audit } = await enrich(storedDoc(text));
    expect(set.registrationNumber).toBeUndefined();
    expect(set.reviewCandidates.registrationNumber).toMatchObject({
      value: '2019/123456/07', confidence: 0.72, source: 'text', needsReview: true,
    });
    expect(set.reviewCandidates.registrationNumber.reason).toMatch(/below safe-save/i);
    expect(audit.fieldDecisions.find((d: any) => d.field === 'registrationNumber')).toMatchObject({
      decision: 'needs_review', persistedValue: null,
    });
    expect(set.metadataStatus).toBe('needs_review');
  });

  it('never writes null over a metadata field', async () => {
    const { set } = await enrich(storedDoc(pad('nothing useful here, just filler text for the length')));
    const nulls = Object.entries(set).filter(([k, v]) => v === null && !['extractionError'].includes(k));
    expect(nulls).toEqual([]);
  });
});

describe('a trusted value is never overwritten by something weaker', () => {
  const text = pad('VAT Number: 4012345678');

  it('keeps an existing value that has no recorded confidence, even when force is on', async () => {
    for (const force of [false, true]) {
      findOneAndUpdate.mockClear();
      const { set } = await enrich(storedDoc(text, { vatNumber: '4999999999' }), { force });
      expect(set.vatNumber).toBeUndefined();
    }
  });

  it('never replaces a value a person confirmed, not even with force', async () => {
    const doc = storedDoc(text, { vatNumber: '4999999999', fieldConfidence: { vatNumber: { source: 'manual', confidence: 1, confirmedBy: 'u1', confirmedAt: new Date() } } });
    expect(isHumanConfirmed(doc, 'vatNumber')).toBe(true);
    const { set } = await enrich(doc, { force: true });
    expect(set.vatNumber).toBeUndefined();
  });

  it('replaces a stored value only with a strictly more confident candidate', () => {
    const candidate = (confidence: number): FieldCandidate => ({ field: 'vatNumber', mongoField: 'vatNumber', value: '4012345678', confidence, evidence: '', source: 'text' });
    const doc = (conf: number) => ({ vatNumber: '4999999999', fieldConfidence: { vatNumber: { confidence: conf, source: 'text' } } });
    expect(shouldUpdateField(doc(0.95), 'vatNumber', candidate(0.96), true)).toBe(true);   // stronger, forced
    expect(shouldUpdateField(doc(0.95), 'vatNumber', candidate(0.96), false)).toBe(false); // above the bar already
    expect(shouldUpdateField(doc(0.95), 'vatNumber', candidate(0.95), true)).toBe(false);  // equal is not stronger
    expect(shouldUpdateField(doc(0.5), 'vatNumber', candidate(0.96), false)).toBe(true);   // existing was below the bar
    expect(shouldUpdateField({}, 'vatNumber', candidate(0.1), false)).toBe(true);          // empty field is filled
  });

  it('keeps the most confident candidate per field within one run', () => {
    const mk = (confidence: number, value: number): FieldCandidate => ({ field: 'bbbeeLevel', mongoField: 'bbbeeLevel', value, confidence, evidence: '', source: 'text' });
    expect(bestCandidatePerField([mk(0.9, 3), mk(0.95, 2), mk(0.9, 4)]).map((c) => c.value)).toEqual([2]);
  });
});

describe('ambiguous and context-dependent values', () => {
  it('two different VAT numbers require review and are all kept as alternatives', async () => {
    const text = pad('VAT Number: 4012345678\nVAT Number: 4987654321');
    const { set } = await enrich(storedDoc(text));
    expect(set.vatNumber).toBeUndefined();
    const held = set.reviewCandidates.vatNumber;
    expect(held.ambiguous).toBe(true);
    expect(held.candidates.map((c: any) => c.value).sort()).toEqual(['4012345678', '4987654321']);
  });

  it('accepts a VAT number behind the "(if applicable)" form annotation, including OCR slips', () => {
    for (const label of ['(if applicable)', '(lf applicable)', '(if aoolicable)', '{if applicable)']) {
      expect(candidatesFor(pad(`VAT Number ${label} 4012345678`)).byField('vatNumber')?.value).toBe('4012345678');
    }
  });

  it('does not trust a number that follows another word as the VAT number: it is held below the save bar', async () => {
    const found = candidatesFor(pad('VAT Number: refer to supplier 4012345678')).byField('vatNumber');
    expect(found?.confidence).toBeLessThan(MIN_SAVE_CONFIDENCE.vatNumber);
    const { set } = await enrich(storedDoc(pad('VAT Number: refer to supplier 4012345678')));
    expect(set.vatNumber).toBeUndefined();
    expect(set.reviewCandidates.vatNumber.value).toBe('4012345678');
  });

  it('two different registration numbers (supplier vs verification agency) are never guessed between', () => {
    const { byField, reviews } = candidatesFor(pad('Registration Number: 2019/123456/07\nAgency Registration Number: 2005/654321/07'));
    expect(byField('registrationNumber')).toBeUndefined();
    const review = reviews.find((r) => r.field === 'registrationNumber');
    expect(review.candidates).toHaveLength(2);
  });

  it('requires B-BBEE context for a level: a bare "Level 2" is not a level', () => {
    expect(candidatesFor(pad('Please contact our Level 2 support desk for help')).byField('bbbeeLevel')).toBeUndefined();
    expect(candidatesFor(pad('B-BBEE Status Level: 4')).byField('bbbeeLevel')?.value).toBe(4);
  });

  it('does not read a level out of a sworn-affidavit tick-box table that lists every level', () => {
    const table = 'SWORN AFFIDAVIT\nDeponent declares the following\nLevel One Contributor [ ]\nLevel Two Contributor [ ]\nLevel Three Contributor [ ]\n';
    expect(candidatesFor(table).byField('bbbeeLevel')).toBeUndefined();
  });

  it('keeps the expiry date apart from the issue date', () => {
    const { byField } = candidatesFor(pad('Issue Date: 15 March 2025\nExpiry Date: 14 March 2026'));
    expect((byField('expiryDate')?.value as Date).toISOString().slice(0, 10)).toBe('2026-03-14');
    expect((byField('issueDate')?.value as Date).toISOString().slice(0, 10)).toBe('2025-03-15');
    expect((candidatesFor(pad('Valid from 15 March 2025 to 14 March 2026')).byField('expiryDate')?.value as Date).toISOString().slice(0, 10)).toBe('2026-03-14');
  });

  it('does not invent an expiry date when only an issue date is present', () => {
    expect(candidatesFor(pad('Date of Issue: 15 March 2025')).byField('expiryDate')).toBeUndefined();
  });
});

describe('review candidates are preserved, merged and respected', () => {
  it('keeps confidence, source, reason and evidence of a held candidate', () => {
    const held = buildReviewCandidates(null, {}, [
      { field: 'vatNumber', reason: 'Candidate confidence below safe-save threshold', value: '4012345678', confidence: 0.74, source: 'text', evidence: 'VAT 4012345678' },
    ]);
    expect(held.vatNumber).toMatchObject({ value: '4012345678', confidence: 0.74, source: 'text', reason: expect.stringContaining('safe-save'), evidence: 'VAT 4012345678', needsReview: true });
  });

  it('falls back to the loose-hint confidence only when the extractor gave none', () => {
    const held = buildReviewCandidates(null, {}, [{ field: 'expiryDate', reason: 'Loose extractor found a value', value: '2027-01-01' }]);
    expect(held.expiryDate.confidence).toBe(0.62);
    expect(held.expiryDate.source).toBe('regex_fallback');
  });

  it('drops a review with neither a value nor alternatives, but keeps alternatives without a value', () => {
    expect(buildReviewCandidates(null, {}, [{ field: 'vatNumber', reason: 'missing_vat_number' }])).toEqual({});
    const held = buildReviewCandidates(null, {}, [{ field: 'vatNumber', reason: 'multiple', candidates: [{ value: '4000000001', snippet: 'a', confidence: 0.9 }, { value: '4000000002', snippet: 'b', confidence: 0.9 }] }]);
    expect(held.vatNumber.ambiguous).toBe(true);
  });

  it('does not hold a candidate for a field that already has a trusted value', () => {
    expect(buildReviewCandidates({ vatNumber: '4999999999' }, {}, [{ field: 'vatNumber', reason: 'x', value: '4012345678' }])).toEqual({});
  });

  it('does not propose a value again once a person rejected it', () => {
    const doc = { rejectedCandidates: { vatNumber: ['4012345678'] } };
    expect(buildReviewCandidates(doc, {}, [{ field: 'vatNumber', reason: 'x', value: '4012345678' }])).toEqual({});
    expect(buildReviewCandidates(doc, {}, [{ field: 'vatNumber', reason: 'x', value: '4777777777' }]).vatNumber).toBeDefined();
  });

  it('keeps the stronger of an old and a new candidate and drops a stored one that was rejected', () => {
    const old = { vatNumber: { value: '4000000001', confidence: 0.8 }, expiryDate: { value: '2027-01-01', confidence: 0.6 } };
    const merged = mergeReviewCandidates({ reviewCandidates: old, rejectedCandidates: { expiryDate: ['2027-01-01'] } }, {
      vatNumber: { field: 'vatNumber', value: '4000000002', confidence: 0.6 } as any,
    });
    expect(merged.vatNumber.value).toBe('4000000001'); // weaker new proposal does not replace it
    expect(merged.expiryDate).toBeUndefined();          // rejected stays gone
  });

  it('keeps candidates that this run did not touch (nothing is silently discarded)', async () => {
    const doc = storedDoc(pad('plain filler text with no useful labels at all.'), { reviewCandidates: { companySize: { value: 'QSE', confidence: 0.7 } } });
    const { set } = await enrich(doc);
    expect(set.reviewCandidates.companySize.value).toBe('QSE');
  });
});

describe('safe-save thresholds', () => {
  it('every enrichment field has a threshold (the table is no longer type-checked against the field list)', () => {
    for (const field of ENRICHMENT_FIELDS) {
      expect(typeof MIN_SAVE_CONFIDENCE[field], field).toBe('number');
      expect(MIN_SAVE_CONFIDENCE[field]).toBeGreaterThan(0.5);
      expect(MIN_SAVE_CONFIDENCE[field]).toBeLessThanOrEqual(1);
    }
  });
});

describe('field status: confirmed / needs_review / missing', () => {
  const textDoc = { extractionStatus: 'completed', extractionMode: 'pdf_text', extractedTextLength: 900, lastEnrichedAt: new Date() };

  it('confirmed: a stored value, with its provenance', () => {
    const s = buildFieldStatuses({ ...textDoc, vatNumber: '4012345678', fieldConfidence: { vatNumber: { confidence: 0.96, source: 'text' } } }).vatNumber;
    expect(s).toMatchObject({ status: 'confirmed', value: '4012345678', confidence: 0.96, source: 'text', candidate: null });
  });

  it('needs_review: no trusted value but a held candidate - the candidate is shown, not a blank', () => {
    const s = buildFieldStatuses({ ...textDoc, reviewCandidates: { bbbeeLevel: { value: 2, confidence: 0.74, source: 'text', reason: 'Below automatic acceptance threshold', evidence: 'level 2' } } }).bbbeeLevel;
    expect(s.status).toBe('needs_review');
    expect(s.value).toBeNull();
    expect(s.candidate).toMatchObject({ value: 2, confidence: 0.74, source: 'text', reason: 'Below automatic acceptance threshold', ambiguous: false });
  });

  it('needs_review (ambiguous): every alternative is exposed', () => {
    const s = buildFieldStatuses({ ...textDoc, reviewCandidates: { vatNumber: { candidates: [{ value: '4000000001', snippet: 'a', confidence: 0.9 }, { value: '4000000002', snippet: 'b', confidence: 0.9 }] } } }).vatNumber;
    expect(s.candidate?.ambiguous).toBe(true);
    expect(s.candidate?.alternatives.map((a) => a.value)).toEqual(['4000000001', '4000000002']);
  });

  it('needs_review: a stored value known to be below the safe-save bar is flagged, a person-confirmed one is not', () => {
    expect(buildFieldStatuses({ ...textDoc, vatNumber: '4012345678', fieldConfidence: { vatNumber: { confidence: 0.5, source: 'text' } } }).vatNumber.status).toBe('needs_review');
    expect(buildFieldStatuses({ ...textDoc, vatNumber: '4012345678', fieldConfidence: { vatNumber: { confidence: 1, source: 'manual', confirmedBy: 'u1' } } }).vatNumber.status).toBe('confirmed');
  });

  it('missing, and says why', () => {
    expect(buildFieldStatuses({ extractionStatus: 'text_too_short' }).vatNumber).toMatchObject({ status: 'missing', missingReason: 'no_usable_text' });
    expect(buildFieldStatuses({ ...textDoc, lastEnrichedAt: null }).vatNumber.missingReason).toBe('enrichment_pending');
    expect(buildFieldStatuses(textDoc).vatNumber.missingReason).toBe('not_found_in_text');
  });

  it('a stored legacy sector code is shown but flagged for review, never reported as confirmed or blank', () => {
    const s = buildFieldStatuses({ ...textDoc, sectorCode: 'GENERIC' }).sectorCode;
    expect(s).toMatchObject({ status: 'needs_review', value: 'GENERIC', reviewReason: 'sector_code_not_a_known_hub_sector' });
    expect(buildFieldStatuses({ ...textDoc, sectorCode: 'ICT' }).sectorCode.status).toBe('confirmed');
  });

  it('reads the registration number from either stored column', () => {
    expect(buildFieldStatuses({ ...textDoc, companyRegistrationNumber: '2019/123456/07' }).registrationNumber.value).toBe('2019/123456/07');
    expect(buildFieldStatuses({ ...textDoc, registrationNumber: '2019/123456/07' }).registrationNumber.status).toBe('confirmed');
  });
});

describe('resolving a candidate: confirm / edit / reject', () => {
  const now = new Date('2026-10-07T10:00:00Z');
  const doc = {
    reviewFields: ['vatNumber', 'bbbeeLevel'],
    reviewCandidates: {
      vatNumber: { value: '4012345678', confidence: 0.74, source: 'text', reason: 'low confidence' },
      bbbeeLevel: { value: 2, confidence: 0.7, source: 'text' },
    },
  };

  it('confirm: stores the held value as trusted, marks it manual, clears only that candidate', () => {
    const r = buildReviewResolution({ doc, field: 'vatNumber', action: 'confirm', userId: 'u1', now });
    if (!r.ok) throw new Error(r.message);
    const u: any = r.update;
    expect(u.$set.vatNumber).toBe('4012345678');
    expect(u.$set['fieldConfidence.vatNumber']).toMatchObject({ source: 'manual', confidence: 1, confirmedBy: 'u1', matchedCandidate: true });
    expect(u.$unset).toEqual({ 'reviewCandidates.vatNumber': '' });
    expect(u.$pull).toEqual({ reviewFields: 'vatNumber' });
    expect(u.$set.metadataStatus).toBe('needs_review'); // bbbeeLevel still pending
    expect(JSON.stringify(u)).not.toContain('bbbeeLevel": 2'); // the OTHER candidate is untouched
  });

  it('confirm clears the review status when it was the last pending field', () => {
    const r = buildReviewResolution({ doc: { reviewFields: ['vatNumber'], reviewCandidates: { vatNumber: doc.reviewCandidates.vatNumber } }, field: 'vatNumber', action: 'confirm', userId: 'u1', now });
    expect(r.ok && (r.update as any).$set).toMatchObject({ metadataStatus: 'complete', enrichmentStatus: 'completed' });
  });

  it('edit: saves the corrected value and records that it differs from the candidate', () => {
    const r = buildReviewResolution({ doc, field: 'vatNumber', action: 'edit', value: '4111111111', userId: 'u1', now });
    expect(r.ok && (r.update as any).$set['fieldConfidence.vatNumber'].matchedCandidate).toBe(false);
    expect(r.ok && (r.update as any).$set.vatNumber).toBe('4111111111');
  });

  it('reject: removes it from the held list but keeps it inspectable, and never re-proposes it', () => {
    const r = buildReviewResolution({ doc, field: 'vatNumber', action: 'reject', userId: 'u1', now });
    if (!r.ok) throw new Error(r.message);
    const u: any = r.update;
    expect(u.$set.vatNumber).toBeUndefined();                   // nothing trusted was written
    expect(u.$unset).toEqual({ 'reviewCandidates.vatNumber': '' });
    expect(u.$addToSet['rejectedCandidates.vatNumber'].$each).toEqual(['4012345678']);
    const entry = u.$push.auditLog.$each[0];
    expect(entry).toMatchObject({ type: 'certificate_review_resolved', action: 'reject', field: 'vatNumber', by: 'u1' });
    expect(entry.previousCandidate.value).toBe('4012345678'); // inspectable
  });

  it('an ambiguous field cannot be confirmed without choosing one value', () => {
    const ambiguous = { reviewCandidates: { vatNumber: { ambiguous: true, candidates: [{ value: '4000000001' }, { value: '4000000002' }] } } };
    const none = buildReviewResolution({ doc: ambiguous, field: 'vatNumber', action: 'confirm', userId: 'u1' });
    expect(none).toMatchObject({ ok: false, status: 400 });
    const chosen = buildReviewResolution({ doc: ambiguous, field: 'vatNumber', action: 'confirm', value: '4000000002', userId: 'u1' });
    expect(chosen.ok && (chosen.update as any).$set.vatNumber).toBe('4000000002');
  });

  it('rejects invalid values instead of coercing them', () => {
    expect(coerceReviewValue('vatNumber', '12345')).toMatchObject({ ok: false });
    expect(coerceReviewValue('bbbeeLevel', '12')).toMatchObject({ ok: false });
    expect(coerceReviewValue('blackOwnership', '140')).toMatchObject({ ok: false });
    expect(coerceReviewValue('registrationNumber', 'abc')).toMatchObject({ ok: false });
    expect(coerceReviewValue('expiryDate', 'not a date')).toMatchObject({ ok: false });
    expect(coerceReviewValue('bbbeeLevel', 'Level 3')).toMatchObject({ ok: true, value: 3 });
  });

  it('cannot confirm or reject a candidate that is not there', () => {
    expect(buildReviewResolution({ doc: {}, field: 'vatNumber', action: 'confirm', userId: 'u1' })).toMatchObject({ ok: false, status: 409 });
    expect(buildReviewResolution({ doc: {}, field: 'vatNumber', action: 'reject', userId: 'u1' })).toMatchObject({ ok: false, status: 409 });
  });
});

describe('API serialization carries the review data', () => {
  it('returns trusted values, review candidates, confidence and the explicit per-field state', () => {
    const item = mapCertificateRegistryItem({
      id: 'c1', blobName: 'b.pdf', fileName: 'b.pdf', supplierName: 'Test (Pty) Ltd',
      companyRegistrationNumber: '2019/123456/07',
      extractionStatus: 'completed', extractionMode: 'pdf_text', extractedTextLength: 900, lastEnrichedAt: new Date(),
      fieldConfidence: { companyName: { confidence: 0.9, source: 'text' } },
      reviewFields: ['bbbeeLevel'],
      reviewCandidates: { bbbeeLevel: { value: 2, confidence: 0.74, source: 'text', reason: 'low', evidence: 'level 2' } },
      metadataStatus: 'needs_review', enrichmentStatus: 'review_required',
    });
    expect(item.company_registration_number).toBe('2019/123456/07');
    expect(item.review_candidates).toHaveProperty('bbbeeLevel.confidence', 0.74);
    expect(item.field_confidence).toHaveProperty('companyName.confidence', 0.9);
    expect(item.field_status.bbbeeLevel).toMatchObject({ status: 'needs_review', candidate: { value: 2, confidence: 0.74 } });
    expect(item.field_status.companyName.status).toBe('confirmed');
    expect(item.field_status.vatNumber).toMatchObject({ status: 'missing', missingReason: 'not_found_in_text' });
    expect(item.metadata_summary).toMatchObject({ confirmed: 2, needs_review: 1 });
  });
});
