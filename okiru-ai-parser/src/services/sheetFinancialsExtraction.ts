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
 * (R8,100,064 vs the labelled R4,674,995 on the real pack), suppressing the
 * procurement ratio. A stated total is read, never computed — and the sheet is
 * banner-heavy so its columns misalign; the label and its figure are found by
 * scanning CELLS, not by trusting a column.
 */
const TMPS_LABEL = /total\s+measured\s+procurement\s+spend/i;

function labelledTmpsFromRows(rows: Array<Record<string, unknown>>): number | null {
  for (const row of rows) {
    const cells = Object.values(row);
    const hasLabel = cells.some((c) => typeof c === 'string' && TMPS_LABEL.test(c));
    if (!hasLabel) continue;
    // The value row carries a number; the section HEADING row does not.
    const numbers = cells.filter((c): c is number => typeof c === 'number' && Number.isFinite(c) && c !== 0);
    if (numbers.length === 1) return numbers[0];
  }
  return null;
}

export async function extractSheetFinancials(
  model: ExtractionModel,
  input: { filename: string; markdown?: string; raw_text: string; rows?: Array<Record<string, unknown>> },
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

  const labelledTmps = input.rows ? labelledTmpsFromRows(input.rows) : null;
  if (labelledTmps !== null) {
    values.push({
      field: 'total_measured_procurement_spend',
      value: labelledTmps,
      sourceFile: input.filename,
      sourceDocumentId: 'sheet_financials',
    });
  }

  if (values.length === 0) return null;

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
    exceptions: [],
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
