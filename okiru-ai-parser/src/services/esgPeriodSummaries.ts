/**
 * Read a one-period summary sheet — a row per vehicle (or meter, or site) for
 * ONE month at ONE site — as that site's monthly figure.
 *
 * WHY THIS EXISTS
 *
 * The commonest fleet document a transport company has is a depot's monthly
 * fuel report: a title naming the depot and the month ("Daily and monthly
 * diesel control Bloemfontein", dated 1 March 2026), then a row per vehicle —
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
 *
 * THE VEHICLES ARE KEPT TOO. A depot's fuel report is also the one document
 * that states each vehicle's month — its litres beside the kilometres it drove
 * — which is what emissions vehicle by vehicle are calculated from. The same
 * rows that make the depot's figure become fleet rows, each stamped with the
 * month it covers, so a vehicle's kilometres and litres are always one
 * document's month and never paired with another's.
 */
import { createLogger } from '../logger.js';
import type { DocumentExtraction, ExtractionModel } from './aiExtraction.js';
import { ROW_PERIOD_KEY } from './entityResolution.js';
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
  /** When the rows are vehicles: the kilometres each drove in the period — never an odometer reading. */
  distanceColumn: string | null;
  /** When the rows are vehicles: each one's litres-per-100-km norm or target, if the sheet states one. */
  normColumn: string | null;
  /** When the rows are vehicles: the column naming each one's make or model. */
  modelColumn: string | null;
}

const SYSTEM = [
  "You read the structure of a sheet from a company's operational report for an ESG workbook.",
  'Decide whether the sheet summarises ONE period (one month) for ONE site, and whether it totals the',
  'WHOLE site ("site": one row per vehicle, meter or the like, as in a depot\'s monthly fuel report) or',
  'ONE vehicle or meter ("one": that vehicle\'s own log, rows are dates or transactions). If it is one',
  'period, give the site and the month as the title or dates state them, the column that names each row,',
  'the column holding the quantity (the TOTAL litres per row when there are internal and external',
  'columns), and which measure that is, from the list given. When the rows are vehicles, also give the',
  'column of kilometres each drove in the period (NOT an odometer or closing reading), the column of its',
  'MEASURED litres per 100 km if the sheet works one out (its litres over its kilometres), SEPARATELY the',
  'column of its litres-per-100-km NORM or target if the sheet has one, and the column naming its make or',
  'model; null for any the sheet does not have. Reply with JSON only.',
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
    '"label_column":string|null,"quantity_column":string|null,"measure":"<measure or none>","unit":"L"|"kL"|"kWh"|"kg"|"km"|"other",',
    '"distance_column":string|null,"rate_column":string|null,"norm_column":string|null,"model_column":string|null}',
  ].join('\n');

  // "vehicles": a decision remembered from before the vehicle columns were
  // asked for has none of them, and is not reused.
  const fingerprint = decisionFingerprint([
    'esgperiod',
    'vehicles-2',
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
        distanceColumn: column(json.distance_column),
        // The measured rate is asked for only so it is not given as the norm.
        normColumn: column(json.norm_column) === column(json.rate_column) ? null : column(json.norm_column),
        modelColumn: column(json.model_column),
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
  const { counted, statedTotal } = walkPeriodRows(rows, labelColumn, quantityColumn);
  return { sum: counted.reduce((total, row) => total + row.quantity, 0), counted: counted.length, statedTotal };
}

/** The rows a period's figure is made of, and the sheet's stated total, by the rule above. */
function walkPeriodRows<T extends Record<string, unknown>>(
  rows: T[],
  labelColumn: string,
  quantityColumn: string,
): { counted: Array<{ row: T; label: string; quantity: number }>; statedTotal: number | null } {
  const counted: Array<{ row: T; label: string; quantity: number }> = [];
  let statedTotal: number | null = null;
  for (const row of rows) {
    const quantity = asNumber(row[quantityColumn]);
    const label = String(row[labelColumn] ?? '').trim();
    const isTotal = !label || /^(grand\s+)?(sub-?)?totals?\b/i.test(label);
    if (isTotal) {
      if (quantity === null) continue;
      if (counted.length > 0) return { counted, statedTotal: quantity };
      statedTotal = quantity;
      continue;
    }
    if (quantity === null) continue;
    counted.push({ row, label, quantity });
  }
  return { counted, statedTotal };
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
 * the lookup tables below (a 5,922 L month read as 23,999).
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

/** A row label that names a vehicle: a registration or fleet number, letters and digits. */
function namesAVehicle(label: string): boolean {
  const compact = label.replace(/[\s-]/g, '');
  return /^[a-z0-9]{4,14}$/i.test(compact) && /[a-z]/i.test(compact) && /\d/.test(compact);
}

/**
 * The vehicle a sheet is kept for — one tab per vehicle in a depot's fuel
 * report, its fills listed by date with no registration on any row. Read from
 * the tab's NAME, and only when its title rows repeat it: "Sheet2" or "Detail3"
 * also mix letters and digits, but no title names them.
 */
export function vehicleOfSheet(sheetName: string | undefined, matrix: unknown[][] | undefined): string | null {
  if (!sheetName || !matrix || !namesAVehicle(sheetName.trim())) return null;
  const compact = (text: string) => text.replace(/[\s-]/g, '').toUpperCase();
  const name = compact(sheetName);
  const titled = matrix.slice(0, 6).some((row) => row.some((cell) => typeof cell === 'string' && compact(cell) === name));
  return titled ? sheetName.trim() : null;
}

/**
 * A vehicle's own fuel log, its fills each made that vehicle's. The log's
 * "Totals" line is the sum of those fills, not one more, and is left as it is.
 */
export function fillsOfVehicle(rows: unknown[], vehicle: string): unknown[] {
  const isTotalLine = (row: Record<string, unknown>) =>
    Object.values(row).some((cell) => typeof cell === 'string' && /^(grand\s+)?(sub-?)?totals?\b/i.test(cell.trim()));
  return rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const record = row as Record<string, unknown>;
    return record.vehicle_registration || isTotalLine(record) ? row : { ...record, vehicle_registration: vehicle };
  });
}

