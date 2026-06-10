import { parseWorkbookDate } from "@/components/workbook/sections";

/** Convert stored yyyy-mm-dd (or dd/mm/yyyy) to dd/m/yyyy display (numeric month, no "Jan"). */
export function isoToNumericDateDisplay(value: unknown): string {
  if (value === undefined || value === null) return "";
  const s = String(value).trim();
  if (!s) return "";
  const parsed = parseWorkbookDate(s);
  if (!parsed) return s;
  const day = String(parsed.getUTCDate()).padStart(2, "0");
  const month = String(parsed.getUTCMonth() + 1);
  const year = parsed.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/** Parse user dd/m/yyyy (or dd/mm/yyyy) input to canonical yyyy-mm-dd storage. */
export function numericDateDisplayToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const flexible = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (flexible) {
    const d = flexible[1].padStart(2, "0");
    const m = flexible[2].padStart(2, "0");
    const y = flexible[3];
    const normalized = `${d}/${m}/${y}`;
    const parsed = parseWorkbookDate(normalized);
    if (!parsed) return null;
    return `${y}-${m}-${d}`;
  }
  const parsed = parseWorkbookDate(trimmed);
  if (!parsed) return null;
  const y = parsed.getUTCFullYear();
  const m = String(parsed.getUTCMonth() + 1).padStart(2, "0");
  const d = String(parsed.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Format any stored date for grid display (numeric month). */
export function formatDateForDisplay(value: unknown): string {
  return isoToNumericDateDisplay(value);
}
