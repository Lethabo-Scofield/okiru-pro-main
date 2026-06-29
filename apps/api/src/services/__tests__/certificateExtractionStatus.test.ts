import { describe, expect, it } from 'vitest';
import {
  extractionStatusForText,
  hasUsableCertificateExtractedText,
  hasUsefulExtractedText,
  usefulExtractedTextLength,
} from '../certificateExtractionStatus.js';
import { collectFieldCandidates, PRODUCTION_CERTIFICATE_FIELDS } from '../certificateEnrichmentJob.js';

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
      Registration Number: 2020/123456/07
      VAT Number: 4123456789
      Certificate Number: BEE-2026-001
      Enterprise Classification: Qualifying Small Enterprise
      B-BBEE Status Level: Level 2
      Procurement Recognition: 125%
      Black Ownership: 51%
      Black Women Ownership: 26%
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
    expect(byField.blackOwnership).toMatchObject({ value: 51 });
    expect(byField.blackWomenOwnership).toMatchObject({ value: 26 });
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
