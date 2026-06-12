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
