/**
 * The workbook's Instructions sheet as an extraction: the measured entity's
 * sector, financial year end, name and applicable Codes, as the gathering
 * template states them.
 *
 * The split reads them (workbookSheetSplit.readWorkbookInstructions) and the
 * workbook's first sheet carries them; this turns them into the case's
 * `sheet_instructions` extraction. Deterministic, no model call — the values are
 * the workbook's own cells, so there is nothing for a model to read.
 */
import type { DocumentExtraction } from './aiExtraction.js';
import type { WorkbookInstructions } from './workbookSheetSplit.js';

export const SHEET_INSTRUCTIONS_DOCUMENT_ID = 'sheet_instructions';

const FIELDS = ['measured_entity_name', 'industry_sector', 'financial_year_end', 'applicable_code'] as const;

/** The Instructions profile the split attached to this input's table, if any. */
export function structuredInstructions(tables: unknown[] | undefined): WorkbookInstructions | undefined {
  const first = tables?.[0];
  if (!first || typeof first !== 'object') return undefined;
  const instructions = (first as { instructions?: unknown }).instructions;
  if (!instructions || typeof instructions !== 'object' || Array.isArray(instructions)) return undefined;
  const sheetName = (instructions as { sheetName?: unknown }).sheetName;
  if (typeof sheetName !== 'string' || !sheetName) return undefined;
  return instructions as WorkbookInstructions;
}

/**
 * The extraction for one workbook's Instructions profile.
 *
 * `workbookFile` is the uploaded workbook's own name; the values are traced to
 * "Workbook.xlsx › Instructions", the sheet that states them, not to whichever
 * sheet happened to carry them through the pipeline.
 */
export function instructionsExtraction(
  instructions: WorkbookInstructions,
  workbookFile: string,
): DocumentExtraction | null {
  const sourceFile = `${workbookFile} › ${instructions.sheetName}`;
  const values: DocumentExtraction['values'] = [];
  for (const field of FIELDS) {
    const value = instructions[field];
    if (typeof value === 'string' && value.trim()) {
      values.push({ field, value, sourceFile, sourceDocumentId: SHEET_INSTRUCTIONS_DOCUMENT_ID });
    }
  }
  if (values.length === 0) return null;
  return {
    documentId: SHEET_INSTRUCTIONS_DOCUMENT_ID,
    documentName: 'Workbook instructions (company profile)',
    sourceFile,
    values,
    missingFields: [],
    unexpectedFields: [],
    exceptions: [],
  };
}
