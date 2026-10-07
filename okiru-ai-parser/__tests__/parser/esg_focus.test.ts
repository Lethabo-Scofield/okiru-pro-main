/**
 * C1 — the element batch a person filed an upload under reaches the reader,
 * as a hint: below a confident classification, never above it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/documentClassification.js', async (orig) => ({
  ...(await orig<typeof import('../../src/services/documentClassification.js')>()),
  classifyDocument: vi.fn(async () => null),
}));
vi.mock('../../src/services/aiExtraction.js', async (orig) => ({
  ...(await orig<typeof import('../../src/services/aiExtraction.js')>()),
  extractDocument: vi.fn(async () => []),
}));

import { classifyDocument } from '../../src/services/documentClassification.js';
import { extractDocument, type ExtractionModel } from '../../src/services/aiExtraction.js';
import { extractEsgCaseEntities } from '../../src/services/esgCaseExtraction.js';
import { focusForInput, parseEsgFocus } from '../../src/services/esgFocus.js';
import type { RawExtractionInput } from '../../schemas/parser_output.js';

const model = {} as ExtractionModel;
const fuelReport = {
  filename: 'Fuel March.pdf',
  markdown: 'Vehicle JR45DZGP — 412 litres',
  raw_text: 'Vehicle JR45DZGP — 412 litres',
} as unknown as RawExtractionInput;

const overrideSeen = () =>
  (vi.mocked(extractDocument).mock.calls[0]?.[2] as { elementOverride?: string } | undefined)?.elementOverride;

beforeEach(() => {
  vi.mocked(extractDocument).mockClear();
  vi.mocked(classifyDocument).mockReset();
  vi.mocked(classifyDocument).mockResolvedValue(null);
});

describe('parseEsgFocus', () => {
  it('keeps known elements and drops everything else, without throwing', () => {
    expect(parseEsgFocus(JSON.stringify({ 'a.pdf': 'FLEET', 'b.pdf': 'NOT_AN_ELEMENT', 'c.pdf': 4 }))).toEqual({ 'a.pdf': 'FLEET' });
    expect(parseEsgFocus('{not json')).toEqual({});
    expect(parseEsgFocus(JSON.stringify(['FLEET']))).toEqual({});
    expect(parseEsgFocus(undefined)).toEqual({});
  });

  it("gives a workbook's sheets the element its file was filed under", () => {
    expect(focusForInput('Fleet pack.xlsx › DATA', { 'Fleet pack.xlsx': 'FLEET' })).toBe('FLEET');
    expect(focusForInput('Other.pdf', { 'Fleet pack.xlsx': 'FLEET' })).toBeUndefined();
  });
});

describe('extractEsgCaseEntities with a focus', () => {
  it("reads a document the classifier cannot place as the element it was filed under", async () => {
    await extractEsgCaseEntities([fuelReport], model, undefined, { focusByFile: { 'Fuel March.pdf': 'FLEET' } });
    expect(overrideSeen()).toBe('FLEET');
  });

  it('lets a confident classification win over the filing', async () => {
    vi.mocked(classifyDocument).mockResolvedValue({ element: 'GHG_ENERGY', confidence: 0.99 } as never);
    await extractEsgCaseEntities([fuelReport], model, undefined, { focusByFile: { 'Fuel March.pdf': 'FLEET' } });
    expect(overrideSeen()).toBe('GHG_ENERGY');
  });

  it('changes nothing when no focus is given', async () => {
    await extractEsgCaseEntities([fuelReport], model);
    expect(overrideSeen()).toBeUndefined();
  });
});
