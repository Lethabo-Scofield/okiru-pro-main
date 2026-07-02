import { beforeEach, describe, expect, it, vi } from 'vitest';

const aggregate = vi.fn();
const countDocuments = vi.fn();
const find = vi.fn();
const updateOne = vi.fn();

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
    find,
    updateOne,
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
    find.mockReset();
    updateOne.mockReset();
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
  }, 15000);

  it('counts sector production coverage using only canonical Okiru Hub sectors', async () => {
    aggregate.mockResolvedValue([{ count: 0 }]);
    countDocuments.mockResolvedValue(4);

    const { calculateProductionFieldCoverage } = await import('../certificateEnrichmentJob.js');

    const coverage = await calculateProductionFieldCoverage();

    expect(coverage.sectorCount).toBe(4);
    expect(countDocuments).toHaveBeenCalledWith({
      sectorCode: { $in: ['RCOGP', 'ICT', 'FSC', 'AGRI'] },
    });
  }, 15000);

  it('extracts strict sworn-affidavit ownership, derived level, and 12-month expiry', async () => {
    const { collectFieldCandidates } = await import('../certificateEnrichmentJob.js');
    const reviews: any[] = [];
    const text = `
      SWORN AFFIDAVIT
      Applicable Scorecard EXEMPT MICRO ENTERPRISE
      The sworn affidavit will be valid for a period of 12 months from the date signed.
      Date Created: 2025/03/07
      The Enterprise is 100 % Black Owned as per Amended Codes.
      The Enterprise is 0 % Black Female Owned as per Amended Codes.
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

  it('derives Level 1 and Level 2 from QSE sworn affidavits with explicit majority black ownership', async () => {
    const { collectFieldCandidates } = await import('../certificateEnrichmentJob.js');
    const fullyOwned = collectFieldCandidates([
      'SWORN AFFIDAVIT - B-BBEE QUALIFYING SMALL ENTERPRISE',
      'The Enterprise is 100 % Black Owned as per Amended Codes.',
    ].join('\n'), 'qse-100.pdf', ['bbbeeLevel'], []);
    const majorityOwned = collectFieldCandidates([
      'SWORN AFFIDAVIT - B-BBEE QUALIFYING SMALL ENTERPRISE',
      'The Enterprise is 51 % Black Owned as per Amended Codes.',
    ].join('\n'), 'qse-51.pdf', ['bbbeeLevel'], []);

    expect(fullyOwned.find((c) => c.field === 'bbbeeLevel')).toMatchObject({ value: 1, source: 'text' });
    expect(majorityOwned.find((c) => c.field === 'bbbeeLevel')).toMatchObject({ value: 2, source: 'text' });
  });

  it('sends sub-51% QSE affidavits to review instead of deriving a level', async () => {
    const { collectFieldCandidates } = await import('../certificateEnrichmentJob.js');
    const candidates = collectFieldCandidates([
      'SWORN AFFIDAVIT - B-BBEE QUALIFYING SMALL ENTERPRISE',
      'The Enterprise is 30 % Black Owned as per Amended Codes.',
    ].join('\n'), 'qse-30.pdf', ['bbbeeLevel'], []);

    expect(candidates.some((c) => c.field === 'bbbeeLevel')).toBe(false);
  });

  it('does not apply the EME sub-51% deemed level when the affidavit also mentions QSE', async () => {
    const { collectFieldCandidates } = await import('../certificateEnrichmentJob.js');
    const candidates = collectFieldCandidates([
      'SWORN AFFIDAVIT - B-BBEE EXEMPTED MICRO ENTERPRISE / QUALIFYING SMALL ENTERPRISE',
      'The Enterprise is 30 % Black Owned as per Amended Codes.',
    ].join('\n'), 'ambiguous-30.pdf', ['bbbeeLevel'], []);

    expect(candidates.some((c) => c.field === 'bbbeeLevel')).toBe(false);
  });

  it('accepts a completed declarative status line inside a sworn affidavit but not the tick-box table', async () => {
    const { collectFieldCandidates } = await import('../certificateEnrichmentJob.js');
    const declared = collectFieldCandidates([
      'SWORN AFFIDAVIT - B-BBEE QUALIFYING SMALL ENTERPRISE',
      'Financial Year applicable : 31 August 2024',
      'Broad Based BEE status level : A level TWO contributor to B-BBEE',
      'BEE procurement recognition level : 125%',
    ].join('\n'), 'declared-qse.pdf', ['bbbeeLevel'], []);
    const tableOnly = collectFieldCandidates([
      'SWORN AFFIDAVIT - B-BBEE QUALIFYING SMALL ENTERPRISE',
      'Please confirm on the below table the B-BBEE Level Contributor, by ticking the applicable box.',
      '100% Black Owned Level One (135% B-BBEE procurement recognition level)',
      'At least 51% Black Owned Level Two (125% B-BBEE procurement recognition level)',
    ].join('\n'), 'table-qse.pdf', ['bbbeeLevel'], []);

    expect(declared.find((c) => c.field === 'bbbeeLevel')).toMatchObject({ value: 2, source: 'text' });
    expect(tableOnly.some((c) => c.field === 'bbbeeLevel')).toBe(false);
  });

  it('accepts "Status of LEVEL X" certificate wording', async () => {
    const { collectFieldCandidates } = await import('../certificateEnrichmentJob.js');
    const candidates = collectFieldCandidates([
      'B-BBEE VERIFICATION CERTIFICATE',
      'Certificate No: Moore10430',
      'has a current overall Broad-Based BEE Status of LEVEL 1 in terms of the Amended Codes of Good Practice',
    ].join('\n'), 'moore-cert.pdf', ['bbbeeLevel'], []);

    expect(candidates.find((c) => c.field === 'bbbeeLevel')).toMatchObject({ value: 1, source: 'text' });
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

  it('VAT recovery dry-run writes nothing and targets missing VAT plus usable text by default', async () => {
    const { runCertificateVatRecoveryJob } = await import('../certificateEnrichmentJob.js');
    const lean = vi.fn().mockResolvedValue([{
      _id: 'doc-1',
      id: 'cert-1',
      blobName: 'cert-1.pdf',
      extractionStatus: 'completed',
      extractionMode: 'ocr',
      extractedTextLength: 160,
      extractedText: 'B-BBEE Certificate\nEnterprise Name: Dry Run Co\nVAT No: 412 345 6789',
      vatNumber: null,
      reviewFields: ['vatNumber'],
      reviewCandidates: { vatNumber: { value: '4123456789' } },
    }]);
    const limit = vi.fn(() => ({ lean }));
    const sort = vi.fn(() => ({ limit }));
    find.mockReturnValue({ sort });
    countDocuments
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);

    const result = await runCertificateVatRecoveryJob({ limit: 10, includeDetails: true });

    expect(result.dryRun).toBe(true);
    expect(result.processed).toBe(1);
    expect(result.wouldUpdate).toBe(1);
    expect(result.updated).toBe(0);
    expect(updateOne).not.toHaveBeenCalled();
    expect(find).toHaveBeenCalledWith(expect.objectContaining({
      extractionStatus: 'completed',
      extractedTextLength: expect.any(Object),
      extractedText: expect.any(Object),
      $or: expect.any(Array),
    }));
    expect(result.details[0]).toMatchObject({
      status: 'would_update',
      vatNumber: '4123456789',
      reason: 'labelled_vat_candidate',
    });
  }, 15000);

  it('VAT recovery does not overwrite existing trusted VAT and can replace invalid existing VAT with labelled VAT', async () => {
    const { runCertificateVatRecoveryJob } = await import('../certificateEnrichmentJob.js');
    const lean = vi.fn().mockResolvedValue([
      {
        _id: 'trusted',
        id: 'trusted',
        blobName: 'trusted.pdf',
        extractionStatus: 'completed',
        extractionMode: 'ocr',
        extractedTextLength: 160,
        extractedText: 'B-BBEE Verification Certificate with enough extracted text for reliable enrichment. VAT No: 4999999999',
        vatNumber: '4123456789',
      },
      {
        _id: 'invalid',
        id: 'invalid',
        blobName: 'invalid.pdf',
        extractionStatus: 'completed',
        extractionMode: 'ocr',
        extractedTextLength: 160,
        extractedText: 'B-BBEE Verification Certificate with enough extracted text for reliable enrichment. VAT Registration Number: 498 765 4321',
        vatNumber: 'NOT-A-VAT',
        reviewFields: ['vatNumber'],
        reviewCandidates: {},
        fieldConfidence: {},
      },
    ]);
    const limit = vi.fn(() => ({ lean }));
    const sort = vi.fn(() => ({ limit }));
    find.mockReturnValue({ sort });
    countDocuments
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);

    const result = await runCertificateVatRecoveryJob({ dryRun: false, onlyMissing: false, includeDetails: true });

    expect(result.alreadyHadTrustedVat).toBe(1);
    expect(result.updated).toBe(1);
    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(updateOne.mock.calls[0][1].$set).toEqual(expect.objectContaining({
      vatNumber: '4987654321',
      vatNumberNormalized: '4987654321',
    }));
  }, 15000);

  it('VAT recovery update touches only VAT metadata fields and never scoring fields', async () => {
    const { runCertificateVatRecoveryJob } = await import('../certificateEnrichmentJob.js');
    const lean = vi.fn().mockResolvedValue([{
      _id: 'doc-1',
      id: 'cert-1',
      blobName: 'cert-1.pdf',
      extractionStatus: 'completed',
      extractionMode: 'ocr',
      extractedTextLength: 160,
      extractedText: 'B-BBEE Verification Certificate with enough extracted text for reliable enrichment. VAT No: 4123456789',
      vatNumber: null,
      reviewFields: [],
      reviewCandidates: {},
      calculatorPayload: { keep: true },
      scorecardId: 'scorecard-1',
      annualSpend: 100000,
      bbbeeScore: 85,
    }]);
    const limit = vi.fn(() => ({ lean }));
    const sort = vi.fn(() => ({ limit }));
    find.mockReturnValue({ sort });
    countDocuments
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1);

    const result = await runCertificateVatRecoveryJob({ dryRun: false, includeDetails: true });

    expect(result.updated).toBe(1);
    expect(updateOne).toHaveBeenCalledTimes(1);
    const setKeys = Object.keys(updateOne.mock.calls[0][1].$set);
    expect(setKeys.sort()).toEqual([
      'enrichmentStatus',
      'enrichmentVersion',
      'fieldConfidence',
      'lastEnrichedAt',
      'reviewCandidates',
      'reviewFields',
      'updatedAt',
      'vatNumber',
      'vatNumberNormalized',
    ]);
    expect(setKeys).not.toContain('calculatorPayload');
    expect(setKeys).not.toContain('scorecardId');
    expect(setKeys).not.toContain('annualSpend');
    expect(setKeys).not.toContain('bbbeeScore');
  }, 15000);

  it('VAT recovery stores multiple candidates for review instead of guessing', async () => {
    const { runCertificateVatRecoveryJob } = await import('../certificateEnrichmentJob.js');
    const lean = vi.fn().mockResolvedValue([{
      _id: 'doc-1',
      id: 'cert-1',
      blobName: 'multi.pdf',
      extractionStatus: 'completed',
      extractionMode: 'ocr',
      extractedTextLength: 160,
      extractedText: 'B-BBEE Certificate with enough extracted text for reliable enrichment.\n4123456789\n4987654321',
      vatNumber: null,
      reviewFields: [],
      reviewCandidates: {},
    }]);
    const limit = vi.fn(() => ({ lean }));
    const sort = vi.fn(() => ({ limit }));
    find.mockReturnValue({ sort });
    countDocuments
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);

    const result = await runCertificateVatRecoveryJob({ dryRun: false, includeDetails: true });

    expect(result.reviewRequired).toBe(1);
    expect(result.multipleCandidates).toBe(1);
    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(updateOne.mock.calls[0][1].$set.reviewCandidates.vatNumber).toMatchObject({
      reason: 'multiple_vat_like_candidates',
      candidates: expect.arrayContaining([
        expect.objectContaining({ value: '4123456789', snippet: expect.stringContaining('4123456789') }),
        expect.objectContaining({ value: '4987654321', snippet: expect.stringContaining('4987654321') }),
      ]),
    });
  }, 15000);
});

describe('VAT recovery text analysis', () => {
  async function analyse(text: string) {
    const { analyseVatRecoveryText } = await import('../certificateEnrichmentJob.js');
    return analyseVatRecoveryText(text);
  }

  it('accepts a labelled VAT with spaces', async () => {
    const result = await analyse('B-BBEE Certificate\nVAT No: 412 345 6789\nIssued for Example Co');
    expect(result).toMatchObject({
      status: 'accepted',
      reason: 'labelled_vat_candidate',
      candidate: expect.objectContaining({ value: '4123456789', labelled: true }),
    });
  });

  it('accepts a labelled VAT with hyphens', async () => {
    const result = await analyse('B-BBEE Certificate\nVAT Number: 412-345-6789\nIssued for Example Co');
    expect(result).toMatchObject({
      status: 'accepted',
      reason: 'labelled_vat_candidate',
      candidate: expect.objectContaining({ value: '4123456789' }),
    });
  });

  it('accepts a VAT whose label sits on the previous line', async () => {
    const result = await analyse('B-BBEE Certificate\nVAT Registration\n4123456789\nIssued for Example Co');
    expect(result).toMatchObject({
      status: 'accepted',
      reason: 'labelled_vat_candidate',
      candidate: expect.objectContaining({ value: '4123456789' }),
    });
  });

  it('accepts a Tax Reference label as a VAT label', async () => {
    const result = await analyse('B-BBEE Certificate\nTax Reference: 4123456789\nIssued for Example Co');
    expect(result).toMatchObject({
      status: 'accepted',
      reason: 'labelled_vat_candidate',
      candidate: expect.objectContaining({ value: '4123456789' }),
    });
  });

  it('accepts a single clean unlabelled VAT-like number with no negative context', async () => {
    const result = await analyse('B-BBEE Certificate issued for Example Co\n4123456789\nValid until further notice');
    expect(result).toMatchObject({
      status: 'accepted',
      reason: 'single_unlabelled_vat_candidate',
      candidate: expect.objectContaining({ value: '4123456789', labelled: false }),
    });
  });

  it('sends multiple VAT-like candidates to review', async () => {
    const result = await analyse('B-BBEE Certificate issued for Example Co\n4123456789\n4987654321');
    expect(result).toMatchObject({
      status: 'multiple_candidates',
      reason: 'multiple_vat_like_candidates',
    });
    expect(result.candidates).toHaveLength(2);
  });

  it('rejects an unlabelled candidate next to an identity number label', async () => {
    const result = await analyse('B-BBEE Certificate issued for Example Co\nIdentity Number: 4123456789');
    expect(result).toMatchObject({
      status: 'no_candidate_found',
      rejectedByNegativeContext: 1,
    });
  });

  it('rejects an unlabelled candidate next to a company registration label', async () => {
    const result = await analyse('B-BBEE Certificate issued for Example Co\nCompany Registration: 4123456789');
    expect(result).toMatchObject({
      status: 'no_candidate_found',
      rejectedByNegativeContext: 1,
    });
  });

  it('rejects an unlabelled candidate next to phone or contact labels', async () => {
    const tel = await analyse('B-BBEE Certificate issued for Example Co\nTel: 412 345 6789');
    const contact = await analyse('B-BBEE Certificate issued for Example Co\nContact: 4123456789');
    expect(tel).toMatchObject({ status: 'no_candidate_found', rejectedByNegativeContext: 1 });
    expect(contact).toMatchObject({ status: 'no_candidate_found', rejectedByNegativeContext: 1 });
  });

  it('rejects an unlabelled candidate next to certificate or member number labels', async () => {
    const certificate = await analyse('B-BBEE document issued for Example Co\nCertificate No: 4123456789');
    const member = await analyse('B-BBEE document issued for Example Co\nMember Number: 4123456789');
    expect(certificate).toMatchObject({ status: 'no_candidate_found', rejectedByNegativeContext: 1 });
    expect(member).toMatchObject({ status: 'no_candidate_found', rejectedByNegativeContext: 1 });
  });

  it('never treats digits embedded in longer numbers as VAT candidates', async () => {
    const result = await analyse('B-BBEE Certificate issued for Example Co\n24123456789\n41234567891');
    expect(result).toMatchObject({
      status: 'no_candidate_found',
      reason: 'no_vat_like_candidate_found',
    });
    expect(result.candidates).toHaveLength(0);
  });
});
