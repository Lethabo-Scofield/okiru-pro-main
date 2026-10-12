/**
 * The ESG AI review's rules, apply and undo. Every figure, site and file name
 * here is invented.
 */
import { describe, expect, it } from "vitest";
import {
  ESG_AI_DECLINED_SECTION,
  ESG_AI_FILLS_SECTION,
  ESG_DISPUTES_SECTION,
  ESG_UNITS,
  activeEsgFillMark,
  activeEsgFills,
  applyEsgFillProposals,
  buildEsgCellMarkIndex,
  buildEsgRuleFills,
  canFillEsgCell,
  esgCellInfo,
  esgCellMarkState,
  esgConvert,
  esgDisplayValue,
  esgDisputeCells,
  esgUnitFromName,
  esgUnitTokensIn,
  parseEsgFillMark,
  serializeEsgFillMark,
  undoAllEsgFills,
  undoEsgFill,
  type EsgAiFillMark,
  type EsgSectionPatches,
  type EsgWorkbookLike,
} from "../esgAiReviewFill";
import { writeEsgGridCells, type EsgGridRow } from "../esgGridRows";
import { ESG_PROVENANCE_SECTION, provenanceCells } from "../esgProvenance";

type Cells = Record<string, unknown>;

function workbook(sections: Record<string, Cells>): EsgWorkbookLike {
  return { sections: Object.fromEntries(Object.entries(sections).map(([id, cells]) => [id, { cells }])) };
}

/** Two sites and three months: Jan-25 … Mar-25. */
const AXES = { eSites: "North\nSouth", eFirstMonth: "Jan-25", eMonthCount: 3 };

const rows = (section: Parameters<typeof writeEsgGridCells>[0], list: Array<Record<string, unknown>>) =>
  writeEsgGridCells(section, list.map((r, i) => ({ _id: `r${i}`, ...r }) as EsgGridRow));

/** Lay patches over a workbook, as the section save would. */
function save(wb: EsgWorkbookLike, patches: EsgSectionPatches): EsgWorkbookLike {
  const sections = { ...(wb.sections ?? {}) };
  for (const [id, cells] of Object.entries(patches)) sections[id] = { cells };
  return { sections };
}

const WASTE_ROWS = [
  { month: "Jan-25", depot: "North", wasteType: "Cardboard", totalKg: 1200 },
  { month: "Feb-25", depot: "North", wasteType: "Cardboard", totalKg: 800 },
  { month: "Mar-25", depot: "South", wasteType: "Plastic", totalKg: 450.5 },
];

describe("units", () => {
  it("converts within a family only, and says how", () => {
    expect(esgConvert(2.5, ESG_UNITS.MWh, ESG_UNITS.kWh)).toEqual({ value: 2500, conversion: "2.5 MWh = 2 500 kWh (×1000)" });
    expect(esgConvert(790, ESG_UNITS.L, ESG_UNITS.kL)?.value).toBeCloseTo(0.79);
    expect(esgConvert(45, ESG_UNITS.percent, ESG_UNITS.fraction)?.value).toBeCloseTo(0.45);
    // Litres are never kWh and never tonnes of CO₂e.
    expect(esgConvert(100, ESG_UNITS.L, ESG_UNITS.kWh)).toBeNull();
    expect(esgConvert(100, ESG_UNITS.L, ESG_UNITS.tCO2e)).toBeNull();
    expect(esgConvert(100, ESG_UNITS.kWh, ESG_UNITS.tCO2e)).toBeNull();
    // Rand never scales.
    expect(esgConvert(1, ESG_UNITS.R, ESG_UNITS.count)).toBeNull();
  });

  it("reads unit words in text, tCO₂e before tonnes and kilolitres before litres", () => {
    expect(esgUnitTokensIn("Total 12.4 tCO2e")).toEqual([ESG_UNITS.tCO2e]);
    expect(esgUnitTokensIn("3 kilolitres")).toEqual([ESG_UNITS.kL]);
    expect(esgUnitTokensIn("Consumption 1 234 kWh")).toEqual([ESG_UNITS.kWh]);
    expect(esgUnitTokensIn("790 litres")).toEqual([ESG_UNITS.L]);
    expect(esgUnitTokensIn("4 tonnes")).toEqual([ESG_UNITS.t]);
    // A bare unit name, as a dispute records it.
    expect(esgUnitFromName("L")).toBe(ESG_UNITS.L);
    expect(esgUnitFromName("kL")).toBe(ESG_UNITS.kL);
    expect(esgUnitFromName("MWh")).toBe(ESG_UNITS.MWh);
    expect(esgUnitFromName("tCO2e")).toBe(ESG_UNITS.tCO2e);
    expect(esgUnitFromName("bags")).toBeNull();
  });

  it("shows a value with its unit and thousands spaced, never a locale's decimal comma", () => {
    expect(esgDisplayValue("4820000", "R")).toBe("R 4 820 000");
    expect(esgDisplayValue("6150", "kWh")).toBe("6 150 kWh");
    expect(esgDisplayValue("0.79", "kL")).toBe("0.79 kL");
    expect(esgDisplayValue("45", "%")).toBe("45%");
    expect(esgDisplayValue("0.4", "fraction")).toBe("0.4");
    expect(esgDisplayValue("North, South", "kWh")).toBe("North, South");
  });

  it("knows the stored scale of the cells whose label misleads", () => {
    const wb = workbook({ "g-data": {}, "s-data": {} });
    expect(esgCellInfo(wb, "g-data", "B8")?.unit).toBe(ESG_UNITS.fraction);
    expect(esgCellInfo(wb, "s-data", "B52")?.unit).toBe(ESG_UNITS.percent);
    expect(esgCellInfo(wb, "e-data", "L68")?.unit).toBe(ESG_UNITS.kg);
  });
});

