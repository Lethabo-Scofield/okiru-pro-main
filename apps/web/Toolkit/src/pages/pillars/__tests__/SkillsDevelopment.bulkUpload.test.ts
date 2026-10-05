/**
 * Skills Development spend targets.
 *
 * The bulk-upload parser this file used to cover was removed: it only ever
 * recognised a template nobody could download. Reading a spreadsheet into a
 * pillar is now shared with the workbook import and covered by
 * `apps/web/src/lib/__tests__/readSectionSheet.test.ts` and
 * `Toolkit/src/components/bulk/__tests__/bulkImportSpecs.test.ts`.
 */
import { describe, expect, it } from "vitest";

describe("computeSkillsTargets — % of payroll formula (Task #18 area 6)", () => {
  it("computes targetSpend = leviableAmount * overallTargetPct (default 3.5%)", async () => {
    const { computeSkillsTargets } = await import("../bulkUploadParser");
    const out = computeSkillsTargets({ leviableAmount: 10_000_000 });
    expect(out.overallTargetPct).toBe(0.035);
    expect(out.targetSpend).toBeCloseTo(350_000, 6);
  });

  it("computes bursaryTarget = leviableAmount * bursaryTargetPct (default 2.5%)", async () => {
    const { computeSkillsTargets } = await import("../bulkUploadParser");
    const out = computeSkillsTargets({ leviableAmount: 10_000_000 });
    expect(out.bursaryTargetPct).toBe(0.025);
    expect(out.bursaryTarget).toBeCloseTo(250_000, 6);
  });

  it("honours sector-specific overrides for overallTargetPct / bursaryTargetPct", async () => {
    const { computeSkillsTargets } = await import("../bulkUploadParser");
    const out = computeSkillsTargets({
      leviableAmount: 8_000_000,
      overallTargetPct: 0.06,
      bursaryTargetPct: 0.0035,
    });
    expect(out.targetSpend).toBeCloseTo(480_000, 6);
    expect(out.bursaryTarget).toBeCloseTo(28_000, 6);
  });

  it("normalizes percent-point overrides (3.5 → 0.035) for KPI cards", async () => {
    const { computeSkillsTargets } = await import("../bulkUploadParser");
    const out = computeSkillsTargets({
      leviableAmount: 10_000_000,
      overallTargetPct: 3.5,
      bursaryTargetPct: 2.5,
    });
    expect(out.overallTargetPct).toBeCloseTo(0.035, 6);
    expect(out.bursaryTargetPct).toBeCloseTo(0.025, 6);
    expect(out.targetSpend).toBeCloseTo(350_000, 6);
    expect(out.bursaryTarget).toBeCloseTo(250_000, 6);
  });

  it("clamps negative / NaN leviableAmount to 0", async () => {
    const { computeSkillsTargets } = await import("../bulkUploadParser");
    expect(computeSkillsTargets({ leviableAmount: -100 }).targetSpend).toBe(0);
    expect(computeSkillsTargets({ leviableAmount: NaN }).targetSpend).toBe(0);
  });
});
