import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { normalizeExcelBuffer, parseLooseNumber } from "../workbookExcelNormalizer";

function makeBuffer(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [name, matrix] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(matrix);
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return out;
}

describe("parseLooseNumber", () => {
  it("handles plain numbers and numeric strings", () => {
    expect(parseLooseNumber(1234)).toBe(1234);
    expect(parseLooseNumber("1234")).toBe(1234);
    expect(parseLooseNumber("1234.5")).toBe(1234.5);
  });

  it("strips the South-African rand prefix", () => {
    expect(parseLooseNumber("R 1,234.50")).toBe(1234.5);
    expect(parseLooseNumber("R1234")).toBe(1234);
    expect(parseLooseNumber("r 250")).toBe(250);
  });

  it("treats thin / non-breaking / plain spaces as thousands separators", () => {
    expect(parseLooseNumber("1 234.5")).toBe(1234.5);
    expect(parseLooseNumber("1\u00A0234,50")).toBe(1234.5);
    expect(parseLooseNumber("1\u202F234")).toBe(1234);
  });

  it("uses the last separator as the decimal when both , and . are present", () => {
    expect(parseLooseNumber("R 1,234.50")).toBe(1234.5);
    expect(parseLooseNumber("R 1.234,50")).toBe(1234.5);
    expect(parseLooseNumber("1,234,567.89")).toBe(1234567.89);
    expect(parseLooseNumber("1.234.567,89")).toBe(1234567.89);
  });

  it("treats a single comma followed by 3 digits as a thousands separator", () => {
    expect(parseLooseNumber("1,234")).toBe(1234);
    expect(parseLooseNumber('"1,234"')).toBe(1234);
  });

  it("treats a single comma not followed by 3 digits as a decimal", () => {
    expect(parseLooseNumber("12,5")).toBe(12.5);
    expect(parseLooseNumber("0,75")).toBe(0.75);
  });

  it("treats multiple dots as European thousands separators", () => {
    expect(parseLooseNumber("1.234.567")).toBe(1234567);
  });

  it("handles parentheses and minus signs for negatives", () => {
    expect(parseLooseNumber("(1,234.50)")).toBe(-1234.5);
    expect(parseLooseNumber("-1 234")).toBe(-1234);
  });

  it("returns null for blanks and garbage", () => {
    expect(parseLooseNumber("")).toBeNull();
    expect(parseLooseNumber(null)).toBeNull();
    expect(parseLooseNumber(undefined)).toBeNull();
    expect(parseLooseNumber("abc")).toBeNull();
    expect(parseLooseNumber(".")).toBeNull();
  });
});

describe("normalizeExcelBuffer — column header aliases", () => {
  it.each([
    "Rand Value",
    "Amount",
    "Spend",
    "Procurement Spend",
    "Supplier Spend",
    "Value (R)",
    "R Spend",
    "Total Spend",
    "Spend (Excl VAT)",
  ])("maps the spend column alias %s to the canonical `spend` key", (alias) => {
    const buf = makeBuffer({
      Procurement: [
        ["Supplier Name", "Current Size", alias],
        ["Acme Pty Ltd", "EME", "R 1,234.50"],
      ],
    });
    const { sections } = normalizeExcelBuffer(buf);
    const rows = sections.procurement?.rows ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].spend).toBe(1234.5);
    expect(rows[0].supplierName).toBe("Acme Pty Ltd");
  });

  it.each([
    ["R 1,234.50", 1234.5],
    ["R1 234,50", 1234.5],
    ["1 234.5", 1234.5],
    ["1,234", 1234],
    ["1.234,50", 1234.5],
  ])("parses currency format %s to %s in a spend cell", (input, expected) => {
    const buf = makeBuffer({
      Suppliers: [
        ["Supplier Name", "Current Size", "Spend"],
        ["Vendor X", "QSE", input],
      ],
    });
    const { sections } = normalizeExcelBuffer(buf);
    expect(sections.procurement?.rows?.[0]?.spend).toBe(expected);
  });

  it.each([
    "Company Size",
    "Size",
    "Supplier Size",
    "Current Size",
    "Enterprise Size",
  ])("maps the size column alias %s to currentSize", (alias) => {
    const buf = makeBuffer({
      Procurement: [
        ["Supplier Name", alias, "Spend"],
        ["Vendor A", "EME", "1000"],
      ],
    });
    const { sections } = normalizeExcelBuffer(buf);
    expect(sections.procurement?.rows?.[0]?.currentSize).toBe("EME");
  });

  it.each([
    ["EME", "EME"],
    ["Exempted Micro Enterprise", "EME"],
    ["Micro", "EME"],
    ["QSE", "QSE"],
    ["Qualifying Small Enterprise", "QSE"],
    ["Small", "QSE"],
    ["Large", "Large"],
    ["Large Enterprise", "Large"],
    ["Generic", "Large"],
  ])("normalises the supplier-size value %s to %s", (input, canonical) => {
    const buf = makeBuffer({
      Procurement: [
        ["Supplier Name", "Current Size", "Spend"],
        ["Vendor", input, "100"],
      ],
    });
    const { sections } = normalizeExcelBuffer(buf);
    expect(sections.procurement?.rows?.[0]?.currentSize).toBe(canonical);
  });

  it.each([
    ["Top Mgmt", "Top Management"],
    ["Snr Mgmt", "Senior Management"],
    ["Senior", "Senior Management"],
    ["Middle Mgmt", "Middle Management"],
    ["Junior Manager", "Junior Management"],
    ["Junior Mgmt", "Junior Management"],
    ["Jnr Mgmt", "Junior Management"],
    ["Semi skilled", "Semi-Skilled"],
    ["Semi-Skilled", "Semi-Skilled"],
    ["Skilled", "Skilled"],
    ["Unskilled", "Unskilled"],
  ])("normalises the occupational-level value %s to %s", (input, canonical) => {
    const buf = makeBuffer({
      Employees: [
        ["First Name", "Surname", "Race", "Gender", "Occupational Level"],
        ["Ada", "Lovelace", "African", "Female", input],
      ],
    });
    const { sections } = normalizeExcelBuffer(buf);
    const row = sections.employees?.rows?.[0];
    expect(row?.occupationalLevel).toBe(canonical);
  });

  it.each([
    "Occ Level",
    "Management Tier",
    "Tier",
    "Job Level",
  ])("maps the occupational-level column alias %s", (alias) => {
    const buf = makeBuffer({
      Employees: [
        ["First Name", "Surname", "Race", "Gender", alias],
        ["Bob", "Smith", "White", "Male", "Junior Mgmt"],
      ],
    });
    const { sections } = normalizeExcelBuffer(buf);
    expect(sections.employees?.rows?.[0]?.occupationalLevel).toBe("Junior Management");
  });

  it("normalises B-BBEE level synonyms", () => {
    const buf = makeBuffer({
      Suppliers: [
        ["Supplier Name", "Current Size", "Spend", "BEE Level"],
        ["A", "EME", "1", "Level 1"],
        ["B", "QSE", "2", "Non-Compliant"],
        ["C", "Large", "3", "Not Compliant"],
        ["D", "EME", "4", "NC"],
      ],
    });
    const { sections } = normalizeExcelBuffer(buf);
    const rows = sections.procurement!.rows!;
    expect(rows[0].bbbeeLevel).toBe("1");
    expect(rows[1].bbbeeLevel).toBe("Non-compliant");
    expect(rows[2].bbbeeLevel).toBe("Non-compliant");
    expect(rows[3].bbbeeLevel).toBe("Non-compliant");
  });
});

