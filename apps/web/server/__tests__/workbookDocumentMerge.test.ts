import { describe, expect, it } from "vitest";
import { mergeDocumentSections } from "../workbookDocumentMerge";

const existing = {
  "company-information": { meta: { companyName: "Example Trading 101", financialYearEnd: "2026-02-28", vatNumber: "" } },
  "financial-information": { meta: { revenue: 274953097 } },
  "management-control": {
    rows: [
      { _id: "r1", name: "Mduduzi", surname: "Dlamini", idNumber: "8102286296088", race: "", occupationalLevel: "Junior Management" },
    ],
  },
  procurement: { rows: [{ _id: "p1", supplierName: "AMAJALI INDUSTRIES (PTY) LTD", spend: 1699000, bbbeeLevel: "" }] },
};

describe("mergeDocumentSections — adding documents to an existing workbook", () => {
  it("fills blanks, adds new rows, and never overwrites or deletes", () => {
    const { changed, report } = mergeDocumentSections(existing, {
      "company-information": { meta: { vatNumber: "4123456789", financialYearEnd: "2025-02-28" } },
      "management-control": {
        rows: [
          // Same person by ID — only the blank Race is filled.
          { name: "M", surname: "Dlamini", idNumber: "8102286296088", race: "African", occupationalLevel: "Senior Management", _sourceFiles: ["payroll.xlsx"] },
          // A new person.
          { name: "Sifiso", surname: "Kunene", idNumber: "8407096092084", race: "African", occupationalLevel: "Middle Management" },
        ],
      },
      procurement: { rows: [{ supplierName: "Amajali Industries", bbbeeLevel: "1", spend: 1700000 }] },
    });

    expect(changed["company-information"].meta).toMatchObject({ vatNumber: "4123456789", financialYearEnd: "2026-02-28" });
    const mc = changed["management-control"].rows!;
    expect(mc).toHaveLength(2);
    expect(mc[0]).toMatchObject({ _id: "r1", name: "Mduduzi", race: "African", occupationalLevel: "Junior Management", _sourceFiles: ["payroll.xlsx"] });
    expect(mc[1]).toMatchObject({ name: "Sifiso", surname: "Kunene" });
    // "(PTY) LTD" and case don't make it a different supplier.
    expect(changed.procurement.rows).toEqual([
      { _id: "p1", supplierName: "AMAJALI INDUSTRIES (PTY) LTD", spend: 1699000, bbbeeLevel: "1" },
    ]);

    expect(report.added).toEqual({ "management-control": 1 });
    expect(report.filled).toBe(3); // vatNumber, race, bbbeeLevel
    expect(report.conflicts).toEqual(
      expect.arrayContaining([
        { section: "company-information", field: "financialYearEnd", kept: "2026-02-28", offered: "2025-02-28" },
        { section: "management-control", field: "occupationalLevel", kept: "Junior Management", offered: "Senior Management", row: "Mduduzi Dlamini" },
        { section: "procurement", field: "spend", kept: 1699000, offered: 1700000, row: "AMAJALI INDUSTRIES (PTY) LTD" },
      ]),
    );
    // The ID matched, so the different first name is reported too, not applied.
    expect(report.conflicts.some((c) => c.field === "name" && c.offered === "M")).toBe(true);
  });

  it("writes nothing for sections it did not change, and leaves untouched ones alone", () => {
    const { changed } = mergeDocumentSections(existing, {
      "financial-information": { meta: { revenue: 274953097 } },
      ownership: { rows: [] },
    });
    expect(changed).toEqual({});
  });

  it("reports sections the caller may not write instead of writing them", () => {
    const { changed, report } = mergeDocumentSections(
      existing,
      { procurement: { rows: [{ supplierName: "New Supplier", spend: 5 }] }, sed: { rows: [{ beneficiaryName: "School", contributionType: "Cash", amount: 100 }] } },
      (section) => section !== "procurement",
    );
    expect(report.blocked).toEqual(["procurement"]);
    expect(changed.procurement).toBeUndefined();
    expect(changed.sed.rows).toHaveLength(1);
  });

  it("adds a row with nothing identifying it rather than guessing a match", () => {
    const { changed, report } = mergeDocumentSections(existing, {
      "management-control": { rows: [{ race: "African" }] },
    });
    expect(changed["management-control"].rows).toHaveLength(2);
    expect(report.added["management-control"]).toBe(1);
  });
});
