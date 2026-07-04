import type { FieldKnowledge } from '../graph/ontology_models.js';
import type { ExtractedFieldWithMeta } from './extract_fields.js';

export interface ParserValidationResult {
  passed: boolean;
  warnings: string[];
  errors: string[];
  missing_fields: string[];
  safe_fields: Set<string>;
  rules_applied: string[];
}

const PASS_CONFIDENCE = 0.85;
const REVIEW_CONFIDENCE = 0.6;

export interface ParsedDocumentFieldForValidation {
  normalized_value: unknown;
  confidence: number;
  data_type: string;
  calculator_key?: string;
}

export interface ParsedDocumentValidationInput {
  document_type: string;
  overall_confidence: number;
  extracted_fields: Record<string, ParsedDocumentFieldForValidation | undefined>;
  required_fields: string[];
  validation_date?: string;
}

export interface ParsedDocumentValidationResult {
  status: 'passed' | 'review_required' | 'failed';
  passed: boolean;
  warnings: string[];
  errors: string[];
  missing_fields: string[];
  safe_fields: string[];
  unsafe_fields: string[];
  calculator_payload: Record<string, unknown>;
  requires_human_review: boolean;
}

function isMissing(value: ParsedDocumentFieldForValidation | undefined): boolean {
  return value == null || value.normalized_value == null || value.normalized_value === '';
}

function isExpired(dateValue: unknown, validationDate: string | undefined): boolean {
  if (dateValue == null) return false;
  const expiry = new Date(String(dateValue));
  if (Number.isNaN(expiry.getTime())) return false;
  const effectiveNow = validationDate ? new Date(validationDate) : new Date();
  return expiry < new Date(effectiveNow.toISOString().slice(0, 10));
}

export function validateParsedDocument(input: ParsedDocumentValidationInput): ParsedDocumentValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const missingFields: string[] = [];
  const safeFields: string[] = [];
  const unsafeFields: string[] = [];
  const calculatorPayload: Record<string, unknown> = {};

  if (input.overall_confidence < REVIEW_CONFIDENCE) {
    errors.push('Document confidence is too low');
  } else if (input.overall_confidence < PASS_CONFIDENCE) {
    warnings.push('Overall confidence is below pass threshold');
  }

  for (const fieldName of input.required_fields) {
    const field = input.extracted_fields[fieldName];
    if (isMissing(field)) {
      missingFields.push(fieldName);
    }
  }

  for (const [fieldName, field] of Object.entries(input.extracted_fields)) {
    if (!field || isMissing(field)) {
      unsafeFields.push(fieldName);
      continue;
    }

    let fieldSafe = true;
    const value = field.normalized_value;

    if (field.confidence < PASS_CONFIDENCE) {
      fieldSafe = false;
    }

    if (field.data_type === 'bee_level') {
      const level = Number(value);
      if (!Number.isInteger(level) || level < 1 || level > 8) {
        errors.push('B-BBEE level must be between 1 and 8');
        fieldSafe = false;
      }
    }

    if (field.data_type === 'percentage') {
      const percentage = Number(value);
      if (!Number.isFinite(percentage) || percentage < 0 || percentage > 100) {
        errors.push('Percentage must be between 0 and 100');
        fieldSafe = false;
      }
    }

    if (fieldName === 'expiry_date' || fieldName.endsWith('_expiry_date')) {
      if (isExpired(value, input.validation_date)) {
        errors.push('Certificate is expired');
        fieldSafe = false;
      }
    }

    if (fieldSafe) {
      safeFields.push(fieldName);
      if (field.calculator_key) {
        calculatorPayload[field.calculator_key] = value;
      }
    } else {
      unsafeFields.push(fieldName);
    }
  }

  if (missingFields.length > 0) {
    errors.push(...missingFields.map((field) => `${field} is required`));
  }

  const status = input.overall_confidence < REVIEW_CONFIDENCE
    ? 'failed'
    : errors.length > 0 || warnings.length > 0 || unsafeFields.length > 0
      ? 'review_required'
      : 'passed';

  const outputSafeFields = status === 'failed' ? [] : Array.from(new Set(safeFields));
  const outputCalculatorPayload = status === 'failed' ? {} : calculatorPayload;

  return {
    status,
    passed: status === 'passed',
    warnings: Array.from(new Set(warnings)),
    errors: Array.from(new Set(errors)),
    missing_fields: Array.from(new Set(missingFields)),
    safe_fields: outputSafeFields,
    unsafe_fields: Array.from(new Set(unsafeFields)),
    calculator_payload: outputCalculatorPayload,
    requires_human_review: status !== 'passed',
  };
}

export function validateExtractedFields(
  fields: FieldKnowledge[],
  extracted: Record<string, ExtractedFieldWithMeta>,
  overallConfidence: number,
  now = new Date(),
): ParserValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];
  const missingFields: string[] = [];
  const safeFields = new Set<string>();
  const rulesApplied: string[] = [];

  if (overallConfidence < 0.85 && overallConfidence >= 0.6) {
    warnings.push('Document classification confidence requires human review');
  }
  if (overallConfidence < 0.6) {
    errors.push('Document classification confidence is too low');
  }

  for (const fieldKnowledge of fields) {
    const field = fieldKnowledge.field;
    const value = extracted[field.name];
    const fieldErrors: string[] = [];

    for (const rule of fieldKnowledge.rules) {
      rulesApplied.push(rule.name);
      if (rule.logic === 'required' && (value?.normalized_value == null || value.confidence === 0)) {
        fieldErrors.push(rule.failure_message);
        missingFields.push(field.name);
      }
      if (rule.logic.startsWith('percentage:') && value?.normalized_value != null) {
        const percent = Number(value.normalized_value);
        if (!Number.isFinite(percent) || percent < 0 || percent > 100) fieldErrors.push(rule.failure_message);
      }
      if (rule.logic.startsWith('bee_level:') && value?.normalized_value != null) {
        const level = Number(value.normalized_value);
        if (!Number.isInteger(level) || level < 1 || level > 8) fieldErrors.push(rule.failure_message);
      }
      if (rule.logic === 'not_expired' && value?.normalized_value != null) {
        const expiry = new Date(String(value.normalized_value));
        if (Number.isNaN(expiry.getTime())) fieldErrors.push('Date format invalid');
        if (!Number.isNaN(expiry.getTime()) && expiry < new Date(now.toISOString().slice(0, 10))) {
          fieldErrors.push(rule.failure_message);
        }
      }
    }

    if (value && value.normalized_value != null && value.confidence > 0 && value.confidence < PASS_CONFIDENCE) {
      warnings.push(`${field.name} confidence is below pass threshold`);
    }

    if (fieldErrors.length > 0) {
      errors.push(...fieldErrors);
      continue;
    }

    if (value && value.normalized_value != null && value.confidence >= PASS_CONFIDENCE) {
      safeFields.add(field.name);
    }
  }

  return {
    passed: errors.length === 0 && warnings.length === 0,
    warnings,
    errors,
    missing_fields: Array.from(new Set(missingFields)),
    safe_fields: safeFields,
    rules_applied: Array.from(new Set(rulesApplied)),
  };
}
