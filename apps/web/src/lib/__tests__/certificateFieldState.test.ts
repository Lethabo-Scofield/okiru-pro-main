import { describe, expect, it } from 'vitest';
import {
  applyFieldStatuses,
  countNeedsReview,
  formatFieldValue,
  resolveAllFields,
  resolveField,
  stateLabel,
  type FieldStatusView,
} from '../certificateFieldState';

/**
 * The Hub must never show a held candidate as a blank: a field is Confirmed,
 * Needs review (with the candidate shown) or Missing (with a reason).
 */

const status = (over: Partial<FieldStatusView>): FieldStatusView => ({
  field: 'vatNumber', status: 'missing', value: null, confidence: null, source: null,
  candidate: null, missingReason: null, ...over,
});

describe('resolveField - from the API field_status', () => {
  it('confirmed: shows the trusted value', () => {
    const f = resolveField({ fieldStatus: { vatNumber: status({ status: 'confirmed', value: '4012345678', confidence: 0.96, source: 'text' }) } }, 'vatNumber');
    expect(f).toMatchObject({ state: 'confirmed', display: '4012345678', confidence: 0.96 });
    expect(stateLabel(f.state)).toBe('Confirmed');
  });

  it('needs review: shows the candidate value (not blank) with its confidence, source and reason', () => {
    const f = resolveField({
      fieldStatus: {
        bbbeeLevel: status({
          field: 'bbbeeLevel', status: 'needs_review',
          candidate: { value: 2, confidence: 0.74, source: 'text', reason: 'Below automatic acceptance threshold', evidence: 'level 2', ambiguous: false, alternatives: [] },
        }),
      },
    }, 'bbbeeLevel');
    expect(f.state).toBe('needs_review');
    expect(f.display).toBe('Level 2');                 // the candidate, formatted - never blank or "Missing"
    expect(f.candidate).toMatchObject({ confidence: 0.74, source: 'text', reason: 'Below automatic acceptance threshold' });
    expect(f.note).toBe('Below automatic acceptance threshold');
    expect(stateLabel(f.state)).toBe('Needs review');
  });

  it('needs review (ambiguous): every alternative is exposed for the person to choose', () => {
    const f = resolveField({
      fieldStatus: {
        vatNumber: status({
          status: 'needs_review',
          candidate: { value: '4000000001', confidence: 0.9, source: 'text', reason: 'multiple_vat_like_candidates', evidence: null, ambiguous: true, alternatives: [{ value: '4000000001', confidence: 0.9, snippet: 'a' }, { value: '4000000002', confidence: 0.9, snippet: 'b' }] },
        }),
      },
    }, 'vatNumber');
    expect(f.candidate?.ambiguous).toBe(true);
    expect(f.candidate?.alternatives.map((a) => a.display)).toEqual(['4000000001', '4000000002']);
  });

  it('missing: no value and says why', () => {
    const f = resolveField({ fieldStatus: { vatNumber: status({ missingReason: 'no_usable_text' }) } }, 'vatNumber');
    expect(f).toMatchObject({ state: 'missing', display: null });
    expect(f.note).toMatch(/could not be read/i);
    expect(resolveField({ fieldStatus: { vatNumber: status({ missingReason: 'not_found_in_text' }) } }, 'vatNumber').note).toMatch(/not found/i);
  });

  it('a stored value flagged for review keeps showing the value and explains why', () => {
    const f = resolveField({ fieldStatus: { sectorCode: status({ field: 'sectorCode', status: 'needs_review', value: 'GENERIC', reviewReason: 'sector_code_not_a_known_hub_sector' }) } }, 'sectorCode');
    expect(f).toMatchObject({ state: 'needs_review', display: 'GENERIC' });
    expect(f.note).toMatch(/not one of the Okiru Hub sectors/);
  });

  it('knows when a person confirmed the value', () => {
    expect(resolveField({ fieldStatus: { vatNumber: status({ status: 'confirmed', value: '4012345678', source: 'manual', confirmedBy: 'u1' }) } }, 'vatNumber').confirmedByPerson).toBe(true);
  });
});

describe('resolveField - derived for an API without field_status', () => {
  it('a stored value is confirmed', () => {
    expect(resolveField({ bbbeeLevel: 4 }, 'bbbeeLevel')).toMatchObject({ state: 'confirmed', display: 'Level 4' });
  });

  it('a held candidate with no stored value is needs_review, NOT missing', () => {
    const f = resolveField({ reviewCandidates: { expiryDate: { value: '2027-03-31', confidence: 0.62, source: 'regex_fallback', reason: 'Loose extractor found a value' } } }, 'expiryDate');
    expect(f.state).toBe('needs_review');
    expect(f.display).toMatch(/2027/);
    expect(f.candidate?.confidence).toBe(0.62);
  });

  it('nothing stored and nothing held is missing', () => {
    expect(resolveField({}, 'vatNumber').state).toBe('missing');
  });

  it('the company name falls back to the file name for display only: it is not "confirmed" unless the record has a real supplier name', () => {
    expect(resolveField({ companyName: 'Acme From File Name', metadataComplete: false }, 'companyName').state).toBe('missing');
    expect(resolveField({ companyName: 'Acme (Pty) Ltd', metadataComplete: true }, 'companyName').state).toBe('confirmed');
  });

  it('alternatives without a single value still surface as needs_review', () => {
    const f = resolveField({ reviewCandidates: { vatNumber: { candidates: [{ value: '4000000001' }, { value: '4000000002' }] } } }, 'vatNumber');
    expect(f.state).toBe('needs_review');
    expect(f.candidate?.ambiguous).toBe(true);
  });
});

describe('formatting and counting', () => {
  it('formats each kind of value', () => {
    expect(formatFieldValue('bbbeeLevel', 3)).toBe('Level 3');
    expect(formatFieldValue('blackOwnership', 51)).toMatch(/51/);
    expect(formatFieldValue('expiryDate', '2027-03-31')).toMatch(/2027/);
    expect(formatFieldValue('sectorCode', 'ICT', { sectorName: 'Information & Communications Technology' })).toBe('ICT - Information & Communications Technology');
    expect(formatFieldValue('vatNumber', '')).toBe('');
  });

  it('counts only the fields waiting on a person', () => {
    const cert = {
      vatNumber: '4012345678',
      reviewCandidates: { bbbeeLevel: { value: 2 }, expiryDate: { value: '2027-01-01' } },
    };
    expect(countNeedsReview(cert)).toBe(2);
    expect(resolveAllFields(cert)).toHaveLength(9);
  });
});

describe('applyFieldStatuses - updating the row after a resolution', () => {
  it('writes confirmed values back, clears the held candidate and leaves the rest alone', () => {
    const cert = { companyName: 'X', vatNumber: null as string | null, bbbeeLevel: null as number | null, reviewCandidates: { bbbeeLevel: { value: 2 } } as Record<string, { value: unknown }> };
    const next = applyFieldStatuses(cert as never, {
      bbbeeLevel: status({ field: 'bbbeeLevel', status: 'confirmed', value: 2, source: 'manual' }),
      vatNumber: status({ status: 'missing' }),
    }, { reviewCandidates: {}, reviewFields: [], enrichmentStatus: 'completed' }) as any;
    expect(next.bbbeeLevel).toBe(2);
    expect(next.bbbeeLevelStatus).toBe('Level 2');
    expect(next.vatNumber).toBeNull();           // a missing field is not overwritten with anything
    expect(next.reviewCandidates).toEqual({});
    expect(next.enrichmentStatus).toBe('completed');
    expect(resolveField(next, 'bbbeeLevel').state).toBe('confirmed');
  });
});
