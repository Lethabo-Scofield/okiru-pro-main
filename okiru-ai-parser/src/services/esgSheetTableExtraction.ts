/**
 * Read an ESG workbook SHEET as a table of rows — deterministically.
 *
 * WHY THIS EXISTS
 *
 * `esgCaseExtraction` used to say, in as many words, that the workbook sheet
 * extractor was deliberately absent because "its shape catalogue is the five
 * B-BBEE scorecard tables". That was true when it was written. It is not true
 * now: `ESG_GRIDS` describes fourteen ESG registers — the fleet list, the driver
 * debrief, the waste streams, the CSI schedule, the risk and aspects registers —
 * each with the exact row columns the calculator mapping already understands.
 * The shapes existed; nothing was using them for spreadsheets.
 *
 * So ESG registers arriving as a WORKBOOK were read the way B-BBEE schedules
 * used to be: hand the sheet's markdown to the model and ask it to type every
 * row back. That is the one job a language model does unreliably — a 23-row
 * schedule came back with 14 — and the one job the code has already done, since
 * `extractionInputsFromUpload` parses every sheet into header-keyed rows before
 * the model is ever called. A 134-vehicle fleet register is exactly the size
 * where transcription starts dropping rows, and a dropped vehicle is a silent
 * zero.
 *
 * THE SPLIT OF LABOUR, same as the B-BBEE side:
 *   - the MODEL answers one small semantic question — which sheet column means
 *     `vehicle_registration`, which means `monthly_litres` — from the headers
 *     and a few sample rows, and that answer is cached per template fingerprint
 *     so it cannot be re-rolled between runs;
 *   - the CODE applies that mapping to EVERY parsed row, verbatim. N rows in,
 *     N rows out, no truncation possible by construction.
 *
 * Returns null rather than guessing: a sheet whose columns match no ESG register
 * is left to the existing spec/grid pass, which is still the right reader for a
 * PDF register or a narrative document.
 */
import { createLogger } from '../logger.js';
import type { DocumentExtraction, ExtractionModel } from './aiExtraction.js';
import { esgGridDocuments, type DocumentGrid } from './extractionDomain.js';
import { applyColumnMapping, collectHeaders, mapSheetColumns, type TableShape } from './sheetColumnMapping.js';
import {
  decisionFingerprint,
  rememberDecision,
  type RememberedDecision,
} from './semanticDecisionCache.js';

const logger = createLogger('EsgSheetTable');

export interface EsgSheetInput {
  filename: string;
  /** Rows the workbook split already parsed, header-keyed. */
  rows?: Array<Record<string, unknown>>;
  /** Sheet name when the input came from a split workbook. */
  sheetName?: string;
}

/**
 * Sheet names that state their register outright.
 *
 * Checked before the model is asked anything: the Okiru ESG toolkit names its
 * tabs exactly, and a free answer beats a paid one. Matched on the normalised
 * name so `Fleet_Register`, `fleet register` and `FLEETREGISTER` are one key.
 */
const SHEET_NAME_HINTS: Record<string, string> = {
  fleetregister: 'fleet__vehicle_register',
  vehicleregister: 'fleet__vehicle_register',
  fleetlist: 'fleet__vehicle_register',
  driverdebrief: 'fleet__telematics_driver_debrief_report',
  debriefsummary: 'fleet__telematics_driver_debrief_report',
  routesummary: 'fleet__telematics_driver_debrief_report',
  wasteregister: 'waste__contractor_report_safe_disposal_certificate',
  wastestreams: 'waste__contractor_report_safe_disposal_certificate',
  csiregister: 'community_csi__csi_sed_spend_records',
  sedregister: 'community_csi__csi_sed_spend_records',
  riskregister: 'risk_assurance__risk_register_including_climate',
  aspectsregister: 'iso_environmental__aspects_and_impacts_register',
  legalregister: 'iso_environmental__environmental_legal_register',
  ofocodes: 'training__ofo_intervention_register',
};

function normName(name: string): string {
  return name.replace(/[\s_-]/g, '').toLowerCase();
}

/** The sheet name inside a split-workbook filename ("File.xlsx > Fleet_Register"). */
export function esgSheetNameOf(filename: string): string {
  const marker = filename.indexOf('›');
  return (marker >= 0 ? filename.slice(marker + 1) : filename).trim();
}

const CHOOSE_SYSTEM_PROMPT = [
  'You match a spreadsheet sheet to the ESG register it holds.',
  'Answer with ONLY the register id, or the word NONE.',
  'Answer NONE when the sheet is not a register of repeated records — a summary,',
  'a scorecard, a dashboard, a set of monthly totals or a policy is NONE.',
].join(' ');