describe("cells the review never writes", () => {
  const wb = workbook({
    "e-data": { ...AXES, s1a_C14: 500 },
    "s-data": { hc_0_0: 4, B43: 1_000_000 },
    fleet: rows("fleet", [{ reg: "AB 12 CD", monthlyLitres: 300, monthlyKm: 1500 }]),
    assumptions: {},
    "company-reporting-setup": {},
  });

  it("refuses every cell the formula layer computes", () => {
    for (const [section, cell] of [
      ["fleet", "B28"],
      ["fleet", "H28"],
      ["s-data", "L12"],
      ["s-data", "B44"],
      ["s-data", "G35"],
      ["e-data", "L75"],
      ["e-data", "L19"],
      // Per-vehicle L/100km and tCO₂e are worked out from litres and km.
      ["fleet", "K4"],
      ["fleet", "M4"],
    ] as const) {
      expect(canFillEsgCell(wb, section, cell).ok, `${section}!${cell}`).toBe(false);
    }
  });

  it("refuses the client's decisions: axes, sector, boundary, settings and factors", () => {
    for (const [section, cell] of [
      ["e-data", "eSites"],
      ["e-data", "eFirstMonth"],
      ["e-data", "B7"],
      ["company-reporting-setup", "sector"],
      ["company-reporting-setup", "boundary"],
      ["assumptions", "B8"],
      ["s-data", "_hsTracking"],
    ] as const) {
      const check = canFillEsgCell(wb, section, cell);
      expect(check.ok, `${section}!${cell}`).toBe(false);
    }
  });

  it("refuses a cell that holds a value, and a cell the workbook has no place for", () => {
    expect(canFillEsgCell(wb, "e-data", "s1a_C14").ok).toBe(false);
    expect(canFillEsgCell(wb, "s-data", "B43").ok).toBe(false);
    // Row 3 of a two-site grid, and a fourth month of a three-month year.
    expect(canFillEsgCell(wb, "e-data", "s2_C16").ok).toBe(false);
    expect(canFillEsgCell(wb, "e-data", "s2_F14").ok).toBe(false);
    expect(canFillEsgCell(wb, "e-data", "s2_E15").ok).toBe(true);
  });
});

