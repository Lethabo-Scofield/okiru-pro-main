import { describe, expect, it } from 'vitest';
import { validateParsedDocument } from '../../parser/validate.js';

describe('parser calculator safety validation', () => {
  it('passes a valid B-BBEE certificate', () => {
    const result = validateParsedDocument({
      document_type: 'B-BBEE Certificate',
      overall_confidence: 0.94,
      extracted_fields: {
        supplier_name: {
          normalized_value: 'ABC Suppliers Pty Ltd',
          confidence: 0.96,
          data_type: 'string',
        },
        bee_level: {
          normalized_value: 2,
          confidence: 0.93,
          data_type: 'bee_level',
        },
        black_ownership: {
          normalized_value: 51,
          confidence: 0.91,
          data_type: 'percentage',
        },
        expiry_date: {
          normalized_value: '2027-02-01',
          confidence: 0.9,
          data_type: 'date',
        },
      },
      required_fields: ['supplier_name', 'bee_level', 'black_ownership', 'expiry_date'],
      validation_date: '2026-06-09',
    });

    expect(result.status).toBe('passed');
    expect(result.passed).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.missing_fields).toEqual([]);
    expect(result.requires_human_review).toBe(false);
  });

  it('returns review_required when a required field is missing', () => {
    const result = validateParsedDocument({
      document_type: 'B-BBEE Certificate',
      overall_confidence: 0.91,
      extracted_fields: {
        supplier_name: {
          normalized_value: 'ABC Suppliers Pty Ltd',
          confidence: 0.95,
          data_type: 'string',
        },
        bee_level: {
          normalized_value: 2,
          confidence: 0.93,
          data_type: 'bee_level',
        },
      },
      required_fields: ['supplier_name', 'bee_level', 'black_ownership', 'expiry_date'],
    });

    expect(result.status).toBe('review_required');
    expect(result.passed).toBe(false);
    expect(result.missing_fields).toContain('black_ownership');
    expect(result.missing_fields).toContain('expiry_date');
    expect(result.requires_human_review).toBe(true);
  });

  it('returns review_required when confidence is below pass threshold', () => {
    const result = validateParsedDocument({
      document_type: 'B-BBEE Certificate',
      overall_confidence: 0.72,
      extracted_fields: {
        supplier_name: {
          normalized_value: 'ABC Suppliers Pty Ltd',
          confidence: 0.95,
          data_type: 'string',
        },
        bee_level: {
          normalized_value: 2,
          confidence: 0.61,
          data_type: 'bee_level',
        },
        black_ownership: {
          normalized_value: 51,
          confidence: 0.9,
          data_type: 'percentage',
        },
        expiry_date: {
          normalized_value: '2027-02-01',
          confidence: 0.9,
          data_type: 'date',
        },
      },
      required_fields: ['supplier_name', 'bee_level', 'black_ownership', 'expiry_date'],
    });

    expect(result.status).toBe('review_required');
    expect(result.passed).toBe(false);
    expect(result.warnings).toContain('Overall confidence is below pass threshold');
    expect(result.unsafe_fields).toContain('bee_level');
    expect(result.requires_human_review).toBe(true);
  });

  it('fails when confidence is too low', () => {
    const result = validateParsedDocument({
      document_type: 'Unknown',
      overall_confidence: 0.42,
      extracted_fields: {},
      required_fields: [],
    });

    expect(result.status).toBe('failed');
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Document confidence is too low');
    expect(result.requires_human_review).toBe(true);
  });

  it('rejects invalid B-BBEE levels', () => {
    const result = validateParsedDocument({
      document_type: 'B-BBEE Certificate',
      overall_confidence: 0.93,
      extracted_fields: {
        supplier_name: {
          normalized_value: 'ABC Suppliers Pty Ltd',
          confidence: 0.95,
          data_type: 'string',
        },
        bee_level: {
          normalized_value: 12,
          confidence: 0.93,
          data_type: 'bee_level',
        },
        black_ownership: {
          normalized_value: 51,
          confidence: 0.9,
          data_type: 'percentage',
        },
        expiry_date: {
          normalized_value: '2027-02-01',
          confidence: 0.9,
          data_type: 'date',
        },
      },
      required_fields: ['supplier_name', 'bee_level', 'black_ownership', 'expiry_date'],
    });

    expect(result.status).toBe('review_required');
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('B-BBEE level must be between 1 and 8');
    expect(result.unsafe_fields).toContain('bee_level');
    expect(result.requires_human_review).toBe(true);
  });

  it('rejects invalid percentages', () => {
    const result = validateParsedDocument({
      document_type: 'B-BBEE Certificate',
      overall_confidence: 0.93,
      extracted_fields: {
        supplier_name: {
          normalized_value: 'ABC Suppliers Pty Ltd',
          confidence: 0.95,
          data_type: 'string',
        },
        bee_level: {
          normalized_value: 2,
          confidence: 0.93,
          data_type: 'bee_level',
        },
        black_ownership: {
          normalized_value: 140,
          confidence: 0.9,
          data_type: 'percentage',
        },
        expiry_date: {
          normalized_value: '2027-02-01',
          confidence: 0.9,
          data_type: 'date',
        },
      },
      required_fields: ['supplier_name', 'bee_level', 'black_ownership', 'expiry_date'],
    });

    expect(result.status).toBe('review_required');
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Percentage must be between 0 and 100');
    expect(result.unsafe_fields).toContain('black_ownership');
    expect(result.requires_human_review).toBe(true);
  });

  it('rejects expired certificates', () => {
    const result = validateParsedDocument({
      document_type: 'B-BBEE Certificate',
      overall_confidence: 0.93,
      extracted_fields: {
        supplier_name: {
          normalized_value: 'ABC Suppliers Pty Ltd',
          confidence: 0.95,
          data_type: 'string',
        },
        bee_level: {
          normalized_value: 2,
          confidence: 0.93,
          data_type: 'bee_level',
        },
        black_ownership: {
          normalized_value: 51,
          confidence: 0.9,
          data_type: 'percentage',
        },
        expiry_date: {
          normalized_value: '2023-02-01',
          confidence: 0.9,
          data_type: 'date',
        },
      },
      required_fields: ['supplier_name', 'bee_level', 'black_ownership', 'expiry_date'],
      validation_date: '2026-06-09',
    });

    expect(result.status).toBe('review_required');
    expect(result.passed).toBe(false);
    expect(result.errors).toContain('Certificate is expired');
    expect(result.unsafe_fields).toContain('expiry_date');
    expect(result.requires_human_review).toBe(true);
  });

  it('does not allow unsafe fields into calculator payload', () => {
    const result = validateParsedDocument({
      document_type: 'B-BBEE Certificate',
      overall_confidence: 0.93,
      extracted_fields: {
        supplier_name: {
          normalized_value: 'ABC Suppliers Pty Ltd',
          confidence: 0.95,
          data_type: 'string',
          calculator_key: 'supplier.name',
        },
        bee_level: {
          normalized_value: 2,
          confidence: 0.58,
          data_type: 'bee_level',
          calculator_key: 'supplier.bee_level',
        },
      },
      required_fields: ['supplier_name', 'bee_level'],
    });

    expect(result.status).toBe('review_required');
    expect(result.safe_fields).toContain('supplier_name');
    expect(result.unsafe_fields).toContain('bee_level');
    expect(result.calculator_payload).toEqual({
      'supplier.name': 'ABC Suppliers Pty Ltd',
    });
  });
});
