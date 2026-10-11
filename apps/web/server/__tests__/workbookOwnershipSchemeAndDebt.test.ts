/**
 * A share register headed "Broad-based / ESOP? (Yes/No)" and "Acquisition
 * Debt (R)" states the scheme rows and each holder's acquisition debt. Both
 * were dropped on import: the scheme bonus never saw the scheme, and a stated
 * nil debt never earned Transport ownership fulfilment. (Invented holders.)
 */
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { normalizeExcelBuffer } from "../../src/lib/workbookExcelNormalizer";
import { projectWorkbookToClient, type WorkbookData } from "../workbookRoutes";
import { calculateOwnershipScore } from "../../Toolkit/src/lib/calculators/ownership";
// The held-back Codes lines (ownership fulfilment, scheme economic interest):
// the live Transport QSE config does not score them yet.
import { TRANSPORT_QSE_CODES_LINES_CALCULATOR_CONFIG as TRANSPORT_QSE_CALCULATOR_CONFIG } from "../../Toolkit/src/lib/sectors/transport-qse";

function register(): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Ownership"],
    ["Shareholder Name", "Race", "Gender", "Broad-based / ESOP? (Yes/No)", "Voting Rights (%)", "Economic Interest (%)", "Acquisition Debt (R)"],
    ["Sipho Ndlovu", "African", "Male", "No", 45, 45, 0],
    ["Staff Share Trust", "African", "Female", "Yes", 5, 5, 0],
    ["Harbour Capital", "White", "Male", "No", 50, 50, 0],
  ]), "Ownership");
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return out;
}

describe("share register: scheme flag and acquisition debt", () => {
  it("reach the projection and score fulfilment and the scheme bonus", () => {
    const imported = normalizeExcelBuffer(register());
    const rows = imported.sections.ownership?.rows ?? [];
    expect(rows).toHaveLength(3);
    const p = projectWorkbookToClient({
      companyId: "c1",
      sections: { ...imported.sections, "company-information": { rows: [], meta: { industrySector: "Transport", scorecardType: "QSE" } } },
    } as unknown as WorkbookData);
    const trust = p.shareholders.find((s) => /trust/i.test(String((s as { name?: string }).name)));
    expect((trust as { ownershipType?: string }).ownershipType).toMatch(/ESOP/);
    expect(p.shareholders.every((s) => (s as { outstandingDebt?: number }).outstandingDebt === 0)).toBe(true);
    const own = calculateOwnershipScore(
      { id: "", clientId: "", shareholders: p.shareholders as never, companyValue: 1e8, outstandingDebt: 0, yearsHeld: 5 },
      TRANSPORT_QSE_CALCULATOR_CONFIG,
    );
    expect(own.ownershipFulfilment).toBe(1);
    // 5% black economic interest through the trust, against 10%: half the point.
    expect(own.subLines.find((l) => /ESOP/.test(l.name))?.score).toBe(0.5);
  });
});