describe("rule 1: totals of a monthly series", () => {
  it("fills the waste total as the register's sum, labelled derived, with every row as evidence", () => {
    const wb = workbook({ "e-data": { ...AXES }, waste: rows("waste", WASTE_ROWS) });
    const { proposals, questions } = buildEsgRuleFills(wb);
    const total = proposals.find((p) => p.key === "e-data!L68");
    expect(total).toMatchObject({ value: "2450.5", kind: "derived", rule: "sum", origin: "rules", unit: "kg" });
    expect(total!.evidence).toHaveLength(3);
    expect(total!.evidence.every((e) => e.type === "cell" && e.section === "waste")).toBe(true);
    expect(total!.cellLabel).not.toMatch(/L68/);
    expect(questions.filter((q) => q.key === "e-data!L68")).toEqual([]);
  });

  it("asks instead of summing when a month is missing", () => {
    const wb = workbook({ "e-data": { ...AXES }, waste: rows("waste", WASTE_ROWS.slice(0, 2)) });
    const { proposals, questions } = buildEsgRuleFills(wb);
    expect(proposals.some((p) => p.key === "e-data!L68")).toBe(false);
    expect(questions.find((q) => q.key === "e-data!L68")?.question).toMatch(/no rows for Mar-25/);
  });

  it("asks when rows for ALL sites sit beside rows for one site", () => {
    const mixed = [...WASTE_ROWS, { month: "Jan-25", depot: "ALL", wasteType: "General", totalKg: 90 }];
    const { proposals, questions } = buildEsgRuleFills(workbook({ "e-data": { ...AXES }, waste: rows("waste", mixed) }));
    expect(proposals.some((p) => p.key === "e-data!L68")).toBe(false);
    expect(questions.find((q) => q.key === "e-data!L68")?.question).toMatch(/count waste twice/);
  });

  it("leaves a stated total alone", () => {
    const wb = workbook({ "e-data": { ...AXES, L68: 3000 }, waste: rows("waste", WASTE_ROWS) });
    expect(buildEsgRuleFills(wb).proposals.some((p) => p.key === "e-data!L68")).toBe(false);
  });
});

describe("rule 5: identity copies", () => {
  it("names a row's source documents from provenance, leaving out figures edited since", () => {
    const placed = [
      { sectionId: "e-data", cellRef: "s2_C14", value: 1000, sourceFile: "north-jan.pdf", documentId: "d1" },
      { sectionId: "e-data", cellRef: "s2_D14", value: 1100, sourceFile: "north-feb.pdf", documentId: "d2" },
      { sectionId: "e-data", cellRef: "s2_E14", value: 1200, sourceFile: "north-mar.pdf", documentId: "d3" },
    ];
    const wb = workbook({
      "e-data": { ...AXES, s2_C14: 1000, s2_D14: 1100, s2_E14: 999 },
      [ESG_PROVENANCE_SECTION]: provenanceCells(placed, new Date("2025-04-02T00:00:00Z")),
    });
    const src = buildEsgRuleFills(wb).proposals.find((p) => p.key === "e-data!s2_src_0");
    expect(src).toMatchObject({ value: "north-feb.pdf, north-jan.pdf", kind: "read", rule: "source" });
    expect(src!.cellLabel).toBe("Environmental data · Electricity · North · Source");
  });

  it("copies the entity name from the company record", () => {
    const p = buildEsgRuleFills(workbook({ "company-reporting-setup": {} }), { companyName: "Kestrel Freight" }).proposals;
    expect(p.find((x) => x.key === "company-reporting-setup!entity")).toMatchObject({ value: "Kestrel Freight", kind: "read" });
  });

  it("copies a vehicle's depot between registers by exact registration, and asks when they differ", () => {
    const wb = workbook({
      "e-data": { ...AXES },
      fleet: rows("fleet", [{ reg: "AB 12 CD" }, { reg: "XY 99 ZZ" }, { reg: "QQ 11 RR", depot: "South" }]),
      "driver-debrief": rows("driver-debrief", [
        { date: "2025-01-03", vehicleReg: "ab 12 cd", depot: "North" },
        { date: "2025-01-04", vehicleReg: "XY 99 ZZ", depot: "North" },
        { date: "2025-01-05", vehicleReg: "XY 99 ZZ", depot: "South" },
        // A near-match is not the same vehicle.
        { date: "2025-01-06", vehicleReg: "QQ 11 R", depot: "" },
        { date: "2025-01-07", vehicleReg: "QQ 11 RR" },
      ]),
    });
    const { proposals, questions } = buildEsgRuleFills(wb);
    expect(proposals.find((p) => p.key === "fleet!B4")).toMatchObject({ value: "North", kind: "read", rule: "copy" });
    expect(proposals.some((p) => p.key === "fleet!B5")).toBe(false);
    expect(questions.find((q) => q.key === "fleet!B5")?.question).toMatch(/NORTH and SOUTH/);
    // The debrief row for QQ 11 RR takes the fleet register's depot; QQ 11 R does not.
    expect(proposals.find((p) => p.key === "driver-debrief!B8")).toMatchObject({ value: "South" });
    expect(proposals.some((p) => p.key === "driver-debrief!B7")).toBe(false);
  });
});

