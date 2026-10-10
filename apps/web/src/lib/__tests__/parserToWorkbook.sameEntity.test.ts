/**
 * One supplier, one person, one row — across every document and every reader
 * that touched them.
 *
 * Each case reproduces, with invented names and figures, what a live paid read
 * of a real 17-document pack put on the grids: 48 procurement rows for 41
 * suppliers (one supplier three times, its spend counted twice; an SED
 * beneficiary as a supplier; nameless rows from ownership documents) and 16
 * people for 14 (the owner again by initials, one manager again at a higher
 * level, and every "Surname, Name" employee with the two the wrong way round).
 */
import { describe, expect, it } from "vitest";
import { parserExtractionsToWorkbook, type ParserExtraction } from "../parserToWorkbook";

const supplierTable = (sourceFile: string, rows: Array<Record<string, unknown>>, documentId = "sheet_table__esd"): ParserExtraction => ({
  documentId,
  sourceFile,
  element: "ESD",
  values: [{ field: "supplier_rows", value: rows }],
});

const employeeTable = (sourceFile: string, rows: Array<Record<string, unknown>>): ParserExtraction => ({
  documentId: "sheet_table__management_control",
  sourceFile,
  element: "MANAGEMENT_CONTROL",
  values: [{ field: "employee_rows", value: rows }],
});

const spendOf = (rows: Array<Record<string, unknown>> | undefined) =>
  (rows ?? []).reduce((sum, row) => sum + Number(row.spend ?? 0), 0);

describe("a file read by two readers is one piece of evidence", () => {
  it("links a supplier ledger's table read to the row its first read already joined", () => {
    // The ledger is read twice: once as a ledger (name only) and once as a
    // table (name and spend). The first read joins the schedule's row; the
    // second used to be refused as "a second line of the same document" and
    // became its own row — the supplier's spend counted twice.
    const result = parserExtractionsToWorkbook([
      supplierTable("Pack.xlsx › Procurement", [
        { supplier_name: "Kestrel Freight", claimed_spend_ex_vat: 1000, bee_level: "Level 1" },
        { supplier_name: "Ibis Tyres", claimed_spend_ex_vat: 500 },
      ]),
      {
        documentId: "esd__detailed_ledger",
        sourceFile: "KESTREL FREIGHT ledger.xlsx",
        element: "ESD",
        values: [{ field: "supplier_name", value: "KESTREL FREIGHT" }],
      },
      supplierTable("KESTREL FREIGHT ledger.xlsx", [{ supplier_name: "KESTREL FREIGHT", claimed_spend_ex_vat: 1100 }]),
    ]);

    const rows = result.rows.procurement ?? [];
    expect(rows.map((r) => r.supplierName)).toEqual(["Kestrel Freight", "Ibis Tyres"]);
    // The accounting record's figure, once — not the schedule's plus the ledger's.
    expect(rows[0].spend).toBe(1100);
    expect(spendOf(rows)).toBe(1600);
  });

  it("links a sheet's table read to the certificate read of the same sheet", () => {
    const result = parserExtractionsToWorkbook([
      supplierTable("Gathering.xlsx › Procurement", [{ supplier_name: "Heron Paints", claimed_spend_ex_vat: 4200 }]),
      // A certificate spec reading one supplier off the second workbook's sheet…
      {
        documentId: "esd__valid_b_bbee_verification_certificate",
        sourceFile: "Spend.xlsm › Procurement",
        element: "ESD",
        values: [
          { field: "supplier_name", value: "Heron Paints" },
          { field: "bee_level", value: "Level 4" },
        ],
      },
      // …and the table reader reading the whole of that sheet.
      supplierTable("Spend.xlsm › Procurement", [{ supplier_name: "Heron Paints", claimed_spend_ex_vat: 4200, bee_level: "Level 4" }]),
    ]);

    const rows = result.rows.procurement ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].spend).toBe(4200);
    expect(rows[0].bbbeeLevel).toBe("4");
  });

  it("still keeps two lines of ONE read apart", () => {
    const result = parserExtractionsToWorkbook([
      supplierTable("Pack.xlsx › Procurement", [
        { supplier_name: "Kestrel Freight", claimed_spend_ex_vat: 1000, invoice_number: "A-1" },
        { supplier_name: "Kestrel Freight", claimed_spend_ex_vat: 2500, invoice_number: "A-2" },
      ]),
    ]);
    expect(spendOf(result.rows.procurement)).toBe(3500);
  });
});

