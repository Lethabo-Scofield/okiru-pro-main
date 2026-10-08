/**
 * THE FIGURES A SKILL FORBIDS THE MODEL TO COMPUTE, computed here.
 *
 * Every skill tells the model to copy values AS PRINTED and never to add,
 * count, multiply or decide whether a date falls inside the measurement
 * period: a model that sums twelve SDL figures gets one wrong some of the
 * time, and it never knows the measurement period (that is not in the
 * document). The skills therefore return the rows (one EMP201 per row, one
 * SED payment per row, one ledger entry per row) and this module derives the
 * totals from them.
 *
 * Every derived value is labelled: `derived[field]` says what it was derived
 * from, so a reviewer (and the wiring that places it) can always tell a figure
 * the document printed from one the code worked out. Nothing here is ever TMPS
 * (no field name in this module means procurement spend), and nothing here
 * overwrites a printed value: a printed `sum_of_leviable_amount` stays the
 * document's, and `derived_leviable_amount` sits beside it.
 *
 * Pure: no I/O, no model calls. caseExtraction.addSkillDerivations adds the
 * results beside each document's printed values (source.method 'derived'), and
 * entityCalculatorMapping keeps every derived_* name out of the calculator.
 */
import { parseMoney } from './moneyParsing.js';

/** The measured entity's financial year, as ISO dates (yyyy-mm-dd), both inclusive. */
export interface MeasurementPeriod {
  start: string;
  end: string;
}

export interface Derivation {
  /** Derived values by field name. Null when they could not be derived (see notes). */
  values: Record<string, number | string | boolean | string[] | null>;
  /** Field name → what it was derived from. Present for every value that was derived. */
  derived: Record<string, string>;
  /** Why something could not be derived, or what a reviewer should look at. */
  notes: string[];
}

type Row = Record<string, unknown>;

// ─── Reading printed values ─────────────────────────────────────────────────

/**
 * A printed amount as a number: "1 455.30", "R12 500.00", "(48 210)",
 * "1 234 567,89" (decimal comma). Null for anything that is not an amount.
 */
export function amountOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (!text) return null;
  // A decimal comma ("1 234,56", "1.234,56"): two digits after the last comma
  // and no point after it. parseMoney would read the comma as a thousands mark.
  if (/,\d{2}\)?$/.test(text) && !/\.\d+\)?$/.test(text)) {
    text = text.replace(/\.(?=\d{3}\b)/g, '').replace(/,(\d{2}\)?)$/, '.$1');
  }
  return parseMoney(text);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function validDate(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

const MONTH_NAMES = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

/** A printed month name as 1..12: the full name, its three-letter form, or "Sept". Null otherwise. */
function monthOf(name: string): number | null {
  const word = name.toLowerCase();
  const index = MONTH_NAMES.findIndex((full) => word === full || word === full.slice(0, 3) || (full === 'september' && word === 'sept'));
  return index >= 0 ? index + 1 : null;
}

/**
 * A printed date as ISO yyyy-mm-dd. South African documents are day-first:
 * "03/04/2025" is 3 April 2025. Accepts dd/mm/yyyy (or - and .), yyyy-mm-dd,
 * yyyy/mm/dd (with a trailing time), and the written forms an AFS prints a
 * year end in: "3 April 2025", "Friday, 28 February 2025", "28-Feb-2025",
 * "28th of February 2025", "February 28, 2025", "For the year ended
 * 28 February 2025". Null when it is not a full date.
 */
export function dateOf(value: unknown): string | null {
  let text = String(value ?? '').trim();
  if (!text) return null;
  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ]\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (m) return validDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) return validDate(Number(m[3]), Number(m[2]), Number(m[1]));
  // The words around a written date: the caption it was copied with, then a
  // leading weekday ("Friday, 28 February 2025" is 28 February 2025).
  text = text
    .replace(/^(?:for\s+the\s+)?(?:financial\s+)?(?:year|period)\s+(?:ended|ending|end)\s*:?\s*/i, '')
    .replace(/^(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(?:day|nesday|sday|urday)?\.?,?\s+/i, '');
  m = text.match(/^(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?[\s\-/]+([A-Za-z]{3,9})\.?,?[\s\-/]+(\d{4})$/);
  if (m) {
    const month = monthOf(m[2]);
    return month ? validDate(Number(m[3]), month, Number(m[1])) : null;
  }
  m = text.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  if (m) {
    const month = monthOf(m[1]);
    return month ? validDate(Number(m[3]), month, Number(m[2])) : null;
  }
  return null;
}

/**
 * A SARS tax period as { year, month }: "202503", "2025/03", "2025-03",
 * "March 2025". Null when it is not a month.
 */
export function taxPeriodOf(value: unknown): { year: number; month: number } | null {
  const text = String(value ?? '').trim();
  let m = text.match(/^(\d{4})[-/ ]?(\d{2})$/);
  if (m) {
    const month = Number(m[2]);
    return month >= 1 && month <= 12 ? { year: Number(m[1]), month } : null;
  }
  m = text.match(/^([A-Za-z]{3,9})\.?\s+(\d{4})$/);
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    return month >= 0 ? { year: Number(m[2]), month: month + 1 } : null;
  }
  return null;
}

