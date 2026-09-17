/**
 * What the assistant is allowed to know.
 *
 * The chat is only as honest as its grounding: these tests pin that the
 * document carries the REAL scores, the validation findings with their
 * row-level detail, and the register rows a duplicate question needs — and
 * that it states truncation instead of hiding it. A grounding document that
 * omits the failing rule is how a chat ends up blessing a broken workbook.
 */
import { describe, expect, it } from "vitest";
import { buildEsgAssistantContext } from "../esgAssistantContext";
import type { EsgWorkbookData } from "../esgWorkbookStorage";

const wb = (sections: Record<string, Record<string, unknown>>): EsgWorkbookData =>
  ({
    companyId: "t",
    updatedAt: "",
    sections: Object.fromEntries(
      Object.entries(sections).map(([id, cells]) => [id, { cells }]),
    ),
  }) as unknown as EsgWorkbookData;

describe("buildEsgAssistantContext", () => {
  it("carries the computed scores, not a restatement of raw cells", () => {
    const ctx = buildEsgAssistantContext(
      wb({ "g-data": { B12: "Yes", B13: "Yes" } }),
    );
    expect(ctx).toMatch(/### Scores/);
    expect(ctx).toMatch(/Governance: [1-9]/); // two Yes answers score > 0
  });

  it("includes register rows so duplicate questions are answerable", () => {
    const ctx = buildEsgAssistantContext(
      wb({
        fleet: { _row_count: 2, A4: "JR45DZGP", B4: "CPT", A5: "JR45DZGP", B5: "DBN" },
      }),
    );
    const hits = ctx.match(/JR45DZGP/g) ?? [];
    expect(hits.length).toBe(2);
  });

  it("carries validation findings with their row-level detail", () => {
    // A fleet row missing its Reg — the hygiene rule's detail must survive
    // into the grounding, or the chat cannot explain WHAT is wrong.
    const ctx = buildEsgAssistantContext(wb({ fleet: { B4: "CPT", C4: "HINO" } }));
    expect(ctx).toMatch(/### Validation findings/);
    expect(ctx).toMatch(/Reg missing/);
  });

  it("states register truncation instead of silently sampling", () => {
    const cells: Record<string, unknown> = { _row_count: 40 };
    for (let i = 0; i < 40; i++) {
      cells[`A${4 + i}`] = `REG${i}GP`;
      cells[`B${4 + i}`] = "CPT";
    }
    const ctx = buildEsgAssistantContext(wb({ fleet: cells }));
    expect(ctx).toMatch(/\+10 more rows not shown/);
  });

  it("names the section the user has open", () => {
    const ctx = buildEsgAssistantContext(wb({ "e-data": { s1a_C14: 10 } }), "e-data");
    expect(ctx).toMatch(/Currently open section\nEnvironmental data/);
  });

  it("says the workbook is locked once submitted", () => {
    const locked = wb({ "e-data": { s1a_C14: 10 } });
    (locked as { submittedAt?: string }).submittedAt = "2026-08-01T00:00:00.000Z";
    expect(buildEsgAssistantContext(locked)).toMatch(/inputs are locked/i);
  });

  it("does not dump raw e-data cells — totals only", () => {
    const ctx = buildEsgAssistantContext(
      wb({ "e-data": { s1a_C14: 100, s1a_D14: 50, s2_C14: 700 } }),
    );
    expect(ctx).toMatch(/Fleet diesel YTD: 150 litres/);
    expect(ctx).toMatch(/Electricity YTD: 700 kWh/);
    expect(ctx).not.toMatch(/s1a_C14/);
  });
});
