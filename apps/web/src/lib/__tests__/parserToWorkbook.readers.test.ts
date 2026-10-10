/**
 * Two readers of one document state each fact twice; one reader's rows are that
 * document's line items. And a person's management band comes from what the
 * documents STATE, in order of authority — with every real disagreement put to
 * the user, the lower band scored until they answer.
 *
 * All names and figures are invented.
 */
import { describe, expect, it } from "vitest";
import { parserExtractionsToWorkbook } from "../parserToWorkbook";
import type { ParserExtraction } from "../parserToWorkbook";

const SCHEDULE = "Gathering workbook.xlsx › Procurement";
const LEDGER = "KESTREL INSURE - DETAILED LEDGER.xlsx";

function scheduleRead(): ParserExtraction {
  return {
    documentId: "sheet_table__esd",
    sourceFile: SCHEDULE,
    element: "ESD",
    values: [{
      field: "supplier_rows",
      value: [
        { supplier_name: "Kestrel Insure", claimed_spend_ex_vat: 120000, bee_level: "1" },
        { supplier_name: "Quarry Tools", claimed_spend_ex_vat: 50000, bee_level: "2" },
      ],
    }],
  };
}

describe("two readers of one ledger are one fact", () => {
  it("a schedule row, a name-only model read of the ledger and the deterministic ledger read give ONE supplier row carrying the ledger figure", () => {
    const result = parserExtractionsToWorkbook([
      scheduleRead(),
      // The model's read of the ledger: before ap_subledger_total was bridged
      // it carried only the name — and the figure, once bridged.
      {
        documentId: "esd__detailed_ledger_accounts_payable",
        sourceFile: LEDGER,
        element: "ESD",
        values: [{ field: "supplier_name", value: "KESTREL INSURE" }, { field: "ap_subledger_total", value: "R131,500.25" }],
      },
      // The deterministic sheet reader of the SAME ledger file.
      {
        documentId: "sheet_table__esd",
        sourceFile: LEDGER,
        element: "ESD",
        values: [{ field: "supplier_rows", value: [{ supplier_name: "KESTREL INSURE", claimed_spend_ex_vat: 131500.25 }] }],
      },
    ]);

    const kestrel = (result.rows.procurement ?? []).filter((r) => /kestrel/i.test(String(r.supplierName)));
    expect(kestrel).toHaveLength(1);
    // The accounting record outranks the client's schedule.
    expect(kestrel[0].spend).toBeCloseTo(131500.25, 2);
    expect(kestrel[0]._sourceFiles).toEqual(expect.arrayContaining([SCHEDULE, LEDGER]));
    // It linked, so there is no "counted twice" warning — and the schedule-vs-
    // ledger gap is still reported.
    expect(result.reconciliation.some((f) => f.message.includes("counted twice"))).toBe(false);
    expect(result.reconciliation.some((f) => f.column === "spend" && f.message.includes(LEDGER))).toBe(true);
    // Linking bookkeeping never leaves the module.
    expect(kestrel[0]._readers).toBeUndefined();
    expect(kestrel[0]._cellReaders).toBeUndefined();
  });

  it("a name-only model read of the ledger does not turn the schedule's figure into ledger evidence", () => {
    // The model read linked first and put the ledger's FILE on the schedule
    // row. The schedule figure must still lose to the ledger's own figure.
    const result = parserExtractionsToWorkbook([
      scheduleRead(),
      { documentId: "esd__detailed_ledger", sourceFile: LEDGER, element: "ESD", values: [{ field: "supplier_name", value: "KESTREL INSURE" }] },
      { documentId: "sheet_table__esd", sourceFile: LEDGER, element: "ESD", values: [{ field: "supplier_rows", value: [{ supplier_name: "KESTREL INSURE", claimed_spend_ex_vat: 99000 }] }] },
    ]);
    const kestrel = (result.rows.procurement ?? []).filter((r) => /kestrel/i.test(String(r.supplierName)));
    expect(kestrel).toHaveLength(1);
    expect(kestrel[0].spend).toBeCloseTo(99000, 2);
  });

  it("one reader's equal line items still stay separate (thirteen equal donations are thirteen)", () => {
    const result = parserExtractionsToWorkbook([{
      documentId: "sheet_table__sed",
      sourceFile: "SED workbook.xlsx › Social Development",
      element: "SED",
      values: [{
        field: "beneficiary_rows",
        value: [
          { beneficiary_name: "Hilltop Creche", contribution_value: 500 },
          { beneficiary_name: "Hilltop Creche", contribution_value: 500 },
          { beneficiary_name: "Hilltop Creche", contribution_value: 500 },
        ],
      }],
    }]);
    // Identical rows from one read are collapsed by the exact-duplicate rule
    // (reported), never merged by linking; what matters here is that linking
    // did not treat them as one fact read by two readers.
    expect(result.reconciliation.some((f) => /two readings/.test(f.message))).toBe(false);
  });

  it("two readers of one document that DISAGREE are kept apart and reported", () => {
    const result = parserExtractionsToWorkbook([
      { documentId: "esd__ledger_model", sourceFile: LEDGER, element: "ESD", values: [{ field: "supplier_name", value: "KESTREL INSURE" }, { field: "ap_subledger_total", value: 1000 }] },
      { documentId: "sheet_table__esd", sourceFile: LEDGER, element: "ESD", values: [{ field: "supplier_rows", value: [{ supplier_name: "KESTREL INSURE", claimed_spend_ex_vat: 9000 }] }] },
    ]);
    expect((result.rows.procurement ?? []).filter((r) => /kestrel/i.test(String(r.supplierName)))).toHaveLength(2);
    expect(result.reconciliation.some((f) => /two readings of/.test(f.message) && f.column === "spend")).toBe(true);
  });
});