function periodKey(p: { year: number; month: number }): string {
  return `${p.year}${pad(p.month)}`;
}

function validPeriod(period: MeasurementPeriod | null | undefined): MeasurementPeriod | null {
  if (!period) return null;
  const start = dateOf(period.start);
  const end = dateOf(period.end);
  if (!start || !end || start > end) return null;
  return { start, end };
}

/** Whether an ISO date falls inside the measurement period (both ends inclusive). */
export function dateInPeriod(isoDate: string, period: MeasurementPeriod): boolean {
  return isoDate >= period.start && isoDate <= period.end;
}

/** Whether a tax month falls inside the measurement period: its month lies between the period's start and end months. */
export function taxPeriodInPeriod(month: { year: number; month: number }, period: MeasurementPeriod): boolean {
  const key = periodKey(month);
  return key >= period.start.slice(0, 7).replace('-', '') && key <= period.end.slice(0, 7).replace('-', '');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function rowsOf(value: unknown): Row[] {
  return Array.isArray(value) ? value.filter((row): row is Row => Boolean(row) && typeof row === 'object' && !Array.isArray(row)) : [];
}

function present(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

// ─── EMP201 ─────────────────────────────────────────────────────────────────

/**
 * The year's PAYE / SDL / UIF totals, the months submitted and the leviable
 * amount (SDL x 100, because SDL is 1% of leviable remuneration), from the
 * EMP201 skill's `emp201_rows`, keeping only the returns inside the
 * measurement period.
 *
 * Without a measurement period nothing is totalled: which months count is
 * exactly what the document cannot say.
 */
export function deriveEmp201(rows: unknown, period: MeasurementPeriod | null | undefined): Derivation {
  const values: Derivation['values'] = {
    months_submitted: null,
    derived_paye_total: null,
    derived_sdl_total: null,
    derived_uif_total: null,
    derived_payroll_tax_total: null,
    derived_leviable_amount: null,
  };
  const derived: Record<string, string> = {};
  const notes: string[] = [];
  const window = validPeriod(period);
  if (!window) {
    notes.push('No measurement period: the EMP201 months are not totalled.');
    return { values, derived, notes };
  }

  // One return per month. A month printed twice with the same figures is one
  // return filed twice; with different figures it is ambiguous, and no total
  // is safer than a wrong one.
  const byMonth = new Map<string, Row>();
  const conflicting = new Set<string>();
  const outside: string[] = [];
  for (const row of rowsOf(rows)) {
    const month = taxPeriodOf(row.tax_period);
    if (!month) {
      notes.push(`A return's tax period "${String(row.tax_period ?? '')}" is not a month; it is left out.`);
      continue;
    }
    const key = periodKey(month);
    if (!taxPeriodInPeriod(month, window)) {
      outside.push(key);
      continue;
    }
    const seen = byMonth.get(key);
    if (seen && (amountOf(seen.sdl_amount) !== amountOf(row.sdl_amount) || amountOf(seen.paye_amount) !== amountOf(row.paye_amount))) {
      conflicting.add(key);
    }
    if (!seen) byMonth.set(key, row);
  }
  if (outside.length > 0) notes.push(`Returns outside the measurement period, not totalled: ${[...new Set(outside)].sort().join(', ')}.`);
  if (conflicting.size > 0) {
    notes.push(`Two different returns for ${[...conflicting].sort().join(', ')}: nothing is totalled until a reviewer chooses.`);
    return { values, derived, notes };
  }

  const months = [...byMonth.keys()].sort();
  values.months_submitted = months;
  derived.months_submitted = 'derived: the EMP201 tax periods inside the measurement period';
  if (months.length === 0) {
    notes.push('No EMP201 falls inside the measurement period.');
    return { values, derived, notes };
  }

  const total = (field: string): number | null => {
    let sum = 0;
    for (const key of months) {
      const amount = amountOf(byMonth.get(key)?.[field]);
      if (amount === null) return null;
      sum += amount;
    }
    return round2(sum);
  };
  const basis = (what: string) => `derived: sum of ${what} on the ${months.length} EMP201s from ${months[0]} to ${months[months.length - 1]}`;
  for (const [field, column, what] of [
    ['derived_paye_total', 'paye_amount', 'PAYE'],
    ['derived_sdl_total', 'sdl_amount', 'SDL'],
    ['derived_uif_total', 'uif_amount', 'UIF'],
    ['derived_payroll_tax_total', 'total_liability', 'the printed totals'],
  ] as const) {
    const value = total(column);
    values[field] = value;
    if (value !== null) derived[field] = basis(what);
    else notes.push(`${what} is not printed on every in-period return, so it is not totalled.`);
  }

  const sdl = values.derived_sdl_total as number | null;
  if (sdl !== null && sdl > 0) {
    values.derived_leviable_amount = round2(sdl * 100);
    derived.derived_leviable_amount = `derived: SDL total x 100 (SDL is 1% of leviable remuneration) over ${months.length} EMP201s`;
  } else if (sdl === 0) {
    notes.push('SDL is zero on every in-period return (an SDL-exempt employer): the leviable amount cannot be derived from SDL.');
  }
  if (months.length < 12) notes.push(`Only ${months.length} of the period's months have an EMP201.`);
  return { values, derived, notes };
}

// ─── SED proof of payment ───────────────────────────────────────────────────

/**
 * Per-payment "inside the measurement period" flags and the evidenced totals,
 * from the SED proof-of-payment skill's `beneficiary_rows`.
 */
export function deriveSedPayments(rows: unknown, period: MeasurementPeriod | null | undefined): Derivation & { rows: Row[] } {
  const window = validPeriod(period);
  const notes: string[] = [];
  const derived: Record<string, string> = {};
  let total = 0;
  let totalInPeriod = 0;
  let anyAmount = false;
  const out = rowsOf(rows).map((row, index) => {
    // A bank printout that states it is not a proof of payment still shows the
    // amount (it counts in the printed total), but it evidences no payment made
    // in the period: it never counts in the in-period total.
    const disclaimed = row.marked_not_proof_of_payment === true
      || /^(?:true|yes)$/i.test(String(row.marked_not_proof_of_payment ?? '').trim());
    if (disclaimed) notes.push(`Row ${index + 1} is marked as not a proof of payment, so it is not counted as paid in the period.`);
    const amount = amountOf(row.amount_paid);
    if (amount !== null) {
      anyAmount = true;
      total += amount;
    } else if (present(row.amount_paid)) {
      notes.push(`Row ${index + 1}'s amount paid is not a readable amount.`);
    }
    const date = dateOf(row.payment_date);
    let within: boolean | null = null;
    if (window && date) within = dateInPeriod(date, window);
    if (within === true && amount !== null && !disclaimed) totalInPeriod += amount;
    if (window && !date && present(row.payment_date)) notes.push(`Row ${index + 1}'s payment date is not a readable date.`);
    if (within === false) notes.push(`Row ${index + 1} was paid outside the measurement period.`);
    return { ...row, payment_within_measurement_period: within };
  });
  if (window) derived.payment_within_measurement_period = 'derived: each payment date compared with the measurement period';
  else notes.push('No measurement period: payments are not checked against it.');

  const values: Derivation['values'] = {
    derived_amount_paid_total: anyAmount ? round2(total) : null,
    derived_amount_paid_in_period: window && anyAmount ? round2(totalInPeriod) : null,
  };
  if (values.derived_amount_paid_total !== null) derived.derived_amount_paid_total = `derived: sum of amount_paid over ${out.length} payment rows`;
  if (values.derived_amount_paid_in_period !== null) derived.derived_amount_paid_in_period = 'derived: sum of amount_paid on rows paid inside the measurement period, less any marked as not a proof of payment';
  return { values, derived, notes, rows: out };
}

// ─── Supplier ledger ────────────────────────────────────────────────────────

/**
 * The count of supporting invoices, the entries' own total and whether the
 * ledger's printed total agrees with it, from the ledger skill's
 * `ledger_entry_rows` and `ap_subledger_total`.
 */
export function deriveLedger(document: Row, period?: MeasurementPeriod | null): Derivation {
  const rows = rowsOf(document.ledger_entry_rows);
  const notes: string[] = [];
  const derived: Record<string, string> = {};
  const window = validPeriod(period ?? null);

  let sum = 0;
  let readable = 0;
  const outside: string[] = [];
  for (const [index, row] of rows.entries()) {
    const amount = amountOf(row.entry_amount);
    if (amount === null) notes.push(`Entry ${index + 1}'s amount is not a readable amount.`);
    else {
      sum += amount;
      readable += 1;
    }
    const date = dateOf(row.entry_date);
    if (window && date && !dateInPeriod(date, window)) outside.push(String(row.entry_date));
  }
  if (outside.length > 0) notes.push(`Entries dated outside the measurement period: ${outside.join(', ')}.`);

  const invoices = rows.filter((row) => present(row.entry_reference)).length;
  const values: Derivation['values'] = {
    supporting_invoices_reviewed: rows.length > 0 ? invoices : null,
    derived_entries_total: readable > 0 && readable === rows.length ? round2(sum) : null,
    ledger_total_matches_entries: null,
  };
  if (values.supporting_invoices_reviewed !== null) derived.supporting_invoices_reviewed = 'derived: count of ledger entries that carry a reference';
  if (values.derived_entries_total !== null) derived.derived_entries_total = `derived: sum of ${rows.length} ledger entries`;

  const printed = amountOf(document.ap_subledger_total);
  if (printed !== null && values.derived_entries_total !== null) {
    const matches = Math.abs(printed - (values.derived_entries_total as number)) < 0.01;
    values.ledger_total_matches_entries = matches;
    derived.ledger_total_matches_entries = 'derived: the printed total compared with the sum of the entries';
    if (!matches) notes.push('The ledger\'s printed total does not equal the sum of its entries.');
  }
  return { values, derived, notes };
}

// ─── Payroll ────────────────────────────────────────────────────────────────

/** The number of employee rows on a payroll report (never the totals row: the skill returns none). */
export function deriveEmployeeCount(rows: unknown): Derivation {
  const named = rowsOf(rows).filter((row) => present(row.employee_name));
  if (named.length === 0) return { values: { derived_employee_count: null }, derived: {}, notes: ['No employee rows.'] };
  return {
    values: { derived_employee_count: named.length },
    derived: { derived_employee_count: 'derived: count of employee rows on the report' },
    notes: [],
  };
}

// ─── One document's derivations ─────────────────────────────────────────────

/**
 * Everything derivable from one document's extracted record, chosen by the row
 * table it carries (each skill names its own rows field): EMP201 returns, SED
 * payments, ledger entries, payroll employees. Null when the record carries
 * none of them. The wiring adds these beside the printed values, never over
 * them, each labelled derived.
 */
export function deriveForRecord(record: Row, period: MeasurementPeriod | null | undefined): Derivation | null {
  const parts: Derivation[] = [];
  if (Array.isArray(record.emp201_rows)) parts.push(deriveEmp201(record.emp201_rows, period));
  if (Array.isArray(record.beneficiary_rows)) {
    const { values, derived, notes } = deriveSedPayments(record.beneficiary_rows, period);
    parts.push({ values, derived, notes });
  }
  if (Array.isArray(record.ledger_entry_rows)) parts.push(deriveLedger(record, period));
  if (Array.isArray(record.employee_rows)) parts.push(deriveEmployeeCount(record.employee_rows));
  if (parts.length === 0) return null;
  return {
    values: Object.assign({}, ...parts.map((part) => part.values)),
    derived: Object.assign({}, ...parts.map((part) => part.derived)),
    notes: parts.flatMap((part) => part.notes),
  };
}

/**
 * The measurement period a financial year end implies: the twelve months that
 * end on it ("2025-02-28" → 2024-03-01 .. 2025-02-28). Null when the year end is
 * not a full date.
 */
export function periodEndingOn(yearEnd: unknown): MeasurementPeriod | null {
  const end = dateOf(yearEnd);
  if (!end) return null;
  const [year, month, day] = end.split('-').map(Number);
  // A month-end year end starts on the 1st of the next month a year earlier (a
  // 28 or 29 Feb year end starts on 1 March); any other date on the day after
  // the same date a year earlier.
  const lastOfMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDate = day === lastOfMonth
    ? new Date(Date.UTC(year - 1, month, 1))
    : new Date(Date.UTC(year - 1, month - 1, day + 1));
  const start = `${startDate.getUTCFullYear()}-${pad(startDate.getUTCMonth() + 1)}-${pad(startDate.getUTCDate())}`;
  return { start, end };
}
