/**
 * The import confirm REPLACED every section it touched, so uploads erased data
 * already captured: a diesel report that placed two figures wiped the monthly
 * grid beside them, and a template filled in for one pillar wiped every
 * register its empty sheets carried. Each case here is one of those losses.
 */
import { describe, expect, it } from "vitest";
import { mergeEsgSectionCells, readEsgGridRows } from "../esgGridRows";
import { mergeImportIntoSection, mergeImportIntoSections } from "../esgImportMerge";
import { analyseEsgImport, describeEsgImport } from "../esgImportAnalysis";

const fleetRows = [
  { _id: "1", reg: "AB56STGP", depot: "BKT", monthlyKm: 1200 },
  { _id: "2", reg: "KX11AAGP", depot: "DRN", monthlyKm: 900 },
  { _id: "3", reg: "BB22CCGP", depot: "GH", monthlyKm: 700 },
];

describe("value cells", () => {
  it("a document that places two figures leaves every other captured figure alone", () => {
    const existing = { s1a_C14: 35332, s1a_D14: 30110, s1a_E14: 28994, s2_F17: 120000 };
    const { cells } = mergeImportIntoSection("e-data", existing, { s1a_C14: 36000, L68: 1200 });
    expect(cells).toEqual({ s1a_C14: 36000, s1a_D14: 30110, s1a_E14: 28994, s2_F17: 120000, L68: 1200 });
  });

  it("an empty value in the import never blanks a captured one", () => {
    const { cells } = mergeImportIntoSection("e-data", { s1a_C14: 35332 }, { s1a_C14: "", s1a_D14: null, s1a_E14: "  " });
    expect(cells).toEqual({ s1a_C14: 35332 });
  });

  it("zero and false are values, not blanks", () => {
    const { cells } = mergeImportIntoSection("g-data", { B27: 5, F27: true }, { B27: 0, F27: false });
    expect(cells).toEqual({ B27: 0, F27: false });
  });
});

describe("registers", () => {
  const existingFleet = mergeEsgSectionCells("fleet", fleetRows, {});

  it("an empty register sheet leaves the register exactly as it was", () => {
    // What the template's untouched Fleet_Register sheet arrives as.
    const result = mergeImportIntoSection("fleet", existingFleet, { _row_count: 0 });
    expect(result.cells).toEqual(existingFleet);
    expect(readEsgGridRows(result.cells, "fleet")).toHaveLength(3);
    expect(result.register).toMatchObject({ existing: 3, incoming: 0, added: 0 });
  });

  it("rows are added to the register, not written over the rows at the same addresses", () => {
    const incoming = mergeEsgSectionCells("fleet", [{ _id: "x", reg: "NEW001GP", depot: "ALDER", monthlyKm: 400 }], {});
    const result = mergeImportIntoSection("fleet", existingFleet, incoming);
    const rows = readEsgGridRows(result.cells, "fleet");
    expect(rows.map((r) => r.reg)).toEqual(["AB56STGP", "KX11AAGP", "BB22CCGP", "NEW001GP"]);
    expect(result.cells._row_count).toBe(4);
    expect(result.register).toMatchObject({ existing: 3, incoming: 1, added: 1, alreadyThere: 0 });
  });

  it("uploading the same rows again does not double them", () => {
    const again = mergeEsgSectionCells("fleet", [fleetRows[1], { _id: "y", reg: "NEW002GP" }], {});
    const result = mergeImportIntoSection("fleet", existingFleet, again);
    expect(readEsgGridRows(result.cells, "fleet").map((r) => r.reg)).toEqual([
      "AB56STGP",
      "KX11AAGP",
      "BB22CCGP",
      "NEW002GP",
    ]);
    expect(result.register).toMatchObject({ added: 1, alreadyThere: 1 });
  });

  it("treats 1200 and \"1200\", and case in text, as the same row", () => {
    const sameRow = { _row_count: 1, A4: "ab56stgp", B4: "bkt", I4: "1200" };
    const result = mergeImportIntoSection("fleet", existingFleet, sameRow);
    expect(result.register).toMatchObject({ added: 0, alreadyThere: 1 });
  });

  it("keeps the figures that share a register's sheet but are not rows", () => {
    // Waste rows start at 5; the Cority figure at B13 and the scorecard at B16 are not rows.
    const existing = { ...mergeEsgSectionCells("waste", [{ _id: "w", month: "Jul-25", wasteType: "Paper", totalKg: 120 }], {}), B13: 4820, B16: 0.62 };
    const result = mergeImportIntoSection("waste", existing, { _row_count: 0, B16: 0.7 });
    expect(result.cells.B13).toBe(4820);
    expect(result.cells.B16).toBe(0.7);
    expect(readEsgGridRows(result.cells, "waste")).toHaveLength(1);
  });

  it("reads a register saved before the row stamp existed", () => {
    const legacy = { A4: "AB56STGP", B4: "BKT", A5: "KX11AAGP", B5: "DRN" };
    const incoming = mergeEsgSectionCells("fleet", [{ _id: "n", reg: "NEW003GP" }], {});
    const result = mergeImportIntoSection("fleet", legacy, incoming);
    expect(readEsgGridRows(result.cells, "fleet").map((r) => r.reg)).toEqual(["AB56STGP", "KX11AAGP", "NEW003GP"]);
  });
});

