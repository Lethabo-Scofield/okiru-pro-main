import { describe, expect, it } from 'vitest';
import { validateParsedDocument, type ParsedDocumentValidationInput } from '../parser/validate.js';

const VALIDATION_DATE = '2026-06-18';
const REQUIRED_FIELDS = ['supplier_name', 'bee_level', 'black_ownership', 'expiry_date'];

function certificateInput(
  overrides: Partial<ParsedDocumentValidationInput> = {},
): ParsedDocumentValidationInput {
  return {
    document_type: 'B-BBEE Certificate',
    overall_confidence: 0.94,
    extracted_fields: {
      supplier_name: {
        normalized_value: 'ABC Suppliers Pty Ltd',
        confidence: 0.96,
        data_type: 'string',
        calculator_key: 'supplier.name',
      },
      bee_level: {
        normalized_value: 2,
        confidence: 0.93,
        data_type: 'bee_level',
        calculator_key: 'supplier.bee_level',
      },
      black_ownership: {
        normalized_value: 51,
        confidence: 0.91,
        data_type: 'percentage',
        calculator_key: 'supplier.black_ownership',
      },
      expiry_date: {
        normalized_value: '2027-02-01',
        confidence: 0.9,
        data_type: 'date',
        calculator_key: 'supplier.certificate_expiry',
      },
    },
    required_fields: REQUIRED_FIELDS,
    validation_date: VALIDATION_DATE,
    ...overrides,
  };
}

describe('production parser safety validation', () => {
  it('passes a valid B-BBEE Certificate and exposes only mapped safe fields', () => {
    const result = validateParsedDocument(certificateInput());

    expect(result.status).toBe('passed');
    expect(result.missing_fields).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.requires_human_review).toBe(false);
    expect(result.safe_fields).toEqual(REQUIRED_FIELDS);
    expect(result.calculator_payload).toEqual({
      'supplier.name': 'ABC Suppliers Pty Ltd',
      'supplier.bee_level': 2,
      'supplier.black_ownership': 51,
      'supplier.certificate_expiry': '2027-02-01',
    });
  });

  it('returns review_required when required fields are missing and excludes them from calculator_payload', () => {
    const result = validateParsedDocument(certificateInput({
      extracted_fields: {
        supplier_name: {
          normalized_value: 'ABC Suppliers Pty Ltd',
          confidence: 0.96,
          data_type: 'string',
          calculator_key: 'supplier.name',
        },
        bee_level: {
          normalized_value: 2,
          confidence: 0.93,
          data_type: 'bee_level',
          calculator_key: 'supplier.bee_level',
        },
      },
    }));

    expect(result.status).toBe('review_required');
    expect(result.missing_fields).toEqual(['black_ownership', 'expiry_date']);
    expect(result.requires_human_review).toBe(true);
    // Safety gate: review_required must never carry a calculator payload, even
    // for the fields that individually passed. The whole document is unresolved.
    expect(result.calculator_payload).toEqual({});
  });

  it('returns review_required when overall confidence is below 0.85', () => {
    const result = validateParsedDocument(certificateInput({
      overall_confidence: 0.84,
    }));

    expect(result.status).toBe('review_required');
    expect(result.warnings).toContain('Overall confidence is below pass threshold');
    expect(result.requires_human_review).toBe(true);
  });

  it('returns failed and an empty calculator_payload when overall confidence is below 0.60', () => {
    const result = validateParsedDocument(certificateInput({
      overall_confidence: 0.59,
    }));

    expect(result.status).toBe('failed');
    expect(result.errors).toContain('Document confidence is too low');
    expect(result.calculator_payload).toEqual({});
    expect(result.safe_fields).toEqual([]);
  });

  it('blocks invalid B-BBEE levels from calculator_payload', () => {
    const result = validateParsedDocument(certificateInput({
      extracted_fields: {
        ...certificateInput().extracted_fields,
        bee_level: {
          normalized_value: 12,
          confidence: 0.93,
          data_type: 'bee_level',
          calculator_key: 'supplier.bee_level',
        },
      },
    }));

    expect(result.status).toBe('review_required');
    expect(result.errors).toContain('B-BBEE level must be between 1 and 8');
    expect(result.calculator_payload).not.toHaveProperty('supplier.bee_level');
  });

  it('blocks invalid percentages from calculator_payload', () => {
    const result = validateParsedDocument(certificateInput({
      extracted_fields: {
        ...certificateInput().extracted_fields,
        black_ownership: {
          normalized_value: 140,
          confidence: 0.91,
          data_type: 'percentage',
          calculator_key: 'supplier.black_ownership',
        },
      },
    }));

    expect(result.status).toBe('review_required');
    expect(result.errors).toContain('Percentage must be between 0 and 100');
    expect(result.calculator_payload).not.toHaveProperty('supplier.black_ownership');
  });

  it('blocks expired certificates and does not treat certificate expiry as safe', () => {
    const result = validateParsedDocument(certificateInput({
      extracted_fields: {
        ...certificateInput().extracted_fields,
        expiry_date: {
          normalized_value: '2023-02-01',
          confidence: 0.9,
          data_type: 'date',
          calculator_key: 'supplier.certificate_expiry',
        },
      },
      validation_date: VALIDATION_DATE,
    }));

    expect(result.status).toBe('review_required');
    expect(result.errors).toContain('Certificate is expired');
    expect(result.unsafe_fields).toContain('expiry_date');
    expect(result.safe_fields).not.toContain('expiry_date');
    expect(result.calculator_payload).not.toHaveProperty('supplier.certificate_expiry');
  });

  it('excludes unsafe low-confidence fields from calculator_payload', () => {
    const result = validateParsedDocument(certificateInput({
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
    }));

    expect(result.status).toBe('review_required');
    // Even though supplier.name individually passed, a review_required document
    // emits no calculator payload at all.
    expect(result.calculator_payload).toEqual({});
    expect(result.calculator_payload).not.toHaveProperty('supplier.bee_level');
  });
});
