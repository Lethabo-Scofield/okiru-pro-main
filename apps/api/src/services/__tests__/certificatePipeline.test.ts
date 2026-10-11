import { beforeEach, describe, expect, it, vi } from 'vitest';

const processOneCertificate = vi.fn();
const runCertificateEnrichmentJob = vi.fn();
const findOne = vi.fn();

vi.mock('../certificateExtractor.js', () => ({ processOneCertificate }));
vi.mock('../certificateEnrichmentJob.js', () => ({
  PRODUCTION_CERTIFICATE_FIELDS: ['companyName', 'vatNumber'],
  runCertificateEnrichmentJob,
}));
vi.mock('../../../models.js', () => ({
  CertificateMetadataModel: { findOne },
}));
vi.mock('../azureCertStorage.js', () => ({
  getCertContainerClient: vi.fn(),
}));

describe('certificate pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs deterministic enrichment after successful text extraction', async () => {
    processOneCertificate.mockResolvedValue({
      blobName: 'certificate.pdf',
      status: 'text_extracted',
      expiryDate: null,
    });
    findOne
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({ extractionStatus: 'completed', expiryDate: null }),
      })
      .mockReturnValueOnce({
        lean: vi.fn().mockResolvedValue({ metadataStatus: 'needs_review', expiryDate: null }),
      });
    runCertificateEnrichmentJob.mockResolvedValue({ failed: 0, reviewRequired: 1 });

    const { processOneCertificatePipeline } = await import('../certificatePipeline.js');
    const blobServiceClient = {} as never;
    const result = await processOneCertificatePipeline(blobServiceClient, 'certificate.pdf', true);

    expect(processOneCertificate).toHaveBeenCalledWith(blobServiceClient, 'certificate.pdf', true);
    expect(runCertificateEnrichmentJob).toHaveBeenCalledWith(blobServiceClient, expect.objectContaining({
      blobNames: ['certificate.pdf'],
      dryRun: false,
      force: false,
      onlyUsableText: true,
      fields: ['companyName', 'vatNumber'],
    }));
    expect(result.status).toBe('needs_review');
  });

  it('does not run enrichment when text extraction fails', async () => {
    processOneCertificate.mockResolvedValue({
      blobName: 'broken.pdf',
      status: 'failed',
      expiryDate: null,
    });

    const { processOneCertificatePipeline } = await import('../certificatePipeline.js');
    await expect(processOneCertificatePipeline({} as never, 'broken.pdf')).resolves.toMatchObject({ status: 'failed' });
    expect(runCertificateEnrichmentJob).not.toHaveBeenCalled();
  });
});
