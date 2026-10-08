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
import { isTableGrid, tableGridsToRecords } from '../../schemas/table_grid.js';
import {
  createAzureExtractionModel,
  extractDocument,
  isSheetName,
  type DocumentExtraction,
  type ExtractionModel,
} from './aiExtraction.js';
import { resolveCaseEntities, type CaseEntities } from './entityResolution.js';
import { extractEntityNameFallback } from './entityNameExtraction.js';
import { classifyDocument, routingElement, specForSkill } from './documentClassification.js';
import { validateCase, type CaseValidation } from './auditorValidation.js';
import { concurrentMap, documentConcurrency } from './concurrentMap.js';
import { extractSheetTable } from './sheetTableExtraction.js';
import { extractLedgerTable } from './sheetLedgerExtraction.js';
import { extractSheetFinancials, isFinancialsSheet } from './sheetFinancialsExtraction.js';
import {
  SHEET_INSTRUCTIONS_DOCUMENT_ID,
  instructionsExtraction,
  structuredInstructions,
} from './sheetInstructionsExtraction.js';
import { deriveForRecord, periodEndingOn, type MeasurementPeriod } from './skillDerivations.js';
import { elementFromHint } from './specRetrieval.js';
import {
  fieldElementIndex,
  mapEntitiesToCalculator,
  mapEntitiesToCalculatorWithSemantics,
  unfilledCalculatorKeys,
  type CalculatorMappingResult,
} from './entityCalculatorMapping.js';
import { excerptAround, explainImplausibleFigure, payloadInvariantFindings } from './payloadPlausibility.js';
import { reviewCase } from './caseReview.js';
import { agentCasePass, agentPassForDocument, type AgentCaseContext } from './agentExtraction.js';

const logger = createLogger('CaseExtraction');

/** Auditor validation is advisory and costs a model call per document — opt-in. */
function auditorValidationEnabled(): boolean {
  return process.env.PARSER_AUDITOR_VALIDATION === 'true';
}

/**
 * Header-keyed rows for the deterministic table readers (ledger, financials,
 * sheet tables). Two producers:
 *
 *  - The workbook split stores each sheet's parsed rows as
 *    `tables: [{ sheetName, rows }]`, rows already header-keyed.
 *  - A scan read by Document Intelligence stores cell grids
 *    (schemas/table_grid.ts). Their header is the row(s) the reader tagged
 *    `columnHeader`, and a table split across pages is joined back together
 *    before it is read, so a three-page scanned ledger is summed in full.
 *
 * `tables` is loosely typed at the schema boundary, so anything unshaped
 * returns undefined and the extractor falls back to its model read.
 */
export function structuredRows(tables: unknown[] | undefined): Array<Record<string, unknown>> | undefined {
  const first = tables?.[0];
  if (!first || typeof first !== 'object') return undefined;

  const grids = (tables ?? []).filter(isTableGrid);
  if (grids.length > 0) return tableGridsToRecords(grids)?.records;

  const rows = (first as { rows?: unknown }).rows;
  if (!Array.isArray(rows) || rows.length === 0) return undefined;
  if (!rows.every((row) => row !== null && typeof row === 'object' && !Array.isArray(row))) return undefined;
  return rows as Array<Record<string, unknown>>;
}