/** Beyond what one vehicle drives in a month: an odometer reading, not the month's distance. */
const MAX_MONTH_KM = 30_000;

/**
 * The vehicles behind a depot's month, from the RAW cells and over exactly the
 * rows the depot's figure adds up: each one's registration and litres (or
 * kilometres, for a distance report), and — where the sheet states them — the
 * kilometres it drove, its norm and its model. Each row is stamped with the
 * month. A distance column that holds odometer readings is not read, and said.
 */
export function periodVehicleRows(
  matrix: unknown[][],
  reading: PeriodSummaryReading,
): { rows: Array<Record<string, unknown>>; notes: string[] } {
  const none = { rows: [], notes: [] };
  const fuel = reading.measure === 'fleet.diesel_litres';
  if (!fuel && reading.measure !== 'fleet.distance_km') return none;
  if (!reading.labelColumn || !reading.quantityColumn || !reading.periodEnd) return none;
  const label = findColumn(matrix, reading.labelColumn);
  const quantity = findColumn(matrix, reading.quantityColumn);
  if (!label || !quantity || label.row !== quantity.row) return none;
  // A two-row header names some columns on the row above the labels.
  const beside = (name: string | null) => {
    const found = name ? findColumn(matrix, name) : null;
    return found && Math.abs(found.row - label.row) <= 1 ? found.col : null;
  };
  const distanceCol = fuel ? beside(reading.distanceColumn) : null;
  const normCol = beside(reading.normColumn);
  const modelCol = beside(reading.modelColumn);
  const cells = matrix.slice(label.row + 1).map((row) => ({
    label: row[label.col],
    quantity: row[quantity.col],
    distance: distanceCol === null ? null : row[distanceCol],
    norm: normCol === null ? null : row[normCol],
    model: modelCol === null ? null : row[modelCol],
  }));
  const { counted } = walkPeriodRows(cells, 'label', 'quantity');
  const month = reading.periodEnd.slice(0, 7);

  const distances = counted.map((c) => asNumber(c.row.distance)).filter((d): d is number => d !== null);
  const odometers = distances.filter((d) => d > MAX_MONTH_KM).length;
  // Mostly beyond a month's driving: the column is an odometer, small values included.
  const distanceIsOdometer = distances.length > 0 && odometers * 2 >= distances.length;
  const notes: string[] = [];
  if (distanceIsOdometer) {
    notes.push(`"${reading.distanceColumn}" holds odometer readings, not the kilometres driven in the month, so no vehicle's kilometres were read from it.`);
  } else if (odometers > 0) {
    notes.push(`${odometers} vehicle(s) show more than ${MAX_MONTH_KM.toLocaleString('en-ZA')} km in "${reading.distanceColumn}", more than one vehicle drives in a month; their kilometres were not read.`);
  }

  const rows: Array<Record<string, unknown>> = [];
  for (const { row, label: name, quantity: amount } of counted) {
    if (!namesAVehicle(name)) continue;
    const vehicle: Record<string, unknown> = {
      vehicle_registration: name,
      [fuel ? 'monthly_litres' : 'monthly_km']: amount,
      [ROW_PERIOD_KEY]: month,
    };
    const km = distanceIsOdometer ? null : asNumber(row.distance);
    if (km !== null && km >= 0 && km <= MAX_MONTH_KM) vehicle.monthly_km = km;
    const norm = asNumber(row.norm);
    if (norm !== null && norm >= 3 && norm <= 100) vehicle.l_per_100km_norm = norm;
    const model = String(row.model ?? '').replace(/\s+/g, ' ').trim();
    if (model) vehicle.vehicle_make_model = model;
    if (reading.site) vehicle.depot_name = reading.site;
    rows.push(vehicle);
  }

  // A "norm" that is each vehicle's own litres over its kilometres is the rate
  // it ran at, not the rate it should run at.
  const compared = rows.filter((r) => typeof r.l_per_100km_norm === 'number' && Number(r.monthly_km) > 0 && Number(r.monthly_litres) > 0);
  const ranAt = compared.filter((r) => {
    const measured = (Number(r.monthly_litres) / Number(r.monthly_km)) * 100;
    return Math.abs(Number(r.l_per_100km_norm) - measured) <= Math.max(0.05, measured * 0.01);
  });
  if (compared.length > 0 && ranAt.length * 2 >= compared.length) {
    for (const row of rows) delete row.l_per_100km_norm;
    notes.push(`"${reading.normColumn}" is each vehicle's measured rate (its litres over its kilometres), not a norm, so it was not read as one.`);
  }
  return { rows, notes };
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

  // The same rows, vehicle by vehicle: the month each one drove and fuelled.
  const vehicles = periodVehicleRows(matrix, reading);
  if (vehicles.rows.length > 0) {
    const withKm = vehicles.rows.filter((row) => row.monthly_km !== undefined && row.monthly_litres !== undefined).length;
    exceptions.push(
      `${vehicles.rows.length} vehicle(s) read with their own ${reading.periodEnd.slice(0, 7)} figures` +
        (withKm > 0 ? `, ${withKm} with both litres and kilometres.` : '.'),
    );
  }
  exceptions.push(...vehicles.notes);

  logger.info('Read one-period summary deterministically', {
    file: input.filename,
    measure: reading.measure,
    site: reading.site,
    period: reading.periodEnd,
    rows: counted,
    vehicles: vehicles.rows.length,
  });

  return {
    documentId: 'esg_period_summary',
    documentName: `${input.sheetName ?? input.filename} period summary`,
    sourceFile: input.filename,
    values: [
      {
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
      },
      ...(vehicles.rows.length > 0
        ? [{ field: 'fleet_vehicle_rows', value: vehicles.rows, sourceFile: input.filename, sourceDocumentId: 'esg_period_summary' }]
        : []),
    ],
    missingFields: [],
    unexpectedFields: [],
    exceptions,
  };
}
