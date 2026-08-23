/**
 * The model classifies a label; the code still decides what it scores.
 *
 * Contribution types used to be matched by substring, so only wording somebody
 * had anticipated was ever placed, and everything else fell through to a default
 * recognised at 100%. Making that default abstain stopped the inflation but left
 * the parser no smarter: a real "Bursary" scored nothing, because nobody had
 * written `includes("bursary")`.
 *
 * Handing the leftovers to the model closes that gap — but only if the model
 * cannot widen the vocabulary, invent a term, or turn an uncertain answer into a
 * scoring one. Those are the properties pinned here.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { mapLabelsToVocabulary } from '../../src/services/semanticVocabulary.js';
import { resetDecisionCacheForTest } from '../../src/services/semanticDecisionCache.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';

const VOCAB = ['grant', 'standard_loan', 'guarantees'];

function modelReturning(reply: string, spy?: { calls: number }): ExtractionModel {
  return {
    name: 'test-model',
    async complete() {
      if (spy) spy.calls += 1;
      return reply;
    },
  };
}

beforeEach(() => {
  resetDecisionCacheForTest();
});

describe('mapLabelsToVocabulary', () => {
  it('places a label whose meaning matches, not just its spelling', async () => {
    const model = modelReturning(JSON.stringify({ Bursary: 'grant' }));
    const out = await mapLabelsToVocabulary(model, {
      vocabulary: VOCAB, labels: ['Bursary'], what: 'a contribution type', kind: 'test',
    });
    expect(out.resolved).toEqual({ Bursary: 'grant' });
    expect(out.unresolved).toEqual([]);
  });

  it('refuses a term that is not in the vocabulary', async () => {
    // A term the model invented is a hallucination with a score attached.
    const model = modelReturning(JSON.stringify({ Sponsorship: 'marketing_spend' }));
    const out = await mapLabelsToVocabulary(model, {
      vocabulary: VOCAB, labels: ['Sponsorship'], what: 'a contribution type', kind: 'test',
    });
    expect(out.resolved).toEqual({});
    expect(out.unresolved).toEqual(['Sponsorship']);
  });

  it('treats an explicit null as "could not place", not as a failure', async () => {
    const model = modelReturning(JSON.stringify({ 'Payment holiday': null }));
    const out = await mapLabelsToVocabulary(model, {
      vocabulary: VOCAB, labels: ['Payment holiday'], what: 'a contribution type', kind: 'test',
    });
    expect(out.unresolved).toEqual(['Payment holiday']);
  });

  it('leaves labels the model omitted unresolved rather than guessing', async () => {
    const model = modelReturning(JSON.stringify({ Bursary: 'grant' }));
    const out = await mapLabelsToVocabulary(model, {
      vocabulary: VOCAB, labels: ['Bursary', 'Mystery line'], what: 'a contribution type', kind: 'test',
    });
    expect(out.resolved).toEqual({ Bursary: 'grant' });
    expect(out.unresolved).toEqual(['Mystery line']);
  });

  it('recovers JSON wrapped in prose or code fences', async () => {
    const model = modelReturning('```json\n{"Bursary":"grant"}\n```');
    const out = await mapLabelsToVocabulary(model, {
      vocabulary: VOCAB, labels: ['Bursary'], what: 'a contribution type', kind: 'test',
    });
    expect(out.resolved).toEqual({ Bursary: 'grant' });
  });

  it('resolves nothing when no model is configured', async () => {
    const out = await mapLabelsToVocabulary(null, {
      vocabulary: VOCAB, labels: ['Bursary'], what: 'a contribution type', kind: 'test',
    });
    expect(out.resolved).toEqual({});
    expect(out.unresolved).toEqual(['Bursary']);
  });

  it('does not call the model when there is nothing to classify', async () => {
    const spy = { calls: 0 };
    const model = modelReturning('{}', spy);
    const out = await mapLabelsToVocabulary(model, {
      vocabulary: VOCAB, labels: [], what: 'a contribution type', kind: 'test',
    });
    expect(spy.calls).toBe(0);
    expect(out.resolved).toEqual({});
  });

  it('leaves everything unresolved when the reply is not JSON', async () => {
    const model = modelReturning('I think the bursary is probably a grant.');
    const out = await mapLabelsToVocabulary(model, {
      vocabulary: VOCAB, labels: ['Bursary'], what: 'a contribution type', kind: 'test',
    });
    expect(out.resolved).toEqual({});
    expect(out.unresolved).toEqual(['Bursary']);
  });

  it('surfaces a transient model failure as "unresolved", never as a crash', async () => {
    const model: ExtractionModel = {
      name: 'failing',
      complete: vi.fn().mockRejectedValue(new Error('429 rate limited')),
    };
    const out = await mapLabelsToVocabulary(model, {
      vocabulary: VOCAB, labels: ['Bursary'], what: 'a contribution type', kind: 'test',
    });
    expect(out.resolved).toEqual({});
    expect(out.unresolved).toContain('Bursary');
  });

  it('asks once for the same question, then replays the answer', async () => {
    const spy = { calls: 0 };
    const model = modelReturning(JSON.stringify({ Bursary: 'grant' }), spy);
    const args = {
      vocabulary: VOCAB, labels: ['Bursary'], what: 'a contribution type', kind: 'test',
    };
    const first = await mapLabelsToVocabulary(model, args);
    const second = await mapLabelsToVocabulary(model, args);
    expect(first.resolved).toEqual(second.resolved);
    // Determinism is the point: the same evidence may not resolve two ways.
    expect(spy.calls).toBe(1);
  });
});
