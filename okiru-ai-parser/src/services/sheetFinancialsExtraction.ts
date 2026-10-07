/**
 * Extract ENTITY-LEVEL financials from a Finance / summary sheet.
 *
 * The AFS matrix spec pulls the income-statement COMPONENTS an auditor agrees to
 * TMPS (cost_of_sales, operating_expenditure, …) but not the two figures the
 * NPAT-based targets need: annual Revenue and NPAT. Those are labelled totals on
 * the Finance sheet ("Revenue  R 10 826 271", "Net Profit After Tax  (4 157 140)")
 * — and without them a loss-making entity's SED/ED target cannot use the deemed
 * NPAT (revenue × industry norm), so a real SED contribution scores 0.
 *
 * This is a focused reader for exactly those two labelled figures. It runs
 * alongside the matrix extraction on a Finance sheet, keyed by the parser field
 * names the bridge already maps (current_year_revenue → financials.revenue,
 * current_year_npat → financials.npat).
 */
import { createLogger } from '../logger.js';
import type { DocumentExtraction, ExtractionModel } from './aiExtraction.js';
import { isSpreadsheetError } from './sheetCellValues.js';

const logger = createLogger('SheetFinancialsExtraction');

/** Does this sheet name indicate entity-level financials (revenue / NPAT)? */
export function isFinancialsSheet(sheetName: string | undefined): boolean {
  if (!sheetName) return false;
  return /\b(finance|financials?|income\s*statement|afs|profit\s*(and|&)\s*loss|p&l)\b/i.test(sheetName);
}

const SYSTEM_PROMPT = [
  'You read two ENTITY-LEVEL figures from a Finance / summary sheet of a B-BBEE workbook.',
  'Return ONLY a JSON object with the LABELLED figures present (omit a key if not labelled):',
  '  current_year_revenue — annual Revenue / Turnover for the measurement year',
  '  current_year_npat    — Net Profit After Tax (NPAT); may be negative',
  'Rules:',
  '- Copy the LABELLED total verbatim; NEVER compute, sum or infer it.',
  '- A figure written in brackets, e.g. (4 157 140), is NEGATIVE.',
  '- Ignore Cost of Sales, Operating Expenditure, Leviable Amount, TMPS and per-line items.',
].join('\n');

/**
 * The Finance sheet states its OWN Total Measured Procurement Spend — the
 * post-exclusion figure the workbook computed (inclusions minus exclusions).
 * The model path used to COMPUTE a TMPS by summing components, which included
 * the exclusions and overstated the denominator by the excluded spend
 * (on a real pack, millions above the labelled TMPS), suppressing the
 * procurement ratio. A stated total is read, never computed — and the sheet is
 * banner-heavy so its columns misalign; the label and its figure are found by
 * scanning CELLS, not by trusting a column.
 */
const TMPS_LABEL = /total\s+measured\s+procurement\s+spend/i;
/** "Total Inclusions" / "TMPS Inclusions" — a caption on the inclusions total's own row. */
const TMPS_INCLUSIONS_LABEL = /^\s*(?:total\s+)?(?:tmps\s+|measured\s+procurement\s+)?inclusions\s*:?\s*$/i;
/** The gathering template names its inclusions total `TMPS_Inc` (Finance!C74). */
const TMPS_INCLUSIONS_NAME = /^tmps_?inc(?:lusions)?$/i;

/**
 * A labelled figure as the sheet states it: the number on the label's row, or
 * the spreadsheet ERROR that row holds instead.
 *
 * An error is reported, never read as a value: SheetJS stores `#REF!` as the
 * error code 23, which is how a broken `=TMPS_Inc-H74` formula once arrived as
 * TMPS = 23 (see sheetCellValues.ts).
 */
interface LabelledFigure {
  value: number | null;
  /** The error text (`"#REF!"`) a labelled row held instead of a figure. */
  error: string | null;
}

function labelledFigureFromRows(rows: Array<Record<string, unknown>>, label: RegExp): LabelledFigure {
  let error: string | null = null;
  for (const row of rows) {
    const cells = Object.values(row);
    const hasLabel = cells.some((c) => typeof c === 'string' && label.test(c));
    if (!hasLabel) continue;
    // A broken formula on the labelled row: the figure the sheet meant to state
    // is unknown, so nothing on that row is taken — not even a lone number in
    // another column, which could be any year's or any part's.
    const errors = cells.filter(isSpreadsheetError);
    if (errors.length > 0) {
      error ??= errors[0].trim();
      continue;
    }
    // The value row carries a number; the section HEADING row does not.
    const numbers = cells.filter((c): c is number => typeof c === 'number' && Number.isFinite(c) && c !== 0);
    if (numbers.length === 1) return { value: numbers[0], error: null };
  }
  return { value: null, error };
}

