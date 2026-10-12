/**
 * A workbook's sheets are one upload: "Book.xlsx › Fills" and "Book.xlsx ›
 * Vehicles" counted as two documents made six uploads read "8 documents".
 */
import { describe, expect, it } from "vitest";
import { esgCaseUploadNames, esgUploadOf } from "../esgCaseUploads";
import type { EsgParserCaseLike } from "../esgParserInjection";

describe("esgCaseUploads", () => {
  it("folds a workbook's sheets into the workbook", () => {
    expect(esgUploadOf("Book.xlsx › Fills")).toBe("Book.xlsx");
    expect(esgUploadOf("Bill.pdf")).toBe("Bill.pdf");
    expect(esgUploadOf("")).toBe("");
  });

  it("counts each upload once, however many sheets it was read as", () => {
    const parserCase: EsgParserCaseLike = {
      documents: [{ file_name: "Book.xlsx" }, { file_name: "Bill.pdf" }, { file_name: "Scan.png" }],
      unreadable_files: [{ file_name: "Scan.png" }],
      ai_entities: {
        extractions: [
          { sourceFile: "Book.xlsx › Fills", values: [] },
          { sourceFile: "Book.xlsx › Vehicles", values: [] },
          { sourceFile: "Bill.pdf", values: [] },
        ],
      },
    } as unknown as EsgParserCaseLike;
    expect(esgCaseUploadNames(parserCase).sort()).toEqual(["Bill.pdf", "Book.xlsx", "Scan.png"]);
  });
});
