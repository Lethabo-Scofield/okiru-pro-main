/**
 * The bridge from parser field names to workbook columns, and required-field
 * hunting.
 *
 * Two things are under test. First, that the translation is EXPLICIT — an
 * unmapped field is reported rather than guessed at, and an ambiguous one is
 * refused rather than dropped into the wrong pillar. Second, that required
 * fields are hunted hard enough to be useful: a procurement row without a
 * supplier name is not evidence of anything, and a pillar scoring zero behind a
 * full-looking grid is the failure this is meant to prevent.
 */
import { describe, expect, it } from "vitest";
import {
  huntRequiredFields,
  requiredGapsForRow,
  targetForField,
} from "../parserFieldBridge";
import { getSection } from "@/components/workbook/sections";

describe("translating parser fields to workbook columns", () => {
  it("maps the expert's vocabulary onto the workbook's", () => {
    // Neither side should change to suit the other: the matrix belongs to the
    // expert, the columns belong to the workbook.
    expect(targetForField("holder_name")).toEqual({ section: "ownership", column: "shareholderName" });
    expect(targetForField("claimed_spend_ex_vat")).toEqual({ section: "procurement", column: "spend" });
    expect(targetForField("learner_name")).toEqual({ section: "skills-development", column: "learnerName" });
  });

  it("routes entity-level values to META, not to a grid row", () => {
    // TMPS is the procurement DENOMINATOR — it is one number for the entity,
    // not a row in the supplier grid.
    expect(targetForField("total_pre_exclusions_tmps")).toEqual({
      section: "financial-information", column: "tmps", meta: true,
    });
    expect(targetForField("current_year_revenue")?.meta).toBe(true);
  });

  it("returns null for a field it was never taught", () => {
    // Reported as unmapped upstream; guessing would put a value in a wrong cell.
    expect(targetForField("hpcsa_number")).toBeNull();
    expect(targetForField("sworn_before_commissioner")).toBeNull();
  });

  it("refuses an ambiguous field with no element to disambiguate it", () => {
    // contribution_type exists in BOTH ESD and SED. Without knowing which
    // document it came from, putting it in either is a coin flip.
    expect(targetForField("contribution_type")).toBeNull();
    expect(targetForField("contribution_type", "ESD")).toEqual({ section: "esd", column: "contributionType" });
    expect(targetForField("contribution_type", "SED")).toEqual({ section: "sed", column: "contributionType" });
  });

  it("routes a demographic field to the element's own pillar, not always to MC", () => {
    // race / gender / ID exist in ownership, MC and skills under the same column
    // key. A share register's race belongs on the shareholder — sending it to
    // Management Control scored a phantom employee and left the holder raceless.
    expect(targetForField("race", "OWNERSHIP")).toEqual({ section: "ownership", column: "race" });
    expect(targetForField("gender", "SKILLS_DEVELOPMENT")).toEqual({ section: "skills-development", column: "gender" });
    expect(targetForField("id_number", "MANAGEMENT_CONTROL")).toEqual({ section: "management-control", column: "idNumber" });
    // With no element it falls back to Management Control (the historical default).
    expect(targetForField("race")).toEqual({ section: "management-control", column: "race" });
  });

  it("maps the learner-schedule spend so Skills does not score on nothing", () => {
    expect(targetForField("total_cost")).toEqual({ section: "skills-development", column: "totalCost" });
  });

  it("scopes contribution_value to the element, like the other shared ESD/SED fields", () => {
    expect(targetForField("contribution_value")).toBeNull();
    expect(targetForField("contribution_value", "SED")).toEqual({ section: "sed", column: "amount" });
    expect(targetForField("contribution_value", "ESD")).toEqual({ section: "esd", column: "amount" });
  });

  it("maps every target onto a column that actually exists", () => {
    // A mapping to a column the workbook does not have is a silent no-op.
    for (const field of ["holder_name", "supplier_name", "beneficiary_name", "learner_name", "employee_name"]) {
      const target = targetForField(field)!;
      const section = getSection(target.section);
      const exists = (section?.columns ?? []).some((c) => c.key === target.column);
      expect(exists, `${field} -> ${target.section}.${target.column} does not exist`).toBe(true);
    }
  });
});

describe("hunting required fields on one row", () => {
  it("names a required column the row has not filled", () => {
    // A supplier row with spend but no name is not evidence of anything.
    const gaps = requiredGapsForRow("procurement", { spend: 1000 });
    expect(gaps.map((g) => g.column)).toContain("supplierName");
  });

  it("reports the human LABEL, because this is shown to a client", () => {
    const gaps = requiredGapsForRow("procurement", { spend: 1000 });
    const supplier = gaps.find((g) => g.column === "supplierName")!;
    expect(supplier.label.length).toBeGreaterThan(0);
    expect(supplier.label).not.toBe("supplierName");
  });

  it("treats a blank string as unfilled, not as filled", () => {
    const gaps = requiredGapsForRow("procurement", { supplierName: "   ", spend: 1000 });
    expect(gaps.map((g) => g.column)).toContain("supplierName");
  });

  it("reports nothing when every required column is present", () => {
    const section = getSection("procurement")!;
    const complete: Record<string, unknown> = {};
    for (const column of section.columns ?? []) {
      if (column.required) complete[column.key] = column.type === "number" ? 1 : "value";
    }
    expect(requiredGapsForRow("procurement", complete)).toEqual([]);
  });
});

describe("hunting across a whole case", () => {
  it("collapses the same gap across many rows into one thing to tell the user", () => {
    // Ten supplier rows all missing a name is ONE message, not ten.
    const rows = Array.from({ length: 10 }, (_, i) => ({ spend: 1000 + i }));
    const report = huntRequiredFields({ procurement: rows });

    const supplierGaps = report.gaps.filter((g) => g.column === "supplierName");
    expect(supplierGaps).toHaveLength(1);
  });

  it("does not report an entirely empty row", () => {
    // An untouched row is an absence, not a gap — reporting every required
    // column of a row nobody filled would bury the real gaps.
    const report = huntRequiredFields({ procurement: [{ _id: "x" }] });
    expect(report.gaps).toEqual([]);
    expect(report.complete).toBe(true);
  });

  it("hunts across several sections at once", () => {
    const report = huntRequiredFields({
      procurement: [{ spend: 1000 }],
      sed: [{ amount: 500 }],
    });

    const sections = new Set(report.gaps.map((g) => g.section));
    expect(sections.has("procurement")).toBe(true);
    expect(sections.has("sed")).toBe(true);
  });

  it("carries unmapped parser fields through to the report", () => {
    const report = huntRequiredFields({}, ["hpcsa_number", "sworn_before_commissioner"]);
    expect(report.unmapped).toEqual(["hpcsa_number", "sworn_before_commissioner"]);
  });

  it("reports complete when every row satisfies its required columns", () => {
    const section = getSection("sed")!;
    const complete: Record<string, unknown> = {};
    for (const column of section.columns ?? []) {
      if (column.required) complete[column.key] = column.type === "number" ? 1 : "value";
    }

    const report = huntRequiredFields({ sed: [complete] });
    expect(report.complete).toBe(true);
  });

  it("handles an empty case without throwing", () => {
    const report = huntRequiredFields({});
    expect(report).toEqual({ gaps: [], unmapped: [], complete: true });
  });
});
