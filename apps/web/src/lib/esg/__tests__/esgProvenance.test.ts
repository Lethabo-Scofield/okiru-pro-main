/**
 * Which document each workbook value came from (E4): recorded as values are
 * placed, read back per cell, and honest after a hand edit.
 */
import { describe, expect, it } from "vitest";
import {
  ESG_PROVENANCE_SECTION,
  provenanceCells,
  readProvenance,
  sourcesFor,
  stillAsPlaced,
} from "../esgProvenance";

const DIESEL = { sourceFile: "DIESEL REPORT - Mar 2026.xlsx", documentId: "doc-diesel" };
const BILL = { sourceFile: "Eskom bill Mar.pdf", documentId: "doc-eskom" };

const placed = [
  { sectionId: "e-data", cellRef: "s1a_C14", value: 1200, ...DIESEL },
  { sectionId: "e-data", cellRef: "s1a_D14", value: 1350, ...DIESEL },
  { sectionId: "e-data", cellRef: "s2_C41", value: 41_000, ...BILL },
];

function workbook(values: Record<string, unknown>) {
  return {
    sections: {
      "e-data": { cells: values },
      [ESG_PROVENANCE_SECTION]: { cells: provenanceCells(placed, new Date("2026-10-07T09:00:00Z")) },
    },
  };
}

describe("esgProvenance", () => {
  it("records each placed value under section!cell, and reads it back", () => {
    const cells = provenanceCells(placed, new Date("2026-10-07T09:00:00Z"));
    expect(Object.keys(cells)).toEqual(["e-data!s1a_C14", "e-data!s1a_D14", "e-data!s2_C41"]);
    const records = readProvenance({ sections: { [ESG_PROVENANCE_SECTION]: { cells } } });
    expect(records[0]).toEqual({
      sectionId: "e-data",
      cellRef: "s1a_C14",
      sourceFile: "DIESEL REPORT - Mar 2026.xlsx",
      documentId: "doc-diesel",
      placedAt: "2026-10-07",
      placedValue: 1200,
    });
  });

  it("names the documents behind a block, largest first", () => {
    const wb = workbook({ s1a_C14: 1200, s1a_D14: 1350, s2_C41: 41_000 });
    expect(sourcesFor(wb, [{ section: "e-data", prefix: "s1a_" }])).toEqual([
      { ...DIESEL, cells: 2, editedSince: 0 },
    ]);
    expect(sourcesFor(wb, [{ section: "*" }]).map((s) => s.documentId)).toEqual(["doc-diesel", "doc-eskom"]);
  });

  it("stops vouching for a cell that was changed by hand", () => {
    const wb = workbook({ s1a_C14: 1200, s1a_D14: 999 });
    expect(sourcesFor(wb, [{ section: "e-data", prefix: "s1a_" }])).toEqual([
      { ...DIESEL, cells: 1, editedSince: 1 },
    ]);
  });

  it("compares numbers as numbers — a formatted cell is still the same value", () => {
    const record = readProvenance(workbook({}))[0]!;
    expect(stillAsPlaced(record, "1 200")).toBe(true);
    expect(stillAsPlaced(record, 1200)).toBe(true);
    expect(stillAsPlaced(record, 1201)).toBe(false);
    expect(stillAsPlaced(record, null)).toBe(false);
  });

  it("ignores a record it cannot read, and never records itself", () => {
    const wb = {
      sections: { [ESG_PROVENANCE_SECTION]: { cells: { "e-data!B90": "not json", nokey: "{}" } } },
    };
    expect(readProvenance(wb)).toEqual([]);
    expect(
      provenanceCells([{ sectionId: ESG_PROVENANCE_SECTION, cellRef: "x", value: 1, ...DIESEL }]),
    ).toEqual({});
  });
});
