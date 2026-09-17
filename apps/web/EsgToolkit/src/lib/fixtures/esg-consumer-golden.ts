import type { EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import generated from "./esg-consumer-golden.generated.json";

/** SG Consumer v1.7 live workbook cells — from docs/esg/extracted (see build-esg-golden-fixture.mjs). */
export const SG_CONSUMER_GOLDEN_CELLS: Record<string, Record<string, string | number>> =
  generated as Record<string, Record<string, string | number>>;

export function buildSgConsumerGoldenWorkbook(): EsgWorkbookData {
  const sections: EsgWorkbookData["sections"] = {};
  for (const [id, cells] of Object.entries(SG_CONSUMER_GOLDEN_CELLS)) {
    if (id === "cover") continue;
    sections[id] = { cells };
  }
  /*
   * The workbook's `Assumptions!B50:B57` ARE the B-BBEE / Employment Equity
   * targets, so the fixture declares that basis explicitly. Targets are no
   * longer assumed: without a declared basis an indicator has nothing to be
   * scored against and leaves the total. Saying so here keeps this fixture
   * doing what it exists to do — reproduce the documented figures — instead of
   * silently reproducing the old assume-a-target behaviour.
   */
  sections.assumptions = {
    cells: {
      ...(sections.assumptions?.cells ?? {}),
      _targetBasis: "B-BBEE / Employment Equity targets",
    },
  };
  return {
    companyId: "golden-sg-consumer",
    sections,
    updatedAt: new Date().toISOString(),
  };
}

/** Total seeded scalar/grid cells (excludes legacy cover alias). */
export function countGoldenCells(): number {
  return Object.entries(SG_CONSUMER_GOLDEN_CELLS)
    .filter(([id]) => id !== "cover")
    .reduce((n, [, cells]) => n + Object.keys(cells).length, 0);
}
