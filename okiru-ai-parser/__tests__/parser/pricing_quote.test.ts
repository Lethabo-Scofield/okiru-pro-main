/**
 * The quote (flow step 5).
 *
 * The invariants that matter are safety + honesty, inherited from the original
 * phase-1 tests:
 *   - a quote is produced from STRUCTURE ONLY — no OCR, no Azure, no extraction
 *   - an image is priced as high effort WITHOUT being OCR-ed
 *   - CSV/spreadsheet rows are counted (size drives the price)
 *   - documents are classified for display
 *
 * What changed: the price is no longer arbitrary "processing units" — it is
 * derived from predicted Azure tokens (tokenPrediction.ts), with three line
 * items (extraction / normalisation / entity mapping).
 */
import { describe, expect, it } from 'vitest';
import { quoteUploadedFiles } from '../../src/services/pricingQuote.js';
import type { UploadedFileLike } from '../../src/services/fileExtraction.js';

function upload(originalname: string, mimetype: string, content: string | Buffer): UploadedFileLike {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  return { originalname, mimetype, buffer, size: buffer.length };
}

describe('pricing quote — shape & guarantees', () => {
  it('quotes a digital document from structure only, with exact tokens', async () => {
    const quote = await quoteUploadedFiles([
      upload('valid-bbee-certificate.txt', 'text/plain', 'B-BBEE certificate\nSupplier: Example Pty Ltd\nLevel 2'),
    ]);

    expect(quote.quoteId).toMatch(/^quote_/);
    expect(quote.status).toBe('quoted');
    expect(quote.currency).toBe('ZAR');
    expect(quote.paymentStatus).toBe('not_started');
    expect(quote.nextAction).toBe('proceed_to_payment');
    expect(quote.model).toBeTruthy();

    expect(quote.files).toHaveLength(1);
    expect(quote.files[0]).toMatchObject({
      filename: 'valid-bbee-certificate.txt',
      detectedDocumentType: 'B-BBEE certificate',
      processingEffort: 'standard',
      requiresOcr: false,
      kind: 'text',
    });
    // Exact basis => no band, and a real token count.
    expect(quote.files[0].tokens.basis).toBe('exact-text');
    expect(quote.files[0].tokens.band).toBeNull();
    expect(quote.files[0].tokens.input).toBeGreaterThan(0);

    // The quote must state plainly that nothing was spent to produce it.
    expect(quote.notes.join(' ')).toMatch(/No Azure call, OCR, vision, extraction or scoring/i);
  });

  it('the extraction price IS the predicted Azure cost — nothing invented on top', async () => {
    const quote = await quoteUploadedFiles([
      upload('certificate.txt', 'text/plain', 'B-BBEE certificate for Acme, Level 2, 51% black ownership'),
      upload('scan.png', 'image/png', Buffer.from([0x89, 0x50])),
    ]);

    // The whole job is priced as one line at Azure's cost. Normalisation and
    // mapping carry no fee by default, so they fold in rather than appearing as
    // their own confusing "$0" lines.
    expect(quote.lineItems.find((li) => li.key === 'extraction')!.cents).toBeCloseTo(quote.totals.azureCents, 2);
    expect(quote.lineItems.some((li) => li.key === 'normalisation')).toBe(false);
    expect(quote.lineItems.some((li) => li.key === 'entity_mapping')).toBe(false);

    // The Azure figure is itemised so the price can be checked against the
    // model's own rate card: tokens + OCR pages, and it must reconcile.
    const b = quote.azureBreakdown;
    expect(b.model).toBeTruthy();
    expect(b.inputTokens).toBeGreaterThan(0);
    expect(b.ocrPages).toBe(1); // the scan
    expect(b.ocrCents).toBeGreaterThan(0);
    expect(quote.totals.azureCents).toBeCloseTo(b.inputCents + b.outputCents + b.ocrCents, 2);
    expect(quote.notes.join(' ')).toMatch(/predicted Azure cost/i);
  });

  it('applies the card minimum VISIBLY when the Azure cost is unchargeable', async () => {
    // Reading a couple of small documents costs Azure a fraction of a cent —
    // no card processor can settle that, so the floor must apply and be shown.
    const quote = await quoteUploadedFiles([
      upload('certificate.txt', 'text/plain', 'B-BBEE certificate for Acme, Level 2'),
    ]);

    expect(quote.totals.azureCents).toBeLessThan(200);
    const min = quote.lineItems.find((li) => li.key === 'minimum_charge');
    expect(min).toBeDefined();
    // The line item makes up exactly the shortfall — the Azure figure is never
    // inflated to reach the floor.
    expect(quote.totals.totalCents).toBe(200);
    expect(quote.lineItems.reduce((n, li) => n + li.cents, 0)).toBeCloseTo(200, 2);
    expect(min!.detail).toMatch(/can’t settle below/i);
    expect(quote.notes.join(' ')).toMatch(/minimum applies/i);
    // And the charge must be a whole, positive number of cents the processor can take.
    expect(Number.isInteger(Math.round(quote.totals.totalCents))).toBe(true);
    expect(Math.round(quote.totals.totalCents)).toBeGreaterThan(0);
  });

  it('prices the job as one processing line, and the lines sum to the total', async () => {
    const quote = await quoteUploadedFiles([
      upload('certificate.txt', 'text/plain', 'B-BBEE certificate for Acme, Level 2, 51% black ownership'),
    ]);

    // Processing leads; a minimum-charge line may follow. No separate zero lines.
    expect(quote.lineItems[0].key).toBe('extraction');
    const sum = quote.lineItems.reduce((n, li) => n + li.cents, 0);
    expect(quote.totals.totalCents).toBeCloseTo(sum, 2);
    expect(quote.totals.predictedInputTokens).toBeGreaterThan(0);
    // The processing line tracks the document (its token estimate).
    expect(quote.lineItems[0].detail).toMatch(/tokens/);
  });

  it('prices an image as high effort WITHOUT OCR-ing it, and bands the estimate', async () => {
    const quote = await quoteUploadedFiles([
      // Not a decodable image: if quoting tried to OCR, this would fail or hang.
      upload('scanned-certificate.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47])),
    ]);

    const f = quote.files[0];
    expect(f.processingEffort).toBe('high');
    expect(f.requiresOcr).toBe(true);
    expect(f.kind).toBe('image');
    expect(f.tokens.basis).toBe('estimated-scan');
    expect(f.tokens.band).not.toBeNull();
    expect(f.pricing.isUpperBound).toBe(true);
    expect(quote.totals.isUpperBound).toBe(true);
    expect(f.reasons.join(' ')).toMatch(/OCR/i);
    // The user must be told the scan number is a ceiling, not a guess.
    expect(quote.notes.join(' ')).toMatch(/upper bound|never charged more/i);
  });

  it('counts CSV rows and classifies the document — size drives the price', async () => {
    const csv = ['supplier,spend', 'A,100', 'B,200', 'C,300'].join('\n');
    const quote = await quoteUploadedFiles([upload('supplier-spend-schedule.csv', 'text/csv', csv)]);

    expect(quote.files[0]).toMatchObject({
      detectedDocumentType: 'Supplier evidence / schedule',
      processingEffort: 'standard',
      kind: 'csv',
    });
    expect(quote.files[0].structure).toMatchObject({ sheets: 1, rows: 3 });
  });

  // NOTE: these assert the AZURE cost, not the charged total. At realistic
  // document sizes the Azure cost is a fraction of a cent, so the card minimum
  // floors every small job to the same total — size only moves the amount once
  // the true cost clears the floor. The cost model must still be monotonic.
  it('a bigger schedule costs Azure more than a smaller one', async () => {
    const head = 'supplier,spend';
    const small = await quoteUploadedFiles([upload('s.csv', 'text/csv', [head, 'A,100'].join('\n'))]);
    const big = await quoteUploadedFiles([
      upload('b.csv', 'text/csv', [head, ...Array.from({ length: 400 }, (_, i) => `Supplier ${i},${i * 100}`)].join('\n')),
    ]);
    expect(big.files[0].structure.rows!).toBeGreaterThan(small.files[0].structure.rows!);
    expect(big.totals.azureCents).toBeGreaterThan(small.totals.azureCents);
  });

  it('a scan costs Azure more than a digital document', async () => {
    const digital = await quoteUploadedFiles([upload('a.txt', 'text/plain', 'Acme Level 2 certificate')]);
    const scan = await quoteUploadedFiles([upload('s.png', 'image/png', Buffer.from([0x89, 0x50]))]);
    expect(scan.totals.azureCents).toBeGreaterThan(digital.totals.azureCents);
  });

  it('rejects unsupported file types rather than quoting them', async () => {
    await expect(
      quoteUploadedFiles([upload('malware.exe', 'application/x-msdownload', 'MZ')]),
    ).rejects.toThrow(/Unsupported file type/);
  });
});
