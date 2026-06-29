import { beforeEach, describe, expect, it, vi } from 'vitest';

const aggregate = vi.fn();
const countDocuments = vi.fn();

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
    countDocuments,
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
  OKIRU_HUB_SECTORS: [
    { code: 'RCOGP', name: 'Retail, Construction, Oil & Gas, Property' },
    { code: 'ICT', name: 'Information & Communications Technology' },
    { code: 'FSC', name: 'Financial Sector Code' },
    { code: 'AGRI', name: 'Agriculture (AgriBEE)' },
  ],
  resolveOkiruHubSector: vi.fn(),
}));

describe('certificate enrichment job', () => {
  beforeEach(() => {
    aggregate.mockReset();
    countDocuments.mockReset();
  });

  it('counts present fields without treating missing or empty values as covered', async () => {
    countDocuments.mockResolvedValueOnce(12);

    const { countPresentCertificateField } = await import('../certificateEnrichmentJob.js');

    await expect(countPresentCertificateField('empoweringSupplier')).resolves.toBe(12);
    expect(countDocuments).toHaveBeenCalledWith({
      empoweringSupplier: {
        $exists: true,
        $nin: [null, ''],
      },
    });
  });

  it('counts sector production coverage using only canonical Okiru Hub sectors', async () => {
    aggregate.mockResolvedValue([{ count: 0 }]);
    countDocuments.mockResolvedValue(4);

    const { calculateProductionFieldCoverage } = await import('../certificateEnrichmentJob.js');

    const coverage = await calculateProductionFieldCoverage();

    expect(coverage.sectorCount).toBe(4);
    expect(countDocuments).toHaveBeenCalledWith({
      sectorCode: { $in: ['RCOGP', 'ICT', 'FSC', 'AGRI'] },
    });
  });

  it('extracts strict sworn-affidavit ownership, derived level, and 12-month expiry', async () => {
    const { collectFieldCandidates } = await import('../certificateEnrichmentJob.js');
    const reviews: any[] = [];
    const text = `
      SWORN AFFIDAVIT
      Applicable Scorecard EXEMPT MICRO ENTERPRISE
      The sworn affidavit will be valid for a period of 12 months from the date signed.
      Date Created: 2025/03/07
      The Enterprise is lQ0 _% Black Owned as per Amended Codes.
      The Enterprise is CO _% Black Female Owned as per Amended Codes.
    `;

    const candidates = collectFieldCandidates(text, 'sample-eme.pdf', [
      'blackOwnership',
      'blackWomenOwnership',
      'bbbeeLevel',
      'expiryDate',
    ], reviews);
    const byField = new Map(candidates.map((candidate) => [candidate.field, candidate]));

    expect(byField.get('blackOwnership')).toMatchObject({ value: 100, source: 'text' });
    expect(byField.get('blackWomenOwnership')).toMatchObject({ value: 0, source: 'text' });
    expect(byField.get('bbbeeLevel')).toMatchObject({ value: 1, source: 'text' });
    expect((byField.get('expiryDate')?.value as Date).toISOString().slice(0, 10)).toBe('2026-03-07');
  });

  it('rejects sworn-affidavit level table ownership when enterprise ownership is not explicit', async () => {
    const { collectFieldCandidates } = await import('../certificateEnrichmentJob.js');
    const reviews: any[] = [];
    const text = [
      'SWORN AFFIDAVIT - B-BBEE EXEMPTED MICRO ENTERPRISE',
      'Please confirm on the below table the B-BBEE Level Contributor, by ticking the applicable box.',
      '100% Black Owned Level One (135% B-BBEE procurement recognition level)',
      'At least 51% Black Owned Level Two (125% B-BBEE procurement recognition level)',
      'Less than 51% Black Owned Level Four (100% B-BBEE procurement recognition level)',
      'The Enterprise is 0 % Black Female Owned as per amended Code Series 100.',
    ].join('\n');

    const candidates = collectFieldCandidates(text, 'table-only-affidavit.pdf', [
      'blackOwnership',
      'blackWomenOwnership',
      'bbbeeLevel',
    ], reviews);
    const byField = new Map(candidates.map((candidate) => [candidate.field, candidate]));

    expect(byField.has('blackOwnership')).toBe(false);
    expect(byField.has('bbbeeLevel')).toBe(false);
    expect(byField.get('blackWomenOwnership')).toMatchObject({ value: 0, source: 'text' });
  });

  it('does not derive affidavit level from unsafe OCR ownership letters', async () => {
    const { collectFieldCandidates } = await import('../certificateEnrichmentJob.js');
    const reviews: any[] = [];
    const text = [
      'SWORN AFFIDAVIT - B-BBEE EXEMPTED MICRO ENTERPRISE',
      'The Enterprise is SH % Black Owned using the flow-through principle.',
      'The Enterprise is 0 % Black Female Owned using the flow-through principle.',
    ].join('\n');

    const candidates = collectFieldCandidates(text, 'unsafe-ocr-affidavit.pdf', ['blackOwnership', 'bbbeeLevel'], reviews);

    expect(candidates.some((candidate) => candidate.field === 'bbbeeLevel')).toBe(false);
  });

  it('extracts worded B-BBEE levels from certificate status wording', async () => {
    const { collectFieldCandidates } = await import('../certificateEnrichmentJob.js');
    const reviews: any[] = [];
    const text = [
      'BROAD-BASED BEE VERIFICATION CERTIFICATE',
      'B-BBEE Status: LEVEL 4',
      'Scorecard Information',
    ].join('\n');

    const candidates = collectFieldCandidates(text, 'generic-cert.pdf', ['bbbeeLevel', 'bbbeeLevelStatus'], reviews);
    const byField = new Map(candidates.map((candidate) => [candidate.field, candidate]));

    expect(byField.get('bbbeeLevel')).toMatchObject({ value: 4, source: 'text' });
    expect(byField.get('bbbeeLevelStatus')).toMatchObject({ value: 'Level 4', source: 'text' });
  });

  it('extracts uppercase contributor wording with level words', async () => {
    const { collectFieldCandidates } = await import('../certificateEnrichmentJob.js');
    const reviews: any[] = [];
    const text = [
      'B-BBEE Verification Certificate',
      'LEVEL TWO CONTRIBUTOR',
      'BEE Procurement Recognition Level 125%',
    ].join('\n');

    const candidates = collectFieldCandidates(text, 'generic-cert.pdf', ['bbbeeLevel'], reviews);

    expect(candidates.find((candidate) => candidate.field === 'bbbeeLevel')).toMatchObject({
      value: 2,
      source: 'text',
    });
  });
});
