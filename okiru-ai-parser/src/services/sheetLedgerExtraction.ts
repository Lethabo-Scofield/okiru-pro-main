/**
 * Read a supplier LEDGER — the accounts-payable extract that proves a spend
 * claim.
 *
 * A ledger is not a schedule and does not look like one. It has no supplier
 * column at all (the supplier is the ACCOUNT the ledger belongs to, named only
 * in the filename), and its money lives in two columns that mean opposite
 * things:
 *
 *   DEBIT  — invoices raised against us. This is the SPEND.
 *   CREDIT — payments we made to settle the account. NOT spend; adding it
 *            double-counts every invoice once more.
 *
 * Getting that backwards inflates a procurement claim by ~2x, which is the
 * direction that gets a certificate revoked, so the column choice here is
 * explicit rather than "whichever numeric column we found".
 *
 * WHY THIS MATTERS BEYOND EXTRACTION: on the real Thandanani pack the BP
 * Edenvale ledger carries R1,628,821.85 of invoices while the client's own
 * schedule claims R412,797.40 for that supplier. The ledger is the higher-
 * fidelity record, and that gap is exactly why the agency's certified TMPS was
 * far larger than the workbook's. This extractor exists so the system can SAY
 * that, rather than scoring the smaller number in silence.
 */
import { createLogger } from '../logger.js';
import { parseMoney } from './moneyParsing.js';
import type { DocumentExtraction } from './aiExtraction.js';

const logger = createLogger('SheetLedgerExtraction');

/** Header shapes, matched case-insensitively against the sheet's own columns. */
const DATE_HEADER = /^(date|txn date|transaction date|doc date)$/i;
const DEBIT_HEADER = /^(debit|invoice[sd]?|invoice amount|charges?)$/i;
const CREDIT_HEADER = /^(credit|payments?|paid|receipts?)$/i;
const BALANCE_HEADER = /(balance|o\/?s)/i;
const GENERIC_AMOUNT_HEADER = /^(amount|value|total|spend)$/i;
/** A column that names a party — its presence means this is a schedule, not a ledger. */
const NAME_HEADER = /(supplier|vendor|beneficiary|creditor|payee|account name|company)/i;

