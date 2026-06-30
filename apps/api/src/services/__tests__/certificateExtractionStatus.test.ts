import { describe, expect, it } from 'vitest';
import {
  extractionStatusForText,
  hasUsableCertificateExtractedText,
  hasUsefulExtractedText,
  usefulExtractedTextLength,
} from '../certificateExtractionStatus.js';
import { analyseVatRecoveryText, collectFieldCandidates, PRODUCTION_CERTIFICATE_FIELDS } from '../certificateEnrichmentJob.js';

describe('certificate extraction status', () => {
  it('normal PDF text is treated as completed when useful text is present', () => {
    const text = 'B-BBEE Certificate '.repeat(4);

    expect(usefulExtractedTextLength(text)).toBeGreaterThanOrEqual(50);
    expect(hasUsefulExtractedText(text)).toBe(true);
    expect(extractionStatusForText(text)).toBe('completed');
  });

  it('scanned/image PDF with no OCR result is not treated as completed', () => {
    expect(usefulExtractedTextLength('   \n\t')).toBe(0);
    expect(hasUsefulExtractedText('')).toBe(false);
    expect(extractionStatusForText('')).toBe('text_too_short');
  });

  it('short OCR garbage is tracked separately from empty text', () => {
    expect(hasUsefulExtractedText('abc')).toBe(false);
    expect(extractionStatusForText('abc')).toBe('text_too_short');
  });

  it('filename-only path does not mark extraction as completed', () => {
    expect(extractionStatusForText('')).toBe('text_too_short');
  });

  it('enrichment skips unsafe fields when extractedTextLength is 0', () => {
    const reviews: any[] = [];
    const candidates = collectFieldCandidates(
      '',
      '2026 01 01 Example Supplier VAT 4123456789 Level 1 100 percent - EME.pdf',
      [...PRODUCTION_CERTIFICATE_FIELDS],
      reviews,
    );

    expect(candidates).toEqual([
      expect.objectContaining({
        field: 'companySize',
        value: 'EME',
        source: 'filename',
      }),
    ]);
    expect(candidates.some((c) => c.field === 'vatNumber')).toBe(false);
    expect(candidates.some((c) => c.field === 'bbbeeLevel')).toBe(false);
    expect(candidates.some((c) => c.field === 'blackOwnership')).toBe(false);
    expect(candidates.some((c) => c.field === 'expiryDate')).toBe(false);
  });

  it('companySize fallback from filename still works without text', () => {
    const candidates = collectFieldCandidates('', 'Acme Supplies - Generic.pdf', ['companySize'], []);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      field: 'companySize',
      value: 'Generic Enterprise',
      source: 'filename',
    });
  });

  it('extracts only production-critical B-BBEE certificate fields by default', () => {
    const reviews: any[] = [];
    const text = `
      B-BBEE Verification Certificate
      Enterprise Name: Acme Supplies (Pty) Ltd
      Trading as: Acme Trade
      Black Ownership: 51%
      Black Women Ownership: 26%
      VAT Number: 4123456789
      Enterprise Classification: Qualifying Small Enterprise
      B-BBEE Status Level: Level 2
      Designated Group Ownership: 12%
      Empowering Supplier: Yes
      Value Adding Supplier: No
      Issue Date: 18 June 2026
      Expiry Date: 17 June 2027
      Measurement Period: FY2025
      Verification Agency: Example Ratings (Pty) Ltd
      SANAS Accreditation Number: BVA123
      Physical Address: 12 Main Road, Johannesburg
      Tel: +27 11 123 4567
      Email: info@example.co.za
      Financial Sector Code
    `;

    const candidates = collectFieldCandidates(text, 'acme.pdf', [...PRODUCTION_CERTIFICATE_FIELDS], reviews);
    const byField = Object.fromEntries(candidates.map((c) => [c.field, c]));

    expect(byField.companyName).toMatchObject({ value: 'Acme Supplies (Pty) Ltd', source: 'text' });
    expect(byField.vatNumber).toMatchObject({ value: '4123456789' });
    expect(byField.companySize).toMatchObject({ value: 'QSE' });
    expect(byField.bbbeeLevel).toMatchObject({ value: 2 });
    expect(byField.bbbeeLevelStatus).toMatchObject({ value: 'Level 2' });
    expect(byField.blackOwnership).toMatchObject({ field: 'blackOwnership' });
    expect(Number(byField.blackOwnership.value)).toBeGreaterThanOrEqual(0);
    expect(Number(byField.blackOwnership.value)).toBeLessThanOrEqual(100);
    expect(byField.blackWomenOwnership).toMatchObject({ field: 'blackWomenOwnership' });
    expect(Number(byField.blackWomenOwnership.value)).toBeGreaterThanOrEqual(0);
    expect(Number(byField.blackWomenOwnership.value)).toBeLessThanOrEqual(100);
    expect(byField.expiryDate.value).toBeInstanceOf(Date);
    expect(byField.sectorCode).toMatchObject({ value: 'FSC' });
    expect(byField.certificateNumber).toBeUndefined();
    expect(byField.procurementRecognition).toBeUndefined();
    expect(byField.verificationAgency).toBeUndefined();
  });

  it('extracts tax number from text without confusing it with VAT', () => {
    const candidates = collectFieldCandidates(
      'Enterprise Name: Tax Co Pty Ltd\nIncome Tax Number: 9876543210\nExpiry Date: 17 June 2027\nB-BBEE Level: 4\nProcurement Recognition: 100%',
      'tax-co.pdf',
      ['taxNumber'],
      [],
    );

    expect(candidates).toEqual([
      expect.objectContaining({ field: 'taxNumber', value: '9876543210', source: 'text' }),
    ]);
  });

  it('accepts one clear unlabelled VAT-like number from certificate text', () => {
    const reviews: any[] = [];
    const candidates = collectFieldCandidates(
      `
        B-BBEE Certificate
        Enterprise Name: Unlabelled Vat Co Pty Ltd
        Address: 10 Test Street
        4123456789
        B-BBEE Level: Level 4
        Expiry Date: 17 June 2027
      `,
      'unlabelled-vat.pdf',
      ['vatNumber', 'companyName', 'bbbeeLevel', 'expiryDate'],
      reviews,
    );

    expect(candidates).toContainEqual(expect.objectContaining({
      field: 'vatNumber',
      value: '4123456789',
      confidence: 0.88,
    }));
    expect(reviews.some((review) => review.field === 'vatNumber')).toBe(false);
  });

  it('accepts spaced labelled VAT numbers', () => {
    const analysis = analyseVatRecoveryText('VAT No: 412 345 6789');

    expect(analysis.status).toBe('accepted');
    if (analysis.status === 'accepted') {
      expect(analysis.reason).toBe('labelled_vat_candidate');
      expect(analysis.candidate.value).toBe('4123456789');
      expect(analysis.candidate.confidence).toBe(0.96);
    }
  });

  it('accepts VAT labels on the previous line', () => {
    const analysis = analyseVatRecoveryText('VAT Registration Number\n412-345-6789');

    expect(analysis.status).toBe('accepted');
    if (analysis.status === 'accepted') {
      expect(analysis.reason).toBe('labelled_vat_candidate');
      expect(analysis.candidate.value).toBe('4123456789');
    }
  });

  it('does not slice VAT numbers out of longer identity-like numbers', () => {
    const reviews: any[] = [];
    const candidates = collectFieldCandidates(
      `
        B-BBEE Sworn Affidavit
        Deponent identity number: 7401180421086
        Enterprise Name: No Vat Visible Pty Ltd
        B-BBEE Level: Level 4
        Expiry Date: 17 June 2027
      `,
      'no-vat-visible.pdf',
      ['vatNumber', 'companyName', 'bbbeeLevel', 'expiryDate'],
      reviews,
    );

    expect(candidates.some((candidate) => candidate.field === 'vatNumber')).toBe(false);
    expect(reviews).toContainEqual(expect.objectContaining({
      field: 'vatNumber',
      reason: 'missing_vat_number',
    }));
  });

  it('does not treat membership numbers as unlabelled VAT', () => {
    const reviews: any[] = [];
    const candidates = collectFieldCandidates(
      `
        B-BBEE Certificate
        Enterprise Name: Membership Co Pty Ltd
        Professional Accountant Member No: 4295694540
        B-BBEE Level: Level 4
        Expiry Date: 17 June 2027
      `,
      'membership-number.pdf',
      ['vatNumber', 'companyName', 'bbbeeLevel', 'expiryDate'],
      reviews,
    );

    expect(candidates.some((candidate) => candidate.field === 'vatNumber')).toBe(false);
    expect(reviews).toContainEqual(expect.objectContaining({
      field: 'vatNumber',
      reason: 'missing_vat_number',
    }));
  });

  it('rejects company registration and phone/contact contexts', () => {
    expect(analyseVatRecoveryText('Company Registration Number: 4123456789').status).toBe('no_candidate_found');
    expect(analyseVatRecoveryText('Tel: 4123456789').status).toBe('no_candidate_found');
    expect(analyseVatRecoveryText('Contact number 4123456789').status).toBe('no_candidate_found');
    expect(analyseVatRecoveryText('Certificate Number: 4123456789').status).toBe('no_candidate_found');
  });

  it('rejects VAT-like candidates embedded in longer digit strings', () => {
    expect(analyseVatRecoveryText('1234123456789').status).toBe('no_candidate_found');
    expect(analyseVatRecoveryText('412345678901').status).toBe('no_candidate_found');
    expect(analyseVatRecoveryText('ID: 9001015123456').status).toBe('no_candidate_found');
    expect(analyseVatRecoveryText('Reg: 2019/123456/07').status).toBe('no_candidate_found');
  });

  it('keeps multiple unlabelled VAT-like numbers in review instead of guessing', () => {
    const reviews: any[] = [];
    const candidates = collectFieldCandidates(
      `
        B-BBEE Certificate
        Enterprise Name: Multi Vat Group Pty Ltd
        4123456789
        4987654321
        B-BBEE Level: Level 4
        Expiry Date: 17 June 2027
      `,
      'multi-vat.pdf',
      ['vatNumber', 'companyName', 'bbbeeLevel', 'expiryDate'],
      reviews,
    );

    expect(candidates.some((candidate) => candidate.field === 'vatNumber')).toBe(false);
    expect(reviews).toContainEqual(expect.objectContaining({
      field: 'vatNumber',
      reason: 'multiple_vat_like_candidates',
    }));
    const analysis = analyseVatRecoveryText('4123456789\n4987654321');
    expect(analysis.status).toBe('multiple_candidates');
    if (analysis.status === 'multiple_candidates') {
      expect(analysis.candidates[0].snippet).toContain('4123456789');
    }
  });

  it('extracts common compact scorecard layouts for level ownership and valid-to expiry', () => {
    const reviews: any[] = [];
    const candidates = collectFieldCandidates(
      `
        B-BBEE Verification Certificate
        Enterprise Name: Layout Co Pty Ltd
        Level 2 Contributor
        Black People Voting Rights 51.00%
        Black Female Ownership 30.25%
        Valid From: 18 June 2026 To: 17 June 2027
      `,
      'layout-co.pdf',
      ['bbbeeLevel', 'blackOwnership', 'blackWomenOwnership', 'expiryDate'],
      reviews,
    );
    const byField = Object.fromEntries(candidates.map((candidate) => [candidate.field, candidate]));

    expect(byField.bbbeeLevel).toMatchObject({ value: 2 });
    expect(byField.blackOwnership).toMatchObject({ value: 51 });
    expect(byField.blackWomenOwnership).toMatchObject({ value: 30.25 });
    expect(byField.expiryDate.value).toBeInstanceOf(Date);
    expect(byField.expiryDate.value.toISOString().slice(0, 10)).toBe('2027-06-17');
  });

  it('extracts compact ISO-like expiry dates from labelled text', () => {
    const candidates = collectFieldCandidates(
      'B-BBEE Certificate\nStatus Level 4\nBlack Ownership 51%\nExpiry Date: 20270617',
      'compact-expiry.pdf',
      ['bbbeeLevel', 'blackOwnership', 'expiryDate'],
      [],
    );
    const byField = Object.fromEntries(candidates.map((candidate) => [candidate.field, candidate]));

    expect(byField.bbbeeLevel).toMatchObject({ value: 4 });
    expect(byField.blackOwnership).toMatchObject({ value: 51 });
    expect(byField.expiryDate.value.toISOString().slice(0, 10)).toBe('2027-06-17');
  });

  it('derives sworn affidavit expiry from OCR-noisy 12 month validity wording', () => {
    const candidates = collectFieldCandidates(
      `
        SWORN AFFIDAVIT - B-BBEE EXEMPTED MICRO ENTERPRISE
        This sworn affidavit will be valid for a pedod of 12 monlhs from the date signed by commissioner.
        Deponent Signature
        Date: 17 NOVEMBER 2025
        Commissioner of Oaths Signature & stamp
      `,
      'sworn-noisy-expiry.pdf',
      ['expiryDate'],
      [],
    );

    expect(candidates).toContainEqual(expect.objectContaining({
      field: 'expiryDate',
      value: expect.any(Date),
    }));
    const expiry = candidates.find((candidate) => candidate.field === 'expiryDate')?.value as Date;
    expect(expiry.toISOString().slice(0, 10)).toBe('2026-11-17');
  });

  it('marks uncertain or missing key fields for review', () => {
    const reviews: any[] = [];
    const candidates = collectFieldCandidates(
      'B-BBEE Certificate\nEnterprise Name: Review Co Pty Ltd',
      'review-co.pdf',
      ['companyName', 'expiryDate', 'bbbeeLevel', 'vatNumber'],
      reviews,
    );

    expect(candidates.some((c) => c.field === 'companyName')).toBe(true);
    expect(reviews.map((r) => r.reason)).toEqual(expect.arrayContaining([
      'missing_expiry_date',
      'missing_level',
      'missing_vat_number',
    ]));
  });

  it('identifies usable extracted text only when status, mode, length, and text are safe', () => {
    const text = 'B-BBEE Certificate with enough extracted text for reliable enrichment. Level 2 contributor.';

    expect(hasUsableCertificateExtractedText({
      extractionStatus: 'completed',
      extractionMode: 'ocr',
      extractedTextLength: text.length,
      extractedText: text,
    })).toBe(true);

    expect(hasUsableCertificateExtractedText({
      extractionStatus: 'completed',
      extractionMode: 'pdf_text',
      extractedTextLength: text.length,
      extractedText: text,
    })).toBe(true);
  });

  it.each([
    ['mode=none', { extractionStatus: 'completed', extractionMode: 'none', extractedTextLength: 100, extractedText: 'Valid text '.repeat(20) }],
    ['filename_only', { extractionStatus: 'completed', extractionMode: 'filename_only', extractedTextLength: 100, extractedText: 'Valid text '.repeat(20) }],
    ['text_too_short', { extractionStatus: 'text_too_short', extractionMode: 'ocr', extractedTextLength: 10, extractedText: 'too short' }],
    ['failed', { extractionStatus: 'failed', extractionMode: 'failed', extractedTextLength: 0, extractedText: '' }],
    ['unsupported', { extractionStatus: 'unsupported', extractionMode: 'none', extractedTextLength: 0, extractedText: '' }],
    ['missing text', { extractionStatus: 'completed', extractionMode: 'ocr', extractedTextLength: 100, extractedText: '' }],
  ])('rejects unusable extracted text state: %s', (_label, doc) => {
    expect(hasUsableCertificateExtractedText(doc)).toBe(false);
  });
});
