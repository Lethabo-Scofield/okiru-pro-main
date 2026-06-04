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
    const std = ASSUMPTIONS_FIELDS.find((f) => f.cell === "B9");
    expect(std?.helpText).toMatch(/International Financial Reporting Standards \(IFRS\)/);

    const pi = ASSUMPTIONS_FIELDS.find((f) => f.cell === "B60");
    expect(pi?.helpText).toMatch(/Governance, Accountability, Risk and Performance \(GARP\)/);
  });
});
