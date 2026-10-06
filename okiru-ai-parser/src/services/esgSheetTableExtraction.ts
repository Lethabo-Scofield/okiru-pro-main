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

/*
 * The model is called in JSON mode, and Azure refuses a JSON-mode request whose
 * messages never say "json" (400 — "'messages' must contain the word 'json'").
 * This prompt asked for a bare id, so EVERY sheet without a name hint failed the
 * choice and fell to the flat model pass: Acme Group's 153-vehicle fleet master
 * arrived as 15 rows, its fuel-per-vehicle sheet not at all.
 */
const CHOOSE_SYSTEM_PROMPT = [
  'You match a spreadsheet sheet to the ESG register it holds.',
  'Answer NONE when the sheet is not a register of repeated records — a summary,',
  'a scorecard, a dashboard, a set of monthly totals or a policy is NONE.',
  'Reply with JSON only: {"register": "<register id>"} or {"register": "NONE"}.',
].join(' ');

/** The register id in a reply: `{"register": "…"}`, or a bare id. */
export function registerIdFromReply(reply: string): string {
  let answer = reply.trim();
  const start = answer.indexOf('{');
  const end = answer.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(answer.slice(start, end + 1)) as { register?: unknown };
      if (typeof parsed.register === 'string') answer = parsed.register;
    } catch {
      // A bare id, or prose around one — read as text below.
    }
  }
  return answer.replace(/[^a-z_]/gi, '').toLowerCase();
}

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
    'Reply as JSON: {"register": "<register id>"} or {"register": "NONE"}.',
  ].join('\n');

  const fingerprint = decisionFingerprint(['esggrid', normName(sheetName), ...[...headers].sort()]);

  let decision: RememberedDecision<string>;
  try {
    decision = await rememberDecision<string>('esggrid', fingerprint, async () => {
      const think = model.completeHard?.bind(model) ?? model.complete.bind(model);
      const id = registerIdFromReply(await think(CHOOSE_SYSTEM_PROMPT, user));
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

/**
 * What a few easily-confused row columns MEAN. A fuel report splits litres into
 * "Internal" (from the company's bowser) and "External" (bought on the road)
 * beside a total; mapped to "monthly_litres" without this, the model picked
 * Internal and a vehicle that took 1,676 L was recorded as 1,396.
 */
const ROW_FIELD_MEANINGS: Record<string, string> = {
  monthly_litres: 'ALL fuel the vehicle took in the month — the TOTAL column when the sheet splits internal and external',
  monthly_km: 'kilometres driven in the month',
  fuel_litres: 'litres in this transaction',
};

/**
 * A unit word in a column's header that the field cannot carry. The model maps
 * a column by its header, so a header that SAYS hours, a date or a body
 * dimension is not kilometres, litres or a fuel rate, whatever the model chose.
 */
const HEADER_CONTRADICTS: Record<string, RegExp> = {
  monthly_km: /\b(hours?|hrs|dates?|height|width|length|cubes?|tyres?|kg|tons?|tonnage)\b/i,
  monthly_litres: /\b(hours?|hrs|dates?|height|width|length|cubes?|tyres?|kg|tons?|tonnage|capacity|tank)\b/i,
  fuel_litres: /\b(hours?|hrs|dates?|height|width|length|cubes?|capacity|tank)\b/i,
  l_per_100km_actual: /\b(height|width|length|cubes?|tyres?|hours?|dates?|kg|tons?)\b/i,
  l_per_100km_norm: /\b(height|width|length|cubes?|tyres?|hours?|dates?|kg|tons?)\b/i,
  gvm_kg: /\b(hours?|hrs|dates?|height|width|length|km|kms|litres?)\b/i,
  tare_kg: /\b(hours?|hrs|dates?|height|width|length|km|kms|litres?)\b/i,
  payload_kg: /\b(hours?|hrs|dates?|height|width|length|km|kms|litres?)\b/i,
};

/** Values no column of this field can typically hold. */
const MEDIAN_OUT_OF_RANGE: Record<string, { test: (median: number) => boolean; reads: string }> = {
  monthly_km: { test: (m) => m > 30_000, reads: 'odometer readings' },
  monthly_litres: { test: (m) => m > 20_000, reads: "figures far beyond one vehicle's month of diesel" },
  l_per_100km_actual: { test: (m) => m < 3 || m > 100, reads: 'figures that are not litres per 100 km' },
  l_per_100km_norm: { test: (m) => m < 3 || m > 100, reads: 'figures that are not litres per 100 km' },
  gvm_kg: { test: (m) => m < 300, reads: 'figures too small to be kilograms' },
  tare_kg: { test: (m) => m < 300, reads: 'figures too small to be kilograms' },
  payload_kg: { test: (m) => m < 100, reads: 'figures too small to be kilograms' },
};

const FIELD_WORDS: Record<string, string> = {
  monthly_km: 'kilometres driven in the month',
  monthly_litres: 'litres used in the month',
  fuel_litres: 'litres',
  l_per_100km_actual: 'litres per 100 km',
  l_per_100km_norm: 'a litres-per-100-km norm',
  gvm_kg: 'the GVM',
  tare_kg: 'the tare mass',
  payload_kg: 'the payload',
};

const KM_PER_LITRE = /\bkm\s*\/\s*l(itre)?s?\b|\bkpl\b|\bkm per l(itre)?\b/i;

function numeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\s,]/g, '');
  return /^-?\d+(\.\d+)?$/.test(cleaned) ? Number(cleaned) : null;
}