/** A figure the workbook states through a defined name rather than a caption. */
function namedFigure(namedCells: Record<string, unknown> | undefined, name: RegExp): LabelledFigure {
  for (const [key, raw] of Object.entries(namedCells ?? {})) {
    if (!name.test(key)) continue;
    if (isSpreadsheetError(raw)) return { value: null, error: raw.trim() };
    if (typeof raw === 'number' && Number.isFinite(raw) && raw !== 0) return { value: raw, error: null };
  }
  return { value: null, error: null };
}

export async function extractSheetFinancials(
  model: ExtractionModel,
  input: {
    filename: string;
    markdown?: string;
    raw_text: string;
    rows?: Array<Record<string, unknown>>;
    /** The workbook's defined names on this sheet (`TMPS_Inc` → 9200000). */
    namedCells?: Record<string, unknown>;
  },
): Promise<DocumentExtraction | null> {
  const content = input.markdown?.trim() || input.raw_text;
  const user = [
    `SHEET: ${input.filename}`,
    'Return the labelled annual Revenue/Turnover and Net Profit After Tax (NPAT).',
    `\nSHEET CONTENT:\n${content}`,
  ].join('\n');

  // The model reads the labelled revenue/NPAT; its failure must not cost the
  // DETERMINISTIC readings below, so it degrades to "found nothing" instead of
  // aborting the extraction.
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = parseObject(await model.complete(SYSTEM_PROMPT, user));
  } catch (err) {
    logger.warn('Financials model reading failed — keeping deterministic readings', {
      file: input.filename,
      reason: (err as Error).message,
    });
  }

  const values: DocumentExtraction['values'] = [];
  for (const key of ['current_year_revenue', 'current_year_npat'] as const) {
    const v = parsed?.[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      values.push({ field: key, value: v, sourceFile: input.filename, sourceDocumentId: 'sheet_financials' });
    }
  }

  const exceptions: string[] = [];

  const tmps = input.rows ? labelledFigureFromRows(input.rows, TMPS_LABEL) : { value: null, error: null };
  if (tmps.value !== null) {
    values.push({
      field: 'total_measured_procurement_spend',
      value: tmps.value,
      sourceFile: input.filename,
      sourceDocumentId: 'sheet_financials',
    });
  } else if (tmps.error) {
    // REPORTED, not repaired. The sheet's own inclusions and exclusions are
    // right there, but subtracting them would be a figure this workbook does
    // not state; a TMPS another uploaded workbook states is used instead, and
    // when none does the denominator stays open for the client to supply.
    exceptions.push(
      `TMPS cell holds ${tmps.error} in ${input.filename}: the workbook's "Total Measured Procurement Spend" `
      + 'formula is broken, so no TMPS was read from this sheet. It has not been computed from the inclusions '
      + 'and exclusions; a TMPS stated in another uploaded workbook is used if there is one. '
      + 'Fix the formula in the workbook, or confirm TMPS, before relying on the Preferential Procurement score.',
    );
  }

  // TMPS inclusions (the total BEFORE exclusions): reported for the reviewer
  // and the answer key, never scored as TMPS — it overstates the denominator by
  // every excluded rand. Its caption is usually the workbook's defined name.
  const named = namedFigure(input.namedCells, TMPS_INCLUSIONS_NAME);
  const inclusions = named.value !== null || named.error
    ? named
    : input.rows ? labelledFigureFromRows(input.rows, TMPS_INCLUSIONS_LABEL) : { value: null, error: null };
  if (inclusions.value !== null) {
    values.push({
      field: 'tmps_inclusions',
      value: inclusions.value,
      sourceFile: input.filename,
      sourceDocumentId: 'sheet_financials',
    });
  } else if (inclusions.error) {
    exceptions.push(`TMPS inclusions cell holds ${inclusions.error} in ${input.filename}: no inclusions total was read from this sheet.`);
  }

  if (values.length === 0 && exceptions.length === 0) return null;

  if (exceptions.length > 0) {
    logger.warn('Finance sheet holds spreadsheet errors where figures were expected', { file: input.filename, exceptions });
  }
  logger.info('Extracted sheet financials', { file: input.filename, fields: values.map((x) => x.field) });
  return {
    documentId: 'sheet_financials',
    documentName: 'Financials summary',
    // Element is irrelevant for these entity-level fields (the bridge maps them
    // to financial-information regardless), but the type requires one.
    element: 'ESD',
    sourceFile: input.filename,
    values,
    missingFields: [],
    unexpectedFields: [],
    exceptions,
  };
}

function parseObject(reply: string): Record<string, unknown> | null {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(reply.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
