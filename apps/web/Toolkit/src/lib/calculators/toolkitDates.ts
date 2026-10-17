/**
 * Date arithmetic the Empower toolkit does with Excel's YEARFRAC, so a rule
 * written as "within five years" counts years the way the workbook does.
 *
 * Procurement measures years as days / 360 (YEARFRAC basis 2) and ESD as the
 * US 30/360 day count (YEARFRAC basis 0, the default). Both are the toolkit's
 * own conventions, not ours; at the five-year boundary they differ by days.
 */

const MS_PER_DAY = 86_400_000;
/** Excel's day zero for serial dates (1900 date system, after the leap-year bug). */
const EXCEL_EPOCH_UTC = Date.UTC(1899, 11, 30);

/**
 * A calendar date (UTC midnight) from what a capture form, an import or a
 * workbook hands us: ISO (2026-02-28, with or without a time), South African
 * dd/mm/yyyy, or an Excel serial number. Anything else is null — never a guess.
 */
export function parseCalcDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(String(value).trim())) {
    const serial = Math.floor(Number(value));
    // A plausible serial: 1950 … 2100. A bare year or an amount is not a date.
    if (serial < 18_264 || serial > 73_051) return null;
    return new Date(EXCEL_EPOCH_UTC + serial * MS_PER_DAY);
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) return utcDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return utcDate(Number(m[3]), Number(m[2]), Number(m[1]));
  return null;
}

function utcDate(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 ? date : null;
}

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY);
}

/** YEARFRAC(a, b, 2): actual days / 360. Order-independent, like Excel's. */
export function yearFracActual360(a: Date, b: Date): number {
  return Math.abs(daysBetween(a, b)) / 360;
}

function isLastDayOfFebruary(d: Date): boolean {
  if (d.getUTCMonth() !== 1) return false;
  const next = new Date(d.getTime() + MS_PER_DAY);
  return next.getUTCMonth() !== 1;
}

/** YEARFRAC(a, b) / YEARFRAC(a, b, 0): the US (NASD) 30/360 day count. Order-independent. */
export function yearFrac30360US(a: Date, b: Date): number {
  const [start, end] = a.getTime() <= b.getTime() ? [a, b] : [b, a];
  let d1 = start.getUTCDate();
  let d2 = end.getUTCDate();
  if (isLastDayOfFebruary(start) && isLastDayOfFebruary(end)) d2 = 30;
  if (isLastDayOfFebruary(start)) d1 = 30;
  if (d2 === 31 && d1 >= 30) d2 = 30;
  if (d1 === 31) d1 = 30;
  const days =
    (end.getUTCFullYear() - start.getUTCFullYear()) * 360 +
    (end.getUTCMonth() - start.getUTCMonth()) * 30 +
    (d2 - d1);
  return days / 360;
}