describe("normalizeExcelBuffer — procurement/suppliers dedup", () => {
  it("routes a sheet named 'Suppliers' to the canonical procurement section", () => {
    const buf = makeBuffer({
      Suppliers: [
        ["Supplier Name", "Company Size", "Rand Value"],
        ["LegacySheetVendor", "Exempted Micro Enterprise", "R 1 234,50"],
      ],
    });
    const { sections, mappedSheets } = normalizeExcelBuffer(buf);
    expect(mappedSheets["Suppliers"]).toBe("procurement");
    expect(sections.procurement?.rows).toHaveLength(1);
    expect(sections.procurement?.rows?.[0]?.supplierName).toBe("LegacySheetVendor");
    expect(sections.procurement?.rows?.[0]?.currentSize).toBe("EME");
    expect(sections.procurement?.rows?.[0]?.spend).toBe(1234.5);
    // The "suppliers" section has been removed — it must not appear in the
    // normaliser output at all.
    expect(sections.suppliers).toBeUndefined();
  });

  it("merges rows when a workbook ships both 'Procurement' and 'Suppliers' sheets", () => {
    const buf = makeBuffer({
      Procurement: [
        ["Supplier Name", "Current Size", "Spend"],
        ["A", "EME", "100"],
      ],
      Suppliers: [
        ["Supplier Name", "Current Size", "Spend"],
        ["B", "QSE", "200"],
      ],
    });
    const { sections } = normalizeExcelBuffer(buf);
    expect(sections.procurement?.rows).toHaveLength(2);
    const names = sections.procurement!.rows!.map((r) => r.supplierName).sort();
    expect(names).toEqual(["A", "B"]);
  });
});

describe("normalizeExcelBuffer — skills cost aliases", () => {
  it("recognises common cost-column aliases for Skills Development rows", () => {
    const buf = makeBuffer({
      "Skills Development": [
        [
          "Training Program Name",
          "Category",
          "Learner Name",
          "Race",
          "Gender",
          "Course Fees",
          "Travel",
          "Total",
        ],
        ["Excel 101", "B", "Ada Lovelace", "African", "Female", "R 1,000", "R 250", "R 1,250"],
      ],
    });
    const { sections } = normalizeExcelBuffer(buf);
    const row = sections["skills-development"]?.rows?.[0];
    expect(row).toBeDefined();
    expect(row?.programName).toBe("Excel 101");
    expect(row?.categoryCode).toBe("B");
    expect(row?.learnerName).toBe("Ada Lovelace");
    expect(row?.courseCost).toBe(1000);
    expect(row?.travelCost).toBe(250);
    expect(row?.totalCost).toBe(1250);
  });
});
