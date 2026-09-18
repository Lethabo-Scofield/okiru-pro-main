/**
 * The same record, twice, in one upload.
 *
 * The importer already compared an incoming sheet against what a company
 * holds — that is how it decides what is new and what is an update. What it
 * never did was compare the sheet against ITSELF. Paste a supplier list with
 * the same company on two lines and both lines were imported as separate
 * suppliers.
 *
 * Every pillar is affected and each is affected differently:
 *
 *   ownership          two rows for one shareholder double their percentage
 *   management control one person counted twice moves every EAP ratio
 *   skills             one intervention claimed twice inflates the spend
 *   procurement        one supplier twice inflates TMPS and the spend behind it
 *   ESD / SED          one contribution twice inflates recognised spend
 *   YES                one candidate twice inflates the absorption count
 *
 * In every case the score moves in the company's favour, which is the direction
 * a verification agency looks hardest at.
 *
 * What this module does NOT do is decide. A repeated supplier can be two
 * genuine invoice lines; two equal payments to one beneficiary in a year are
 * ordinary. Collapsing those would quietly reduce a real figure, which is the
 * same class of mistake in the other direction. So duplicates are found and
 * shown, and a person says which they are.
 */

export interface DuplicateGroup<T> {
  /** The shared identity that put these rows together. */
  key: string;
  /** How the first of them reads, for the message. */
  label: string;
  /** Every row sharing the identity, in the order the sheet had them. */
  rows: T[];
  /** Positions in the original list, 1-based, as a person counts rows. */
  positions: number[];
}

export interface DuplicateReport<T> {
  groups: DuplicateGroup<T>[];
  /** Rows that would disappear if each group were collapsed to one. */
  extraRows: number;
  /** One row per distinct record, keeping the first of each group. */
  deduped: T[];
}

export interface FindDuplicatesOptions<T> {
  /** What makes two rows the same row. Usually the spec's own identity. */
  identityOf: (row: T) => string;
  /** How a row reads in the warning. Falls back to the identity. */
  labelOf?: (row: T) => string;
  /**
   * Fold two rows of the same identity into one. Without it the first row
   * wins, which is what a re-typed duplicate usually calls for. Suppliers and
   * contributions supply one that adds the amounts instead, because there the
   * second row is often a second invoice rather than a mistake.
   */
  merge?: (kept: T, duplicate: T) => T;
}

const clean = (value: unknown): string =>
  typeof value === "string" ? value.trim().toLowerCase() : value == null ? "" : String(value).trim().toLowerCase();

/**
 * Find rows that share an identity.
 *
 * A row whose identity is empty is never grouped. Two rows with nothing
 * identifying are not "the same blank row", and treating them as such would
 * delete data on the strength of both being incomplete.
 */
export function findDuplicates<T>(rows: T[], options: FindDuplicatesOptions<T>): DuplicateReport<T> {
  const order: string[] = [];
  const byKey = new Map<string, { rows: T[]; positions: number[] }>();

  rows.forEach((row, index) => {
    const key = clean(options.identityOf(row));
    if (!key) return;
    const existing = byKey.get(key);
    if (existing) {
      existing.rows.push(row);
      existing.positions.push(index + 1);
    } else {
      byKey.set(key, { rows: [row], positions: [index + 1] });
      order.push(key);
    }
  });

  const groups: DuplicateGroup<T>[] = [];
  for (const key of order) {
    const entry = byKey.get(key)!;
    if (entry.rows.length < 2) continue;
    groups.push({
      key,
      label: options.labelOf ? options.labelOf(entry.rows[0]) : key,
      rows: entry.rows,
      positions: entry.positions,
    });
  }

  // Collapse for the "one of each" option. Rows with no identity are kept as
  // they are — they were never grouped, so they were never duplicates.
  const seen = new Map<string, T>();
  const deduped: T[] = [];
  for (const row of rows) {
    const key = clean(options.identityOf(row));
    if (!key) {
      deduped.push(row);
      continue;
    }
    const kept = seen.get(key);
    if (kept === undefined) {
      const copy = options.merge ? ({ ...(row as object) } as T) : row;
      seen.set(key, copy);
      deduped.push(copy);
      continue;
    }
    if (options.merge) {
      const folded = options.merge(kept, row);
      seen.set(key, folded);
      const at = deduped.indexOf(kept);
      if (at >= 0) deduped[at] = folded;
    }
  }

  return {
    groups,
    extraRows: groups.reduce((sum, group) => sum + group.rows.length - 1, 0),
    deduped,
  };
}

/**
 * How to say it.
 *
 * "3 duplicates" does not tell anyone what to do. Naming the records and how
 * many times each appears is what makes it checkable against the source
 * spreadsheet.
 */
export function describeDuplicates<T>(report: DuplicateReport<T>, noun: string, limit = 4): string {
  if (report.groups.length === 0) return "";
  const named = report.groups
    .slice(0, limit)
    .map((group) => `${group.label || "unnamed"} (×${group.rows.length})`)
    .join(", ");
  const rest = report.groups.length - Math.min(limit, report.groups.length);
  const tail = rest > 0 ? `, and ${rest} more` : "";
  return `${report.groups.length} ${report.groups.length === 1 ? "record appears" : "records appear"} more than once in this sheet: ${named}${tail}. That is ${report.extraRows} extra ${report.extraRows === 1 ? "row" : "rows"} of ${noun}.`;
}

/**
 * Fold two money rows by adding the amount on `field`.
 *
 * For suppliers and contributions the second row is usually a second invoice
 * against the same counterparty, so combining them keeps the total intact
 * while removing the duplicate record. Dropping it would lose real spend.
 *
 * When either side is not a number the first row is kept unchanged — a blank
 * amount is not a zero to add, and guessing one would change a total.
 */
export function mergeByAmount<T>(field: string) {
  return (kept: T, duplicate: T): T => {
    const a = (kept as Record<string, unknown>)[field];
    const b = (duplicate as Record<string, unknown>)[field];
    if (typeof a !== "number" || typeof b !== "number") return kept;
    return { ...(kept as object), [field]: a + b } as T;
  };
}
