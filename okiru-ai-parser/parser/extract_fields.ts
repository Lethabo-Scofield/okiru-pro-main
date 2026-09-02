import type { FieldKnowledge } from '../graph/ontology_models.js';
import type { ExtractedFieldOutput, RawExtractionInput } from '../schemas/parser_output.js';
import { normalizeValue } from './normalize.js';
import { checksumForField } from './checksums.js';

// Confidence a value earns when its own checksum/format validates, and the ceiling
// an invalid checksum forces it under (below validate.ts's 0.85 pass threshold, so
// the field is flagged for review rather than silently trusted).
const CHECKSUM_VALID_CONFIDENCE = 0.95;
const CHECKSUM_INVALID_CEILING = 0.4;

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

function findHeuristicValue(fieldName: string, text: string): { rawValue: string; confidence: number; start: number; end: number; pattern: string } | null {
  const candidates: Array<{ pattern: string; regex: RegExp; confidence: number }> = [];

  if (/id_number|identity|sa_id/.test(fieldName)) {
    candidates.push({ pattern: 'sa_id_number', regex: /\b(\d{13})\b/, confidence: 0.88 });
  }
  if (/registration_number|cipc|company_number/.test(fieldName)) {
    candidates.push({ pattern: 'registration_number', regex: /\b(\d{4}\/\d{6}\/\d{2})\b/, confidence: 0.88 });
  }
  if (/vat/.test(fieldName)) {
    candidates.push({ pattern: 'vat_number', regex: /\b(4\d{9})\b/, confidence: 0.86 });
  }
  if (/expiry/.test(fieldName)) {
    candidates.push({
      pattern: 'expiry_date_label',
      regex: /\b(?:Expiry|Expiration|Valid\s+Until|Valid\s+To)(?:\s*Date)?\s*[:\-]?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/i,
      confidence: 0.86,
    });
  } else if (/signed/.test(fieldName)) {
    candidates.push({
      pattern: 'signed_date_label',
      regex: /\b(?:Signed|Signature)\s*Date\s*[:\-]?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/i,
      confidence: 0.86,
    });
  } else if (/issue|issued/.test(fieldName)) {
    candidates.push({
      pattern: 'issue_date_label',
      regex: /\b(?:Issue|Issued)\s*Date\s*[:\-]?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/i,
      confidence: 0.86,
    });
  } else if (/date|appointment|start|end|effective|incorporation|registration/.test(fieldName)) {
    candidates.push({
      pattern: 'date_value',
      regex: /\b(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})\b/,
      confidence: 0.86,
    });
  }
  if (/amount|value|spend|cost|npat|revenue|debt|balance|budget|principal|total|target|rate/.test(fieldName)) {
    candidates.push({ pattern: 'money_or_number', regex: /\b(R\s?\d[\d,\s]*(?:\.\d+)?\s?(?:m|million|k|thousand)?|\d+(?:\.\d+)?%)\b/i, confidence: 0.84 });
  }
  if (/percentage|percent|black_ownership|ownership|margin/.test(fieldName)) {
    candidates.push({ pattern: 'percentage_value', regex: /\b(\d+(?:\.\d+)?%)\b/, confidence: 0.86 });
  }
  if (/status|current_status|outcome/.test(fieldName)) {
    candidates.push({ pattern: 'status_value', regex: /\b(current|expired|active|resigned|valid|invalid|passed|failed|met|not met|none)\b/i, confidence: 0.78 });
  }
  if (/bool|present|confirmed|matches|within|covered|signed|legible|accredited|valid|met|applied|included|excludes|vested/.test(fieldName)) {
    candidates.push({ pattern: 'boolean_signal', regex: /\b(yes|no|true|false|present|absent|confirmed|not confirmed|matches|does not match|valid|invalid)\b/i, confidence: 0.75 });
  }
  if (/name|entity|supplier|beneficiary|shareholder|employee|director|lender|borrower|deponent|author/.test(fieldName)) {
    candidates.push({
      pattern: 'name_label',
      regex: /\b(?:Enterprise Name|Entity Name|Supplier|Company|Beneficiary|Employee|Director|Shareholder|Lender|Borrower|Deponent|Author)\s*[:\-]?\s*([^\n\r,;]+)/i,
      confidence: 0.82,
    });
  }

  for (const candidate of candidates) {
    const match = text.match(candidate.regex);
    if (match?.[1]) {
      const rawValue = match[1].trim().replace(/^[\s,:;\-]+/, '').trim();
      const start = match.index ?? 0;
      return {
        rawValue,
        confidence: candidate.confidence,
        start,
        end: start + match[0].length,
        pattern: candidate.pattern,
      };
    }
  }

  return null;
}

function cleanExtractedRawValue(fieldName: string, rawValue: string): string {
  if (!/name|entity|supplier|beneficiary|shareholder|employee|director|deponent/.test(fieldName)) {
    return rawValue;
  }

  return rawValue
    .split(/\s{2,}|\t|Certificate\s+Number|B[-\s]?BBEE\s+Status|Black\s+Ownership|Black\s+Female|Issue\s+Date|Expiry\s+Date|Empowering\s+Supplier|VAT\s+Number/i)[0]
    .replace(/[.,;:]+$/g, '')
    .trim();
}

export interface ExtractFieldsOptions {
  /**
   * Only accept values the document LABELS (a field's own pattern, or a
   * "Field name: value" line). Skips the name/date/money-shaped heuristics,
   * which will find a "beneficiary" in a lunch menu. Used when the document's
   * type is itself uncertain: an unlabelled guess about an unidentified
   * document is two guesses stacked, and reads as fact once it is a field.
   */
  labelledOnly?: boolean;
}

export function extractFields(
  input: RawExtractionInput,
  fields: FieldKnowledge[],
  options: ExtractFieldsOptions = {},
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
        rawValue = cleanExtractedRawValue(field.name, (match[2] ?? match[1]).trim().replace(/^[\s,:;\-]+/, '').trim());
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
        rawValue = cleanExtractedRawValue(field.name, match[1].trim().replace(/^[\s,:;\-]+/, '').trim());
        confidence = 0.72;
        textSnippet = snippetAround(text, match.index ?? 0, (match.index ?? 0) + match[0].length);
        matchedPatterns.push(field.name);
      }
    }

    if (rawValue == null && !options.labelledOnly) {
      const heuristic = findHeuristicValue(field.name, text);
      if (heuristic) {
        rawValue = cleanExtractedRawValue(field.name, heuristic.rawValue);
        confidence = heuristic.confidence;
        textSnippet = snippetAround(text, heuristic.start, heuristic.end);
        matchedPatterns.push(heuristic.pattern);
      }
    }

    const normalizedValue = normalizeValue(rawValue, field.data_type);
    if (rawValue != null && normalizedValue == null) confidence = Math.min(confidence, 0.45);

    // Checksum gate: if this field is a SA identifier, let its check digit / format
    // confirm or discredit the OCR'd value. Valid → raise confidence; invalid →
    // cap it under the pass threshold so validate.ts routes it to human review.
    if (rawValue != null) {
      const checksum = checksumForField(field.name, rawValue);
      if (checksum) {
        if (checksum.valid) {
          confidence = Math.max(confidence, CHECKSUM_VALID_CONFIDENCE);
          matchedPatterns.push('checksum_valid');
        } else {
          confidence = Math.min(confidence, CHECKSUM_INVALID_CEILING);
          matchedPatterns.push(`checksum_failed:${checksum.reason ?? 'invalid'}`);
        }
      }
    }

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