describe("only supplier evidence opens a supplier row", () => {
  it("never makes an SED payment's beneficiary a supplier", () => {
    const result = parserExtractionsToWorkbook([
      supplierTable("Pack.xlsx › Procurement", [{ supplier_name: "Kestrel Freight", claimed_spend_ex_vat: 1000 }]),
      {
        documentId: "sed__supplier_invoices_for_goods_services_contributed_in_kind",
        sourceFile: "donation-invoice.pdf",
        element: "SED",
        values: [
          { field: "supplier_name", value: "Riverside Community Kitchen" },
          { field: "amount_ex_vat", value: "R750.00" },
        ],
      },
    ]);
    expect((result.rows.procurement ?? []).map((r) => r.supplierName)).toEqual(["Kestrel Freight"]);
  });

  it("never opens a supplier row from an ownership or management document", () => {
    const result = parserExtractionsToWorkbook([
      supplierTable("Pack.xlsx › Procurement", [{ supplier_name: "Kestrel Freight", claimed_spend_ex_vat: 1000 }]),
      {
        documentId: "ownership__cipc_registration",
        sourceFile: "registration.pdf",
        element: "OWNERSHIP",
        values: [
          { field: "supplier_rows", value: [{ registration_number: "2001/000001/07" }, { registration_number: "2001/000002/07" }] },
          { field: "supplier_name", value: "Acme Holdings" },
        ],
      },
    ]);
    expect((result.rows.procurement ?? []).map((r) => r.supplierName)).toEqual(["Kestrel Freight"]);
  });

  it("drops a supplier-table line carrying only identifiers", () => {
    const result = parserExtractionsToWorkbook([
      supplierTable("Pack.xlsx › Procurement", [
        { supplier_name: "Kestrel Freight", claimed_spend_ex_vat: 1000 },
        { registration_number: "2001/000003/07" },
      ]),
    ]);
    expect(result.rows.procurement).toHaveLength(1);
  });
});

describe("a group certificate joins the supplier it certifies", () => {
  const schedule = supplierTable("Pack.xlsx › Procurement", [{
    supplier_name: "Plover Insurance",
    claimed_spend_ex_vat: 2000,
    bee_level: "Level 1",
    supplier_black_ownership_percentage: "49.5%",
    certificate_expiry_date: "2026-03-31",
  }]);
  const certificate = (level: string): ParserExtraction => ({
    documentId: "esd__valid_b_bbee_verification_certificate",
    sourceFile: "plover-certificate.pdf",
    element: "ESD",
    values: [
      { field: "supplier_name", value: "Plover Insurance Group Limited" },
      { field: "registration_number", value: "2010/000099/06" },
      { field: "bee_level", value: level },
      { field: "supplier_black_ownership_percentage", value: "49.5%" },
      { field: "certificate_expiry_date", value: "2026-03-31" },
      { field: "empowering_supplier", value: true },
    ],
  });

  it("links a certificate issued to the group when everything it certifies matches", () => {
    const result = parserExtractionsToWorkbook([schedule, certificate("Level 1")]);
    const rows = result.rows.procurement ?? [];
    expect(rows).toHaveLength(1);
    expect(rows[0].supplierName).toBe("Plover Insurance");
    expect(rows[0].empoweringSupplier).toBe(true);
    expect(rows[0]._sourceFiles).toContain("plover-certificate.pdf");
    expect(result.reconciliation.some((f) => /Plover Insurance Group Limited/.test(f.message))).toBe(true);
  });

  it("leaves it apart when the certificate says something else", () => {
    const result = parserExtractionsToWorkbook([schedule, certificate("Level 4")]);
    expect(result.rows.procurement).toHaveLength(2);
  });
});

