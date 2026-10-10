/**
 * A workbook is one document in the review, however many sheets it was read as.
 *
 * The parser reads a workbook sheet by sheet and reports each sheet as a
 * document of its own, typed by a classifier that only knows evidence types.
 * A live read of a 17-file pack listed about 41 review rows: each sheet of the
 * three gathering workbooks, as "a payroll schedule for directors" (Finance),
 * "a sworn affidavit" (Ownership), "a SARS VAT import declaration"
 * (Procurement), with not-found lists for fields those types would carry, and
 * the template's empty sheets as documents "we couldn't tell what kind of
 * document this is". All invented here.
 */
import { describe, expect, it } from "vitest";
import { applyReviewEdit, buildDocumentReview, reviewCounts, reviewListsFile } from "../documentReview";
import { parserExtractionsToWorkbook, toWorkbookSections } from "../parserToWorkbook";
import type { ParserCaseLike } from "../parserWorkbookMap";

const BOOK = "Acme Gathering.xlsx";
const sheet = (name: string) => `${BOOK} › ${name}`;

const extractions = [
  {
    documentId: "sheet_instructions",
    sourceFile: sheet("Instructions"),
    values: [
      { field: "measured_entity_name", value: "Acme Trading" },
      { field: "industry_sector", value: "Transport" },
    ],
  },
  {
    documentId: "sheet_financials",
    sourceFile: sheet("Finance"),
    values: [{ field: "current_year_revenue", value: 12000000 }],
  },
  {
    documentId: "sheet_table__esd",
    sourceFile: sheet("Procurement"),
    element: "ESD",
    values: [{
      field: "supplier_rows",
      value: [
        { supplier_name: "Kestrel Freight", claimed_spend_ex_vat: 1000 },
        { supplier_name: "Ibis Tyres", claimed_spend_ex_vat: 500 },
      ],
    }],
  },
  {
    documentId: "esd__certificate",
    sourceFile: "kestrel-certificate.pdf",
    element: "ESD",
    values: [{ field: "supplier_name", value: "Kestrel Freight" }, { field: "bee_level", value: "Level 2" }],
  },
];

const detected = (filename: string, documentType: string, status: string, missing: string[] = [], errors: string[] = []) => ({
  filename,
  document_type: documentType,
  status,
  validation: { errors, warnings: [], missing_fields: missing },
});

const CASE = {
  documents_detected: [
    detected(sheet("Instructions"), "Company profile", "review_required", ["trading_name"]),
    detected(sheet("Finance"), "Payroll / remuneration schedules for directors", "review_required", ["headcount_by_race", "mean_tcc_by_race"], ["Top document-type candidates are too close (A vs B)"]),
    detected(sheet("Procurement"), "SARS VAT declaration for imported goods", "review_required", ["total_imports_declared"]),
    detected(sheet("Imports"), "B-BBEE certificate or affidavit for each ESD beneficiary", "failed", [], ["Best document-type confidence is below review threshold"]),
    detected("kestrel-certificate.pdf", "B-BBEE Certificate", "passed"),
  ],
  fields_extracted: {},
  ai_entities: { extractions },
} as unknown as ParserCaseLike;

const injected = parserExtractionsToWorkbook(extractions);
const docs = buildDocumentReview({ parserCase: CASE, sections: toWorkbookSections(injected), rejected: injected.rejected });

describe("buildDocumentReview — one row per uploaded workbook", () => {
  it("lists the upload once, not once per sheet", () => {
    expect(docs.map((d) => d.filename).sort()).toEqual([BOOK, "kestrel-certificate.pdf"]);
    expect(reviewCounts(docs)).toEqual({ read: 2, "needs-look": 0, "not-read": 0 });
  });

  it("names a gathering workbook as one, never by a sheet's evidence-type guess", () => {
    const book = docs.find((d) => d.filename === BOOK)!;
    expect(book.documentType).toMatch(/information-gathering workbook/i);
    expect(book.documentType).not.toMatch(/VAT|payroll|affidavit/i);
    expect(book.summary).toMatch(/2 suppliers/);
  });

  it("shows each sheet, and a template's empty sheet as empty — not as a document we could not read", () => {
    const book = docs.find((d) => d.filename === BOOK)!;
    expect(book.sheets?.map((s) => s.sheet)).toEqual(["Instructions", "Finance", "Procurement", "Imports"]);
    expect(book.sheets?.find((s) => s.sheet === "Imports")?.state).toBe("not-read");
    expect(book.problems).toEqual([]);
  });

  it("drops the not-found lists that belong to the evidence types the classifier guessed", () => {
    const book = docs.find((d) => d.filename === BOOK)!;
    expect(book.notFound).toEqual([]);
    expect(book.missing ?? []).toEqual([]);
  });

  it("keeps each value correctable on the sheet it came from", () => {
    const book = docs.find((d) => d.filename === BOOK)!;
    const revenue = book.values.find((v) => /revenue/i.test(v.label))!;
    expect(revenue.sheet).toBe("Finance");
    expect(revenue.file).toBe(sheet("Finance"));
    const edited = applyReviewEdit(CASE, revenue.file!, revenue.edit!, "12500000");
    const finance = (edited as { ai_entities: { extractions: typeof extractions } }).ai_entities.extractions[1];
    expect(finance.values[0].value).toBe(12500000);
  });

  it("still counts a sheet's disagreement as the workbook's, not as one between documents", () => {
    const flagged = buildDocumentReview({
      parserCase: CASE,
      sections: toWorkbookSections(injected),
      flags: [{ sourceFile: sheet("Procurement"), note: "The schedule's total is not the sum of its lines." }],
    });
    const book = flagged.find((d) => d.filename === BOOK)!;
    expect(book.problems.map((p) => p.detail)).toEqual([expect.stringMatching(/^Procurement: The schedule's total/)]);
    expect(reviewListsFile(flagged, sheet("Procurement"))).toBe(true);
    expect(reviewListsFile(flagged, "another.pdf")).toBe(false);
  });

  it("calls a workbook not read only when none of its sheets gave anything", () => {
    const empty = {
      documents_detected: [
        detected("Blank.xlsx › Sheet1", "Unknown", "failed", [], ["Best document-type confidence is below review threshold"]),
        detected("Blank.xlsx › Sheet2", "Unknown", "failed", [], ["Best document-type confidence is below review threshold"]),
      ],
      fields_extracted: {},
    } as unknown as ParserCaseLike;
    const [book] = buildDocumentReview({ parserCase: empty });
    expect(book.filename).toBe("Blank.xlsx");
    expect(book.state).toBe("not-read");
    expect(book.problems).toHaveLength(1);
  });
});