/** The sheet's named single cells (`TMPS_Inc` → value), when the split recorded any. */
function structuredNamedCells(tables: unknown[] | undefined): Record<string, unknown> | undefined {
  const first = tables?.[0];
  if (!first || typeof first !== 'object') return undefined;
  const named = (first as { namedCells?: unknown }).namedCells;
  if (!named || typeof named !== 'object' || Array.isArray(named)) return undefined;
  return named as Record<string, unknown>;
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

/**
 * The types that state the MEASURED ENTITY's own year end: its financial
 * statements or management accounts (under whichever element's spec they were
 * read — the AFS is read under ESD, Ownership, SED and Skills specs) and the
 * workbook's Finance sheet. Never a certificate: a supplier's B-BBEE
 * certificate prints the SUPPLIER's year end, and an ESD or SED document is
 * about someone else.
 */
const OWN_FINANCIALS_TYPE = /financial_statements|management_accounts|(?:^|_)afs(?:_|$)/i;
/**
 * Financial statements that belong to someone else: a management company's or
 * an ownership scheme's, a beneficiary's, a supplier's. Their year end is not
 * the measured entity's.
 */
const THIRD_PARTY_FINANCIALS = /management_company|(?:^|_)scheme(?:_|$)|beneficiar|supplier|recipient/i;

/** Whether an extraction can state the measured entity's own financial year end. */
export function statesOwnYearEnd(extraction: DocumentExtraction): boolean {
  const id = extraction.documentId;
  if (id === SHEET_INSTRUCTIONS_DOCUMENT_ID || id === 'sheet_financials') return true;
  if (/certificate|affidavit/i.test(id)) return false;
  if (THIRD_PARTY_FINANCIALS.test(id)) return false;
  return OWN_FINANCIALS_TYPE.test(id);
}

/**
 * The measurement period the case's documents state: the year end on the
 * workbook's Instructions sheet first (the client's own declaration), then the
 * first of the measured entity's own financial documents that prints a full
 * year-end date (statesOwnYearEnd). Null when none does — and then nothing
 * period-dependent is derived.
 */
export function casePeriod(extractions: DocumentExtraction[]): MeasurementPeriod | null {
  const ordered = [
    ...extractions.filter((e) => e.documentId === SHEET_INSTRUCTIONS_DOCUMENT_ID),
    ...extractions.filter((e) => e.documentId !== SHEET_INSTRUCTIONS_DOCUMENT_ID && statesOwnYearEnd(e)),
  ];
  for (const extraction of ordered) {
    for (const value of extraction.values) {
      if (value.field !== 'financial_year_end') continue;
      const period = periodEndingOn(value.value);
      if (period) return period;
    }
  }
  return null;
}

/**
 * Add each document's derived figures beside its printed ones (never over a
 * value the document printed), each marked `source.method: 'derived'` with what
 * it came from, and the derivation notes as exceptions a reviewer sees.
 */
export function addSkillDerivations(extractions: DocumentExtraction[]): void {
  const period = casePeriod(extractions);
  for (const extraction of extractions) {
    if (extraction.error) continue;
    // The skills read standalone documents, never workbook sheets (their rows
    // are a template's fill-down, not a report's): nothing is derived from one.
    if (isSheetName(extraction.sourceFile) || extraction.documentId.startsWith('sheet_')) continue;
    const record: Record<string, unknown> = {};
    for (const value of extraction.values) if (!(value.field in record)) record[value.field] = value.value;
    const result = deriveForRecord(record, period);
    if (!result) continue;
    for (const [field, value] of Object.entries(result.values)) {
      const basis = result.derived[field];
      if (!basis || value === null || (Array.isArray(value) && value.length === 0) || field in record) continue;
      extraction.values.push({
        field,
        value,
        sourceFile: extraction.sourceFile,
        sourceDocumentId: extraction.documentId,
        source: { method: 'derived', quote: basis },
      });
    }
    for (const note of result.notes) extraction.exceptions.push(`Derived figures: ${note}`);
  }
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

export interface CaseExtractionOptions {
  /**
   * The agent-loop pass (agentExtraction.ts). Runs only when this is given AND
   * PARSER_AGENT_EXTRACTION (or `agent.mode`) is hard/all — the streaming case
   * route passes it; the plain JSON route does not (it times out at the proxy).
   */
  agent?: AgentCaseContext;
}

export async function extractCaseEntities(
  inputs: RawExtractionInput[],
  model: ExtractionModel | null = getExtractionModel(),
  onProgress?: (p: ResolveProgress) => void,
  options: CaseExtractionOptions = {},
): Promise<CaseExtractionResult | null> {
  if (!model || inputs.length === 0) return null;
  let done = 0;
  const total = inputs.length;
  const agentPass = agentCasePass(model, options.agent);

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
    // Pass A named the document's type from the skills menu (2.9c): read it
    // with that type's spec, not with whatever keyword retrieval ranks first —
    // retrieval read a donation's proof of payment as an ESD invoice.
    const skillSpec = specForSkill(classification);

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
      }, skillSpec ? { specIds: [skillSpec.id] } : { elementOverride }),
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
          // The workbook's defined names on this sheet: the TMPS inclusions
          // total is captioned only by its name (TMPS_Inc), not on its row.
          namedCells: structuredNamedCells(input.tables),
        });
      })(),
    ]);

    let results = [...specResults];
    if (tableResult) results.push(tableResult);
    if (financialsResult) results.push(financialsResult);
    // The workbook's Instructions profile (sector, year end, measured entity,
    // Codes), carried by its first sheet: read off the cells, never a model.
    const instructions = structuredInstructions(input.tables);
    if (instructions) {
      const workbookFile = typeof input.metadata?.parent_file === 'string' ? input.metadata.parent_file : input.filename;
      const profile = instructionsExtraction(instructions, workbookFile);
      if (profile) results.push(profile);
    }
    // Agent loop (off by default): a cited second read of a hard document.
    // It only fills gaps; disagreements become exceptions; a failure returns
    // the first-pass results untouched.
    if (agentPass) results = await agentPassForDocument(model, input, results, agentPass);
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

  // The figures the skills forbid the model to compute (EMP201 totals and the
  // months filed, SED payments inside the period, a ledger's own total, the
  // payroll headcount), worked out here and labelled derived.
  addSkillDerivations(extractions);

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

  // Declared mappings first, then one semantic pass over whatever they did not
  // cover — a field the table never anticipated reaches its pillar instead of
  // being reported as read-but-unused. Same coercion, same allowlist.
  const calculator = await mapEntitiesToCalculatorWithSemantics(
    resolved,
    fieldElementIndex(extractions),
    model,
  );

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

  // ── PLAUSIBILITY ────────────────────────────────────────────────────────
  // Grounding checks each value against its own document; nothing above checks
  // the values against EACH OTHER. That is where Thandanani's tmps=23 lived —
  // a `#REF!` cell's error code in a Rand field (sheetCellValues.ts), grounded
  // perfectly, wrong by five orders of magnitude. The invariants are arithmetic and always on; when a model is
  // present it adds what the figure probably is, read from the source excerpt.
  // Findings attach to the document that supplied the figure, so the upload
  // reveal shows them with provenance — and never edit the payload.
  for (const finding of payloadInvariantFindings(calculator.entries, extractions)) {
    const source = inputs.find((input) => input.filename === finding.sourceFile);
    const figure = Number(calculator.entries.find((e) => e.key === finding.key)?.value);
    const suggestion = source && Number.isFinite(figure)
      ? await explainImplausibleFigure(model, {
          key: finding.key,
          figure,
          excerpt: excerptAround(source.markdown || source.raw_text || '', figure),
        })
      : null;
    const target = extractions.find((extraction) => extraction.sourceFile === finding.sourceFile)
      ?? extractions[0];
    target?.exceptions.push(finding.message + (suggestion ?? ''));
    logger.warn('Calculator payload failed a plausibility invariant', {
      key: finding.key,
      sourceFile: finding.sourceFile,
      suggested: Boolean(suggestion),
    });
  }

  // ── THE ANALYST'S READ ──────────────────────────────────────────────────
  // One chain-of-thought call over the ASSEMBLED case, at the strongest
  // reasoning tier — the altitude every narrow check above lacks. Advisory
  // only: findings become exceptions a reviewer sees; not one payload value
  // can move because of it.
  const reviewFindings = await reviewCase(model, {
    payloadEntries: calculator.entries.map((entry) => ({
      key: entry.key, value: entry.value, sourceFiles: entry.sourceFiles,
    })),
    unmapped: calculator.unmapped,
    needsReview: calculator.needsReview.map((item) => ({ field: item.field, values: item.values })),
    unfilledKeys: unfilledCalculatorKeys(calculator.payload),
    files: inputs.map((input) => input.filename),
  });
  for (const finding of reviewFindings) {
    extractions[0]?.exceptions.push(
      `${finding.severity === 'error' ? 'Analyst review' : 'Analyst note'}: ${finding.finding}`
      + (finding.fix ? ` Fix: ${finding.fix}` : ''),
    );
  }

  logger.info('Case extraction complete', {
    files: inputs.length,
    documents: resolved.documentsExtracted,
    fields: Object.keys(resolved.fields).length,
    conflicts: resolved.conflicts.length,
    calculatorKeys: Object.keys(calculator.payload).length,
    heldForReview: calculator.needsReview.length,
    analystFindings: reviewFindings.length,
  });

  return { ...resolved, model: model.name, extractions, calculator, validation };
}