/**
 * Which ESG register is this sheet, if any?
 *
 * Name hint first (free, exact). Otherwise one small model call over the
 * headers, cached on the template fingerprint so the same sheet shape always
 * resolves the same way — a register that mapped on Monday and not on Tuesday
 * is a score that moves on identical evidence.
 */
export async function chooseEsgSheetGrid(
  model: ExtractionModel,
  sheetName: string,
  rows: Array<Record<string, unknown>>,
): Promise<{ documentId: string; grid: DocumentGrid } | null> {
  const catalogue = esgGridDocuments();
  const byId = new Map(catalogue.map((entry) => [entry.documentId, entry]));

  const hinted = SHEET_NAME_HINTS[normName(sheetName)];
  const hintedEntry = hinted ? byId.get(hinted) : undefined;
  if (hintedEntry) return hintedEntry;

  const headers = collectHeaders(rows);
  if (headers.length === 0) return null;

  const user = [
    `SHEET: ${sheetName}`,
    `SHEET COLUMNS: ${JSON.stringify(headers)}`,
    'REGISTERS:',
    ...catalogue.map((entry) => `  ${entry.documentId}: rows of ${entry.grid.rowFields.slice(0, 6).join(', ')}`),
    'Reply with one register id, or NONE.',
  ].join('\n');

  const fingerprint = decisionFingerprint(['esggrid', normName(sheetName), ...[...headers].sort()]);

  let decision: RememberedDecision<string>;
  try {
    decision = await rememberDecision<string>('esggrid', fingerprint, async () => {
      const think = model.completeHard?.bind(model) ?? model.complete.bind(model);
      const reply = (await think(CHOOSE_SYSTEM_PROMPT, user)).trim();
      const id = reply.replace(/[^a-z_]/gi, '').toLowerCase();
      // NONE is a real decision and is remembered — re-asking a summary sheet on
      // every upload buys nothing but latency.
      return byId.has(id) ? id : null;
    });
  } catch (err) {
    logger.warn('ESG sheet shape choice failed', { sheet: sheetName, reason: (err as Error).message });
    return null;
  }

  return decision.value ? byId.get(decision.value) ?? null : null;
}

/** Human phrasing of one row, for the column-mapping question. */
function whatOneRowIs(documentId: string, grid: DocumentGrid): string {
  const subject = documentId.split('__')[1]?.replace(/_/g, ' ') ?? 'record';
  return `one ${subject} row. Columns wanted: ${grid.rowFields.join(', ')}`;
}

/**
 * Read a workbook sheet as an ESG register.
 *
 * Returns null — never a partial guess — when the sheet is not a register, has
 * no parsed rows, or its columns cannot be matched. The caller then runs the
 * existing spec pass, which is unchanged.
 */
export async function extractEsgSheetTable(
  model: ExtractionModel,
  input: EsgSheetInput,
): Promise<DocumentExtraction | null> {
  const rows = input.rows;
  if (!rows || rows.length === 0) return null;

  const sheetName = input.sheetName ?? esgSheetNameOf(input.filename);
  const chosen = await chooseEsgSheetGrid(model, sheetName, rows);
  if (!chosen) return null;

  const { documentId, grid } = chosen;
  const shape: TableShape = {
    columns: grid.rowFields,
    what: whatOneRowIs(documentId, grid),
  };

  const mapping = await mapSheetColumns(model, shape, input.filename, rows);
  // The FIRST column is the row's identity (vehicle_registration, driver_name).
  // Without it every row is anonymous and `applyColumnMapping` drops them all,
  // so an unmapped key field means "not this register" rather than "no rows" —
  // hand it back to the spec pass instead of reporting an empty table.
  if (!mapping || !Object.values(mapping).includes(shape.columns[0])) {
    logger.info('ESG sheet columns did not map to the chosen register', {
      sheet: sheetName,
      documentId,
      columns: collectHeaders(rows).join(', '),
    });
    return null;
  }

  const table = applyColumnMapping(rows, mapping, shape);
  if (table.rows.length === 0) return null;

  logger.info('Extracted ESG register deterministically', {
    sheet: sheetName,
    documentId,
    field: grid.rowsField,
    ...table.stats,
    exceptions: table.exceptions.length,
  });

  return {
    documentId,
    documentName: `${sheetName} register`,
    sourceFile: input.filename,
    values: [{
      field: grid.rowsField,
      value: table.rows,
      sourceFile: input.filename,
      sourceDocumentId: documentId,
    }],
    missingFields: [],
    unexpectedFields: [],
    exceptions: table.exceptions,
  };
}
