/**
 * A document run's record travels with its figures: the file behind EVERY cell
 * it writes (a monthly grid is one reading behind many cells), and every cell
 * two documents disagreed about — so the workbook grid can mark both.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyEsgParserResult, persistEsgSectionPatches, type EsgParserCaseLike } from "../esgParserInjection";
import { ESG_PROVENANCE_SECTION, readConflicts, readProvenance } from "@/lib/esg/esgProvenance";

const FILLS = "Fills.xlsx › Fills";
const CARD = "Fuel card.pdf";

const row = (site: string, end: string, value: number, file: string) => ({
  grid: "esg_monthly_rows",
  cells: { "monthly.measure": "fleet.diesel_litres", "monthly.site": site, "monthly.period_end": end, "monthly.value": value },
  sourceFiles: [file],
});

const AXES = { depots: ["Site A", "Site B"], months: ["Jul-25", "Aug-25", "Sep-25", "Oct-25", "Nov-25", "Dec-25", "Jan-26", "Feb-26", "Mar-26", "Apr-26", "May-26", "Jun-26"] };

const parserCase = {
  documents: [{ file_name: "Fills.xlsx" }, { file_name: CARD }],
  ai_entities: {
    extractions: [
      { documentId: "esg.fuel_fills", sourceFile: FILLS, element: "FLEET", values: [{ field: "diesel_litres", value: 1206 }] },
      { documentId: "esg.fuel_card", sourceFile: CARD, element: "FLEET", values: [{ field: "diesel_litres", value: 790 }] },
    ],
    calculator: {
      rows: [
        row("Site A", "2025-07-31", 800, FILLS),
        row("Site A", "2025-08-31", 425, FILLS),
        row("Site A", "2025-09-30", 405, FILLS),
        row("Site B", "2025-08-31", 773, FILLS),
        row("Site B", "2025-08-31", 790, CARD),
      ],
    },
  },
} as unknown as EsgParserCaseLike;

afterEach(() => vi.unstubAllGlobals());

describe("a document run's record", () => {
  const result = applyEsgParserResult(parserCase, { axes: AXES });

  it("names the files behind every monthly cell, not only a reading's first", () => {
    const written = Object.keys(result.patches["e-data"]?.cells ?? {}).filter((ref) => ref.startsWith("s1a_"));
    expect(written.length).toBeGreaterThanOrEqual(3);
    for (const ref of written) expect(result.cellSources?.[`e-data!${ref}`]).toEqual([FILLS]);
  });

  it("is written beside the figures: a source for each cell, and the disputed cell recorded", async () => {
    // The two documents disagree on Site B's August (773 vs 790): left blank.
    expect(result.conflicts.some((c) => c.sectionId === "e-data")).toBe(true);
    const sent: Array<{ sections: Record<string, { cells: Record<string, unknown> }> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        sent.push(JSON.parse(String(init?.body)));
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
      }) as unknown as typeof fetch,
    );
    await persistEsgSectionPatches("company-1", result.patches, result.placed, result);
    const workbook = { sections: sent[0]!.sections };
    const records = readProvenance(workbook).filter((r) => r.cellRef.startsWith("s1a_"));
    expect(records.length).toBe(Object.keys(result.patches["e-data"]!.cells).filter((ref) => ref.startsWith("s1a_")).length);
    expect(new Set(records.map((r) => r.sourceFile))).toEqual(new Set([FILLS]));
    const disputed = readConflicts(workbook);
    expect(disputed).toHaveLength(1);
    expect(disputed[0]!.candidates.map((c) => c.value).sort()).toEqual([773, 790]);
    expect(workbook.sections[ESG_PROVENANCE_SECTION]).toBeDefined();
    // The disputed cell itself is never written.
    expect(result.patches["e-data"]!.cells[disputed[0]!.cellRef]).toBeUndefined();
  });
});