/** "Copy of OUTSURANCE - DETAILED LEDGER.xlsx › Sheet1" → "OUTSURANCE". */
export function supplierNameFromFilename(filename: string): string {
  // The workbook split names a sheet document "parent.xlsx › Sheet1".
  const base = (filename.split('›')[0] ?? filename).trim();
  return base
    .replace(/\.[a-z0-9]+$/i, '')
    // Separators become spaces FIRST: an underscore is a word character, so
    // "LEDGER_FY2025" has no word boundary after "LEDGER" and the boilerplate
    // strip below would sail straight past it.
    .replace(/[_\-–—()]+/g, ' ')
    .replace(/\b(copy of|detailed|detail|general|accounts? payable|ap|creditors?|ledger|statement|account|extract|final|signed)\b/gi, ' ')
    .replace(/\bfy\s*\d{2,4}\b/gi, ' ')
    .replace(/\b\d{4,}\b/g, ' ')
    .replace(/^[\s.\d]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findHeader(headers: string[], pattern: RegExp): string | undefined {
  return headers.find((h) => pattern.test(h.trim()));
}

/**
 * Is this sheet a supplier ledger?
 *
 * Requires the ledger SHAPE (a date column plus a debit/credit column) and the
 * absence of a party column — a spend schedule names its suppliers per row and
 * must keep taking the schedule path. The filename alone is not enough: a file
 * called "ledger" that is really a schedule should be read as a schedule.
 */
export function isLedgerSheet(headers: string[]): boolean {
  if (headers.some((h) => NAME_HEADER.test(h))) return false;
  const hasDate = Boolean(findHeader(headers, DATE_HEADER));
  const hasMoney = Boolean(
    findHeader(headers, DEBIT_HEADER)
    || findHeader(headers, CREDIT_HEADER)
    || findHeader(headers, GENERIC_AMOUNT_HEADER),
  );
  return hasDate && hasMoney;
}

function isLabelledTotalRow(row: Record<string, unknown>): boolean {
  return Object.values(row).some((v) =>
    typeof v === 'string' && /^\s*(sub\s*|grand\s*)?total\b/i.test(v));
}

/**
 * Suppliers whose spend the Codes generally EXCLUDE from Total Measured
 * Procurement Spend: monopolistic supplies and payments to the state (municipal
 * rates, water, electricity, SARS). The real pack files its Ekurhuleni
 * Municipality ledger under "Exclusions" for exactly this reason.
 *
 * This only ever RAISES A FLAG. Whether a given account is excludable is the
 * verification agency's determination — silently dropping it would move a score
 * on our judgement, and silently including it overstates TMPS.
 */
const LIKELY_EXCLUSION_NAME = /\b(municipalit|metro|city of|local authority|eskom|rand water|sars|revenue service|department of|home affairs)/i;

/**
 * What the LINES say. The name is not reliable on its own — the real pack's
 * municipal ledger is filed as "EKJURHULENI LEDGER.xlsx", a misspelling no name
 * list would catch, while its own line items read "INV'S FOR RATES ETC". A
 * municipal account describes itself in its descriptions, so those are the
 * sturdier signal.
 */
const LIKELY_EXCLUSION_DESCRIPTION = /\b(rates|municipal|electricity|water|refuse|sanitation|sewer|property tax|levies|licence|license)\b/i;

export interface LedgerReading {
  supplierName: string;
  /** Sum of the invoice lines — the spend this ledger evidences. */
  spend: number;
  /** How many invoice lines were summed. */
  lines: number;
  /** Which column was treated as spend, for the log and the audit trail. */
  spendColumn: string;
  /** A total stated on the sheet, when one is present. */
  labelledTotal?: number;
  /** True when the account looks like a TMPS exclusion — advisory only. */
  possibleTmpsExclusion: boolean;
  exceptions: string[];
}

/**
 * Read one ledger sheet.
 *
 * Returns null when the sheet is not a ledger or carries no usable invoice
 * line, so the caller keeps whatever its other extractors produced.
 */
export function readLedgerSheet(
  rows: Array<Record<string, unknown>>,
  filename: string,
): LedgerReading | null {
  if (rows.length === 0) return null;

  const headers = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  if (!isLedgerSheet(headers)) return null;

  const debitColumn = findHeader(headers, DEBIT_HEADER);
  const creditColumn = findHeader(headers, CREDIT_HEADER);
  // DEBIT is the spend whenever the ledger keeps both sides. A ledger with only
  // a credit column is the other convention — payments out, one line per
  // instalment — and there the credit IS the spend.
  const spendColumn = debitColumn ?? creditColumn ?? findHeader(headers, GENERIC_AMOUNT_HEADER);
  if (!spendColumn) return null;

  const balanceColumn = findHeader(headers, BALANCE_HEADER);
  const amounts: number[] = [];
  let labelledTotal: number | undefined;

  for (const row of rows) {
    const value = parseMoney(row[spendColumn]);
    if (value === null || value === 0) continue;

    if (isLabelledTotalRow(row)) {
      labelledTotal ??= value;
      continue;
    }

    // A trailing summary line: the ledger's last row repeats the column total
    // with no date and no running balance. It is a total even though nothing
    // spells the word, and counting it doubles the ledger.
    const hasDate = headers.some((h) => DATE_HEADER.test(h) && String(row[h] ?? '').trim() !== '');
    const hasBalance = balanceColumn ? String(row[balanceColumn] ?? '').trim() !== '' : false;
    if (!hasDate && !hasBalance) {
      const runningTotal = amounts.reduce((sum, n) => sum + n, 0);
      if (Math.abs(runningTotal - value) <= Math.max(Math.abs(value) * 0.005, 0.02)) {
        labelledTotal ??= value;
        continue;
      }
    }

    amounts.push(value);
  }

  if (amounts.length === 0) return null;

  const spend = Math.round(amounts.reduce((sum, n) => sum + n, 0) * 100) / 100;
  const exceptions: string[] = [];
  if (labelledTotal !== undefined) {
    const tolerance = Math.max(Math.abs(labelledTotal) * 0.005, 1);
    if (Math.abs(spend - labelledTotal) > tolerance) {
      exceptions.push(
        `Ledger states a total of ${labelledTotal} but its ${amounts.length} ${spendColumn} lines sum to ${spend} — the ledger does not reconcile with itself.`,
      );
    }
  }

  const supplierName = supplierNameFromFilename(filename);
  if (!supplierName) {
    exceptions.push('Ledger carries no supplier column and the filename does not name one — the spend cannot be attributed.');
    return null;
  }

  const descriptions = rows
    .map((row) => headers.map((h) => (/(description|detail|narrative|reference)/i.test(h) ? String(row[h] ?? '') : '')).join(' '))
    .join(' ');
  const possibleTmpsExclusion = LIKELY_EXCLUSION_NAME.test(supplierName)
    || LIKELY_EXCLUSION_DESCRIPTION.test(descriptions);
  if (possibleTmpsExclusion) {
    exceptions.push(
      `"${supplierName}" looks like a municipal / state account. The Codes generally EXCLUDE such supplies from Total Measured Procurement Spend — confirm before counting this ${spend} toward TMPS.`,
    );
  }

  return {
    supplierName,
    spend,
    lines: amounts.length,
    spendColumn,
    labelledTotal,
    possibleTmpsExclusion,
    exceptions,
  };
}

/**
 * Read a ledger as a one-row supplier table, so it reaches the workbook by the
 * same path a spend schedule does.
 *
 * Deliberately NOT one row per invoice line: a ledger evidences one supplier's
 * total, and emitting its lines as separate supplier rows would present a
 * single account as twenty suppliers.
 */
export function extractLedgerTable(
  rows: Array<Record<string, unknown>>,
  filename: string,
): DocumentExtraction | null {
  const reading = readLedgerSheet(rows, filename);
  if (!reading) return null;

  logger.info('Read supplier ledger', {
    file: filename,
    supplier: reading.supplierName,
    spendColumn: reading.spendColumn,
    lines: reading.lines,
    spend: reading.spend,
    reconciles: reading.exceptions.length === 0,
    possibleTmpsExclusion: reading.possibleTmpsExclusion,
  });

  // A likely EXCLUSION is reported but NOT handed over as spend. Counting a
  // municipal account toward TMPS inflates the denominator's numerator on our
  // own judgement — the direction that gets a certificate revoked. The finding
  // still reaches the user, who can enter it deliberately if the agency rules
  // it includable.
  const values = reading.possibleTmpsExclusion
    ? []
    : [{
      field: 'supplier_rows',
      value: [{
        supplier_name: reading.supplierName,
        claimed_spend_ex_vat: reading.spend,
      }],
      sourceFile: filename,
      sourceDocumentId: 'sheet_table__esd',
    }];

  return {
    documentId: 'sheet_table__esd',
    documentName: 'Supplier ledger',
    element: 'ESD',
    sourceFile: filename,
    values,
    missingFields: [],
    unexpectedFields: [],
    exceptions: reading.exceptions,
  };
}
