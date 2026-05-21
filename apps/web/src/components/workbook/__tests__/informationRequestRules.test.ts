import { describe, it, expect } from "vitest";
import {
  SECTIONS,
  getSection,
  parseWorkbookDate,
  type ColumnDef,
  type SectionDef,
} from "../sections";

// Replicates SpreadsheetGrid's row validation pipeline (column + cross-field
// + blank-row skip) so we can exercise the end-to-end rules without React.
function isRowEmpty(row: Record<string, unknown>, columns: ColumnDef[]): boolean {
  for (const c of columns) {
    const v = row[c.key];
    if (c.type === "boolean") {
      if (v === true) return false;
      continue;
    }
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    return false;
  }
  return true;
}

function validateGridRow(
  section: SectionDef,
  row: Record<string, unknown>,
): Record<string, string> {
  const columns = section.columns!;
  const errors: Record<string, string> = {};
  const empty = isRowEmpty(row, columns);
  for (const col of columns) {
    const v = row[col.key];
    const blank =
      v === "" || v === undefined || v === null ||
      (typeof v === "string" && v.trim() === "");
    if (!empty && col.required && blank) {
      errors[col.key] = "Required";
      continue;
    }
    if (col.validate) {
      const err = col.validate(v);
      if (err) errors[col.key] = err;
    }
  }
  if (!empty && section.rowValidate) {
    for (const [k, msg] of Object.entries(section.rowValidate(row))) {
      if (!errors[k]) errors[k] = msg;
    }
  }
  return errors;
}

function newRow(section: SectionDef): Record<string, unknown> {
  const r: Record<string, unknown> = { _id: "test" };
  for (const c of section.columns!) r[c.key] = c.type === "boolean" ? false : "";
  return r;
}

// --------------------------------------------------------------------------
// parseWorkbookDate
// --------------------------------------------------------------------------
describe("parseWorkbookDate", () => {
  it("accepts yyyy-mm-dd", () => {
    expect(parseWorkbookDate("2024-03-15")).toBeInstanceOf(Date);
  });
  it("accepts dd/mm/yyyy", () => {
    expect(parseWorkbookDate("15/03/2024")).toBeInstanceOf(Date);
  });
  it("rejects calendar overflow (31/02)", () => {
    expect(parseWorkbookDate("31/02/2024")).toBeNull();
    expect(parseWorkbookDate("2024-02-31")).toBeNull();
  });
  it("rejects malformed strings", () => {
    expect(parseWorkbookDate("not-a-date")).toBeNull();
    expect(parseWorkbookDate("2024/03/15")).toBeNull();
  });
  it("treats blanks as null", () => {
    expect(parseWorkbookDate("")).toBeNull();
    expect(parseWorkbookDate("   ")).toBeNull();
    expect(parseWorkbookDate(null)).toBeNull();
  });
});

// --------------------------------------------------------------------------
// Financial Information (meta form fields)
// --------------------------------------------------------------------------
describe("Financial Information rules", () => {
  const section = getSection("financial-information")!;
  const field = (k: string) => section.meta!.find((f) => f.key === k)!;

  it("marks core financials as required", () => {
    for (const k of ["revenue", "npat", "payroll", "forecastRevenue", "forecastNpat", "forecastPayroll"]) {
      expect(field(k).required).toBe(true);
    }
  });

  it("revenue rejects negative numbers", () => {
    expect(field("revenue").validate!(-100)).toMatch(/≥ 0/);
    expect(field("revenue").validate!(0)).toBeNull();
    expect(field("revenue").validate!(1500000)).toBeNull();
  });

  it("npat allows negative numbers (loss)", () => {
    expect(field("npat").validate!(-50000)).toBeNull();
    expect(field("npat").validate!(50000)).toBeNull();
  });

  it("rejects non-numeric strings", () => {
    expect(field("revenue").validate!("abc")).toMatch(/number/);
  });
});

