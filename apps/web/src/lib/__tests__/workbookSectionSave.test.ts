import { describe, expect, it } from "vitest";
import { mergeWorkbookSectionSaveBody } from "../workbookSectionSave";

describe("mergeWorkbookSectionSaveBody", () => {
  const row = { _id: "r1", programName: "IT Learnership" };

  it("preserves rows when a meta-only update is scheduled", () => {
    const merged = mergeWorkbookSectionSaveBody(
      undefined,
      { meta: { eapProvince: "Gauteng" } },
      { rows: [row], meta: { headcount: 50 } },
    );
    expect(merged.rows).toEqual([row]);
    expect(merged.meta).toEqual({ eapProvince: "Gauteng" });
  });

  it("preserves meta when a row-only update is scheduled", () => {
    const merged = mergeWorkbookSectionSaveBody(
      undefined,
      { rows: [row] },
      { rows: [], meta: { eapProvince: "National" } },
    );
    expect(merged.rows).toEqual([row]);
    expect(merged.meta).toEqual({ eapProvince: "National" });
  });

  it("merges debounced pending payloads without wiping the other half", () => {
    const afterRows = mergeWorkbookSectionSaveBody(
      undefined,
      { rows: [row] },
      { rows: [], meta: { headcount: 10 } },
    );
    const afterMeta = mergeWorkbookSectionSaveBody(
      afterRows,
      { meta: { eapYear: 2025 } },
      { rows: [], meta: { headcount: 10 } },
    );
    expect(afterMeta.rows).toEqual([row]);
    expect(afterMeta.meta).toEqual({ eapYear: 2025 });
  });
});
