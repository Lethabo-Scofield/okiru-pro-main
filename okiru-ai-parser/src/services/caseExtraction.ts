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
}

export async function extractCaseEntities(
  inputs: RawExtractionInput[],
  model: ExtractionModel | null = getExtractionModel(),
): Promise<CaseExtractionResult | null> {
  if (!model || inputs.length === 0) return null;

  const extractions: DocumentExtraction[] = [];
  for (const input of inputs) {
    try {
      extractions.push(...await extractDocument(model, {
        filename: input.filename,
        markdown: input.markdown,
        raw_text: input.raw_text,
      }));
    } catch (err) {
      // One unreadable file must not cost the user the rest of the case they
      // have already paid to extract.
      logger.error('AI extraction failed for file', err as Error, { file: input.filename });
    }
  }

  if (extractions.length === 0) return null;

  const resolved = resolveCaseEntities(extractions, {
    allFiles: inputs.map((input) => input.filename),
  });

  logger.info('Case extraction complete', {
    files: inputs.length,
    documents: resolved.documentsExtracted,
    fields: Object.keys(resolved.fields).length,
    conflicts: resolved.conflicts.length,
  });

  return { ...resolved, model: model.name, extractions };
}
