/**
 * Deterministic table extraction: the MODEL maps columns, the CODE reads rows.
 *
 * The old table extractor sent a sheet's markdown to the model and asked it to
 * re-type every row. On a 23-supplier schedule the model returned 14 — not
 * because the data was hard, but because transcription is the one job a language
 * model does unreliably and the one job the code had ALREADY done: the workbook
 * split parses every row into header-keyed objects before the model is ever
 * called.
 *
 * So the split of labour is now the right way around:
 *
 *   - The model answers ONE small semantic question — "which sheet column means
 *     supplier_name, which means claimed_spend_ex_vat?" — from the headers and a
 *     handful of sample rows. Its output is a tiny JSON mapping.
 *   - The code applies that mapping to EVERY parsed row. 23 rows in, 23 rows
 *     out, verbatim cell values, no truncation possible by construction.
 *
 * The same pass gives verification for free: total rows ("TOTAL", "Grand
 * total") are recognised, excluded from the data, and their labelled figures
 * kept — then the extracted rows are SUMMED against them. A mismatch does not
 * block extraction; it is reported as an exception so a reviewer (and the
 * toolkit) can see exactly what did not reconcile.
 */
import { createLogger } from '../logger.js';
import { parseMoney } from './moneyParsing.js';
import type { ExtractionModel } from './aiExtraction.js';
import {
  decisionFingerprint,
  rememberDecision,
  type RememberedDecision,
} from './semanticDecisionCache.js';

const logger = createLogger('SheetColumnMapping');

export interface TableShape {
  /** Target field the downstream bridge maps (supplier_name, claimed_spend_ex_vat, …). */
  columns: string[];
  /** Human description of what one row is — context for the mapping question. */
  what: string;
}

export interface DeterministicTableResult {
  /** Every data row, keyed by target field names, cell values verbatim. */
  rows: Array<Record<string, unknown>>;
  /** Reconciliation findings — advisory, never blocking. */
  exceptions: string[];
  /** How the table was read, for the log line and tests. */
  stats: {
    sheetRows: number;
    extractedRows: number;
    totalRowsSkipped: number;
    keylessRowsSkipped: number;
    /** Rows that inherited the key from the block above (merged-cell layout). */
    forwardFilledRows: number;
  };
}

/** Union of keys across rows, in first-seen order — the sheet's real columns. */
export function collectHeaders(rows: Array<Record<string, unknown>>): string[] {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return headers;
}

/** A short, varied sample: first rows plus one from the middle and the last. */
function sampleRows(rows: Array<Record<string, unknown>>, count = 4): Array<Record<string, unknown>> {
  if (rows.length <= count) return rows;
  const picks = [0, 1, Math.floor(rows.length / 2), rows.length - 1];
  return Array.from(new Set(picks)).map((i) => rows[i]);
}

function truncateCell(value: unknown, max = 60): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

const MAPPING_SYSTEM_PROMPT = [
  'You map the columns of a B-BBEE workbook sheet to canonical field names.',
  'Return ONLY a JSON object: {"mapping": {"<sheet column header>": "<target field>"}}.',
  'Rules:',
  '- Map only columns that clearly mean one of the target fields; omit every other column.',
  '- Never map two sheet columns to the same target field.',
  '- Copy each sheet column header EXACTLY as given — headers are lookup keys.',
  '- If none of the columns match the target fields, return {"mapping": {}}.',
].join('\n');

/**
 * Ask the model which sheet column carries which target field.
 *
 * Returns null when the model call fails or the reply holds no usable mapping —
 * the caller then falls back to the legacy whole-table model read, so this can
 * never make a sheet LESS readable than before.
 */
export async function mapSheetColumns(
  model: ExtractionModel,
  shape: TableShape,
  sheetName: string,
  rows: Array<Record<string, unknown>>,
): Promise<Record<string, string> | null> {
  const headers = collectHeaders(rows);
  if (headers.length === 0) return null;

  const samples = sampleRows(rows).map((row) => {
    const compact: Record<string, string> = {};
    for (const header of headers) {
      const cell = truncateCell(row[header]);
      if (cell !== '') compact[header] = cell;
    }
    return compact;
  });

  const user = [
    `SHEET: ${sheetName}`,
    `One row is ${shape.what}.`,
    `TARGET FIELDS: ${shape.columns.join(', ')}`,
    `SHEET COLUMNS: ${JSON.stringify(headers)}`,
    `SAMPLE ROWS (${samples.length} of ${rows.length}):`,
    JSON.stringify(samples, null, 1),
  ].join('\n');

  // What a COLUMN means is a property of the template, not of the run, so the
  // mapping is fingerprinted on the sheet + its (sorted) headers + the fields
  // asked for, and decided once. Re-asking per upload is what let a workbook
  // whose header row reads "… | Training Program | Total Cost (R)" map its cost
  // column on one run and not the next — and an unmapped cost column scores
  // zero, silently. Only the sheet NAME enters the fingerprint (not the file
  // name), so two clients on one template share the decision.
  const fingerprint = decisionFingerprint([
    'cols',
    templateSheetName(sheetName),
    [...shape.columns].sort().join(','),
    ...[...headers].sort(),
  ]);

  let decision: RememberedDecision<Record<string, string>>;
  try {
    decision = await rememberDecision<Record<string, string>>('cols', fingerprint, async () => {
      // A throw is transient and stays uncached; a reply that maps nothing is a
      // real decision and is remembered rather than re-rolled.
      const reply = await model.complete(MAPPING_SYSTEM_PROMPT, user);
      const parsed = parseMappingReply(reply);
      if (!parsed) return null;
      const mapping = validateMapping(parsed, headers, shape.columns);
      return Object.keys(mapping).length > 0 ? mapping : null;
    });
  } catch (err) {
    logger.warn('Column mapping call failed', { sheet: sheetName, reason: (err as Error).message });
    return null;
  }

  if (decision.value && decision.replayed) {
    logger.info('Column mapping replayed from a prior decision', {
      sheet: sheetName,
      fields: Object.values(decision.value).length,
    });
  }
  return decision.value;
}

