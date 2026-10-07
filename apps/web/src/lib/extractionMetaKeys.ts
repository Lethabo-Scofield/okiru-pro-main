/**
 * Reserved section-meta keys carrying the extraction's unfinished business,
 * and the one question the server asks of them about TMPS.
 *
 * Underscore-prefixed so they can never collide with a workbook column. They
 * live here, apart from parserToWorkbook, so the server projection can read
 * the same constants the upload wrote without importing the whole injector.
 */
export const META_CONFLICTS_KEY = "_metaConflicts";
export const META_CORROBORATION_KEY = "_metaCorroboration";
/**
 * Entity-level figures a document STATED but that could not be read — the
 * cell held `#REF!`, say. Distinct from "no document mentioned it": a broken
 * stated figure is a hole the client must fill, never one to compute around.
 */
export const META_WITHDRAWN_KEY = "_metaWithdrawn";

/** Where the TMPS a projection carries came from. */
export type TmpsSource = "stated" | "supplier_spend_sum";

/**
 * Why TMPS is blank on purpose: two stated figures disagree (`contested`), or
 * the stated figure was unreadable or implausible and taken out (`withdrawn`).
 * A plausibility withdrawal is filed as a conflict (the schedule total is put
 * to the user beside the reading), so it reads as `contested` here.
 */
export type TmpsHold = "contested" | "withdrawn";

function namesColumn(entries: unknown, column: string): boolean {
  return Array.isArray(entries)
    && entries.some((e) => e !== null && typeof e === "object" && String((e as Record<string, unknown>).column) === column);
}

/**
 * Is the financial-information section holding TMPS open for the client?
 *
 * Only meaningful while the cell is blank: once the user answers, the value is
 * in the cell and a leftover entry under these keys is spent.
 */
export function tmpsHold(finMeta: Record<string, unknown> | undefined): TmpsHold | null {
  if (!finMeta) return null;
  if (namesColumn(finMeta[META_CONFLICTS_KEY], "tmps")) return "contested";
  if (namesColumn(finMeta[META_WITHDRAWN_KEY], "tmps")) return "withdrawn";
  return null;
}
