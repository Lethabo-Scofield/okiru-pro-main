/**
 * Extraction caching.
 *
 * Multi-pass extraction (chunk, sweep, ground, checksum) is the right amount of
 * work to do ONCE and the wrong amount to repeat — and it is repeated constantly:
 * a user adds one document to a pack, a requote re-submits documents already
 * paid for, a retry re-reads everything that already succeeded.
 *
 * The rules that matter: a changed document or a changed PROMPT must miss, a
 * failure must never be cached, and provenance must name the file the user
 * actually uploaded.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractWithSpec } from '../../src/services/aiExtraction.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';
import { extractionCacheKey, resetExtractionCache } from '../../src/services/extractionCache.js';
import { VERIFICATION_DOCUMENT_MATRIX } from '../../schemas/verification_document_matrix.js';

const SPEC = VERIFICATION_DOCUMENT_MATRIX.find((d) => d.expectedFields.length >= 2)!;
const FIELD = SPEC.expectedFields[0];

function countingModel(reply: Record<string, unknown>) {
  const complete = vi.fn(async () => JSON.stringify(reply));
  return { model: { name: 'fake', complete } as ExtractionModel, complete };
}

beforeEach(() => resetExtractionCache());
afterEach(() => { resetExtractionCache(); delete process.env.AI_EXTRACTION_CACHE; });

describe('the cache key', () => {
  const base = {
    content: 'a document',
    documentId: 'doc',
    extractionPrompt: 'prompt',
    expectedFields: ['a', 'b'],
    model: 'gpt-4o',
  };

  it('is stable for identical inputs', () => {
    expect(extractionCacheKey(base)).toBe(extractionCacheKey(base));
  });

  it('changes when the document changes', () => {
    expect(extractionCacheKey({ ...base, content: 'different' })).not.toBe(extractionCacheKey(base));
  });

  it('changes when the PROMPT changes', () => {
    // Otherwise a corrected matrix prompt would appear to have no effect until
    // the cache expired — a silent, and very confusing, regression.
    expect(extractionCacheKey({ ...base, extractionPrompt: 'improved' })).not.toBe(extractionCacheKey(base));
  });

  it('changes when the expected fields change', () => {
    expect(extractionCacheKey({ ...base, expectedFields: ['a'] })).not.toBe(extractionCacheKey(base));
  });

  it('changes when the model changes', () => {
    expect(extractionCacheKey({ ...base, model: 'gpt-5' })).not.toBe(extractionCacheKey(base));
  });
});

describe('caching a document', () => {
  const doc = { filename: 'cert.pdf', raw_text: `Value: found here`, markdown: 'Value: found here' };

  it('does not call the model twice for the same document', async () => {
    const { model, complete } = countingModel({ [FIELD]: 'found here' });

    await extractWithSpec(model, SPEC, doc);
    const callsAfterFirst = complete.mock.calls.length;
    await extractWithSpec(model, SPEC, doc);

    expect(complete.mock.calls.length).toBe(callsAfterFirst);
    expect(callsAfterFirst).toBeGreaterThan(0);
  });

  it('returns the same values from the cache', async () => {
    const { model } = countingModel({ [FIELD]: 'found here' });

    const first = await extractWithSpec(model, SPEC, doc);
    const second = await extractWithSpec(model, SPEC, doc);

    expect(second.values.map((v) => v.value)).toEqual(first.values.map((v) => v.value));
  });

  it('re-reads a document whose content changed', async () => {
    const { model, complete } = countingModel({ [FIELD]: 'found here' });

    await extractWithSpec(model, SPEC, doc);
    const after = complete.mock.calls.length;
    await extractWithSpec(model, SPEC, { ...doc, raw_text: 'different', markdown: 'different' });

    expect(complete.mock.calls.length).toBeGreaterThan(after);
  });

  it('names the file the USER uploaded, not the one that filled the cache', async () => {
    // The same content often arrives twice under different names. Provenance
    // must point at the upload in front of the user.
    const { model } = countingModel({ [FIELD]: 'found here' });

    await extractWithSpec(model, SPEC, doc);
    const second = await extractWithSpec(model, SPEC, { ...doc, filename: 'renamed-copy.pdf' });

    expect(second.sourceFile).toBe('renamed-copy.pdf');
    expect(second.values.every((v) => v.sourceFile === 'renamed-copy.pdf')).toBe(true);
  });
});

describe('what must never be cached', () => {
  it('does not cache a failed extraction', async () => {
    // An upstream 500 must not become a permanent "this document has no data".
    const failing: ExtractionModel = {
      name: 'fake',
      complete: vi.fn(async () => { throw new Error('upstream 500'); }),
    };
    const doc = { filename: 'x.pdf', raw_text: 'text', markdown: 'text' };

    const first = await extractWithSpec(failing, SPEC, doc);
    expect(first.error).toBeTruthy();

    // A working model afterwards must actually be called.
    const { model, complete } = countingModel({ [FIELD]: 'text' });
    await extractWithSpec(model, SPEC, doc);
    expect(complete.mock.calls.length).toBeGreaterThan(0);
  });
});

describe('the kill switch', () => {
  it('calls the model every time when caching is disabled', async () => {
    process.env.AI_EXTRACTION_CACHE = 'false';
    const { model, complete } = countingModel({ [FIELD]: 'found here' });
    const doc = { filename: 'c.pdf', raw_text: 'found here', markdown: 'found here' };

    await extractWithSpec(model, SPEC, doc);
    const after = complete.mock.calls.length;
    await extractWithSpec(model, SPEC, doc);

    expect(complete.mock.calls.length).toBeGreaterThan(after);
  });
});
