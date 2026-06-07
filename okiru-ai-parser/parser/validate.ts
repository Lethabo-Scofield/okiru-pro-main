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