/** One read of a people sheet. */
function peopleRead(sourceFile: string, rows: Array<Record<string, unknown>>): ParserExtraction {
  return {
    documentId: "sheet_table__management_control",
    sourceFile,
    element: "MANAGEMENT_CONTROL",
    values: [{ field: "employee_rows", value: rows }],
  };
}

const PERSON = { employee_name: "Lerato Khumalo", race: "African", gender: "Female" };

describe("management band: stated evidence, in order of authority", () => {
  it("EE level 'Senior Management' + MC position 'Other Executive Management' (older sheet) + MC position 'Other' (newer sheet) + title 'Admin Manager' is a CONFLICT scored at the lower band, never silently Middle", () => {
    const result = parserExtractionsToWorkbook([
      peopleRead("Gathering v2.xlsx › Management Control", [{ ...PERSON, occupational_level: "Other", designation: "Administration Management" }]),
      peopleRead("Gathering v2.xlsx › Employment Equity", [{ employee_name: "Khumalo, Lerato", race: "African", gender: "Female", occupational_level: "Senior Management", designation: "Admin Manager" }]),
      peopleRead("Gathering v1.xlsm › Management Control", [{ ...PERSON, occupational_level: "Other Executive Management", designation: "Admin Manager" }]),
    ]);
    const people = (result.rows["management-control"] ?? []).filter((r) => /khumalo/i.test(`${r.name} ${r.surname}`));
    expect(people).toHaveLength(1);
    const person = people[0];
    // The lower of the two stated answers until the user picks: Senior, from
    // the stated EE level — not "Middle Manager", which only the title implied.
    expect(person.designation).toBe("Senior Manager");
    expect(person.occupationalLevel).toBe("Senior Management");
    const conflict = (person._conflicts as Record<string, Array<{ value: unknown; sources: string[] }>> | undefined)?.designation;
    expect(conflict?.map((c) => c.value).sort()).toEqual(["Other Executive Manager", "Senior Manager"]);
    expect(conflict?.find((c) => c.value === "Other Executive Manager")?.sources).toEqual(["Gathering v1.xlsm › Management Control"]);
    const finding = result.reconciliation.find((f) => f.column === "designation" && /khumalo/i.test(f.entity));
    expect(finding?.message).toMatch(/lower of the two/);
    // The finding names the real column — it used to call every disagreement "spend".
    expect(result.reconciliation.filter((f) => f.section === "management-control").every((f) => f.column !== "spend")).toBe(true);
  });

  it("a single stated top position outranks the EE level", () => {
    const result = parserExtractionsToWorkbook([
      peopleRead("Gathering.xlsx › Management Control", [{ ...PERSON, occupational_level: "Other Executive Management", designation: "Operations Lead" }]),
      peopleRead("Gathering.xlsx › Employment Equity", [{ ...PERSON, occupational_level: "Senior Management" }]),
    ]);
    const person = (result.rows["management-control"] ?? []).find((r) => /lerato/i.test(String(r.name)))!;
    expect(person.designation).toBe("Other Executive Manager");
    expect(person._conflicts).toBeUndefined();
  });

  it("a band read from a job title never outranks a level the register states", () => {
    const result = parserExtractionsToWorkbook([
      peopleRead("Register.xlsx › Employment Equity", [{ ...PERSON, occupational_level: "Senior Management", designation: "Admin Manager" }]),
    ]);
    const person = (result.rows["management-control"] ?? [])[0];
    // The title is consumed; the stated level is what scores.
    expect(person.designation).not.toBe("Middle Manager");
    expect(person.occupationalLevel).toBe("Senior Management");
  });

  it("…and when the title came from one document and the level from another, the level still wins", () => {
    const result = parserExtractionsToWorkbook([
      peopleRead("Gathering.xlsx › Management Control", [{ ...PERSON, designation: "Admin Manager" }]),
      peopleRead("Gathering.xlsx › Employment Equity", [{ ...PERSON, occupational_level: "Senior Management" }]),
    ]);
    const person = (result.rows["management-control"] ?? []).find((r) => /lerato/i.test(String(r.name)))!;
    expect(person.designation).toBe("Senior Manager");
  });

  it("the foreign flag travels across name-order variants, and template fill-down copies collapse", () => {
    const fillDown = Array.from({ length: 40 }, () => ({ employee_name: "Thabo Mokoena", race: "African", gender: "Male", occupational_level: "Executive Management" }));
    const result = parserExtractionsToWorkbook([
      peopleRead("Gathering v1.xlsm › Management Control", fillDown),
      { documentId: "sheet_table__management_control", sourceFile: "Gathering v1.xlsm › Employment Equity", element: "MANAGEMENT_CONTROL", values: [{ field: "employee_rows", value: [{ employee_name: "Mokoena, Thabo", race: "African", gender: "Male", occupational_level: "Middle Management", foreign: "Yes" }] }] },
    ]);
    const people = (result.rows["management-control"] ?? []).filter((r) => /mokoena/i.test(`${r.name} ${r.surname}`));
    expect(people).toHaveLength(1);
    expect(people[0].isForeign).toBe(true);
  });
});
