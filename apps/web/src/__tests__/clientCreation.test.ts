/**
 * The rules that stop a company existing without an identity.
 *
 * The company list had "Example", "Test", "Test Company" and "Procurement
 * examplee eeeeeeeeeee" in it, each one carrying a sector and a scorecard type
 * that came from a schema default rather than from anyone's decision. Those two
 * defaults are not cosmetic: they choose the code series and the weightings a
 * scorecard is measured against.
 *
 * These tests pin the four fields and, just as importantly, what the rules do
 * NOT do — they must not block an ESG company on B-BBEE fields, and they must
 * not turn the measurement period into a fixed twelve months.
 */
import { describe, expect, it } from "vitest";
import {
  isFinancialYearEndValid,
  normalizeNewClient,
  scorecardTypesForSector,
  validateNewClient,
} from "@shared/clientCreation";

const complete = {
  name: "Thandanani Transport (Pty) Ltd",
  sectorCode: "TRANSPORT",
  scorecardType: "QSE",
  financialYearEnd: "2026-02-28",
};

const fieldsIn = (draft: Parameters<typeof validateNewClient>[0]) =>
  validateNewClient(draft).map((e) => e.field);

describe("creating a company", () => {
  it("accepts a draft that names all four", () => {
    expect(validateNewClient(complete)).toEqual([]);
  });

  /** The incident, as a rule. */
  it("refuses a name-only draft, naming every field that is missing", () => {
    expect(fieldsIn({ name: "Acme" })).toEqual([
      "sectorCode",
      "scorecardType",
      "financialYearEnd",
    ]);
  });

  it("reports every problem at once rather than one per attempt", () => {
    expect(fieldsIn({})).toEqual(["name", "sectorCode", "scorecardType", "financialYearEnd"]);
  });

  it("refuses a name that is only whitespace", () => {
    expect(fieldsIn({ ...complete, name: "   " })).toContain("name");
  });

  it("refuses a single character, and accepts two", () => {
    expect(fieldsIn({ ...complete, name: "A" })).toContain("name");
    expect(fieldsIn({ ...complete, name: "BP" })).toEqual([]);
  });

  it("refuses a sector the scoring pipeline has no configuration for", () => {
    expect(fieldsIn({ ...complete, sectorCode: "MINING" })).toContain("sectorCode");
  });

  it("takes a sector in any casing", () => {
    expect(validateNewClient({ ...complete, sectorCode: "transport" })).toEqual([]);
  });

  /**
   * FSC and AgriBEE have no QSE scorecard. Accepting one would produce a
   * scorecard scored against weightings that do not exist in that code.
   */
  it("refuses a scorecard type the sector does not have", () => {
    const errors = validateNewClient({ ...complete, sectorCode: "FSC", scorecardType: "QSE" });
    expect(errors.map((e) => e.field)).toEqual(["scorecardType"]);
    expect(errors[0].message).toContain("Generic");
  });

  it("knows which types each sector offers", () => {
    expect(scorecardTypesForSector("RCOGP")).toEqual(["Generic", "QSE"]);
    expect(scorecardTypesForSector("AGRI")).toEqual(["Generic"]);
    expect(scorecardTypesForSector("nonsense")).toEqual([]);
  });
});

describe("the financial year end", () => {
  it("has to be a date, not a year", () => {
    expect(isFinancialYearEndValid("2026-02-28")).toBe(true);
    expect(isFinancialYearEndValid("2026")).toBe(false);
    expect(isFinancialYearEndValid("28 February 2026")).toBe(false);
    expect(isFinancialYearEndValid("")).toBe(false);
    expect(isFinancialYearEndValid(null)).toBe(false);
  });

  /** Date rolls 31 February forward to March and would have accepted it. */
  it("rejects a day that does not exist in that month", () => {
    expect(isFinancialYearEndValid("2026-02-31")).toBe(false);
    expect(isFinancialYearEndValid("2026-13-01")).toBe(false);
  });

  it("accepts the 29th in a leap year and refuses it otherwise", () => {
    expect(isFinancialYearEndValid("2024-02-29")).toBe(true);
    expect(isFinancialYearEndValid("2026-02-29")).toBe(false);
  });
});

