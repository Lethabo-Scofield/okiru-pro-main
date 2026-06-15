/** Coerce workbook Yes/No select values (or legacy booleans) to boolean. */
export function coerceYesNo(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) return false;
  const s = String(value).trim().toLowerCase();
  return s === "yes" || s === "y" || s === "true" || s === "1";
}

/** Display/storage value for Yes/No select columns backed by booleans. */
export function yesNoToSelectValue(value: unknown): string {
  return coerceYesNo(value) ? "Yes" : "No";
}
