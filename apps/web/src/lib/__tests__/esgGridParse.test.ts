import { describe, expect, it } from "vitest";
import { ESG_GRID_SECTIONS } from "../esgGridSections";
import { pasteMatrixToEsgRows } from "../esgGridParse";

describe("esgGridParse", () => {
  it("pastes tab-separated fleet row into grid columns", () => {
    const columns = ESG_GRID_SECTIONS.fleet.columns;
    const matrix = [["JR45DZGP", "SGTSPFMCG", "11-Seater Bus", "3445", "2395"]];
    const rows = pasteMatrixToEsgRows(matrix, columns, [], { row: 0, col: 0 });
    expect(rows).toHaveLength(1);
    expect(rows[0].reg).toBe("JR45DZGP");
    expect(rows[0].depot).toBe("SGTSPFMCG");
  });
});
