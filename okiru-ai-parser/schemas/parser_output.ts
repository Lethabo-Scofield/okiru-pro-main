import { z } from 'zod';
import { SUPPORTED_DOCUMENT_MIME_TYPES } from './document_types.js';

export const rawExtractionInputSchema = z.object({
  file_id: z.string().min(1),
  filename: z.string().min(1),
  mime_type: z.string().min(1).refine((mime) => SUPPORTED_DOCUMENT_MIME_TYPES.has(mime), {
    message: 'Unsupported file type',
  }),
  raw_text: z.string(),
  tables: z.array(z.unknown()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

export const fieldSourceSchema = z.object({
  page: z.number().nullable(),
  table: z.string().nullable(),
  text_snippet: z.string().nullable(),
});

export const extractedFieldSchema = z.object({
  raw_value: z.unknown().nullable(),
  normalized_value: z.unknown().nullable(),
  data_type: z.string(),
  confidence: z.number().min(0).max(1),
  source: fieldSourceSchema,
});

export const parserOutputSchema = z.object({
  file_id: z.string(),
  filename: z.string(),
  document_type: z.string(),
  pillar: z.string(),
  overall_confidence: z.number().min(0).max(1),
  status: z.enum(['passed', 'review_required', 'failed']),
  extracted_fields: z.record(extractedFieldSchema),
  calculator_payload: z.record(z.unknown()),
  validation: z.object({
    passed: z.boolean(),
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
    missing_fields: z.array(z.string()),
  }),
  audit_trail: z.object({
    source_file: z.string(),
    matched_patterns: z.array(z.string()),
    rules_applied: z.array(z.string()),
    graph_version: z.string(),
    requires_human_review: z.boolean(),
    classification_candidates: z.array(z.object({
      document_type: z.string(),
      pillar: z.string(),
      confidence: z.number().min(0).max(1),
      matched_evidence: z.array(z.string()),
      reasons: z.array(z.string()),
    })).default([]),
    classification_reason: z.string().optional(),
  }),
});

export type RawExtractionInput = z.infer<typeof rawExtractionInputSchema>;
export type ExtractedFieldOutput = z.infer<typeof extractedFieldSchema>;
export type ParserOutput = z.infer<typeof parserOutputSchema>;
