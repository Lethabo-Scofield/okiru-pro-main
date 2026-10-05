/** Coerce workbook Yes/No select values (or legacy booleans) to boolean. */
export function coerceYesNo(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) return false;
  const s = String(value).trim().toLowerCase();
  return s === "yes" || s === "y" || s === "true" || s === "1";
}

/**
 * Yes/No that keeps "unstated" as unstated.
 *
 * `coerceYesNo` answers false for undefined, which is right for a checkbox and
 * wrong for a field whose absence means something. Procurement scores spend
 * behind `isEmpoweringSupplier ?? (a valid B-BBEE level)`, so coercing an
 * absent value to false there excludes the supplier outright — the same bug,
 * one layer down, resurfacing on every page reload after an import.
 */
export function coerceYesNoOrUnset(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string" && value.trim() === "") return undefined;
  return coerceYesNo(value);
}

/** Display/storage value for Yes/No select columns backed by booleans. */
export function yesNoToSelectValue(value: unknown): string {
  return coerceYesNo(value) ? "Yes" : "No";
}
