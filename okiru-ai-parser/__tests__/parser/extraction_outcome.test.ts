/**
 * A paid run's outcome, per file — what a refund is decided on. Until this was
 * recorded, a run that threw or came back empty kept its tokens and looked no
 * different from a good one.
 */
import { describe, expect, it } from 'vitest';
import { recordExtractionOutcome, valuesByUploadedFile } from '../../src/services/extractionOutcome.js';
import { getQuoteStore } from '../../src/services/quoteStore.js';

describe('valuesByUploadedFile', () => {
  const uploads = ['DIESEL REPORT - Mar 2026.xlsx', 'city-power-oct.pdf', 'blank-scan.pdf'];

  it('counts a workbook\'s sheets towards the workbook, and a file that gave nothing as 0', () => {
    const counts = valuesByUploadedFile(uploads, [
      { sourceFile: 'DIESEL REPORT - Mar 2026.xlsx › NPN70541', values: [1, 2, 3] },
      { sourceFile: 'DIESEL REPORT - Mar 2026.xlsx › Summary', values: [1] },
      { sourceFile: 'city-power-oct.pdf', values: [1, 2] },
    ]);
    expect(counts).toEqual({
      'DIESEL REPORT - Mar 2026.xlsx': 4,
      'city-power-oct.pdf': 2,
      'blank-scan.pdf': 0,
    });
  });

  it('ignores sources it cannot account for, and survives no extractions at all', () => {
    expect(valuesByUploadedFile(uploads, [{ sourceFile: 'someone-else.pdf', values: [1] }])).toEqual({
      'DIESEL REPORT - Mar 2026.xlsx': 0,
      'city-power-oct.pdf': 0,
      'blank-scan.pdf': 0,
    });
    expect(valuesByUploadedFile(['a.pdf'], null)).toEqual({ 'a.pdf': 0 });
  });
});

describe('recordExtractionOutcome', () => {
  it('writes the outcome onto the paid quote', async () => {
    const quoteId = `quote_outcome_${Date.now()}`;
    await getQuoteStore().put({
      quoteId,
      fingerprint: 'f',
      currency: 'ZAR',
      totalCents: 200,
      paymentStatus: 'paid',
      createdAt: Date.now(),
      expiresAt: Date.now() + 3_600_000,
      quote: { files: [] } as never,
    });
    await recordExtractionOutcome(quoteId, { status: 'failed', valuesByFile: { 'a.pdf': 0 } });
    const stored = await getQuoteStore().get(quoteId);
    expect(stored?.outcome?.status).toBe('failed');
    expect(stored?.outcome?.valuesByFile).toEqual({ 'a.pdf': 0 });
    expect(typeof stored?.outcome?.finishedAt).toBe('number');
  });

  it('does nothing without a paid quote, and never throws', async () => {
    await expect(recordExtractionOutcome(undefined, { status: 'error', valuesByFile: {} })).resolves.toBeUndefined();
    await expect(recordExtractionOutcome('no-such-quote', { status: 'error', valuesByFile: {} })).resolves.toBeUndefined();
  });
});