// --------------------------------------------------------------------------
// Management Control
// --------------------------------------------------------------------------
describe("Management Control rules", () => {
  const section = getSection("management-control")!;

  it("a blank fresh row produces no errors", () => {
    expect(validateGridRow(section, newRow(section))).toEqual({});
  });

  it("a row with only Disabled checked still triggers required errors", () => {
    const r = newRow(section);
    r.isDisabled = true;
    const errs = validateGridRow(section, r);
    expect(errs.name).toBe("Required");
    expect(errs.surname).toBe("Required");
    expect(errs.race).toBe("Required");
    expect(errs.gender).toBe("Required");
    expect(errs.designation).toBe("Required");
    expect(errs.votingRights).toBe("Required");
  });

  it("whitespace-only required fields are flagged as Required", () => {
    const r = newRow(section);
    r.name = "   ";
    r.surname = "Smith";
    const errs = validateGridRow(section, r);
    expect(errs.name).toBe("Required");
  });

  it("designation must be one of the allowed enum values (validated by select)", () => {
    const col = section.columns!.find((c) => c.key === "designation")!;
    expect(col.options).toContain("Executive Director");
    expect(col.options).toContain("Senior Manager");
    expect(col.options).not.toContain("Random Title");
  });

  it("voting rights must be 0–100", () => {
    const col = section.columns!.find((c) => c.key === "votingRights")!;
    expect(col.validate!(-1)).toMatch(/0–100/);
    expect(col.validate!(150)).toMatch(/0–100/);
    expect(col.validate!(50)).toBeNull();
  });

  it("start date accepts numeric years of service OR a date", () => {
    const col = section.columns!.find((c) => c.key === "startDate")!;
    expect(col.validate!("5")).toBeNull();        // years
    expect(col.validate!("15/03/2020")).toBeNull(); // date
    expect(col.validate!("31/02/2020")).toMatch(/Invalid/); // bad date
    expect(col.validate!("hello")).toBeTruthy();
  });
});

// --------------------------------------------------------------------------
// Skills Development cross-field rules
// --------------------------------------------------------------------------
describe("Skills Development rules", () => {
  const section = getSection("skills-development")!;

  it("end date before start date triggers error", () => {
    const r = newRow(section);
    r.programName = "First Aid";
    r.categoryCode = "B";
    r.learnerName = "Jane Doe";
    r.race = "African";
    r.gender = "Female";
    r.startDate = "2024-06-01";
    r.endDate = "2024-05-01";
    r.courseCost = 1000;
    const errs = validateGridRow(section, r);
    expect(errs.endDate).toMatch(/on\/after start/);
  });

  it("end date on/after start date passes", () => {
    const r = newRow(section);
    r.programName = "First Aid";
    r.categoryCode = "B";
    r.learnerName = "Jane Doe";
    r.race = "African";
    r.gender = "Female";
    r.startDate = "2024-06-01";
    r.endDate = "2024-06-30";
    r.courseCost = 1000;
    const errs = validateGridRow(section, r);
    expect(errs.endDate).toBeUndefined();
  });

  it("a training row with no cost or man-hours is flagged", () => {
    const r = newRow(section);
    r.programName = "First Aid";
    r.categoryCode = "B";
    r.learnerName = "Jane Doe";
    r.race = "African";
    r.gender = "Female";
    const errs = validateGridRow(section, r);
    expect(errs.totalCost).toMatch(/cost or man-hours/);
  });

  it("man-hours alone satisfies the cost rule", () => {
    const r = newRow(section);
    r.programName = "First Aid";
    r.categoryCode = "B";
    r.learnerName = "Jane Doe";
    r.race = "African";
    r.gender = "Female";
    r.manHours = 8;
    const errs = validateGridRow(section, r);
    expect(errs.totalCost).toBeUndefined();
  });

  it("required text + enum fields are enforced when row has data", () => {
    const r = newRow(section);
    r.programName = "Some course";
    const errs = validateGridRow(section, r);
    expect(errs.categoryCode).toBe("Required");
    expect(errs.learnerName).toBe("Required");
    expect(errs.race).toBe("Required");
    expect(errs.gender).toBe("Required");
  });

  it("age must be a non-negative integer", () => {
    const col = section.columns!.find((c) => c.key === "age")!;
    expect(col.validate!(-1)).toMatch(/≥ 0/);
    expect(col.validate!(2.5)).toMatch(/whole/);
    expect(col.validate!(30)).toBeNull();
  });
});

