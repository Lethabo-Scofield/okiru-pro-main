/**
 * Case-level ESG extraction — the layer the ESG upload routes call.
 *
 * The ESG twin of `caseExtraction.ts`, and deliberately thin: everything that
 * does real work is the SAME code the B-BBEE path runs, called with
 * `domain: 'esg'`. Reading files, OCR, chunking, caching, the sweep, grounding,
 * checksums and cross-case conflict resolution are all shared verbatim. What
 * differs is only which matrix supplies the prompts, which menu the classifier
 * chooses from, and which allowlist gates the output.
 *
 * Additive by construction, exactly like the B-BBEE path: with no model
 * configured this returns null and the caller answers with its deterministic
 * result unchanged. A missing API key must never turn a working upload into a
 * failed one.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *   - The workbook SHEET table extractor. Its shape catalogue is the five B-BBEE
 *     scorecard tables (shareholders, employees, learners, suppliers, SED
 *     contributions); ESG registers arrive as documents and are read by the grid
 *     pass inside `extractWithSpec` instead.
 *   - The supplier-LEDGER reader and the B-BBEE financials sheet reader, for the
 *     same reason.
 *   - The entity-name fallback and the auditor-validation pass, whose prompts
 *     name B-BBEE explicitly. Running them here would put the wrong question to
 *     the model; ESG entity identity comes from the FINANCIAL specs.
 */
import { createLogger } from '../logger.js';
import type { RawExtractionInput } from '../../schemas/document_types.js';
import {
  extractDocument,
  type DocumentExtraction,
  type ExtractionModel,
} from './aiExtraction.js';
import { getExtractionModel, duplicateWorkbookException, type ResolveProgress } from './caseExtraction.js';
import { resolveCaseEntities, type CaseEntities } from './entityResolution.js';
import { classifyDocument, routingElement } from './documentClassification.js';
import { concurrentMap, documentConcurrency } from './concurrentMap.js';
import { elementFromHint } from './specRetrieval.js';
import type { EsgElement } from '../../schemas/esg_document_matrix.js';
import { reviewCase } from './caseReview.js';
import {
  esgFieldElementIndex,
  mapEsgEntitiesToCalculator,
  mapEsgEntitiesToCalculatorWithSemantics,
  unfilledEsgCalculatorKeys,
  type EsgCalculatorMappingResult,
} from './esgEntityCalculatorMapping.js';

const logger = createLogger('EsgCaseExtraction');

export interface EsgCaseExtractionResult extends CaseEntities {
  model: string;
  /** Marks the payload's vocabulary, so a client never mixes the two domains. */
  domain: 'esg';
  /** Per-document detail, so a value can be traced back to the prompt that found it. */
  extractions: DocumentExtraction[];
  /**
   * The extracted evidence expressed as ESG calculator inputs. Scalars in
   * `payload`; register rows in `rows`, one object per source row.
   */
  calculator: EsgCalculatorMappingResult;
}

