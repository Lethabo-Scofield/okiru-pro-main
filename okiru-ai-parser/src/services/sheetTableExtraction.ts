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
import { parseModelJson, type DocumentExtraction, type ExtractionModel } from './aiExtraction.js';
import type { VerificationElement } from '../../schemas/verification_document_matrix.js';
import { applyColumnMapping, collectHeaders, mapSheetColumns } from './sheetColumnMapping.js';
import {
  decisionFingerprint,
  rememberDecision,
  type RememberedDecision,
} from './semanticDecisionCache.js';

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
    // designation is the SCORED job/role title (Managing Director, Admin Manager);
    // occupational_level is the EEA band. A sheet may carry either or both — give
    // the model a slot for each so neither is dropped.
    columns: ['employee_name', 'race', 'gender', 'designation', 'occupational_level', 'id_number', 'foreign'],
    what: 'each director and employee. designation is their job title / role; occupational_level is their management band (Executive Management, Senior, Middle, Junior); foreign is the Foreign-national Yes/No flag. Map a "designation"/"job title"/"position" column to designation, and a "level"/"occupational level"/"management level" column to occupational_level',
  },
  SKILLS_DEVELOPMENT: {
    field: 'learner_rows',
    // program_name + training_provider carry the intervention identity the
    // scorecard's Training Program column needs; without slots for them the model
    // dropped a "Programme"/"Course" column entirely.
    columns: ['learner_name', 'race', 'gender', 'category_code', 'program_name', 'training_provider', 'total_cost'],
    what: 'each learner / training record. program_name is the course/programme/learnership name; category_code is the A–G learning-programme category; total_cost is the training spend',
  },
  ESD: {
    field: 'supplier_rows',
    // supplier_classification is the EME / QSE / Generic size — present in the
    // client schedule and needed for the EME/QSE procurement lines.
    columns: ['supplier_name', 'registration_number', 'claimed_spend_ex_vat', 'bee_level', 'supplier_classification', 'certificate_expiry_date'],
    what: 'each supplier with the spend against them (a preferential-procurement spend schedule); supplier_classification is the EME / QSE / Generic size; registration_number is the supplier company registration number',
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

/**
 * ESD has TWO different table shapes that go to TWO different workbook sections,
 * and telling them apart is a scoring-safety matter, not a nicety:
 *
 *   - Preferential Procurement — SUPPLIERS you buy from, with SPEND against each.
 *     Rows land in the `procurement` section (the ELEMENT_TABLE[ESD] shape above).
 *   - Enterprise / Supplier DEVELOPMENT — a grant, loan or support given TO a
 *     beneficiary company. Rows land in the `esd` section.
 *
 * Routed by the supplier shape, an ED grant becomes a phantom SUPPLIER: its Rand
 * value is counted as procurement spend (inflating TMPS and Preferential
 * Procurement) while Enterprise Development loses the contribution it should
 * score. So a development contribution MUST use this shape, whose first field
 * (`beneficiary_name`) routes the whole table to the `esd` section.
 */
const ESD_CONTRIBUTION_SHAPE = {
  field: 'esd_contribution_rows',
  columns: [
    'beneficiary_name',
    'beneficiary_black_ownership',
    'beneficiary_size',
    'esd_category',
    'contribution_type',
    'contribution_value',
    'date_of_contribution',
    'description_of_contribution',
  ],
  what: 'each Enterprise/Supplier Development contribution — a grant, loan, discount or support given TO a beneficiary company (NOT a supplier you buy from). '
    + 'beneficiary_name is the company being helped; beneficiary_black_ownership is THAT company\'s % black ownership; beneficiary_size is its EME / QSE / Generic size; '
    + 'esd_category is "Supplier Development" or "Enterprise Development"; contribution_value is the Rand value of the contribution',
} as const;

/** The sheet name inside a split-workbook filename ("File.xlsx › Enterprise Development"). */
function sheetNameOf(filename: string): string {
  const marker = filename.indexOf('›');
  return (marker >= 0 ? filename.slice(marker + 1) : filename).trim();
}

/**
 * Is this ESD sheet a DEVELOPMENT-contribution schedule (→ esd) rather than a
 * preferential-procurement spend schedule (→ procurement)? The sheet name is the
 * strongest signal; failing that, the columns decide — a contribution/beneficiary
 * table with a black-ownership column and no spend/classification column.
 */
function isEsdContributionSheet(filename: string, rows?: Array<Record<string, unknown>>): boolean {
  const name = sheetNameOf(filename).toLowerCase();
  if (/enterprise\s*(&|and)?\s*(supplier\s*)?development|supplier development|\besd\b/.test(name)
    && !/preferential|procurement spend/.test(name)) {
    return true;
  }
  const headers = rows && rows.length > 0 ? Object.keys(rows[0]).join(' ').toLowerCase() : '';
  if (!headers) return false;
  const contribution = /contribution|beneficiar|grant|donation/.test(headers);
  const blackOwnership = /black\s*ownership/.test(headers);
  const supplierSpend = /\bspend\b|classification|supplier size|vat/.test(headers);
  return contribution && blackOwnership && !supplierSpend;
}

/**
 * THE FULL SHAPE CATALOGUE — every kind of evidence table a workbook sheet can
 * be, each routing to its own workbook destination via its key field. The model
 * chooses from ALL of these for EVERY sheet, so no destination decision is ever
 * a keyword special-case again. New destination = new catalogue entry, nothing
 * else changes.
 */
interface TableShapeDef { field: string; columns: string[]; what: string; element: VerificationElement }
const SHAPE_CATALOG: Record<string, TableShapeDef> = {
  shareholders: { ...ELEMENT_TABLE.OWNERSHIP!, columns: [...ELEMENT_TABLE.OWNERSHIP!.columns], element: 'OWNERSHIP' },
  employees: { ...ELEMENT_TABLE.MANAGEMENT_CONTROL!, columns: [...ELEMENT_TABLE.MANAGEMENT_CONTROL!.columns], element: 'MANAGEMENT_CONTROL' },
  learners: { ...ELEMENT_TABLE.SKILLS_DEVELOPMENT!, columns: [...ELEMENT_TABLE.SKILLS_DEVELOPMENT!.columns], element: 'SKILLS_DEVELOPMENT' },
  suppliers: { ...ELEMENT_TABLE.ESD!, columns: [...ELEMENT_TABLE.ESD!.columns], element: 'ESD' },
  development_contributions: { ...ESD_CONTRIBUTION_SHAPE, columns: [...ESD_CONTRIBUTION_SHAPE.columns], element: 'ESD' },
  sed_contributions: { ...ELEMENT_TABLE.SED!, columns: [...ELEMENT_TABLE.SED!.columns], element: 'SED' },
};

/** The element hint's DEFAULT shape — what the tab name suggests the rows are. */
const ELEMENT_DEFAULT_SHAPE: Record<VerificationElement, keyof typeof SHAPE_CATALOG> = {
  OWNERSHIP: 'shareholders',
  MANAGEMENT_CONTROL: 'employees',
  SKILLS_DEVELOPMENT: 'learners',
  ESD: 'suppliers',
  SED: 'sed_contributions',
};

const SHAPE_CHOICE_SYSTEM = [
  'You decide WHAT KIND of evidence table a B-BBEE workbook sheet holds, by',
  'reading its columns and sample rows. Judge by MEANING — what one row IS — and',
  'never by the sheet title alone (titles mislead; rows do not).',
  'Return ONLY JSON: {"shape": "<one key from the catalogue>"}.',
  'Catalogue:',
  ...Object.entries(SHAPE_CATALOG).map(([key, s]) => `- ${key}: one row is ${s.what}`),
  'The critical distinction: money PAID TO a vendor for goods/services = suppliers;',
  'money/support GIVEN TO a company or cause being developed/benefited = a contribution',
  '(development_contributions for enterprise/supplier development, sed_contributions for socio-economic).',
].join('\n');

/**
 * The MODEL chooses the table shape for EVERY sheet — the general mechanism,
 * not a per-element patch. The sheet-name element is given to the model as a
 * PRIOR (it is usually right), but the rows decide. Fail-safe by construction:
 * a bad reply → null → the caller uses the element's default shape, and a wrong
 * choice is caught by CODE because its mapping will not land (mapSheetColumns
 * validates the key column) and extraction falls back. Routing can only get
 * smarter than the hint, never dumber.
 */
async function chooseTableShape(
  model: ExtractionModel,
  sheetName: string,
  hintElement: VerificationElement,
  rows: Array<Record<string, unknown>>,
): Promise<TableShapeDef | null> {
  const headers = collectHeaders(rows);
  if (headers.length === 0) return null;
  const samples = rows.slice(0, 4).map((row) => {
    const compact: Record<string, string> = {};
    for (const h of headers) {
      const v = String(row[h] ?? '').replace(/\s+/g, ' ').trim();
      if (v) compact[h] = v.slice(0, 60);
    }
    return compact;
  });
  const user = [
    `SHEET: ${sheetName}`,
    `TAB-NAME PRIOR: the sheet name suggests "${ELEMENT_DEFAULT_SHAPE[hintElement]}", but decide from the rows.`,
    `COLUMNS: ${JSON.stringify(headers)}`,
    `SAMPLE ROWS: ${JSON.stringify(samples)}`,
  ].join('\n');

  // What a sheet's rows ARE is a property of its TEMPLATE, so the decision is
  // fingerprinted on the sheet name + its columns and made once. Re-asking per
  // upload let the same workbook be shaped two ways on two runs (the deployment
  // rejects a temperature override, so every ask is sampled afresh) and a sheet
  // shaped wrong places its rows in the wrong section — or nowhere.
  const fingerprint = decisionFingerprint(['shape', sheetName, hintElement, ...[...headers].sort()]);

  let decision: RememberedDecision<string>;
  try {
    decision = await rememberDecision<string>('shape', fingerprint, async () => {
      // Throws on a transient model failure, which `rememberDecision` leaves
      // uncached; an unusable reply is a real "no decision" and IS remembered.
      const reply = await model.complete(SHAPE_CHOICE_SYSTEM, user);
      const key = String(parseModelJson(reply)?.shape ?? '').trim();
      return SHAPE_CATALOG[key] ? key : null;
    });
  } catch (err) {
    logger.warn('Table shape choice failed — falling back to the element default', {
      sheet: sheetName,
      element: hintElement,
      reason: (err as Error).message,
    });
    return null;
  }

  if (decision.value && decision.replayed) {
    logger.info('Table shape replayed from a prior decision', {
      sheet: sheetName,
      shape: decision.value,
    });
  }
  return decision.value ? SHAPE_CATALOG[decision.value] : null;
}

/**
 * Which table shape does this sheet use? The model decides from the rows for
 * every sheet (chooseTableShape); the element default is the fail-safe. The
 * legacy ESD keyword check remains ONLY for the no-model/no-rows path, where
 * there is nothing smarter to consult.
 */
async function shapeForSheet(
  model: ExtractionModel,
  element: VerificationElement,
  input: { filename: string; rows?: Array<Record<string, unknown>> },
): Promise<{ field: string; columns: string[]; what: string; element: VerificationElement } | null> {
  const rows = input.rows ?? [];
  if (rows.length > 0) {
    const chosen = await chooseTableShape(model, sheetNameOf(input.filename), element, rows);
    if (chosen) return chosen;
  }
  // No model verdict: the element's default shape, with the legacy keyword check
  // as the last-resort ESD disambiguator.
  if (element === 'ESD' && isEsdContributionSheet(input.filename, input.rows)) {
    return { ...ESD_CONTRIBUTION_SHAPE, columns: [...ESD_CONTRIBUTION_SHAPE.columns], element: 'ESD' };
  }
  const fallback = ELEMENT_TABLE[element];
  return fallback ? { ...fallback, columns: [...fallback.columns], element } : null;
}

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
/**
 * A sheet that HAD rows and could not be placed reports itself, rather than
 * returning null and letting the missing points read as the client's fault.
 * Carries no values, so it can never move a score — only explain one.
 */
function unplacedRows(
  failure: string | null,
  element: VerificationElement,
  sourceFile: string,
  field: string,
): DocumentExtraction | null {
  if (!failure) return null;
  logger.warn('Sheet rows could not be placed — reporting instead of scoring zero', {
    file: sourceFile,
    element,
    detail: failure,
  });
  return {
    documentId: `sheet_table__${element.toLowerCase()}`,
    documentName: `${element} table`,
    element,
    sourceFile,
    values: [],
    missingFields: [field],
    unexpectedFields: [],
    exceptions: [failure],
  };
}

export async function extractSheetTable(
  model: ExtractionModel,
  element: VerificationElement,
  input: { filename: string; markdown?: string; raw_text: string; rows?: Array<Record<string, unknown>> },
): Promise<DocumentExtraction | null> {
  const shape = await shapeForSheet(model, element, input);
  if (!shape) return null;
  // The extraction is labelled by what the rows ARE (the chosen shape's element),
  // which the model may have corrected away from the tab-name hint.
  const rowElement = shape.element;

  // Set when the sheet HAD parsed rows we could not place. Carried to the end so
  // that if the model fallback also yields nothing we can say so out loud rather
  // than returning null — a sheet that silently contributes nothing reads to the
  // client as "we scored your data and you did badly", which is a lie about
  // whose fault the gap is.
  let placementFailure: string | null = null;

  if (input.rows && input.rows.length > 0) {
    const mapping = await mapSheetColumns(model, shape, input.filename, input.rows);
    if (mapping && Object.values(mapping).includes(shape.columns[0])) {
      const table = applyColumnMapping(input.rows, mapping, shape);
      if (table.rows.length > 0) {
        logger.info('Extracted sheet table deterministically', {
          file: input.filename,
          element: rowElement,
          field: shape.field,
          ...table.stats,
          exceptions: table.exceptions.length,
        });
        return {
          documentId: `sheet_table__${rowElement.toLowerCase()}`,
          documentName: `${rowElement} table`,
          element: rowElement,
          sourceFile: input.filename,
          values: [{
            field: shape.field,
            value: table.rows,
            sourceFile: input.filename,
            sourceDocumentId: `sheet_table__${rowElement.toLowerCase()}`,
          }],
          missingFields: [],
          unexpectedFields: [],
          exceptions: table.exceptions,
        };
      }
    }
    const sheet = sheetNameOf(input.filename);
    const seen = collectHeaders(input.rows).join(', ');
    placementFailure = mapping
      ? `"${sheet}" has ${input.rows.length} row(s), but no column could be read as ${shape.columns[0]}, `
        + `so none of them could be scored. Columns found: ${seen}.`
      : `"${sheet}" has ${input.rows.length} row(s), but its columns could not be matched to any ${rowElement} field, `
        + `so none of them could be scored. Columns found: ${seen}.`;
    logger.warn('Deterministic table read yielded nothing — falling back to model read', {
      file: input.filename,
      element: rowElement,
      columns: seen,
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
    return unplacedRows(placementFailure, rowElement, input.filename, shape.field);
  }

  const rows = parseTable(reply, shape.field);
  if (rows.length === 0) return unplacedRows(placementFailure, rowElement, input.filename, shape.field);

  logger.info('Extracted sheet table', { file: input.filename, element: rowElement, field: shape.field, rows: rows.length });

  return {
    documentId: `sheet_table__${rowElement.toLowerCase()}`,
    documentName: `${rowElement} table`,
    element: rowElement,
    sourceFile: input.filename,
    values: [{
      field: shape.field,
      value: rows,
      sourceFile: input.filename,
      sourceDocumentId: `sheet_table__${rowElement.toLowerCase()}`,
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
