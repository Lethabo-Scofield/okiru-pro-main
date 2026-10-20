/**
 * ICT QSE scores a SED contribution only when it is marked an ICT-specific
 * initiative (sed.requireIctSpecificInitiative, the Empower toolkit's
 * SED Data[Recognised Amount] = IF([ICT Specific Initiative?]="Yes", …, 0)).
 * That makes the answer load-bearing on every path a contribution enters by,
 * so each path is run here to the score: the Excel import and the workbook
 * projection, a row typed into the workbook grid, and the Toolkit's bulk
 * upload. The parity gate cannot see these: its adapter writes the flag
 * straight from the case. Synthetic data only.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { mapExtractedToWorkbookSections, type ExtractedCompanyData } from "../excelImport";
import { projectWorkbookToClient } from "../../../server/workbookRoutes";
import { calculateSedScore } from "@toolkit/lib/calculators/esd-sed";
import { ICT_QSE_CALCULATOR_CONFIG as ICT_QSE } from "@toolkit/lib/sectors/ict-qse";
import { RCOGP_QSE_CALCULATOR_CONFIG as RCOGP_QSE } from "@toolkit/lib/sectors/rcogp-qse";
import { BULK_IMPORT_SPECS } from "@toolkit/components/bulk/bulkImportSpecs";
import type { Contribution, SEDData } from "@toolkit/lib/types";

const NPAT = 1_000_000; // ICT QSE SED target: 1% of NPAT = R10,000 for 12 points
const DATA: ExtractedCompanyData = {
  companyName: "Synthetic Fibre Works (Pty) Ltd",
  sector: "ICT",
  scorecardType: "QSE",
  revenue: 30_000_000,
  npat: NPAT,
} as ExtractedCompanyData;

const HEADER = [
  "Beneficiary Name *",
  "Description of Spend *",
  "ICT Specific Initiative?",
  "Date of Transaction (format: dd/mm/yyyy)",
  "Contribution Type *",
  "% of Spend Benefiting Black Individuals *",
  "Amount *",
];

function workbookWith(header: string[], rows: unknown[][]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["Socioeconomic Development"], header, ...rows]);
  XLSX.utils.book_append_sheet(wb, ws, "Socioeconomic Development");
  return wb;
}

function project(sections: ReturnType<typeof mapExtractedToWorkbookSections>) {
  return projectWorkbookToClient({
    companyId: "ict-qse-sed-paths",
    ownerOrganizationId: null,
    ownerUserId: "test",
    sections,
    updatedAt: new Date().toISOString(),
  } as never);
}

const score = (contributions: unknown[], cfg = ICT_QSE) =>
  calculateSedScore({ id: "", clientId: "", contributions } as unknown as SEDData, NPAT, cfg);

describe("ICT QSE SED: the ICT-specific answer survives every entry path to the score", () => {
  it("Excel import → workbook → projection keeps Yes, No and no answer apart", () => {
    const wb = workbookWith(HEADER, [
      ["Township Coding Club", "Coding classes", "Yes", "15/05/2025", "Grant Contribution", 100, 5_000],
      ["Rural Clinic Fund", "Clinic roof", "No", "15/05/2025", "Grant Contribution", 100, 3_000],
      ["Library Trust", "Books", "", "15/05/2025", "Grant Contribution", 100, 2_000],
    ]);
    const sections = mapExtractedToWorkbookSections(DATA, wb);
    const rows = (sections.sed?.rows ?? []) as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    expect(rows[0].ictSpecificInitiative).toBe(true);
    expect(rows[1].ictSpecificInitiative).toBe(false);
    // Blank stays unanswered: the workbook grid shows an empty cell, not a "No".
    expect("ictSpecificInitiative" in rows[2]).toBe(false);

    const projected = project(sections);
    const contributions = projected.sedContributions as Array<Contribution>;
    expect(contributions.map((c) => c.ictSpecificInitiative)).toEqual([true, false, undefined]);

    // Only the Yes counts: R5,000 ÷ R10,000 × 12 = 6. Before the import read
    // the column it wrote "No" on every row, and this scored 0.
    const r = score(contributions);
    expect(r.total).toBeCloseTo(6, 6);
    expect(r.notIctSpecific).toEqual({ spend: 5_000, count: 2 });
    expect(r.subLines[0].note).toContain("R5.0k across 2 contributions not counted: not marked as an ICT-specific initiative");
  });

  it("a sheet without the column leaves every row unanswered, scored 0 and reported", () => {
    const header = HEADER.filter((h) => h !== "ICT Specific Initiative?");
    const wb = workbookWith(header, [
      ["Township Coding Club", "Coding classes", "15/05/2025", "Grant Contribution", 100, 5_000],
    ]);
    const sections = mapExtractedToWorkbookSections(DATA, wb);
    const row = (sections.sed?.rows ?? [])[0] as Record<string, unknown>;
    expect("ictSpecificInitiative" in row).toBe(false);
    const contributions = project(sections).sedContributions;
    const r = score(contributions);
    expect(r.total).toBe(0);
    expect(r.notIctSpecific).toEqual({ spend: 5_000, count: 1 });
    // A sector that does not ask the question still counts the row in full.
    expect(score(contributions, RCOGP_QSE).total).toBeGreaterThan(0);
  });

  it("an SED total with no detail rows becomes an unanswered row, never a fabricated No", () => {
    const sections = mapExtractedToWorkbookSections({ ...DATA, sedContributions: 4_000 } as ExtractedCompanyData);
    const row = (sections.sed?.rows ?? [])[0] as Record<string, unknown>;
    expect(Number(row.amount)).toBe(4_000);
    expect("ictSpecificInitiative" in row).toBe(false);
  });

  it("a workbook grid row: Yes counts; a blank cell is projected as unanswered, not No", () => {
    const sections = {
      sed: {
        rows: [
          { _id: "a", beneficiaryName: "Township Coding Club", descriptionOfSpend: "Coding classes",
            ictSpecificInitiative: true, contributionType: "Grant Contribution", percentBenefitingBlack: 100, amount: 5_000 },
          // What SpreadsheetGrid stores for a Yes/No cell the user never set.
          { _id: "b", beneficiaryName: "Library Trust", descriptionOfSpend: "Books",
            ictSpecificInitiative: "", contributionType: "Grant Contribution", percentBenefitingBlack: 100, amount: 2_000 },
        ],
      },
    };
    const contributions = project(sections as never).sedContributions as Array<Contribution>;
    expect(contributions.map((c) => c.ictSpecificInitiative)).toEqual([true, undefined]);
    expect(score(contributions).total).toBeCloseTo(6, 6);
  });

  it("the Toolkit bulk upload keeps the answer the sheet gives", () => {
    const spec = BULK_IMPORT_SPECS.sed;
    const yes = spec.toEntity({ beneficiaryName: "Township Coding Club", contributionType: "grant", amount: 5_000, ictSpecificInitiative: true });
    const no = spec.toEntity({ beneficiaryName: "Rural Clinic Fund", contributionType: "grant", amount: 3_000, ictSpecificInitiative: "No" });
    const blank = spec.toEntity({ beneficiaryName: "Library Trust", contributionType: "grant", amount: 2_000, ictSpecificInitiative: "" });
    expect(yes.ictSpecificInitiative).toBe(true);
    expect(no.ictSpecificInitiative).toBe(false);
    expect("ictSpecificInitiative" in blank).toBe(false);
    expect(score([yes, no, blank]).total).toBeCloseTo(6, 6);
  });
});
