/**
 * Read a one-period summary sheet — a row per vehicle (or meter, or site) for
 * ONE month at ONE site — as that site's monthly figure.
 *
 * WHY THIS EXISTS
 *
 * The commonest fleet document a transport company has is a depot's monthly
 * fuel report: a title naming the depot and the month ("Daily and monthly
 * diesel control Alderwood", dated 1 March 2026), then a row per vehicle —
 * registration, make, kilometres, litres issued — and a total. The workbook
 * wants exactly one number from it: that depot's diesel for that month.
 *
 * Read flat, the sheet gave the model an impossible question ("the fuel_litres
 * of this document"), so it returned one vehicle's litres or none, and the
 * site and month — which live in the title, not in any row — were lost. A
 * month's fleet diesel for a depot was never placed from the one document
 * that states it.
 *
 * THE SPLIT OF LABOUR, as in the other sheet readers:
 *   - The MODEL answers one closed question per sheet SHAPE, cached: does this
 *     sheet cover one period? Which site and month (from its title)? Which
 *     column labels the rows, which holds the quantity, which measure is it?
 *   - The CODE adds the rows up. It stops at the sheet's own total row and
 *     checks against it — the rows are the evidence, and a total that does not
 *     match them is reported, never used.
 */
import { createLogger } from '../logger.js';
import type { DocumentExtraction, ExtractionModel } from './aiExtraction.js';
import { ESG_MONTHLY_MEASURES, type EsgMonthlyMeasure } from './esgMonthlyTables.js';
import { decisionFingerprint, rememberDecision } from './semanticDecisionCache.js';

const logger = createLogger('EsgPeriodSummaries');

export interface PeriodSummaryReading {
  /** False when the sheet is not one period's summary — nothing is read. */
  singlePeriod: boolean;
  /**
   * Whose consumption the sheet totals: the whole SITE (a depot's monthly
   * report), or ONE vehicle / meter (a vehicle's own fuel log, kept a tab per
   * vehicle). Only a whole-site sheet is that site's figure for the month.
   */
  covers: 'site' | 'one' | 'other';
  site: string | null;
  /** Last day of the period's month, ISO. */
  periodEnd: string | null;
  /** The header naming each row (a registration, a meter). */
  labelColumn: string | null;
  quantityColumn: string | null;
  measure: EsgMonthlyMeasure | 'none';
  unit: string;
}

const SYSTEM = [
  "You read the structure of a sheet from a company's operational report for an ESG workbook.",
  'Decide whether the sheet summarises ONE period (one month) for ONE site, and whether it totals the',
  'WHOLE site ("site": one row per vehicle, meter or the like, as in a depot\'s monthly fuel report) or',
  'ONE vehicle or meter ("one": that vehicle\'s own log, rows are dates or transactions). If it is one',
  'period, give the site and the month as the title or dates state them, the column that names each row,',
  'the column holding the quantity (the TOTAL litres per row when there are internal and external',
  'columns), and which measure that is, from the list given. Reply with JSON only.',
].join(' ');

