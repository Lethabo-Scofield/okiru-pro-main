/**
 * Wave 3: what the parser's per-document skills now return, placed (or not).
 *
 * The skills read a document's people and payments as ROW tables and name
 * the measured entity's own registration numbers on ownership documents. Each
 * of these used to land somewhere wrong when placed by field name alone:
 * an ownership document's registration number opened a nameless supplier
 * row, CIPC members became employees, a payroll PDF doubled the employee
 * register. All values are invented.
 */
import { describe, expect, it } from "vitest";
import { parserExtractionsToWorkbook, REPORTED_ROW_TABLES, type ParserExtraction } from "../parserToWorkbook";
import { targetForField } from "../parserFieldBridge";

function extraction(over: Partial<ParserExtraction> & { values: ParserExtraction["values"] }): ParserExtraction {
  return { documentId: "doc", sourceFile: "evidence.pdf", ...over };
}

describe("registration and VAT numbers are a supplier's only on supplier evidence", () => {
  it("fill the procurement row on an ESD document", () => {
    expect(targetForField("registration_number", "ESD")).toEqual({ section: "procurement", column: "registrationNumber" });
    expect(targetForField("vat_number", "ESD")).toEqual({ section: "procurement", column: "vatNumber" });
  });

  it("open no supplier row on an ownership document", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "OWNERSHIP",
        sourceFile: "share certificate.pdf",
        values: [
          { field: "registration_number", value: "2015/123456/07" },
          { field: "vat_number", value: "4123456789" },
        ],
      }),
    ]);
    expect(result.rows.procurement ?? []).toHaveLength(0);
    expect(result.coverage.unmapped).toEqual(expect.arrayContaining(["registration_number", "vat_number"]));
  });
});

describe("an ESD-routed document that names no supplier opens no supplier row", () => {
  it("an AFS read under the ESD audited-financials spec keeps its own registration number out of procurement", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        documentId: "esd__audited_financial_statements_or_signed_management_accounts_w",
        element: "ESD",
        sourceFile: "financials.pdf",
        values: [{ field: "registration_number", value: "2015/123456/07" }],
      }),
    ]);
    expect(result.rows.procurement ?? []).toHaveLength(0);
    expect(result.coverage.unmapped).toContain("registration_number");
  });

  it("a supplier's certificate still carries its registration number", () => {
    const result = parserExtractionsToWorkbook([
      extraction({
        element: "ESD",
        values: [
          { field: "supplier_name", value: "Acme Trading (Pty) Ltd" },
          { field: "registration_number", value: "2015/123456/07" },
        ],
      }),
    ]);
    expect(result.rows.procurement).toHaveLength(1);
    expect(result.rows.procurement![0].registrationNumber).toBeTruthy();
  });
});
describe("a proof of payment's date is the transaction date", () => {
  it("lands on the SED and ESD grids' date column", () => {
    expect(targetForField("payment_date", "SED")).toEqual({ section: "sed", column: "dateOfTransaction" });
    expect(targetForField("payment_date", "ESD")).toEqual({ section: "esd", column: "dateOfTransaction" });
    expect(targetForField("payment_date")).toBeNull();
  });
});

describe("row tables that are evidence, not workbook rows", () => {
  it("CIPC members, beneficial owners, EMP201 returns, ledger entries and a letter's claims are reported, never placed", () => {
    const result = parserExtractionsToWorkbook([
      extraction({ element: "OWNERSHIP", values: [{ field: "director_rows", value: [{ full_name: "J Doe", id_number: "8001015009087" }] }] }),
      extraction({ element: "OWNERSHIP", values: [{ field: "beneficial_owner_rows", value: [{ beneficial_owner_name: "J Doe", id_number: "8001015009087" }] }] }),
      extraction({ element: "SKILLS_DEVELOPMENT", values: [{ field: "emp201_rows", value: [{ tax_period: "202403", sdl_amount: "100.00" }] }] }),
      extraction({ element: "ESD", values: [{ field: "ledger_entry_rows", value: [{ entry_date: "2024-04-01", entry_amount: "1 234.56" }] }] }),
      extraction({ element: "OWNERSHIP", values: [{ field: "stated_owner_rows", value: [{ stated_owner_name: "J Doe", id_number: "8001015009087" }] }] }),
    ]);
    expect(result.rows["management-control"] ?? []).toHaveLength(0);
    expect(result.rows.ownership ?? []).toHaveLength(0);
    expect(result.coverage.unmapped).toEqual(expect.arrayContaining([...REPORTED_ROW_TABLES]));
  });

  it("a proof of payment's payment rows are reported; an SED register still fills the grid", () => {
    // The proof-of-payment skill's rows evidence contributions the register
    // already lists: placed, each becomes an extra SED contribution (one dated
    // after year end, one the bank marked as not a proof of payment).
    const payments = [
      { beneficiary_name: "Acme Community Trust", payment_date: "04/03/2025", amount_paid: "R500.00", payment_reference: "ACME MAR", evidence_kind: "bank_statement", marked_not_proof_of_payment: null },
      { beneficiary_name: "Acme Community Trust", payment_date: "27/08/2024", amount_paid: "R500.00", payment_reference: "ACME AUG", evidence_kind: "bank_statement", marked_not_proof_of_payment: true },
    ];
    const fromPdf = parserExtractionsToWorkbook([
      extraction({ documentId: "sed__proof_of_payment_cash_grants_donations_or_monetary_contribut", element: "SED", sourceFile: "proof.pdf", values: [{ field: "beneficiary_rows", value: payments }] }),
    ]);
    expect(fromPdf.rows.sed ?? []).toHaveLength(0);
    expect(fromPdf.coverage.unmapped).toContain("beneficiary_rows");

    const register = [{ beneficiary_name: "Acme Community Trust", contribution_amount: "6 000.00", contribution_type: "Grant" }];
    const fromSheet = parserExtractionsToWorkbook([
      extraction({ documentId: "sheet_table__sed", element: "SED", values: [{ field: "beneficiary_rows", value: register }] }),
    ]);
    expect(fromSheet.rows.sed).toHaveLength(1);
  });

  it("a payroll's employees (names and pay only) are reported; an employee register still fills the grid", () => {
    const employees = [{ employee_name: "J Doe", salary: "12 500.00" }];
    const fromPdf = parserExtractionsToWorkbook([
      extraction({ documentId: "management_control__payroll_as_at_measurement_date", element: "MANAGEMENT_CONTROL", values: [{ field: "employee_rows", value: employees }] }),
    ]);
    expect(fromPdf.rows["management-control"] ?? []).toHaveLength(0);
    expect(fromPdf.coverage.unmapped).toContain("employee_rows");

    const register = [{ employee_name: "J Doe", race: "African", gender: "Female", occupational_level: "Junior Management" }];
    const fromSheet = parserExtractionsToWorkbook([
      extraction({ documentId: "sheet_table__management_control", element: "MANAGEMENT_CONTROL", values: [{ field: "employee_rows", value: register }] }),
    ]);
    expect(fromSheet.rows["management-control"]).toHaveLength(1);
  });
});
