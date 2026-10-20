/**
 * One metadata field in the Certificate Hub, rendered to markup (no DOM needed).
 *
 * The point: a field with a held candidate must read as "Needs review" with the
 * candidate on screen - never as a blank or as "Missing" - and each state offers
 * only the actions that make sense for it.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { FieldReviewRow } from '../FieldReviewRow';
import { resolveField, type FieldKey, type FieldStatusView } from '@/lib/certificateFieldState';

const status = (over: Partial<FieldStatusView>): FieldStatusView => ({
  field: 'bbbeeLevel', status: 'missing', value: null, confidence: null, source: null, candidate: null, missingReason: null, ...over,
});
const field = (key: FieldKey, s: FieldStatusView) => resolveField({ fieldStatus: { [key]: s } }, key);
const html = (f: ReturnType<typeof field>, props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(createElement(FieldReviewRow, { field: f, onResolve: vi.fn(), ...props }));

/** The text inside the element carrying `data-testid`. */
const textOf = (markup: string, testId: string): string | null => {
  const m = new RegExp(`data-testid="${testId}"[^>]*>(.*?)</(?:div|span)>`, 's').exec(markup);
  return m ? m[1].replace(/<[^>]+>/g, '').trim() : null;
};

const needsReview = field('bbbeeLevel', status({
  status: 'needs_review',
  candidate: { value: 2, confidence: 0.74, source: 'text', reason: 'Below automatic acceptance threshold', evidence: null, ambiguous: false, alternatives: [] },
}));

describe('FieldReviewRow - the three states', () => {
  it('Needs review: shows the candidate value, confidence and source - not "Missing"', () => {
    const markup = html(needsReview);
    expect(markup).toContain('data-state="needs_review"');
    expect(textOf(markup, 'state-bbbeeLevel')).toBe('Needs review');
    expect(textOf(markup, 'value-bbbeeLevel')).toBe('Level 2');
    expect(markup).not.toContain('>Missing<');
    expect(markup).toContain('74% confidence');
    expect(markup).toContain('from document text');
    expect(markup).toContain('Below automatic acceptance threshold');
  });

  it('Missing: says Missing, says why, and offers to add a value - but not confirm/reject', () => {
    const markup = html(field('vatNumber', status({ field: 'vatNumber', missingReason: 'not_found_in_text' })));
    expect(markup).toContain('data-state="missing"');
    expect(textOf(markup, 'state-vatNumber')).toBe('Missing');
    expect(textOf(markup, 'value-vatNumber')).toBe('Missing');
    expect(markup).toContain('this value was not found');
    expect(markup).toContain('Add value');
    expect(markup).not.toContain('data-testid="confirm-vatNumber"');
    expect(markup).not.toContain('data-testid="reject-vatNumber"');
  });

  it('Missing because the document could not be read says so', () => {
    expect(html(field('vatNumber', status({ field: 'vatNumber', missingReason: 'no_usable_text' })))).toContain('could not be read');
  });

  it('Confirmed: shows the trusted value, with only an Edit action', () => {
    const markup = html(field('vatNumber', status({ field: 'vatNumber', status: 'confirmed', value: '4012345678' })));
    expect(markup).toContain('data-state="confirmed"');
    expect(textOf(markup, 'state-vatNumber')).toBe('Confirmed');
    expect(textOf(markup, 'value-vatNumber')).toBe('4012345678');
    expect(markup).toContain('data-testid="edit-vatNumber"');
    expect(markup).not.toContain('data-testid="confirm-vatNumber"');
    expect(markup).not.toContain('data-testid="reject-vatNumber"');
  });

  it('notes when a person confirmed the value', () => {
    const markup = html(field('vatNumber', status({ field: 'vatNumber', status: 'confirmed', value: '4012345678', source: 'manual', confirmedBy: 'u1' })));
    expect(markup).toContain('Confirmed by a person');
  });
});

describe('FieldReviewRow - the three actions', () => {
  it('a candidate offers Confirm, Edit and Reject', () => {
    const markup = html(needsReview);
    for (const action of ['confirm', 'edit', 'reject']) expect(markup).toContain(`data-testid="${action}-bbbeeLevel"`);
  });

  it('shows no actions when the viewer cannot resolve', () => {
    const markup = html(needsReview, { canResolve: false });
    for (const action of ['confirm', 'edit', 'reject']) expect(markup).not.toContain(`data-testid="${action}-bbbeeLevel"`);
    expect(textOf(markup, 'value-bbbeeLevel')).toBe('Level 2'); // still readable
  });

  it('disables the actions while that field is saving', () => {
    const markup = html(needsReview, { busy: true });
    for (const action of ['confirm', 'edit', 'reject']) {
      expect(new RegExp(`<button[^>]*disabled[^>]*data-testid="${action}-bbbeeLevel"|<button[^>]*data-testid="${action}-bbbeeLevel"[^>]*disabled`).test(markup), action).toBe(true);
    }
  });
});

describe('FieldReviewRow - ambiguous candidates', () => {
  const ambiguous = field('vatNumber', status({
    field: 'vatNumber', status: 'needs_review',
    candidate: {
      value: '4000000001', confidence: 0.9, source: 'text', reason: 'multiple_vat_like_candidates', evidence: null, ambiguous: true,
      alternatives: [{ value: '4000000001', confidence: 0.9, snippet: 'VAT 4000000001' }, { value: '4000000002', confidence: 0.9, snippet: 'VAT No 4000000002' }],
    },
  }));

  it('lists every alternative as a choice and cannot be confirmed until one is picked', () => {
    const markup = html(ambiguous);
    expect(markup).toContain('data-testid="choices-vatNumber"');
    expect(markup).toContain('Several values were found');
    expect(markup).toContain('value="4000000001"');
    expect(markup).toContain('value="4000000002"');
    expect(markup).toContain('VAT No 4000000002');
    // nothing chosen yet -> Confirm is disabled
    expect(/<button[^>]*disabled[^>]*data-testid="confirm-vatNumber"|<button[^>]*data-testid="confirm-vatNumber"[^>]*disabled/.test(markup)).toBe(true);
  });
});
