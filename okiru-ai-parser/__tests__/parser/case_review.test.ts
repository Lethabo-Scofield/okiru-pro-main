/**
 * The analyst's read of the whole case — chain-of-thought where it is
 * affordable and useful: ONE call per case, over the assembled evidence.
 *
 * The properties that make it safe to have opinions:
 *   - advisory only — findings are prose; the payload cannot move;
 *   - strongest tier first (completeReview → completeHard → complete);
 *   - cached by the evidence it saw, so a case reviews the same way twice;
 *   - every failure is an empty list, never a broken case.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { caseReviewEnabled, reviewCase, summariseCase } from '../../src/services/caseReview.js';
import { resetDecisionCacheForTest } from '../../src/services/semanticDecisionCache.js';
import type { ExtractionModel } from '../../src/services/aiExtraction.js';

const CASE = {
  payloadEntries: [
    { key: 'procurement.tmps', value: 23, sourceFiles: ['Pack.xlsx › Finance'] },
    { key: 'entity.npat', value: 647411, sourceFiles: ['AFS.pdf'] },
  ],
  unmapped: [{ field: 'mystery_total', reason: 'no_mapping' }],
  needsReview: [{ field: 'entity_name', values: ['Thandanani CC', 'Thandanani Pty'] }],
  unfilledKeys: ['skills.total_spend'],
  files: ['Pack.xlsx › Finance', 'AFS.pdf'],
};

const REPLY = JSON.stringify({
  findings: [
    { severity: 'error', finding: 'procurement.tmps of R23 cannot contain the supplier schedule', fix: 'Enter the real TMPS' },
    { severity: 'warning', finding: 'entity name is contested between two documents', fix: 'Pick the registered name' },
  ],
});

function modelSaying(reply: string, spy?: { review: number; hard: number; plain: number }): ExtractionModel {
  return {
    name: 'test',
    async complete() { if (spy) spy.plain += 1; return reply; },
    async completeHard() { if (spy) spy.hard += 1; return reply; },
    async completeReview() { if (spy) spy.review += 1; return reply; },
  };
}

beforeEach(() => {
  resetDecisionCacheForTest();
  delete process.env.PARSER_CASE_REVIEW;
});

describe('reviewCase', () => {
  it('returns structured findings from the strongest tier', async () => {
    const spy = { review: 0, hard: 0, plain: 0 };
    const findings = await reviewCase(modelSaying(REPLY, spy), CASE);
    expect(findings).toHaveLength(2);
    expect(findings[0].severity).toBe('error');
    expect(findings[0].finding).toContain('R23');
    // Chain-of-thought goes where it is affordable: the review tier, not the
    // transcription tier.
    expect(spy).toEqual({ review: 1, hard: 0, plain: 0 });
  });

  it('falls back through the tiers when the deployment has fewer', async () => {
    const spy = { plain: 0 };
    const model: ExtractionModel = {
      name: 'plain-only',
      async complete() { spy.plain += 1; return REPLY; },
    };
    const findings = await reviewCase(model, CASE);
    expect(findings).toHaveLength(2);
    expect(spy.plain).toBe(1);
  });

  it('reviews the same evidence once, then replays', async () => {
    const spy = { review: 0, hard: 0, plain: 0 };
    const model = modelSaying(REPLY, spy);
    const first = await reviewCase(model, CASE);
    const second = await reviewCase(model, CASE);
    expect(first).toEqual(second);
    expect(spy.review).toBe(1);
  });

  it('treats a clean case as a good answer, not a failure', async () => {
    const findings = await reviewCase(modelSaying('{"findings": []}'), CASE);
    expect(findings).toEqual([]);
  });

  it('drops findings with no substance and caps the list', async () => {
    const noisy = JSON.stringify({
      findings: Array.from({ length: 20 }, (_, i) => ({ severity: 'warning', finding: i < 12 ? `finding ${i}` : '', fix: '' })),
    });
    const findings = await reviewCase(modelSaying(noisy), CASE);
    expect(findings.length).toBeLessThanOrEqual(8);
    expect(findings.every((f) => f.finding.length > 0)).toBe(true);
  });

  it('survives prose instead of JSON — empty, never broken', async () => {
    expect(await reviewCase(modelSaying('I think everything is basically fine here.'), CASE)).toEqual([]);
  });

  it('survives a model failure', async () => {
    const failing: ExtractionModel = { name: 'f', complete: vi.fn().mockRejectedValue(new Error('429')) };
    expect(await reviewCase(failing, CASE)).toEqual([]);
  });

  it('does nothing with no model, no payload, or the switch off', async () => {
    expect(await reviewCase(null, CASE)).toEqual([]);
    expect(await reviewCase(modelSaying(REPLY), { ...CASE, payloadEntries: [] })).toEqual([]);
    process.env.PARSER_CASE_REVIEW = 'false';
    expect(caseReviewEnabled()).toBe(false);
    expect(await reviewCase(modelSaying(REPLY), CASE)).toEqual([]);
  });
});

describe('summariseCase', () => {
  it('gives the analyst the figures, the sources, and the known gaps', () => {
    const s = summariseCase(CASE);
    expect(s).toContain('procurement.tmps = 23');
    expect(s).toContain('Pack.xlsx › Finance');
    expect(s).toContain('Thandanani CC');
    expect(s).toContain('mystery_total');
    expect(s).toContain('skills.total_spend');
  });

  it('renders register rows by size, not by dumping them', () => {
    const s = summariseCase({
      ...CASE,
      payloadEntries: [{ key: 'ownership.shareholder_rows', value: [{}, {}, {}], sourceFiles: ['x'] }],
    });
    expect(s).toContain('[3 rows]');
  });
});