describe("a whole import", () => {
  it("a template filled in for one pillar changes only that pillar", () => {
    const current = {
      fleet: { cells: mergeEsgSectionCells("fleet", fleetRows, {}) },
      waste: { cells: mergeEsgSectionCells("waste", [{ _id: "w", month: "Jul-25", wasteType: "Paper", totalKg: 120 }], {}) },
      "e-data": { cells: { s1a_C14: 35332 } },
    };
    // Every register sheet in the template arrives, filled or not.
    const incoming = {
      fleet: { cells: { _row_count: 0 } },
      waste: { cells: { _row_count: 0 } },
      "e-data": { cells: { s1a_D14: 30110 } },
    };
    const merged = mergeImportIntoSections(current, incoming);
    expect(readEsgGridRows(merged.fleet.cells, "fleet")).toHaveLength(3);
    expect(readEsgGridRows(merged.waste.cells, "waste")).toHaveLength(1);
    expect(merged["e-data"].cells).toEqual({ s1a_C14: 35332, s1a_D14: 30110 });
  });
});

describe("the preview tells the same story as the write", () => {
  it("reports register rows as added, not as overwrites of the rows already there", () => {
    const current = { sections: { fleet: { cells: mergeEsgSectionCells("fleet", fleetRows, {}) } } };
    const preview = {
      sections: { fleet: { cells: mergeEsgSectionCells("fleet", [{ _id: "z", reg: "NEW004GP", depot: "BKT" }], {}) } },
      unmatchedSheets: [],
      warnings: [],
    } as any;
    const analysis = analyseEsgImport(preview, current);
    expect(analysis.overwrites).toHaveLength(0);
    expect(analysis.registers).toEqual([
      { sectionId: "fleet", existing: 3, incoming: 1, added: 1, updated: 0, alreadyThere: 0 },
    ]);
    expect(describeEsgImport(analysis)).toContain("1 register row added");
  });
});

describe("rows are matched by what identifies them", () => {
  const existingFleet = mergeEsgSectionCells("fleet", fleetRows, {});

  it("a corrected row updates the vehicle in place instead of adding a second one", () => {
    // Export, fix a figure, re-import: the correction lands; nothing doubles.
    const corrected = mergeEsgSectionCells("fleet", [{ _id: "c", reg: "KX11AAGP", monthlyKm: 950 }], {});
    const result = mergeImportIntoSection("fleet", existingFleet, corrected);
    const rows = readEsgGridRows(result.cells, "fleet");
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.reg === "KX11AAGP")).toMatchObject({ depot: "DRN", monthlyKm: 950 });
    expect(result.register).toMatchObject({ added: 0, updated: 1, alreadyThere: 0 });
  });

  it("an update never blanks a field the import left empty, and keeps the captured spelling", () => {
    const partial = { _row_count: 1, A4: "ab56stgp", B4: "", I4: "1200" };
    const result = mergeImportIntoSection("fleet", existingFleet, partial);
    const row = readEsgGridRows(result.cells, "fleet").find((r) => r.reg === "AB56STGP");
    expect(row).toMatchObject({ reg: "AB56STGP", depot: "BKT", monthlyKm: 1200 });
  });

  it("a checklist re-import updates statuses and never duplicates a principle", () => {
    const king5 = mergeEsgSectionCells(
      "king5",
      [1, 2, 3].map((n) => ({ _id: String(n), num: n, principle: `Principle ${n}`, status: "Not Applied" })),
      {},
    );
    const reimport = mergeEsgSectionCells(
      "king5",
      [{ _id: "x", num: 2, principle: "Principle 2", status: "Applied" }],
      {},
    );
    const result = mergeImportIntoSection("king5", king5, reimport);
    const rows = readEsgGridRows(result.cells, "king5");
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.status)).toEqual(["Not Applied", "Applied", "Not Applied"]);
    expect(result.register).toMatchObject({ updated: 1, added: 0 });
  });

  it("a waste stream is the same stream only for the same month, depot and type", () => {
    const waste = mergeEsgSectionCells(
      "waste",
      [{ _id: "w1", month: "Jul-25", depot: "BKT", wasteType: "Paper", totalKg: 120 }],
      {},
    );
    const incoming = mergeEsgSectionCells(
      "waste",
      [
        { _id: "a", month: "Jul-25", depot: "BKT", wasteType: "Paper", totalKg: 130 },
        { _id: "b", month: "Aug-25", depot: "BKT", wasteType: "Paper", totalKg: 90 },
      ],
      {},
    );
    const result = mergeImportIntoSection("waste", waste, incoming);
    const rows = readEsgGridRows(result.cells, "waste");
    expect(rows.map((r) => [r.month, r.totalKg])).toEqual([
      ["Jul-25", 130],
      ["Aug-25", 90],
    ]);
    expect(result.register).toMatchObject({ updated: 1, added: 1 });
  });
});
