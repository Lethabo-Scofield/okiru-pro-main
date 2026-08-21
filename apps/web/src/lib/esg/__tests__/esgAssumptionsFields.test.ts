import { describe, expect, it } from "vitest";
import { ASSUMPTIONS_FIELDS } from "@/components/esg-workbook/esgSectionConfigs";

describe("ASSUMPTIONS_FIELDS help text", () => {
  it("spells out SBTi and LTIFR on net-zero and health fields", () => {
    const nz = ASSUMPTIONS_FIELDS.find((f) => f.cell === "B107");
    expect(nz?.helpText).toMatch(/Science Based Targets initiative \(SBTi\)/);
    expect(nz?.helpText).toMatch(/CNZS/);

    const ltifr = ASSUMPTIONS_FIELDS.find((f) => f.cell === "B55");
    expect(ltifr?.helpText).toMatch(/Lost Time Injury Frequency Rate \(LTIFR\)/);
  });

  it("spells out NPAT and CSI on socio-economic threshold", () => {
    const csi = ASSUMPTIONS_FIELDS.find((f) => f.cell === "B56");
    expect(csi?.helpText).toMatch(/Net Profit After Tax \(NPAT\)/);
    expect(csi?.helpText).toMatch(/Corporate Social Investment \(CSI\)/);
  });

  it("spells out IFRS and GARP on strategy toggles", () => {
    // Primary reporting standard is Assumptions!B11, not B9 (B9 is the derived
    // banding floor). See ESG_FORMULA_LEDGER Part 3.
    const std = ASSUMPTIONS_FIELDS.find((f) => f.cell === "B11");
    expect(std?.helpText).toMatch(/International Financial Reporting Standards \(IFRS\)/);

    const pi = ASSUMPTIONS_FIELDS.find((f) => f.cell === "B60");
    expect(pi?.helpText).toMatch(/Governance, Accountability, Risk and Performance \(GARP\)/);
  });

  it("never exposes the derived banding floor B9 as an editable field", () => {
    // Assumptions!B9 = =IF(B8="Lean",0.3,IF(B8="Strict",0.7,0.5)) — a NUMBER read by ~20
    // scorecard formulas. A form field here writes a string, readEsgCell coerces it to
    // null, and every calculator silently falls back to 0.5.
    expect(ASSUMPTIONS_FIELDS.find((f) => f.cell === "B9")).toBeUndefined();
    const stance = ASSUMPTIONS_FIELDS.find((f) => f.cell === "B8");
    expect(stance?.label).toBe("Scoring stance");
    expect(stance?.options).toEqual(["Lean", "Standard", "Strict"]);
  });
});
