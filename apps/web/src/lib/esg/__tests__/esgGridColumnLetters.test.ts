/**
 * ISO_Tracker and IFRS_S1_S2 do not start at column A, and both reserve E for a
 * sheet-derived "Score /5". The grid engine maps columns positionally, so a
 * user's Status landed in C while every scorecard formula reads D — 16
 * environmental points (E d26/d27/d29) and G d9 were unearnable as a result.
 *
 * These tests pin the corrected mapping against the workbook's own headers and
 * data validations, taken from docs/esg/extracted/{ISO_Tracker,IFRS_S1_S2}.md.
 */
import { describe, expect, it } from "vitest";
import { ESG_GRID_SECTIONS } from "../esgGridSections";
import { readEsgGridRows, writeEsgGridCells } from "../esgGridRows";

describe("ISO_Tracker column mapping", () => {
  it("writes Status to D, the cell the scorecard formulas read", () => {
    const cells = writeEsgGridCells("iso-tracker", [
      {
        _id: "r1",
        requirement: "Environmental aspects — fleet emissions dominant",
        clause: "6.1.2",
        status: "Partially Compliant",
        evidence: "Aspects register maintained",
        netZeroLink: "Fleet diesel dominant aspect",
      },
    ]);

    // ISO_Tracker!R4: B=Requirement C=Clause D=Status … H=Current Evidence I=Net-Zero
    expect(cells.B5).toBe("Environmental aspects — fleet emissions dominant");
    expect(cells.C5).toBe("6.1.2");
    expect(cells.D5).toBe("Partially Compliant");
    expect(cells.H5).toBe("Aspects register maintained");
    expect(cells.I5).toBe("Fleet diesel dominant aspect");
  });

  it("never writes E, which the sheet derives from D", () => {
    const cells = writeEsgGridCells("iso-tracker", [
      { _id: "r1", requirement: "ISO 14001 certification achieved", status: "Fully Compliant" },
    ]);
    // E5 = IF(D5="Fully Compliant",5,IF(D5="Partially Compliant",3,…))
    expect(cells.E5).toBeUndefined();
  });

  it("round-trips through the same letters it wrote", () => {
    const rows = [
      { _id: "r1", requirement: "Legal requirements register", clause: "6.1.3", status: "Gap" },
    ];
    const read = readEsgGridRows(writeEsgGridCells("iso-tracker", rows), "iso-tracker");
    expect(read).toHaveLength(1);
    expect(read[0].status).toBe("Gap");
    expect(read[0].clause).toBe("6.1.3");
  });

  it("uses the workbook's own status vocabulary, not Yes/Partial/No", () => {
    const status = ESG_GRID_SECTIONS["iso-tracker"].columns.find((c) => c.key === "status");
    // From the sheet's data validation on D5:D28.
    expect(status?.options).toEqual([
      "Fully Compliant",
      "Partially Compliant",
      "Gap",
      "Not Applicable",
    ]);
  });
});

describe("IFRS_S1_S2 column mapping", () => {
  it("writes Status to D and text to G/H, not C/D/E", () => {
    const cells = writeEsgGridCells("ifrs", [
      {
        _id: "r1",
        requirement: "Board oversight of climate risks",
        pillar: "Governance",
        status: "Partially Disclosed",
        evidence: "Social and Ethics Committee mandate covers environment",
        action: "Add explicit climate mandate",
      },
    ]);

    // IFRS_S1_S2!R4: B=Requirement C=Pillar D=Status E=Score/5 F=Data Source
    // G=Current Status/Evidence H=Action Required
    expect(cells.B5).toBe("Board oversight of climate risks");
    expect(cells.C5).toBe("Governance");
    expect(cells.D5).toBe("Partially Disclosed");
    expect(cells.G5).toBe("Social and Ethics Committee mandate covers environment");
    expect(cells.H5).toBe("Add explicit climate mandate");
    expect(cells.E5).toBeUndefined();
  });
});

describe("positional mapping stays the default", () => {
  it("leaves grids that genuinely start at A untouched", () => {
    // Fleet_Register data starts at A4 — no override, so index 0 → A.
    expect(ESG_GRID_SECTIONS.fleet.columnLetters).toBeUndefined();
    const cells = writeEsgGridCells("fleet", [{ _id: "r1", reg: "CA 123-456", depot: "CPT" }]);
    expect(cells.A4).toBe("CA 123-456");
    expect(cells.B4).toBe("CPT");
  });

  it("every override names a real column key", () => {
    for (const def of Object.values(ESG_GRID_SECTIONS)) {
      if (!def.columnLetters) continue;
      const keys = new Set(def.columns.map((c) => c.key));
      for (const key of Object.keys(def.columnLetters)) {
        expect(keys, `${def.sectionId}.columnLetters.${key}`).toContain(key);
      }
    }
  });

  it("no override maps two columns onto one letter", () => {
    for (const def of Object.values(ESG_GRID_SECTIONS)) {
      if (!def.columnLetters) continue;
      const letters = Object.values(def.columnLetters);
      expect(new Set(letters).size, `${def.sectionId} has a duplicate column letter`).toBe(
        letters.length,
      );
    }
  });
});