/**
 * Where the two callers differ, and why.
 *
 * The create FORM asks for a year end: that is the moment someone has the
 * answer in front of them. The ENDPOINT does not demand one, because an Excel
 * import arrives with whatever the client's workbook held — and refusing there
 * strands the user, since the company does not exist yet and there is no
 * workbook to go and fix the field in.
 *
 * Nothing is lost by the softer rule. The workbook refuses to CALCULATE without
 * a year end, and that is the gate the review asked for.
 */
describe("the year end, demanded by the form and not by the endpoint", () => {
  it("is required by default, which is what the form uses", () => {
    expect(fieldsIn({ ...complete, financialYearEnd: "" })).toEqual(["financialYearEnd"]);
  });

  it("can be left out when the caller says so, which is what the import path uses", () => {
    const errors = validateNewClient(
      { ...complete, financialYearEnd: "" },
      { requireFinancialYearEnd: false },
    );
    expect(errors).toEqual([]);
  });

  /** Absent is allowed; wrong is not, whoever is asking. */
  it("is still rejected when supplied in the wrong shape, either way", () => {
    for (const options of [{}, { requireFinancialYearEnd: false }]) {
      const errors = validateNewClient({ ...complete, financialYearEnd: "28 Feb 2026" }, options);
      expect(errors.map((e) => e.field)).toEqual(["financialYearEnd"]);
    }
  });

  it("never relaxes the other three", () => {
    const errors = validateNewClient({ name: "Acme" }, { requireFinancialYearEnd: false });
    expect(errors.map((e) => e.field)).toEqual(["sectorCode", "scorecardType"]);
  });
});

describe("an ESG company", () => {
  /**
   * ESG is not measured against a B-BBEE code. Demanding a sector and a
   * scorecard type would be demanding fields with nothing behind them.
   */
  it("needs only a name", () => {
    expect(validateNewClient({ name: "Super Group", product: "esg" })).toEqual([]);
  });

  it("still needs a real one", () => {
    expect(fieldsIn({ name: "", product: "esg" })).toEqual(["name"]);
  });

  it("refuses a product that is neither", () => {
    expect(fieldsIn({ ...complete, product: "carbon" })).toContain("product");
  });
});

describe("normalising a validated draft", () => {
  it("derives the measurement period as the twelve months ending on the year end", () => {
    const client = normalizeNewClient(complete);
    expect(client.measurementPeriodStart).toBe("2025-03-01");
    expect(client.measurementPeriodEnd).toBe("2026-02-28");
  });

  it("takes the financial year from the closing date, not from today", () => {
    expect(normalizeNewClient(complete).financialYear).toBe("2026");
  });

  /**
   * The period is stored, not computed at read time. That is what makes a
   * short first period or a changed year end editable afterwards — the meeting
   * asked for the year end to be mandatory, not for the period to be fixed.
   */
  it("writes the period as data so it can be edited later", () => {
    const client = normalizeNewClient(complete);
    expect(client.measurementPeriodStart).toBeTruthy();
    expect(client.measurementPeriodEnd).toBeTruthy();
  });

  it("handles a year end on a leap day without sliding the start", () => {
    const client = normalizeNewClient({ ...complete, financialYearEnd: "2024-02-29" });
    expect(client.measurementPeriodStart).toBe("2023-03-01");
    expect(client.measurementPeriodEnd).toBe("2024-02-29");
  });

  it("leaves the B-BBEE fields empty on an ESG company", () => {
    const client = normalizeNewClient({ name: "Super Group", product: "esg" });
    expect(client.sectorCode).toBeNull();
    expect(client.scorecardType).toBeNull();
    expect(client.product).toBe("esg");
  });

  it("trims a pasted name rather than storing the padding", () => {
    expect(normalizeNewClient({ ...complete, name: "  Acme Trading  " }).name).toBe("Acme Trading");
  });
});
