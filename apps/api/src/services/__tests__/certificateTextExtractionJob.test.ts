import { beforeEach, describe, expect, it, vi } from 'vitest';

const updateOne = vi.fn();
const countDocuments = vi.fn();
const aggregate = vi.fn();
const downloadToBuffer = vi.fn();
const lean = vi.fn();
const limit = vi.fn(() => ({ lean }));
const sort = vi.fn(() => ({ limit }));
const find = vi.fn(() => ({ sort }));
const extractTextWithAzureDocumentIntelligenceOnly = vi.fn();
const isDocumentIntelligenceConfigured = vi.fn();
const getDocument = vi.fn();

vi.mock('child_process', () => ({
  execFileSync: vi.fn(() => Buffer.from('')),
  execSync: vi.fn(() => Buffer.from('')),
}));

vi.mock('tesseract.js', () => ({
  default: {
    recognize: vi.fn(async () => ({ data: { text: '' } })),
  },
}));

vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => ({
  getDocument,
}));

vi.mock('../../../models.js', () => ({
  CertificateMetadataModel: {
    aggregate,
    countDocuments,
    find,
    updateOne,
  },
}));

vi.mock('../azureCertStorage.js', () => ({
  getCertContainerClient: vi.fn(() => ({
    getBlobClient: vi.fn(() => ({
      downloadToBuffer,
    })),
  })),
}));

vi.mock('../documentIntelligence.js', () => ({
  extractTextWithAzureDocumentIntelligenceOnly,
  isDocumentIntelligenceConfigured,
}));

function mockCoverageAggregates() {
  countDocuments.mockImplementation(async (filter?: any) => {
    if (filter?.$or) return 3;
    if (Object.prototype.hasOwnProperty.call(filter?.extractedTextLength || {}, '$gte')) return 2;
    if (Object.prototype.hasOwnProperty.call(filter?.extractedTextLength || {}, '$gt')) return 1;
    return 5;
  });
  aggregate.mockImplementation(async (pipeline: any[]) => {
    const group = JSON.stringify(pipeline);
    if (group.includes('$extractionStatus')) {
      return [
        { _id: 'completed', count: 2 },
        { _id: 'text_too_short', count: 1 },
        { _id: 'failed', count: 1 },
        { _id: null, count: 1 },
      ];
    }
    if (group.includes('$extractionMode')) {
      return [
        { _id: 'pdf_text', count: 2 },
        { _id: 'failed', count: 1 },
        { _id: null, count: 1 },
        { _id: 'none', count: 2 },
      ];
    }
    if (group.includes('$avg')) return [{ _id: null, avg: 120 }];
    return [{ _id: 'OCR skipped: pdftoppm is not installed or not callable', count: 2 }];
  });
}