/**
 * The model maps a column by its HEADER; the code checks its VALUES can mean
 * the field. Acme Group's fleet list mapped "Monthly Update - Current KM" — an
 * odometer, median 71,240 km — to the kilometres driven in the month; a fridge
 * unit's diesel hours to kilometres and its electric-test date to litres; a
 * truck body's height and width (2.73 m, 2.6 m) to litres per 100 km. Added up
 * the fleet "used" 80 times the diesel its depots bought.
 *
 * A column whose header or values contradict its field is not read as it, and
 * the document says which and why. A km-per-litre column mapped to a fuel rate
 * is converted, not dropped.
 */
export function checkEsgColumnMeaning(
  rows: Array<Record<string, unknown>>,
  mapping: Record<string, string>,
): { mapping: Record<string, string>; perLitreFields: string[]; exceptions: string[] } {
  const kept: Record<string, string> = {};
  const perLitreFields: string[] = [];
  const exceptions: string[] = [];
  for (const [header, field] of Object.entries(mapping)) {
    const words = FIELD_WORDS[field];
    if (!words) {
      kept[header] = field;
      continue;
    }
    if ((field === 'l_per_100km_actual' || field === 'l_per_100km_norm') && KM_PER_LITRE.test(header)) {
      kept[header] = field;
      perLitreFields.push(field);
      exceptions.push(`Column "${header}" is kilometres per litre; it was converted to litres per 100 km.`);
      continue;
    }
    if (HEADER_CONTRADICTS[field]?.test(header)) {
      exceptions.push(`Column "${header}" was not read as ${words}: its heading names a different measure.`);
      continue;
    }
    const values = rows.map((row) => numeric(row[header])).filter((n): n is number => n !== null && n !== 0);
    const range = MEDIAN_OUT_OF_RANGE[field];
    if (range && values.length > 0) {
      const sorted = [...values].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      if (range.test(median)) {
        exceptions.push(`Column "${header}" holds ${range.reads} (typically ${Math.round(median * 100) / 100}), so it was not read as ${words}.`);
        continue;
      }
    }
    kept[header] = field;
  }
  return { mapping: kept, perLitreFields, exceptions };
}

/** Human phrasing of one row, for the column-mapping question. */
function whatOneRowIs(documentId: string, grid: DocumentGrid): string {
  const subject = documentId.split('__')[1]?.replace(/_/g, ' ') ?? 'record';
  const meanings = grid.rowFields
    .filter((field) => ROW_FIELD_MEANINGS[field])
    .map((field) => `${field} = ${ROW_FIELD_MEANINGS[field]}`);
  return `one ${subject} row. Columns wanted: ${grid.rowFields.join(', ')}${meanings.length ? `. Where it matters: ${meanings.join('; ')}` : ''}`;
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

  const mapped = await mapSheetColumns(model, shape, input.filename, rows);
  // What the model read a column AS, checked against what the column holds.
  const checked = mapped ? checkEsgColumnMeaning(rows, mapped) : null;
  const mapping = checked?.mapping ?? null;
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
  for (const field of checked?.perLitreFields ?? []) {
    for (const row of table.rows) {
      const kmPerLitre = numeric(row[field]);
      if (kmPerLitre !== null && kmPerLitre > 0) row[field] = Math.round((100 / kmPerLitre) * 100) / 100;
    }
  }

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
    exceptions: [...table.exceptions, ...(checked?.exceptions ?? [])],
  };
}
