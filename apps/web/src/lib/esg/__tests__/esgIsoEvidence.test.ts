/**
 * ISO 14001 status and the environmental policy's board approval reach the
 * rows that ask for them. Both were read and reported as having no workbook
 * home, so the tracker never heard of a passed stage 1 audit and the policy
 * row stayed blank. E d26 and d28 stay gated exactly as before.
 * Every value here is invented.
 */
import { describe, expect, it } from "vitest";
import { iso14001TrackerStatus, mapEsgCalculatorToWorkbook, type EsgCalculatorEntryLike } from "../esgParserToWorkbook";
import { readEsgGridRows } from "../esgGridRows";
import { deriveEsgSummaryCells } from "../esgDeriveSummary";
import type { EsgWorkbookData } from "../esgWorkbookStorage";
import { scoreEnvironmental } from "../../../../EsgToolkit/src/lib/calculators/environmental";

const entry = (key: string, value: unknown, sourceField: string, file = "Invented audit.pdf"): EsgCalculatorEntryLike => ({
  key,
  value,
  sourceField,
  sourceFiles: [file],
});

function scored(patches: Record<string, { cells: Record<string, unknown> }>) {
  const workbook = {
    companyId: "iso-test",
    sections: Object.fromEntries(Object.entries(patches).map(([id, s]) => [id, { cells: s.cells }])),
    updatedAt: "",
  } as unknown as EsgWorkbookData;
  return scoreEnvironmental(deriveEsgSummaryCells(workbook));
}

describe("the ISO 14001 status", () => {
  it("reads three states, and never guesses", () => {
    expect(iso14001TrackerStatus("The stage 1 audit was effective; proceed to stage 2.")).toBe("Partially Compliant");
    expect(iso14001TrackerStatus("Recommended for certification")).toBe("Partially Compliant");
    expect(iso14001TrackerStatus("Certified")).toBe("Fully Compliant");
    expect(iso14001TrackerStatus("Certificate suspended")).toBeNull();
    expect(iso14001TrackerStatus("Not certified")).toBeNull();
    expect(iso14001TrackerStatus("See attached")).toBeNull();
  });

  it("an in-progress audit becomes the tracker's certification row, and earns nothing alone", () => {
    const result = mapEsgCalculatorToWorkbook({
      entries: [
        entry("iso.iso14001_status", "Stage 1 found effective, proceed to stage 2.", "iso14001_status"),
        entry("iso.iso14001_scope", "Warehousing at Depot North.", "iso14001_scope_statement"),
      ],
    });
    const rows = readEsgGridRows(result.patches["iso-tracker"]?.cells, "iso-tracker");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ requirement: "ISO 14001 certification", status: "Partially Compliant" });
    expect(String(rows[0].evidence)).toMatch(/proceed to stage 2.*Scope: Warehousing/);
    expect(result.outcomes.iso14001_status).toMatchObject({ status: "placed" });
    // Gated as before: no EMS clause besides the claim has been assessed.
    expect(scored(result.patches as never).rows.d26).toBe(0);
  });
});

describe("the environmental policy's board approval", () => {
  it("a board approval date answers the policy row", () => {
    const result = mapEsgCalculatorToWorkbook({
      entries: [entry("iso.environmental_policy_approval_date", "2024-03-15", "board_approval_date", "Invented policy.pdf")],
    });
    expect(result.patches["g-data"]?.cells?.B27).toBe("Yes");
    expect(result.outcomes.board_approval_date?.status).toBe("placed");
  });

  it("Partial where the policy states no net-zero commitment, as the row's guidance says", () => {
    const result = mapEsgCalculatorToWorkbook({
      entries: [
        entry("iso.environmental_policy_approval_date", "2024-03-15", "board_approval_date", "Invented policy.pdf"),
        entry("iso.net_zero_commitment_present", false, "net_zero_commitment_present", "Invented policy.pdf"),
      ],
    });
    expect(result.patches["g-data"]?.cells?.B27).toBe("Partial");
    // d28 takes the stricter of this and ISO clause 5.2, which nobody assessed.
    expect(scored(result.patches as never).rows.d28).toBe(0);
  });
});
