import { describe, expect, it } from 'vitest';
import { quoteUploadedFiles } from '../../src/services/pricingQuote.js';
import type { UploadedFileLike } from '../../src/services/fileExtraction.js';

function file(overrides: Partial<UploadedFileLike>): UploadedFileLike {
  return {
    originalname: 'sample.txt',
    mimetype: 'text/plain',
    size: 12,
    buffer: Buffer.from('hello world'),
    ...overrides,
  };
}

describe('pricing quote', () => {
  it('quotes lightweight files without running extraction output', async () => {
    const quote = await quoteUploadedFiles([
      file({
        originalname: 'certificate.txt',
        mimetype: 'text/plain',
        size: 128,
        buffer: Buffer.from('B-BBEE certificate'),
      }),
    ]);

    expect(quote.quoteId).toMatch(/^quote_/);
    expect(quote.currency).toBe('ZAR');
    expect(quote.paymentStatus).toBe('not_started');
    expect(quote.totalProcessingUnits).toBe(1);
    expect(quote.subtotalCents).toBeGreaterThan(0);
    expect(quote.files[0]).toMatchObject({
      filename: 'certificate.txt',
      detectedDocumentType: 'B-BBEE certificate',
      processingEffort: 'standard',
      structure: {
        format: 'text',
        pages: 1,
        estimatedUnits: 1,
      },
    });
  });

  it('counts CSV row bands as processing units', async () => {
    const rows = ['name,value', ...Array.from({ length: 1001 }, (_, index) => `row ${index},${index}`)];
    const quote = await quoteUploadedFiles([
      file({
        originalname: 'supplier-spend.csv',
        mimetype: 'text/csv',
        size: rows.join('\n').length,
        buffer: Buffer.from(rows.join('\n')),
      }),
    ]);

    expect(quote.files[0].structure.format).toBe('csv');
    expect(quote.files[0].structure.rows).toBe(1001);
    expect(quote.files[0].structure.estimatedUnits).toBe(3);
    expect(quote.totalProcessingUnits).toBe(3);
    expect(quote.subtotalCents).toBe(quote.files[0].pricing.subtotalCents);
  });
});
