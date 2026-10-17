/**
 * The register's BDG% / BNE% columns reach the client record as the fractions
 * they state (the toolkit scores the share of each holder's stake, not a
 * yes/no), and a blank share value stays blank instead of becoming R1.
 * (Invented holders.)
 */
import { describe, expect, it } from "vitest";
import type { WorkbookData } from "../workbookRoutes";
import { projectWorkbookToClient } from "../workbookRoutes";
import { shareholderToWorkbookRow } from "../workbookEntityCodec";

function project(rows: Array<Record<string, unknown>>) {
  return projectWorkbookToClient({
    companyId: "c1",
    sections: {
      "company-information": { meta: { industrySector: "Generic", scorecardType: "Generic" } },
      ownership: { rows },
    },
  } as unknown as WorkbookData);
}

describe("ownership shares from the register", () => {
  const p = project([
    { shareholderName: "Holder A", race: "African", gender: "Female", blackOwnership: 100, blackWomenOwnership: 50, designatedGroupOwnership: 10, blackNewEntrantOwnership: 25, numberOfShares: 600, shareValue: 6000000 },
    { shareholderName: "Holder B", race: "African", gender: "Male", blackOwnership: 100, numberOfShares: 400 },
  ]);
  const [a, b] = p.shareholders as Array<Record<string, unknown>>;

  it("carries BDG% / BNE% as fractions, keeping the yes/no flags", () => {
    expect(a.designatedGroupOwnership).toBeCloseTo(0.1, 6);
    expect(a.blackNewEntrantOwnership).toBeCloseTo(0.25, 6);
    expect(a.isDesignatedGroup).toBe(true);
    expect(a.blackNewEntrant).toBe(true);
  });

  it("states nothing for a holder whose cells are blank", () => {
    expect("designatedGroupOwnership" in b).toBe(false);
    expect("blackNewEntrantOwnership" in b).toBe(false);
  });

  it("leaves a blank share value at 0, not a placeholder R1", () => {
    expect(a.shareValue).toBe(6000000);
    expect(b.shareValue).toBe(0);
  });

  it("round-trips the stated shares back to the register, falling back to the flags", () => {
    expect(shareholderToWorkbookRow({ name: "A", blackOwnership: 1, designatedGroupOwnership: 0.1, blackNewEntrantOwnership: 0.25, isDesignatedGroup: true, blackNewEntrant: true }))
      .toMatchObject({ designatedGroupOwnership: 10, blackNewEntrantOwnership: 25 });
    expect(shareholderToWorkbookRow({ name: "Old", blackOwnership: 0.6, isDesignatedGroup: true, blackNewEntrant: false }))
      .toMatchObject({ designatedGroupOwnership: 60, blackNewEntrantOwnership: 0 });
  });
});