describe("one person, one row", () => {
  it("reads 'Surname, Name' the way the register writes it", () => {
    const result = parserExtractionsToWorkbook([
      employeeTable("Pack.xlsx › Employment Equity", [
        { employee_name: "Mokoena, Thabo Peter", race: "African", gender: "Male", occupational_level: "Semi-Skilled" },
        { employee_name: "Dlamini, Zanele", race: "African", gender: "Female", occupational_level: "Unskilled" },
      ]),
      employeeTable("Pack.xlsx › Management Control", [
        { employee_name: "Ruth Anne, Pillay", race: "Indian", gender: "Female", occupational_level: "Top Management" },
      ]),
    ]);
    const people = (result.rows["management-control"] ?? []).map((r) => `${r.name} | ${r.surname}`);
    expect(people).toEqual(["Thabo Peter | Mokoena", "Zanele | Dlamini", "Ruth Anne | Pillay"]);
  });

  it("takes a declaration signed by initials to be the one person they fit", () => {
    const result = parserExtractionsToWorkbook([
      employeeTable("Pack.xlsx › Management Control", [
        { employee_name: "Ruth Anne, Pillay", race: "Indian", gender: "Female", occupational_level: "Top Management" },
        { employee_name: "Sipho Pillay", race: "African", gender: "Male", occupational_level: "Unskilled" },
      ]),
      {
        documentId: "management_control__eea1",
        sourceFile: "declaration.pdf",
        element: "MANAGEMENT_CONTROL",
        values: [
          { field: "employee_name", value: "R.A. PILLAY" },
          { field: "race", value: "Indian" },
          { field: "gender", value: "Female" },
          { field: "is_foreign", value: true },
        ],
      },
    ]);
    const people = result.rows["management-control"] ?? [];
    expect(people).toHaveLength(2);
    const owner = people.find((r) => r.name === "Ruth Anne")!;
    expect(owner._sourceFiles).toContain("declaration.pdf");
    // A weaker identification corroborates who the person is; it does not
    // bring new facts about them onto the row.
    expect(owner.isForeign).toBeUndefined();
    expect(result.reconciliation.some((f) => /R\.A\. PILLAY/.test(f.message))).toBe(true);
  });

  it("leaves initials apart when they fit nobody, or more than one person", () => {
    const result = parserExtractionsToWorkbook([
      employeeTable("Pack.xlsx › Management Control", [
        { employee_name: "Ruth Anne Pillay", occupational_level: "Top Management" },
        { employee_name: "Rajen Arjun Pillay", occupational_level: "Senior Management" },
      ]),
      {
        documentId: "management_control__eea1",
        sourceFile: "declaration.pdf",
        element: "MANAGEMENT_CONTROL",
        values: [{ field: "employee_name", value: "R.A. Pillay" }],
      },
    ]);
    expect(result.rows["management-control"]).toHaveLength(3);
  });

  it("puts one person named by two documents at two levels on one row, at the level more documents state", () => {
    const register = (file: string) => employeeTable(file, [
      { employee_name: "Banda, Joseph", race: "African", gender: "Male", occupational_level: "Middle Management" },
    ]);
    const result = parserExtractionsToWorkbook([
      register("Current.xlsx › Employment Equity"),
      register("Spend.xlsm › Employment Equity"),
      // The prior year's sheet repeats him (a drag-filled template) at a higher level.
      employeeTable("Prior.xlsm › Management Control", [
        { employee_name: "Joseph Banda", race: "African", gender: "Male", occupational_level: "Top Management" },
        { employee_name: "Joseph Banda", race: "African", gender: "Male", occupational_level: "Top Management" },
      ]),
    ]);
    const people = result.rows["management-control"] ?? [];
    expect(people).toHaveLength(1);
    expect(people[0].occupationalLevel).toBe("Middle Management");
    expect(result.reconciliation.some((f) => f.section === "management-control" && /Top Management/.test(f.message))).toBe(true);
  });

  it("keeps the level more documents state even when it is the higher one, and records both for the user", () => {
    // Merge of two rules: the level more documents state is kept (one person,
    // one row) and every stated disagreement is recorded as a conflict the user
    // answers. Settling the band afterwards must not fall back to "the lower".
    const register = (file: string) => employeeTable(file, [
      { employee_name: "Mokoena, Lerato", race: "African", gender: "Female", occupational_level: "Senior Management" },
    ]);
    const result = parserExtractionsToWorkbook([
      register("Current.xlsx › Employment Equity"),
      register("Spend.xlsm › Employment Equity"),
      employeeTable("Prior.xlsm › Employment Equity", [
        { employee_name: "Lerato Mokoena", race: "African", gender: "Female", occupational_level: "Middle Management" },
      ]),
    ]);
    const people = result.rows["management-control"] ?? [];
    expect(people).toHaveLength(1);
    expect(people[0].occupationalLevel).toBe("Senior Management");
    const conflict = (people[0]._conflicts as Record<string, Array<{ value: unknown; sources: string[] }>> | undefined)?.occupationalLevel ?? [];
    expect(conflict.map((c) => [c.value, c.sources.length]).sort()).toEqual([["Middle Management", 1], ["Senior Management", 2]]);
  });

  it("folds an ID document read on its own into the person with that ID", () => {
    const result = parserExtractionsToWorkbook([
      employeeTable("Pack.xlsx › Employment Equity", [
        { employee_name: "Dlamini, Zanele", id_number: "9001010001081", race: "African", gender: "Female", occupational_level: "Senior Management" },
      ]),
      {
        documentId: "management_control__sa_id_document",
        sourceFile: "Spend.xlsm › Employment Equity",
        element: "MANAGEMENT_CONTROL",
        values: [
          { field: "id_number", value: "9001010001081" },
          { field: "race", value: "Indian" },
        ],
      },
    ]);
    const people = result.rows["management-control"] ?? [];
    expect(people).toHaveLength(1);
    expect(people[0].race).toBe("African");
    expect(people[0]._sourceFiles).toContain("Spend.xlsm › Employment Equity");
    expect(result.reconciliation.some((f) => f.column === "race" && /9001010001081/.test(f.message))).toBe(true);
  });

  it("reads a register line repeated down the sheet as one person", () => {
    const owner = { employee_name: "Ruth Anne, Pillay", occupational_level: "Executive Management", race: "Indian", gender: "Female" };
    const result = parserExtractionsToWorkbook([
      employeeTable("Pack.xlsx › Management Control", [owner]),
      // A drag-filled template: the first line carries the ID, the rest repeat without it.
      employeeTable("Spend.xlsm › Management Control", [
        { ...owner, id_number: "7001010001081" },
        ...Array.from({ length: 20 }, () => ({ ...owner })),
      ]),
    ]);
    expect(result.rows["management-control"]).toHaveLength(1);
    expect(result.rows["management-control"]![0].idNumber).toBe("7001010001081");
  });

  it("keeps two people who share a name on one register apart", () => {
    const result = parserExtractionsToWorkbook([
      employeeTable("Pack.xlsx › Employment Equity", [
        { employee_name: "Dlamini, Sipho", id_number: "8001010001081", occupational_level: "Unskilled" },
        { employee_name: "Dlamini, Sipho", id_number: "8505050001082", occupational_level: "Unskilled" },
      ]),
    ]);
    expect(result.rows["management-control"]).toHaveLength(2);
  });

  it("never makes an employee a shareholder from an ID document read on their sheet", () => {
    const result = parserExtractionsToWorkbook([
      employeeTable("Pack.xlsx › Employment Equity", [
        { employee_name: "Dlamini, Zanele", id_number: "9001010001081", race: "African", gender: "Female", occupational_level: "Unskilled" },
      ]),
      {
        documentId: "ownership__id_document_age_confirmation",
        sourceFile: "Pack.xlsx › Employment Equity",
        element: "OWNERSHIP",
        values: [{ field: "id_number", value: "9001010001081" }, { field: "gender", value: "Female" }],
      },
    ]);
    expect(result.rows.ownership ?? []).toHaveLength(0);
  });

  it("on a one-to-one disagreement keeps the lower level", () => {
    const result = parserExtractionsToWorkbook([
      employeeTable("Prior.xlsm › Management Control", [{ employee_name: "Joseph Banda", occupational_level: "Top Management" }]),
      employeeTable("Current.xlsx › Employment Equity", [{ employee_name: "Banda, Joseph", occupational_level: "Senior Management" }]),
    ]);
    const people = result.rows["management-control"] ?? [];
    expect(people).toHaveLength(1);
    expect(people[0].occupationalLevel).toBe("Senior Management");
  });
});
