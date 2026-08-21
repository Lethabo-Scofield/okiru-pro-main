/**
 * The name has to come from the evidence, or from the user — never from us.
 *
 * These pin the two halves of that: the cascade finds a name in every shape the
 * ESG parser and the `.xlsx` import actually produce, and it returns "" rather
 * than a guess when nothing named the entity (an empty required field at step 3
 * is honest; "Untitled Company" would be a lie that then gets scored).
 */
import { describe, expect, it } from "vitest";
import {
  esgEntityNameFromSections,
  esgProposedEntityName,
  pickEsgEntityName,
} from "../esgEntityName";
import type { EsgParserCaseLike } from "../esgParserInjection";

describe("pickEsgEntityName", () => {
  it("prefers the resolved entity field", () => {
    const caseResult = {
      ai_entities: {
        fields: {
          entity_name: { value: "Lake Trading (Pty) Ltd" },
          company_name: { value: "Something Else" },
        },
      },
    } as unknown as EsgParserCaseLike;
    expect(pickEsgEntityName(caseResult)).toBe("Lake Trading (Pty) Ltd");
  });

  it("reads the parser's own calculator key when there is no resolved field", () => {
    const caseResult = {
      ai_entities: {
        fields: {},
        calculator: { payload: { "entity.name": "Ubuntu Logistics CC" } },
      },
    } as unknown as EsgParserCaseLike;
    expect(pickEsgEntityName(caseResult)).toBe("Ubuntu Logistics CC");
  });

  it("falls back to a named field inside a per-document extraction", () => {
    const caseResult = {
      ai_entities: {
        fields: {},
        extractions: [
          {
            sourceFile: "profile.pdf",
            values: [
              { field: "site_name", value: "Kya Sand depot" },
              { field: "company_name", value: "Kya Sand Freight (Pty) Ltd" },
            ],
          },
        ],
      },
    } as unknown as EsgParserCaseLike;
    expect(pickEsgEntityName(caseResult)).toBe("Kya Sand Freight (Pty) Ltd");
  });

  it("finds a labelled name in free text as a last resort", () => {
    const caseResult = {
      ai_entities: { fields: {} },
      documents: [{ file_name: "letterhead.pdf" }],
      notes: ["Measured Entity: Highveld Cold Chain (Pty) Ltd", "Period: FY2026"],
    } as unknown as EsgParserCaseLike;
    expect(pickEsgEntityName(caseResult)).toBe("Highveld Cold Chain (Pty) Ltd");
  });

  it("returns nothing rather than inventing a name", () => {
    expect(pickEsgEntityName(null)).toBe("");
    expect(
      pickEsgEntityName({
        documents: [{ file_name: "electricity-july.pdf" }],
        ai_entities: { fields: {}, extractions: [{ values: [{ field: "electricity_kwh", value: 35332 }] }] },
      } as unknown as EsgParserCaseLike),
    ).toBe("");
  });
});

describe("esgEntityNameFromSections", () => {
  it("takes the cover sheet's own entity cell", () => {
    expect(
      esgEntityNameFromSections({
        "company-reporting-setup": { cells: { entity: "Acme Freight (Pty) Ltd", period: "FY2026" } },
      }),
    ).toBe("Acme Freight (Pty) Ltd");
  });

  it("reads the template layout — key, label, then the value beside them", () => {
    // Exactly what the downloadable template writes: A = cell ref, B = field
    // label, C = the value the user filled in.
    expect(
      esgEntityNameFromSections({
        "company-reporting-setup": {
          cells: {
            A1: "Cell Ref",
            B1: "Field",
            C1: "Value (fill in)",
            A2: "entity",
            B2: "Entity",
            C2: "Riverside Distribution (Pty) Ltd",
            A3: "period",
            B3: "Reporting period",
            C3: "FY2026",
          },
        },
      }),
    ).toBe("Riverside Distribution (Pty) Ltd");
  });

  it("never returns the label itself as the name", () => {
    expect(
      esgEntityNameFromSections({
        "company-reporting-setup": { cells: { A2: "entity", B2: "Entity" } },
      }),
    ).toBe("");
    expect(esgEntityNameFromSections({})).toBe("");
  });
});

describe("esgProposedEntityName", () => {
  it("prefers what the parser resolved over what it mapped into a cell", () => {
    const caseResult = {
      ai_entities: { fields: { entity_name: { value: "Lake Trading (Pty) Ltd" } } },
    } as unknown as EsgParserCaseLike;
    expect(
      esgProposedEntityName(caseResult, {
        "company-reporting-setup": { cells: { entity: "LAKE TRADING" } },
      }),
    ).toBe("Lake Trading (Pty) Ltd");
  });

  it("uses the mapped cover cell when nothing else resolved", () => {
    expect(
      esgProposedEntityName(null, {
        "company-reporting-setup": { cells: { entity: "Thandanani Transport" } },
      }),
    ).toBe("Thandanani Transport");
  });
});