/** Text of the first rows of a sheet, as the person opening it would see them. */
function topOfSheet(matrix: unknown[][], rows: number): string {
  return matrix.slice(0, rows)
    .map((row) => row.map((cell) => {
      if (typeof cell === 'number' && Number.isInteger(cell) && cell > 36526 && cell < 73051) {
        // An Excel date serial in a title row is the report's date — show it as one.
        const date = new Date(Math.round((cell - 25569) * 86400 * 1000));
        return `${cell} (=${date.toISOString().slice(0, 10)} if a date)`;
      }
      return String(cell ?? '').replace(/\s+/g, ' ').trim();
    }).filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n');
}

const isoMonthEnd = (iso: string): string | null => {
  const m = /^(\d{4})-(\d{2})/.exec(iso.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${m[1]}-${m[2]}-${String(last).padStart(2, '0')}`;
};

async function readSheet(
  model: ExtractionModel,
  input: { filename: string; sheetName?: string; matrix: unknown[][]; headers: string[] },
): Promise<PeriodSummaryReading | null> {
  const user = [
    `FILE: ${input.filename}`,
    `SHEET: ${input.sheetName ?? ''}`,
    'TOP OF THE SHEET:',
    topOfSheet(input.matrix, 14),
    `COLUMN HEADERS (choose columns from these, exactly as written): ${JSON.stringify(input.headers)}`,
    'MEASURES:',
    ...Object.entries(ESG_MONTHLY_MEASURES).map(([key, spec]) => `  ${key}: ${spec.what} (stored in ${spec.unit})`),
    'Reply: {"single_period":boolean,"covers":"site"|"one"|"other","site":string|null,"period_month":"YYYY-MM"|null,',
    '"label_column":string|null,"quantity_column":string|null,"measure":"<measure or none>","unit":"L"|"kL"|"kWh"|"kg"|"km"|"other"}',
  ].join('\n');

  const fingerprint = decisionFingerprint([
    'esgperiod',
    input.sheetName ?? '',
    topOfSheet(input.matrix.slice(0, 4), 4),
    ...input.headers,
  ]);

  try {
    const decision = await rememberDecision<PeriodSummaryReading | null>('esgperiod', fingerprint, async () => {
      const ask = model.completeHard?.bind(model) ?? model.complete.bind(model);
      const reply = await ask(SYSTEM, user);
      const json = JSON.parse(reply.slice(reply.indexOf('{'), reply.lastIndexOf('}') + 1)) as Record<string, any>;
      const measure = String(json.measure ?? 'none');
      const column = (value: unknown) => (typeof value === 'string' && input.headers.includes(value) ? value : null);
      return {
        singlePeriod: json.single_period === true,
        covers: json.covers === 'site' ? 'site' : json.covers === 'one' ? 'one' : 'other',
        site: typeof json.site === 'string' && json.site.trim() ? json.site.trim() : null,
        periodEnd: typeof json.period_month === 'string' ? isoMonthEnd(json.period_month) : null,
        labelColumn: column(json.label_column),
        quantityColumn: column(json.quantity_column),
        measure: (measure in ESG_MONTHLY_MEASURES ? measure : 'none') as PeriodSummaryReading['measure'],
        unit: String(json.unit ?? 'other'),
      };
    });
    return decision.value;
  } catch (err) {
    logger.warn('Period summary could not be read', { file: input.filename, sheet: input.sheetName, reason: (err as Error).message });
    return null;
  }
}

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && /^-?[\d\s,]*\.?\d+$/.test(value.trim())) {
    const n = Number(value.replace(/[\s,]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/**
 * Add the rows up, stopping at the sheet's own total row (a row with a quantity
 * and no label) once rows have been counted. What follows a closing total is
 * other business — an "External Vehicles" line, a lookup table — and is not
 * this period's figure. A total stated ABOVE the rows ("TOTAL TO BE INVOICED"
 * under the header) is kept to check against, and the rows below it are read.
 */
export function sumPeriodRows(
  rows: Array<Record<string, unknown>>,
  labelColumn: string,
  quantityColumn: string,
): { sum: number; counted: number; statedTotal: number | null } {
  let sum = 0;
  let counted = 0;
  let statedTotal: number | null = null;
  for (const row of rows) {
    const quantity = asNumber(row[quantityColumn]);
    const label = String(row[labelColumn] ?? '').trim();
    const isTotal = !label || /^(grand\s+)?(sub-?)?totals?\b/i.test(label);
    if (isTotal) {
      if (quantity === null) continue;
      if (counted > 0) return { sum, counted, statedTotal: quantity };
      statedTotal = quantity;
      continue;
    }
    if (quantity === null) continue;
    sum += quantity;
    counted += 1;
  }
  return { sum, counted, statedTotal };
}

/**
 * Whether the top of a sheet dates it — the cheap, free test that decides if
 * the one-period question is worth asking. A sheet per vehicle opens with
 * "Fleet Number:-"; a depot's monthly report opens with its title and month.
 */
export function topOfSheetIsDated(matrix: unknown[][] | undefined): boolean {
  if (!matrix) return false;
  return matrix.slice(0, 3).some((row) => row.some((cell) => {
    if (typeof cell === 'number') return Number.isInteger(cell) && cell > 36526 && cell < 73051;
    if (typeof cell !== 'string') return false;
    return /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s\-/]+(19|20)\d{2}\b|\b(19|20)\d{2}[-/](0?[1-9]|1[0-2])\b/i.test(cell);
  }));
}

/**
 * Where a column named `name` sits in the raw sheet: its header row and index.
 * Matches the header as written, or as the sheet reader names a duplicate
 * ("Internal Fuel" for a "Fuel" under "Internal").
 */
export function findColumn(matrix: unknown[][], name: string): { row: number; col: number } | null {
  const norm = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const want = norm(name);
  for (let r = 0; r < Math.min(matrix.length, 30); r += 1) {
    const row = matrix[r] ?? [];
    for (let c = 0; c < row.length; c += 1) {
      const cell = norm(row[c]);
      if (!cell) continue;
      if (cell === want) return { row: r, col: c };
      const above = r > 0 ? norm((matrix[r - 1] ?? [])[c]) : '';
      if (above && `${above} ${cell}` === want) return { row: r, col: c };
    }
  }
  return null;
}

/**
 * Add a sheet's rows up from its RAW cells. The header-keyed rows the sheet
 * reader builds fill a blank label with the label above it — right for a
 * training register's continuation lines, wrong here: it gave the total row
 * the last vehicle's registration, so the sum never stopped and ran on through
 * the lookup tables below (a 6,140 L month read as 24,310).
 */
export function sumPeriodMatrix(
  matrix: unknown[][],
  labelColumn: string,
  quantityColumn: string,
): { sum: number; counted: number; statedTotal: number | null } | null {
  const label = findColumn(matrix, labelColumn);
  const quantity = findColumn(matrix, quantityColumn);
  if (!label || !quantity || label.row !== quantity.row) return null;
  const rows = matrix.slice(label.row + 1).map((row) => ({
    [labelColumn]: row[label.col],
    [quantityColumn]: row[quantity.col],
  }));
  return sumPeriodRows(rows, labelColumn, quantityColumn);
}

export interface EsgPeriodSheetInput {
  filename: string;
  sheetName?: string;
  matrix?: unknown[][];
  rows?: Array<Record<string, unknown>>;
}

/** Read a one-period summary sheet. Null when it is not one, or names nothing the workbook keeps. */
export async function extractEsgPeriodSummary(
  model: ExtractionModel,
  input: EsgPeriodSheetInput,
): Promise<DocumentExtraction | null> {
  const { matrix, rows } = input;
  if (!matrix || !rows || rows.length < 2) return null;
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  if (headers.length < 3) return null;

  const reading = await readSheet(model, { filename: input.filename, sheetName: input.sheetName, matrix, headers });
  if (!reading || !reading.singlePeriod || reading.measure === 'none') return null;
  // One vehicle's own log is that vehicle's month, not the depot's.
  if (reading.covers !== 'site') return null;
  if (!reading.labelColumn || !reading.quantityColumn || !reading.periodEnd) return null;
  if (reading.unit !== ESG_MONTHLY_MEASURES[reading.measure].unit) return null;

  const summed = sumPeriodMatrix(matrix, reading.labelColumn, reading.quantityColumn);
  if (!summed || summed.counted === 0) return null;
  const { sum, counted, statedTotal } = summed;
  const value = Math.round(sum * 1e4) / 1e4;

  const exceptions: string[] = [
    `${counted} row(s) of "${reading.quantityColumn}" add to ${value} ${reading.unit} for ${reading.site ?? 'the company'} in ${reading.periodEnd.slice(0, 7)}.`,
  ];
  if (statedTotal !== null && Math.abs(statedTotal - sum) > Math.max(0.5, Math.abs(sum) * 0.005)) {
    exceptions.push(
      `The sheet's own total says ${statedTotal}, but its rows add to ${value}. The rows were used — check the total row.`,
    );
  }

  logger.info('Read one-period summary deterministically', {
    file: input.filename,
    measure: reading.measure,
    site: reading.site,
    period: reading.periodEnd,
    rows: counted,
  });

  return {
    documentId: 'esg_period_summary',
    documentName: `${input.sheetName ?? input.filename} period summary`,
    sourceFile: input.filename,
    values: [{
      field: 'esg_monthly_rows',
      value: [{
        monthly_measure: reading.measure,
        monthly_site: reading.site,
        monthly_period_end: reading.periodEnd,
        monthly_value: value,
        monthly_unit: reading.unit,
      }],
      sourceFile: input.filename,
      sourceDocumentId: 'esg_period_summary',
    }],
    missingFields: [],
    unexpectedFields: [],
    exceptions,
  };
}
