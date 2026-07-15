/**
 * ESG summary-cell derivation — the B-BBEE-parity fix.
 *
 * The manual input grids write raw cells (per-depot months `s1a_C14…`,
 * headcount `hc_r_c`, governance value cells `B5/B13…`), but the pillar
 * scorers read the *summary* cells the Excel template computes with formulas
 * (`E_Data!L19`, `S_Data!L12`, `G_Data!F5/F13…`). In the real workbook those
 * are live formulas; in the app nothing recomputed them, so a manually-filled
 * workbook scored as if empty (only golden fixtures that hand-injected the
 * summary cells scored). This mirrors B-BBEE's projectWorkbookToClient: derive
 * every scorer-read summary cell from the raw inputs before scoring.
 *
 * Every rule below is the verbatim template formula
 * (docs/esg/Okiru_ESG_Toolkit_v1_7_SG_Consumer_LiveData.xlsx):
 *   E_Data L19 = L14+…+L18  (each L = SUM(C:K)) → Σ all `s1a_*` month cells
 *   E_Data L46 = L41+…+L45                       → Σ all `s2_*`  month cells
 *   E_Data L63 = L58+…+L62                       → Σ all `water_*` month cells
 *   S_Data L12 = SUM(L5..L11) (each L = SUM(B:K)) → Σ all `hc_*` cells
 *   G_Data F5  = IF(B5>0,5,0)
 *   G_Data F13..F24 (Y/N rows) = IF(=Yes,5,IF(=Partial,2.5,0))
 * Derived values NEVER overwrite an explicit value (import/override wins), so
 * this fabricates nothing — an empty grid yields 0.
 */
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { readEsgGridRows } from "@/lib/esg/esgGridRows";

type Cells = Record<string, string | number | boolean | null>;

function sumMatching(cells: Cells, test: (ref: string) => boolean): number {
  let total = 0;
  for (const [ref, v] of Object.entries(cells)) {
    if (!test(ref)) continue;
    const n = typeof v === "number" ? v : Number(v);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

function ynScore(v: unknown): number {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "yes") return 5;
  if (s === "partial") return 2.5;
  return 0;
}

/** GHG monthly cells are `${prefix}_${col}${row}` e.g. `s1a_C14`; match by prefix. */
function isMonthCell(ref: string, prefix: string): boolean {
  return new RegExp(`^${prefix}_[C-K]\\d+$`).test(ref);
}

/** Governance Y/N metric cells read by scoreGovernance (F13..F21, F23) → their B-cell. */
const GOV_YN_ROWS = [13, 14, 15, 16, 17, 18, 19, 20, 21, 23, 24] as const;

function withCell(section: { cells?: Cells } | undefined, ref: string, value: number): { cells: Cells } {
  const cells: Cells = { ...(section?.cells ?? {}) };
  // Only fill when absent/blank — an explicit (imported / overridden) value wins.
  if (cells[ref] == null || cells[ref] === "") cells[ref] = value;
  return { cells };
}

/**
 * Return a shallow copy of the workbook with all scorer-read summary cells
 * derived from raw grid inputs. Idempotent; explicit values are preserved.
 */
export function deriveEsgSummaryCells(workbook: EsgWorkbookData): EsgWorkbookData {
  const sections = { ...(workbook.sections ?? {}) } as Record<string, { cells?: Cells }>;

  // ---- E_Data: scope totals L19 (s1a diesel) / L46 (s2 electricity) / L63 (water) ----
  const eCells = sections["e-data"]?.cells ?? {};
  const eDerived: Record<string, number> = {
    L19: sumMatching(eCells, (r) => isMonthCell(r, "s1a")),
    L46: sumMatching(eCells, (r) => isMonthCell(r, "s2")),
    L63: sumMatching(eCells, (r) => isMonthCell(r, "water")),
  };
  let eSection = sections["e-data"];
  for (const [ref, val] of Object.entries(eDerived)) {
    if (val > 0) eSection = withCell(eSection, ref, val);
  }
  if (eSection) sections["e-data"] = eSection;

  // ---- S_Data: total headcount L12 = Σ all EE-headcount grid cells (hc_r_c) ----
  const sCells = sections["s-data"]?.cells ?? {};
  const headcount = sumMatching(sCells, (r) => /^hc_\d+_\d+$/.test(r));
  if (headcount > 0) sections["s-data"] = withCell(sections["s-data"], "L12", headcount);

  // ---- S_Data CSI: initiative count from the Community & Social Investment
  // register (s-data-csi). Previously scoreSocial defaulted a missing count to
  // the full threshold → everyone got CSI's 5 pts for free. Derive the real
  // count so only companies that actually filled the register earn it. ----
  const csiRows = readEsgGridRows(sections["s-data-csi"]?.cells, "s-data-csi")
    .filter((r) => String(r.initiative ?? "").trim() !== "").length;
  if (csiRows > 0) {
    sections["s-data"] = withCell(sections["s-data"], "_initiatives_count", csiRows);
  }

  // ---- G_Data: F5 gate + F13..F24 Y/N scores ----
  const gCells = sections["g-data"]?.cells ?? {};
  let gSection = sections["g-data"];
  if (gSection && Object.keys(gCells).length > 0) {
    const boardMembers = Number(gCells.B5) || 0;
    gSection = withCell(gSection, "F5", boardMembers > 0 ? 5 : 0);
    for (const n of GOV_YN_ROWS) {
      const bVal = gCells[`B${n}`];
      if (bVal != null && bVal !== "") {
        gSection = withCell(gSection, `F${n}`, ynScore(bVal));
      }
    }
    sections["g-data"] = gSection;
  }

  return { ...workbook, sections } as EsgWorkbookData;
}
