/**
 * A paid run's outcome, per quoted document — what a refund is decided on.
 * Until this was recorded, a run that threw or came back empty kept its tokens
 * and looked no different from a good one.
 *
 * The attribution is the money part: values are joined to the quoted document
 * by CONTENT, because names are the client's to choose and to swap.
 */
import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import {
  quotedNameByUpload,
  recordExtractionOutcome,
  valuesByQuotedFile,
  watchClient,
} from '../../src/services/extractionOutcome.js';
import { claimQuoteForRun, digestFile, getQuoteStore, type QuoteRecord } from '../../src/services/quoteStore.js';

const file = (originalname: string, content: string) => ({ originalname, buffer: Buffer.from(content) });

/** A quote over these files, priced and digested in the order given. */
function quoteOver(files: Array<{ originalname: string; buffer: Buffer }>): Pick<QuoteRecord, 'fileDigests' | 'quote'> {
  return {
    fileDigests: files.map(digestFile),
    quote: { files: files.map((f) => ({ filename: f.originalname })) } as never,
  };
}

describe('valuesByQuotedFile', () => {
  const diesel = file('DIESEL LOG - Mar 2026.xlsx', 'workbook bytes');
  const bill = file('city-power-oct.pdf', 'bill bytes');
  const blank = file('blank-scan.pdf', 'blank bytes');
  const record = quoteOver([diesel, bill, blank]);

  it("counts a workbook's sheets towards the workbook, and a document that gave nothing as 0", () => {
    const result = valuesByQuotedFile([diesel, bill, blank], record, [
      { sourceFile: 'DIESEL LOG - Mar 2026.xlsx › ZZZ10001', values: [1, 2, 3] },
      { sourceFile: 'DIESEL LOG - Mar 2026.xlsx › Summary', values: [1] },
      { sourceFile: 'city-power-oct.pdf', values: [1, 2] },
    ]);
    expect(result).toEqual({
      valuesByFile: { 'DIESEL LOG - Mar 2026.xlsx': 4, 'city-power-oct.pdf': 2, 'blank-scan.pdf': 0 },
      attributed: true,
      totalValues: 6,
    });
  });

  it('follows the bytes, not the names: swapping two names between quote and run moves nothing', () => {
    // Quoted as expensive.pdf (big bytes) + cheap.pdf (small bytes); run with the names swapped.
    const expensive = file('expensive.pdf', 'the expensive document');
    const cheap = file('cheap.pdf', 'the cheap one');
    const quoted = quoteOver([expensive, cheap]);
    const swapped = [file('cheap.pdf', 'the expensive document'), file('expensive.pdf', 'the cheap one')];
    const result = valuesByQuotedFile(swapped, quoted, [
      // The run names extractions after the uploads it was given.
      { sourceFile: 'cheap.pdf', values: new Array(12).fill(0) },
      { sourceFile: 'expensive.pdf', values: [] },
    ]);
    // The 12 values came from the expensive bytes, so the expensive document is the one that delivered.
    expect(result.valuesByFile).toEqual({ 'expensive.pdf': 12, 'cheap.pdf': 0 });
    expect(result.attributed).toBe(true);
  });

  it('matches names exactly — a leading space or a " › " inside the name still resolves', () => {
    const spaced = file(' fuel-report.pdf', 'fuel');
    const arrowed = file('Fleet › 2026.xlsx', 'fleet');
    const result = valuesByQuotedFile([spaced, arrowed], quoteOver([spaced, arrowed]), [
      { sourceFile: ' fuel-report.pdf', values: [1, 2, 3, 4, 5] },
      { sourceFile: 'Fleet › 2026.xlsx › Depot A', values: [1] },
    ]);
    expect(result.valuesByFile).toEqual({ ' fuel-report.pdf': 5, 'Fleet › 2026.xlsx': 1 });
    expect(result.attributed).toBe(true);
  });

  it('marks the record unattributed when a value comes from a source no upload accounts for', () => {
    const result = valuesByQuotedFile([diesel, bill, blank], record, [
      { sourceFile: 'someone-else.pdf', values: [1] },
      { sourceFile: 'city-power-oct.pdf', values: [1] },
    ]);
    expect(result.attributed).toBe(false);
    expect(result.totalValues).toBe(2);
  });

  it('will not attribute when two uploads share a name, or the quote has no digests', () => {
    const twins = [file('scan.pdf', 'one'), file('scan.pdf', 'two')];
    expect(quotedNameByUpload(twins, quoteOver(twins))).toBeNull();
    expect(valuesByQuotedFile(twins, quoteOver(twins), []).attributed).toBe(false);

    const undigested = { quote: record.quote } as Pick<QuoteRecord, 'fileDigests' | 'quote'>;
    expect(quotedNameByUpload([diesel, bill, blank], undigested)).toBeNull();
  });

  it('will not attribute an upload the quote does not cover', () => {
    expect(quotedNameByUpload([diesel, file('city-power-oct.pdf', 'different bytes'), blank], record)).toBeNull();
  });

  it('survives no quote (payment off) and no extractions at all', () => {
    expect(valuesByQuotedFile([diesel], undefined, null)).toEqual({ valuesByFile: {}, attributed: false, totalValues: 0 });
  });
});

describe('watchClient', () => {
  it('notices a client that left before the response was finished', () => {
    const res = Object.assign(new EventEmitter(), { writableEnded: false });
    const stillThere = watchClient(res);
    expect(stillThere()).toBe(true);
    res.emit('close');
    expect(stillThere()).toBe(false);
  });

  it('does not mistake a finished response closing for a client that left', () => {
    const res = Object.assign(new EventEmitter(), { writableEnded: false });
    const stillThere = watchClient(res);
    res.writableEnded = true;
    res.emit('close');
    expect(stillThere()).toBe(true);
  });
});

async function paidQuote(over: Partial<QuoteRecord> = {}) {
  const quoteId = `quote_outcome_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await getQuoteStore().put({
    quoteId,
    fingerprint: 'f',
    currency: 'ZAR',
    totalCents: 200,
    paymentStatus: 'paid',
    createdAt: Date.now(),
    expiresAt: Date.now() + 3_600_000,
    quote: { files: [] } as never,
    ...over,
  });
  return quoteId;
}

describe('claimQuoteForRun', () => {
  it('gives a quote to exactly one run', async () => {
    const quoteId = await paidQuote();
    const [first, second] = await Promise.all([claimQuoteForRun(quoteId), claimQuoteForRun(quoteId)]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    const loser = first.ok ? second : first;
    expect(loser).toMatchObject({ ok: false, status: 409, code: 'QUOTE_ALREADY_USED' });
  });

  it('refuses a voided quote, and a void refuses a claimed one', async () => {
    const voided = await paidQuote({ voidedAt: Date.now() });
    expect(await claimQuoteForRun(voided)).toMatchObject({ ok: false, code: 'QUOTE_VOIDED' });

    const claimed = await paidQuote();
    expect((await claimQuoteForRun(claimed, { recordsOutcome: true })).ok).toBe(true);
    const voidAttempt = await getQuoteStore().updateIf(claimed, { voidedAt: Date.now() }, (r) => !r.consumedAt);
    expect(voidAttempt.applied).toBe(false);
    expect((await getQuoteStore().get(claimed))?.voidedAt).toBeUndefined();
    expect((await getQuoteStore().get(claimed))?.recordsOutcome).toBe(true);
  });
});

describe('recordExtractionOutcome', () => {
  it('writes the outcome onto the paid quote', async () => {
    const quoteId = await paidQuote();
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
