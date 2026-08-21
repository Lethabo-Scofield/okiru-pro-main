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
import { extractEntityNameFallback } from './entityNameExtraction.js';
import { classifyDocument, routingElement } from './documentClassification.js';
import { validateCase, type CaseValidation } from './auditorValidation.js';
import { concurrentMap, documentConcurrency } from './concurrentMap.js';
import { extractSheetTable } from './sheetTableExtraction.js';
import { extractLedgerTable } from './sheetLedgerExtraction.js';
import { extractSheetFinancials, isFinancialsSheet } from './sheetFinancialsExtraction.js';
import { elementFromHint } from './specRetrieval.js';
import {
  fieldElementIndex,
  mapEntitiesToCalculator,
  type CalculatorMappingResult,
} from './entityCalculatorMapping.js';

const logger = createLogger('CaseExtraction');

/** Auditor validation is advisory and costs a model call per document — opt-in. */
function auditorValidationEnabled(): boolean {
  return process.env.PARSER_AUDITOR_VALIDATION === 'true';
}

/**
 * The workbook split stores each sheet's parsed rows as
 * `tables: [{ sheetName, rows }]`. `tables` is loosely typed at the schema
 * boundary, so pull the rows out defensively — anything unshaped returns
 * undefined and the table extractor falls back to its model read.
 */
function structuredRows(tables: unknown[] | undefined): Array<Record<string, unknown>> | undefined {
  const first = tables?.[0];
  if (!first || typeof first !== 'object') return undefined;
  const rows = (first as { rows?: unknown }).rows;
  if (!Array.isArray(rows) || rows.length === 0) return undefined;
  if (!rows.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row))) return undefined;
  return rows as Array<Record<string, unknown>>;
}

/**
 * Two versions of the same gathering workbook in one pack.
 *
 * Uploading "Workbook.xlsx" and "Workbook v2.xlsx" together is common and looks
 * harmless, but both are read in full and their sheets contest every field they
 * share. Conflicts resolve first-document-wins, so which VERSION supplies a
 * value depends on input order — and the two versions rarely agree, because the
 * later one usually exists precisely to correct the earlier. The user sees a
 * score that moves for reasons they cannot observe.
 *
 * Detected structurally: the same SHEET name arriving from more than one source
 * workbook. Reported, never auto-resolved — which revision is authoritative is
 * the client's call, not ours.
 */
export function duplicateWorkbookException(inputs: RawExtractionInput[]): string | null {
  const workbooksBySheet = new Map<string, Set<string>>();
  for (const input of inputs) {
    const name = input.filename ?? '';
    const marker = name.indexOf('›');
    if (marker < 0) continue;
    const workbook = name.slice(0, marker).trim();
    const sheet = name.slice(marker + 1).trim().toLowerCase();
    if (!workbook || !sheet) continue;
    let books = workbooksBySheet.get(sheet);
    if (!books) {
      books = new Set<string>();
      workbooksBySheet.set(sheet, books);
    }
    books.add(workbook);
  }

  const contested = [...workbooksBySheet.entries()].filter(([, books]) => books.size > 1);
  if (contested.length === 0) return null;

  const workbooks = [...new Set(contested.flatMap(([, books]) => [...books]))].sort();
  const sheets = contested.map(([sheet]) => sheet).sort();
  return `${workbooks.length} versions of the same gathering workbook were uploaded and BOTH were read: `
    + `${workbooks.join(' · ')}. ${sheets.length} sheet(s) appear in more than one of them (${sheets.join(', ')}), `
    + 'and where the versions disagree the value is taken from whichever file is read first. '
    + 'Remove the outdated version and re-upload so the score is stable and traceable to one source.';
}

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

export interface ResolveProgress {
  /** Documents whose AI read has completed. */
  done: number;
  /** Total documents being read. */
  total: number;
  /** The document that just completed, when known. */
  fileName?: string;
}