export async function extractEsgCaseEntities(
  inputs: RawExtractionInput[],
  model: ExtractionModel | null = getExtractionModel(),
  onProgress?: (p: ResolveProgress) => void,
): Promise<EsgCaseExtractionResult | null> {
  if (!model || inputs.length === 0) return null;
  let done = 0;
  const total = inputs.length;

  // Documents are read in PARALLEL, bounded — the same shared helper, the same
  // input-order guarantee, because ESG conflicts also resolve first-document-wins
  // and a race that reordered documents would move a published number between
  // runs on identical evidence.
  const settled = await concurrentMap(inputs, documentConcurrency(), async (input) => {
    const sheetName = typeof input.metadata?.sheet_name === 'string' ? input.metadata.sheet_name : undefined;

    // Pass A — model classification against the ESG menu. Paid only for
    // ANONYMOUS documents, exactly as on the B-BBEE side: a named sheet already
    // states its element for free. Fail-safe: null → BM25 routing stands.
    //
    // The ESG menu tells the model to report LOW confidence on a combined
    // municipal account, which drops the override — so a water-and-electricity
    // statement is never narrowed to one element here.
    const classification = !sheetName
      ? await classifyDocument(model, {
          filename: input.filename,
          markdown: input.markdown,
          raw_text: input.raw_text,
        }, { domain: 'esg' })
      : null;
    const elementOverride = routingElement(classification) ?? undefined;

    const results = await extractDocument(model, {
      filename: input.filename,
      markdown: input.markdown,
      raw_text: input.raw_text,
      elementHint: sheetName,
    }, { elementOverride, domain: 'esg' });

    done += 1;
    onProgress?.({ done, total, fileName: input.filename });
    return results;
  });

  const extractions: DocumentExtraction[] = [];
  for (const result of settled) {
    if (result.status === 'fulfilled' && result.value) {
      extractions.push(...result.value);
    } else if (result.status === 'rejected') {
      // One unreadable file must not cost the user the rest of the case they
      // have already paid to extract.
      logger.error('ESG extraction failed for file', result.reason as Error, {
        file: inputs[result.index]?.filename,
      });
    }
  }

  // Two revisions of the same gathering workbook in one pack is as damaging to
  // an ESG number as to a B-BBEE one, and the detection is structural rather
  // than domain-specific, so it is the same function.
  const duplicateWorkbook = duplicateWorkbookException(inputs);
  if (duplicateWorkbook) {
    logger.warn('Multiple versions of the same workbook in one ESG pack', { detail: duplicateWorkbook });
    extractions.push({
      documentId: 'esg_case__duplicate_workbook',
      documentName: 'Uploaded document set',
      element: 'FINANCIAL',
      sourceFile: inputs[0]?.filename ?? '',
      // Values-free: it can never move a number, only explain one.
      values: [],
      missingFields: [],
      unexpectedFields: [],
      exceptions: [duplicateWorkbook],
    });
  }

  if (extractions.length === 0) return null;

  const resolved = resolveCaseEntities(extractions, {
    allFiles: inputs.map((input) => input.filename),
  });

  // Declared table first, one semantic pass over what it did not cover, then
  // the analyst's whole-case read — the same intelligence the B-BBEE path has,
  // because ESG is not the lesser product.
  const calculator = await mapEsgEntitiesToCalculatorWithSemantics(
    resolved,
    esgFieldElementIndex(extractions),
    model,
  );

  const reviewFindings = await reviewCase(model, {
    payloadEntries: calculator.entries.map((entry) => ({
      key: entry.key, value: entry.value, sourceFiles: entry.sourceFiles,
    })),
    unmapped: calculator.unmapped,
    needsReview: calculator.needsReview.map((item) => ({ field: item.field, values: item.values })),
    unfilledKeys: unfilledEsgCalculatorKeys(calculator.payload),
    files: inputs.map((input) => input.filename),
  }, { domain: 'esg' });
  for (const finding of reviewFindings) {
    extractions[0]?.exceptions.push(
      `${finding.severity === 'error' ? 'Analyst review' : 'Analyst note'}: ${finding.finding}`
      + (finding.fix ? ` Fix: ${finding.fix}` : ''),
    );
  }

  logger.info('ESG case extraction complete', {
    files: inputs.length,
    documents: resolved.documentsExtracted,
    fields: Object.keys(resolved.fields).length,
    conflicts: resolved.conflicts.length,
    calculatorKeys: Object.keys(calculator.payload).length,
    registerRows: calculator.rows.length,
    heldForReview: calculator.needsReview.length,
  });

  return { ...resolved, model: model.name, domain: 'esg', extractions, calculator };
}

/**
 * The ESG element a workbook sheet name states, when it states one.
 *
 * Exposed so the routes can report what a pack looked like before any model
 * call is made — the free structure scan needs this and nothing else.
 */
export function esgElementForSheet(sheetName: string | undefined): EsgElement | null {
  return elementFromHint(sheetName, 'esg');
}
