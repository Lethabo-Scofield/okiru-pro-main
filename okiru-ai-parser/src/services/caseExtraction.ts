/**
 * Case-level AI extraction — the layer the upload route calls.
 *
 * Ties the two halves together: run every file against every document spec whose
 * evidence it contains, then resolve the results into one answer for the case.
 *
 * Additive by construction. If no model is configured, or every call fails, this
 * returns null and the caller returns its deterministic result unchanged — a
 * missing API key must never turn a working upload into a failed one.
 */
import { createLogger } from '../logger.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';
import {
  createAzureExtractionModel,
  extractDocument,
  type DocumentExtraction,
  type ExtractionModel,
} from './aiExtraction.js';
import { resolveCaseEntities, type CaseEntities } from './entityResolution.js';
import { validateCase, type CaseValidation } from './auditorValidation.js';
import { concurrentMap, documentConcurrency } from './concurrentMap.js';
import {
  fieldElementIndex,
  mapEntitiesToCalculator,
  type CalculatorMappingResult,
} from './entityCalculatorMapping.js';

const logger = createLogger('CaseExtraction');

/** Cached so a case does not rebuild the client per file. */
let cachedModel: ExtractionModel | null | undefined;

export function getExtractionModel(): ExtractionModel | null {
  if (cachedModel === undefined) cachedModel = createAzureExtractionModel();
  return cachedModel;
}

/** Test seam. */
export function setExtractionModel(model: ExtractionModel | null): void {
  cachedModel = model;
}

export interface CaseExtractionResult extends CaseEntities {
  model: string;
  /** Per-document detail, so a value can be traced back to the prompt that found it. */
  extractions: DocumentExtraction[];
  /**
   * The extracted evidence expressed as calculator inputs — this is the part
   * that can actually move a score. Contested and unmapped fields are excluded
   * from `payload` and reported alongside it.
   */
  calculator: CalculatorMappingResult;
  /**
   * The expert's auditor tests, run against the evidence. Advisory: it flags
   * documents that would not survive verification, and never changes scoring.
   */
  validation: CaseValidation;
}

export async function extractCaseEntities(
  inputs: RawExtractionInput[],
  model: ExtractionModel | null = getExtractionModel(),
): Promise<CaseExtractionResult | null> {
  if (!model || inputs.length === 0) return null;

  // Documents are read in PARALLEL, bounded. Each already fans its chunks out
  // internally; this fans the documents out too, so a 26-file pack is not as
  // slow as the sum of its files. Results are collected in INPUT order because
  // the reconciler below resolves conflicts by "first document wins" — a race
  // that reordered documents would move a score between runs on identical
  // evidence.
  const settled = await concurrentMap(inputs, documentConcurrency(), (input) =>
    extractDocument(model, {
      filename: input.filename,
      markdown: input.markdown,
      raw_text: input.raw_text,
      // The sheet name (from the per-sheet split) is the strongest single signal
      // of which element a workbook document serves — "Ownership", "Preferential
      // Procurement", "Social Development". Retrieval boosts that element's specs.
      elementHint: typeof input.metadata?.sheet_name === 'string' ? input.metadata.sheet_name : undefined,
    }));

  const extractions: DocumentExtraction[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) {
      extractions.push(...result.value);
    } else if (result.status === 'rejected') {
      // One unreadable file must not cost the user the rest of the case they
      // have already paid to extract.
      logger.error('AI extraction failed for file', result.reason as Error, {
        file: inputs[result.index]?.filename,
      });
    }
  }

  if (extractions.length === 0) return null;

  const resolved = resolveCaseEntities(extractions, {
    allFiles: inputs.map((input) => input.filename),
  });

  const calculator = mapEntitiesToCalculator(resolved, fieldElementIndex(extractions));

  // Would this evidence survive verification? Extraction says what a document
  // contains; the auditor tests say whether it counts. A certificate that
  // expired last month extracts perfectly and is still worthless. Advisory
  // only — it never edits a value or changes the payload above.
  const validation = await validateCase(
    extractions.map((extraction) => ({
      documentId: extraction.documentId,
      sourceFile: extraction.sourceFile,
      values: extraction.values,
    })),
    new Map(inputs.map((input) => [input.filename, input.markdown || input.raw_text || ''])),
    model,
  );

  logger.info('Case extraction complete', {
    files: inputs.length,
    documents: resolved.documentsExtracted,
    fields: Object.keys(resolved.fields).length,
    conflicts: resolved.conflicts.length,
    calculatorKeys: Object.keys(calculator.payload).length,
    heldForReview: calculator.needsReview.length,
  });

  return { ...resolved, model: model.name, extractions, calculator, validation };
}
