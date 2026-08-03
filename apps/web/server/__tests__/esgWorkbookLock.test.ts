import { describe, expect, it } from "vitest";
import {
  ESG_PREVIOUSLY_SUBMITTED_CELL,
  ESG_REOPENED_AT_CELL,
  ESG_REOPENED_BY_CELL,
  ESG_SUBMITTED_AT_CELL,
  applyEsgWorkbookReopen,
  applyEsgWorkbookSubmit,
  canReopenEsgWorkbook,
  type LockableWorkbook,
} from "../esgWorkbookLock";

function workbook(): LockableWorkbook {
  return { sections: { assumptions: { cells: { B6: "Standard" } } }, submittedAt: null };
}

describe("who may reopen", () => {
  it("allows admins and super admins only", () => {
    expect(canReopenEsgWorkbook("admin")).toBe(true);
    expect(canReopenEsgWorkbook("super_admin")).toBe(true);
    expect(canReopenEsgWorkbook("user")).toBe(false);
    expect(canReopenEsgWorkbook("contributor")).toBe(false);
    expect(canReopenEsgWorkbook(null)).toBe(false);
    expect(canReopenEsgWorkbook(undefined)).toBe(false);
  });
});

describe("submit locks the workbook", () => {
  it("sets submittedAt and mirrors it onto assumptions cells", () => {
    const wb = workbook();
    applyEsgWorkbookSubmit(wb, "2026-08-03T10:00:00.000Z");
    expect(wb.submittedAt).toBe("2026-08-03T10:00:00.000Z");
    expect(wb.sections.assumptions.cells[ESG_SUBMITTED_AT_CELL]).toBe("2026-08-03T10:00:00.000Z");
    expect(wb.sections.assumptions.cells.B6).toBe("Standard");
  });

  it("creates the assumptions section when absent", () => {
    const wb: LockableWorkbook = { sections: {}, submittedAt: null };
    applyEsgWorkbookSubmit(wb, "2026-08-03T10:00:00.000Z");
    expect(wb.sections.assumptions.cells[ESG_SUBMITTED_AT_CELL]).toBeDefined();
  });
});

describe("reopen clears the lock and leaves a trail", () => {
  it("unlocks a submitted workbook and records who and when", () => {
    const wb = workbook();
    applyEsgWorkbookSubmit(wb, "2026-08-03T10:00:00.000Z");

    const previous = applyEsgWorkbookReopen(wb, "admin@okiru.biz", "2026-08-03T12:00:00.000Z");

    expect(previous).toBe("2026-08-03T10:00:00.000Z");
    expect(wb.submittedAt).toBeNull();
    const cells = wb.sections.assumptions.cells;
    expect(cells[ESG_SUBMITTED_AT_CELL]).toBeUndefined();
    expect(cells[ESG_REOPENED_BY_CELL]).toBe("admin@okiru.biz");
    expect(cells[ESG_REOPENED_AT_CELL]).toBe("2026-08-03T12:00:00.000Z");
    expect(cells[ESG_PREVIOUSLY_SUBMITTED_CELL]).toBe("2026-08-03T10:00:00.000Z");
  });

  it("preserves captured data — only lock metadata changes", () => {
    const wb: LockableWorkbook = {
      sections: {
        assumptions: { cells: { B6: "Strict" } },
        "e-data": { cells: { L19: 1234, s1a_depot_0: "Depot A" } },
      },
      submittedAt: null,
    };
    applyEsgWorkbookSubmit(wb, "2026-08-03T10:00:00.000Z");
    applyEsgWorkbookReopen(wb, "admin@okiru.biz", "2026-08-03T12:00:00.000Z");

    expect(wb.sections["e-data"].cells).toEqual({ L19: 1234, s1a_depot_0: "Depot A" });
    expect(wb.sections.assumptions.cells.B6).toBe("Strict");
  });

  it("is a no-op on a workbook that was never submitted", () => {
    const wb = workbook();
    const previous = applyEsgWorkbookReopen(wb, "admin@okiru.biz", "2026-08-03T12:00:00.000Z");
    expect(previous).toBeNull();
    expect(wb.submittedAt).toBeNull();
    expect(wb.sections.assumptions.cells[ESG_REOPENED_BY_CELL]).toBeUndefined();
  });

  it("supports submit → reopen → submit again", () => {
    const wb = workbook();
    applyEsgWorkbookSubmit(wb, "2026-08-03T10:00:00.000Z");
    applyEsgWorkbookReopen(wb, "admin@okiru.biz", "2026-08-03T12:00:00.000Z");
    applyEsgWorkbookSubmit(wb, "2026-08-04T09:00:00.000Z");

    expect(wb.submittedAt).toBe("2026-08-04T09:00:00.000Z");
    expect(wb.sections.assumptions.cells[ESG_SUBMITTED_AT_CELL]).toBe("2026-08-04T09:00:00.000Z");
    // the earlier reopen stays on record
    expect(wb.sections.assumptions.cells[ESG_REOPENED_BY_CELL]).toBe("admin@okiru.biz");
  });
});
