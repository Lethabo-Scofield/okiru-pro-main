/**
 * Every register a client fills in must reach the report.
 *
 * A section-by-section ablation — fill the workbook, remove one section, see
 * what changes — found two that reached nothing at all. `s-data-ofo` (training
 * by OFO occupation code) and `driver-debrief` (per-trip debriefs) were stored
 * faithfully and surfaced in no score and no line of the report. Asking a
 * client for data and then showing it back nowhere is the worst of both: they
 * do the work, and the report is quieter than the evidence behind it.
 *
 * The first test is the general rule, so a register added later cannot quietly
 * repeat this. The rest pin the two that were missing, including the choice to
 * report OFO as LEARNERS rather than as a count of typed rows — GRI 404-1 asks
 * for training by employee category, and a row count answers a different
 * question.
 */
import { describe, expect, it } from "vitest";
import { ESG_GRID_SECTIONS, ESG_GRID_SECTION_IDS } from "@/lib/esg/esgGridSections";
import { writeEsgGridCells } from "@/lib/esg/esgGridRows";
import { buildEsgReportModel } from "../esgReportModel";
import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";

/**
 * Registers are built through `writeEsgGridCells` — the app's OWN write path —
 * not by hand. Hand-built cells skip `syncDerivedFields`, which is how an
 * earlier version of this analysis wrongly concluded that `driver-debrief`
 * reached nothing: its `_active` flag is written there, and without it the
 * register looks inert when it is not.
 */
function registerCells(id: (typeof ESG_GRID_SECTION_IDS)[number]) {
  const def = ESG_GRID_SECTIONS[id];
  const rows = [0, 1].map((i) => {
    const row: Record<string, unknown> = { _id: `r${i}` };
    for (const col of def.columns) {
      if (col.options?.length) row[col.key] = col.options[0];
      else if (col.type === "number") row[col.key] = 10;
      else if (col.type === "date") row[col.key] = "2026-01-05";
      else row[col.key] = `${col.key}${i}`;
    }
    return row;
  });
  return writeEsgGridCells(id, rows);
}

function workbookWith(only: (typeof ESG_GRID_SECTION_IDS)[number]): EsgWorkbookData {
  return {
    companyId: "COVERAGE",
    sections: {
      assumptions: { cells: { B8: "Standard", B9: 0.5 } },
      [only]: { cells: registerCells(only) },
    },
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

const model = (wb: EsgWorkbookData) =>
  buildEsgReportModel({
    workbook: wb,
    companyName: "Coverage Co",
    companyId: "COVERAGE",
    now: new Date("2026-01-01T00:00:00.000Z"),
  });

describe("every register reaches the report", () => {
  it.each([...ESG_GRID_SECTION_IDS])("%s produces evidence of its own", (id) => {
    const filled = model(workbookWith(id));
    const other = model(workbookWith(id === "fleet" ? "waste" : "fleet"));
    // Filling ONLY this register must produce evidence that filling a
    // different one does not, so the register is genuinely what is reported.
    expect(filled.evidence.length).toBeGreaterThan(0);
    expect(JSON.stringify(filled.evidence)).not.toBe(JSON.stringify(other.evidence));
  });
});

describe("the two registers that used to reach nothing", () => {
  it("reports OFO training as learners, not as a row count", () => {
    const wb: EsgWorkbookData = {
      companyId: "COVERAGE",
      sections: {
        "s-data-ofo": {
          cells: writeEsgGridCells("s-data-ofo", [
            { _id: "a", ofoCode: "121101", occupation: "Finance Manager", learners: 4 },
            { _id: "b", ofoCode: "833101", occupation: "Heavy Truck Driver", learners: 20 },
          ]),
        },
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const built = model(wb);
    const metric = built.metrics.find((m) => m.metricId.startsWith("S-OFO"));
    expect(metric).toBeDefined();
    // 4 + 20 learners — not 2 rows.
    expect(metric!.value).toBe(24);
    expect(metric!.unit).toBe("learners");
    expect(built.evidence.some((e) => e.sheet === "S_Data" && /OFO/i.test(e.description))).toBe(true);
  });

  it("reports the driver debrief register as trips assessed", () => {
    const wb: EsgWorkbookData = {
      companyId: "COVERAGE",
      sections: {
        "driver-debrief": {
          cells: writeEsgGridCells("driver-debrief", [
            { _id: "a", date: "2026-01-05", driver: "A. Driver", depot: "CPT" },
            { _id: "b", date: "2026-01-06", driver: "B. Driver", depot: "DBN" },
            { _id: "c", date: "2026-01-07", driver: "C. Driver", depot: "JHB" },
          ]),
        },
      },
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    const built = model(wb);
    const metric = built.metrics.find((m) => m.metricId.startsWith("S-DRV"));
    expect(metric).toBeDefined();
    expect(metric!.value).toBe(3);
    expect(built.evidence.some((e) => e.sheet === "Driver_Debrief")).toBe(true);
  });

  it("says nothing about a register the client left empty", () => {
    // Evidence is recorded only for sections holding data — an empty register
    // must never appear as a populated one.
    const built = model({
      companyId: "COVERAGE",
      sections: { assumptions: { cells: { B8: "Standard" } } },
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(built.evidence.some((e) => e.sheet === "Driver_Debrief")).toBe(false);
    expect(built.metrics.find((m) => m.metricId.startsWith("S-DRV"))?.value ?? null).toBeNull();
  });
});
