/**
 * "Add documents" from inside a section (C1): the read is kept to that
 * section's pillar. These are the terms — what is written, what is held back,
 * and that nothing a document said is lost on the way.
 */
import { describe, expect, it } from "vitest";
import {
  esgFigureCount,
  esgUnplacedKinds,
  restrictEsgInjection,
  type EsgInjectionResult,
} from "../esgParserInjection";
import type { EsgPlacementChoice } from "@/lib/esg/esgParserToWorkbook";

const electricity: EsgPlacementChoice = {
  id: "s2:electricity:city-power-oct.pdf",
  kind: "monthly",
  prefix: "s2",
  measure: "Electricity",
  value: 1200,
  unit: "kWh",
  needs: ["site"],
  month: "C",
};

/** A read that touched three sections: the fleet register, E_Data, and the waste register. */
function read(): EsgInjectionResult {
  return {
    implemented: true,
    patches: {
      fleet: { cells: { A5: "ZZZ10001", B5: "Truck" } },
      "e-data": { cells: { s1a_D15: 222 } },
      waste: { cells: { C7: 3.5 } },
    },
    placed: [
      { sectionId: "fleet", cellRef: "A5", field: "vehicle_registration", value: "ZZZ10001", sourceFile: "fleet.xlsx", documentId: "d1" },
      { sectionId: "e-data", cellRef: "s1a_D15", field: "fleet.diesel_litres", value: 222, sourceFile: "diesel-oct.pdf", documentId: "d2" },
      { sectionId: "waste", cellRef: "C7", field: "waste.general_tonnes", value: 3.5, sourceFile: "manifest.pdf", documentId: "d3" },
    ],
    unplaced: [
      {
        field: "energy.electricity_kwh",
        value: 1200,
        sourceFile: "city-power-oct.pdf",
        documentId: "d4",
        element: "GHG_ENERGY",
        reason: "Which site is this for?",
        rejection: "needs_context",
        choice: electricity,
      },
      {
        field: "monthly.site",
        value: "ALDER",
        sourceFile: "city-power-oct.pdf",
        documentId: "d4",
        element: "GHG_ENERGY",
        reason: "Part of the electricity figure.",
        partOf: electricity.id,
      },
      { field: "policy_title", value: "Ethics policy", sourceFile: "ethics.pdf", documentId: "d5", element: "ETHICS_COMPLIANCE", reason: "Evidence.", rejection: "no_workbook_home" },
    ],
    conflicts: [],
    valuesRead: 6,
    figuresPlaced: 4,
  };
}

const LABELS: Record<string, string> = { fleet: "Fleet register", "e-data": "Environmental data", waste: "Waste register" };
const label = (id: string) => LABELS[id] ?? id;

describe("restrictEsgInjection — documents added from inside a section", () => {
  it("writes only the sections it was added for", () => {
    const kept = restrictEsgInjection(read(), new Set(["waste"]), label);
    expect(Object.keys(kept.patches)).toEqual(["waste"]);
    expect(kept.placed.map((p) => p.sectionId)).toEqual(["waste"]);
    expect(kept.figuresPlaced).toBe(esgFigureCount(kept.patches));
    expect(kept.figuresPlaced).toBe(1);
  });

  it("counts every figure it did not write, by the section it belongs in", () => {
    const kept = restrictEsgInjection(read(), new Set(["waste"]), label);
    expect(kept.outsideFocus).toEqual([
      { sectionId: "fleet", figures: 2 },
      { sectionId: "e-data", figures: 1 },
    ]);
  });

  it("counts a monthly grid's cells even when no single reading stands behind them", () => {
    const grid = read();
    // A dashboard: hundreds of cells from one reading; here two months, no reading each.
    grid.patches["e-data"] = { cells: { s2_C14: 111, s2_D14: 98, eSites: "ALDER", eFirstMonth: "Jul-25" } };
    const kept = restrictEsgInjection(grid, new Set(["waste"]), label);
    // The figures, not the sites and months recorded with them.
    expect(kept.outsideFocus?.find((held) => held.sectionId === "e-data")).toEqual({ sectionId: "e-data", figures: 2 });
  });

  it("keeps what belongs elsewhere with its document, and says where it belongs", () => {
    const kept = restrictEsgInjection(read(), new Set(["waste"]), label);
    const heldBack = kept.unplaced.filter((u) => u.rejection === "outside_focus");
    // The fleet row and the diesel figure that were placed, plus the electricity question.
    expect(heldBack.map((u) => u.field).sort()).toEqual(
      ["energy.electricity_kwh", "fleet.diesel_litres", "monthly.site", "vehicle_registration"].sort(),
    );
    const diesel = heldBack.find((u) => u.field === "fleet.diesel_litres")!;
    expect(diesel.reason).toContain("Environmental data");
    expect(diesel).toMatchObject({ value: 222, sourceFile: "diesel-oct.pdf", documentId: "d2" });
    expect(heldBack.find((u) => u.field === "vehicle_registration")!.reason).toContain("Fleet register");
  });

  it("loses nothing: every reading is still placed, unplaced or contested", () => {
    const before = read();
    const kept = restrictEsgInjection(before, new Set(["waste"]), label);
    expect(kept.placed.length + kept.unplaced.length).toBe(before.placed.length + before.unplaced.length);
    expect(kept.valuesRead).toBe(before.valuesRead);
  });

  it("does not ask where a monthly figure goes when Environmental data is outside the focus", () => {
    const kept = restrictEsgInjection(read(), new Set(["waste"]), label);
    expect(kept.unplaced.some((u) => u.choice || u.partOf)).toBe(false);
  });

  it("still asks when Environmental data is inside the focus — the fleet pillar fills its diesel grid", () => {
    const kept = restrictEsgInjection(read(), new Set(["fleet", "e-data", "driver-debrief"]), label);
    expect(Object.keys(kept.patches).sort()).toEqual(["e-data", "fleet"]);
    const question = kept.unplaced.find((u) => u.field === "energy.electricity_kwh")!;
    expect(question.choice?.id).toBe(electricity.id);
    expect(kept.unplaced.find((u) => u.field === "monthly.site")!.partOf).toBe(electricity.id);
    expect(kept.unplaced.find((u) => u.field === "policy_title")!.rejection).toBe("no_workbook_home");
  });

  it("reads held-back figures as evidence, not as values a person must check", () => {
    const kept = restrictEsgInjection(read(), new Set(["waste"]), label);
    expect(esgUnplacedKinds(kept.unplaced)).toEqual({ toPlace: 0, toCheck: 0, evidence: 5 });
  });

  it("changes nothing when no section was chosen", () => {
    const before = read();
    expect(restrictEsgInjection(before, new Set())).toBe(before);
  });
});