export async function extractCaseEntities(
  inputs: RawExtractionInput[],
  model: ExtractionModel | null = getExtractionModel(),
  onProgress?: (p: ResolveProgress) => void,
): Promise<CaseExtractionResult | null> {
  if (!model || inputs.length === 0) return null;
  let done = 0;
  const total = inputs.length;

  // Documents are read in PARALLEL, bounded. Each already fans its chunks out
  // internally; this fans the documents out too, so a 26-file pack is not as
  // slow as the sum of its files. Results are collected in INPUT order because
  // the reconciler below resolves conflicts by "first document wins" — a race
  // that reordered documents would move a score between runs on identical
  // evidence.
  const settled = await concurrentMap(inputs, documentConcurrency(), async (input) => {
    const sheetName = typeof input.metadata?.sheet_name === 'string' ? input.metadata.sheet_name : undefined;

    // Pass A — model classification. A named workbook sheet already states its
    // element authoritatively and for free, so this is paid ONLY for ANONYMOUS
    // documents (a scanned certificate, an AFS PDF, a share register with no
    // sheet name) — exactly where keyword routing was weakest. Its element routes
    // spec selection by MEANING, and FINANCIALS triggers the financials reader on
    // a document no sheet name announces. Fail-safe: null → BM25 routing stands.
    const classification = !sheetName
      ? await classifyDocument(model, { filename: input.filename, markdown: input.markdown, raw_text: input.raw_text })
      : null;
    const elementOverride = routingElement(classification) ?? undefined;

    // Matrix-spec extraction (single evidence records) AND, for a workbook sheet
    // whose element is clear from its name, TABLE extraction (every row). The
    // matrix specs cannot emit a table of suppliers/beneficiaries; this does,
    // which is what carries the Procurement and SED points.
    const [specResults, tableResult, financialsResult] = await Promise.all([
      extractDocument(model, {
        filename: input.filename,
        markdown: input.markdown,
        raw_text: input.raw_text,
        elementHint: sheetName,
      }, { elementOverride }),
      (async () => {
        const rows = structuredRows(input.tables);

        // A supplier LEDGER is read deterministically and needs no model call:
        // it has no supplier column (the account is named in the filename) and
        // its money is split across debit/credit columns that mean opposite
        // things. Asking a model to "extract the supplier table" from one
        // yields nothing, which is what happened to every ledger until now.
        if (rows) {
          const ledger = extractLedgerTable(rows, input.filename);
          if (ledger) return ledger;
        }

        const element = sheetName ? elementFromHint(sheetName) : null;
        if (!element) return null;
        return extractSheetTable(model, element, {
          filename: input.filename,
          markdown: input.markdown,
          raw_text: input.raw_text,
          // The parsed rows from the workbook split, when present — the
          // deterministic table read consumes these so the model never has to
          // re-type rows the code already parsed.
          rows,
        });
      })(),
      // Entity-level revenue + NPAT off a Finance / summary sheet OR a
      // standalone financial document (an AFS / income-statement PDF) — the two
      // labelled figures the NPAT-based targets need but no matrix spec reliably
      // extracts here (the AFS spec pulls cost-of-sales components, not these).
      (async () => {
        const looksFinancial = isFinancialsSheet(sheetName)
          || (!sheetName && (isFinancialsSheet(input.filename) || classification?.element === 'FINANCIALS'));
        if (!looksFinancial) return null;
        return extractSheetFinancials(model, {
          filename: input.filename,
          markdown: input.markdown,
          raw_text: input.raw_text,
          // Parsed rows let the labelled TMPS be read deterministically — the
          // sheet's own stated total, never a computed sum.
          rows: structuredRows(input.tables),
        });
      })(),
    ]);

    const results = [...specResults];
    if (tableResult) results.push(tableResult);
    if (financialsResult) results.push(financialsResult);
    // Sub-progress: the resolve phase is the multi-minute, rate-limited part of
    // a paid run. Reporting each document as its AI read lands keeps the user on
    // the page (and makes the "reconciling your company profile" step visible).
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
      logger.error('AI extraction failed for file', result.reason as Error, {
        file: inputs[result.index]?.filename,
      });
    }
  }

  // Surfaced as a values-free extraction: it cannot move a score, only explain
  // why one moved. Added before resolution so it travels with the case.
  const duplicateWorkbook = duplicateWorkbookException(inputs);
  if (duplicateWorkbook) {
    logger.warn('Multiple versions of the same workbook in one pack', { detail: duplicateWorkbook });
    extractions.push({
      documentId: 'case__duplicate_workbook',
      documentName: 'Uploaded document set',
      element: 'OWNERSHIP',
      sourceFile: inputs[0]?.filename ?? '',
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

  // Fallback name: only when no document authoritatively named the measured
  // entity (no CIPC / share register / affidavit). Reads it off a profile,
  // letterhead or workbook header instead of leaving it blank. Never overrides a
  // resolved name — pure gap-fill, so it cannot pollute a good registration name.
  const resolvedName = String(resolved.fields.entity_name?.value ?? '').trim();
  if (!resolvedName) {
    const fallback = await extractEntityNameFallback(
      model,
      inputs.map((input) => ({ filename: input.filename, markdown: input.markdown, raw_text: input.raw_text })),
    );
    if (fallback) {
      resolved.fields.entity_name = {
        field: 'entity_name',
        value: fallback.name,
        sources: [fallback.sourceFile],
        agreementCount: 1,
        conflicted: false,
        alternatives: [],
      };
    }
  }

  const calculator = mapEntitiesToCalculator(resolved, fieldElementIndex(extractions));

  // Would this evidence survive verification? Extraction says what a document
  // contains; the auditor tests say whether it counts. Advisory only — it never
  // edits a value or changes the payload above.
  //
  // It is a model call PER extracted document, which doubles a large case's
  // latency, so it is OPT-IN (PARSER_AUDITOR_VALIDATION=true). The score does
  // not depend on it; it is a review aid. Off by default keeps a 20-document
  // pack inside the request budget.
  const validation = auditorValidationEnabled()
    ? await validateCase(
        extractions.map((extraction) => ({
          documentId: extraction.documentId,
          sourceFile: extraction.sourceFile,
          values: extraction.values,
        })),
        new Map(inputs.map((input) => [input.filename, input.markdown || input.raw_text || ''])),
        model,
      )
    : { documents: [], failures: [], unresolved: [] };

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
