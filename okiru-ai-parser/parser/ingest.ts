import type { RawExtractionInput } from '../schemas/parser_output.js';
import { rawExtractionInputSchema } from '../schemas/parser_output.js';

export function parseRawExtractionInput(input: unknown): RawExtractionInput {
  const parsed = rawExtractionInputSchema.parse(input);
  if (!parsed.raw_text.trim() && parsed.tables.length === 0) {
    throw new Error('Extraction result is empty; parser requires raw text or tables from the existing extraction phase.');
  }
  return parsed;
}