describe("rule 6: documents that disagree", () => {
  it("resolves the same quantity in two units as one value, with the conversion stated", () => {
    const wb = workbook({
      "e-data": { ...AXES },
      [ESG_DISPUTES_SECTION]: esgDisputeCells([
        {
          sectionId: "e-data",
          cellRef: "water_C14",
          candidates: [
            { value: 0.79, sources: ["water-statement.pdf"], unit: "kL" },
            { value: 790, sources: ["meter-log.xlsx"], unit: "litres" },
          ],
        },
      ]),
    });
    const fill = buildEsgRuleFills(wb).proposals.find((p) => p.key === "e-data!water_C14");
    expect(fill).toMatchObject({ value: "0.79", kind: "read", rule: "units" });
    expect(fill!.conversion).toMatch(/790 L = 0.79 kL \(÷1000\)/);
    expect(fill!.evidence).toHaveLength(2);
  });

  it("asks, naming each value and its documents, when they really differ", () => {
    const wb = workbook({
      "e-data": { ...AXES },
      [ESG_DISPUTES_SECTION]: esgDisputeCells([
        { sectionId: "e-data", cellRef: "s2_C15", candidates: [{ value: 4100, sources: ["a.pdf"] }, { value: 4400, sources: ["b.pdf"] }] },
      ]),
    });
    const { proposals, questions } = buildEsgRuleFills(wb);
    expect(proposals).toEqual([]);
    expect(questions[0]).toMatchObject({ key: "e-data!s2_C15" });
    expect(questions[0].question).toBe("Your documents disagree: 4100 (a.pdf) or 4400 (b.pdf). Which is right?");
  });
});

