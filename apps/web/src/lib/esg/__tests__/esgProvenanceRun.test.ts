/**
 * Every cell a document run writes keeps its source — not only the first cell
 * of each reading — and every cell the documents disagree on is recorded
 * beside the workbook, so the grid can mark both.
 */
import { describe, expect, it } from "vitest";
import {
  ESG_PROVENANCE_SECTION,
  conflictCells,
  provenanceForRun,
  readConflicts,
  readProvenance,
  sourcesFor,
} from "../esgProvenance";

const NOW = new Date("2025-10-06T09:00:00Z");

describe("provenanceForRun", () => {
  it("records every written cell, by the files the mapper says filled it", () => {
    // One reading (the fills sheet) behind three monthly cells.
    const placed = [{ sectionId: "e-data", cellRef: "s1a_C14", field: "diesel_litres", value: 800, sourceFile: "Fills.xlsx › Fills", documentId: "esg.fuel_fills" }];
    const patches = { "e-data": { cells: { s1a_C14: 800, s1a_D14: 425, s1a_E14: 405, eSites: "Site A" } } };
    const cellSources = {
      "e-data!s1a_C14": ["Fills.xlsx › Fills"],
      "e-data!s1a_D14": ["Fills.xlsx › Fills"],
      "e-data!s1a_E14": ["Fills.xlsx › Fills"],
      // A cell the patches do not write (held back by a section's focus) gets no record.
      "e-data!s2_C41": ["Bill.pdf"],
    };
    const cells = provenanceForRun(placed, patches, cellSources, NOW);
    expect(Object.keys(cells).sort()).toEqual(["e-data!s1a_C14", "e-data!s1a_D14", "e-data!s1a_E14"]);
    const records = readProvenance({ sections: { [ESG_PROVENANCE_SECTION]: { cells } } });
    expect(records.find((r) => r.cellRef === "s1a_D14")).toEqual({
      sectionId: "e-data",
      cellRef: "s1a_D14",
      sourceFile: "Fills.xlsx › Fills",
      // The same document id the reading carried, so the file counts as one source.
      documentId: "esg.fuel_fills",
      placedAt: "2025-10-06",
      placedValue: 425,
    });
    const sources = sourcesFor(
      { sections: { "e-data": patches["e-data"], [ESG_PROVENANCE_SECTION]: { cells } } },
      [{ section: "e-data", prefix: "s1a_" }],
    );
    expect(sources).toEqual([{ sourceFile: "Fills.xlsx › Fills", documentId: "esg.fuel_fills", cells: 3, editedSince: 0 }]);
  });

  it("without the mapper's cell sources, records what it always did", () => {
    const placed = [{ sectionId: "g-data", cellRef: "B4", field: "board_members_total", value: 9, sourceFile: "Charter.docx", documentId: "d" }];
    expect(Object.keys(provenanceForRun(placed, { "g-data": { cells: { B4: 9 } } }, undefined, NOW))).toEqual(["g-data!B4"]);
  });
});

describe("conflict records", () => {
  const conflicts = [
    {
      sectionId: "e-data",
      cellRef: "s1a_D15",
      candidates: [
        { value: 773, sources: ["Fills.xlsx › Fills"] },
        { value: 790, sources: ["Fuel card.pdf"] },
      ],
    },
    // A dispute the parser held back before mapping has no cell to sit on.
    { sectionId: "", cellRef: "fleet.diesel_litres", candidates: [{ value: 1, sources: [] }] },
  ];

  it("records a disputed cell with every value and its files, and reads it back", () => {
    const cells = conflictCells(conflicts, NOW);
    expect(Object.keys(cells)).toEqual(["e-data!s1a_D15"]);
    const workbook = { sections: { [ESG_PROVENANCE_SECTION]: { cells } } };
    expect(readConflicts(workbook)).toEqual([
      {
        sectionId: "e-data",
        cellRef: "s1a_D15",
        foundAt: "2025-10-06",
        candidates: [
          { value: 773, sources: ["Fills.xlsx › Fills"] },
          { value: 790, sources: ["Fuel card.pdf"] },
        ],
      },
    ]);
  });

  it("is never read as a placement — no document stands behind a blank cell", () => {
    const workbook = { sections: { [ESG_PROVENANCE_SECTION]: { cells: conflictCells(conflicts, NOW) } } };
    expect(readProvenance(workbook)).toEqual([]);
    expect(sourcesFor(workbook, [{ section: "*" }])).toEqual([]);
  });
});
