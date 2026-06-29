import { describe, expect, it, vi } from 'vitest';

const aggregate = vi.fn();

vi.mock('@azure/storage-blob', () => ({
  BlobServiceClient: class BlobServiceClient {},
}));

vi.mock('tesseract.js', () => ({
  default: {
    recognize: vi.fn(),
  },
}));

vi.mock('../../../models.js', () => ({
  CertificateMetadataModel: {
    aggregate,
    countDocuments: vi.fn(),
  },
}));

vi.mock('../azureCertStorage.js', () => ({
  getCertContainerClient: vi.fn(),
}));

vi.mock('../certificateExtractor.js', () => ({
  extractCertificateData: vi.fn(() => ({})),
  isValidSupplierName: vi.fn(() => true),
}));

vi.mock('../certificateStore.js', () => ({
  normalizeVat: vi.fn((value: string) => value),
}));

vi.mock('../documentIntelligence.js', () => ({
  extractTextWithDocIntelligence: vi.fn(),
}));

vi.mock('../okiruHubSectors.js', () => ({
  OKIRU_HUB_SECTORS: [],
  resolveOkiruHubSector: vi.fn(),
}));

describe('certificate enrichment job', () => {
  it('counts present fields with aggregation so legacy empty strings do not break boolean schema fields', async () => {
    aggregate.mockResolvedValueOnce([{ count: 12 }]);

    const { countPresentCertificateField } = await import('../certificateEnrichmentJob.js');

    await expect(countPresentCertificateField('empoweringSupplier')).resolves.toBe(12);
    expect(aggregate).toHaveBeenCalledWith([
      {
        $match: {
          $expr: {
            $and: [
              { $ne: ['$empoweringSupplier', null] },
              { $ne: ['$empoweringSupplier', ''] },
            ],
          },
        },
      },
      { $count: 'count' },
    ]);
  });
});
