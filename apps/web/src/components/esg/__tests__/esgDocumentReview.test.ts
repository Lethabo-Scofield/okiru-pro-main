import { describe, expect, it } from "vitest";
import { buildEsgDocumentReview } from "../esgDocumentReview";
import type { EsgInjectionResult, EsgParserCaseLike } from "../esgParserInjection";

const parserCase: EsgParserCaseLike = {
  documents: [{ file_name: "DIESEL REPORT - Mar 2026.xlsx" }, { file_name: "city-power-oct.pdf" }, { file_name: "scan.jpg" }],
  unreadable_files: [{ file_name: "scan.jpg", reason: "OCR produced no text layer" }],
  ai_entities: {
    extractions: [
      {
        sourceFile: "DIESEL REPORT - Mar 2026.xlsx › BLOEM",
        documentName: "Fuel consumption report",
        element: "FLEET",
        values: [{ field: "diesel_litres", value: 5922 }],
      },
      {
        sourceFile: "DIESEL REPORT - Mar 2026.xlsx › DBN",
        documentName: "Fuel consumption report",
        element: "FLEET",
        values: [{ field: "diesel_litres", value: 4100 }],
      },
      {
        sourceFile: "city-power-oct.pdf",
        documentName: "Municipal electricity bill",
        element: "GHG_ENERGY",
        values: [{ field: "electricity_kwh", value: 35332 }],
        missingFields: ["max_demand_kva"],
        exceptions: ["Billing period ends 31 Oct 2025, one day outside the reporting period."],
      },
    ],
  },
};

const injection: EsgInjectionResult = {
  implemented: true,
  patches: {},
  placed: [
    { sectionId: "e-data", cellRef: "s1a!C10", field: "diesel_litres", value: 5922, sourceFile: "DIESEL REPORT - Mar 2026.xlsx › BLOEM", documentId: "x" },
  ],
  unplaced: [
    { field: "electricity_kwh", value: 35332, sourceFile: "city-power-oct.pdf", documentId: "y", element: "GHG_ENERGY", reason: "The bill names no billing month." },
  ],
  conflicts: [
    {
      sectionId: "e-data",
      cellRef: "s1a!C11",
      label: "DBN diesel (Mar 2026)",
      candidates: [
        { value: 4100, sources: ["DIESEL REPORT - Mar 2026.xlsx › DBN"] },
        { value: 4300, sources: ["DBN fuel card.pdf"] },
      ],
    },
  ],
  valuesRead: 4,
};

const n = (value: number) => value.toLocaleString("en-ZA");

describe("buildEsgDocumentReview", () => {
  const docs = buildEsgDocumentReview({
    parserCase,
    injection,
    uploadNames: ["DIESEL REPORT - Mar 2026.xlsx", "city-power-oct.pdf", "scan.jpg"],
  });
  const byName = Object.fromEntries(docs.map((d) => [d.filename, d]));

  it("groups a workbook's sheets back under the file that was uploaded, and names the sheet", () => {
    expect(docs.map((d) => d.filename).sort()).toEqual(["DIESEL REPORT - Mar 2026.xlsx", "city-power-oct.pdf", "scan.jpg"]);
    const diesel = byName["DIESEL REPORT - Mar 2026.xlsx"];
    expect(diesel.values).toEqual([
      { label: "Diesel litres", value: n(5922), source: "Sheet: BLOEM" },
      { label: "Diesel litres", value: n(4100), source: "Sheet: DBN" },
    ]);
    expect(diesel.summary).toBe("1 placed · 2 read · 2 sheets");
    expect(diesel.documentType).toBe("Fuel consumption report");
  });

  it("says where two documents disagree, on each document involved", () => {
    const diesel = byName["DIESEL REPORT - Mar 2026.xlsx"];
    expect(diesel.state).toBe("needs-look");
    expect(diesel.problems[0].headline).toBe("Your documents disagree on DBN diesel (Mar 2026).");
    expect(diesel.problems[0].detail).toBe("This one says 4100; DBN fuel card.pdf says 4300.");
  });

  it("explains a document read but not placed, with the reason for each value", () => {
    const bill = byName["city-power-oct.pdf"];
    expect(bill.state).toBe("needs-look");
    expect(bill.problems[0].headline).toBe("We read 1 value from this document but could place none of them in the workbook.");
    expect(bill.unplaced).toEqual([{ label: "Electricity kwh", value: n(35332), source: "The bill names no billing month." }]);
    expect(bill.problems.some((p) => /one day outside the reporting period/.test(p.detail ?? ""))).toBe(true);
    expect(bill.notFound).toEqual(["Max demand kva"]);
  });

  it("explains an unreadable file in plain words, worst first", () => {
    expect(docs[0].filename).toBe("scan.jpg");
    expect(docs[0].state).toBe("not-read");
    expect(docs[0].problems[0].headline).toBe("This looks like a scan or photo we couldn't read clearly.");
  });
});
