/**
 * What the import is about to do — the questions the confirm dialog never asked.
 *
 * The old preview said "N sections, M cells" and offered Confirm. These tests
 * pin the four things that sentence could not tell you: what gets REPLACED,
 * what the file leaves alone, what it repeats, and which rules the workbook
 * passes today and would not afterwards.
 */
import { describe, expect, it } from "vitest";
import { analyseEsgImport, describeEsgImport } from "../esgImportAnalysis";
import type { EsgImportPreview } from "../esgWorkbookImport";

const preview = (sections: Record<string, Record<string, unknown>>): EsgImportPreview => ({
  sections: Object.fromEntries(
    Object.entries(sections).map(([id, cells]) => [id, { cells }]),
  ),
  warnings: [],
  unmatchedSheets: [],
}) as unknown as EsgImportPreview;

const workbook = (sections: Record<string, Record<string, unknown>>) => ({
  sections: Object.fromEntries(
    Object.entries(sections).map(([id, cells]) => [id, { cells }]),
  ),
});

describe("analyseEsgImport", () => {
  it("separates replacing a value from filling an empty one", () => {
    // The consent question. Replacing 1240 with 1310 is a decision the user has
    // to make; filling an empty cell is not.
    const a = analyseEsgImport(
      preview({ fleet: { B4: 1310, B5: "HINO", B6: 99 } }),
      workbook({ fleet: { B4: 1240, B5: "", B6: 99 } }),
    );

    expect(a.overwrites).toEqual([
      { sectionId: "fleet", cell: "B4", before: 1240, after: 1310 },
    ]);
    expect(a.additions).toEqual([
      { sectionId: "fleet", cell: "B5", before: null, after: "HINO" },
    ]);
    expect(a.unchanged).toBe(1);
  });

  it("treats \"1200\" and 1200 as the same value, not an overwrite", () => {
    // Excel round-trips numbers as text constantly. Reporting those as changes
    // would bury the handful of real ones in hundreds of false positives —
    // which is how a review panel becomes something people click past.
    const a = analyseEsgImport(
      preview({ "e-data": { C8: "1200", C9: " ISANDO " } }),
      workbook({ "e-data": { C8: 1200, C9: "ISANDO" } }),
    );
    expect(a.overwrites).toEqual([]);
    expect(a.unchanged).toBe(2);
  });

  it("never reports blanking a cell — an import adds, it does not erase", () => {
    const a = analyseEsgImport(
      preview({ fleet: { B4: "", B5: null } }),
      workbook({ fleet: { B4: 1240, B5: "HINO" } }),
    );
    expect(a.overwrites).toEqual([]);
    expect(a.additions).toEqual([]);
  });

  it("says which sections the upload leaves alone", () => {
    // A partial upload is the normal case — clients send one register at a
    // time — so the panel has to state it rather than imply a whole-workbook
    // replacement.
    const a = analyseEsgImport(preview({ fleet: { B4: 1 } }), null);
    expect(a.isPartial).toBe(true);
    expect(a.sectionsCovered).toEqual(["fleet"]);
    expect(a.sectionsUntouched).not.toContain("fleet");
    expect(a.sectionsUntouched.length).toBeGreaterThan(0);
  });

  it("treats a create-flow import (no workbook yet) as all additions", () => {
    const a = analyseEsgImport(preview({ fleet: { B4: 1310, B5: "HINO" } }), null);
    expect(a.overwrites).toEqual([]);
    expect(a.additions).toHaveLength(2);
  });

  it("flags an identifier repeated inside one section", () => {
    const a = analyseEsgImport(
      preview({ fleet: { B4: "JR45DZGP", B5: "KY75THGP", B6: "JR45DZGP" } }),
      null,
    );
    expect(a.duplicates).toHaveLength(1);
    expect(a.duplicates[0].value).toBe("JR45DZGP");
    expect(a.duplicates[0].cells).toEqual(["B4", "B6"]);
  });

  it("does NOT call a repeated number a duplicate", () => {
    // Three depots can each use 35 kL. Numbers repeat legitimately everywhere;
    // treating that as a duplicate would make the warning meaningless.
    const a = analyseEsgImport(
      preview({ "e-data": { C8: 35, C9: 35, C10: 35, C11: "2026-01-01", C12: "2026-01-01" } }),
      null,
    );
    expect(a.duplicates).toEqual([]);
  });

  it("carries unmatched sheets and warnings through from the parse", () => {
    const p = preview({ fleet: { B4: 1 } });
    (p as unknown as { unmatchedSheets: string[] }).unmatchedSheets = ["Client Sector Data"];
    (p as unknown as { warnings: string[] }).warnings = ["Sheet X had no importable cells"];
    const a = analyseEsgImport(p, null);
    expect(a.unmatchedSheets).toEqual(["Client Sector Data"]);
    expect(a.warnings).toEqual(["Sheet X had no importable cells"]);
  });

  it("reports only rules this import CHANGES, never pre-existing gaps", () => {
    // An empty workbook fails plenty of rules. Blaming the upload for those
    // would drown the ones it actually caused.
    const a = analyseEsgImport(preview({ fleet: { B4: 1 } }), null);
    const ids = new Set(a.newIssues.map((i) => i.id));
    for (const resolved of a.resolvedIssues) expect(ids.has(resolved.id)).toBe(false);
  });
});

describe("describeEsgImport", () => {
  it("states the shape of the change in words", () => {
    const a = analyseEsgImport(
      preview({ fleet: { B4: 1310, B5: "HINO" } }),
      workbook({ fleet: { B4: 1240 } }),
    );
    const line = describeEsgImport(a);
    expect(line).toContain("1 new");
    expect(line).toContain("1 replaced");
    expect(line).toContain("sections");
  });
});
