/**
 * Extract a workbook SHEET as a TABLE of rows.
 *
 * The 109-document matrix is a verification-audit checklist: each spec describes
 * a single evidence record an auditor samples (one invoice, one affidavit, one
 * AFS) and its schema returns ONE record. But a client's gathering workbook
 * carries its evidence as SCHEDULES — the Procurement sheet is 23 suppliers, the
 * Social Development sheet is 12 beneficiaries, the Management sheet is every
 * director. No single-record spec can emit those rows, so Phase 4 extracted
 * ownership (single shareholder, single certificate) and nothing else.
 *
 * This is the missing extractor: given a sheet already routed to an element (by
 * its name — "Procurement", "Social Development"), run ONE call that returns
 * EVERY row of that element's table, keyed by the parser field names the
 * calculator mapping already understands. The model does the semantic work
 * (which column is the supplier name, which is the spend); the rows themselves
 * are the deterministic table the spreadsheet already parsed.
 *
 * Emitted as an array-of-objects value, which the downstream mapping expands
 * into one workbook row per entry — the same path the share register's
 * holdings_table already takes.
 */
import { createLogger } from '../logger.js';
import type { DocumentExtraction, ExtractionModel } from './aiExtraction.js';
import type { VerificationElement } from '../../schemas/verification_document_matrix.js';
import { applyColumnMapping, mapSheetColumns } from './sheetColumnMapping.js';

const logger = createLogger('SheetTableExtraction');

/**
 * Per element: the row shape to ask for, using the parser field names the
 * field bridge maps to calculator keys. Kept deliberately small — the columns
 * that actually score, not every column a sheet has.
 */
const ELEMENT_TABLE: Partial<Record<VerificationElement, { field: string; columns: string[]; what: string }>> = {
  OWNERSHIP: {
    field: 'shareholder_rows',
    columns: ['shareholder_name', 'race', 'gender', 'id_number', 'voting_rights', 'economic_interest', 'number_of_shares'],
    what: 'each shareholder / holder of equity',
  },
  MANAGEMENT_CONTROL: {
    field: 'employee_rows',
    columns: ['employee_name', 'race', 'gender', 'occupational_level', 'id_number', 'foreign'],
    what: 'each director and employee (occupational_level is their management band, e.g. Executive Management, Senior, Middle; foreign is the Foreign-national Yes/No flag)',
  },
  SKILLS_DEVELOPMENT: {
    field: 'learner_rows',
    columns: ['learner_name', 'race', 'gender', 'category_code', 'total_cost'],
    what: 'each learner / training record',
  },
  ESD: {
    field: 'supplier_rows',
    // supplier_classification is the EME / QSE / Generic size — present in the
    // client schedule and needed for the EME/QSE procurement lines.
    columns: ['supplier_name', 'claimed_spend_ex_vat', 'bee_level', 'supplier_classification', 'certificate_expiry_date'],
    what: 'each supplier with the spend against them (a preferential-procurement spend schedule); supplier_classification is the EME / QSE / Generic size',
  },
  SED: {
    field: 'beneficiary_rows',
    // date_of_contribution + description distinguish the individual monthly
    // contributions to one beneficiary. WITHOUT them, thirteen R400 grants to
    // OUTA read as one identical row and collapse to a single R400 line — the
    // schedule's whole value is its rows, so the fields that make each row
    // distinct are required, not optional.
    columns: ['beneficiary_name', 'contribution_value', 'contribution_type', 'black_beneficiary_percentage_declared', 'date_of_contribution', 'description_of_contribution'],
    what: 'each socio-economic development contribution — one row per contribution line, so the SAME beneficiary appears once per dated contribution',
  },
};

const SYSTEM_PROMPT = [
  'You extract a TABLE from a B-BBEE workbook sheet.',
  'Return ONLY a JSON object with one key holding an ARRAY of row objects.',
  'Rules:',
  '- One array entry per data row that carries real evidence. Skip empty, total and heading rows.',
  '- Use exactly the requested field names. Omit a field for a row when that row does not state it.',
  '- Copy values verbatim — do not convert currencies, dates, percentages or race labels.',
  '- If the sheet holds none of the requested evidence, return an empty array.',
].join('\n');

