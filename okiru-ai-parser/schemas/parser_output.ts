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
  supplier_rows: z.array(z.object({
    supplier_name: z.string().nullable(),
    spend_amount: z.number().nullable(),
    bee_level: z.number().nullable(),
    black_ownership: z.number().nullable(),
    calculator_fields: z.record(z.unknown()),
    status: z.enum(['passed', 'review_required']),
    issues: z.array(z.string()),
  })).default([]),
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
    rejected_calculator_keys: z.array(z.object({
      key: z.string(),
      reason: z.string(),
    })).default([]),
  }),
});

export const caseDocumentSummarySchema = z.object({
  file_id: z.string(),
  filename: z.string(),
  document_type: z.string(),
  status: z.enum(['passed', 'review_required', 'failed']),
  overall_confidence: z.number().min(0).max(1),
  extracted_fields: z.record(extractedFieldSchema),
  calculator_payload: z.record(z.unknown()),
  validation: z.object({
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
    missing_fields: z.array(z.string()),
  }),
});

export const parserCaseOutputSchema = z.object({
  case_id: z.string(),
  status: z.enum(['passed', 'review_required', 'failed']),
  documents_detected: z.array(caseDocumentSummarySchema),
  fields_extracted: z.record(z.record(extractedFieldSchema)),
  calculator_payload: z.record(z.unknown()),
  supplier_rows: z.array(z.object({
    supplier_name: z.string().nullable(),
    spend_amount: z.number().nullable(),
    bee_level: z.number().nullable(),
    black_ownership: z.number().nullable(),
    calculator_fields: z.record(z.unknown()),
    status: z.enum(['passed', 'review_required']),
    issues: z.array(z.string()),
    source_file: z.string(),
  })).default([]),
  missing_required_documents: z.array(z.string()),
  documents_needing_review: z.array(z.object({
    filename: z.string(),
    document_type: z.string(),
    status: z.enum(['passed', 'review_required', 'failed']),
    reasons: z.array(z.string()),
  })),
  audit_trail: z.object({
    document_count: z.number(),
    passed_documents: z.number(),
    review_required_documents: z.number(),
    failed_documents: z.number(),
    source_files: z.array(z.string()),
    notes: z.array(z.string()),
    conflicting_fields: z.array(z.object({
      key: z.string(),
      values: z.array(z.unknown()),
      sources: z.array(z.string()),
    })).default([]),
    document_audits: z.array(z.object({
      filename: z.string(),
      document_type: z.string(),
      matched_patterns: z.array(z.string()),
      classification_reason: z.string().optional(),
      requires_human_review: z.boolean(),
    })),
  }),
});

export type RawExtractionInput = z.infer<typeof rawExtractionInputSchema>;
export type ExtractedFieldOutput = z.infer<typeof extractedFieldSchema>;
export type ParserOutput = z.infer<typeof parserOutputSchema>;
export type ParserCaseOutput = z.infer<typeof parserCaseOutputSchema>;
