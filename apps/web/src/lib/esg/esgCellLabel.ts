/**
 * What to call a workbook cell on screen.
 *
 * The mapper names a disputed cell for its own log ("fleet.diesel_litres
 * (e-data s1a_D15)"), and that string reached the user. A person thinks of the
 * same cell as "Fleet diesel · Site B · Aug-25", so that is what is shown.
 */
import { ESG_INPUT_SECTIONS } from "@/lib/esgSections";
import { esgFieldLabel } from "./esgFormat";

/** The monthly grids, by the prefix their cells carry. */
const MONTHLY_GRIDS: Record<string, string> = {
  s1a: "Fleet diesel",
  s1b: "Generator diesel",
  s1c: "LPG",
  s1d: "Business car petrol",
  s2: "Electricity",
  solar: "Solar generation",
  water: "Water",
  waste: "Waste",
};

export interface EsgCellAxes {
  depots?: readonly string[];
  months?: readonly string[];
}

/** "s1a_D15" on axes with sites [Site A, Site B] and months from Jul-25 → "Fleet diesel · Site B · Aug-25". */
export function esgCellLabel(sectionId: string, cellRef: string, axes?: EsgCellAxes | null): string {
  const monthly = /^([a-z0-9]+)_([C-Z])(\d+)$/i.exec(cellRef);
  if (sectionId === "e-data" && monthly && MONTHLY_GRIDS[monthly[1].toLowerCase()]) {
    const row = Number(monthly[3]) - 14;
    const col = monthly[2].toUpperCase().charCodeAt(0) - 67;
    const site = axes?.depots?.[row] ?? `row ${row + 1}`;
    const month = axes?.months?.[col] ?? `month ${col + 1}`;
    return `${MONTHLY_GRIDS[monthly[1].toLowerCase()]} · ${site} · ${month}`;
  }
  const title = ESG_INPUT_SECTIONS.find((s) => s.id === sectionId)?.title;
  if (!sectionId) return esgFieldLabel(cellRef);
  return title ? `${title} · ${cellRef}` : cellRef;
}

/**
 * Whether a mapper label is its own log line rather than words: a dotted
 * parser key ("fleet.diesel_litres (e-data s1a_D15)", "board.members at L2",
 * "water.kl — your documents disagree").
 */
function isInternalLabel(label: string): boolean {
  return /(^|\s)[a-z][a-z0-9_]*\.[a-z0-9_.]+/i.test(label) || /\((?:e|s|g)-data\s/i.test(label);
}

/**
 * A dispute as a person reads it. The mapper's own label when it is already
 * words ("DBN diesel (Mar 2026)"); otherwise the cell as a person knows it,
 * or the figure's name when the dispute has no cell.
 */
export function esgConflictLabel(
  conflict: { sectionId: string; cellRef: string; label?: string },
  axes?: EsgCellAxes | null,
): string {
  const own = String(conflict.label ?? "").trim();
  if (own && !isInternalLabel(own)) return own;
  return esgCellLabel(conflict.sectionId, conflict.cellRef, axes);
}
