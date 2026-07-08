import type { FieldKnowledge } from '../graph/ontology_models.js';
import type { CalculatorPayload } from '../schemas/calculator_payload.js';
import { admitCalculatorEntry } from '../schemas/calculator_allowlist.js';
import type { ExtractedFieldWithMeta } from './extract_fields.js';

export interface CalculatorMappingResult {
  payload: CalculatorPayload;
  rejected: Array<{ key: string; reason: string }>;
}

/**
 * Builds the calculator payload from validated safe fields.
 *
 * Every candidate key is checked against the strict calculator allowlist and
 * its expected runtime type. Ontology data (including Excel-derived fields for
 * non-canonical documents) can never introduce an arbitrary calculator path:
 * unknown keys and type-mismatched values are dropped and reported.
 */
export function mapCalculatorPayload(
  fields: FieldKnowledge[],
  extracted: Record<string, ExtractedFieldWithMeta>,
  safeFields: Set<string>,
): CalculatorMappingResult {
  const payload: CalculatorPayload = {};
  const rejected: Array<{ key: string; reason: string }> = [];

  for (const fieldKnowledge of fields) {
    const field = fieldKnowledge.field;
    const value = extracted[field.name];
    if (!safeFields.has(field.name)) continue;
    if (!value || value.normalized_value == null) continue;

    const requirement = fieldKnowledge.calculator_requirements[0];
    const key = requirement?.key || field.calculator_key;
    if (!key) continue;

    const decision = admitCalculatorEntry(key, value.normalized_value);
    if (!decision.accepted) {
      rejected.push({ key, reason: decision.reason ?? 'rejected' });
      continue;
    }

    payload[key] = value.normalized_value;
  }

  return { payload, rejected };
}

/** Back-compat helper: returns just the payload. Prefer mapCalculatorPayload. */
export function buildCalculatorPayload(
  fields: FieldKnowledge[],
  extracted: Record<string, ExtractedFieldWithMeta>,
  safeFields: Set<string>,
): CalculatorPayload {
  return mapCalculatorPayload(fields, extracted, safeFields).payload;
}
