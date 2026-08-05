/**
 * Pass A — model classification.
 *
 * The router used to be BM25 token-matching, which called an AFS "supplier
 * spend" because it contained the words "procurement spend". This asks the model
 * what the document IS, and hands the caller a routing element only when the
 * model is confident — otherwise null, and BM25 stands. These tests pin the
 * fail-safe behaviour (the property that makes the change safe to ship): it can
 * only ever ADD precision, never route worse than before.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import {
  classifyDocument,
  routingElement,
  resetClassificationCacheForTest,
  CONFIDENCE_FLOOR,
} from '../../src/services/documentClassification.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';

function model(reply: unknown, onCall?: () => void): ExtractionModel {
  return {
    name: 'fake',
    complete: async () => {
      onCall?.();
      return typeof reply === 'string' ? reply : JSON.stringify(reply);
    },
  };
}

const afs = {
  filename: 'Annual Financial Statements Extract.pdf',
  raw_text: 'Statement of Comprehensive Income\nRevenue 24 000 000\nNet Profit After Tax 1 850 000\nProcurement spend 15 400 000',
};

beforeEach(() => resetClassificationCacheForTest());

describe('classifyDocument', () => {
  it('classifies a financial statement as FINANCIALS despite "procurement spend" text', async () => {
    const cls = await classifyDocument(
      model({ element: 'FINANCIALS', document_type: 'AFS extract', confidence: 0.92 }),
      afs,
    );
    expect(cls).not.toBeNull();
    expect(cls!.element).toBe('FINANCIALS');
    // FINANCIALS is not a spec-routing element — it triggers the financials
    // reader, so the routing element is null (BM25 handles any stray specs).
    expect(routingElement(cls)).toBeNull();
  });

  it('routes an ownership document to the OWNERSHIP specs when confident', async () => {
    const cls = await classifyDocument(
      model({ element: 'OWNERSHIP', document_type: 'Share register', confidence: 0.9 }),
      { filename: 'scan001.pdf', raw_text: 'Securities Register\nHolder\nShares\nThabo 600' },
    );
    expect(routingElement(cls)).toBe('OWNERSHIP');
  });

  it('normalises element spelling variants (hyphen / space / lowercase)', async () => {
    const cls = await classifyDocument(
      model({ element: 'management-control', document_type: 'EE report', confidence: 0.8 }),
      { filename: 'x.pdf', raw_text: 'Employment Equity EEA2 occupational levels directors' },
    );
    expect(cls!.element).toBe('MANAGEMENT_CONTROL');
    expect(routingElement(cls)).toBe('MANAGEMENT_CONTROL');
  });

  it('below the confidence floor it does NOT override BM25 (returns null routing)', async () => {
    const cls = await classifyDocument(
      model({ element: 'ESD', document_type: 'maybe suppliers', confidence: CONFIDENCE_FLOOR - 0.1 }),
      { filename: 'ambiguous.pdf', raw_text: 'a mixed workbook with everything in it at once' },
    );
    expect(cls!.element).toBe('ESD');
    expect(routingElement(cls)).toBeNull();
  });

  it('a model failure is non-fatal — returns null so the caller falls back', async () => {
    const failing: ExtractionModel = {
      name: 'fake',
      complete: async () => { throw new Error('rate limited'); },
    };
    expect(await classifyDocument(failing, afs)).toBeNull();
  });

  it('an unusable reply (no element) returns null', async () => {
    expect(await classifyDocument(model({ confidence: 0.9 }), afs)).toBeNull();
    expect(await classifyDocument(model('not json at all'), afs)).toBeNull();
  });

  it('caches by content — a re-uploaded document is classified once', async () => {
    let calls = 0;
    const m = model({ element: 'SED', document_type: 'CSI', confidence: 0.9 }, () => { calls += 1; });
    await classifyDocument(m, afs);
    await classifyDocument(m, afs);
    expect(calls).toBe(1);
  });
});
