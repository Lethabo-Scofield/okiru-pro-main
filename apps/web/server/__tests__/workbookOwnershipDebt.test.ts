/**
 * The register's stated outstanding acquisition debt reaches the ownership
 * calculator, and an unstated one stays unstated. Ownership fulfilment
 * (Transport QSE, 1 point) turns on the difference. (Invented holder.)
 */
import { describe, expect, it } from "vitest";
import type { WorkbookData } from "../workbookRoutes";
import { projectWorkbookToClient } from "../workbookRoutes";
import { parserExtractionsToWorkbook, toWorkbookSections } from "../../src/lib/parserToWorkbook";
import { calculateOwnershipScore } from "../../Toolkit/src/lib/calculators/ownership";
// The held-back Codes line (ownership fulfilment): the live Transport QSE
// config does not score it yet.
import { TRANSPORT_QSE_CODES_LINES_CALCULATOR_CONFIG as TRANSPORT_QSE_CALCULATOR_CONFIG } from "../../Toolkit/src/lib/sectors/transport-qse";

function project(debtCell: unknown): ReturnType<typeof projectWorkbookToClient> {
  const read = parserExtractionsToWorkbook([{
    documentId: "sheet_table__ownership",
    sourceFile: "Gathering.xlsx › Ownership",
    element: "OWNERSHIP",
    values: [{
      field: "shareholder_rows",
      value: [{
        shareholder_name: "Sipho Ndlovu", race: "African", gender: "Male", voting_rights: 1,
        ...(debtCell === undefined ? {} : { black_participant_outstanding_debt: debtCell }),
      }],
    }],
  }], { sectorCode: "TRANSPORT", scorecardType: "QSE" });
  const sections = toWorkbookSections(read) as Record<string, unknown>;
  return projectWorkbookToClient({
    companyId: "c1",
    sections: { ...sections, "company-information": { meta: { industrySector: "Transport", scorecardType: "QSE" } } },
  } as unknown as WorkbookData);
}

describe("stated acquisition debt", () => {
  it("a stated nil debt reaches the shareholder and earns ownership fulfilment", () => {
    const p = project(0);
    expect((p.shareholders[0] as { outstandingDebt?: number }).outstandingDebt).toBe(0);
    const own = calculateOwnershipScore({ id: "", clientId: "", shareholders: p.shareholders as never, companyValue: 0, outstandingDebt: p.ownershipMeta.outstandingDebt, yearsHeld: 0 }, TRANSPORT_QSE_CALCULATOR_CONFIG);
    expect(own.ownershipFulfilment).toBe(1);
  });

  it("no debt column at all is NOT a stated nil", () => {
    const p = project(undefined);
    expect("outstandingDebt" in (p.shareholders[0] as object)).toBe(false);
  });

  it("a stated debt feeds net value as the entity's acquisition debt", () => {
    const p = project("R 250,000");
    expect((p.shareholders[0] as { outstandingDebt?: number }).outstandingDebt).toBe(250000);
    expect(p.ownershipMeta.outstandingDebt).toBe(250000);
  });
});