// --------------------------------------------------------------------------
// Procurement / Suppliers cross-field rules
// --------------------------------------------------------------------------
describe("Procurement rules", () => {
  const section = getSection("procurement")!;

  it("supplier size enum is Large/QSE/EME", () => {
    const col = section.columns!.find((c) => c.key === "currentSize")!;
    expect(col.options).toEqual(["Large", "QSE", "EME"]);
  });

  it("requires certificate expiry when a B-BBEE level is set", () => {
    const r = newRow(section);
    r.supplierName = "Acme Ltd";
    r.currentSize = "QSE";
    r.spend = 50000;
    r.bbbeeLevel = "4";
    const errs = validateGridRow(section, r);
    expect(errs.certificateExpiryDate).toMatch(/Required when B-BBEE level/);
  });

  it("no cert-expiry error when no B-BBEE level is set", () => {
    const r = newRow(section);
    r.supplierName = "Acme Ltd";
    r.currentSize = "QSE";
    r.spend = 50000;
    const errs = validateGridRow(section, r);
    expect(errs.certificateExpiryDate).toBeUndefined();
  });

  it("black female ownership cannot exceed black ownership", () => {
    const r = newRow(section);
    r.supplierName = "Acme Ltd";
    r.currentSize = "QSE";
    r.spend = 50000;
    r.currentBlackOwnership = 30;
    r.currentBlackFemaleOwnership = 50;
    const errs = validateGridRow(section, r);
    expect(errs.currentBlackFemaleOwnership).toMatch(/Cannot exceed/);
  });

  it("equal black & black-female ownership is allowed", () => {
    const r = newRow(section);
    r.supplierName = "Acme Ltd";
    r.currentSize = "QSE";
    r.spend = 50000;
    r.currentBlackOwnership = 40;
    r.currentBlackFemaleOwnership = 40;
    const errs = validateGridRow(section, r);
    expect(errs.currentBlackFemaleOwnership).toBeUndefined();
  });

  it("spend is required and non-negative", () => {
    const col = section.columns!.find((c) => c.key === "spend")!;
    expect(col.required).toBe(true);
    expect(col.validate!(-1)).toMatch(/≥ 0/);
  });
});

// --------------------------------------------------------------------------
// ESD rules
// --------------------------------------------------------------------------
describe("ESD rules", () => {
  const section = getSection("esd")!;

  it("payment date before invoice date triggers error", () => {
    const r = newRow(section);
    r.supplierName = "Beneficiary X";
    r.currentBlackOwnership = 100;
    r.currentSize = "EME";
    r.contributionDescription = "Grant";
    r.contributionType = "Grant Contribution";
    r.amount = 10000;
    r.invoiceDate = "2024-06-15";
    r.paymentDate = "2024-06-01";
    const errs = validateGridRow(section, r);
    expect(errs.paymentDate).toMatch(/on\/after invoice/);
  });

  it("equal invoice and payment dates pass", () => {
    const r = newRow(section);
    r.supplierName = "Beneficiary X";
    r.currentBlackOwnership = 100;
    r.currentSize = "EME";
    r.contributionDescription = "Grant";
    r.contributionType = "Grant Contribution";
    r.amount = 10000;
    r.invoiceDate = "2024-06-15";
    r.paymentDate = "2024-06-15";
    const errs = validateGridRow(section, r);
    expect(errs.paymentDate).toBeUndefined();
  });
});

// --------------------------------------------------------------------------
// Section catalogue sanity
// --------------------------------------------------------------------------
describe("Section catalogue", () => {
  it("exposes the expected 10 sections in order", () => {
    expect(SECTIONS.map((s) => s.key)).toEqual([
      "company-information",
      "financial-information",
      "ownership",
      "management-control",
      "employees",
      "skills-development",
      "procurement",
      "suppliers",
      "esd",
      "sed",
    ]);
  });
});
