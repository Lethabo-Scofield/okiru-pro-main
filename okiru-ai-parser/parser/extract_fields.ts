import type { FieldKnowledge } from '../graph/ontology_models.js';
import type { ExtractedFieldOutput, RawExtractionInput } from '../schemas/parser_output.js';
import { normalizeValue } from './normalize.js';

export interface ExtractedFieldWithMeta extends ExtractedFieldOutput {
  matched_patterns: string[];
}

function snippetAround(text: string, start: number, end: number): string {
  return text.slice(Math.max(0, start - 60), Math.min(text.length, end + 80)).replace(/\s+/g, ' ').trim();
}

function fallbackRegexForField(name: string): RegExp {
  const label = name.replace(/_/g, '\\s+');
  return new RegExp(`${label}\\s*[:\\-]?\\s*([^\\n\\r]+)`, 'i');
}

export function extractFields(
  input: RawExtractionInput,
  fields: FieldKnowledge[],
): Record<string, ExtractedFieldWithMeta> {
  const output: Record<string, ExtractedFieldWithMeta> = {};
  const text = input.raw_text || '';

  for (const fieldKnowledge of fields) {
    const { field, patterns } = fieldKnowledge;
    let rawValue: unknown = null;
    let confidence = 0;
    let textSnippet: string | null = null;
    const matchedPatterns: string[] = [];

    for (const pattern of patterns) {
      if (!pattern.regex) continue;
      const regex = new RegExp(pattern.regex, 'i');
      const match = text.match(regex);
      if (match?.[1] || match?.[2]) {
        rawValue = (match[2] ?? match[1]).trim();
        confidence = 0.9;
        textSnippet = snippetAround(text, match.index ?? 0, (match.index ?? 0) + match[0].length);
        matchedPatterns.push(pattern.name);
        break;
      }
    }

    if (rawValue == null) {
      const regex = fallbackRegexForField(field.name);
      const match = text.match(regex);
      if (match?.[1]) {
        rawValue = match[1].trim();
        confidence = 0.72;
        textSnippet = snippetAround(text, match.index ?? 0, (match.index ?? 0) + match[0].length);
        matchedPatterns.push(field.name);
      }
    }

    const normalizedValue = normalizeValue(rawValue, field.data_type);
    if (rawValue != null && normalizedValue == null) confidence = Math.min(confidence, 0.45);

    output[field.name] = {
      raw_value: rawValue,
      normalized_value: normalizedValue,
      data_type: field.data_type,
      confidence,
      source: {
        page: rawValue == null ? null : 1,
        table: null,
        text_snippet: textSnippet,
      },
      matched_patterns: matchedPatterns,
    };
  }

  return output;
}
