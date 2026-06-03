import { describe, expect, it } from "vitest";
import {
  countKing5Principles,
  mergeEsgSectionCells,
  readEsgGridRows,
} from "../esgGridRows";

describe("esgGridRows", () => {
  it("round-trips fleet register rows to flat cell refs", () => {
    const rows = [
      {
        _id: "r1",
        reg: "JR45DZGP",
        depot: "SGTSPFMCG",
        model: "11-Seater Bus",
        monthlyKm: 1200,
      },
    ];
    const cells = mergeEsgSectionCells("fleet", rows, {});
    expect(cells.A4).toBe("JR45DZGP");
    expect(cells.B4).toBe("SGTSPFMCG");
    expect(readEsgGridRows(cells, "fleet")).toHaveLength(1);
  });

  it("counts King5 principles from column C status cells", () => {
    const cells: Record<string, unknown> = {};
    for (let row = 4; row <= 20; row++) {
      cells[`C${row}`] = "Applied";
    }
    expect(countKing5Principles({ sections: { king5: { cells } } })).toBe(17);
  });

  it("syncs IFRS derived counts from grid rows", () => {
    const cells = mergeEsgSectionCells(
      "ifrs",
      [
        { _id: "a", requirement: "Board oversight", pillar: "Governance", status: "Disclosed" },
        { _id: "b", requirement: "Scope 1", pillar: "Metrics", status: "Not Disclosed" },
      ],
      {},
    );
    expect(cells._yes_count).toBe(1);
    expect(cells._total).toBe(2);
  });
});