/**
 * Extract the element's table from a sheet document. Returns a DocumentExtraction
 * carrying one array-of-objects value, or null when the element has no table
 * shape or the sheet yields no rows.
 *
 * When the caller supplies the sheet's PARSED rows (`input.rows`, header-keyed
 * objects from the workbook split), the table is read DETERMINISTICALLY: the
 * model only maps columns to fields, the code applies that mapping to every
 * row. The model never re-types table data, so a 23-row schedule yields 23
 * rows by construction. The legacy whole-table model read remains the fallback
 * for content with no parsed rows (PDF tables) or when mapping fails.
 */
export async function extractSheetTable(
  model: ExtractionModel,
  element: VerificationElement,
  input: { filename: string; markdown?: string; raw_text: string; rows?: Array<Record<string, unknown>> },
): Promise<DocumentExtraction | null> {
  const shape = ELEMENT_TABLE[element];
  if (!shape) return null;

  if (input.rows && input.rows.length > 0) {
    const mapping = await mapSheetColumns(model, shape, input.filename, input.rows);
    if (mapping && Object.values(mapping).includes(shape.columns[0])) {
      const table = applyColumnMapping(input.rows, mapping, shape);
      if (table.rows.length > 0) {
        logger.info('Extracted sheet table deterministically', {
          file: input.filename,
          element,
          field: shape.field,
          ...table.stats,
          exceptions: table.exceptions.length,
        });
        return {
          documentId: `sheet_table__${element.toLowerCase()}`,
          documentName: `${element} table`,
          element,
          sourceFile: input.filename,
          values: [{
            field: shape.field,
            value: table.rows,
            sourceFile: input.filename,
            sourceDocumentId: `sheet_table__${element.toLowerCase()}`,
          }],
          missingFields: [],
          unexpectedFields: [],
          exceptions: table.exceptions,
        };
      }
    }
    logger.warn('Deterministic table read yielded nothing — falling back to model read', {
      file: input.filename,
      element,
    });
  }

  const content = input.markdown?.trim() || input.raw_text;
  const user = [
    `SHEET: ${input.filename}`,
    `\nExtract ${shape.what}.`,
    `\nReturn: {"${shape.field}": [ { ${shape.columns.map((c) => `"${c}": …`).join(', ')} }, … ]}`,
    `\nSHEET CONTENT:\n${content}`,
  ].join('\n');

  let reply: string;
  try {
    reply = await model.complete(SYSTEM_PROMPT, user);
  } catch (err) {
    logger.warn('Sheet table extraction failed', { file: input.filename, element, reason: (err as Error).message });
    return null;
  }

  const rows = parseTable(reply, shape.field);
  if (rows.length === 0) return null;

  logger.info('Extracted sheet table', { file: input.filename, element, field: shape.field, rows: rows.length });

  return {
    documentId: `sheet_table__${element.toLowerCase()}`,
    documentName: `${element} table`,
    element,
    sourceFile: input.filename,
    values: [{
      field: shape.field,
      value: rows,
      sourceFile: input.filename,
      sourceDocumentId: `sheet_table__${element.toLowerCase()}`,
    }],
    missingFields: [],
    unexpectedFields: [],
    exceptions: [],
  };
}

/** Pull the row array out of the model reply, tolerating the usual wrapping. */
function parseTable(reply: string, field: string): Array<Record<string, unknown>> {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];

  // Prefer the requested key; fall back to the first array-of-objects value the
  // model returned under any key.
  const record = parsed as Record<string, unknown>;
  const candidates = [record[field], ...Object.values(record)];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.every((e) => e && typeof e === 'object' && !Array.isArray(e))) {
      return (candidate as Array<Record<string, unknown>>).filter((row) =>
        Object.values(row).some((v) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim() !== '0'));
    }
  }
  return [];
}