describe("apply and undo", () => {
  const base = () => workbook({ "e-data": { ...AXES }, waste: rows("waste", WASTE_ROWS) });

  it("writes the value and a mark, through whole-section patches", () => {
    const wb = base();
    const proposals = buildEsgRuleFills(wb).proposals;
    const { patches, applied, skipped } = applyEsgFillProposals(wb, proposals, "2025-04-03T10:00:00.000Z");
    expect(applied).toHaveLength(1);
    expect(skipped).toEqual([]);
    // The whole e-data section goes back: the axes ride along untouched.
    expect(patches["e-data"]).toMatchObject({ ...AXES, L68: 2450.5 });
    const mark = parseEsgFillMark(patches[ESG_AI_FILLS_SECTION]["e-data!L68"]);
    expect(mark).toMatchObject({ v: "2450.5", kind: "derived", rule: "sum", replaced: null, origin: "rules", at: "2025-04-03T10:00:00.000Z" });
    const after = save(wb, patches);
    expect(activeEsgFillMark(after, "e-data", "L68")?.v).toBe("2450.5");
    expect(activeEsgFills(after)).toHaveLength(1);
  });

  it("never overwrites a value typed after the proposal was made", () => {
    const wb = base();
    const proposals = buildEsgRuleFills(wb).proposals;
    const typed = save(wb, { "e-data": { ...AXES, L68: 2600 } });
    const { patches, applied, skipped } = applyEsgFillProposals(typed, proposals);
    expect(applied).toEqual([]);
    expect(skipped[0].reason).toBe("The cell holds a value now.");
    expect(patches).toEqual({});
  });

  it("drops the mark once the user edits the cell, and never refills it", () => {
    const wb = base();
    const filled = save(wb, applyEsgFillProposals(wb, buildEsgRuleFills(wb).proposals).patches);
    const edited = save(filled, { "e-data": { ...(filled.sections!["e-data"]!.cells as Cells), L68: 2500 } as never });
    expect(activeEsgFillMark(edited, "e-data", "L68")).toBeNull();
    expect(activeEsgFills(edited)).toEqual([]);
    const cleared = save(filled, { "e-data": { ...AXES } as never });
    expect(canFillEsgCell(cleared, "e-data", "L68")).toEqual({ ok: false, reason: "You cleared an earlier fill here." });
    expect(buildEsgRuleFills(cleared).proposals).toEqual([]);
  });

  it("undoes one fill: the cell goes back to blank and the value is never offered again", () => {
    const wb = base();
    const filled = save(wb, applyEsgFillProposals(wb, buildEsgRuleFills(wb).proposals).patches);
    const undone = save(filled, undoEsgFill(filled, "e-data!L68"));
    expect(undone.sections!["e-data"]!.cells!.L68).toBeUndefined();
    expect(undone.sections![ESG_AI_FILLS_SECTION]!.cells!["e-data!L68"]).toBeUndefined();
    expect(undone.sections![ESG_AI_DECLINED_SECTION]!.cells!["e-data!L68"]).toBe("2450.5");
    expect(buildEsgRuleFills(undone).proposals.some((p) => p.key === "e-data!L68")).toBe(false);
  });

  it("an undo after the user changed the cell keeps their value and only drops the mark", () => {
    const wb = base();
    const filled = save(wb, applyEsgFillProposals(wb, buildEsgRuleFills(wb).proposals).patches);
    const edited = save(filled, { "e-data": { ...AXES, L68: 2500 } as never });
    const patches = undoEsgFill(edited, "e-data!L68");
    expect(patches["e-data"]).toBeUndefined();
    expect(patches[ESG_AI_FILLS_SECTION]["e-data!L68"]).toBeUndefined();
    expect(patches[ESG_AI_DECLINED_SECTION]).toBeUndefined();
  });

  it("undoes every standing fill at once", () => {
    const wb = workbook({
      "e-data": { ...AXES },
      waste: rows("waste", WASTE_ROWS),
      "company-reporting-setup": {},
    });
    const filled = save(wb, applyEsgFillProposals(wb, buildEsgRuleFills(wb, { companyName: "Heron Logistics" }).proposals).patches);
    expect(activeEsgFills(filled)).toHaveLength(2);
    const undone = save(filled, undoAllEsgFills(filled));
    expect(activeEsgFills(undone)).toEqual([]);
    expect(undone.sections!["company-reporting-setup"]!.cells!.entity).toBeUndefined();
    expect(undone.sections!["e-data"]!.cells!.L68).toBeUndefined();
  });

  it("keeps a mark with a long evidence list inside one cell", () => {
    const mark: EsgAiFillMark = {
      v: "1",
      kind: "derived",
      rule: "sum",
      reason: "r".repeat(1000),
      evidence: Array.from({ length: 200 }, (_, i) => ({ type: "cell" as const, section: "waste", cell: `D${i}`, label: `Waste register · row ${i} · Total kg`, value: String(i) })),
      replaced: null,
      origin: "rules",
      at: "2025-04-03T10:00:00.000Z",
    };
    const stored = serializeEsgFillMark(mark);
    expect(stored.length).toBeLessThanOrEqual(3_900);
    const back = parseEsgFillMark(stored)!;
    expect(back.evidence[back.evidence.length - 1]).toMatchObject({ type: "note" });
    expect(back.reason.length).toBeLessThanOrEqual(400);
  });
});

describe("the cell marker", () => {
  it("shows a fill only while it holds the filled value, then the document, then a disagreement", () => {
    const wb = workbook({
      "e-data": { ...AXES, s2_C14: 1000 },
      [ESG_PROVENANCE_SECTION]: provenanceCells([{ sectionId: "e-data", cellRef: "s2_C14", value: 1000, sourceFile: "north-jan.pdf", documentId: "d1" }]),
      [ESG_DISPUTES_SECTION]: esgDisputeCells([{ sectionId: "e-data", cellRef: "s2_D14", candidates: [{ value: 1, sources: ["a.pdf"] }, { value: 2, sources: ["b.pdf"] }] }]),
      [ESG_AI_FILLS_SECTION]: {
        "e-data!s2_E14": serializeEsgFillMark({ v: "77", kind: "read", rule: "site", reason: "x", evidence: [], replaced: null, origin: "model", at: "t" }),
      },
    });
    const index = buildEsgCellMarkIndex(wb);
    expect(esgCellMarkState(index, "e-data!s2_C14", 1000)).toEqual({ kind: "document", files: ["north-jan.pdf"] });
    expect(esgCellMarkState(index, "e-data!s2_C14", 1001)).toBeNull();
    expect(esgCellMarkState(index, "e-data!s2_D14", "")?.kind).toBe("dispute");
    expect(esgCellMarkState(index, "e-data!s2_D14", 5)).toBeNull();
    expect(esgCellMarkState(index, "e-data!s2_E14", 77)?.kind).toBe("ai");
    expect(esgCellMarkState(index, "e-data!s2_E14", 78)).toBeNull();
  });
});
