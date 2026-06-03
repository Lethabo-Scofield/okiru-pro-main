import { readEsgCell, type EsgWorkbookData } from "@/lib/esgWorkbookStorage";
import { minCap, pr, stanceFloor } from "./shared";

export type EnvironmentalScoreResult = {
  score: number;
  max: number;
  rows: Record<string, number>;
};

function num(wb: EsgWorkbookData, ref: string, section = "e-data"): number {
  return readEsgCell(wb, section, ref) ?? 0;
}

function waste(wb: EsgWorkbookData, ref: string): number {
  return readEsgCell(wb, "waste", ref) ?? 0;
}

export function scoreEnvironmental(workbook: EsgWorkbookData): EnvironmentalScoreResult {
  const floor = stanceFloor("standard");
  const thrWaste = readEsgCell(workbook, "assumptions", "B48") ?? 75;
  const thrRenew = readEsgCell(workbook, "assumptions", "B44") ?? 0.2;
  const sbtiYear = readEsgCell(workbook, "assumptions", "B107") ?? 0;

  const l19 = num(workbook, "L19");
  const l46 = num(workbook, "L46");
  const l63 = num(workbook, "L63");
  const b90 = num(workbook, "B90");
  const f90 = num(workbook, "F90");

  const d5 = l19 > 0 ? 5 : 0;
  let d6 = 0;
  if (b90 > 0) {
    const yoy = (b90 - f90) / b90;
    const thr = readEsgCell(workbook, "assumptions", "B43") ?? 0.1;
    d6 = pr(yoy, thr, 10, floor);
  }
  const d7 = 0;
  const d8 = num(workbook, "L63") > 0 ? 5 : 0;
  const d9 =
    sbtiYear >= 2030 && sbtiYear <= 2060 ? 5 : sbtiYear > 0 ? 2.5 : 0;
  const d11 = l46 > 0 ? 5 : 0;
  const d12 = 0;
  const d13 = 0;
  const d15 = 0;
  const d16 = 0;
  const d17 = 0;
  const div = waste(workbook, "B16");
  const d19 = pr(div, thrWaste, 5, floor);
  const d20 = waste(workbook, "B17") > 0 ? 4 : 0;
  const d21 = waste(workbook, "B18") > 0 ? 3 : 0;
  const d23 = l63 > 0 ? 4 : 0;
  const d24 = 0;
  const d26 = 0;
  const d27 = 0;
  const d28 = 0;
  const d29 = 0;

  const rows = { d5, d6, d7, d8, d9, d11, d12, d13, d15, d16, d17, d19, d20, d21, d23, d24, d26, d27, d28, d29 };
  const score = Object.values(rows).reduce((a, b) => a + b, 0);
  return { score: minCap(score, 108), max: 108, rows };
}
