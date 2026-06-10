import type { FieldKnowledge } from '../graph/ontology_models.js';
import type { CalculatorPayload } from '../schemas/calculator_payload.js';
import type { ExtractedFieldWithMeta } from './extract_fields.js';

export function buildCalculatorPayload(
  fields: FieldKnowledge[],
  extracted: Record<string, ExtractedFieldWithMeta>,
  safeFields: Set<string>,
): CalculatorPayload {
  const payload: CalculatorPayload = {};

  for (const fieldKnowledge of fields) {
    const field = fieldKnowledge.field;
    const value = extracted[field.name];
    if (!safeFields.has(field.name)) continue;
    if (!value || value.normalized_value == null) continue;

    const requirement = fieldKnowledge.calculator_requirements[0];
    const key = requirement?.key || field.calculator_key;
    if (!key) continue;

    payload[key] = value.normalized_value;
  }

  return payload;
}
