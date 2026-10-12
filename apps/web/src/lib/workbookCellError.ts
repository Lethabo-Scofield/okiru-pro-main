/**
 * A spreadsheet error code read as if it were a value.
 *
 * A workbook whose formula broke (a deleted sheet, a division by an empty
 * cell) shows "#REF!" or "#DIV/0!" where the figure should be, and a reader
 * that copies the cell copies the code. Shown as a value it looks like a
 * figure someone typed; it is the opposite — the figure is missing. Everything
 * that shows a read value asks this first, and says "broken cell" instead.
 */
const ERROR_CODES = ["#REF!", "#VALUE!", "#DIV/0!", "#N/A", "#NAME?", "#NUM!", "#NULL!", "#SPILL!", "#CALC!", "#GETTING_DATA"];

const BY_UPPER = new Map(ERROR_CODES.map((code) => [code.toUpperCase(), code]));

/** The error code ("#REF!") when the value is one, else null. Case and spacing do not matter. */
export function workbookCellError(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim().toUpperCase();
  if (!text.startsWith("#")) return null;
  return BY_UPPER.get(text) ?? (text === "#N/A!" ? "#N/A" : null);
}

/** The words shown in place of the code. */
export function brokenCellText(code: string): string {
  return `Broken cell in the workbook (${code})`;
}
