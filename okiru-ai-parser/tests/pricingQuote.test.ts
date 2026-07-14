import { describe, expect, it } from 'vitest';
import { quoteUploadedFiles } from '../src/services/pricingQuote.js';
import type { UploadedFileLike } from '../src/services/fileExtraction.js';

function upload(
  originalname: string,
  mimetype: string,
  content: string | Buffer,
): UploadedFileLike {
  const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  return {
    originalname,
    mimetype,
    buffer,
    size: buffer.length,
  };
}

describe('parser pricing quote phase 1', () => {
  it('quotes standard text documents from structure only', async () => {
    const quote = await quoteUploadedFiles([
      upload('valid-bbee-certificate.txt', 'text/plain', 'B-BBEE certificate\nSupplier: Example Pty Ltd\nLevel 2'),
    ]);

    expect(quote.status).toBe('quoted');
    expect(quote.paymentStatus).toBe('not_started');
    expect(quote.nextAction).toBe('proceed_to_payment');
    expect(quote.files).toHaveLength(1);
    expect(quote.files[0]).toMatchObject({
      detectedDocumentType: 'B-BBEE certificate',
      processingEffort: 'standard',
      structure: {
        format: 'text',
        pages: 1,
        sheets: null,
        rows: null,
        estimatedUnits: 1,
      },
    });
    expect(quote.subtotalCents).toBe(250);
    expect(quote.notes.join(' ')).toContain('No OCR, LLM, vision processing');
  });

  it('quotes image uploads as high effort without OCR', async () => {
    const quote = await quoteUploadedFiles([
      upload('scanned-certificate.png', 'image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47])),
    ]);

    expect(quote.files[0].processingEffort).toBe('high');
    expect(quote.files[0].structure).toMatchObject({
      format: 'image',
      pages: 1,
      estimatedUnits: 2,
    });
    expect(quote.files[0].pricing.subtotalCents).toBe(1000);
    expect(quote.files[0].reasons[0]).toContain('OCR/vision processing later');
  });

  it('counts CSV rows and processing units before parser resolution', async () => {
    const csv = ['supplier,spend', 'A,100', 'B,200', 'C,300'].join('\n');
    const quote = await quoteUploadedFiles([
      upload('supplier-spend-schedule.csv', 'text/csv', csv),
    ]);

    expect(quote.files[0]).toMatchObject({
      detectedDocumentType: 'Supplier evidence / schedule',
      processingEffort: 'standard',
      structure: {
        format: 'csv',
        sheets: 1,
        rows: 3,
        estimatedUnits: 1,
      },
    });
  });
});
