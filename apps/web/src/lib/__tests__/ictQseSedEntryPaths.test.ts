/**
 * ICT QSE scores a SED contribution only when it is marked an ICT-specific
 * initiative (sed.sectorSpecificInitiatives 'require_yes', the Empower toolkit's
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
import { ICT_GENERIC_CALCULATOR_CONFIG as ICT_GENERIC } from "@toolkit/lib/sectors/ict-generic";
import { AGRI_GENERIC_CALCULATOR_CONFIG as AGRI_GENERIC } from "@toolkit/lib/sectors/agri-generic";
import { RCOGP_QSE_CALCULATOR_CONFIG as RCOGP_QSE } from "@toolkit/lib/sectors/rcogp-qse";
import { BULK_IMPORT_SPECS, type ParsedRow } from "@toolkit/components/bulk/bulkImportSpecs";
import { readSectionSheet } from "../workbookExcelNormalizer";
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
    // The workbook's "ICT-Specific?" column becomes the one answer the scorer reads.
    expect(contributions.map((c) => c.isSectorSpecificInitiative)).toEqual([true, false, undefined]);
    expect(contributions.some((c) => "ictSpecificInitiative" in c)).toBe(false);

    // Only the Yes counts: R5,000 ÷ R10,000 × 12 = 6. Before the import read
    // the column it wrote "No" on every row, and this scored 0.
    const r = score(contributions);
    expect(r.total).toBeCloseTo(6, 6);
    expect(r.notSectorSpecific).toEqual({ spend: 5_000, count: 2, rule: "require_yes" });
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
    expect(r.notSectorSpecific).toEqual({ spend: 5_000, count: 1, rule: "require_yes" });
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
      // The projection reads "ICT-Specific?" for an ICT client only.
      "company-information": { meta: { industrySector: "ICT", scorecardType: "QSE" } },
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
    expect(contributions.map((c) => c.isSectorSpecificInitiative)).toEqual([true, undefined]);
    expect(score(contributions).total).toBeCloseTo(6, 6);
  });

  it("the Toolkit bulk upload keeps the answer the sheet gives", () => {
    const spec = BULK_IMPORT_SPECS.sed;
    const ict = { sectorCode: "ICT" };
    const yes = spec.toEntity({ beneficiaryName: "Township Coding Club", contributionType: "grant", amount: 5_000, ictSpecificInitiative: true }, ict);
    const no = spec.toEntity({ beneficiaryName: "Rural Clinic Fund", contributionType: "grant", amount: 3_000, ictSpecificInitiative: "No" }, ict);
    const blank = spec.toEntity({ beneficiaryName: "Library Trust", contributionType: "grant", amount: 2_000, ictSpecificInitiative: "" }, ict);
    expect(yes.isSectorSpecificInitiative).toBe(true);
    expect(no.isSectorSpecificInitiative).toBe(false);
    expect("isSectorSpecificInitiative" in blank).toBe(false);
    expect(score([yes, no, blank]).total).toBeCloseTo(6, 6);
  });
});

/**
 * The bulk upload's half of the projection's ICT-only rule. The
 * information-request workbook carries the "ICT-Specific?" column for every
 * sector, and AgriBEE Generic drops a SED contribution answered No to its own
 * question (sed.sectorSpecificInitiatives 'exclude_no'). Taking an AgriBEE
 * client's "No" in the ICT column as that answer scored its SED 0, the defect
 * the Setsoto workbooks showed on the projection path.
 */
describe("the SED bulk upload reads 'ICT-Specific?' for an ICT client only", () => {
  const AGRI_NPAT = 1_000_000; // AgriBEE Generic SED target: 1.5% of NPAT = R15,000 for 15 points

  /**
   * Two grants answered No in the ICT column, read the way the bulk dialog
   * reads a file. The type is the scorer's own key ('grant'), as the bulk case
   * above writes it; the bulk upload does not translate the template's
   * dropdown wording ("Grant Contribution"), which is a separate gap.
   */
  function bulkRows(context: { sectorCode?: string } | undefined): Contribution[] {
    const spec = BULK_IMPORT_SPECS.sed;
    const wb = workbookWith(HEADER, [
      ["Farm School Trust", "School feeding", "No", "15/05/2025", "grant", 100, 50_000],
      ["Village Water Project", "Borehole", "No", "15/05/2025", "grant", 100, 30_000],
    ]);
    const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const read = readSectionSheet(buffer, spec.columns, { sectionKey: spec.sectionKey });
    const rows = (read.rows as ParsedRow[]).filter(
      (row) => !spec.requiredKeys.some((k) => String(row[k] ?? "").trim() === ""),
    );
    expect(rows).toHaveLength(2);
    // The sheet's answer is read either way; only the client decides whether it is one.
    expect(rows.every((row) => row.ictSpecificInitiative === false || row.ictSpecificInitiative === "No")).toBe(true);
    return rows.map((row) => spec.toEntity(row, context));
  }

  const agriScore = (contributions: Contribution[]) =>
    calculateSedScore({ id: "", clientId: "", contributions } as unknown as SEDData, AGRI_NPAT, AGRI_GENERIC);

  it("an AgriBEE client's 'No' in the ICT column leaves the answer unset, and the rows count", () => {
    const contributions = bulkRows({ sectorCode: "AGRI" });
    expect(contributions.every((c) => !("isSectorSpecificInitiative" in c))).toBe(true);
    const r = agriScore(contributions);
    // R80,000 against R15,000: the full 15 points. Before, 0 (R80,000 across 2 rows not counted).
    expect(r.total).toBeCloseTo(15, 6);
    expect(r.notSectorSpecific).toEqual({ spend: 0, count: 0, rule: "exclude_no" });
  });

  it("a client with no sector, or another sector, is not read as ICT", () => {
    expect(bulkRows(undefined).every((c) => !("isSectorSpecificInitiative" in c))).toBe(true);
    expect(bulkRows({ sectorCode: "RCOGP" }).every((c) => !("isSectorSpecificInitiative" in c))).toBe(true);
  });

  it("an ICT client's 'No' is its answer: ICT Generic does not count those rows", () => {
    const contributions = bulkRows({ sectorCode: " ict " });
    expect(contributions.map((c) => c.isSectorSpecificInitiative)).toEqual([false, false]);
    const r = calculateSedScore({ id: "", clientId: "", contributions } as unknown as SEDData, AGRI_NPAT, ICT_GENERIC);
    expect(r.total).toBe(0);
    expect(r.notSectorSpecific).toEqual({ spend: 80_000, count: 2, rule: "exclude_no" });
    // The same rows left unanswered count for ICT Generic too.
    const unanswered = contributions.map((c) => {
      const copy = { ...c };
      delete copy.isSectorSpecificInitiative;
      return copy;
    });
    const u = calculateSedScore({ id: "", clientId: "", contributions: unanswered } as unknown as SEDData, AGRI_NPAT, ICT_GENERIC);
    expect(u.total).toBeGreaterThan(0);
    expect(u.notSectorSpecific).toEqual({ spend: 0, count: 0, rule: "exclude_no" });
  });
});
