/**
 * A rule the workbook already meets is met — even when the value came from a
 * document and was never typed (so never "touched"). It used to read
 * "Entity name required · Pending input" beside the very name it asked for.
 */
import { describe, expect, it } from "vitest";
import { evaluateEsgRules } from "../esgValidationRules";
import type { EsgWorkbookData } from "../esgWorkbookStorage";

const workbook = (entity: string): EsgWorkbookData => ({
  companyId: "T-1",
  sections: { "company-reporting-setup": { cells: entity ? { entity } : {} } },
  updatedAt: "2025-10-06T09:00:00.000Z",
});

const entityRule = (wb: EsgWorkbookData) =>
  evaluateEsgRules(wb, {}, "live").find((r) => r.id === "company-reporting-setup.entity-required")!;

describe("a rule nobody has touched yet", () => {
  it("is met, not pending, when the workbook already holds the value", () => {
    const rule = entityRule(workbook("Example Co"));
    expect(rule.pending).toBe(false);
    expect(rule.pass).toBe(true);
  });

  it("still waits for input, rather than failing, while the value is missing", () => {
    const rule = entityRule(workbook(""));
    expect(rule.pending).toBe(true);
    expect(rule.pass).toBe(true);
  });
});