describe('certificate text extraction coverage/retry job', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lean.mockResolvedValue([
      {
        _id: 'doc-1',
        id: 'cert-1',
        blobName: 'missing - EME.pdf',
        fileName: 'missing - EME.pdf',
        extractionStatus: 'failed',
        extractedTextLength: 0,
        certificateNumber: 'DO-NOT-TOUCH',
        vatNumber: '4000000000',
      },
    ]);
    // The job calls `CertificateMetadataModel.updateOne(...).exec()` (Mongoose
    // returns a Query, not a Promise). Resolving updateOne directly left no
    // `.exec()`, so every persist threw a TypeError that the job caught — the
    // updates looked like silent no-ops (`updated: false`) even though the
    // production code was correct.
    updateOne.mockReturnValue({ exec: vi.fn().mockResolvedValue({}) });
    downloadToBuffer.mockRejectedValue(new Error('Blob not found'));
    extractTextWithAzureDocumentIntelligenceOnly.mockResolvedValue({
      configured: false,
      text: '',
      error: 'Azure Document Intelligence is not configured',
    });
    isDocumentIntelligenceConfigured.mockReturnValue(false);
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 0,
        getPage: vi.fn(),
      }),
    });
    mockCoverageAggregates();
  });

  it('coverage groups statuses and reports dependency state safely', async () => {
    const { getCertificateTextExtractionCoverage } = await import('../certificateTextExtractionJob.js');

    const coverage = await getCertificateTextExtractionCoverage();

    expect(coverage).toMatchObject({
      totalCertificates: 5,
      usableExtractedText: 2,
      missingExtractedText: 3,
      textTooShort: 1,
      failed: 1,
      pendingOrNotAttempted: 1,
      byExtractionStatus: {
        completed: 2,
        text_too_short: 1,
        failed: 1,
        pending: 1,
      },
      byExtractionMode: {
        pdf_text: 2,
        failed: 1,
        none: 3,
      },
      averageExtractedTextLength: 120,
    });
    expect(coverage.dependencies.azureDocumentIntelligenceConfigured).toBe(false);
    expect(typeof coverage.dependencies.pdftoppmAvailable).toBe('boolean');
    expect(typeof coverage.dependencies.tesseractJsAvailable).toBe('boolean');
  }, 15_000);

  it('dry-run retry does not write changes and defaults to dryRun true', async () => {
    const { runCertificateTextExtractionRetryJob } = await import('../certificateTextExtractionJob.js');

    const result = await runCertificateTextExtractionRetryJob({} as any, { limit: 1 });

    expect(result.dryRun).toBe(true);
    expect(result.concurrency).toBe(1);
    expect(result.matched).toBe(1);
    expect(result.wouldRetry).toBe(1);
    expect(result.retried).toBe(0);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it('real retry updates only extraction fields and marks missing blob', async () => {
    const { runCertificateTextExtractionRetryJob } = await import('../certificateTextExtractionJob.js');

    const result = await runCertificateTextExtractionRetryJob({} as any, {
      dryRun: false,
      limit: 1,
      includeDetails: true,
    });

    expect(result.retried).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0]).toMatchObject({
      certificateId: 'cert-1',
      previousStatus: 'failed',
      nextStatus: 'missing_blob',
      previousTextLength: 0,
      nextTextLength: 0,
      extractionMode: 'failed',
      timedOut: false,
      dryRun: false,
    });

    const update = updateOne.mock.calls[0][1];
    expect(update.$set).toEqual(expect.objectContaining({
      extractionStatus: 'missing_blob',
      extractionMode: 'failed',
      extractionError: 'Blob not found',
      extractedTextLength: 0,
    }));
    expect(Object.keys(update.$set).sort()).toEqual([
      'extractedAt',
      'extractedTextLength',
      'extractionError',
      'extractionMode',
      'extractionStatus',
    ]);
    expect(update.$set.certificateNumber).toBeUndefined();
    expect(update.$set.vatNumber).toBeUndefined();
    expect(update.$inc).toEqual({ extractionAttempts: 1 });
  });

  it('retry limit is capped', async () => {
    const { runCertificateTextExtractionRetryJob, MAX_TEXT_EXTRACTION_RETRY_LIMIT } = await import('../certificateTextExtractionJob.js');

    await runCertificateTextExtractionRetryJob({} as any, { limit: 9999 });

    expect(limit).toHaveBeenCalledWith(MAX_TEXT_EXTRACTION_RETRY_LIMIT);
    expect(MAX_TEXT_EXTRACTION_RETRY_LIMIT).toBeLessThanOrEqual(25);
  });

  it('real retry defaults to a small safe limit', async () => {
    const { runCertificateTextExtractionRetryJob, DEFAULT_REAL_TEXT_EXTRACTION_LIMIT } = await import('../certificateTextExtractionJob.js');

    const result = await runCertificateTextExtractionRetryJob({} as any, { dryRun: false });

    expect(result.limit).toBe(DEFAULT_REAL_TEXT_EXTRACTION_LIMIT);
    expect(limit).toHaveBeenCalledWith(DEFAULT_REAL_TEXT_EXTRACTION_LIMIT);
  });

  it('per-file timeout records a failed timed-out result without crashing the batch', async () => {
    const { runCertificateTextExtractionRetryJob } = await import('../certificateTextExtractionJob.js');
    downloadToBuffer.mockReturnValueOnce(new Promise(() => {}));

    const result = await runCertificateTextExtractionRetryJob({} as any, {
      dryRun: false,
      limit: 1,
      fileTimeoutMs: 5,
    });

    expect(result.failed).toBe(1);
    expect(result.timedOut).toBe(1);
    expect(result.results[0]).toMatchObject({
      nextStatus: 'failed',
      extractionMode: 'failed',
      timedOut: true,
      updated: true,
    });
    expect(result.results[0].failureReason).toContain('timed out after 5ms');
    expect(updateOne.mock.calls[0][1].$set).toEqual(expect.objectContaining({
      extractionStatus: 'failed',
      extractionMode: 'failed',
      extractionError: expect.stringContaining('timed out after 5ms'),
    }));
  });

  it('filters can target fake completed records with missing text and mode none', async () => {
    const { runCertificateTextExtractionRetryJob } = await import('../certificateTextExtractionJob.js');

    await runCertificateTextExtractionRetryJob({} as any, {
      statuses: ['completed'],
      modes: ['none'],
      onlyMissingText: true,
      limit: 10,
    });

    const query = find.mock.calls[0][0];
    expect(JSON.stringify(query)).toContain('"completed"');
    expect(JSON.stringify(query)).toContain('"none"');
    expect(JSON.stringify(query)).toContain('extractedTextLength');
  });

  it('default retry filter targets weak text so good completed OCR records are not selected', async () => {
    const { runCertificateTextExtractionRetryJob } = await import('../certificateTextExtractionJob.js');

    await runCertificateTextExtractionRetryJob({} as any, { limit: 10 });

    const query = find.mock.calls[0][0];
    expect(JSON.stringify(query)).toContain('extractedTextLength');
    expect(JSON.stringify(query)).toContain('extractedText');
    expect(JSON.stringify(query)).not.toContain('"ocr"');
  });

  it('summary includes duration and count fields', async () => {
    const { runCertificateTextExtractionRetryJob } = await import('../certificateTextExtractionJob.js');

    const result = await runCertificateTextExtractionRetryJob({} as any, { limit: 1 });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.averageMsPerFile).toBeGreaterThanOrEqual(0);
    expect(result).toEqual(expect.objectContaining({
      completed: expect.any(Number),
      textTooShort: expect.any(Number),
      failed: expect.any(Number),
      timedOut: expect.any(Number),
      fileTimeoutMs: expect.any(Number),
      maxLimit: expect.any(Number),
    }));
  });

  it('normal PDF text layer returns completed extraction', async () => {
    const { extractCertificateTextFromBuffer } = await import('../certificateTextExtractionJob.js');
    const pageText = 'Valid B-BBEE certificate supplier ownership expiry date level contributor '.repeat(3);
    getDocument.mockReturnValueOnce({
      promise: Promise.resolve({
        numPages: 1,
        getPage: vi.fn(async () => ({
          getTextContent: vi.fn(async () => ({
            items: [{ str: pageText }],
          })),
        })),
      }),
    });

    const result = await extractCertificateTextFromBuffer(Buffer.from('%PDF-1.7'), 'valid.pdf');

    expect(result.status).toBe('completed');
    expect(result.mode).toBe('pdf_text');
    expect(result.extractedTextLength).toBeGreaterThanOrEqual(50);
    expect(result.failureReason).toBeNull();
  });

  it('Azure Document Intelligence usable text returns completed extraction with API-facing mode', async () => {
    const { extractCertificateTextFromBuffer } = await import('../certificateTextExtractionJob.js');
    extractTextWithAzureDocumentIntelligenceOnly.mockResolvedValueOnce({
      configured: true,
      text: 'Valid B-BBEE certificate with supplier name ownership percentage expiry date and level contributor '.repeat(2),
      error: null,
    });

    const result = await extractCertificateTextFromBuffer(Buffer.from('%PDF-1.7'), 'valid.pdf');

    expect(result.status).toBe('completed');
    expect(result.mode).toBe('azure_document_intelligence');
    expect(result.extractedTextLength).toBeGreaterThanOrEqual(50);
  });

  it('scanned or image PDF with no OCR result returns text_too_short', async () => {
    const { extractCertificateTextFromBuffer } = await import('../certificateTextExtractionJob.js');

    const result = await extractCertificateTextFromBuffer(Buffer.from('%PDF-1.7'), 'scanned.pdf');

    expect(result.status).toBe('text_too_short');
    expect(result.extractedTextLength).toBe(0);
    expect(result.failureReason).toBeTruthy();
  });
});