/** The sheet name inside a split-workbook filename ("File.xlsx › Procurement"). */
function templateSheetName(filename: string): string {
  const marker = filename.indexOf('›');
  return (marker >= 0 ? filename.slice(marker + 1) : filename).trim();
}

/**
 * Validate a model mapping against reality: keys must be real headers (exact,
 * then whitespace-collapsed case-insensitive), values must be requested fields,
 * and a target field may be claimed once only.
 */
function validateMapping(
  parsed: Record<string, unknown>,
  headers: string[],
  allowed: string[],
): Record<string, string> {
  const headerLookup = new Map(headers.map((h) => [normHeader(h), h]));
  const allowedFields = new Set(allowed);
  const claimed = new Set<string>();
  const mapping: Record<string, string> = {};
  for (const [rawHeader, field] of Object.entries(parsed)) {
    if (typeof field !== 'string' || !allowedFields.has(field) || claimed.has(field)) continue;
    const header = headers.includes(rawHeader) ? rawHeader : headerLookup.get(normHeader(rawHeader));
    if (!header) continue;
    claimed.add(field);
    mapping[header] = field;
  }
  return mapping;
}

function normHeader(header: string): string {
  return header.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseMappingReply(reply: string): Record<string, unknown> | null {
  const start = reply.indexOf('{');
  const end = reply.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(reply.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, unknown>;
  const candidate = record.mapping ?? record;
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  return candidate as Record<string, unknown>;
}

/** Does any cell label this row as a total line? */
function isTotalRow(row: Record<string, unknown>): boolean {
  return Object.values(row).some((value) =>
    typeof value === 'string' && /^\s*(sub\s*)?(grand\s*)?total\b/i.test(value));
}

/**
 * Apply a validated column mapping to every parsed row.
 *
 * The first target field in `shape.columns` is the row's KEY (the name column).
 * Real schedules write the key ONCE per block — a beneficiary's name on the
 * first of thirteen monthly contribution lines, exactly how merged cells
 * export. So a keyless row that still carries evidence INHERITS the key from
 * the block above (forward-fill of the key only, nothing else). A keyless row
 * before any keyed row is summary noise and is skipped. Total rows are
 * excluded from the data but their labelled figures are captured, and the
 * extracted rows are summed against them — a mismatch is reported, never
 * silently accepted.
 */
export function applyColumnMapping(
  rows: Array<Record<string, unknown>>,
  mapping: Record<string, string>,
  shape: TableShape,
): DeterministicTableResult {
  const keyField = shape.columns[0];
  const mapped: Array<Record<string, unknown>> = [];
  const labelledTotals: Record<string, number> = {};
  let totalRowsSkipped = 0;
  let keylessRowsSkipped = 0;
  let forwardFilledRows = 0;
  let lastKey = '';

  for (const row of rows) {
    const out: Record<string, unknown> = {};
    for (const [header, field] of Object.entries(mapping)) {
      const value = row[header];
      if (value === null || value === undefined || String(value).trim() === '') continue;
      out[field] = value;
    }

    if (isTotalRow(row)) {
      totalRowsSkipped += 1;
      // A total line closes its block: rows after it must not inherit the name.
      lastKey = '';
      for (const [field, value] of Object.entries(out)) {
        if (field === keyField) continue;
        const numeric = parseMoney(value);
        if (numeric !== null && labelledTotals[field] === undefined) labelledTotals[field] = numeric;
      }
      continue;
    }

    let key = String(out[keyField] ?? '').trim();
    if (key === '') {
      // Inherit the block's key only when the row still says something —
      // an empty template line stays skipped even inside a block.
      const hasEvidence = Object.keys(out).length > 0;
      if (hasEvidence && lastKey !== '') {
        out[keyField] = lastKey;
        key = lastKey;
        forwardFilledRows += 1;
      } else {
        if (hasEvidence) keylessRowsSkipped += 1;
        continue;
      }
    } else {
      lastKey = key;
    }
    mapped.push(out);
  }

  const exceptions: string[] = [];
  for (const [field, labelled] of Object.entries(labelledTotals)) {
    let sum = 0;
    let counted = 0;
    for (const row of mapped) {
      const numeric = parseMoney(row[field]);
      if (numeric !== null) {
        sum += numeric;
        counted += 1;
      }
    }
    if (counted === 0) continue;
    const tolerance = Math.max(Math.abs(labelled) * 0.005, 1);
    if (Math.abs(sum - labelled) > tolerance) {
      exceptions.push(
        `Sheet labels ${field} total ${labelled} but the ${counted} extracted rows sum to ${round2(sum)} — evidence does not reconcile.`,
      );
    }
  }

  return {
    rows: mapped,
    exceptions,
    stats: {
      sheetRows: rows.length,
      extractedRows: mapped.length,
      totalRowsSkipped,
      keylessRowsSkipped,
      forwardFilledRows,
    },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
