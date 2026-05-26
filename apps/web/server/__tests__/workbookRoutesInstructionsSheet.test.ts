/**
 * Regression — Instructions sheet (Task #4) and SED/ESD guidance coverage.
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildInstructionsSheet, buildXlsx } from "../workbookRoutes";
import type { WorkbookData } from "../workbookRoutes";
import {
  SED_CONTRIBUTION_GUIDANCE,
  ESD_CONTRIBUTION_GUIDANCE,
  SECTIONS,
} from "../../src/components/workbook/sections";

function sheetText(ws: XLSX.WorkSheet): string {
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];
  return aoa.map((row) => row.map((c) => String(c ?? "")).join("\t")).join("\n");
}

function emptyWorkbook(): WorkbookData {
  const sections: Record<string, { rows: any[]; meta?: Record<string, unknown> }> = {};
  for (const s of SECTIONS) sections[s.key] = { rows: [] };
  sections["company-information"] = { rows: [], meta: { companyName: "Test Co" } };
  return {
    companyId: "TEST",
    ownerOrganizationId: null,
    ownerUserId: "u1",
    sections,
    submittedAt: null,
    submittedByUserId: null,
    updatedAt: new Date().toISOString(),
  } as WorkbookData;
}

describe("buildInstructionsSheet — general guidance", () => {
  const ws = buildInstructionsSheet();
  const text = sheetText(ws);

  it("documents the date format", () => {
    expect(text).toMatch(/YYYY-MM-DD/);
    expect(text).toMatch(/dd\/mm\/yyyy/);
  });

  it("documents the tolerated amount conventions (R prefix, thousands, NBSP)", () => {
    expect(text).toMatch(/Numbers in Rand/i);
    expect(text).toMatch(/thousands separator/i);
    expect(text).toMatch(/leading 'R'/);
  });

  it("auto-generates the per-sheet column reference from SECTIONS", () => {
    // Pick three columns spanning select / date / number types and assert
    // their label + type + accepted-values row landed in the sheet.
    const procurement = SECTIONS.find((s) => s.key === "procurement")!;
    const sizeCol = procurement.columns!.find((c) => c.key === "currentSize")!;
    const certCol = procurement.columns!.find((c) => c.key === "certificateExpiryDate")!;
    const spendCol = procurement.columns!.find((c) => c.key === "spend")!;

    expect(text).toContain(sizeCol.label);
    expect(text).toContain(sizeCol.options!.join(" / "));

    expect(text).toContain(certCol.label);
    expect(text).toMatch(/YYYY-MM-DD/);

    expect(text).toContain(spendCol.label);
    expect(text).toMatch(/Rand amount/);
  });

  it("emits a header row with the Required column, and marks required columns Yes / optional columns blank", () => {
    // Spot-check the per-sheet table contract (Task #18 area 7 — instructions
    // sheet must surface the required flag, type, and accepted-values cells).
    // The header row is "<Sheet label> | Required | Type | Accepted values / format".
    expect(text).toMatch(/Required\tType\tAccepted values \/ format/);

    // currentSize is required: true in sections.ts.
    const procurement = SECTIONS.find((s) => s.key === "procurement")!;
    const sizeCol = procurement.columns!.find((c) => c.key === "currentSize")!;
    expect(sizeCol.required).toBe(true);
    // The row for currentSize must contain "Yes" in the Required cell.
    const sizeRow = text.split("\n").find((line) => line.startsWith(sizeCol.label + "\t"));
    expect(sizeRow, "row for Current Size").toBeTruthy();
    expect(sizeRow!.split("\t")[1]).toBe("Yes");

    // certificateExpiryDate is optional: row's Required cell must NOT be "Yes".
    const certCol = procurement.columns!.find((c) => c.key === "certificateExpiryDate")!;
    expect(certCol.required ?? false).toBe(false);
    const certRow = text.split("\n").find((line) => line.startsWith(certCol.label + "\t"));
    expect(certRow, "row for Certificate Expiry Date").toBeTruthy();
    expect(certRow!.split("\t")[1]).not.toBe("Yes");
  });
});

describe("Guidance maps cover every dropdown value", () => {
  it("SED_CONTRIBUTION_GUIDANCE keys ⊇ SED contributionType options", () => {
    const sed = SECTIONS.find((s) => s.key === "sed")!;
    const opts = sed.columns!.find((c) => c.key === "contributionType")!.options!;
    for (const opt of opts) {
      expect(SED_CONTRIBUTION_GUIDANCE[opt], `SED guidance for "${opt}"`).toBeTruthy();
    }
  });

  it("ESD_CONTRIBUTION_GUIDANCE keys ⊇ ESD contributionType options", () => {
    const esd = SECTIONS.find((s) => s.key === "esd")!;
    const opts = esd.columns!.find((c) => c.key === "contributionType")!.options!;
    for (const opt of opts) {
      expect(ESD_CONTRIBUTION_GUIDANCE[opt], `ESD guidance for "${opt}"`).toBeTruthy();
    }
  });
});

describe("buildXlsx — Instructions is the first sheet", () => {
  it("places Instructions before Information Request and data sheets", () => {
    const buf = buildXlsx(emptyWorkbook());
    const wb = XLSX.read(buf, { type: "buffer" });
    expect(wb.SheetNames[0]).toBe("Instructions");
    expect(wb.SheetNames).toContain("Information Request");
  });
});
